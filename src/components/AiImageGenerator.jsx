import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Cpu, Wand2, AlertTriangle, Loader2, Settings2, Download,
  Image as ImageIcon, History, Sparkles, Upload, Trash2,
  Maximize2, Link2, CheckCircle2, X, RefreshCw, Zap
} from "lucide-react";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_COLAB_URL =
  "https://colab.research.google.com/github/sayantan-2/comfyui_colab_Flux/blob/main/comfyui_colab_Flux.ipynb";

const STYLES = [
  { id: "realistic", label: "📸 Realistic / Photography", apiModel: "flux-realism", tag: "realistic photography, highly detailed, 8k resolution, photorealistic, RAW photo, cinematic lighting, sharp focus, professional camera" },
  { id: "3d",        label: "🎮 3D Render / Animation",  apiModel: "flux-3d",      tag: "3d render, octane render, unreal engine 5, masterpiece, Pixar style, ray tracing, 4k, beautiful lighting, high detail" },
  { id: "vector",    label: "✏️ Vector Illustration",     apiModel: "flux",         tag: "vector art, flat illustration, Adobe Illustrator style, clean lines, vibrant colors, minimalist, sharp edges" },
  { id: "anime",     label: "🌸 Anime / Manga",           apiModel: "flux-anime",   tag: "anime style, studio ghibli, highly detailed, beautiful lighting, cel shaded, vibrant colors, manga illustration" },
  { id: "none",      label: "⚡ Raw Prompt",              apiModel: "flux-realism", tag: "" }
];

const ASPECT_RATIOS = [
  { label: "1:1",  width: 1440, height: 1440 },
  { label: "16:9", width: 1536, height: 864  },
  { label: "9:16", width: 864,  height: 1536 },
  { label: "4:3",  width: 1344, height: 1008 }
];

// Models and Quality section removed - using manual steps instead.

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 200; // ~10 min max (large Q8 models can take longer)

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

// ─── Build ComfyUI GGUF Workflow ───────────────────────────────────────────
function buildFluxWorkflow({ width, height, prompt, denoise, mode, uploadedImageName, steps }) {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const useGuidance = steps > 10; // Dev models require guidance, Schnell skips it
  const guidance = useGuidance ? 3.5 : null;
  const unet_name = steps <= 10 ? "flux1-schnell-Q8_0.gguf" : "flux1-dev-Q8_0.gguf";
  const sampler_name = "euler";
  const scheduler = "simple";

  const workflow = {
    // KSampler select
    "3":  { class_type: "KSamplerSelect",       inputs: { sampler_name: sampler_name } },
    // Scheduler — simple is standard for FLUX
    "4":  { class_type: "BasicScheduler",        inputs: { scheduler: scheduler, steps: steps, denoise, model: ["30", 0] } },
    // Latent source
    "5":  mode === "txt2img"
            ? { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } }
            : { class_type: "LoadImage",        inputs: { image: uploadedImageName } },
    // Text encoder
    "6":  { class_type: "CLIPTextEncode",        inputs: { text: prompt, clip: ["11", 0] } },
    // VAE decode
    "8":  { class_type: "VAEDecode",             inputs: { samples: ["13", 0], vae: ["10", 0] } },
    // Save image
    "9":  { class_type: "SaveImage",             inputs: { filename_prefix: "flux_out", images: ["8", 0] } },
    // VAE loader
    "10": { class_type: "VAELoader",             inputs: { vae_name: "ae.safetensors" } },
    // CLIP loader (FP8 T5 + CLIP-L)
    "11": { class_type: "DualCLIPLoader",        inputs: { clip_name1: "t5xxl_fp8_e4m3fn.safetensors", clip_name2: "clip_l.safetensors", type: "flux" } },
    // UNET loader — GGUF
    "12": { class_type: "UnetLoaderGGUF",        inputs: { unet_name: unet_name } },
    // Sampler
    "13": { class_type: "SamplerCustomAdvanced", inputs: { noise: ["25", 0], guider: ["22", 0], sampler: ["3", 0], sigmas: ["4", 0], latent_image: mode === "img2img" ? ["26", 0] : ["5", 0] } },
    // Guider — uses FluxGuidance conditioning for Dev, raw for Schnell
    "22": { class_type: "BasicGuider",           inputs: { model: ["30", 0], conditioning: useGuidance ? ["27", 0] : ["6", 0] } },
    // Random noise
    "25": { class_type: "RandomNoise",           inputs: { noise_seed: seed } },
    // FLUX-specific ModelSampling (correct sigma scaling per resolution)
    "30": { class_type: "ModelSamplingFlux",     inputs: { max_shift: 1.15, base_shift: 0.5, width, height, model: ["12", 0] } }
  };

  if (mode === "img2img") {
    workflow["26"] = { class_type: "VAEEncode", inputs: { pixels: ["5", 0], vae: ["10", 0] } };
  }

  // FluxGuidance node — only for Dev models
  if (useGuidance) {
    workflow["27"] = { class_type: "FluxGuidance", inputs: { guidance: guidance, conditioning: ["6", 0] } };
  }

  return { prompt: workflow };
}

