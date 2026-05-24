import { useState, useRef } from "react";
import { Upload, Download, Loader2, Trash2, Box, Sparkles, Layers, ExternalLink } from "lucide-react";
import { vectorizeImage } from "../services/vectorService.js";

const ACCEPTED = "image/jpeg,image/png,image/webp";

export function VectorMagic() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [resultBlob, setResultBlob] = useState(null);
  const [resultSvg, setResultSvg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [options, setOptions] = useState({
    color_precision: 6,
    path_precision: 2,
    spline_threshold: 1.0,
    mode: "spline", // spline or polygon
    filter_speckle: 4,
    color_count: 32,
    hierarchical: "stacked", // stacked or cutout
    quality: "high", // high, ultra
    useCloud: true // Default to Cloud for better results
  });
  
  const fileInputRef = useRef(null);

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setResultBlob(null);
    setResultSvg(null);
    setError(null);
  };

  const setFromFile = (f) => {
    if (!f || !f.type.startsWith("image/")) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setFile(f);
    setResultBlob(null);
    setResultSvg(null);
    setError(null);
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) setFromFile(f);
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) setFromFile(f);
  };

  const runVectorize = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResultBlob(null);
    setResultSvg(null);

    try {
      const blob = await vectorizeImage(file, options);
      setResultBlob(blob);
      const text = await blob.text();
      setResultSvg(text);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async (format) => {
    if (!resultBlob || !resultSvg) return;
    const base = (file?.name || "vector").replace(/\.[^/.]+$/, "");
    
    if (format === 'svg') {
      const url = URL.createObjectURL(resultBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else if (format === 'eps') {
      setLoading(true);
      try {
        const response = await fetch('http://localhost:3002/api/convert-to-eps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ svg: resultSvg, filename: base })
        });
        if (!response.ok) throw new Error("EPS কনভার্ট ব্যর্থ হয়েছে। নিশ্চিত করুন Ghostscript ইনস্টল করা আছে।");
        const epsBlob = await response.blob();
        const url = URL.createObjectURL(epsBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${base}_eps10.eps`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Box style={{ width: "1.25rem", height: "1.25rem", color: "var(--primary)" }} />
          Vector Magic
        </h2>
        <p className="text-muted" style={{ fontSize: "0.88rem", maxWidth: "52rem" }}>
          যেকোনো ছবিকে হাই-কোয়ালিটি <strong>SVG ভেক্টর</strong> ফাইলে কনভার্ট করুন। এটি লোগো বা ইলাস্ট্রেশনের জন্য সেরা।
        </p>
      </div>

      <div className="glass card" style={{ padding: "0.75rem 1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-2)" }}>Engine</span>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          <button
            type="button"
            onClick={() => setOptions({...options, useCloud: false})}
            className={!options.useCloud ? "btn-primary" : "btn-outline"}
            style={{ fontSize: "0.75rem", padding: "0.35rem 0.65rem" }}
          >Local (Fast)</button>
          <button
            type="button"
            onClick={() => setOptions({...options, useCloud: true})}
            className={options.useCloud ? "btn-primary" : "btn-outline"}
            style={{ fontSize: "0.75rem", padding: "0.35rem 0.65rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            <Sparkles style={{ width: "0.8rem", height: "0.8rem" }} /> Cloud (Free AI API)
          </button>
        </div>
      </div>

      <div className="glass card" style={{ padding: "1rem" }}>
        <h3 style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <Layers style={{ width: "1rem", height: "1rem", color: "var(--secondary)" }} />
          Vectorization Settings
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: "0.25rem" }}>Color Precision ({options.color_precision || 6})</label>
            <input 
              type="range" min="1" max="8" step="1" value={options.color_precision || 6} 
              onChange={(e) => setOptions({...options, color_precision: parseInt(e.target.value)})}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: "0.25rem" }}>Path Fidelity ({options.path_precision || 6})</label>
            <input 
              type="range" min="1" max="10" step="1" value={options.path_precision || 6} 
              onChange={(e) => setOptions({...options, path_precision: parseInt(e.target.value)})}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: "0.25rem" }}>Quality Preset</label>
            <select 
              value={options.quality} 
              onChange={(e) => setOptions({...options, quality: e.target.value})}
              style={{ width: "100%", padding: "0.3rem", borderRadius: "0.4rem", background: "var(--surface-2)", color: "var(--text-1)", border: "1px solid var(--glass-border)" }}
            >
              <option value="high">High (Balanced)</option>
              <option value="ultra">Ultra (Maximum Detail)</option>
              <option value="clean">Clean (Logo/Icon Style)</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: "0.25rem" }}>Layer Mode</label>
            <select 
              value={options.hierarchical} 
              onChange={(e) => setOptions({...options, hierarchical: e.target.value})}
              style={{ width: "100%", padding: "0.3rem", borderRadius: "0.4rem", background: "var(--surface-2)", color: "var(--text-1)", border: "1px solid var(--glass-border)" }}
            >
              <option value="cutout">Cutout (Better for Logos)</option>
              <option value="stacked">Stacked (Better for Photos)</option>
            </select>
          </div>
        </div>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="upload-zone"
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" className="hidden" accept={ACCEPTED} onChange={onFileChange} />
        <div className="flex flex-col items-center">
          <div className="upload-icon-wrap">
            <Upload style={{ width: "2rem", height: "2rem", color: "var(--primary-light)" }} />
          </div>
          <h3 style={{ margin: "0.4rem 0", fontSize: "1.05rem" }}>ছবি নির্বাচন করুন</h3>
          <p className="text-muted" style={{ fontSize: "0.85rem" }}>
            JPG, PNG, WebP — ক্লিক বা ড্র্যাগ করুন
          </p>
        </div>
      </div>

      {file && previewUrl && (
        <div className="glass card animate-fade-in" style={{ padding: "1rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 250px" }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", marginBottom: "0.35rem" }}>আসল ছবি</p>
              <img src={previewUrl} alt="original" style={{ maxWidth: "100%", borderRadius: "0.5rem", border: "1px solid var(--glass-border)" }} />
            </div>
            <div style={{ flex: "1 1 250px" }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", marginBottom: "0.35rem" }}>ভেক্টর প্রিভিউ (SVG)</p>
              <div
                style={{
                  minHeight: "150px",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--glass-border)",
                  background: "var(--surface-2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  position: "relative"
                }}
              >
                {resultSvg ? (
                  <div 
                    dangerouslySetInnerHTML={{ __html: resultSvg }} 
                    style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                  />
                ) : (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>প্রসেস করলে এখানে ভেক্টর দেখাবে</span>
                )}
                {loading && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
                    <Loader2 className="w-8 h-8 animate-spin color-primary" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <p style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--danger)", background: "rgba(239,68,68,0.08)", padding: "0.5rem", borderRadius: "0.4rem" }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
            <button type="button" className="btn-primary" disabled={loading} onClick={runVectorize}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? "ভেক্টর হচ্ছে…" : "ভেক্টর করুন"}
            </button>
            <button type="button" className="btn-outline" disabled={!resultBlob || loading} onClick={() => downloadFile('svg')}>
              <Download className="w-4 h-4" /> SVG
            </button>
            <button type="button" className="btn-outline" style={{ background: 'var(--primary)', color: '#fff' }} disabled={!resultBlob || loading} onClick={() => downloadFile('eps')}>
              <Download className="w-4 h-4" /> EPS 10 (Vector)
            </button>
            <button
              type="button"
              className="btn-outline"
              style={{ color: "var(--danger)", borderColor: "rgba(239,68,68,0.25)" }}
              disabled={loading}
              onClick={reset}
            >
              <Trash2 className="w-4 h-4" /> মুছুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
