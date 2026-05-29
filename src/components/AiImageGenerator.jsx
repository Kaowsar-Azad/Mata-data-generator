import { useState, useEffect, useRef } from "react";
import { Cpu, Wand2, Power, Eye, AlertTriangle, CheckCircle, Loader2, Settings2, Download, Image as ImageIcon, History, Sparkles, Upload, Trash2, Maximize2 } from "lucide-react";
import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_COMFYUI_URL = "https://your-comfyui-colab-url.loca.lt";

const STYLES = [
  { id: "realistic", label: "Realistic / Photography", promptRef: "realistic photography, highly detailed, 8k resolution, photorealistic, RAW photo, cinematic lighting" },
  { id: "3d", label: "3D Render / Animation", promptRef: "3d render, octane render, unreal engine 5, masterpiece, Pixar style, ray tracing, 4k" },
  { id: "vector", label: "Vector Illustration", promptRef: "vector art, flat illustration, Adobe Illustrator style, clean lines, vibrant colors, minimalist" },
  { id: "anime", label: "Anime / Manga", promptRef: "anime style, studio ghibli, highly detailed, beautiful lighting, cel shaded" },
  { id: "none", label: "None (Raw Prompt)", promptRef: "" }
];

export function AiImageGenerator({ apiKeys, apiProvider }) {
  const [colabUrl, setColabUrl] = useState(DEFAULT_COMFYUI_URL);
  const [status, setStatus] = useState("disconnected");
  const [serverUrl, setServerUrl] = useState("");
  
  const [mode, setMode] = useState("txt2img"); // txt2img, img2img
  const [initImage, setInitImage] = useState(null);
  const [denoising, setDenoising] = useState(0.75);

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState(""); // FLUX barely uses this, but we keep it
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  
  const [currentImage, setCurrentImage] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  
  const fileInputRef = useRef(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem("ai_image_history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {}
    }

    if (window.electronAPI?.onColabStatus) {
      const cleanup = window.electronAPI.onColabStatus((data) => {
        if (data.status === 'connected') {
          setStatus('connected');
          setServerUrl(data.url);
          setError(null);
        } else if (data.status === 'disconnected') {
          setStatus('disconnected');
          setServerUrl("");
        }
      });
      return cleanup;
    }
  }, []);

  // Save history
  const saveToHistory = (imageUrl, promptUsed, settingsUsed) => {
    const entry = {
      id: Date.now(),
      imageUrl,
      prompt: promptUsed,
      settings: settingsUsed,
      date: new Date().toISOString()
    };
    const newHistory = [entry, ...history].slice(0, 50); // Keep last 50
    setHistory(newHistory);
    localStorage.setItem("ai_image_history", JSON.stringify(newHistory));
    setCurrentImage(entry);
  };

  const handleStartColab = async () => {
    if (!window.electronAPI) {
      setError("Desktop App environment required.");
      return;
    }
    setStatus("connecting");
    setError(null);
    try {
      await window.electronAPI.startColab(colabUrl);
    } catch (err) {
      setStatus("disconnected");
      setError(err.message);
    }
  };

  const handleStopColab = async () => {
    if (window.electronAPI) {
      await window.electronAPI.stopColab();
      setStatus("disconnected");
      setServerUrl("");
    }
  };

  const getWidthHeight = () => {
    switch(aspectRatio) {
      case "16:9": return { width: 1344, height: 768 };
      case "9:16": return { width: 768, height: 1344 };
      case "4:3": return { width: 1152, height: 864 };
      case "1:1": default: return { width: 1024, height: 1024 }; // FLUX native is 1024x1024
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setInitImage(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleEnhancePrompt = async () => {
    if (!prompt.trim()) return;
    const apiKeyInfo = apiKeys?.find(k => k.provider === 'google');
    if (!apiKeyInfo || !apiKeyInfo.key) {
      setError("Please add a Gemini API key in the bottom left settings to use Prompt Enhancement.");
      return;
    }

    setIsEnhancing(true);
    setError(null);
    try {
      const genAI = new GoogleGenerativeAI(apiKeyInfo.key);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const systemPrompt = `You are an expert AI image generation prompt engineer for FLUX.1.
Take the user's basic idea and enhance it into a highly detailed, descriptive, and vivid prompt for a realistic or highly stylized image. 
Return ONLY the enhanced prompt, no conversational text. Focus on lighting, camera angle, textures, and atmosphere.`;
      
      const result = await model.generateContent([systemPrompt, `User idea: ${prompt}`]);
      setPrompt(result.response.text().trim());
    } catch (err) {
      setError("Failed to enhance prompt: " + err.message);
    } finally {
      setIsEnhancing(false);
    }
  };

  const generateWithComfyUI = async () => {
    const { width, height } = getWidthHeight();
    const finalPrompt = selectedStyle.id === "none" ? prompt : `${prompt}, ${selectedStyle.promptRef}`;
    
    // This is a basic generic ComfyUI FLUX JSON workflow representation.
    // Real ComfyUI API integration requires uploading images to /upload/image for img2img, 
    // and submitting the prompt to /prompt, then polling /history/{prompt_id}.
    const apiUrl = serverUrl.replace(/\/$/, '');
    
    // First, if img2img, we need to upload the image to ComfyUI server
    let uploadedImageName = "";
    if (mode === "img2img" && initImage) {
      try {
        const formData = new FormData();
        const res = await fetch(initImage);
        const blob = await res.blob();
        formData.append("image", blob, "init_img.png");
        
        const uploadRes = await fetch(`${apiUrl}/upload/image`, {
          method: 'POST',
          body: formData
        });
        const uploadData = await uploadRes.json();
        uploadedImageName = uploadData.name;
      } catch (e) {
        throw new Error("Failed to upload Init Image to ComfyUI server.");
      }
    }

    // Build FLUX Workflow JSON
    // We assume a standard ComfyUI FLUX setup where node 6 is CLIPTextEncode, 5 is EmptyLatent/LoadImage, etc.
    // Note: A robust app might let the user define a template JSON. We use a generic fallback payload here 
    // that fits standard ComfyUI deployments.
    const promptJson = {
      "prompt": {
        "3": {
          "class_type": "KSamplerSelect",
          "inputs": { "sampler_name": "euler" }
        },
        "4": {
          "class_type": "BasicScheduler",
          "inputs": { "scheduler": "simple", "steps": 20, "denoise": mode === "img2img" ? denoising : 1.0, "model": ["12", 0] }
        },
        "5": mode === "txt2img" ? {
          "class_type": "EmptyLatentImage",
          "inputs": { "width": width, "height": height, "batch_size": 1 }
        } : {
          "class_type": "LoadImage",
          "inputs": { "image": uploadedImageName }
        },
        "6": {
          "class_type": "CLIPTextEncode",
          "inputs": { "text": finalPrompt, "clip": ["11", 0] }
        },
        "8": {
          "class_type": "VAEDecode",
          "inputs": { "samples": ["13", 0], "vae": ["10", 0] }
        },
        "9": {
          "class_type": "SaveImage",
          "inputs": { "filename_prefix": "flux_out", "images": ["8", 0] }
        },
        "10": {
          "class_type": "VAELoader",
          "inputs": { "vae_name": "ae.safetensors" }
        },
        "11": {
          "class_type": "DualCLIPLoader",
          "inputs": { "clip_name1": "t5xxl_fp16.safetensors", "clip_name2": "clip_l.safetensors", "type": "flux" }
        },
        "12": {
          "class_type": "UNETLoader",
          "inputs": { "unet_name": "flux1-dev.safetensors", "weight_dtype": "default" }
        },
        "13": {
          "class_type": "SamplerCustomAdvanced",
          "inputs": { "noise": ["25", 0], "guider": ["22", 0], "sampler": ["3", 0], "sigmas": ["4", 0], "latent_image": mode === "img2img" ? ["26", 0] : ["5", 0] }
        },
        "22": {
          "class_type": "BasicGuider",
          "inputs": { "model": ["12", 0], "conditioning": ["6", 0] }
        },
        "25": {
          "class_type": "RandomNoise",
          "inputs": { "noise_seed": Math.floor(Math.random() * 1000000000) }
        }
      }
    };

    // If img2img, we need VAEEncode
    if (mode === "img2img") {
      promptJson.prompt["26"] = {
        "class_type": "VAEEncode",
        "inputs": { "pixels": ["5", 0], "vae": ["10", 0] }
      };
    }

    const res = await fetch(`${apiUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptJson)
    });

    if (!res.ok) throw new Error("ComfyUI API rejected the prompt. Check server logs.");
    const data = await res.json();
    const promptId = data.prompt_id;

    // Poll for completion
    let isComplete = false;
    let finalImageUrl = null;
    
    while (!isComplete) {
      await new Promise(r => setTimeout(r, 2000));
      const historyRes = await fetch(`${apiUrl}/history/${promptId}`);
      const historyData = await historyRes.json();
      
      if (historyData[promptId]) {
        isComplete = true;
        const outputs = historyData[promptId].outputs;
        // Find the image output node (usually 9)
        for (const nodeId in outputs) {
          if (outputs[nodeId].images && outputs[nodeId].images.length > 0) {
            const imgInfo = outputs[nodeId].images[0];
            finalImageUrl = `${apiUrl}/view?filename=${imgInfo.filename}&subfolder=${imgInfo.subfolder}&type=${imgInfo.type}`;
            break;
          }
        }
      }
    }

    if (!finalImageUrl) throw new Error("Generation finished but no image was found in output.");

    // Convert URL to Base64 so we can save it locally offline
    const imgRes = await fetch(finalImageUrl);
    const blob = await imgRes.blob();
    const reader = new FileReader();
    
    return new Promise((resolve) => {
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  };

  const handleGenerate = async () => {
    if (!serverUrl && status !== 'connected') {
      setError("Please connect to the Cloud GPU first.");
      return;
    }
    if (!prompt.trim()) {
      setError("Please enter a prompt.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // In a real app, you might abstract this to support both Gradio A1111 and ComfyUI
      // Here we assume ComfyUI due to FLUX.1 preference.
      const base64Image = await generateWithComfyUI();
      
      saveToHistory(base64Image, prompt, {
        mode, style: selectedStyle.label, aspectRatio, denoising: mode === 'img2img' ? denoising : null
      });

    } catch (err) {
      console.error(err);
      setError(`Generation error: ${err.message}. Make sure your ComfyUI workflow matches the standard node IDs or use a compatible FLUX Colab.`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveImage = async (dataUrl) => {
    if (window.electronAPI?.saveFile && window.electronAPI?.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (!folder) return;
      
      const base64Data = dataUrl.replace(/^data:image\/(png|jpeg);base64,/, "");
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }
      
      const filename = folder + "\\flux_generated_" + Date.now() + ".png";
      const res = await window.electronAPI.saveFile(filename, bytes.buffer);
      if (res.success) {
        alert("Image saved successfully!");
      } else {
        alert("Error saving: " + res.error);
      }
    }
  };

  const clearHistory = () => {
    if (confirm("Clear all generation history?")) {
      setHistory([]);
      setCurrentImage(null);
      localStorage.removeItem("ai_image_history");
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.3s ease-out', background: 'var(--bg-color)' }}>
      
      {/* ─── LEFT SIDEBAR: HISTORY ─── */}
      <div style={{ width: '280px', borderRight: '1px solid var(--glass-border)', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <History style={{ width: '1.1rem', height: '1.1rem', color: 'var(--primary)' }} /> History
          </h3>
          {history.length > 0 && (
            <button onClick={clearHistory} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
              <Trash2 style={{ width: '1rem', height: '1rem' }} />
            </button>
          )}
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem', marginTop: '2rem' }}>
              No generated images yet.<br/>Your creations will appear here.
            </div>
          ) : (
            history.map(item => (
              <div 
                key={item.id} 
                onClick={() => setCurrentImage(item)}
                style={{ 
                  borderRadius: '0.75rem', overflow: 'hidden', border: currentImage?.id === item.id ? '2px solid var(--primary)' : '1px solid var(--glass-border)', 
                  cursor: 'pointer', opacity: currentImage?.id === item.id ? 1 : 0.7, transition: 'all 0.2s', position: 'relative'
                }}
              >
                <img src={item.imageUrl} alt={item.prompt} style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0.5rem', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.prompt}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── MAIN CONTENT ─── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Header & Connection */}
        <div style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', borderRadius: '1rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Cpu style={{ color: 'var(--primary)' }} /> FLUX.1 Engine (ComfyUI)
              </h2>
              <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', margin: 0 }}>Generate hyper-realistic images using 100% free Cloud GPUs.</p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-2)', padding: '0.5rem 1rem', borderRadius: '2rem', border: '1px solid var(--glass-border)' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: status === 'connected' ? 'var(--success)' : status === 'connecting' ? 'var(--primary)' : 'var(--danger)' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{status.toUpperCase()}</span>
              </div>
              
              {status === 'disconnected' ? (
                <button onClick={handleStartColab} style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))', border: 'none', color: '#fff', padding: '0.6rem 1.2rem', borderRadius: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 4px 12px rgba(37,99,235,0.25)' }}>
                  Start Free GPU
                </button>
              ) : (
                <button onClick={handleStopColab} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)', padding: '0.6rem 1.2rem', borderRadius: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Stop GPU
                </button>
              )}
            </div>
          </div>
          
          {status === 'disconnected' && (
            <input 
              type="text" 
              value={colabUrl}
              onChange={(e) => setColabUrl(e.target.value)}
              placeholder="ComfyUI Colab URL (e.g. .loca.lt)"
              style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--surface-2)', border: '1px solid var(--glass-border)', borderRadius: '0.5rem', color: 'var(--text-1)' }}
            />
          )}
        </div>

        {/* Generation Interface */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', opacity: status === 'connected' ? 1 : 0.6, pointerEvents: status === 'connected' ? 'auto' : 'none' }}>
          
          {/* Left Column: Input & Display */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Display Area */}
            <div style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', borderRadius: '1rem', height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              {isGenerating ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: 'var(--primary)' }}>
                  <Loader2 className="spin" style={{ width: '3rem', height: '3rem' }} />
                  <span style={{ fontWeight: 600 }}>FLUX.1 is generating magic...</span>
                </div>
              ) : currentImage ? (
                <>
                  <img src={currentImage.imageUrl} alt="Generated" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => handleSaveImage(currentImage.imageUrl)} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
                      <Download style={{ width: '1.1rem', height: '1.1rem' }} />
                    </button>
                    <button onClick={() => window.electronAPI?.openExternal(currentImage.imageUrl)} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
                      <Maximize2 style={{ width: '1.1rem', height: '1.1rem' }} />
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--text-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                  <ImageIcon style={{ width: '4rem', height: '4rem', opacity: 0.5 }} />
                  <span>Your generation will appear here</span>
                </div>
              )}
            </div>

            {/* Prompt Area */}
            <div style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', borderRadius: '1rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-2)' }}>Image Prompt</label>
                <button 
                  onClick={handleEnhancePrompt} 
                  disabled={isEnhancing || !prompt}
                  style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7', padding: '0.4rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s' }}
                >
                  {isEnhancing ? <Loader2 className="spin" style={{ width: '0.8rem', height: '0.8rem' }} /> : <Sparkles style={{ width: '0.8rem', height: '0.8rem' }} />}
                  Enhance Prompt
                </button>
              </div>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want to generate in detail..."
                style={{ width: '100%', height: '100px', padding: '1rem', background: 'var(--surface-2)', border: '1px solid var(--glass-border)', borderRadius: '0.75rem', color: 'var(--text-1)', fontSize: '0.95rem', resize: 'vertical' }}
              />
              
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt}
                style={{
                  background: 'linear-gradient(135deg, var(--primary), var(--secondary))', color: '#fff', border: 'none', padding: '1rem', borderRadius: '0.75rem', fontWeight: 800, fontSize: '1.1rem', cursor: (isGenerating || !prompt) ? 'not-allowed' : 'pointer', opacity: (isGenerating || !prompt) ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(37,99,235,0.3)', transition: 'all 0.2s'
                }}
              >
                {isGenerating ? <><Loader2 className="spin" /> Generating...</> : <><Wand2 /> Generate with FLUX.1</>}
              </button>
              
              {error && (
                <div style={{ color: 'var(--danger)', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.5rem', background: 'rgba(239,68,68,0.1)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                  <AlertTriangle style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }} /> {error}
                </div>
              )}
            </div>
          </div>
          
          {/* Right Column: Settings */}
          <div style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', borderRadius: '1rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings2 style={{ width: '1.1rem', height: '1.1rem', color: 'var(--primary)' }} /> Settings
            </h3>
            
            {/* Mode Switcher */}
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: '0.5rem', padding: '0.25rem' }}>
              <button onClick={() => setMode('txt2img')} style={{ flex: 1, padding: '0.5rem', border: 'none', background: mode === 'txt2img' ? 'var(--primary)' : 'transparent', color: mode === 'txt2img' ? '#fff' : 'var(--text-2)', borderRadius: '0.4rem', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Text to Image</button>
              <button onClick={() => setMode('img2img')} style={{ flex: 1, padding: '0.5rem', border: 'none', background: mode === 'img2img' ? 'var(--primary)' : 'transparent', color: mode === 'img2img' ? '#fff' : 'var(--text-2)', borderRadius: '0.4rem', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Image to Image</button>
            </div>

            {/* Img2Img specific settings */}
            {mode === 'img2img' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', background: 'var(--surface-2)', borderRadius: '0.75rem', border: '1px solid var(--glass-border)' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-2)' }}>Initial Image</label>
                
                <div onClick={() => fileInputRef.current?.click()} style={{ width: '100%', height: '120px', border: '2px dashed var(--glass-border)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                  {initImage ? (
                    <img src={initImage} alt="Init" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-3)', gap: '0.5rem' }}>
                      <Upload style={{ width: '1.5rem', height: '1.5rem' }} />
                      <span style={{ fontSize: '0.8rem' }}>Click to upload</span>
                    </div>
                  )}
                </div>
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
                
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Denoising Strength</label>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{denoising.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.1" max="1.0" step="0.05" value={denoising} onChange={(e) => setDenoising(parseFloat(e.target.value))} style={{ width: '100%' }} />
                </div>
              </div>
            )}
            
            {/* Styles */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.75rem' }}>AI Style Model</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {STYLES.map(style => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style)}
                    style={{
                      padding: '0.75rem 1rem', background: selectedStyle.id === style.id ? 'var(--primary-glow)' : 'var(--surface-2)', border: `1px solid ${selectedStyle.id === style.id ? 'var(--primary)' : 'var(--glass-border)'}`, color: selectedStyle.id === style.id ? 'var(--text-1)' : 'var(--text-2)', borderRadius: '0.5rem', textAlign: 'left', fontSize: '0.85rem', fontWeight: selectedStyle.id === style.id ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s'
                    }}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Aspect Ratio */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.75rem' }}>Aspect Ratio</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {["1:1", "16:9", "9:16", "4:3"].map(ratio => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    style={{
                      padding: '0.6rem', background: aspectRatio === ratio ? 'var(--primary)' : 'var(--surface-2)', color: aspectRatio === ratio ? '#fff' : 'var(--text-1)', border: `1px solid ${aspectRatio === ratio ? 'var(--primary)' : 'var(--glass-border)'}`, borderRadius: '0.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
