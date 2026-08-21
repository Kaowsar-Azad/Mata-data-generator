import React, { useState, useRef, useEffect } from "react";
import { 
  Upload, 
  Download,
  Folder, 
  X, 
  Loader2, 
  Image as ImageIcon, 
  AlertCircle, 
  RefreshCw, 
  Sparkles, 
  Settings, 
  Zap, 
  CheckCircle2, 
  ChevronRight, 
  ArrowRight,
  Plus,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MockFile {
  path: string;
  name: string;
  type: string;
  isElectron: boolean;
}

type UpscaleFile = File | MockFile;

interface ResultItem {
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  fileObj?: UpscaleFile;
  path?: string;
  engine?: string;
  error?: string | null;
}

export function ImageUpscaler() {
  const [selectedFiles, setSelectedFiles] = useState<UpscaleFile[]>([]);
  const [outputFolder, setOutputFolder] = useState<string>("");
  const [scale, setScale] = useState<number>(2);
  const [isCustomScale, setIsCustomScale] = useState<boolean>(false);
  const [customScaleValue, setCustomScaleValue] = useState<number>(6);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [localModel, setLocalModel] = useState<string>("mata_ai");
  const [outputFormat, setOutputFormat] = useState<string>("jpg");
  const [currentFileProgress, setCurrentFileProgress] = useState<number>(0);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [fileDimensions, setFileDimensions] = useState<Record<string, { width: number; height: number; size?: string }>>({});
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});

  const upscaleMethod = "localNcnn";
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    selectedFiles.forEach(f => {
      const key = 'path' in f ? (f as MockFile).path : f.name;
      if (!fileDimensions[key]) {
        let src = '';
        if ('isElectron' in f && f.isElectron) {
          src = (f as MockFile).path.startsWith('http') || (f as MockFile).path.startsWith('data:')
            ? (f as MockFile).path
            : 'file:///' + (f as MockFile).path.replace(/\\/g, '/');
        } else {
          src = URL.createObjectURL(f as File);
        }

        setFilePreviews(prev => ({ ...prev, [key]: src }));

        const img = new Image();
        img.onload = () => {
          let sizeStr = '';
          if ('size' in f && typeof (f as File).size === 'number') {
            const sz = (f as File).size;
            sizeStr = sz > 1024 * 1024 ? `${(sz / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(sz / 1024)} KB`;
          }
          setFileDimensions(prev => ({
            ...prev,
            [key]: { width: img.naturalWidth, height: img.naturalHeight, size: sizeStr }
          }));
        };
        img.onerror = () => {
          setFileDimensions(prev => ({
            ...prev,
            [key]: { width: 0, height: 0 }
          }));
        };
        img.src = src;
      }
    });
  }, [selectedFiles]);

  useEffect(() => {
    if (window.electronAPI && typeof window.electronAPI.onUpscaleProgress === 'function') {
      const cleanup = window.electronAPI.onUpscaleProgress((data: { progress: number }) => {
        setCurrentFileProgress(data.progress);
        if (selectedFiles.length > 0) {
          setProgress(() => {
            const currentOverall = Math.round((completedCount / selectedFiles.length) * 100 + (data.progress / selectedFiles.length));
            return Math.min(99, currentOverall);
          });
          if (activeIndex >= 0 && activeIndex < selectedFiles.length) {
            const fileObj = selectedFiles[activeIndex];
            setStatusText(`Processing ${fileObj.name} (${activeIndex + 1}/${selectedFiles.length}) - ${Math.round(data.progress)}%...`);
          }
        }
      });
      if (typeof cleanup === 'function') {
        return cleanup;
      }
    }
  }, [completedCount, selectedFiles.length, activeIndex]);

  const handleSelectFilesClick = async () => {
    if (window.electronAPI?.selectFiles) {
      const filePaths = await window.electronAPI.selectFiles({
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
      });
      
      if (filePaths && filePaths.length > 0) {
        const newFiles: MockFile[] = filePaths.map((path: string) => {
          const name = path.split('\\').pop()?.split('/').pop() || 'image';
          return {
            path: path,
            name: name,
            type: 'image/' + (name.toLowerCase().endsWith('png') ? 'png' : 'jpeg'),
            isElectron: true
          };
        });
        
        setSelectedFiles(prev => {
          const existingPaths = prev.map(f => ('path' in f ? (f as MockFile).path : f.name));
          const filtered = newFiles.filter(f => !existingPaths.includes(f.path));
          return [...prev, ...filtered];
        });
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleWebFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => {
      const existingNames = prev.map(f => f.name);
      const newFiles = files.filter(f => !existingNames.includes(f.name));
      return [...prev, ...newFiles];
    });
  };

  const handleSelectFolder = async () => {
    if (window.electronAPI?.selectFolder) {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) setOutputFolder(folderPath);
    } else {
      alert("Folder selection is only available in the Desktop App.");
    }
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const upscaleSingleFile = async (fileObj: UpscaleFile, currentScale: number) => {
    if (upscaleMethod === 'localNcnn' && window.electronAPI) {
      setStatusText(`Upscaling ${fileObj.name} with Local GPU (NCNN)...`);
      
      if (!('isElectron' in fileObj) || !fileObj.isElectron) {
        throw new Error("Local GPU upscaling only supports local files. Please select a file from your computer using the Electron app.");
      }
      
      let modelToUse = localModel;
      if (localModel === 'mata_ai') {
        const hasFace = /person|portrait|face|human|man|woman|girl|boy|people|model|headshot|selfie/i.test(fileObj.name || '');
        if (hasFace) modelToUse = 'mata_ai_face';
      }
      
      const pathArg = (fileObj as MockFile).path;
      const resData = await window.electronAPI.upscaleLocalNcnn(pathArg, currentScale, modelToUse, outputFormat, outputFolder);
      if (!resData.success) {
        throw new Error(resData.error || "Local GPU upscaling failed");
      }
      
      if (outputFolder) {
        return { success: true, path: resData.path, engine: 'localNcnn' };
      } else {
        const url = `data:image/${resData.format || 'jpeg'};base64,${resData.base64}`;
        const a = document.createElement('a');
        a.href = url;
        const lastDot = fileObj.name.lastIndexOf('.');
        const ext = `.${resData.format || 'jpg'}`;
        const baseName = lastDot > -1 ? fileObj.name.substring(0, lastDot) : fileObj.name;
        a.download = `${baseName}_${currentScale}x_LocalGPU${ext}`;
        a.click();
        return { success: true, engine: 'localNcnn' };
      }
    }

    throw new Error("No upscaler method available. Please use Local GPU mode.");
  };

  const startUpscaling = async () => {
    if (selectedFiles.length === 0) return;

    if (!outputFolder && window.electronAPI) {
      setError("Please select an output folder first.");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setCompletedCount(0);
    setCurrentFileProgress(0);
    setActiveIndex(-1);
    setError(null);
    
    const initialResults: ResultItem[] = selectedFiles.map(f => ({
      name: f.name,
      status: 'pending',
      fileObj: f
    }));
    setResults(initialResults);

    let completed = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
      const fileObj = selectedFiles[i];
      setStatusText(`Processing ${fileObj.name} (${i + 1}/${selectedFiles.length})...`);
      setActiveIndex(i);
      setCurrentFileProgress(0);
      
      setResults(prev => {
        const updated = [...prev];
        updated[i] = { ...updated[i], status: 'processing' };
        return updated;
      });

      try {
        const resData = await upscaleSingleFile(fileObj, scale);
        
        setResults(prev => {
          const updated = [...prev];
          updated[i] = { ...updated[i], status: 'success', path: resData.path, engine: resData.engine };
          return updated;
        });
      } catch (err: any) {
        setResults(prev => {
          const updated = [...prev];
          updated[i] = { ...updated[i], status: 'error', error: err.message || "Failed" };
          return updated;
        });
      }

      completed++;
      setCompletedCount(completed);
      setProgress(Math.round((completed / selectedFiles.length) * 100));
    }

    setStatusText("Upscaling complete!");
    setIsProcessing(false);
    setActiveIndex(-1);
  };

  const retryUpscale = async (index: number) => {
    const resultItem = results[index];
    if (!resultItem || resultItem.status !== 'error') return;

    setIsProcessing(true);
    setStatusText(`Retrying ${resultItem.name}...`);
    setCurrentFileProgress(0);
    setActiveIndex(index);
    setCompletedCount(0);
    
    setResults(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status: 'processing', error: null };
      return updated;
    });

    try {
      const fileObj = selectedFiles.find(f => f.name === resultItem.name) || resultItem.fileObj;
      if (!fileObj) {
        throw new Error("Original file reference not found.");
      }

      const resData = await upscaleSingleFile(fileObj, scale);
      
      setResults(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status: 'success', path: resData.path, engine: resData.engine };
        return updated;
      });
      setStatusText("Retry complete!");
    } catch (err: any) {
      setResults(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status: 'error', error: err.message || "Failed" };
        return updated;
      });
      setStatusText("Retry failed.");
    } finally {
      setIsProcessing(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: '100%',
      height: '100%',
      boxSizing: 'border-box',
      padding: '1.25rem 1.25rem',
      overflowY: 'auto',
      overflowX: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem'
    }}>
      <style>{`
        .upscaler-grid {
          display: grid;
          grid-template-columns: 290px 1fr;
          gap: 1.25rem;
          align-items: start;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        @media (max-width: 880px) {
          .upscaler-grid {
            grid-template-columns: 1fr;
          }
        }
        .custom-file-list::-webkit-scrollbar {
          width: 6px;
        }
        .custom-file-list::-webkit-scrollbar-thumb {
          background: rgba(150, 150, 150, 0.2);
          border-radius: 4px;
        }
      `}</style>

      <div className="upscaler-grid">
        
        {/* Left Column: Settings Panel (Visually on Left) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', order: 1 }}>
          <div style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--glass-border)',
            borderRadius: '1.15rem',
            padding: '1.15rem',
            boxShadow: 'var(--glass-shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.15rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.65rem' }}>
              <Settings style={{ width: '1.05rem', height: '1.05rem', color: 'var(--primary)' }} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: 'var(--text-1)' }}>Upscale Settings</h3>
            </div>
            
            {/* Local AI Model */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.4rem' }}>Local AI Model</label>
              <div style={{ position: 'relative' }}>
                <select
                  value={localModel}
                  disabled={isProcessing}
                  onChange={(e) => setLocalModel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 2rem 0.55rem 0.75rem',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '0.6rem',
                    color: 'var(--text-1)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    outline: 'none',
                    appearance: 'none',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e: any) => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                  onBlur={(e: any) => { e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
                >
                  <option value="mata_ai">✨ Mata AI (Smart Hybrid Auto-Detect)</option>
                  <option value="realesrgan-x4plus">📸 General Photo (RealESRGAN Default)</option>
                  <option value="remacri">📸 Photo Alternative (Remacri)</option>
                  <option value="ultrasharp">✨ Ultrasharp (Aggressive detail)</option>
                  <option value="ultramix_balanced">⚖️ Ultramix Balanced (Smooth & sharp)</option>
                  <option value="realesr-animevideov3">⚡ Fast (Intel / Low-end GPU)</option>
                  <option value="realesrgan-x4plus-anime">🎨 Anime / Vector Art</option>
                </select>
                <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                   <ChevronRight style={{ width: '0.9rem', height: '0.9rem', color: 'var(--text-3)', transform: 'rotate(90deg)' }} />
                </div>
              </div>
            </div>

            {/* Output Format */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.4rem' }}>Output Format</label>
              <div style={{ position: 'relative' }}>
                <select
                  value={outputFormat}
                  disabled={isProcessing}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 2rem 0.55rem 0.75rem',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '0.6rem',
                    color: 'var(--text-1)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    outline: 'none',
                    appearance: 'none',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e: any) => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                  onBlur={(e: any) => { e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
                >
                  <option value="jpg">🖼️ JPG / JPEG (Smaller size)</option>
                  <option value="png">🖼️ PNG (Lossless quality)</option>
                </select>
                <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                   <ChevronRight style={{ width: '0.9rem', height: '0.9rem', color: 'var(--text-3)', transform: 'rotate(90deg)' }} />
                </div>
              </div>
            </div>
            
            {/* Upscale Factor */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)' }}>Upscale Factor</label>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary)', background: 'var(--primary-glow)', padding: '0.15rem 0.45rem', borderRadius: '1rem', border: '1px solid rgba(37,99,235,0.15)' }}>
                  {isCustomScale ? `${customScaleValue}x` : `${scale}x Target`}
                </span>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr 1.2fr', 
                gap: '0.3rem', 
                background: 'var(--surface-2)', 
                padding: '0.25rem', 
                borderRadius: '0.65rem',
                border: '1px solid var(--glass-border)'
              }}>
                {[2, 4].map(val => {
                  const isActive = !isCustomScale && scale === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => { setScale(val); setIsCustomScale(false); }}
                      disabled={isProcessing}
                      style={{
                        padding: '0.45rem 0.5rem',
                        background: isActive ? 'linear-gradient(135deg, var(--primary), #3b82f6)' : 'transparent',
                        color: isActive ? '#ffffff' : 'var(--text-2)',
                        border: 'none',
                        borderRadius: '0.45rem',
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: isActive ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {val}x
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => { setIsCustomScale(true); setScale(customScaleValue); }}
                  disabled={isProcessing}
                  style={{
                    padding: '0.45rem 0.5rem',
                    background: isCustomScale ? 'linear-gradient(135deg, var(--primary), #3b82f6)' : 'transparent',
                    color: isCustomScale ? '#ffffff' : 'var(--text-2)',
                    border: 'none',
                    borderRadius: '0.45rem',
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isCustomScale ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Custom
                </button>
              </div>

              {isCustomScale && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.65rem', 
                  marginTop: '0.65rem',
                  background: 'var(--surface-2)',
                  padding: '0.4rem 0.65rem',
                  borderRadius: '0.55rem',
                  border: '1px solid var(--glass-border)'
                }}>
                  <input
                    type="range"
                    min="2"
                    max="10"
                    value={customScaleValue}
                    disabled={isProcessing}
                    onChange={(e) => {
                      const val = Math.max(2, Math.min(10, parseInt(e.target.value) || 2));
                      setCustomScaleValue(val);
                      setScale(val);
                    }}
                    style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <span style={{ 
                    fontSize: '0.8rem', 
                    color: 'var(--primary)', 
                    fontWeight: 800, 
                    minWidth: '2.2rem', 
                    textAlign: 'center', 
                    background: 'var(--primary-glow)', 
                    padding: '0.15rem 0.35rem', 
                    borderRadius: '0.35rem',
                    border: '1px solid rgba(37,99,235,0.2)'
                  }}>
                    {customScaleValue}x
                  </span>
                </div>
              )}
              <p style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: '0.45rem', lineHeight: 1.35, fontWeight: 500, margin: '0.45rem 0 0 0' }}>
                💡 2x is optimal for photo clarity. 4x or higher is best for low-res images.
              </p>
            </div>

            {/* Output Folder */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.4rem' }}>Output Folder</label>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={outputFolder || "Save to Downloads..."} 
                  readOnly 
                  style={{
                    flex: 1,
                    padding: '0.55rem 0.75rem',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '0.6rem',
                    color: outputFolder ? 'var(--text-1)' : 'var(--text-3)',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={handleSelectFolder}
                  disabled={isProcessing}
                  style={{
                    background: 'var(--primary-glow)',
                    border: '1px solid rgba(37,99,235,0.2)',
                    color: 'var(--primary)',
                    padding: '0.55rem 0.7rem',
                    borderRadius: '0.6rem',
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  title="Choose output folder"
                >
                  <Folder style={{ width: '1.05rem', height: '1.05rem' }} />
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem 1rem', borderRadius: '0.85rem', color: 'var(--danger)', fontSize: '0.78rem', display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 600 }}
              >
                <AlertCircle style={{ width: '1.05rem', height: '1.05rem', flexShrink: 0 }} />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Button */}
          <button
            type="button"
            onClick={startUpscaling}
            disabled={isProcessing || selectedFiles.length === 0}
            style={{
              width: '100%',
              padding: '0.85rem',
              background: 'linear-gradient(135deg, var(--primary), #3b82f6)',
              color: '#fff',
              border: 'none',
              borderRadius: '0.85rem',
              fontWeight: 800,
              fontSize: '0.92rem',
              cursor: (isProcessing || selectedFiles.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (isProcessing || selectedFiles.length === 0) ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: (isProcessing || selectedFiles.length === 0) ? 'none' : '0 6px 20px rgba(37,99,235,0.3)',
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.2s ease'
            }}
          >
            {isProcessing ? (
              <>
                <Loader2 className="spin" style={{ width: '1.1rem', height: '1.1rem' }} /> 
                <span>{progress}% Processing</span>
                <div style={{ position: 'absolute', bottom: 0, left: 0, height: '3.5px', background: 'rgba(255,255,255,0.6)', width: `${progress}%`, transition: 'width 0.3s ease' }} />
              </>
            ) : (
              <><Zap style={{ width: '1.1rem', height: '1.1rem' }} /> Start Upscaling {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}</>
            )}
          </button>
          
          {isProcessing && (
            <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 600 }}>
              {statusText}
            </div>
          )}
        </div>

        {/* Right Column: File Selection & Selected Files List (Visually on Right) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', order: 2, minWidth: 0 }}>
          
          {/* Dropzone: Only shown when no files selected */}
          {selectedFiles.length === 0 ? (
            <div 
              onClick={handleSelectFilesClick}
              style={{
                background: 'linear-gradient(145deg, var(--surface-1), var(--surface-2))',
                border: '2px dashed rgba(37, 99, 235, 0.3)',
                borderRadius: '1.15rem',
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.85rem',
                minHeight: '260px',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                position: 'relative',
                boxShadow: '0 8px 24px rgba(0,0,0,0.02)',
                opacity: isProcessing ? 0.7 : 1,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e: any) => {
                if(!isProcessing) {
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.background = 'var(--primary-glow)';
                }
              }}
              onMouseLeave={(e: any) => {
                if(!isProcessing) {
                  e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.3)';
                  e.currentTarget.style.background = 'linear-gradient(145deg, var(--surface-1), var(--surface-2))';
                }
              }}
            >
              <div style={{ 
                width: '4rem', height: '4rem', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(37,99,235,0.04))', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 6px 18px rgba(37,99,235,0.12)',
                border: '1px solid rgba(37,99,235,0.15)'
              }}>
                <Upload style={{ width: '1.75rem', height: '1.75rem', color: 'var(--primary)' }} />
              </div>
              
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-1)', margin: '0 0 0.3rem 0', letterSpacing: '-0.01em' }}>Select Images to Upscale</h3>
                <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', margin: 0, fontWeight: 500 }}>Drag and drop or click to browse</p>
                <div style={{ display: 'inline-block', marginTop: '0.5rem', background: 'var(--surface-3)', padding: '0.25rem 0.65rem', borderRadius: '1rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-2)', border: '1px solid var(--glass-border)' }}>
                  JPG, PNG, WEBP
                </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleWebFileInput} 
                multiple 
                accept="image/jpeg,image/png,image/webp" 
                style={{ display: 'none' }} 
              />
            </div>
          ) : (
            /* Selected Files Container: Replaces dropzone entirely when files are selected */
            <div 
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--glass-border)',
                borderRadius: '1.15rem',
                overflow: 'hidden',
                boxShadow: 'var(--glass-shadow)',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Header */}
              <div style={{ 
                padding: '0.85rem 1.15rem', 
                background: 'var(--surface-2)', 
                borderBottom: '1px solid var(--glass-border)', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <div style={{
                    width: '2rem', height: '2rem', borderRadius: '0.5rem',
                    background: 'var(--primary-glow)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(37,99,235,0.2)'
                  }}>
                    <ImageIcon style={{ width: '1.05rem', height: '1.05rem', color: 'var(--primary)' }} />
                  </div>
                  
                  <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-1)' }}>
                    Selected Files
                  </span>

                  {/* 1. Selected Count Badge */}
                  <span style={{ 
                    color: '#06b6d4', 
                    background: 'rgba(6, 182, 212, 0.08)', 
                    border: '1px solid rgba(6, 182, 212, 0.3)', 
                    padding: '3px 9px', 
                    borderRadius: '6px', 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    fontSize: '0.75rem', 
                    fontWeight: 700 
                  }}>
                    <Download style={{ width: '0.8rem', height: '0.8rem' }} /> {selectedFiles.length} Selected
                  </span>

                  {/* 2. Upscale Done Counter Badge */}
                  <span style={{ 
                    color: results.filter(r => r.status === 'success').length > 0 ? '#10b981' : '#3b82f6', 
                    background: results.filter(r => r.status === 'success').length > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.08)', 
                    border: results.filter(r => r.status === 'success').length > 0 ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(59, 130, 246, 0.3)', 
                    padding: '3px 9px', 
                    borderRadius: '6px', 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    fontSize: '0.75rem', 
                    fontWeight: 700,
                    transition: 'all 0.2s ease'
                  }}>
                    <CheckCircle2 style={{ width: '0.8rem', height: '0.8rem' }} /> Upscale Done ({results.filter(r => r.status === 'success').length})
                  </span>
                </div>

                {!isProcessing && (
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <button 
                      type="button"
                      onClick={handleSelectFilesClick}
                      style={{ 
                        background: 'var(--primary-glow)', 
                        border: '1px solid rgba(37,99,235,0.25)', 
                        color: 'var(--primary)', 
                        fontSize: '0.78rem', 
                        cursor: 'pointer', 
                        fontWeight: 700, 
                        padding: '0.35rem 0.75rem', 
                        borderRadius: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Plus style={{ width: '0.85rem', height: '0.85rem' }} /> Add Images
                    </button>
                    <button 
                      type="button"
                      onClick={() => setSelectedFiles([])}
                      style={{ 
                        background: 'rgba(239,68,68,0.08)', 
                        border: '1px solid rgba(239,68,68,0.2)', 
                        color: 'var(--danger)', 
                        fontSize: '0.78rem', 
                        cursor: 'pointer', 
                        fontWeight: 700, 
                        padding: '0.35rem 0.75rem', 
                        borderRadius: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e: any) => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                      onMouseLeave={(e: any) => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                    >
                      <Trash2 style={{ width: '0.85rem', height: '0.85rem' }} /> Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Rows List */}
              <div 
                className="custom-file-list"
                style={{ 
                  maxHeight: '440px', 
                  overflowY: 'auto', 
                  overflowX: 'hidden',
                  padding: '0.75rem', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.55rem' 
                }}
              >
                {selectedFiles.map((f, i) => {
                  const key = 'path' in f ? (f as MockFile).path : f.name;
                  const dims = fileDimensions[key];
                  const preview = filePreviews[key];
                  const origW = dims?.width || 0;
                  const origH = dims?.height || 0;
                  const targetW = origW ? origW * scale : 0;
                  const targetH = origH ? origH * scale : 0;
                  const isCurrent = activeIndex === i;
                  const result = results[i];

                  return (
                    <div 
                      key={f.name + i}
                      style={{ 
                        position: 'relative',
                        borderRadius: '0.75rem',
                        background: isCurrent 
                          ? 'var(--primary-glow)' 
                          : (result?.status === 'success' 
                              ? 'rgba(34,197,94,0.04)' 
                              : (result?.status === 'error' ? 'rgba(239,68,68,0.04)' : 'var(--surface-2)')),
                        border: isCurrent 
                          ? '1.5px solid var(--primary)' 
                          : (result?.status === 'success' 
                              ? '1px solid rgba(34,197,94,0.3)' 
                              : (result?.status === 'error' ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--glass-border)')),
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        padding: '0.6rem 0.85rem',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem'
                      }}>
                        {/* Left: Thumbnail & Name */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: '1 1 150px', minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ 
                            width: '2.5rem', 
                            height: '2.5rem', 
                            borderRadius: '0.45rem', 
                            overflow: 'hidden', 
                            flexShrink: 0,
                            background: 'var(--surface-3)', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            border: '1px solid var(--glass-border)'
                          }}>
                            {preview ? (
                              <img src={preview} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <ImageIcon style={{ width: '1.2rem', height: '1.2rem', color: 'var(--primary)' }} />
                            )}
                          </div>

                          <div style={{ overflow: 'hidden', minWidth: 0 }}>
                            <span style={{ 
                              fontSize: '0.82rem', 
                              fontWeight: 700, 
                              color: 'var(--text-1)', 
                              display: 'block', 
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis' 
                            }}>
                              {f.name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.1rem' }}>
                              <span style={{ 
                                fontSize: '0.62rem', 
                                fontWeight: 700, 
                                background: 'var(--surface-3)', 
                                padding: '0.08rem 0.35rem', 
                                borderRadius: '0.25rem', 
                                color: 'var(--text-2)',
                                textTransform: 'uppercase'
                              }}>
                                {f.name.split('.').pop() || 'IMG'}
                              </span>
                              {dims?.size && (
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 500 }}>
                                  {dims.size}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Center: Sleek Resolution Pipeline Capsule */}
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          flex: '1 1 auto'
                        }}>
                          {origW > 0 ? (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              background: 'var(--surface-1)',
                              border: '1px solid var(--glass-border)',
                              borderRadius: '0.6rem',
                              padding: '0.2rem 0.4rem',
                              gap: '0.45rem',
                              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                            }}>
                              <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-2)', padding: '0.1rem 0.35rem' }}>
                                {origW} × {origH}
                              </span>
                              
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                background: 'linear-gradient(135deg, var(--primary), #3b82f6)',
                                color: '#fff',
                                padding: '0.12rem 0.4rem',
                                borderRadius: '0.4rem',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
                              }}>
                                <span>{scale}X</span>
                                <ArrowRight style={{ width: '0.7rem', height: '0.7rem' }} />
                              </div>

                              <span style={{ 
                                fontSize: '0.78rem', 
                                fontWeight: 800, 
                                color: 'var(--primary)',
                                background: 'var(--primary-glow)',
                                padding: '0.1rem 0.45rem',
                                borderRadius: '0.4rem',
                                border: '1px solid rgba(37,99,235,0.15)'
                              }}>
                                {targetW} × {targetH} px
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 500 }}>
                              Detecting resolution...
                            </span>
                          )}
                        </div>

                        {/* Right: Status & Remove Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          {isCurrent ? (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              color: 'var(--primary)', 
                              fontWeight: 800, 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.3rem',
                              background: 'var(--surface-1)',
                              padding: '0.25rem 0.55rem',
                              borderRadius: '0.4rem',
                              border: '1px solid var(--primary)'
                            }}>
                              <Loader2 className="spin" style={{ width: '0.75rem', height: '0.75rem' }} /> 
                              {Math.round(currentFileProgress)}%
                            </span>
                          ) : result?.status === 'success' ? (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              color: '#10b981', 
                              fontWeight: 800, 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.25rem',
                              background: 'rgba(34,197,94,0.1)',
                              padding: '0.25rem 0.55rem',
                              borderRadius: '0.4rem'
                            }}>
                              <CheckCircle2 style={{ width: '0.8rem', height: '0.8rem' }} /> Done
                            </span>
                          ) : result?.status === 'error' ? (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              color: 'var(--danger)', 
                              fontWeight: 800, 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.25rem',
                              background: 'rgba(239,68,68,0.1)',
                              padding: '0.25rem 0.55rem',
                              borderRadius: '0.4rem'
                            }}>
                              <AlertCircle style={{ width: '0.8rem', height: '0.8rem' }} /> Error
                            </span>
                          ) : null}

                          {!isProcessing && (
                            <button 
                              type="button"
                              onClick={(e: any) => { e.stopPropagation(); removeFile(i); }}
                              style={{ 
                                background: 'var(--surface-1)', 
                                border: '1px solid var(--glass-border)', 
                                color: 'var(--text-3)', 
                                cursor: 'pointer', 
                                display: 'flex', 
                                padding: '0.32rem', 
                                borderRadius: '0.45rem',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e: any) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--danger)'; }}
                              onMouseLeave={(e: any) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
                              title="Remove image"
                            >
                              <X style={{ width: '0.8rem', height: '0.8rem' }} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Progress bar per item during processing */}
                      {isCurrent && (
                        <div style={{ 
                          width: '100%', 
                          height: '3px', 
                          background: 'rgba(37,99,235,0.15)', 
                          borderRadius: '2px', 
                          marginTop: '0.45rem',
                          overflow: 'hidden'
                        }}>
                          <div style={{ 
                            width: `${currentFileProgress}%`, 
                            height: '100%', 
                            background: 'var(--primary)',
                            borderRadius: '2px',
                            transition: 'width 0.2s ease'
                          }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleWebFileInput} 
                multiple 
                accept="image/jpeg,image/png,image/webp" 
                style={{ display: 'none' }} 
              />
            </div>
          )}

        </div>
      </div>

      {/* Results Log */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 15 }}
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--glass-border)',
              borderRadius: '1.15rem',
              padding: '1.15rem',
              boxShadow: 'var(--glass-shadow)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: 'var(--text-1)' }}>Processing Log</h3>
              {!isProcessing && (
                <button 
                  type="button"
                  onClick={() => setResults([])}
                  style={{ 
                    background: 'rgba(239,68,68,0.08)', 
                    border: '1px solid rgba(239,68,68,0.2)', 
                    color: 'var(--danger)', 
                    fontSize: '0.75rem', 
                    cursor: 'pointer', 
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.35rem 0.65rem',
                    borderRadius: '0.45rem',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Trash2 style={{ width: '0.8rem', height: '0.8rem' }} /> Clear Logs
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {results.map((res, i) => (
                <div 
                  key={res.name + i}
                  style={{
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem', 
                    borderRadius: '0.55rem',
                    background: res.status === 'success' ? 'rgba(34,197,94,0.05)' : (res.status === 'error' ? 'rgba(239,68,68,0.05)' : 'var(--surface-2)'),
                    border: `1px solid ${res.status === 'success' ? 'rgba(34,197,94,0.25)' : (res.status === 'error' ? 'rgba(239,68,68,0.25)' : 'var(--glass-border)')}`,
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: '0.15rem' }}>{res.name}</span>
                    {res.status === 'success' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <CheckCircle2 style={{ width: '0.8rem', height: '0.8rem' }} /> Upscaled Successfully
                        </span>
                        {res.path && <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 500 }}>Saved to: {res.path}</span>}
                      </div>
                    ) : res.status === 'error' ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginTop: '0.2rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 500 }}>Error: {res.error}</span>
                        {!isProcessing && (
                          <button
                            type="button"
                            onClick={() => retryUpscale(i)}
                            style={{
                              background: 'var(--primary)',
                              color: '#fff',
                              border: 'none',
                              padding: '0.3rem 0.6rem',
                              borderRadius: '0.45rem',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              boxShadow: '0 2px 6px rgba(37,99,235,0.2)'
                            }}
                          >
                            <RefreshCw style={{ width: '0.75rem', height: '0.75rem' }} />
                            Retry
                          </button>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                        {res.status === 'processing' ? (
                          <><Loader2 className="spin" style={{ width: '0.75rem', height: '0.75rem', color: 'var(--primary)' }} /> Processing {activeIndex === i && currentFileProgress > 0 ? `(${Math.round(currentFileProgress)}%)` : ''}...</>
                        ) : (
                          <>Pending...</>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
