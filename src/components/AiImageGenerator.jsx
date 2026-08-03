import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Cpu, Wand2, AlertTriangle, Loader2, Settings2, Download,
  Image as ImageIcon, History, Sparkles, Upload, Trash2,
  Maximize2, Link2, CheckCircle2, X, RefreshCw, Zap, ExternalLink
} from "lucide-react";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_COLAB_URL =
  "https://colab.research.google.com/github/Kaowsar-Azad/Mata-data-generator/blob/main/SDXL_RealESRGAN.ipynb";

const STYLES = [
  { id: "realistic", label: "📸 Realistic / Photography", tag: "RAW photo, photorealistic, ultra realistic, hyperrealistic, DSLR, 50mm lens, natural lighting, skin pores, subsurface scattering, film grain, sharp focus, 8k uhd", neg: "painting, illustration, 3d render, cartoon, anime, drawing, plastic, smooth, artificial, overexposed, blurry, watermark" },
  { id: "3d",        label: "🎮 3D Render / Animation",   tag: "3d render, octane render, unreal engine 5, physically based rendering, volumetric lighting, ray tracing, 4k, detailed textures, subsurface scattering, high poly", neg: "flat, 2d, cartoon, photo, realistic, sketch, watermark, blurry, low poly" },
  { id: "vector",    label: "✏️ Vector Illustration",     tag: "flat vector illustration, clean lines, solid colors, adobe illustrator style, geometric shapes, minimalist, professional graphic design, no gradients", neg: "photo, realistic, 3d, blurry, noisy, painterly, sketch, watermark, gradient" },
  { id: "anime",     label: "🌸 Anime / Manga",           tag: "anime, manga, cel shaded, studio ghibli, clean lines, vibrant colors, anime style illustration, 2d animation, detailed face, expressive eyes", neg: "photo, realistic, 3d render, western cartoon, blurry, low quality, watermark" },
  { id: "none",      label: "⚡ Raw Prompt",              tag: "", neg: "" }
];

const ASPECT_RATIOS = [
  { label: "1:1",  width: 1024, height: 1024 },
  { label: "16:9", width: 1344, height: 768  },
  { label: "9:16", width: 768,  height: 1344 },
  { label: "4:3",  width: 1152, height: 896  }
];

const CF_MODELS = [
  { id: "@cf/black-forest-labs/flux-1-schnell", label: "Flux-1-Schnell (Fast)" },
  { id: "@cf/stabilityai/stable-diffusion-xl-base-1.0", label: "SDXL Base 1.0 (No NSFW Filter)" },
  { id: "@cf/bytedance/sdxl-lightning-4step", label: "SDXL Lightning (Fast)" },
  { id: "@cf/lykon/dreamshaper-8-lcm", label: "Dreamshaper 8 LCM" }
];


const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 200; 

// ─── Helper: data URL → Blob ───────────────────────────────────────────────
function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ─── Helper: Blob → data URL 
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Build ComfyUI SDXL Workflow
function buildSdxlWorkflow({ width, height, prompt, negativePrompt, denoise, mode, uploadedImageName, steps }) {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  // SDXL optimal: CFG 5-7, euler_ancestral + karras gives natural look
  const cfg = 6.5;
  const baseNeg = "(worst quality, low quality:1.4), (plastic skin:1.3), (waxy:1.3), deformed, ugly, blurry, watermark, signature, duplicate, mutated, extra limbs, bad anatomy, disfigured, oversaturated, overexposed";
  const finalNeg = negativePrompt ? `${negativePrompt}, ${baseNeg}` : baseNeg;

  const workflow = {
    "3": { class_type: "KSampler", inputs: { seed, steps, cfg, sampler_name: "euler_ancestral", scheduler: "karras", denoise: mode === "img2img" ? denoise : 1.0, model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: mode === "img2img" ? ["10", 0] : ["5", 0] } },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" } },
    "5": mode === "txt2img" ? { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } } : { class_type: "LoadImage", inputs: { image: uploadedImageName } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: finalNeg, clip: ["4", 1] } },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["11", 0] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "sdxl_out", images: ["8", 0] } },
    "11": { class_type: "VAELoader", inputs: { vae_name: "sdxl_vae.safetensors" } }
  };

  if (mode === "img2img") {
    workflow["5"] = { class_type: "LoadImage", inputs: { image: uploadedImageName } };
    workflow["10"] = { class_type: "VAEEncode", inputs: { pixels: ["5", 0], vae: ["11", 0] } };
  }

  return { prompt: workflow };
}

