import { useState, useRef, useEffect } from "react";
import {
  Upload,
  Download,
  CheckCircle2,
  Loader2,
  Trash2,
  X,
  RefreshCw,
  FileCode2,
  Image as ImageIcon,
  Copy
} from "lucide-react";
import { generateMetadata } from "../services/geminiService";
import { processEpsFile, isEpsFile } from "../services/epsService";

// Accepted file types: common raster images + EPS vector
const ACCEPTED_TYPES =
  "image/jpeg,image/png,image/webp,image/gif,image/svg+xml," +
  "application/postscript,application/eps,image/eps,application/x-eps,.eps,.epsf,.epsi";

export function ImageWorkflow({ apiKeys, promptSettings }) {
  const [images, setImages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  // ---------- Keyboard Shortcuts ----------
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      // Enter key to process
      if (e.key === 'Enter') {
        const canProcess = images.length > 0 && !isProcessing && !images.every((img) => img.status === "done");
        if (canProcess) {
          processBatch();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images, isProcessing, apiKeys]);

  // ---------- File helpers ----------

  const isAccepted = (file) => {
    if (isEpsFile(file)) return true;
    return file.type.startsWith("image/");
  };

  const addImages = async (files) => {
    const accepted = files.filter(isAccepted);

    if (accepted.length < files.length) {
      const skipped = files.length - accepted.length;
      console.warn(`[Upload] Skipped ${skipped} unsupported file(s).`);
    }

    // --- Smart File Pairing Logic ---
    // Adobe Stock contributors often upload a folder with matching EPS and JPG files.
    // We group by base name (e.g., "icon-4") to pair them.
    const fileGroups = {};
    
    accepted.forEach(file => {
      const isEps = isEpsFile(file);
      // Remove extension to get base name
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      
      if (!fileGroups[baseName]) {
        fileGroups[baseName] = { eps: null, raster: null };
      }
      
      if (isEps) {
        fileGroups[baseName].eps = file;
      } else {
        // Keep the first raster image found for this base name
        if (!fileGroups[baseName].raster) {
          fileGroups[baseName].raster = file;
        }
      }
    });

    const newEntries = [];

    for (const [baseName, group] of Object.entries(fileGroups)) {
      if (group.eps && group.raster) {
        // Paired! Use raster for preview/Gemini, but keep EPS for CSV name.
        newEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          file: group.eps,           // Target file for CSV (icon-4.eps)
          visualFile: group.raster,  // Used for AI analysis
          preview: URL.createObjectURL(group.raster),
          isEps: true,
          isPaired: true,            // Custom flag for UI badge
          epsData: null,             // Not needed because we have visualFile
          status: "pending",
          result: null,
          error: null,
        });
      } else if (group.eps) {
        // EPS only (requires extraction fallback)
        newEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          file: group.eps,
          visualFile: null,
          preview: null,
          isEps: true,
          isPaired: false,
          epsData: null,
          status: "pending",
          result: null,
          error: null,
        });
      } else if (group.raster) {
        // Raster only
        newEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          file: group.raster,
          visualFile: group.raster,
          preview: URL.createObjectURL(group.raster),
          isEps: false,
          isPaired: false,
          epsData: null,
          status: "pending",
          result: null,
          error: null,
        });
      }
    }

    setImages((prev) => [...prev, ...newEntries]);

    // Process EPS previews in background ONLY for unpaired EPS files
    newEntries
      .filter((e) => e.isEps && !e.isPaired)
      .forEach(async (entry) => {
        const epsData = await processEpsFile(entry.file);
        setImages((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? { ...item, epsData, preview: epsData.dataUrl }
              : item
          )
        );
      });
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

  const removeImage = (id) =>
    setImages((prev) => prev.filter((img) => img.id !== id));

  const clearAll = () => setImages([]);

  // ---------- Processing ----------

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
      // If we only want to retry errors, skip files that are pending
      if (onlyErrors && img.status !== "error") continue;

      setImages((prev) =>
        prev.map((item) =>
          item.id === img.id ? { ...item, status: "processing" } : item
        )
      );

      try {
        let base64, mimeType;
        let isPlaceholder = false;

        if (img.visualFile) {
          // It's either a paired EPS (has high-quality JPG) or a normal raster image
          const dataUrl = await toBase64(img.visualFile);
          base64 = dataUrl.split(",")[1];
          mimeType = img.visualFile.type;
        } else if (img.isEps) {
          // It's an unpaired EPS, rely on extraction or placeholder
          let epsData = img.epsData;
          if (!epsData) {
            epsData = await processEpsFile(img.file);
            setImages((prev) =>
              prev.map((item) =>
                item.id === img.id
                  ? { ...item, epsData, preview: epsData.dataUrl }
                  : item
              )
            );
          }
          base64 = epsData.base64;
          mimeType = epsData.mimeType;
          isPlaceholder = epsData.isPlaceholder ?? false;
        }

        const fileInfo = {
          isEps: img.isEps,
          isPlaceholder: isPlaceholder,
          fileName: img.file.name,
          extractedTextContext: img.epsData?.extractedTextContext || null,
          promptSettings: promptSettings
        };

        const metadata = await generateMetadata(base64, mimeType, apiKeys, fileInfo);

        setImages((prev) =>
          prev.map((item) =>
            item.id === img.id
              ? { ...item, status: "done", result: metadata }
              : item
          )
        );

        // Add a 2.5-second delay between requests to avoid hitting the 15 RPM Free Tier limit
        if (i < images.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2500));
        }

      } catch (err) {
        setImages((prev) =>
          prev.map((item) =>
            item.id === img.id
              ? { ...item, status: "error", error: err.message }
              : item
          )
        );
      }
    }

    setIsProcessing(false);
  };

  // ---------- Export ----------

  const downloadCSV = () => {
    const doneImages = images.filter((img) => img.status === "done");
    if (doneImages.length === 0) return;

    let content = "Filename,Title,Description,Keywords\n";

    doneImages.forEach((img) => {
      const { title = "", description = "", keywords = "" } = img.result || {};
      const safe = (s) => `"${String(s).replace(/"/g, '""')}"`;
      
      content += `${safe(img.file.name)},${safe(title)},${safe(description)},${safe(keywords)}\n`;
    });

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `adobe_stock_metadata_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const doneCount = images.filter((i) => i.status === "done").length;
  const errorCount = images.filter((i) => i.status === "error").length;
  const pendingCount = images.filter((i) => i.status === "pending").length;
  const epsCount = images.filter((i) => i.isEps).length;

  // ---------- Metadata Editing ----------
  const handleMetaChange = (id, field, value) => {
    setImages((prev) =>
      prev.map((img) => {
        if (img.id === id && img.result) {
          return { ...img, result: { ...img.result, [field]: value } };
        }
        return img;
      })
    );
  };

  // ---------- Render ----------

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
            <Upload style={{ width: '2rem', height: '2rem', color: 'var(--primary-light)' }} />
          </div>
          <h2 style={{ marginBottom: '0.4rem', fontSize: '1.2rem' }}>Upload Images or EPS Files</h2>
          <p className="text-muted" style={{ marginBottom: '1rem' }}>
            Drag & drop or click — JPG, PNG, WebP, GIF, SVG &{" "}
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>EPS</span>
          </p>
          <div className="flex gap-3">
            <span className="eps-badge"><FileCode2 className="w-3 h-3" /> EPS Vector</span>
            <span className="img-badge"><ImageIcon className="w-3 h-3" /> Raster Image</span>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.75rem' }}>
            Maximum recommended: 50 files per batch
          </p>
        </div>
      </div>

      {/* ERROR BANNER - Shows at the very top when there are failed files */}
      {errorCount > 0 && (
        <div className="glass card animate-fade-in" style={{ borderLeft: '4px solid var(--danger)', background: 'rgba(248,113,113,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'var(--danger)', fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RefreshCw className="w-4 h-4" /> 
              {errorCount} File{errorCount !== 1 ? 's' : ''} Failed to Generate
            </h3>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Some metadata generation failed (likely due to API rate limits). You can retry exclusively for these files.
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
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-1)' }}>
                {images.length} File{images.length !== 1 ? 's' : ''}
              </span>
              {epsCount > 0 && (
                <span className="eps-badge" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                  {epsCount} EPS
                </span>
              )}
            </div>

            {/* Stats Separator */}
            <div style={{ width: '1px', height: '1.2rem', background: 'var(--glass-border)' }}></div>

            {/* Detailed Stats */}
            <div className="flex gap-3 text-sm font-semibold">
              <span className="text-muted" title="Waiting to process">⏳ {pendingCount}</span>
              <span style={{ color: 'var(--success)' }} title="Successfully generated">✔ {doneCount}</span>
              {errorCount > 0 && (
                <span style={{ color: 'var(--danger)' }} title="Failed (Rate limit or error)">✖ {errorCount}</span>
              )}
            </div>

            {/* Clear Button */}
            <button className="btn-outline" style={{ color: 'var(--danger)', fontSize: '0.75rem', padding: '0.3rem 0.6rem', marginLeft: 'auto' }} onClick={clearAll}>
              <Trash2 className="w-3 h-3" /> Clear All
            </button>
          </div>

          <div className="flex gap-2 flex-wrap mt-3 sm:mt-0">
            <button
              className="btn-primary"
              disabled={isProcessing || images.every(img => img.status === 'done')}
              onClick={() => processBatch(false)}
              title="Keyboard shortcut: Enter"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isProcessing ? 'Generating...' : (images.every(img => img.status === 'done') ? 'All Done!' : 'Generate AI (Enter)')}
            </button>
            <button
              className="btn-outline"
              style={{ color: 'var(--success)', borderColor: 'rgba(52,211,153,0.25)' }}
              disabled={isProcessing || doneCount === 0}
              onClick={downloadCSV}
            >
              <Download className="w-4 h-4" /> Export CSV ({doneCount})
            </button>
          </div>
        </div>
      )}

      {/* File Grid */}
      <div className="grid grid-cols-1 gap-4">
        {images.map((img) => (
          <div
            key={img.id}
            className="glass card animate-fade-in file-row"
          >
            {/* Preview thumbnail */}
            <div className="thumb-wrap">
              {img.preview ? (
                <img
                  src={img.preview}
                  className="thumb-img"
                  alt="preview"
                />
              ) : (
                <div className="thumb-loading">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              )}

              {img.isEps && !img.isPaired && (
                <div className="eps-indicator" title="EPS Vector File">
                  <FileCode2 className="w-2.5 h-2.5" />
                  EPS
                </div>
              )}

              {img.isPaired && (
                <div className="eps-indicator" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }} title="EPS + JPG Paired!">
                  <ImageIcon className="w-2.5 h-2.5" />
                  EPS+JPG
                </div>
              )}

              {img.status === "done" && (
                <div className="done-badge">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
              )}

              <button
                className="remove-btn"
                onClick={() => removeImage(img.id)}
                title="Remove file"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>

            {/* File info + metadata */}
            <div className="flex-grow space-y-2 min-w-0">
              <div className="flex justify-between items-start gap-2">
                <h3 className="font-mono text-sm text-muted truncate">
                  {img.file.name}
                </h3>
                <StatusBadge status={img.status} />
              </div>

              {img.status === "done" && img.result && (
                <div className="space-y-2 mt-3">
                  <MetaField 
                    label="Title" 
                    value={img.result.title} 
                    onChange={(val) => handleMetaChange(img.id, "title", val)}
                  />
                  <MetaField 
                    label="Description" 
                    value={img.result.description} 
                    onChange={(val) => handleMetaChange(img.id, "description", val)}
                    isTextArea
                  />
                  <MetaField
                    label="Keywords"
                    value={img.result.keywords}
                    onChange={(val) => handleMetaChange(img.id, "keywords", val)}
                    isTextArea
                  />
                </div>
              )}

              {img.status === "error" && (
                <p className="text-xs text-red-400 bg-red-400/10 p-2 rounded mt-2">
                  ⚠ {img.error}
                </p>
              )}

              {img.status === "pending" && (
                <p className="text-xs italic text-muted mt-2">
                  {img.isPaired 
                    ? "✨ Ready (Using JPG for AI)" 
                    : (img.isEps && !img.epsData)
                      ? "⚙ Extracting EPS preview..."
                      : "Awaiting analysis..."}
                </p>
              )}

              {img.status === "processing" && (
                <p className="text-xs text-primary animate-pulse mt-2">
                  🤖 Generating metadata with Gemini AI...
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Sub-components ---

function StatusBadge({ status }) {
  const map = {
    done: "bg-green-500/20 text-green-400",
    processing: "bg-primary/20 text-primary animate-pulse",
    error: "bg-red-500/20 text-red-500",
    pending: "bg-surface text-muted",
  };
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider shrink-0 ${
        map[status] || map.pending
      }`}
    >
      {status}
    </span>
  );
}

function MetaField({ label, value, onChange, isTextArea }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ marginBottom: '0.65rem' }}>
      <div className="flex justify-between items-center mb-1">
        <span className="meta-label" style={{ marginBottom: 0 }}>{label}</span>
        <button 
          onClick={handleCopy} 
          title={`Copy ${label}`}
          style={{ 
            background: 'transparent', border: 'none', padding: '0.2rem', 
            color: copied ? 'var(--success)' : 'var(--text-3)', 
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem'
          }}
        >
          {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      
      {isTextArea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="meta-value w-full outline-none resize-y"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '0.4rem',
            padding: '0.5rem',
            minHeight: label === 'Keywords' ? '85px' : '60px',
            color: 'var(--text-1)',
            fontFamily: 'inherit',
            transition: 'border-color 0.2s',
            fontSize: '0.85rem'
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
          onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="meta-value w-full outline-none"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '0.4rem',
            padding: '0.4rem 0.5rem',
            color: 'var(--text-1)',
            fontFamily: 'inherit',
            transition: 'border-color 0.2s',
            fontSize: '0.85rem'
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
          onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
      )}
    </div>
  );
}
