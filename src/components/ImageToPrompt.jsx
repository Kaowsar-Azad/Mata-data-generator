import { useState, useRef } from "react";
import { Upload, Loader2, Trash2, X, RefreshCw, Copy, CheckCircle2, Image as ImageIcon } from "lucide-react";
import { generatePromptFromImage } from "../services/geminiService";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/gif";

export function ImageToPrompt({ apiKeys }) {
  const [images, setImages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

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

  const removeImage = (id) => setImages((prev) => prev.filter((img) => img.id !== id));
  const clearAll = () => setImages([]);

  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
    });

  const processBatch = async (onlyErrors = false) => {
    if (apiKeys.length === 0) {
      alert("Please add at least one Gemini API key first.");
      return;
    }

    setIsProcessing(true);

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (img.status === "done") continue;
      if (onlyErrors && img.status !== "error") continue;

      setImages((prev) =>
        prev.map((item) => (item.id === img.id ? { ...item, status: "processing" } : item))
      );

      try {
        const dataUrl = await toBase64(img.file);
        const base64 = dataUrl.split(",")[1];
        const mimeType = img.file.type;

        const generatedPrompt = await generatePromptFromImage(base64, mimeType, apiKeys);

        setImages((prev) =>
          prev.map((item) =>
            item.id === img.id ? { ...item, status: "done", result: generatedPrompt } : item
          )
        );

        if (i < images.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
      } catch (err) {
        setImages((prev) =>
          prev.map((item) =>
            item.id === img.id ? { ...item, status: "error", error: err.message } : item
          )
        );
      }
    }

    setIsProcessing(false);
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

function PromptField({ value, onChange }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="meta-label text-accent font-semibold">Generated Prompt</span>
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
