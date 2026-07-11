import { useState, useRef, useEffect } from "react";
import { Upload, Loader2, Trash2, X, RefreshCw, Copy, CheckCircle2, Image as ImageIcon, Target, Sparkles, ChevronDown } from "lucide-react";
import { generatePromptFromImage } from "../services/geminiService";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/gif";

const MODEL_OPTIONS = [
  { value: 'ChatGPT', label: 'ChatGPT / DALL-E 3' },
  { value: 'Midjourney', label: 'Midjourney' },
  { value: 'Flux', label: 'Flux 1.1 Pro' },
  { value: 'Nano Banana', label: 'Nano Banana' },
  { value: 'Recraft', label: 'Recraft' },
  { value: 'Ideogram', label: 'Ideogram' },
  { value: 'Other', label: 'Other' },
];

export function ImageToPrompt({ apiKeys, apiProvider, promptSettings, setPromptSettings }) {
  const [images, setImages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const fileInputRef = useRef(null);
  const abortRef = useRef(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const mode = promptSettings?.promptSimilarityMode || 'Exact Match';

  const handleModeChange = (newMode) => {
    if (setPromptSettings) {
      setPromptSettings((prev) => ({
        ...prev,
        promptSimilarityMode: newMode,
      }));
    }
  };

  const isAccepted = (file) => file.type.startsWith("image/");

  const addImages = (files) => {
    const accepted = files.filter(isAccepted);
    const newEntries = accepted.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      status: "pending",
      result: null,
      error: null,
    }));
    setImages((prev) => [...prev, ...newEntries]);
  };

  const onFileChange = (e) => {
    addImages(Array.from(e.target.files));
    e.target.value = "";
  };

  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => {
    e.preventDefault();
    addImages(Array.from(e.dataTransfer.files));
  };

  const removeImage = (id) => {
    setImages((prev) => {
      const filtered = prev.filter((img) => img.id !== id);
      if (filtered.length === 0) {
        abortRef.current = true;
        setIsProcessing(false);
        setProgress(0);
      }
      return filtered;
    });
  };

  const clearAll = () => {
    abortRef.current = true;
    setImages([]);
    setIsProcessing(false);
    setProgress(0);
  };

  const resizeImageToBase64 = (file, maxSize = 800) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const processBatch = async (onlyErrors = false) => {
    if (apiKeys.length === 0) {
      alert("Please add at least one Gemini API key first.");
      return;
    }

    abortRef.current = false;
    setIsProcessing(true);
    setProgress(0);

    const toProcess = images.filter((img) => {
      if (img.status === "done") return false;
      if (onlyErrors && img.status !== "error") return false;
      return true;
    });

    const limit = promptSettings?.concurrentLimit || 2;
    let processed = 0;

    for (let i = 0; i < toProcess.length; i += limit) {
      if (abortRef.current) break;
      const chunk = toProcess.slice(i, i + limit);

      // Set status to processing for all in this chunk
      setImages((prev) =>
        prev.map((item) =>
          chunk.some((ci) => ci.id === item.id) ? { ...item, status: "processing" } : item
        )
      );

      // Process chunk concurrently
      await Promise.all(
        chunk.map(async (img) => {
          if (abortRef.current) return;
          try {
            const hasGroqInProvider = Array.isArray(apiProvider) ? apiProvider.includes("groq") : apiProvider === "groq";
            const hasGroqInKeys = apiKeys && apiKeys.some(k => (typeof k === 'object' && k.provider === 'groq') || k === 'groq');
            const targetSize = (hasGroqInProvider || hasGroqInKeys) ? 512 : 800;
            const dataUrl = await resizeImageToBase64(img.file, targetSize);
            const base64 = dataUrl.split(",")[1];
            const mimeType = "image/jpeg";

            const { prompt: generatedPrompt, provider: usedProvider } = await generatePromptFromImage(base64, mimeType, apiKeys, apiProvider || "gemini", promptSettings);

            setImages((prev) =>
              prev.map((item) =>
                item.id === img.id ? { ...item, status: "done", result: generatedPrompt, provider: usedProvider } : item
              )
            );
          } catch (err) {
            setImages((prev) =>
              prev.map((item) =>
                item.id === img.id ? { ...item, status: "error", error: err.message } : item
              )
            );
          }
          processed++;
          if (!abortRef.current) {
            setProgress(Math.round((processed / toProcess.length) * 100));
          }
        })
      );

      if (abortRef.current) break;

      // Add delay between chunks
      if (i + limit < toProcess.length) {
        await new Promise((resolve) => setTimeout(resolve, 4500));
      }
    }

    setIsProcessing(false);
    setTimeout(() => setProgress(0), 1000);
  };

  const handlePromptChange = (id, value) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id && img.result ? { ...img, result: value } : img))
    );
  };

  const errorCount = images.filter((i) => i.status === "error").length;
  const pendingCount = images.filter((i) => i.status === "pending").length;
  const doneCount = images.filter((i) => i.status === "done").length;

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="upload-zone"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          multiple
          accept={ACCEPTED_TYPES}
          onChange={onFileChange}
        />
        <div className="flex flex-col items-center">
          <div className="upload-icon-wrap">
            <Upload style={{ width: "2rem", height: "2rem", color: "var(--primary-light)" }} />
          </div>
          <h2 style={{ marginBottom: "0.4rem", fontSize: "1.2rem" }}>Upload Images for AI Prompt</h2>
          <p className="text-muted" style={{ marginBottom: "1rem" }}>
            Extract detailed descriptive prompts from any image using Google AI
          </p>
          <div className="flex gap-3">
            <span className="img-badge">
              <ImageIcon className="w-3 h-3" /> JPG, PNG, WEBP
            </span>
          </div>
        </div>
      </div>

      {/* Similarity Mode & Target Model Selector Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', zIndex: 30 }}>
        <div className="glass card animate-fade-in" style={{ padding: '0.85rem 1.25rem', border: '1px solid var(--glass-border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', background: 'var(--glass)' }}>
          <div style={{ flex: '1 1 300px' }}>
            <h3 style={{ fontSize: '0.9rem', margin: 0, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ImageIcon className="w-4 h-4 text-primary" style={{ color: 'var(--primary)' }} />
              Target AI Model
            </h3>
            <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem', lineHeight: '1.4' }}>
              Choose which Image AI you plan to use this prompt with. The format will be optimized automatically.
            </p>
          </div>
          
          <div ref={dropdownRef} style={{ position: 'relative', width: '100%', maxWidth: '240px', zIndex: 100 }}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.45rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--glass-border)',
                background: 'var(--surface-2)',
                color: 'var(--text-1)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                textAlign: 'left'
              }}
            >
              <span>{MODEL_OPTIONS.find(o => o.value === (promptSettings?.targetModel || 'ChatGPT'))?.label || 'ChatGPT / DALL-E 3'}</span>
              <ChevronDown style={{ width: '0.8rem', height: '0.8rem', transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.7 }} />
            </button>
            
            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                width: '100%',
                marginTop: '0.25rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--glass-border)',
                background: 'var(--surface-1)',
                boxShadow: 'var(--glass-shadow)',
                zIndex: 50,
                padding: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}>
                {MODEL_OPTIONS.map(opt => {
                  const isSelected = (promptSettings?.targetModel || 'ChatGPT') === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setPromptSettings && setPromptSettings(prev => ({ ...prev, targetModel: opt.value }));
                        setDropdownOpen(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.35rem 0.6rem',
                        borderRadius: '0.35rem',
                        border: 'none',
                        background: isSelected ? 'var(--primary)' : 'transparent',
                        color: isSelected ? '#fff' : 'var(--text-1)',
                        fontSize: '0.75rem',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        display: 'block',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {errorCount > 0 && (
        <div className="glass card animate-fade-in" style={{ borderLeft: '4px solid var(--danger)', background: 'rgba(248,113,113,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'var(--danger)', fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RefreshCw className="w-4 h-4" /> 
              {errorCount} File{errorCount !== 1 ? 's' : ''} Failed
            </h3>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Some images failed to process. You can retry exclusively for these files.
            </p>
          </div>
          <button
            className="btn-primary shrink-0"
            style={{ background: 'var(--danger)', boxShadow: '0 4px 15px rgba(248,113,113,0.3)' }}
            disabled={isProcessing}
            onClick={() => processBatch(true)}
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isProcessing ? 'Retrying...' : 'Retry Failed Files'}
          </button>
        </div>
      )}

      {/* Progress Bar */}
      {isProcessing && progress > 0 && (
        <div style={{ width: '100%', margin: '10px 0' }}>
          <div style={{ height: '8px', background: 'var(--surface-3)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--secondary))', transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: '4px', textAlign: 'right', fontWeight: 600 }}>{progress}%</div>
        </div>
      )}

      {/* Control Bar */}
      {images.length > 0 && (
        <div className="control-bar">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-1)" }}>
                {images.length} Image{images.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div style={{ width: "1px", height: "1.2rem", background: "var(--glass-border)" }}></div>

            <div className="flex gap-3 text-sm font-semibold">
              <span className="text-muted">⏳ {pendingCount}</span>
              <span style={{ color: "var(--success)" }}>✔ {doneCount}</span>
              {errorCount > 0 && <span style={{ color: "var(--danger)" }}>✖ {errorCount}</span>}
            </div>

            <button
              className="btn-outline"
              style={{ color: "var(--danger)", fontSize: "0.75rem", padding: "0.3rem 0.6rem", marginLeft: "auto" }}
              onClick={clearAll}
            >
              <Trash2 className="w-3 h-3" /> Clear All
            </button>
          </div>

          <div className="flex gap-2 flex-wrap mt-3 sm:mt-0">
            <button
              className="btn-primary"
              disabled={isProcessing || images.every((img) => img.status === "done")}
              onClick={() => processBatch(false)}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isProcessing ? "Analyzing..." : images.every((img) => img.status === "done") ? "All Done!" : "Extract Prompts"}
            </button>
          </div>
        </div>
      )}

      {/* File Grid */}
      <div className="grid grid-cols-1 gap-4">
        {images.map((img) => (
          <div key={img.id} className="glass card animate-fade-in file-row">
            <div className="thumb-wrap">
              <img src={img.preview} className="thumb-img" alt="preview" />
              {img.status === "done" && (
                <div className="done-badge">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
              )}
              <button className="remove-btn" onClick={() => removeImage(img.id)}>
                <X className="w-3 h-3 text-white" />
              </button>
            </div>

            <div className="flex-grow space-y-2 min-w-0">
              <div className="flex justify-between items-start gap-2">
                <h3 className="font-mono text-sm text-muted truncate">{img.file.name}</h3>
                <StatusBadge status={img.status} />
              </div>

              {img.status === "done" && img.result && (
                <div className="mt-3">
                  <PromptField
                    value={img.result}
                    provider={img.provider}
                    onChange={(val) => handlePromptChange(img.id, val)}
                  />
                </div>
              )}

              {img.status === "error" && (
                <p className="text-xs text-red-400 bg-red-400/10 p-2 rounded mt-2">⚠ {img.error}</p>
              )}
              {img.status === "pending" && (
                <p className="text-xs italic text-muted mt-2">Awaiting AI analysis...</p>
              )}
              {img.status === "processing" && (
                <p className="text-xs text-primary animate-pulse mt-2">
                  🤖 Analyzing image details...
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    done: "bg-green-500/20 text-green-400",
    processing: "bg-primary/20 text-primary animate-pulse",
    error: "bg-red-500/20 text-red-500",
    pending: "bg-surface text-muted",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider shrink-0 ${map[status] || map.pending}`}>
      {status}
    </span>
  );
}

function PromptField({ value, onChange, provider }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="meta-label text-accent font-semibold">
          Generated Prompt
          {provider && (
            <span style={{ fontSize: "0.75rem", opacity: 0.8, color: "var(--primary-light)", marginLeft: "0.4rem", textTransform: "uppercase" }}>
              ({provider})
            </span>
          )}
        </span>
        <button
          onClick={handleCopy}
          title="Copy Prompt"
          style={{
            background: "transparent",
            border: "none",
            padding: "0.2rem",
            color: copied ? "var(--success)" : "var(--text-3)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.2rem",
          }}
        >
          {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span style={{ fontSize: "0.65rem", fontWeight: 600 }}>{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full outline-none resize-y"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--glass-border)",
          borderRadius: "0.4rem",
          padding: "0.75rem",
          minHeight: "100px",
          color: "var(--text-1)",
          fontFamily: "inherit",
          transition: "border-color 0.2s",
          fontSize: "0.9rem",
          lineHeight: "1.5",
        }}
        onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
        onBlur={(e) => (e.target.style.borderColor = "var(--glass-border)")}
      />
    </div>
  );
}
