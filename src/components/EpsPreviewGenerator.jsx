import { useState, useRef } from "react";
import { Image as ImageIcon, Upload, Loader2, CheckCircle, AlertCircle, Play, Trash2 } from "lucide-react";

export function EpsPreviewGenerator() {
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [addWhiteBg, setAddWhiteBg] = useState(true);
  const fileInputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(f => {
      const ext = f.name.toLowerCase();
      return ext.endsWith('.eps') || ext.endsWith('.png');
    });
    if (dropped.length > 0) {
      addFiles(dropped);
    }
  };

  const onFileChange = (e) => {
    const selected = Array.from(e.target.files).filter(f => {
      const ext = f.name.toLowerCase();
      return ext.endsWith('.eps') || ext.endsWith('.png');
    });
    if (selected.length > 0) {
      addFiles(selected);
    }
  };

  const addFiles = (newFiles) => {
    setFiles(prev => {
      const existingPaths = new Set(prev.map(f => f.path));
      const uniqueFiles = newFiles.filter(f => !existingPaths.has(f.path));
      const fileObjects = uniqueFiles.map(f => ({
        name: f.name,
        path: f.path,
        status: 'idle', // 'idle' | 'processing' | 'success' | 'error'
        errorMsg: ''
      }));
      return [...prev, ...fileObjects];
    });
  };

  const removeFile = (pathToRemove) => {
    setFiles(prev => prev.filter(f => f.path !== pathToRemove));
  };

  const clearAll = () => {
    setFiles([]);
  };

  const generatePreviews = async () => {
    setIsProcessing(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.status === 'success') continue;

      setFiles(prev => prev.map(f => f.path === file.path ? { ...f, status: 'processing' } : f));

      try {
        if (!window.electronAPI?.generateEpsJpg) {
          throw new Error('Electron API not found. Are you running in the desktop app?');
        }

        const result = await window.electronAPI.generateEpsJpg(file.path, addWhiteBg);
        
        if (result.success) {
          setFiles(prev => prev.map(f => f.path === file.path ? { ...f, status: 'success' } : f));
        } else {
          throw new Error(result.error || 'Failed to generate JPG');
        }
      } catch (err) {
        setFiles(prev => prev.map(f => f.path === file.path ? { ...f, status: 'error', errorMsg: err.message } : f));
      }
    }
    setIsProcessing(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%", paddingBottom: "2rem" }}>
      
      <div style={{ padding: "0 0.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0, color: "var(--text-1)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ImageIcon style={{ width: "1.5rem", height: "1.5rem", color: "var(--primary)" }} /> 
          Auto EPS & PNG to JPG Generator
        </h2>
        <p style={{ color: "var(--text-3)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
          Automatically generate extremely high-resolution JPEG previews for your EPS and PNG files. The JPEGs are saved directly alongside your original files, perfect for stock market submissions.
        </p>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="upload-zone"
        onClick={() => fileInputRef.current?.click()}
        style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.7 : 1 }}
      >
        <input ref={fileInputRef} type="file" className="hidden" accept=".eps,.png" multiple onChange={onFileChange} disabled={isProcessing} />
        <div className="flex flex-col items-center">
          <div className="upload-icon-wrap" style={{ background: 'rgba(37,99,235,0.1)' }}>
            <Upload style={{ width: "2rem", height: "2rem", color: "var(--primary)" }} />
          </div>
          <h3 style={{ margin: "0.4rem 0", fontSize: "1.05rem", fontWeight: 700 }}>Drop EPS or PNG files here</h3>
          <p className="text-muted" style={{ fontSize: "0.85rem" }}>
            Or click to browse. Only .eps and .png files are supported.
          </p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="glass card animate-fade-in" style={{ padding: "1.5rem", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0 }}>Selected Files ({files.length})</h3>
              {files.some(f => f.name.toLowerCase().endsWith('.png')) && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-2)' }}>
                  <input 
                    type="checkbox" 
                    checked={addWhiteBg} 
                    onChange={(e) => setAddWhiteBg(e.target.checked)}
                    disabled={isProcessing}
                    style={{ accentColor: 'var(--primary)', width: '0.9rem', height: '0.9rem', cursor: 'pointer' }}
                  />
                  Add white background to PNGs
                </label>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button 
                onClick={clearAll} 
                disabled={isProcessing}
                className="btn-outline" 
                style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem", color: "var(--danger)", borderColor: "rgba(239,68,68,0.2)" }}
              >
                <Trash2 style={{ width: "0.9rem", height: "0.9rem" }} /> Clear All
              </button>
              <button 
                onClick={generatePreviews} 
                disabled={isProcessing || files.every(f => f.status === 'success')}
                className="btn-primary" 
                style={{ padding: "0.4rem 1.2rem", fontSize: "0.8rem" }}
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play style={{ width: "0.9rem", height: "0.9rem" }} />}
                {isProcessing ? "Processing..." : "Generate JPGs"}
              </button>
            </div>
          </div>

          <div style={{ overflowY: "auto", flex: 1, paddingRight: "0.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {files.map((file) => (
                <div 
                  key={file.path} 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "space-between", 
                    padding: "0.75rem 1rem", 
                    background: "var(--surface-2)", 
                    borderRadius: "0.5rem",
                    border: "1px solid var(--glass-border)"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", overflow: "hidden" }}>
                    <ImageIcon style={{ width: "1.2rem", height: "1.2rem", color: "var(--primary-light)", flexShrink: 0 }} />
                    <div style={{ overflow: "hidden" }}>
                      <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {file.name}
                      </p>
                      <p style={{ margin: 0, fontSize: "0.65rem", color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {file.path}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                    {file.status === 'idle' && <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>Ready</span>}
                    {file.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin color-primary" />}
                    {file.status === 'success' && <CheckCircle style={{ width: "1rem", height: "1rem", color: "var(--success)" }} />}
                    {file.status === 'error' && (
                      <div title={file.errorMsg} style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--danger)" }}>
                        <AlertCircle style={{ width: "1rem", height: "1rem" }} />
                        <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Failed</span>
                      </div>
                    )}
                    
                    {!isProcessing && (
                      <button 
                        onClick={() => removeFile(file.path)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "0.25rem", marginLeft: "0.5rem" }}
                        onMouseOver={(e) => e.currentTarget.style.color = 'var(--danger)'}
                        onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-3)'}
                      >
                        <Trash2 style={{ width: "1rem", height: "1rem" }} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
