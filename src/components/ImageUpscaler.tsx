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
  Trash2,
  Target,
  Camera,
  User,
  Palette,
  Maximize2,
  ChevronDown,
  Check,
  Scale,
  Focus,
  SlidersHorizontal,
  Gem,
  Flame,
  Layers
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

const LOCAL_MODEL_OPTIONS = [
  { id: 'fast', label: 'Fast', desc: 'High-Speed (Resolution upscale only)', icon: Zap, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  { id: 'balanced', label: 'Balanced', desc: 'Smooth & Natural Detail Balance', icon: SlidersHorizontal, color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
  { id: 'auto_model_detect', label: 'Auto Model Detect', desc: 'Smart AI Content Detection', icon: Target, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
  { id: 'realesrgan-x4plus', label: 'General Photo', desc: 'RealESRGAN Default Model', icon: Camera, color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)' },
  { id: 'remacri', label: 'Portrait & Faces', desc: 'Remacri AI (Skin Textures)', icon: User, color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)' },
  { id: 'ultrasharp', label: 'Ultrasharp', desc: 'High Contrast & Fine Detail', icon: Gem, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
  { id: 'realesrgan-x4plus-anime', label: 'Anime & Vector Art', desc: 'RealESRGAN Anime Edition', icon: Palette, color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)' },
];

const OUTPUT_FORMAT_OPTIONS = [
  { id: 'jpg', label: 'JPG / JPEG', desc: 'Standard compression (Smaller size)', icon: ImageIcon, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
  { id: 'png', label: 'PNG', desc: 'Lossless quality (Maximum fidelity)', icon: Layers, color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
];

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
  const [localModel, setLocalModel] = useState<string>("fast");
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [outputFormat, setOutputFormat] = useState<string>("jpg");
  const [isFormatDropdownOpen, setIsFormatDropdownOpen] = useState(false);
  const [currentFileProgress, setCurrentFileProgress] = useState<number>(0);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [fileDimensions, setFileDimensions] = useState<Record<string, { width: number; height: number; size?: string }>>({});
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});

  const upscaleMethod = "localNcnn";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const formatDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
      if (formatDropdownRef.current && !formatDropdownRef.current.contains(e.target as Node)) {
        setIsFormatDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      if (localModel === 'auto_model_detect' || localModel === 'auto_detect') {
        const name = (fileObj.name || '').toLowerCase();
        const isAnimeOrVector = /anime|vector|cartoon|illustration|illust|drawing|art|clip|graphic|\.svg|\.ai|\.eps/i.test(name);
        const is3dRender = /3d|render|cgi|unreal|octane|cinema4d/i.test(name);
        const hasFace = /person|portrait|face|human|man|woman|girl|boy|people|model|headshot|selfie/i.test(name);

        if (isAnimeOrVector) {
          modelToUse = 'realesrgan-x4plus-anime';
        } else if (is3dRender) {
          modelToUse = 'realesrgan-x4plus';
        } else if (hasFace) {
          modelToUse = 'remacri';
        } else {
          modelToUse = 'ultrasharp';
        }
      } else if (localModel === 'fast') {
        modelToUse = 'fast_sharp';
      } else if (localModel === 'balanced') {
        const name = (fileObj.name || '').toLowerCase();
        const hasFace = /person|portrait|face|human|man|woman|girl|boy|people|model|headshot|selfie/i.test(name);
        modelToUse = hasFace ? 'remacri' : 'ultramix_balanced';
      }
      
      const pathArg = (fileObj as MockFile).path;
      let effectiveSaveDir = outputFolder;
      if (!effectiveSaveDir && pathArg) {
        const normalizedPath = pathArg.replace(/\\/g, '/');
        const lastSeparator = normalizedPath.lastIndexOf('/');
        const folderPath = lastSeparator > -1 ? pathArg.substring(0, lastSeparator) : '.';
        const pathSeparator = pathArg.includes('\\') ? '\\' : '/';
        effectiveSaveDir = `${folderPath}${pathSeparator}Upscaled`;
      }
      
      const resData = await window.electronAPI.upscaleLocalNcnn(pathArg, currentScale, modelToUse, outputFormat, effectiveSaveDir);
      if (!resData.success) {
        throw new Error(resData.error || "Local GPU upscaling failed");
      }
      
      if (effectiveSaveDir) {
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
            
            {/* Local AI Model Custom Dropdown */}
            <div style={{ position: 'relative', zIndex: 50 }} ref={modelDropdownRef}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.4rem' }}>
                Local AI Model
              </label>

              {(() => {
                const currentOption = LOCAL_MODEL_OPTIONS.find(m => m.id === localModel) || LOCAL_MODEL_OPTIONS[0];
                const CurrentIcon = currentOption.icon;

                return (
                  <>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.65rem',
                        background: 'var(--surface-2)',
                        border: isModelDropdownOpen ? '1.5px solid var(--primary)' : '1px solid var(--glass-border)',
                        borderRadius: '0.6rem',
                        color: 'var(--text-1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        outline: 'none',
                        transition: 'all 0.2s ease',
                        boxShadow: isModelDropdownOpen ? '0 0 0 3px var(--primary-glow)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                        <div style={{
                          width: '1.75rem',
                          height: '1.75rem',
                          borderRadius: '0.45rem',
                          background: currentOption.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <CurrentIcon style={{ width: '0.95rem', height: '0.95rem', color: currentOption.color }} />
                        </div>
                        <div style={{ textAlign: 'left', minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {currentOption.label}
                          </div>
                          <div style={{ fontSize: '0.66rem', color: 'var(--text-3)', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {currentOption.desc}
                          </div>
                        </div>
                      </div>

                      <ChevronDown style={{ 
                        width: '0.85rem', 
                        height: '0.85rem', 
                        color: 'var(--text-3)', 
                        transform: isModelDropdownOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0,
                        marginLeft: '0.4rem'
                      }} />
                    </button>

                    <AnimatePresence>
                      {isModelDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 6px)',
                            left: 0,
                            right: 0,
                            background: 'var(--surface-1)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '0.75rem',
                            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.18)',
                            backdropFilter: 'blur(16px)',
                            zIndex: 100,
                            padding: '0.35rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem',
                            maxHeight: '320px',
                            overflowY: 'auto'
                          }}
                        >
                          {LOCAL_MODEL_OPTIONS.map((item) => {
                            const IconComp = item.icon;
                            const isSelected = localModel === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setLocalModel(item.id);
                                  setIsModelDropdownOpen(false);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '0.6rem',
                                  padding: '0.4rem 0.55rem',
                                  borderRadius: '0.5rem',
                                  border: isSelected ? `1px solid ${item.color}40` : '1px solid transparent',
                                  background: isSelected ? item.bg : 'transparent',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  width: '100%',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)'; }}
                                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                                  <div style={{
                                    width: '1.75rem',
                                    height: '1.75rem',
                                    borderRadius: '0.4rem',
                                    background: item.bg,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}>
                                    <IconComp style={{ width: '0.95rem', height: '0.95rem', color: item.color }} />
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: isSelected ? 800 : 600, color: isSelected ? item.color : 'var(--text-1)' }}>
                                      {item.label}
                                    </div>
                                    <div style={{ fontSize: '0.66rem', color: 'var(--text-3)', fontWeight: 500 }}>
                                      {item.desc}
                                    </div>
                                  </div>
                                </div>

                                {isSelected && (
                                  <Check style={{ width: '0.85rem', height: '0.85rem', color: item.color, flexShrink: 0 }} />
                                )}
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                );
              })()}
            </div>

            {/* Output Format Custom Dropdown */}
            <div style={{ position: 'relative', zIndex: 40 }} ref={formatDropdownRef}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.4rem' }}>
                Output Format
              </label>

              {(() => {
                const currentFormat = OUTPUT_FORMAT_OPTIONS.find(f => f.id === outputFormat) || OUTPUT_FORMAT_OPTIONS[0];
                const FormatIcon = currentFormat.icon;

                return (
                  <>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setIsFormatDropdownOpen(!isFormatDropdownOpen)}
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.65rem',
                        background: 'var(--surface-2)',
                        border: isFormatDropdownOpen ? '1.5px solid var(--primary)' : '1px solid var(--glass-border)',
                        borderRadius: '0.6rem',
                        color: 'var(--text-1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        outline: 'none',
                        transition: 'all 0.2s ease',
                        boxShadow: isFormatDropdownOpen ? '0 0 0 3px var(--primary-glow)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                        <div style={{
                          width: '1.75rem',
                          height: '1.75rem',
                          borderRadius: '0.45rem',
                          background: currentFormat.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <FormatIcon style={{ width: '0.95rem', height: '0.95rem', color: currentFormat.color }} />
                        </div>
                        <div style={{ textAlign: 'left', minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {currentFormat.label}
                          </div>
                          <div style={{ fontSize: '0.66rem', color: 'var(--text-3)', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {currentFormat.desc}
                          </div>
                        </div>
                      </div>

                      <ChevronDown style={{ 
                        width: '0.85rem', 
                        height: '0.85rem', 
                        color: 'var(--text-3)', 
                        transform: isFormatDropdownOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0,
                        marginLeft: '0.4rem'
                      }} />
                    </button>

                    <AnimatePresence>
                      {isFormatDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 6px)',
                            left: 0,
                            right: 0,
                            background: 'var(--surface-1)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '0.75rem',
                            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.18)',
                            backdropFilter: 'blur(16px)',
                            zIndex: 100,
                            padding: '0.35rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem'
                          }}
                        >
                          {OUTPUT_FORMAT_OPTIONS.map((item) => {
                            const IconComp = item.icon;
                            const isSelected = outputFormat === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setOutputFormat(item.id);
                                  setIsFormatDropdownOpen(false);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '0.6rem',
                                  padding: '0.4rem 0.55rem',
                                  borderRadius: '0.5rem',
                                  border: isSelected ? `1px solid ${item.color}40` : '1px solid transparent',
                                  background: isSelected ? item.bg : 'transparent',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  width: '100%',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)'; }}
                                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                                  <div style={{
                                    width: '1.75rem',
                                    height: '1.75rem',
                                    borderRadius: '0.4rem',
                                    background: item.bg,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}>
                                    <IconComp style={{ width: '0.95rem', height: '0.95rem', color: item.color }} />
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: isSelected ? 800 : 600, color: isSelected ? item.color : 'var(--text-1)' }}>
                                      {item.label}
                                    </div>
                                    <div style={{ fontSize: '0.66rem', color: 'var(--text-3)', fontWeight: 500 }}>
                                      {item.desc}
                                    </div>
                                  </div>
                                </div>

                                {isSelected && (
                                  <Check style={{ width: '0.85rem', height: '0.85rem', color: item.color, flexShrink: 0 }} />
                                )}
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                );
              })()}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)' }}>Output Folder</label>
                {outputFolder && (
                  <button
                    type="button"
                    onClick={() => setOutputFolder("")}
                    disabled={isProcessing}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-3)',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0
                    }}
                    title="Reset to default source folder"
                  >
                    Reset to Default
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={outputFolder || "Auto: [Source Folder]/Upscaled"} 
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
                  title="Choose custom output folder"
                >
                  <Folder style={{ width: '1.05rem', height: '1.05rem' }} />
                </button>
              </div>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: '0.35rem', lineHeight: 1.35, fontWeight: 500, margin: '0.35rem 0 0 0' }}>
                💡 If not selected, saves into an "Upscaled" folder in the source directory.
              </p>
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
