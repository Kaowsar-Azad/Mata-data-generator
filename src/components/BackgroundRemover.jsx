import { useState, useRef, useEffect } from "react";
import { Upload, Download, Loader2, Trash2, Eraser, Sparkles, KeyRound } from "lucide-react";
import { removeBackgroundViaRemoveBgProxy, removeBackgroundViaLocalServer, getRemoveBgProxyBase } from "../services/removeBgProxy.js";
import { saveKeySecurely, getKeySecurely } from "../services/secureStorage.js";

const STORAGE_REMOVEBG_KEY = "removebg_api_key";
const ACCEPTED = "image/jpeg,image/png,image/webp";

export function BackgroundRemover() {
  const [mode, setMode] = useState("local"); // 'local' | 'api'
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [resultBlob, setResultBlob] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [hfToken, setHfToken] = useState("");
  const fileInputRef = useRef(null);

  // Load keys: Electron secure storage → localStorage fallback
  useEffect(() => {
    const loadKeys = async () => {
      // Try Electron secure storage first for remove.bg
      const fromSecure = await getKeySecurely('removebg');
      if (fromSecure) {
        setApiKey(fromSecure);
      } else {
        const fromLocal = localStorage.getItem(STORAGE_REMOVEBG_KEY);
        if (fromLocal) setApiKey(fromLocal);
      }

      // Try Electron secure storage first for Hugging Face
      const hfSecure = await getKeySecurely('hf');
      if (hfSecure) {
        setHfToken(hfSecure);
      } else {
        const hfLocal = localStorage.getItem("hf_token");
        if (hfLocal) setHfToken(hfLocal);
      }
    };
    loadKeys();
  }, []);

  const persistKey = async (v) => {
    setApiKey(v);
    // Save to both: localStorage for browser, secureStorage for Electron
    localStorage.setItem(STORAGE_REMOVEBG_KEY, v);
    await saveKeySecurely('removebg', v);
  };

  const persistHfToken = async (v) => {
    setHfToken(v);
    // Save to both: localStorage for browser, secureStorage for Electron
    localStorage.setItem("hf_token", v);
    await saveKeySecurely('hf', v);
  };



  const reset = () => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFile(null);
    setResultBlob(null);
    setError(null);
  };

  const setFromFile = (f) => {
    if (!f || !f.type.startsWith("image/")) return;
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFile(f);
    setResultBlob(null);
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

  const runRemove = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setResultBlob(null);

    try {
      if (mode === "local") {
        const blob = await removeBackgroundViaLocalServer(file);
        setResultBlob(blob);
        setResultUrl(URL.createObjectURL(blob));
      } else if (mode === "hf") {
        const trimmed = hfToken.trim();
        if (!trimmed) {
          throw new Error("Hugging Face API Token দিন (নিচের ঘরে)।");
        }
        const blob = await removeBackgroundViaHfSpace(file, trimmed);
        setResultBlob(blob);
        setResultUrl(URL.createObjectURL(blob));
      } else {
        const trimmed = apiKey.trim();
        if (!trimmed) {
          throw new Error("remove.bg API কি দিন (নিচের ঘরে)।");
        }
        const blob = await removeBackgroundViaRemoveBgProxy(file, trimmed);
        setResultBlob(blob);
        setResultUrl(URL.createObjectURL(blob));
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const downloadPng = () => {
    if (!resultBlob) return;
    const base = (file?.name || "image").replace(/\.[^/.]+$/, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(resultBlob);
    a.download = `${base}_nobg.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Eraser style={{ width: "1.25rem", height: "1.25rem", color: "var(--primary)" }} />
          Background Remover
        </h2>
        <p className="text-muted" style={{ fontSize: "0.88rem", maxWidth: "52rem" }}>
          তিনটি মোড: <strong>লোকাল</strong> (সম্পূর্ণ ফ্রি), <strong>Hugging Face AI</strong> (সম্পূর্ণ ফ্রি ও প্রিমিয়াম কোয়ালিটি) এবং <strong>remove.bg API</strong> (সেরা মান)।
        </p>
      </div>

      {/* Mode toggle */}
      <div
        className="glass card"
        style={{ padding: "0.75rem 1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}
      >
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-2)" }}>মোড</span>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setMode("local")}
            className={mode === "local" ? "btn-primary" : "btn-outline"}
            style={{ fontSize: "0.78rem", padding: "0.4rem 0.75rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            <Sparkles style={{ width: "0.85rem", height: "0.85rem" }} />
            লোকাল (ফ্রি & অফলাইন)
          </button>

          <button
            type="button"
            onClick={() => setMode("hf")}
            className={mode === "hf" ? "btn-primary" : "btn-outline"}
            style={{ fontSize: "0.78rem", padding: "0.4rem 0.75rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            <Sparkles style={{ width: "0.85rem", height: "0.85rem", color: "var(--secondary)" }} />
            Hugging Face AI (ফ্রি & প্রিমিয়াম)
          </button>

          <button
            type="button"
            onClick={() => setMode("api")}
            className={mode === "api" ? "btn-primary" : "btn-outline"}
            style={{ fontSize: "0.78rem", padding: "0.4rem 0.75rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            <KeyRound style={{ width: "0.85rem", height: "0.85rem" }} />
            remove.bg API
          </button>
        </div>
        {mode === "hf" && (
          <div style={{ flex: "1 1 220px", minWidth: "200px", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label style={{ fontSize: "0.65rem", color: "var(--primary)", fontWeight: 700 }}>Hugging Face Token</label>
            <input
              type="password"
              value={hfToken}
              onChange={(e) => persistHfToken(e.target.value)}
              placeholder="hf_... টোকেন পেস্ট করুন (সম্পূর্ণ ফ্রি)"
              style={{
                width: "100%",
                padding: "0.45rem 0.55rem",
                fontSize: "0.78rem",
                borderRadius: "0.4rem",
                border: "1px solid var(--glass-border)",
                background: "var(--surface-2)",
                color: "var(--text-1)",
              }}
            />
          </div>
        )}
        {mode === "api" && (
          <div style={{ flex: "1 1 220px", minWidth: "200px", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label style={{ fontSize: "0.65rem", color: "var(--primary)", fontWeight: 700 }}>remove.bg API Key (Gemini key নয়)</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => persistKey(e.target.value)}
              placeholder="remove.bg থেকে key এনে পেস্ট করুন…"
              style={{
                width: "100%",
                padding: "0.45rem 0.55rem",
                fontSize: "0.78rem",
                borderRadius: "0.4rem",
                border: "1px solid var(--glass-border)",
                background: "var(--surface-2)",
                color: "var(--text-1)",
              }}
            />
            <span style={{ fontSize: "0.6rem", color: "var(--text-3)" }}>
              প্রক্সি: <strong>{getRemoveBgProxyBase()}</strong>
            </span>
          </div>
        )}

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
            <div style={{ flex: "1 1 200px" }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", marginBottom: "0.35rem" }}>আসল</p>
              <img src={previewUrl} alt="original" style={{ maxWidth: "100%", borderRadius: "0.5rem", border: "1px solid var(--glass-border)" }} />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", marginBottom: "0.35rem" }}>ফলাফল</p>
              <div
                style={{
                  minHeight: "120px",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--glass-border)",
                  background:
                    "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
                  backgroundSize: "16px 16px",
                  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {resultUrl ? (
                  <img src={resultUrl} alt="removed" style={{ maxWidth: "100%", display: "block" }} />
                ) : (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>প্রসেস করলে এখানে দেখাবে</span>
                )}
              </div>
            </div>
          </div>

          {error && (
            <p
              style={{
                marginTop: "0.75rem",
                fontSize: "0.8rem",
                color: "var(--danger)",
                background: "rgba(239,68,68,0.08)",
                padding: "0.5rem",
                borderRadius: "0.4rem",
              }}
            >
              {error}
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
            <button type="button" className="btn-primary" disabled={loading} onClick={runRemove}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
              {loading ? "প্রসেস হচ্ছে…" : "ব্যাকগ্রাউন্ড সরান"}
            </button>
            <button type="button" className="btn-outline" disabled={!resultBlob} onClick={downloadPng}>
              <Download className="w-4 h-4" /> PNG ডাউনলোড
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

          {mode === "local" && (
            <p style={{ marginTop: "0.65rem", fontSize: "0.68rem", color: "var(--text-3)" }}>
              প্রথম চালানোতে এআই মডেল ডাউনলোড হতে পারে। ডেস্কটপে সম্পূর্ণ অফলাইনে চলবে; ব্রাউজারে চালাতে সার্ভার রানিং আছে কিনা নিশ্চিত করুন।
            </p>
          )}
          {mode === "hf" && (
            <p style={{ marginTop: "0.65rem", fontSize: "0.68rem", color: "var(--text-3)" }}>
              Hugging Face API সম্পূর্ণ ফ্রি এবং এটি BRIA RMBG-1.4 ব্যবহার করে স্টুডিও-কোয়ালিটি ব্যাকগ্রাউন্ড রিমুভাল প্রদান করে। টোকেন পেতে <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>এখানে ক্লিক করুন</a>।
            </p>
          )}
        </div>
      )}
    </div>
  );
}