// ─── Main Component ────────────────────────────────────────────────────────
export function AiImageGenerator({ apiKeys }) {
  const engine = "cloudflare";

  // Generation settings
  const [prompt, setPrompt]               = useState("");
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [aspectRatio, setAspectRatio]     = useState(ASPECT_RATIOS[0]);
  const [batchCount, setBatchCount]       = useState(1);
  const [cfModel, setCfModel]             = useState(CF_MODELS[0]);

  // State
  const [isGenerating, setIsGenerating]   = useState(false);
  const [isEnhancing, setIsEnhancing]     = useState(false);
  const [genStatus, setGenStatus]         = useState(""); 
  const [currentImage, setCurrentImage]   = useState(null);
  const [history, setHistory]             = useState([]);
  const [error, setError]                 = useState(null);
  const [imgLoaded, setImgLoaded]         = useState(true);

  const fileInputRef       = useRef(null);
  const cancelRef          = useRef(false);
  const abortControllerRef = useRef(null);
  const [portalTarget, setPortalTarget] = useState(null);

  useEffect(() => {
    const checkTarget = () => {
      const el = document.getElementById("ai-image-settings-portal");
      if (el && !portalTarget) setPortalTarget(el);
      else if (!el && portalTarget) setPortalTarget(null);
    };
    checkTarget();
    const interval = setInterval(checkTarget, 300);
    return () => clearInterval(interval);
  }, [portalTarget]);

  // ── Load history ────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai_image_history");
      if (saved) setHistory(JSON.parse(saved));
    } catch (err) {}
  }, []);



  // ── History helpers ───────────────────────────────────────────────────
  const addToHistory = useCallback((imageUrl, usedPrompt, settings) => {
    const entry = { id: Date.now(), imageUrl, prompt: usedPrompt, settings, date: new Date().toISOString() };
    setHistory(prev => {
      const next = [entry, ...prev].slice(0, 50);
      localStorage.setItem("ai_image_history", JSON.stringify(next));
      return next;
    });
    setCurrentImage(entry);
  }, []);

  const clearHistory = () => {
    if (!confirm("Are you sure you want to delete all Generation History?")) return;
    setHistory([]);
    setCurrentImage(null);
    localStorage.removeItem("ai_image_history");
  };

  // ── Prompt enhancement ────────────────────────────────────────────────
  const handleEnhancePrompt = async () => {
    if (!prompt.trim()) return;
    const keyInfo = apiKeys?.find(k => k.provider === "google");
    if (!keyInfo?.key) { setError("Please add a Gemini API Key in Settings to use Prompt Enhancement."); return; }
    setIsEnhancing(true);
    setError(null);
    try {
      const genAI  = new GoogleGenerativeAI(keyInfo.key);
      const model  = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent([
        `You are an expert AI image prompt engineer for SDXL. Enhance the user's basic idea into a rich, detailed, vivid prompt. Return ONLY the enhanced prompt with no extra text.`,
        `User idea: ${prompt}`
      ]);
      setPrompt(result.response.text().trim());
    } catch (err) {
      setError("Prompt enhancement failed: " + err.message);
    } finally {
      setIsEnhancing(false);
    }
  };

  // ── Image upload (img2img) ────────────────────────────────────────────
  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setInitImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  // ── Core generation ───────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!prompt.trim()) { setError("Please enter a prompt."); return; }
    
    cancelRef.current = false;
    setIsGenerating(true);
    setError(null);
    
    try {
      const { width, height } = aspectRatio;
      const qualityBoost = "masterpiece, best quality, highly detailed";
      const finalPrompt = selectedStyle.tag
        ? `${prompt.trim()}, ${selectedStyle.tag}, ${qualityBoost}`
        : `${prompt.trim()}, ${qualityBoost}`;
      const negativePrompt = selectedStyle.neg || "";
      
      const keyObj = apiKeys?.find(k => k.provider === "cloudflare");
      if (!keyObj || !keyObj.key || !keyObj.key.includes(":")) {
        setError("To use Cloudflare AI, go to Settings and add your credentials in the ACCOUNT_ID:API_TOKEN format.");
        setIsGenerating(false);
        return;
      }
      const [accountId, apiToken] = keyObj.key.split(":");
      
      setGenStatus("Sending request to Cloudflare Workers...");
      for (let i = 0; i < batchCount; i++) {
        if (cancelRef.current) break;
        const currentImageIndex = i + 1;
        setGenStatus(batchCount > 1 ? `Flux is generating image (${currentImageIndex}/${batchCount})...` : "Flux is generating image...");
        
        // Flux-1-schnell model via Local Proxy
        const proxyUrl = `http://localhost:3002/api/cloudflare-generate`;
        
        try {
          const cfRes = await fetch(proxyUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
              accountId: accountId.trim(),
              apiToken: apiToken.trim(),
              prompt: finalPrompt,
              model: cfModel.id
            })
          });

          if (!cfRes.ok) {
            const errData = await cfRes.json().catch(() => ({ error: cfRes.statusText }));
            throw new Error(errData.error || `Cloudflare Error: ${cfRes.status}`);
          }

          const imgBlob = await cfRes.blob();
          const dataUrl = await blobToDataUrl(imgBlob);
          
          addToHistory(dataUrl, prompt, {
            engine: "Cloudflare Workers", style: selectedStyle.label, ratio: aspectRatio.label,
            quality: "Flux-1-schnell",
            batch: batchCount > 1 ? `${i+1}/${batchCount}` : "1"
          });
        } catch (err) {
          throw new Error("Cloudflare image generation failed: " + err.message);
        }
      }
      if (!cancelRef.current) setGenStatus("✅ Image generation complete!");
      return;
    } catch (err) {
      if (err.name === 'AbortError') {
        setError("Image generation cancelled.");
      } else if (!cancelRef.current || err.message !== "cancelled") {
        console.error("[Generate]", err);
        setError(err.message);
      }
    } finally {
      setIsGenerating(false);
      setTimeout(() => setGenStatus(""), 3000);
    }
  };

  const handleCancel = async () => {
    cancelRef.current = true;
    setIsGenerating(false);
    abortControllerRef.current?.abort();
    
    setGenStatus("Cancelled.");
    setTimeout(() => setGenStatus(""), 2000);
  };

  const handleSave = async (dataUrl) => {
    if (dataUrl.startsWith("http")) {
      window.electronAPI?.openExternal(dataUrl);
      return;
    }
    if (!window.electronAPI?.saveFile || !window.electronAPI?.selectFolder) return;
    const folder = await window.electronAPI.selectFolder();
    if (!folder) return;
    const [, b64] = dataUrl.split(",");
    const binary  = atob(b64);
    const bytes   = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const filePath = `${folder}\\image_${Date.now()}.png`;
    const result   = await window.electronAPI.saveFile(filePath, bytes.buffer);
    alert(result.success ? "✅ Image saved successfully!" : "❌ Save failed: " + result.error);
  };

  const settingsContent = (
    <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem", flex: 1 }}>
      <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Settings2 size={15} color="var(--primary)" /> Settings
      </h3>

      <div>
        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)", marginBottom: "0.5rem" }}>AI Model</label>
        <select 
          value={cfModel.id} 
          onChange={e => setCfModel(CF_MODELS.find(m => m.id === e.target.value) || CF_MODELS[0])}
          style={{ padding: "0.5rem", borderRadius: "0.45rem", border: "1px solid var(--glass-border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: "0.8rem", width: "100%", cursor: "pointer", outline: "none" }}
        >
          {CF_MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)", marginBottom: "0.5rem" }}>Batch Quantity (Images)</label>
            <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: "0.5rem", padding: "0.2rem" }}>
              {[1, 2, 3, 4].map(num => (
                <button key={num} onClick={() => setBatchCount(num)} style={{ flex: 1, padding: "0.45rem", border: "none", background: batchCount === num ? "var(--primary)" : "transparent", color: batchCount === num ? "#fff" : "var(--text-2)", borderRadius: "0.35rem", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer", transition: "all 0.15s" }}>
                  {num}
                </button>
              ))}
            </div>
          </div>

      {/* Common Settings: Style & Ratio */}
      <div>
        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)", marginBottom: "0.5rem" }}>Style</label>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {STYLES.map(s => (
            <button key={s.id} onClick={() => setSelectedStyle(s)} style={{ padding: "0.6rem 0.85rem", background: selectedStyle.id === s.id ? "rgba(37,99,235,0.12)" : "var(--surface-2)", border: `1px solid ${selectedStyle.id === s.id ? "var(--primary)" : "var(--glass-border)"}`, color: selectedStyle.id === s.id ? "var(--text-1)" : "var(--text-2)", borderRadius: "0.45rem", textAlign: "left", fontSize: "0.8rem", fontWeight: selectedStyle.id === s.id ? 700 : 500, cursor: "pointer", transition: "all 0.12s" }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)", marginBottom: "0.5rem" }}>Aspect Ratio</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem" }}>
          {ASPECT_RATIOS.map(r => (
            <button key={r.label} onClick={() => setAspectRatio(r)} style={{ padding: "0.5rem", background: aspectRatio.label === r.label ? "var(--primary)" : "var(--surface-2)", color: aspectRatio.label === r.label ? "#fff" : "var(--text-1)", border: `1px solid ${aspectRatio.label === r.label ? "var(--primary)" : "var(--glass-border)"}`, borderRadius: "0.45rem", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", transition: "all 0.12s" }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg-color)", overflow: "hidden" }}>
      {portalTarget && createPortal(settingsContent, portalTarget)}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>



          {/* ── GENERATION INTERFACE ──────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", flex: 1 }}>
            {/* Image Preview */}
            <div style={{ flex: 1, minHeight: 380, background: "var(--surface-1)", border: "1px solid var(--glass-border)", borderRadius: "1rem", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
              {isGenerating ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.2rem", color: "var(--primary)", padding: "2rem" }}>
                  <div style={{ position: "relative" }}>
                    <Loader2 size={48} className="spin" />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "0.4rem" }}>
                      {engine === "cloudflare" ? "Flux is generating..." : "SDXL 1.0 is generating..."}
                    </div>
                    <div style={{ color: "var(--text-2)", fontSize: "0.82rem" }}>{genStatus}</div>
                  </div>
                  <button onClick={handleCancel} style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", padding: "0.4rem 1rem", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <X size={12} /> Cancel
                  </button>
                </div>
              ) : currentImage ? (
                <>
                  {!imgLoaded && currentImage.imageUrl.startsWith("http") && (
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(5px)", zIndex: 10 }}>
                      <Loader2 size={40} className="spin" color="var(--primary)" />
                      <div style={{ marginTop: "1rem", fontWeight: 700, color: "var(--primary)", fontSize: "0.85rem" }}>Downloading image...</div>
                    </div>
                  )}
                  <img src={currentImage.imageUrl} alt="Generated" onLoad={() => setImgLoaded(true)} style={{ width: "100%", height: "100%", objectFit: "contain", opacity: imgLoaded ? 1 : 0, transition: "opacity 0.3s" }} />
                  <div style={{ position: "absolute", top: "0.75rem", right: "0.75rem", display: "flex", gap: "0.4rem", zIndex: 20 }}>
                    <button onClick={() => handleSave(currentImage.imageUrl)} title="Save Image" style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", padding: "0.45rem", borderRadius: "0.45rem", cursor: "pointer", backdropFilter: "blur(4px)" }}><Download size={15} /></button>
                    <button onClick={() => window.electronAPI?.openExternal(currentImage.imageUrl)} title="View Fullscreen" style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", padding: "0.45rem", borderRadius: "0.45rem", cursor: "pointer", backdropFilter: "blur(4px)" }}><Maximize2 size={15} /></button>
                  </div>
                </>
              ) : (
                <div style={{ color: "var(--text-3)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                  <ImageIcon size={52} style={{ opacity: 0.3 }} />
                  <span style={{ fontSize: "0.9rem" }}>Generated images will be displayed here</span>
                </div>
              )}
            </div>

            {/* Prompt Box */}
            <div style={{ flexShrink: 0, background: "var(--surface-1)", border: "1px solid var(--glass-border)", borderRadius: "1rem", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-2)" }}>Image Description (Prompt)</label>
                <button onClick={handleEnhancePrompt} disabled={isEnhancing || !prompt.trim()} title="Improve prompt with Gemini AI" style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.35)", color: "#a855f7", padding: "0.35rem 0.7rem", borderRadius: "0.5rem", fontSize: "0.75rem", fontWeight: 700, cursor: isEnhancing || !prompt.trim() ? "not-allowed" : "pointer", opacity: !prompt.trim() ? 0.5 : 1, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  {isEnhancing ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
                  Improve with AI
                </button>
              </div>

              <textarea
                value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder="Describe the image you want to generate... e.g., a cat sitting on a wooden table in golden sunlight"
                rows={4}
                style={{ width: "100%", padding: "0.85rem", background: "var(--surface-2)", border: "1px solid var(--glass-border)", borderRadius: "0.6rem", color: "var(--text-1)", fontSize: "0.9rem", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.6 }}
              />

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim() || (engine === "cloud_gpu" && status !== "connected")}
                style={{
                  background: (engine === "cloud_gpu" && status !== "connected") ? "var(--surface-2)" : "linear-gradient(135deg, #2563eb, #7c3aed)",
                  color: (engine === "cloud_gpu" && status !== "connected") ? "var(--text-3)" : "#fff",
                  border: "none", padding: "0.9rem", borderRadius: "0.75rem", fontWeight: 800, fontSize: "1rem", cursor: (isGenerating || !prompt.trim() || (engine === "cloud_gpu" && status !== "connected")) ? "not-allowed" : "pointer",
                  opacity: (isGenerating || !prompt.trim()) ? 0.7 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                  boxShadow: (engine === "cloud_gpu" && status !== "connected") ? "none" : "0 4px 18px rgba(0,0,0,0.15)",
                  transition: "all 0.2s"
                }}
              >
                {isGenerating
                  ? <><Loader2 size={18} className="spin" /> Generating...</>
                  : <><Wand2 size={18} /> {engine === "pollinations" ? "Generate with Pollinations.ai" : "Generate with SDXL 1.0"}</>
                }
              </button>

              {error && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.6rem", padding: "0.75rem", display: "flex", alignItems: "flex-start", gap: "0.5rem", color: "#ef4444", fontSize: "0.82rem" }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{error}</span>
                  <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#ef4444", cursor: "pointer", flexShrink: 0 }}><X size={14} /></button>
                </div>
              )}

              {genStatus && !error && (
                <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "0.6rem", padding: "0.6rem 0.9rem", color: "var(--primary)", fontSize: "0.82rem", fontWeight: 600 }}>
                  {genStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── RIGHT: History Sidebar ──────────────────────────────────── */}
      <div style={{ width: 260, borderLeft: "1px solid var(--glass-border)", background: "var(--surface-1)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--glass-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <History size={16} color="var(--primary)" /> History
          </span>
          {history.length > 0 && (
            <button onClick={clearHistory} title="Clear History" style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", display: "flex" }}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
          {history.length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: "0.8rem", textAlign: "center", marginTop: "2rem" }}>No history available</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {history.map(item => (
                <div key={item.id} onClick={() => setCurrentImage(item)} style={{ cursor: "pointer", borderRadius: "0.6rem", overflow: "hidden", border: `2px solid ${currentImage?.id === item.id ? "var(--primary)" : "transparent"}`, position: "relative", transition: "all 0.15s" }}>
                  <img src={item.imageUrl} alt={item.prompt} style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.7)", color: "#fff", padding: "0.3rem 0.5rem", fontSize: "0.65rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", backdropFilter: "blur(4px)", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{item.prompt}</span>
                    <span style={{ opacity: 0.6, fontSize: "0.6rem", marginLeft: "0.4rem", flexShrink: 0 }}>{item.settings?.engine === "Public API" ? "⚡ API" : "☁️ GPU"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
