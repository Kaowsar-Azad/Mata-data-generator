import React, { useState, useRef, useEffect } from "react";
import { Image as ImageIcon, Upload, Loader2, CheckCircle, AlertCircle, Play, Trash2, Folder, RotateCcw, Square, ChevronDown } from "lucide-react";
import { processEpsFile, isEpsFile } from "../services/epsService";

interface EpsFileState {
  name: string;
  path: string;
  file: File;
  previewUrl: string | null;
  isProcessingPreview: boolean;
  status: 'idle' | 'processing' | 'success' | 'error';
  errorMsg: string | null;
}

export function EpsPreviewGenerator() {
  const [files, setFiles] = useState<EpsFileState[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [addWhiteBg, setAddWhiteBg] = useState<boolean>(true);
  const [outputExt, setOutputExt] = useState<string>('.jpg');
  const [outputFolder, setOutputFolder] = useState<string | null>(null);
  const [isFormatOpen, setIsFormatOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(f => {
      const ext = f.name.toLowerCase();
      return ext.endsWith('.eps') || ext.endsWith('.png') || ext.endsWith('.heic') || ext.endsWith('.heif');
    });
    if (dropped.length > 0) {
      addFiles(dropped);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files).filter(f => {
      const ext = f.name.toLowerCase();
      return ext.endsWith('.eps') || ext.endsWith('.png') || ext.endsWith('.heic') || ext.endsWith('.heif');
    });
    if (selected.length > 0) {
      addFiles(selected);
    }
  };

  const addFiles = (newFiles: File[]) => {
    setFiles(prev => {
      const existingPaths = new Set(prev.map(f => f.path));
      const uniqueFiles = newFiles.filter(f => !existingPaths.has((f as any).path));
      const fileObjects: EpsFileState[] = uniqueFiles.map(f => {
        const isPng = f.name.toLowerCase().endsWith('.png');
        return {
          name: f.name,
          path: (f as any).path,
          file: f,
          previewUrl: isPng ? URL.createObjectURL(f) : null,
          isProcessingPreview: false,
          status: 'idle',
          errorMsg: null
        };
      });
      return [...prev, ...fileObjects];
    });
  };

  const removeFile = (pathToRemove: string) => {
    const fileToRemove = files.find(f => f.path === pathToRemove);
    if (fileToRemove?.previewUrl && fileToRemove.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(fileToRemove.previewUrl);
    }
    setFiles(prev => prev.filter(f => f.path !== pathToRemove));
  };

  const clearAll = () => {
    files.forEach(f => {
      if (f.previewUrl && f.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(f.previewUrl);
      }
    });
    setFiles([]);
  };

  useEffect(() => {
    const processPreviews = async () => {
      const epsFilesWithoutPreview = files.filter(
        f => isEpsFile(f.file) && !f.previewUrl && !f.isProcessingPreview
      );
      if (epsFilesWithoutPreview.length === 0) return;

      setFiles(prev =>
        prev.map(f =>
          epsFilesWithoutPreview.some(ep => ep.path === f.path)
            ? { ...f, isProcessingPreview: true }
            : f
        )
      );

      for (const f of epsFilesWithoutPreview) {
        try {
          const epsData = await processEpsFile(f.file);
          if (epsData && epsData.dataUrl) {
            setFiles(prev =>
              prev.map(p =>
                p.path === f.path ? { ...p, previewUrl: epsData.dataUrl, isProcessingPreview: false } : p
              )
            );
          } else {
            setFiles(prev =>
              prev.map(p =>
                p.path === f.path ? { ...p, isProcessingPreview: false } : p
              )
            );
          }
        } catch (err) {
          console.error("Failed to generate EPS preview in Auto EPS Preview", err);
          setFiles(prev =>
            prev.map(p =>
              p.path === f.path ? { ...p, isProcessingPreview: false } : p
            )
          );
        }
      }
    };
    processPreviews();
  }, [files]);

  const handleSelectOutputFolder = async () => {
    if (!(window as any).electronAPI?.selectFolder) return;
    const result = await (window as any).electronAPI.selectFolder();
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      setOutputFolder(result.filePaths[0]);
    }
  };

  const generatePreviews = async (forceAll: boolean = false) => {
    setIsProcessing(true);
    isCancelledRef.current = false;
    
    const targetFiles = forceAll ? files.map(f => ({ ...f, status: 'idle' as const, errorMsg: null })) : files;
    if (forceAll) {
      setFiles(targetFiles);
    }
    
    for (let i = 0; i < targetFiles.length; i++) {
      if (isCancelledRef.current) break;
      const file = targetFiles[i];
      if (!forceAll && file.status === 'success') continue;

      setFiles(prev => prev.map(f => f.path === file.path ? { ...f, status: 'processing' } : f));

      try {
        if (!(window as any).electronAPI?.generateEpsJpg) {
          throw new Error('Electron API not found. Are you running in the desktop app?');
        }

        const result = await (window as any).electronAPI.generateEpsJpg(file.path, addWhiteBg, outputExt, outputFolder);
        
        if (isCancelledRef.current) break;

        if (result.success) {
          setFiles(prev => prev.map(f => f.path === file.path ? { ...f, status: 'success' } : f));
        } else {
          throw new Error(result.error || 'Failed to generate JPG');
        }
      } catch (err: any) {
        if (!isCancelledRef.current) {
          setFiles(prev => prev.map(f => f.path === file.path ? { ...f, status: 'error', errorMsg: err.message } : f));
        }
      }
    }
    
    if (isCancelledRef.current) {
      setFiles(prev => prev.map(f => f.status === 'processing' ? { ...f, status: 'idle' } : f));
    }
    
    setIsProcessing(false);
  };

  const isAllDone = files.length > 0 && files.every(f => f.status === 'success');
  const processedCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const progressPercent = files.length > 0 ? Math.round(((processedCount + errorCount) / files.length) * 100) : 0;

  const handleStartClick = () => {
    if (isProcessing) return;
    if (isAllDone) {
      generatePreviews(true);
    } else {
      generatePreviews(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%", paddingBottom: "2rem" }}>
      
      <div style={{ padding: "0 0.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0, color: "var(--text-1)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ImageIcon style={{ width: "1.5rem", height: "1.5rem", color: "var(--primary)" }} /> 
          Image Converter
        </h2>
        <p style={{ color: "var(--text-3)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
          Seamlessly batch convert EPS, PNG, and HEIC files into high-quality JPEG or PNG formats. Output files are saved directly alongside your originals, perfectly optimized for stock market submissions.
        </p>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="upload-zone"
        onClick={() => fileInputRef.current?.click()}
        style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.7 : 1 }}
      >
        <input ref={fileInputRef} type="file" className="hidden" accept=".eps,.png,.heic,.heif" multiple onChange={onFileChange} disabled={isProcessing} />
        <div className="flex flex-col items-center">
          <div className="upload-icon-wrap" style={{ background: 'rgba(37,99,235,0.1)' }}>
            <Upload style={{ width: "2rem", height: "2rem", color: "var(--primary)" }} />
          </div>
          <h3 style={{ margin: "0.4rem 0", fontSize: "1.05rem", fontWeight: 700 }}>Drop EPS, PNG or HEIC files here</h3>
          <p className="text-muted" style={{ fontSize: "0.85rem" }}>
            Or click to browse. Supported formats: .eps, .png, .heic, .heif
          </p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="glass card animate-fade-in" style={{ padding: "1.5rem", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-1)" }}>
                {files.length} {files.length === 1 ? 'file' : 'files'}
              </span>

              {processedCount > 0 && (
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.22rem 0.6rem",
                  borderRadius: "9999px",
                  background: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid rgba(16, 185, 129, 0.28)",
                  color: "#059669",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  boxShadow: "0 1px 3px rgba(16, 185, 129, 0.08)"
                }}>
                  <CheckCircle style={{ width: "0.82rem", height: "0.82rem", color: "#10b981" }} />
                  <span>{processedCount} processed</span>
                </div>
              )}

              {errorCount > 0 && (
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.22rem 0.6rem",
                  borderRadius: "9999px",
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.28)",
                  color: "#dc2626",
                  fontSize: "0.78rem",
                  fontWeight: 600
                }}>
                  <AlertCircle style={{ width: "0.82rem", height: "0.82rem", color: "#ef4444" }} />
                  <span>{errorCount} failed</span>
                </div>
              )}

              {files.some(f => f.name.toLowerCase().endsWith('.png')) && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-2)', marginLeft: '0.25rem' }}>
                  <input 
                    type="checkbox" 
                    checked={addWhiteBg} 
                    onChange={(e) => setAddWhiteBg(e.target.checked)}
                    disabled={isProcessing}
                    style={{ accentColor: 'var(--primary)', width: '0.85rem', height: '0.85rem', cursor: 'pointer' }}
                  />
                  Add white background
                </label>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-2)", fontWeight: 500 }}>Output Format:</span>
                <div 
                  tabIndex={isProcessing ? -1 : 0}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setIsFormatOpen(false);
                    }
                  }}
                  style={{ position: "relative", outline: "none" }}
                >
                  <div
                    onClick={() => !isProcessing && setIsFormatOpen(!isFormatOpen)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.35rem 0.55rem",
                      borderRadius: "0.45rem",
                      border: "1px solid var(--glass-border)",
                      background: "var(--surface-1)",
                      color: "var(--text-1)",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: isProcessing ? "not-allowed" : "pointer",
                      transition: "all 0.15s ease",
                      opacity: isProcessing ? 0.7 : 1
                    }}
                  >
                    {outputExt}
                    <ChevronDown style={{ width: "0.8rem", height: "0.8rem", color: "var(--text-3)", transform: isFormatOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </div>
                  
                  {isFormatOpen && (
                    <div style={{
                      position: "absolute",
                      top: "calc(100% + 0.35rem)",
                      left: 0,
                      minWidth: "100%",
                      background: "var(--surface-1)",
                      border: "1px solid var(--glass-border)",
                      borderRadius: "0.45rem",
                      padding: "0.25rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.15rem",
                      zIndex: 50,
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.05)",
                      backdropFilter: "blur(12px)"
                    }}>
                      {['.jpg', '.jpeg', '.png'].map(ext => (
                        <div 
                          key={ext}
                          onClick={() => { setOutputExt(ext); setIsFormatOpen(false); }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          style={{
                            padding: "0.35rem 0.75rem",
                            borderRadius: "0.3rem",
                            cursor: "pointer",
                            fontSize: "0.78rem",
                            fontWeight: outputExt === ext ? 700 : 500,
                            color: outputExt === ext ? "var(--primary)" : "var(--text-1)",
                            background: "transparent",
                            transition: "background 0.15s ease"
                          }}
                        >
                          {ext}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div 
                title={outputFolder || "Auto-create 'Converted Files' in source folder"}
                style={{ 
                  display: "flex", alignItems: "center", gap: "0.45rem", padding: "0.35rem 0.7rem", 
                  background: outputFolder ? "rgba(37,99,235,0.08)" : "var(--surface-1)", 
                  border: `1px solid ${outputFolder ? "var(--primary)" : "var(--glass-border)"}`, 
                  borderRadius: "0.45rem", cursor: isProcessing ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease"
                }}
                onClick={() => !isProcessing && handleSelectOutputFolder()}
                onMouseOver={(e) => { if(!isProcessing && !outputFolder) e.currentTarget.style.borderColor = 'var(--text-3)'; }}
                onMouseOut={(e) => { if(!isProcessing && !outputFolder) e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
              >
                <Folder style={{ width: "0.85rem", height: "0.85rem", color: outputFolder ? "var(--primary)" : "var(--text-3)" }} />
                <span style={{ fontSize: "0.78rem", fontWeight: outputFolder ? 600 : 500, color: outputFolder ? "var(--primary)" : "var(--text-2)", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {outputFolder ? outputFolder.split('\\').pop() : "Output Folder"}
                </span>
                {outputFolder && (
                  <div 
                    title="Clear selected folder"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0.1rem", borderRadius: "50%", background: "rgba(239,68,68,0.1)", marginLeft: "0.15rem" }}
                    onClick={(e) => { e.stopPropagation(); setOutputFolder(null); }}
                  >
                    <Trash2 style={{ width: "0.7rem", height: "0.7rem", color: "var(--danger)", cursor: "pointer" }} />
                  </div>
                )}
              </div>

              {isProcessing ? (
                <button 
                  onClick={() => { isCancelledRef.current = true; setIsProcessing(false); }} 
                  className="btn-outline" 
                  style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem", color: "#dc2626", borderColor: "rgba(220, 38, 38, 0.3)", borderRadius: "0.45rem", display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "rgba(220, 38, 38, 0.05)" }}
                >
                  <Square style={{ width: "0.8rem", height: "0.8rem", fill: "currentColor" }} /> Stop
                </button>
              ) : (
                <button 
                  onClick={clearAll} 
                  className="btn-outline" 
                  style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem", color: "var(--danger)", borderColor: "rgba(239,68,68,0.2)", borderRadius: "0.45rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <Trash2 style={{ width: "0.8rem", height: "0.8rem" }} /> Clear All
                </button>
              )}

              <button 
                onClick={handleStartClick} 
                disabled={isProcessing}
                style={{ 
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.42rem 1.25rem", 
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  background: isAllDone 
                    ? "linear-gradient(135deg, #059669 0%, #10b981 100%)" 
                    : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                  color: "#ffffff",
                  boxShadow: isAllDone 
                    ? "0 4px 14px rgba(16, 185, 129, 0.3)" 
                    : "0 4px 14px rgba(37, 99, 235, 0.35)",
                  cursor: isProcessing ? "not-allowed" : "pointer",
                  opacity: isProcessing ? 0.75 : 1,
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
                onMouseEnter={(e) => {
                  if (!isProcessing) {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = isAllDone 
                      ? "0 6px 18px rgba(16, 185, 129, 0.45)" 
                      : "0 6px 18px rgba(37, 99, 235, 0.45)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = isAllDone 
                    ? "0 4px 14px rgba(16, 185, 129, 0.3)" 
                    : "0 4px 14px rgba(37, 99, 235, 0.35)";
                }}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : isAllDone ? (
                  <>
                    <RotateCcw style={{ width: "0.85rem", height: "0.85rem" }} />
                    <span>Start Again</span>
                  </>
                ) : (
                  <>
                    <Play style={{ width: "0.85rem", height: "0.85rem", fill: "currentColor" }} />
                    <span>Start</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {isProcessing && (
            <div style={{ width: "100%", height: "3px", background: "var(--surface-2)", borderRadius: "2px", overflow: "hidden", marginBottom: "0.85rem" }}>
              <div 
                style={{ 
                  height: "100%", 
                  width: `${progressPercent}%`, 
                  background: "linear-gradient(90deg, var(--primary) 0%, #06b6d4 100%)", 
                  transition: "width 0.25s ease",
                  borderRadius: "2px"
                }} 
              />
            </div>
          )}

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
                    {/* Thumbnail */}
                    <div style={{ width: '2.25rem', height: '2.25rem', flexShrink: 0, borderRadius: '0.4rem', overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {file.previewUrl
                        ? <img src={file.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (file.isProcessingPreview 
                            ? <Loader2 style={{ width: '1rem', height: '1rem', animation: 'spin 1s linear infinite' }} />
                            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: '0.65rem', fontWeight: 700 }}>
                                {file.name.toLowerCase().endsWith('.png') ? 'PNG' : 'EPS'}
                              </div>)
                      }
                    </div>
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
                      <div title={file.errorMsg || 'Error'} style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--danger)" }}>
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
