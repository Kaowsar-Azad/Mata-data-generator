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
  { id: "realistic", label: "📸 Realistic / Photography", apiModel: "flux-realism", tag: "realistic photography, highly detailed, 8k resolution, photorealistic, RAW photo, cinematic lighting, sharp focus, professional camera, natural skin texture, intricate details" },
  { id: "3d",        label: "🎮 3D Render / Animation",   apiModel: "flux-3d",      tag: "3d render, octane render, unreal engine 5, masterpiece, Pixar style, ray tracing, 4k, beautiful lighting, high detail" },
  { id: "vector",    label: "✏️ Vector Illustration",     apiModel: "flux",         tag: "vector art, flat illustration, Adobe Illustrator style, clean lines, vibrant colors, minimalist, sharp edges" },
  { id: "anime",     label: "🌸 Anime / Manga",           apiModel: "flux-anime",   tag: "anime style, studio ghibli, highly detailed, beautiful lighting, cel shaded, vibrant colors, manga illustration" },
  { id: "none",      label: "⚡ Raw Prompt",              apiModel: "flux-realism", tag: "" }
];

const ASPECT_RATIOS = [
  { label: "1:1",  width: 1024, height: 1024 },
  { label: "16:9", width: 1344, height: 768  },
  { label: "9:16", width: 768,  height: 1344 },
  { label: "4:3",  width: 1152, height: 896  }
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

// ─── Helper: Blob → data URL ───────────────────────────────────────────────
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Build ComfyUI SDXL Workflow ───────────────────────────────────────────
function buildSdxlWorkflow({ width, height, prompt, denoise, mode, uploadedImageName, steps }) {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const cfg = 7.5;

  const workflow = {
    "3": { class_type: "KSampler", inputs: { seed, steps, cfg, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: mode === "img2img" ? denoise : 1.0, model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: mode === "img2img" ? ["10", 0] : ["5", 0] } },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" } },
    "5": mode === "txt2img" ? { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } } : { class_type: "LoadImage", inputs: { image: uploadedImageName } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: "ugly, blurry, poor quality, watermark, signature", clip: ["4", 1] } },
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
  // Connection
  const [colabUrl]                = useState(DEFAULT_COLAB_URL);
  const [manualUrl, setManualUrl] = useState("");
  const [status, setStatus]       = useState("disconnected");
  const [serverUrl, setServerUrl] = useState("");

  // Generation settings
  const [mode, setMode]                   = useState("txt2img");
  const [initImage, setInitImage]         = useState(null);
  const [denoising, setDenoising]         = useState(0.75);
  const [prompt, setPrompt]               = useState("");
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [aspectRatio, setAspectRatio]     = useState(ASPECT_RATIOS[0]);
  const [steps, setSteps]                 = useState(20);
  const [batchCount, setBatchCount]       = useState(1);

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

  // ── Load history & Auto-connect to backend ────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai_image_history");
      if (saved) setHistory(JSON.parse(saved));
    } catch (err) {}

    // Auto-catch Colab status from Electron
    if (window.electronAPI && window.electronAPI.onColabStatus) {
      const cleanup = window.electronAPI.onColabStatus((data) => {
        if (data.status === 'connected') {
          setStatus('connected');
          setServerUrl(data.url.replace(/\/$/, ""));
          setError(null);
        } else if (data.status === 'disconnected') {
          setStatus('disconnected');
          setServerUrl("");
        }
      });
      return cleanup;
    }

    const fetchServerUrl = async () => {
      setStatus("connecting");
      try {
        const url = "https://raw.githubusercontent.com/Kaowsar-Azad/Mata-data-generator/main/backend_url.json?t=" + Date.now();
        const res = await fetch(url);
        if (!res.ok) throw new Error("Central database not accessible");
        const data = await res.json();
        
        if (data.serverUrl) {
          const api = data.serverUrl.replace(/\/$/, "");
          
          // Check if the server is actually alive
          try {
            // ComfyUI usually has an /object_info endpoint we can fetch, or just the root /
            const pingRes = await fetch(`${api}/system_stats`, { headers: { "bypass-tunnel-reminder": "true" } });
            if (!pingRes.ok && pingRes.status !== 404 && pingRes.status !== 403) throw new Error("Server not responding correctly");
            
            setServerUrl(api);
            setStatus("connected");
            setError(null);
          } catch (pingErr) {
            throw new Error(`সার্ভারটি অফলাইন বা কাজ করছে না (${api})`);
          }
        } else {
          throw new Error("Invalid URL in database");
        }
      } catch (err) {
        setStatus("disconnected");
        setError("Cloud GPU সার্ভারের সাথে কানেক্ট করা যায়নি: " + err.message);
      }
    };
    
    fetchServerUrl();
  }, []);

  // ── Connection Handlers ────────────────────────────────────────────────────────────
  const handleStartColab = async () => {
    if (!window.electronAPI) { setError("Electron Desktop App প্রয়োজন।"); return; }
    setStatus("connecting");
    setError(null);
    try { await window.electronAPI.startColab(colabUrl); }
    catch (err) { setStatus("disconnected"); setError(err.message); }
  };

  const handleStopColab = async () => {
    if (window.electronAPI) await window.electronAPI.stopColab();
    setStatus("disconnected");
    setServerUrl("");
  };

  // ── Manual Connect ───────────────────────────────────────────────────
  const handleManualConnect = async () => {
    if (!manualUrl.trim()) return;
    const api = manualUrl.trim().replace(/\/$/, "");
    setStatus("connecting");
    
    try {
      const pingRes = await fetch(`${api}/system_stats`, { headers: { "bypass-tunnel-reminder": "true" } });
      if (!pingRes.ok && pingRes.status !== 404 && pingRes.status !== 403) throw new Error("Server not responding correctly");
      
      setServerUrl(api);
      setStatus("connected");
      setError(null);
    } catch (err) {
      setStatus("disconnected");
      setError("দেওয়া সার্ভার লিঙ্কটিতে কানেক্ট করা যায়নি। নিশ্চিত করুন সার্ভারটি রান করছে।");
    }
  };

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
    if (!confirm("সমস্ত Generation History মুছে ফেলবেন?")) return;
    setHistory([]);
    setCurrentImage(null);
    localStorage.removeItem("ai_image_history");
  };

  // ── Prompt enhancement ────────────────────────────────────────────────
  const handleEnhancePrompt = async () => {
    if (!prompt.trim()) return;
    const keyInfo = apiKeys?.find(k => k.provider === "google");
    if (!keyInfo?.key) { setError("Gemini API Key যোগ করুন Prompt Enhancement ব্যবহার করতে।"); return; }
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
      setError("Prompt enhancement ব্যর্থ: " + err.message);
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
    if (!prompt.trim()) { setError("একটি Prompt লিখুন।"); return; }
    
    if (status !== "connected" || !serverUrl) {
      setError("আগে ComfyUI সার্ভারের সাথে সংযুক্ত হন।");
      return;
    }
    if (mode === "img2img" && !initImage) { setError("Image to Image মোডে একটি Init Image আপলোড করুন।"); return; }

    cancelRef.current = false;
    setIsGenerating(true);
    setError(null);
    
    try {
      const { width, height } = aspectRatio;
      const finalPrompt = selectedStyle.tag
        ? `${prompt.trim()}, ${selectedStyle.tag}`
        : prompt.trim();

      // ─────────────────────────────────────────────────────────────────
      // ENGINE 2: CLOUD GPU (ComfyUI / Colab)
      // ─────────────────────────────────────────────────────────────────
      setGenStatus("প্রস্তুতি নিচ্ছে...");
      let ws = null;
      const api = serverUrl;

      // 1. Upload init image
      let uploadedImageName = "";
      if (mode === "img2img" && initImage) {
        setGenStatus("Init Image আপলোড করছে...");
        const blob = dataUrlToBlob(initImage);
        const form = new FormData();
        form.append("image", blob, "init_img.png");
        const upRes = await fetch(`${api}/upload/image`, {
          method: "POST", headers: { "bypass-tunnel-reminder": "true" }, body: form
        });
        if (!upRes.ok) throw new Error("Init Image আপলোড ব্যর্থ হয়েছে।");
        const upData = await upRes.json();
        uploadedImageName = upData.name;
      }

      if (cancelRef.current) throw new Error("বাতিল করা হয়েছে।");

      // Setup WS
      const clientId = Date.now().toString() + Math.random().toString(36).substring(7);
      const wsUrl = api.replace(/^http/, "ws") + "/ws?clientId=" + clientId;
      ws = new WebSocket(wsUrl);

      let currentProgress = 0;
      let currentImageIndex = 1;
      
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "execution_start") {
            setGenStatus(batchCount > 1 ? `ইমেজ তৈরি শুরু হচ্ছে (${currentImageIndex}/${batchCount})...` : "প্রসেসিং শুরু হয়েছে...");
          } else if (msg.type === "executing") {
            const node = msg.data.node;
            if (node) {
              if (["10", "11", "12"].includes(node)) setGenStatus("মডেল লোড হচ্ছে (এতে কয়েক মিনিট সময় লাগতে পারে)...");
              else if (["3", "4", "13", "22", "30"].includes(node)) { if (currentProgress === 0) setGenStatus("ইমেজ জেনারেট হচ্ছে..."); }
              else if (node === "8") setGenStatus("ইমেজ ডিকোড হচ্ছে...");
              else if (node === "9") setGenStatus("ইমেজ সেভ হচ্ছে...");
            }
          } else if (msg.type === "progress") {
            const { value, max } = msg.data;
            currentProgress = Math.round((value / max) * 100);
            setGenStatus(batchCount > 1 ? `ইমেজ তৈরি করছে (${currentImageIndex}/${batchCount})... ${currentProgress}%` : `SDXL 1.0 ইমেজ তৈরি করছে... ${currentProgress}%`);
          }
        } catch (err) {}
      };

      await new Promise(r => setTimeout(r, 1000));

      for (let i = 0; i < batchCount; i++) {
        if (cancelRef.current) break;
        currentImageIndex = i + 1;
        currentProgress = 0;
        
        setGenStatus(batchCount > 1 ? `ইমেজ তৈরি করছে (${currentImageIndex}/${batchCount})...` : "Workflow সাবমিট করছে...");

        const workflow = buildSdxlWorkflow({
          width, height, prompt: finalPrompt, denoise: mode === "img2img" ? denoising : 1.0, mode, uploadedImageName, steps
        });

        const submitRes = await fetch(`${api}/prompt`, {
          method: "POST", headers: { "Content-Type": "application/json", "bypass-tunnel-reminder": "true" },
          body: JSON.stringify({ prompt: workflow.prompt, client_id: clientId })
        });

        if (!submitRes.ok) {
          if (submitRes.status === 403 || submitRes.status === 404) throw new Error(`Localtunnel সিকিউরিটি লক!`);
          const errBody = await submitRes.text();
          throw new Error(`ComfyUI API ব্যর্থ: ${errBody.slice(0, 100)}`);
        }
        const { prompt_id: promptId } = await submitRes.json();
        if (!promptId) throw new Error("Prompt ID পাওয়া যায়নি।");

        setGenStatus("সার্ভারের জন্য অপেক্ষা করছে...");

        let attempt = 0;
        let imageUrl = null;

        while (attempt < POLL_MAX_ATTEMPTS) {
          if (cancelRef.current) break;
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
          attempt++;

          const histRes = await fetch(`${api}/history/${promptId}`, { headers: { "bypass-tunnel-reminder": "true" } });
          if (!histRes.ok) continue;
          const histData = await histRes.json();
          const job = histData[promptId];
          if (!job) continue;

          if (job.status?.status_str === "error") throw new Error(`ইমেজ তৈরিতে ত্রুটি হয়েছে।`);

          const outputs = job.outputs || {};
          for (const nodeId of Object.keys(outputs)) {
            const imgs = outputs[nodeId]?.images;
            if (imgs?.length > 0) {
              const img = imgs[0];
              imageUrl = `${api}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder ?? "")}&type=${encodeURIComponent(img.type ?? "output")}`;
              break;
            }
          }
          if (imageUrl) break;
        }

        if (cancelRef.current) break;
        if (!imageUrl) throw new Error(`সময়সীমা শেষ।`);

        setGenStatus(`ইমেজ ${i+1} ডাউনলোড করছে...`);
        const imgRes = await fetch(imageUrl, { headers: { "bypass-tunnel-reminder": "true" } });
        if (!imgRes.ok) throw new Error(`ইমেজ ডাউনলোড ব্যর্থ।`);
        const imgBlob = await imgRes.blob();
        const dataUrl = await blobToDataUrl(imgBlob);

        addToHistory(dataUrl, prompt, {
          engine: "Cloud GPU", mode, style: selectedStyle.label, ratio: aspectRatio.label, 
          quality: "SDXL 1.0 Base", denoising: mode === "img2img" ? denoising : null,
          batch: batchCount > 1 ? `${i+1}/${batchCount}` : "1"
        });
      } 

      if (cancelRef.current) throw new Error("বাতিল করা হয়েছে।");
      
      setGenStatus("✅ সব ইমেজ তৈরি সম্পন্ন!");
      if (ws) ws.close();

    } catch (err) {
      if (err.name === 'AbortError') {
        setError("ছবি তৈরি বাতিল করা হয়েছে।");
      } else if (!cancelRef.current || err.message !== "বাতিল করা হয়েছে।") {
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
    
    setGenStatus("বাতিল করা হচ্ছে (Stopping GPU)...");
    try {
      if (serverUrl) {
        const api = serverUrl.replace(/\/$/, "");
        await fetch(`${api}/interrupt`, { method: "POST", headers: { "bypass-tunnel-reminder": "true" } });
        await fetch(`${api}/queue`, { method: "POST", headers: { "bypass-tunnel-reminder": "true" }, body: JSON.stringify({ clear: true }) });
      }
    } catch (err) {}
    
    setGenStatus("বাতিল করা হয়েছে।");
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
    alert(result.success ? "✅ ছবি সংরক্ষিত হয়েছে!" : "❌ সংরক্ষণ ব্যর্থ: " + result.error);
  };

  const statusColor = status === "connected" ? "#22c55e" : status === "connecting" ? "#3b82f6" : "#ef4444";

  const settingsContent = (
    <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem", flex: 1 }}>
      <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Settings2 size={15} color="var(--primary)" /> সেটিংস
      </h3>

      {/* Mode & Img2Img */}
      <div>
        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)", marginBottom: "0.5rem" }}>মোড</label>
        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: "0.5rem", padding: "0.2rem" }}>
          {[{ id: "txt2img", label: "Text → Image" }, { id: "img2img", label: "Image → Image" }].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{ flex: 1, padding: "0.45rem", border: "none", background: mode === m.id ? "var(--primary)" : "transparent", color: mode === m.id ? "#fff" : "var(--text-2)", borderRadius: "0.35rem", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer", transition: "all 0.15s" }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

          {mode === "img2img" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0.85rem", background: "var(--surface-2)", borderRadius: "0.75rem", border: "1px solid var(--glass-border)" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)" }}>Init Image</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ height: 110, border: "2px dashed var(--glass-border)", borderRadius: "0.5rem", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", overflow: "hidden" }}
              >
                {initImage
                  ? <img src={initImage} alt="Init" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", color: "var(--text-3)", gap: "0.4rem" }}>
                      <Upload size={22} />
                      <span style={{ fontSize: "0.75rem" }}>ক্লিক করে ছবি বেছে নিন</span>
                    </div>
                }
              </div>
              {initImage && (
                <button onClick={() => setInitImage(null)} style={{ background: "none", border: "none", color: "var(--danger)", fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <X size={12} /> Init Image সরান
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageFile} style={{ display: "none" }} />
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>Denoising Strength</label>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>{denoising.toFixed(2)}</span>
                </div>
                <input type="range" min="0.1" max="1.0" step="0.05" value={denoising} onChange={e => setDenoising(parseFloat(e.target.value))} style={{ width: "100%" }} />
              </div>
            </div>
          )}

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)" }}>কোয়ালিটি স্টেপস (Steps)</label>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--primary)" }}>{steps}</span>
            </div>
            <input type="range" min="1" max="50" step="1" value={steps} onChange={e => setSteps(parseInt(e.target.value))} style={{ width: "100%", cursor: "pointer", accentColor: "var(--primary)" }} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)", marginBottom: "0.5rem" }}>ছবির পরিমাণ (Batch)</label>
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
        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)", marginBottom: "0.5rem" }}>স্টাইল</label>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {STYLES.map(s => (
            <button key={s.id} onClick={() => setSelectedStyle(s)} style={{ padding: "0.6rem 0.85rem", background: selectedStyle.id === s.id ? "rgba(37,99,235,0.12)" : "var(--surface-2)", border: `1px solid ${selectedStyle.id === s.id ? "var(--primary)" : "var(--glass-border)"}`, color: selectedStyle.id === s.id ? "var(--text-1)" : "var(--text-2)", borderRadius: "0.45rem", textAlign: "left", fontSize: "0.8rem", fontWeight: selectedStyle.id === s.id ? 700 : 500, cursor: "pointer", transition: "all 0.12s" }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)", marginBottom: "0.5rem" }}>অনুপাত (Aspect Ratio)</label>
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

          {/* ── CONNECTION PANEL ──────────────────────────────────── */}
          <div style={{ background: "var(--surface-1)", border: "1px solid var(--glass-border)", borderRadius: "1rem", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Cpu size={22} color="var(--primary)" /> SDXL 1.0 Cloud GPU
                </h2>
                <p style={{ margin: "0.25rem 0 0", color: "var(--text-2)", fontSize: "0.85rem" }}>
                  Google Colab এর মাধ্যমে শক্তিশালী GPU ব্যবহার করুন
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--surface-2)", border: "1px solid var(--glass-border)", borderRadius: "2rem", padding: "0.4rem 0.9rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, display: "inline-block", boxShadow: status === "connected" ? `0 0 0 3px ${statusColor}33` : "none" }} />
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: statusColor }}>
                    {status === "connected" ? "সংযুক্ত ✓" : status === "connecting" ? "সংযুক্ত হচ্ছে..." : "বিচ্ছিন্ন"}
                  </span>
                </div>
                {(status === "connected" || status === "connecting") && (
                  <button onClick={() => window.electronAPI?.showColab()} title="Colab এর পেছনের কাজ দেখতে ক্লিক করুন" style={{ background: "var(--surface-2)", border: "1px solid var(--glass-border)", color: "var(--text-1)", padding: "0.4rem 0.8rem", borderRadius: "0.6rem", fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Maximize2 size={12} /> লগ দেখুন
                  </button>
                )}
                {status === "disconnected" && (
                  <button onClick={() => window.location.reload()} style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", border: "none", padding: "0.5rem 1rem", borderRadius: "0.6rem", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <RefreshCw size={14} /> আবার চেষ্টা করুন
                  </button>
                )}
              </div>
            </div>
            {status === "disconnected" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", background: "rgba(239,68,68,0.06)", border: "1px dashed rgba(239,68,68,0.3)", borderRadius: "0.75rem", padding: "0.9rem 1.1rem", fontSize: "0.82rem", color: "var(--danger)", lineHeight: 1.7 }}>
                <div>
                  <strong style={{ display: "block", marginBottom: "0.4rem", fontWeight: 700 }}>⚠️ সার্ভার অফলাইন!</strong>
                  GitHub থেকে পাওয়া সার্ভার লিঙ্কটি কাজ করছে না অথবা আপডেট করা হয়নি। আপনার Google Colab এর Cloudflare লিঙ্কটি নিচে দিন:
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input 
                    type="text" 
                    placeholder="https://your-url.trycloudflare.com" 
                    value={manualUrl} 
                    onChange={e => setManualUrl(e.target.value)} 
                    style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: "0.4rem", border: "1px solid var(--glass-border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: "0.8rem" }} 
                  />
                  <button onClick={handleManualConnect} style={{ background: "var(--primary)", color: "#fff", border: "none", padding: "0 1rem", borderRadius: "0.4rem", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}>
                    Connect
                  </button>
                </div>
                <div style={{ marginTop: "0.5rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(239,68,68,0.2)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-2)" }}>কোথাও সার্ভার রান করা নেই? নিচের লিংক থেকে রান করুন:</span>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button onClick={handleStartColab} style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", color: "#fff", border: "none", padding: "0.5rem 0.9rem", borderRadius: "0.4rem", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", boxShadow: "0 4px 12px rgba(249,115,22,0.2)" }}>
                      <Cpu size={14} /> এক ক্লিকে সার্ভার চালু করুন (Auto-Hidden)
                    </button>
                    <button onClick={() => window.electronAPI?.openExternal(colabUrl)} style={{ background: "var(--surface-2)", color: "var(--text-1)", border: "1px solid var(--glass-border)", padding: "0.5rem 0.9rem", borderRadius: "0.4rem", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <ExternalLink size={12} /> Open in Browser
                    </button>
                  </div>
                </div>
              </div>
            )}
            {status === "connected" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#22c55e", fontSize: "0.82rem", fontWeight: 600, flexWrap: "wrap" }}>
                <CheckCircle2 size={14} /> সংযুক্ত: <code style={{ color: "var(--text-2)", fontWeight: 400 }}>{serverUrl}</code>
                  <button onClick={handleStopColab} style={{ background: "none", border: "none", color: "var(--danger)", fontSize: "0.75rem", cursor: "pointer", textDecoration: "underline" }}>বিচ্ছিন্ন করুন</button>
              </div>
            )}
          </div>

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
                    <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "0.4rem" }}>SDXL 1.0 কাজ করছে...</div>
                    <div style={{ color: "var(--text-2)", fontSize: "0.82rem" }}>{genStatus}</div>
                  </div>
                  <button onClick={handleCancel} style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", padding: "0.4rem 1rem", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <X size={12} /> বাতিল করুন
                  </button>
                </div>
              ) : currentImage ? (
                <>
                  {!imgLoaded && currentImage.imageUrl.startsWith("http") && (
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(5px)", zIndex: 10 }}>
                      <Loader2 size={40} className="spin" color="var(--primary)" />
                      <div style={{ marginTop: "1rem", fontWeight: 700, color: "var(--primary)", fontSize: "0.85rem" }}>ছবি ডাউনলোড হচ্ছে...</div>
                    </div>
                  )}
                  <img src={currentImage.imageUrl} alt="Generated" onLoad={() => setImgLoaded(true)} style={{ width: "100%", height: "100%", objectFit: "contain", opacity: imgLoaded ? 1 : 0, transition: "opacity 0.3s" }} />
                  <div style={{ position: "absolute", top: "0.75rem", right: "0.75rem", display: "flex", gap: "0.4rem", zIndex: 20 }}>
                    <button onClick={() => handleSave(currentImage.imageUrl)} title="সেভ করুন" style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", padding: "0.45rem", borderRadius: "0.45rem", cursor: "pointer", backdropFilter: "blur(4px)" }}><Download size={15} /></button>
                    <button onClick={() => window.electronAPI?.openExternal(currentImage.imageUrl)} title="বড় করে দেখুন" style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", padding: "0.45rem", borderRadius: "0.45rem", cursor: "pointer", backdropFilter: "blur(4px)" }}><Maximize2 size={15} /></button>
                  </div>
                </>
              ) : (
                <div style={{ color: "var(--text-3)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                  <ImageIcon size={52} style={{ opacity: 0.3 }} />
                  <span style={{ fontSize: "0.9rem" }}>আপনার তৈরি ছবি এখানে দেখাবে</span>
                </div>
              )}
            </div>

            {/* Prompt Box */}
            <div style={{ flexShrink: 0, background: "var(--surface-1)", border: "1px solid var(--glass-border)", borderRadius: "1rem", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-2)" }}>ছবির বিবরণ (Prompt)</label>
                <button onClick={handleEnhancePrompt} disabled={isEnhancing || !prompt.trim()} title="Gemini AI দিয়ে প্রম্পট উন্নত করুন" style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.35)", color: "#a855f7", padding: "0.35rem 0.7rem", borderRadius: "0.5rem", fontSize: "0.75rem", fontWeight: 700, cursor: isEnhancing || !prompt.trim() ? "not-allowed" : "pointer", opacity: !prompt.trim() ? 0.5 : 1, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  {isEnhancing ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
                  AI দিয়ে উন্নত করুন
                </button>
              </div>

              <textarea
                value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder="ছবিটি কেমন হবে তা বাংলা বা English-এ লিখুন... যেমন: a cat sitting on a wooden table in golden sunlight"
                rows={4}
                style={{ width: "100%", padding: "0.85rem", background: "var(--surface-2)", border: "1px solid var(--glass-border)", borderRadius: "0.6rem", color: "var(--text-1)", fontSize: "0.9rem", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.6 }}
              />

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim() || status !== "connected"}
                style={{
                  background: status !== "connected" ? "var(--surface-2)" : "linear-gradient(135deg, #2563eb, #7c3aed)",
                  color: status !== "connected" ? "var(--text-3)" : "#fff",
                  border: "none", padding: "0.9rem", borderRadius: "0.75rem", fontWeight: 800, fontSize: "1rem", cursor: (isGenerating || !prompt.trim() || status !== "connected") ? "not-allowed" : "pointer",
                  opacity: (isGenerating || !prompt.trim()) ? 0.7 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                  boxShadow: status !== "connected" ? "none" : "0 4px 18px rgba(0,0,0,0.15)",
                  transition: "all 0.2s"
                }}
              >
                {isGenerating
                  ? <><Loader2 size={18} className="spin" /> তৈরি হচ্ছে...</>
                  : <><Wand2 size={18} /> Generate with SDXL 1.0</>
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
            <button onClick={clearHistory} title="সব হিস্ট্রি মুছুন" style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", display: "flex" }}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
          {history.length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: "0.8rem", textAlign: "center", marginTop: "2rem" }}>কোনো হিস্ট্রি নেই</div>
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