// ─── Main Component ────────────────────────────────────────────────────────
export function AiImageGenerator({ apiKeys }) {
  // Connection
  const [colabUrl]                = useState(DEFAULT_COLAB_URL);
  const [manualUrl, setManualUrl] = useState("");
  const [status, setStatus]       = useState("disconnected"); // disconnected | connecting | connected
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
  const [genStatus, setGenStatus]         = useState(""); // progress label
  const [currentImage, setCurrentImage]   = useState(null);
  const [history, setHistory]             = useState([]);
  const [error, setError]                 = useState(null);

  const fileInputRef  = useRef(null);
  const cancelRef     = useRef(false);
  const [portalTarget, setPortalTarget] = useState(null);

  useEffect(() => {
    // The parent App.jsx conditionally renders the portal target based on the active tab.
    // We need to poll for it so it attaches when the user switches to this tab.
    const checkTarget = () => {
      const el = document.getElementById("ai-image-settings-portal");
      if (el && !portalTarget) {
        setPortalTarget(el);
      } else if (!el && portalTarget) {
        setPortalTarget(null);
      }
    };
    checkTarget();
    const interval = setInterval(checkTarget, 300);
    return () => clearInterval(interval);
  }, [portalTarget]);

  // ── Load history & listen for Colab link ──────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai_image_history");
      if (saved) setHistory(JSON.parse(saved));
    } catch (err) { /* ignore */ }

    if (window.electronAPI?.onColabStatus) {
      return window.electronAPI.onColabStatus((data) => {
        if (data.status === "connected") {
          setStatus("connected");
          setServerUrl(data.url.replace(/\/$/, ""));
          setError(null);
        } else if (data.status === "disconnected") {
          setStatus("disconnected");
          setServerUrl("");
        }
      });
    }
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
    if (!confirm("সমস্ত Generation History মুছে ফেলবেন?")) return;
    setHistory([]);
    setCurrentImage(null);
    localStorage.removeItem("ai_image_history");
  };

  // ── Connection handlers ───────────────────────────────────────────────
  const handleStartColab = async () => {
    if (!window.electronAPI) { setError("Electron Desktop App প্রয়োজন।"); return; }
    setStatus("connecting");
    setError(null);
    try { await window.electronAPI.startColab(colabUrl); }
    catch (err) { setStatus("disconnected"); setError(err.message); }
  };

  const handleConnectManual = async () => {
    const url = manualUrl.trim().replace(/\/$/, "");
    if (!url) { setError("একটি লাইভ লিংক দিন (যেমন: https://xxxx.loca.lt)"); return; }
    setStatus("connecting");
    setError(null);
    try {
      const res = await fetch(`${url}/system_stats`, {
        headers: { "bypass-tunnel-reminder": "true" },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      setStatus("connected");
      setServerUrl(url);
      setError(null);
    } catch (err) {
      setStatus("disconnected");
      setError(`সংযোগ ব্যর্থ: ${err.message}. ComfyUI সার্ভার চালু আছে কিনা দেখুন।`);
    }
  };

  const handleDisconnect = async () => {
    if (window.electronAPI) await window.electronAPI.stopColab();
    setStatus("disconnected");
    setServerUrl("");
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
        `You are an expert AI image prompt engineer for FLUX.1. Enhance the user's basic idea into a rich, detailed, vivid prompt. Return ONLY the enhanced prompt with no extra text.`,
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
    // Validate
    if (status !== "connected" || !serverUrl) {
      setError("আগে ComfyUI সার্ভারের সাথে সংযুক্ত হন।");
      return;
    }
    if (!prompt.trim()) { setError("একটি Prompt লিখুন।"); return; }
    if (mode === "img2img" && !initImage) { setError("Image to Image মোডে একটি Init Image আপলোড করুন।"); return; }

    cancelRef.current = false;
    setIsGenerating(true);
    setError(null);
    setGenStatus("প্রস্তুতি নিচ্ছে...");
    let ws = null;

    try {
      const { width, height } = aspectRatio;
      const finalPrompt = selectedStyle.tag
        ? `${prompt.trim()}, ${selectedStyle.tag}`
        : prompt.trim();

      // ─── COMFYUI COLAB MODE ──────────────────────────────────────────
      const api = serverUrl;

      // 1. Upload init image (img2img only) - once per batch
      let uploadedImageName = "";
      if (mode === "img2img" && initImage) {
        setGenStatus("Init Image আপলোড করছে...");
        const blob = dataUrlToBlob(initImage);
        const form = new FormData();
        form.append("image", blob, "init_img.png");
        const upRes = await fetch(`${api}/upload/image`, {
          method: "POST",
          headers: { "bypass-tunnel-reminder": "true" },
          body: form
        });
        if (!upRes.ok) throw new Error("Init Image আপলোড ব্যর্থ হয়েছে।");
        const upData = await upRes.json();
        uploadedImageName = upData.name;
      }

      if (cancelRef.current) throw new Error("বাতিল করা হয়েছে।");

      // Setup WebSocket for Progress Tracking
      const clientId = Date.now().toString() + Math.random().toString(36).substring(7);
      const wsUrl = api.replace(/^http/, "ws") + "/ws?clientId=" + clientId;
      ws = new WebSocket(wsUrl);

      // Listen to WS for progress percent
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
              // 12=UnetLoader, 11=CLIPLoader, 10=VAELoader
              if (["10", "11", "12"].includes(node)) {
                setGenStatus("মডেল লোড হচ্ছে (এতে কয়েক মিনিট সময় লাগতে পারে)...");
              } else if (["3", "4", "13", "22", "30"].includes(node)) {
                if (currentProgress === 0) setGenStatus("ইমেজ জেনারেট হচ্ছে...");
              } else if (node === "8") {
                setGenStatus("ইমেজ ডিকোড হচ্ছে...");
              } else if (node === "9") {
                setGenStatus("ইমেজ সেভ হচ্ছে...");
              }
            }
          } else if (msg.type === "progress") {
            const { value, max } = msg.data;
            currentProgress = Math.round((value / max) * 100);
            if (batchCount > 1) {
              setGenStatus(`ইমেজ তৈরি করছে (${currentImageIndex}/${batchCount})... ${currentProgress}%`);
            } else {
              setGenStatus(`FLUX.1 ইমেজ তৈরি করছে... ${currentProgress}%`);
            }
          }
        } catch (err) { /* ignore */ }
      };

      // Wait a moment for WS to connect (non-blocking)
      await new Promise(r => setTimeout(r, 1000));

      // Loop over batchCount sequentially
      for (let i = 0; i < batchCount; i++) {
        if (cancelRef.current) break;
        currentImageIndex = i + 1;
        currentProgress = 0;
        
        if (batchCount > 1) {
          setGenStatus(`ইমেজ তৈরি করছে (${currentImageIndex}/${batchCount})...`);
        } else {
          setGenStatus("Workflow সাবমিট করছে...");
        }

        // 2. Submit workflow
        const workflow = buildFluxWorkflow({
          width, height,
          prompt: finalPrompt,
          denoise: mode === "img2img" ? denoising : 1.0,
          mode,
          uploadedImageName,
          steps
        });

        // Add client_id so WS receives events for this prompt
        const submitRes = await fetch(`${api}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "bypass-tunnel-reminder": "true", "localtunnel-bypass": "true" },
          body: JSON.stringify({ prompt: workflow.prompt, client_id: clientId })
        });

        if (!submitRes.ok) {
          if (submitRes.status === 403 || submitRes.status === 404) {
            throw new Error(`Localtunnel সিকিউরিটি লক! অনুগ্রহ করে প্রথমে ব্রাউজারে ${api} লিংকে গিয়ে Colab-এর IP Password টি দিয়ে Submit করুন, তারপর আবার চেষ্টা করুন।`);
          }
          const errBody = await submitRes.text();
          throw new Error(`ComfyUI Prompt API ব্যর্থ (${submitRes.status}): ${errBody.slice(0, 200)}`);
        }
        const { prompt_id: promptId } = await submitRes.json();
        if (!promptId) throw new Error("ComfyUI থেকে কোনো Prompt ID পাওয়া যায়নি।");

        // UI Update right after successful submission
        setGenStatus("রিকোয়েস্ট এক্সেপ্ট হয়েছে। সার্ভারের জন্য অপেক্ষা করছে...");

        // 3. Poll history for THIS specific prompt
        let attempt = 0;
        let imageUrl = null;

        while (attempt < POLL_MAX_ATTEMPTS) {
          if (cancelRef.current) break;
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
          attempt++;

          const histRes = await fetch(`${api}/history/${promptId}`, {
            headers: { "bypass-tunnel-reminder": "true" }
          });
          if (!histRes.ok) continue;
          const histData = await histRes.json();
          const job = histData[promptId];
          if (!job) continue;

          // Check for errors in the job
          if (job.status?.status_str === "error") {
            throw new Error(`ইমেজ ${i+1} তৈরিতে ত্রুটি হয়েছে। Colab লগ দেখুন।`);
          }

          // Find output image
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
        if (!imageUrl) throw new Error(`সময়সীমা শেষ: ইমেজ ${i+1} তৈরি হয়নি।`);

        // 4. Download image as base64
        setGenStatus(`ইমেজ ${i+1} ডাউনলোড করছে...`);
        const imgRes = await fetch(imageUrl, { headers: { "bypass-tunnel-reminder": "true" } });
        if (!imgRes.ok) throw new Error(`ইমেজ ${i+1} ডাউনলোড ব্যর্থ।`);
        const imgBlob = await imgRes.blob();
        const dataUrl = await blobToDataUrl(imgBlob);

        addToHistory(dataUrl, prompt, {
          mode, style: selectedStyle.label, ratio: aspectRatio.label, quality: steps <= 10 ? "Schnell" : "Dev",
          denoising: mode === "img2img" ? denoising : null,
          batch: batchCount > 1 ? `${i+1}/${batchCount}` : "1"
        });
      } // <-- end of Colab mode loop

      if (cancelRef.current) {
        throw new Error("বাতিল করা হয়েছে।");
      }
      setGenStatus("✅ সব ইমেজ তৈরি সম্পন্ন!");


    } catch (err) {
      if (!cancelRef.current || err.message !== "বাতিল করা হয়েছে।") {
        console.error("[Generate]", err);
        setError(err.message);
      }
    } finally {
      if (ws) ws.close();
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
    } catch (err) {
      console.error("Failed to interrupt ComfyUI:", err);
    }
    
    setGenStatus("বাতিল করা হয়েছে।");
    setTimeout(() => setGenStatus(""), 2000);
  };

  // ── Save image ────────────────────────────────────────────────────────
  const handleSave = async (dataUrl) => {
    if (!window.electronAPI?.saveFile || !window.electronAPI?.selectFolder) return;
    const folder = await window.electronAPI.selectFolder();
    if (!folder) return;
    const [, b64] = dataUrl.split(",");
    const binary  = atob(b64);
    const bytes   = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const filePath = `${folder}\\flux_${Date.now()}.png`;
    const result   = await window.electronAPI.saveFile(filePath, bytes.buffer);
    alert(result.success ? "✅ ছবি সংরক্ষিত হয়েছে!" : "❌ সংরক্ষণ ব্যর্থ: " + result.error);
  };

  // ── Status helpers ────────────────────────────────────────────────────
  const statusColor = status === "connected" ? "#22c55e" : status === "connecting" ? "#3b82f6" : "#ef4444";

  const settingsContent = (
    <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem", flex: 1 }}>
      <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Settings2 size={15} color="var(--primary)" /> সেটিংস
      </h3>

      {/* Engine is fixed to Colab now */}

      {/* Mode */}
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

      {/* Img2Img upload */}
      {mode === "img2img" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0.85rem", background: "var(--surface-2)", borderRadius: "0.75rem", border: "1px solid var(--glass-border)" }}>
          <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)" }}>Init Image</label>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{ height: 110, border: "2px dashed var(--glass-border)", borderRadius: "0.5rem", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", overflow: "hidden", transition: "border-color 0.15s" }}
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

      {/* Steps Slider */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)" }}>কোয়ালিটি স্টেপস (Steps)</label>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--primary)" }}>{steps}</span>
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--primary)", marginBottom: "0.7rem", padding: "0.4rem 0.6rem", background: "rgba(37,99,235,0.08)", borderRadius: "0.4rem", lineHeight: 1.5 }}>
          💡 ১-১০ স্টেপ দিলে Schnell মডেল (দ্রুত), আর ১১-৫০ স্টেপ দিলে Dev মডেল (হাই-কোয়ালিটি) ব্যবহার করা হবে।
        </div>
        <input 
          type="range" 
          min="1" 
          max="50" 
          step="1" 
          value={steps} 
          onChange={e => setSteps(parseInt(e.target.value))} 
          style={{ width: "100%", cursor: "pointer", accentColor: "var(--primary)" }} 
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "var(--text-3)", marginTop: "0.3rem" }}>
          <span>দ্রুত (Fast)</span>
          <span>উচ্চমান (High Quality)</span>
        </div>
      </div>

      {/* Style */}
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


      {/* Batch Count */}
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

      {/* Aspect Ratio */}
      <div>
        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)", marginBottom: "0.5rem" }}>অনুপাত (Aspect Ratio)</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem" }}>
          {ASPECT_RATIOS.map(r => (
            <button key={r.label} onClick={() => setAspectRatio(r)} style={{ padding: "0.5rem", background: aspectRatio.label === r.label ? "var(--primary)" : "var(--surface-2)", color: aspectRatio.label === r.label ? "#fff" : "var(--text-1)", border: `1px solid ${aspectRatio.label === r.label ? "var(--primary)" : "var(--glass-border)"}`, borderRadius: "0.45rem", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", transition: "all 0.12s" }}>
              {r.label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: "0.4rem", fontSize: "0.72rem", color: "var(--text-3)", textAlign: "center" }}>
          {aspectRatio.width} × {aspectRatio.height} px
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg-color)", overflow: "hidden" }}>

      {portalTarget && createPortal(settingsContent, portalTarget)}

      {/* ─── CENTER: Main Content ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* ── CONNECTION PANEL ──────────────────────────────────── */}
          <div style={{ background: "var(--surface-1)", border: "1px solid var(--glass-border)", borderRadius: "1rem", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", flexShrink: 0 }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Cpu size={22} color="var(--primary)" /> FLUX.1 Image Generator
                </h2>
                <p style={{ margin: "0.25rem 0 0", color: "var(--text-2)", fontSize: "0.85rem" }}>
                  ComfyUI + FLUX.1 Dev GGUF — ১০০% ফ্রি Cloud GPU
                </p>
              </div>

              {/* Status badge */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--surface-2)", border: "1px solid var(--glass-border)", borderRadius: "2rem", padding: "0.4rem 0.9rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, display: "inline-block", boxShadow: status === "connected" ? `0 0 0 3px ${statusColor}33` : "none" }} />
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: statusColor }}>
                    {status === "connected" ? "সংযুক্ত ✓" : status === "connecting" ? "সংযুক্ত হচ্ছে..." : "বিচ্ছিন্ন"}
                  </span>
                </div>

                {status === "disconnected" && (
                  <button
                    onClick={handleStartColab}
                    style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", border: "none", padding: "0.5rem 1rem", borderRadius: "0.6rem", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    <Zap size={14} /> Colab খুলুন
                  </button>
                )}
                {status !== "disconnected" && (
                  <button
                    onClick={handleDisconnect}
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", padding: "0.5rem 1rem", borderRadius: "0.6rem", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}
                  >
                    বন্ধ করুন
                  </button>
                )}
              </div>
            </div>

            {/* Manual URL connect */}
            {status === "disconnected" && (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="text"
                  value={manualUrl}
                  onChange={e => setManualUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleConnectManual()}
                  placeholder="লাইভ লিংক পেস্ট করুন — যেমন: https://xxxx.loca.lt"
                  style={{ flex: 1, padding: "0.6rem 0.9rem", background: "var(--surface-2)", border: "1px solid var(--glass-border)", borderRadius: "0.5rem", color: "var(--text-1)", fontSize: "0.85rem" }}
                />
                <button
                  onClick={handleConnectManual}
                  style={{ background: "var(--primary)", color: "#fff", border: "none", padding: "0.6rem 1rem", borderRadius: "0.5rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}
                >
                  <Link2 size={14} /> কানেক্ট
                </button>
              </div>
            )}

            {/* Step-by-step guide */}
            {status === "disconnected" && (
              <div style={{ background: "rgba(59,130,246,0.06)", border: "1px dashed rgba(59,130,246,0.3)", borderRadius: "0.75rem", padding: "0.9rem 1.1rem", fontSize: "0.82rem", color: "var(--text-2)", lineHeight: 1.7 }}>
                <strong style={{ color: "var(--primary)", display: "block", marginBottom: "0.4rem" }}>💡 কিভাবে শুরু করবেন:</strong>
                <ol style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  <li><strong>"Colab খুলুন"</strong> বাটনে ক্লিক করুন</li>
                  <li>Colab-এ <strong>Runtime → Change runtime type → T4 GPU</strong> সিলেক্ট করুন</li>
                  <li><code>comfyui_flux_cloudflare.ipynb</code> আপলোড করে Run (▶️) করুন</li>
                  <li>Colab-এ <code>https://xxxx.loca.lt</code> লিংক দেখালে উপরের বক্সে পেস্ট করে <strong>কানেক্ট</strong> বাটন চাপুন</li>
                </ol>
              </div>
            )}

            {status === "connected" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#22c55e", fontSize: "0.82rem", fontWeight: 600 }}>
                <CheckCircle2 size={14} /> সংযুক্ত: <code style={{ color: "var(--text-2)", fontWeight: 400 }}>{serverUrl}</code>
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
                    <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "0.4rem" }}>FLUX.1 কাজ করছে...</div>
                    <div style={{ color: "var(--text-2)", fontSize: "0.82rem" }}>{genStatus}</div>
                  </div>
                  <button
                    onClick={handleCancel}
                    style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", padding: "0.4rem 1rem", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                  >
                    <X size={12} /> বাতিল করুন
                  </button>
                </div>
              ) : currentImage ? (
                <>
                  <img
                    src={currentImage.imageUrl}
                    alt="Generated"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                  <div style={{ position: "absolute", top: "0.75rem", right: "0.75rem", display: "flex", gap: "0.4rem" }}>
                    <button onClick={() => handleSave(currentImage.imageUrl)} title="সেভ করুন" style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", padding: "0.45rem", borderRadius: "0.45rem", cursor: "pointer", backdropFilter: "blur(4px)" }}>
                      <Download size={15} />
                    </button>
                    <button onClick={() => window.electronAPI?.openExternal(currentImage.imageUrl)} title="বড় করে দেখুন" style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", padding: "0.45rem", borderRadius: "0.45rem", cursor: "pointer", backdropFilter: "blur(4px)" }}>
                      <Maximize2 size={15} />
                    </button>
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
                <button
                  onClick={handleEnhancePrompt}
                  disabled={isEnhancing || !prompt.trim()}
                  title="Gemini AI দিয়ে প্রম্পট উন্নত করুন"
                  style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.35)", color: "#a855f7", padding: "0.35rem 0.7rem", borderRadius: "0.5rem", fontSize: "0.75rem", fontWeight: 700, cursor: isEnhancing || !prompt.trim() ? "not-allowed" : "pointer", opacity: !prompt.trim() ? 0.5 : 1, display: "flex", alignItems: "center", gap: "0.35rem" }}
                >
                  {isEnhancing ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
                  AI দিয়ে উন্নত করুন
                </button>
              </div>

              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="ছবিটি কেমন হবে তা বাংলা বা English-এ লিখুন... যেমন: a cat sitting on a wooden table in golden sunlight"
                rows={4}
                style={{ width: "100%", padding: "0.85rem", background: "var(--surface-2)", border: "1px solid var(--glass-border)", borderRadius: "0.6rem", color: "var(--text-1)", fontSize: "0.9rem", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.6 }}
              />

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim() || status !== "connected"}
                style={{
                  background: (status !== "connected")
                    ? "var(--surface-2)"
                    : "linear-gradient(135deg, #2563eb, #7c3aed)",
                  color: (status !== "connected") ? "var(--text-3)" : "#fff",
                  border: "none", padding: "0.9rem", borderRadius: "0.75rem",
                  fontWeight: 800, fontSize: "1rem", cursor: (isGenerating || !prompt.trim() || status !== "connected") ? "not-allowed" : "pointer",
                  opacity: (isGenerating || !prompt.trim()) ? 0.7 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                  boxShadow: (status === "connected") ? "0 4px 18px rgba(37,99,235,0.35)" : "none",
                  transition: "all 0.2s"
                }}
              >
                {isGenerating
                  ? <><Loader2 size={18} className="spin" /> তৈরি হচ্ছে...</>
                  : <><Wand2 size={18} /> Generate with FLUX.1</>
                }
              </button>

              {/* Error */}
              {error && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.6rem", padding: "0.75rem", display: "flex", alignItems: "flex-start", gap: "0.5rem", color: "#ef4444", fontSize: "0.82rem" }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{error}</span>
                  <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#ef4444", cursor: "pointer", flexShrink: 0 }}><X size={14} /></button>
                </div>
              )}

              {/* Progress */}
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
            <button onClick={clearHistory} title="সব মুছুন" style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: "0.2rem" }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {history.length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: "0.8rem", textAlign: "center", marginTop: "2rem" }}>
              এখনো কোনো ছবি তৈরি হয়নি।<br />আপনার সৃষ্টি এখানে দেখাবে।
            </div>
          ) : history.map(item => (
            <div
              key={item.id}
              onClick={() => setCurrentImage(item)}
              style={{
                borderRadius: "0.6rem", overflow: "hidden", cursor: "pointer",
                border: currentImage?.id === item.id ? "2px solid var(--primary)" : "1px solid var(--glass-border)",
                opacity: currentImage?.id === item.id ? 1 : 0.75,
                transition: "all 0.15s", position: "relative"
              }}
            >
              <img src={item.imageUrl} alt={item.prompt} style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0.4rem 0.5rem", background: "rgba(0,0,0,0.75)", color: "#fff", fontSize: "0.68rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.prompt}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
