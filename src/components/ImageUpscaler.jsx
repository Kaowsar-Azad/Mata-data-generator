import { useState, useRef, useEffect } from "react";
import { Upload, Folder, X, ShieldCheck, Loader2, Image as ImageIcon, Maximize, AlertCircle, RefreshCw, Wifi, WifiOff, Link } from "lucide-react";

export function ImageUpscaler() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [outputFolder, setOutputFolder] = useState("");
  const [scale, setScale] = useState(2);
  const [isCustomScale, setIsCustomScale] = useState(false);
  const [customScaleValue, setCustomScaleValue] = useState(6);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [statusText, setStatusText] = useState("");
  const [results, setResults] = useState([]);
  const [localModel, setLocalModel] = useState("mata_ai");
  const [outputFormat, setOutputFormat] = useState("jpg");
  const [currentFileProgress, setCurrentFileProgress] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);

  const upscaleMethod = "localNcnn";

  // Listen to local upscaler progress events
  useEffect(() => {
    if (window.electronAPI?.onUpscaleProgress) {
      const cleanup = window.electronAPI.onUpscaleProgress((data) => {
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
      return cleanup;
    }
  }, [completedCount, selectedFiles.length, activeIndex]);


  const fileInputRef = useRef(null);

  const handleSelectFilesClick = async () => {
    if (window.electronAPI?.selectFiles) {
      const filePaths = await window.electronAPI.selectFiles({
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
      });
      
      if (filePaths && filePaths.length > 0) {
        // Mock File objects for electron file paths
        const newFiles = filePaths.map(path => {
          const name = path.split('\\').pop().split('/').pop();
          return {
            path: path,
            name: name,
            type: 'image/' + (name.toLowerCase().endsWith('png') ? 'png' : 'jpeg'),
            isElectron: true
          };
        });
        
        // Prevent duplicates
        setSelectedFiles(prev => {
          const existingPaths = prev.map(f => f.path || f.name);
          const filtered = newFiles.filter(f => !existingPaths.includes(f.path));
          return [...prev, ...filtered];
        });
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleWebFileInput = (e) => {
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

  const removeFile = (indexToRemove) => {
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const upscaleSingleFile = async (fileObj, currentScale) => {
    // Helper to get Blob from fileObj
    const getFileBlob = async () => {
      if (fileObj.isElectron) {
        const fileContent = await window.electronAPI.readFile(fileObj.path);
        return new Blob([fileContent], { type: fileObj.type || 'image/jpeg' });
      }
      return fileObj;
    };



    if (upscaleMethod === 'localNcnn' && window.electronAPI) {
      setStatusText(`Upscaling ${fileObj.name} with Local GPU (NCNN)...`);
      if (!fileObj.isElectron) {
        throw new Error("Local GPU upscaling only supports local files. Please select a file from your computer.");
      }
      
      let modelToUse = localModel;
      if (localModel === 'mata_ai') {
        const hasFace = /person|portrait|face|human|man|woman|girl|boy|people|model|headshot|selfie/i.test(fileObj.name || '');
        if (hasFace) modelToUse = 'mata_ai_face';
      }
      
      const resData = await window.electronAPI.upscaleLocalNcnn(fileObj.path, currentScale, modelToUse, outputFormat, outputFolder);
      if (!resData.success) {
        throw new Error(resData.error || "Local GPU upscaling failed");
      }
      
      if (outputFolder) {
        // If outputFolder is used, the backend saves the file directly (to avoid base64 OOM issues)
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

    // Fallback: if Electron is available, we should not reach here without a proper method
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
    
    // Initialize results log with pending states
    const initialResults = selectedFiles.map(f => ({
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
      } catch (err) {
        setResults(prev => {
          const updated = [...prev];
          updated[i] = { ...updated[i], status: 'error', error: err.message };
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

  const retryUpscale = async (index) => {
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
    } catch (err) {
      setResults(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status: 'error', error: err.message };
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
      padding: '2rem',
      height: '100%',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '2rem',
      animation: 'fadeIn 0.4s ease-out'
    }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Maximize style={{ width: '1.75rem', height: '1.75rem', color: 'var(--primary)' }} />
            AI Image Upscaler
          </h2>
        </div>
        <p style={{ color: 'var(--text-2)', fontSize: '0.95rem', margin: '0 0 0.75rem 0', maxWidth: '600px' }}>
          Upscale your images without losing quality. Uses Real-ESRGAN via Local GPU for ultra-sharp results.
        </p>
      </div>


      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Left Column: File Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div style={{
            background: 'var(--surface-1)',
            border: '1px dashed var(--glass-border)',
            borderRadius: '1rem',
            padding: '2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            minHeight: '200px',
            position: 'relative'
          }}>
            <div style={{ 
              width: '4rem', height: '4rem', borderRadius: '50%', background: 'var(--primary-glow)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center' 
            }}>
              <Upload style={{ width: '2rem', height: '2rem', color: 'var(--primary)' }} />
            </div>
            
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>Select Images to Upscale</h3>
              <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', margin: 0 }}>Supported formats: JPG, PNG, WEBP</p>
            </div>

            <button
              onClick={handleSelectFilesClick}
              disabled={isProcessing}
              style={{
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                padding: '0.65rem 1.5rem',
                borderRadius: '0.5rem',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.7 : 1,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <ImageIcon style={{ width: '1.1rem', height: '1.1rem' }} />
              Choose Images
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleWebFileInput} 
              multiple 
              accept="image/jpeg,image/png,image/webp" 
              style={{ display: 'none' }} 
            />
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--glass-border)',
              borderRadius: '0.75rem',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '0.75rem 1rem', background: 'var(--surface-2)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-2)' }}>Selected ({selectedFiles.length})</span>
                {!isProcessing && (
                  <button 
                    onClick={() => setSelectedFiles([])}
                    style={{ background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                  >Clear All</button>
                )}
              </div>
              <div style={{ maxHeight: '250px', overflowY: 'auto', padding: '0.5rem' }}>
                {selectedFiles.map((f, i) => (
                  <div key={i} style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    padding: '0.5rem', borderRadius: '0.5rem', background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' 
                  }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.name}
                    </span>
                    {!isProcessing && (
                      <button 
                        onClick={() => removeFile(i)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex' }}
                      ><X style={{ width: '1rem', height: '1rem' }} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Upscale Settings */}
          <div style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--glass-border)',
            borderRadius: '0.75rem',
            padding: '1.25rem'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem 0' }}>Settings</h3>
            
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem' }}>Local AI Model</label>
              <select
                value={localModel}
                disabled={isProcessing}
                onChange={(e) => setLocalModel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '0.5rem',
                  color: 'var(--text-1)',
                  fontSize: '0.8rem',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  outline: 'none'
                }}
              >
                <option value="mata_ai">✨ Mata AI (Smart Hybrid Cloud/Local)</option>
                <option value="realesrgan-x4plus">📸 General Photo (realesrgan-x4plus - Upscayl Default)</option>
                <option value="remacri">📸 General Photo Alternative (Remacri)</option>
                <option value="ultrasharp">✨ Ultrasharp (Aggressive enhancement)</option>
                <option value="ultramix_balanced">⚖️ Ultramix Balanced (Smooth & sharp)</option>
                <option value="realesr-animevideov3">⚡ Fast (realesr-animevideov3 - recommended for Intel / Low-end)</option>
                <option value="realesrgan-x4plus-anime">🎨 Anime / Vector (realesrgan-x4plus-anime)</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem' }}>Output Format</label>
              <select
                value={outputFormat}
                disabled={isProcessing}
                onChange={(e) => setOutputFormat(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '0.5rem',
                  color: 'var(--text-1)',
                  fontSize: '0.8rem',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  outline: 'none'
                }}
              >
                <option value="jpg">🖼️ JPG / JPEG (Smaller size - Recommended for Adobe Stock)</option>
                <option value="png">🖼️ PNG (Lossless - Large file size, supports transparency)</option>
              </select>
            </div>
            

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem' }}>Upscale Factor</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[2, 4].map(val => (
                  <button
                    key={val}
                    onClick={() => { setScale(val); setIsCustomScale(false); }}
                    disabled={isProcessing}
                    style={{
                      flex: 1,
                      padding: '0.6rem',
                      background: (!isCustomScale && scale === val) ? 'var(--primary)' : 'var(--surface-2)',
                      color: (!isCustomScale && scale === val) ? '#fff' : 'var(--text-1)',
                      border: `1px solid ${(!isCustomScale && scale === val) ? 'var(--primary)' : 'var(--glass-border)'}`,
                      borderRadius: '0.5rem',
                      cursor: isProcessing ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      transition: 'all 0.2s'
                    }}
                  >{val}x</button>
                ))}
                <button
                  onClick={() => { setIsCustomScale(true); setScale(customScaleValue); }}
                  disabled={isProcessing}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    background: isCustomScale ? 'var(--primary)' : 'var(--surface-2)',
                    color: isCustomScale ? '#fff' : 'var(--text-1)',
                    border: `1px solid ${isCustomScale ? 'var(--primary)' : 'var(--glass-border)'}`,
                    borderRadius: '0.5rem',
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    transition: 'all 0.2s'
                  }}
                >Custom</button>
              </div>
              {isCustomScale && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input
                    type="number"
                    min="2"
                    max="10"
                    value={customScaleValue}
                    disabled={isProcessing}
                    onChange={(e) => {
                      const val = Math.max(2, Math.min(10, parseInt(e.target.value) || 2));
                      setCustomScaleValue(val);
                      setScale(val);
                    }}
                    style={{
                      flex: 1,
                      padding: '0.5rem 0.75rem',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '0.5rem',
                      color: 'var(--text-1)',
                      fontSize: '0.85rem'
                    }}
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-2)', fontWeight: 600 }}>x</span>
                </div>
              )}
              <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '0.4rem', lineHeight: 1.4 }}>
                4x is recommended for very low-res images. 2x is best for standard upscaling.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem' }}>Output Folder</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={outputFolder || "Save to Downloads..."} 
                  readOnly 
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.75rem',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '0.5rem',
                    color: outputFolder ? 'var(--text-1)' : 'var(--text-3)',
                    fontSize: '0.8rem',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap'
                  }}
                />
                <button
                  onClick={handleSelectFolder}
                  disabled={isProcessing}
                  style={{
                    background: 'var(--surface-3)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-2)',
                    padding: '0.6rem',
                    borderRadius: '0.5rem',
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Choose output folder"
                >
                  <Folder style={{ width: '1.1rem', height: '1.1rem' }} />
                </button>
              </div>
            </div>
          </div>

          {/* Error / Alert */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.85rem', borderRadius: '0.5rem', color: 'var(--danger)', fontSize: '0.8rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <AlertCircle style={{ width: '1rem', height: '1rem', flexShrink: 0, marginTop: '0.1rem' }} />
              <span>{error}</span>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={startUpscaling}
            disabled={isProcessing || selectedFiles.length === 0}
            style={{
              width: '100%',
              padding: '1rem',
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              color: '#fff',
              border: 'none',
              borderRadius: '0.75rem',
              fontWeight: 800,
              fontSize: '1rem',
              cursor: (isProcessing || selectedFiles.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (isProcessing || selectedFiles.length === 0) ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: (isProcessing || selectedFiles.length === 0) ? 'none' : '0 4px 12px rgba(37,99,235,0.3)',
              transition: 'all 0.2s'
            }}
          >
            {isProcessing ? (
              <><Loader2 className="spin" style={{ width: '1.25rem', height: '1.25rem' }} /> {progress}% Processing</>
            ) : (
              <><ShieldCheck style={{ width: '1.25rem', height: '1.25rem' }} /> Start Upscaling</>
            )}
          </button>
          
          {isProcessing && (
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-3)' }}>
              {statusText}
            </div>
          )}

        </div>
      </div>

      {/* Results Log */}
      {results.length > 0 && (
        <div style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--glass-border)',
          borderRadius: '0.75rem',
          padding: '1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Processing Log</h3>
            {!isProcessing && (
              <button 
                onClick={() => setResults([])}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'var(--danger)', 
                  fontSize: '0.75rem', 
                  cursor: 'pointer', 
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
              >
                Clear Logs
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {results.map((res, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 1rem', borderRadius: '0.5rem',
                background: res.status === 'success' ? 'rgba(34,197,94,0.1)' : (res.status === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--surface-2)'),
                border: `1px solid ${res.status === 'success' ? 'rgba(34,197,94,0.2)' : (res.status === 'error' ? 'rgba(239,68,68,0.2)' : 'var(--glass-border)')}`,
              }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>{res.name}</span>
                  {res.status === 'success' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
                        💻 Upscaled with Local GPU (Success)
                      </span>
                      {res.path && <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>Saved to: {res.path}</span>}
                    </div>
                  ) : (res.status === 'error' ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>Error: {res.error}</span>
                      {!isProcessing && (
                        <button
                          onClick={() => retryUpscale(i)}
                          style={{
                            background: 'var(--primary-glow)',
                            color: 'var(--primary)',
                            border: '1px solid var(--glass-border)',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          <RefreshCw style={{ width: '0.75rem', height: '0.75rem' }} />
                          Retry
                        </button>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {res.status === 'processing' ? (
                        <><Loader2 className="spin" style={{ width: '0.75rem', height: '0.75rem', color: 'var(--primary)' }} /> Processing {activeIndex === i && currentFileProgress > 0 ? `(${Math.round(currentFileProgress)}%)` : ''}...</>
                      ) : (
                        <>Pending...</>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
