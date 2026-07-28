import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Server, ShieldCheck, Loader2, Save, Upload, Trash2, CheckCircle2, X,
  ExternalLink, Info, RefreshCw, Zap, AlertCircle, AlertTriangle, CloudUpload, Link,
  ChevronDown, ChevronUp, Key, Globe, Eye, EyeOff
} from "lucide-react";
import { processEpsFile, isEpsFile } from "../services/epsService";
import { FtpConfigManager, FtpConfig } from "./FtpConfigManager";

const POPULAR_AGENCIES = [
  {
    name: "Adobe Stock",
    host: "sftp.contributor.adobestock.com",
    port: 22,
    url: "https://contributor.stock.adobe.com/uploads",
    helpText: "Adobe Stock SFTP (Port 22). Contributor Portal → Upload → 'Learn more' → Generate Password. Username = your Contributor ID. ✅ Max 3 simultaneous connections per account.",
    secure: false,
    isAdobe: true,
    color: "#e84142",
    icon: "🔴",
    badge: "SFTP"
  },
  {
    name: "Shutterstock",
    host: "ftps.shutterstock.com",
    port: 21,
    url: "https://support.submit.shutterstock.com/s/article/How-do-I-upload-content-to-Shutterstock-via-FTP",
    helpText: "Shutterstock uses FTPS (Port 21, Secure). Use your Contributor email and account password directly.",
    secure: true,
    isAdobe: false,
    color: "#e8441c",
    icon: "🔶",
    badge: "FTPS"
  },
  {
    name: "Freepik",
    host: "ftp.freepik.com",
    port: 21,
    url: "https://contributor.freepik.com/dashboard",
    helpText: "Find your FTP credentials in the Freepik dashboard under the 'FTP Upload' section.",
    secure: false,
    isAdobe: false,
    color: "#1ab2a4",
    icon: "🟢",
    badge: "FTP"
  },
  {
    name: "Vecteezy",
    host: "ftp.vecteezy.com",
    port: 21,
    url: "https://contributors.vecteezy.com/dashboard",
    helpText: "Find your FTP credentials in your Vecteezy contributor dashboard.",
    secure: false,
    isAdobe: false,
    color: "#4263f5",
    icon: "🔵",
    badge: "FTP"
  },
  {
    name: "Dreamstime",
    host: "ftp.dreamstime.com",
    port: 21,
    url: "https://www.dreamstime.com/upload/help-ftp-upload",
    helpText: "Use your Dreamstime account credentials. Max 4 connections recommended.",
    secure: false,
    isAdobe: false,
    color: "#aa44cc",
    icon: "🟣",
    badge: "FTP"
  }
];

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}



interface FtpUploaderProps {
  ftpConfigs?: FtpConfig[];
  setFtpConfigs: (configs: FtpConfig[]) => void;
  editingConfig?: FtpConfig | null;
  setEditingConfig: (config: FtpConfig | null) => void;
}

export function FtpUploader({ ftpConfigs = [], setFtpConfigs, editingConfig = null, setEditingConfig }: FtpUploaderProps) {
  const [files, setFiles] = useState(() => {
    try {
      const saved = sessionStorage.getItem('ftp_upload_state');
      if (saved) {
        return JSON.parse(saved).map(f => ({
          ...f,
          previewUrl: f.path 
            ? (f.path.toLowerCase().endsWith('.eps') || f.path.toLowerCase().endsWith('.epsf') || f.path.toLowerCase().endsWith('.epsi')
                ? null
                : `file://${f.path.replace(/\\/g, '/')}`)
            : null
        }));
      }
    } catch (e) {
      console.error('Failed to load ftp state', e);
    }
    return [];
  });
  const [isUploading, setIsUploading] = useState(() => sessionStorage.getItem('ftp_is_uploading') === 'true');
  const [uploadSpeed, setUploadSpeed] = useState(null); // bytes/sec
  const [currentJobId, setCurrentJobId] = useState(() => sessionStorage.getItem('ftp_current_job_id') || null);
  const jobIdRef = useRef(sessionStorage.getItem('ftp_current_job_id') || null);

  useEffect(() => {
    const filesToSave = files.map(f => ({ ...f, file: undefined, previewUrl: undefined }));
    sessionStorage.setItem('ftp_upload_state', JSON.stringify(filesToSave));
  }, [files]);

  useEffect(() => {
    sessionStorage.setItem('ftp_current_job_id', currentJobId || '');
    jobIdRef.current = currentJobId;
  }, [currentJobId]);

  useEffect(() => {
    sessionStorage.setItem('ftp_is_uploading', isUploading ? 'true' : 'false');
  }, [isUploading]);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [concurrency, setConcurrency] = useState(() => parseInt(localStorage.getItem('ftp_concurrency') || '2'));

  useEffect(() => {
    if (window.electronAPI?.setUploadConcurrency) {
      window.electronAPI.setUploadConcurrency(concurrency).catch(e => console.error(e));
    }
    localStorage.setItem('ftp_concurrency', concurrency.toString());
  }, [concurrency]);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [testingStatus, setTestingStatus] = useState({});
  const [toasts, setToasts] = useState([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setShowPassword(false);
  }, [editingConfig?.id]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showToast = (message, type = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, type === 'warning' || type === 'error' ? 12000 : 5000);
  };

  const isAdobeConfig = (config) => {
    const h = (config?.host || '').toLowerCase();
    return h.includes('adobe') || h.includes('adobestock') || h.includes('contributor.stock');
  };

  const activeConfigs = ftpConfigs.filter(c => c.enabled);
  const adobeActive = activeConfigs.some(isAdobeConfig);

  useEffect(() => {
    setTestResult(null);
  }, [editingConfig?.id]);

  // Prevent UI getting stuck if renderer reloaded and all active uploads finished
  useEffect(() => {
    if (isUploading && files.length > 0) {
      const allDone = files.every(f => f.status === 'success' || f.status === 'error');
      if (allDone) {
        setIsUploading(false);
        setCurrentJobId(null);
      }
    }
  }, [files, isUploading]);

  useEffect(() => {
    return () => {
      // NOTE: We don't cancel FTP on unmount anymore because the user might just switch tabs 
      // or the renderer might be reloading. The main process handles job lifecycle.
      // If we cancel here, we kill active uploads when the laptop sleeps.
    };
  }, [currentJobId]);

  // Ultra-lightweight, non-blocking EPS preview extractor (FTP-specific)
  // Reads only 32 bytes + small preview chunk. Never reads the full 6MB+ file.
  // Zero CPU blocking: JPEG → instant blob URL, TIFF → sharp IPC (async).
  const processedEpsRef = useRef(new Set());

  useEffect(() => {
    const epsFiles = files.filter(
      f => f.file && !f.previewUrl && !processedEpsRef.current.has(f.id) &&
        (isEpsFile(f.file) || (f.path && /\.(eps|epsf|epsi)$/i.test(f.path)))
    );
    if (epsFiles.length === 0) return;

    // Mark immediately so we don't re-process on next render
    epsFiles.forEach(f => processedEpsRef.current.add(f.id));

    (async () => {
      // Yield slightly to let React finish rendering
      await new Promise(r => setTimeout(r, 50));
      
      for (const f of epsFiles) {
        try {
          console.log(`[FTP EPS] Processing preview for: ${f.file.name}`);
          const epsData = await processEpsFile(f.file);
          
          if (epsData?.dataUrl) {
            setFiles(prev => prev.map(p => p.id === f.id ? { ...p, previewUrl: epsData.dataUrl } : p));
          } else {
            console.warn(`[FTP EPS] Failed to extract preview URL for: ${f.file.name}`);
          }
        } catch (err) {
          console.error(`[FTP EPS] Error extracting preview:`, err);
        }
      }
    })();
  }, [files]);

  const activeHosts = activeConfigs.map(c => c.host).join(',');
  useEffect(() => {
    if (window.electronAPI?.onFtpProgress) {
      const unsubscribe = window.electronAPI.onFtpProgress(({ filePath, progress, host, error }) => {
        console.log(`[FTP Progress IPC] File: ${filePath}, Progress: ${progress}%, Host: ${host}, Error: ${error || 'none'}`);
        setFiles(prev => prev.map(f => {
          // Normalize paths for windows
          const fPath = f.path.replace(/\\/g, '/');
          const pPath = filePath.replace(/\\/g, '/');
          if (fPath === pPath) {
            const currentProgressMap = typeof f.progress === 'object' && f.progress !== null ? { ...f.progress } : {};
            const currentStatusMap = typeof f.serverStatus === 'object' && f.serverStatus !== null ? { ...f.serverStatus } : {};
            const currentErrors = typeof f.serverErrors === 'object' && f.serverErrors !== null ? { ...f.serverErrors } : {};

            if (error) {
              currentStatusMap[host] = 'error';
              currentErrors[host] = error;
            } else {
              currentProgressMap[host] = progress;
              if (progress === 100) {
                currentStatusMap[host] = 'success';
              } else {
                currentStatusMap[host] = 'uploading';
              }
            }

            let successC = 0;
            let errorC = 0;
            let pendingC = 0;
            
            for (const conf of activeConfigs) {
              const st = currentStatusMap[conf.host];
              if (st === 'success') successC++;
              else if (st === 'error') errorC++;
              else pendingC++;
            }

            let newGlobalStatus = f.status;
            if (pendingC === 0) {
              if (successC === activeConfigs.length) newGlobalStatus = 'success';
              else if (errorC === activeConfigs.length) newGlobalStatus = 'error';
              else newGlobalStatus = 'partial';
            }

            return { 
              ...f, 
              progress: currentProgressMap, 
              serverStatus: currentStatusMap,
              serverErrors: currentErrors,
              status: newGlobalStatus 
            };
          }
          return f;
        }));
      });
      return unsubscribe;
    }
  }, [activeHosts, activeConfigs]);

  const handleTestSpecificConfig = async (config) => {
    setTestingStatus(prev => ({ ...prev, [config.id]: { isTesting: true, result: null } }));
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.testFtp(config);
        if (res.success) {
          setTestingStatus(prev => ({ ...prev, [config.id]: { isTesting: false, result: { success: true, msg: "✅ Connected successfully!" } } }));
        } else {
          setTestingStatus(prev => ({ ...prev, [config.id]: { isTesting: false, result: { success: false, msg: res.error || "Connection failed" } } }));
        }
      }
    } catch (err) {
      setTestingStatus(prev => ({ ...prev, [config.id]: { isTesting: false, result: { success: false, msg: err.message } } }));
    }
  };

  const handleCancel = () => setEditingConfig(null);

  const handleTest = async () => {
    if (!editingConfig) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.testFtp(editingConfig);
        if (res.success) {
          setTestResult({ success: true, msg: "✅ Connection successful!" });
        } else {
          setTestResult({ success: false, msg: res.error || "Connection failed" });
        }
      }
    } catch (err) {
      setTestResult({ success: false, msg: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!editingConfig) return;
    setIsSaving(true);
    let updatedConfigs;
    if (ftpConfigs.find(c => c.id === editingConfig.id)) {
      updatedConfigs = ftpConfigs.map(c => c.id === editingConfig.id ? editingConfig : c);
    } else {
      updatedConfigs = [...ftpConfigs, editingConfig];
    }
    setFtpConfigs(updatedConfigs);
    if (window.electronAPI) {
      await window.electronAPI.saveFtpConfig(updatedConfigs);
    }
    setIsSaving(false);
    setEditingConfig(null);
  };

  const handleSelectAgency = (agency) => {
    setEditingConfig({
      ...editingConfig,
      websiteName: agency.name,
      host: agency.host,
      port: agency.port,
      secure: agency.secure
    });
  };

  const handleOpenHelpUrl = (url) => {
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const activeAgencyInfo = POPULAR_AGENCIES.find(
    a => a.name.toLowerCase() === editingConfig?.websiteName?.trim().toLowerCase()
  );

  // Drag & Drop
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addNewFiles(droppedFiles);
  }, []);

  const addNewFiles = (selectedFiles) => {
    if (!selectedFiles.length) return;
    const newFiles = selectedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      path: file.path,
      name: file.name,
      size: file.size,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      status: 'pending',
      error: null
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const onFilesSelected = (e) => {
    addNewFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const removeFile = (id) => {
    const fileToRemove = files.find(f => f.id === id);
    if (fileToRemove?.previewUrl) URL.revokeObjectURL(fileToRemove.previewUrl);
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    // If a job is currently running or pending, cancel it
    if (jobIdRef.current && jobIdRef.current !== 'CANCELLED' && window.electronAPI?.cancelFtp) {
      window.electronAPI.cancelFtp(jobIdRef.current);
    }
    // Flag to stop any pending asynchronous operations (like validation)
    jobIdRef.current = 'CANCELLED';
    validationCompleteRef.current = false;

    files.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    setFiles([]);
    setUploadSpeed(null);
    setCurrentJobId(null);
    setIsUploading(false);
  };

  const nextFileIndexRef = useRef(0);
  const activeWorkersCountRef = useRef(0);
  const concurrencyRef = useRef(concurrency);
  const validatedFilesRef = useRef([]);
  const activeConfigsRef = useRef([]);
  const newJobIdRef = useRef('');
  const t0Ref = useRef(0);
  const totalSizeRef = useRef(0);
  const generatedCsvPathsRef = useRef([]);
  const allRenamedFilesRef = useRef([]);
  const batchFailedRef = useRef(0);
  const batchSuccessRef = useRef(0);
  const validationCompleteRef = useRef(false);

  const spawnWorker = async (workerId) => {
    activeWorkersCountRef.current++;
    try {
      while (true) {
        if (jobIdRef.current === 'CANCELLED') break;
        
        // Dynamic concurrency check: immediately break if workerId is beyond selected concurrency
        if (workerId >= concurrencyRef.current) {
          console.log(`[Worker Pool] Worker ${workerId} exiting because concurrency limit was reduced to ${concurrencyRef.current}`);
          break;
        }

        const index = nextFileIndexRef.current++;
        if (index >= validatedFilesRef.current.length) break;

        const file = validatedFilesRef.current[index];

        // Set current file status to 'uploading'
        setFiles(prev => prev.map(item =>
          item.id === file.id
            ? { ...item, status: 'uploading', progress: {} }
            : item
        ));

        try {
          // Trigger upload in parallel across all servers for this SINGLE file
          const uploadPromises = activeConfigsRef.current.map(async (conf) => {
            // If this file already succeeded on this specific server in a past run, skip it
            if (file.serverStatus && file.serverStatus[conf.host] === 'success') {
              return { host: conf.host, success: true, fileErrors: {}, renamedFiles: {}, csvPath: null };
            }

            // Initialize this server's status as 'uploading' in UI
            setFiles(prev => prev.map(item => {
              if (item.id === file.id) {
                const newServerStatus = { ...(item.serverStatus || {}) };
                newServerStatus[conf.host] = 'uploading';
                return { ...item, serverStatus: newServerStatus };
              }
              return item;
            }));

            const res = await window.electronAPI.uploadFtp(conf, [file.path], newJobIdRef.current);
            
            // Update this server's status based on result
            setFiles(prev => prev.map(item => {
              if (item.id === file.id) {
                const newServerStatus = { ...(item.serverStatus || {}) };
                const newServerErrors = { ...(item.serverErrors || {}) };
                if (res.success) {
                  newServerStatus[conf.host] = 'success';
                  delete newServerErrors[conf.host];
                } else {
                  newServerStatus[conf.host] = 'error';
                  newServerErrors[conf.host] = res.error || (res.fileErrors && res.fileErrors[file.path]) || 'Failed';
                }
                return { ...item, serverStatus: newServerStatus, serverErrors: newServerErrors };
              }
              return item;
            }));

            return {
              host: conf.host,
              success: res.success,
              fileErrors: res.fileErrors || {},
              renamedFiles: res.renamedFiles || {},
              csvPath: res.csvPath || null,
              error: res.error
            };
          });

          const uploadResults = await Promise.all(uploadPromises);

          if (jobIdRef.current === 'CANCELLED') break;

          // Track errors and state updates for this file
          let hasSuccess = false;
          let hasError = false;
          const newServerStatus = { ...(file.serverStatus || {}) };
          const newServerErrors = { ...(file.serverErrors || {}) };

          uploadResults.forEach(res => {
            if (res.csvPath) {
              generatedCsvPathsRef.current.push(res.csvPath);
            }
            const hostError = res.error || (res.fileErrors && res.fileErrors[file.path]);
            if (hostError) {
              newServerStatus[res.host] = 'error';
              newServerErrors[res.host] = hostError;
              hasError = true;
            } else if (res.success) {
              newServerStatus[res.host] = 'success';
              delete newServerErrors[res.host];
              hasSuccess = true;
            }
            if (res.renamedFiles) {
              for (const [, info] of Object.entries(res.renamedFiles)) {
                allRenamedFilesRef.current.push({ host: res.host, ...info });
              }
            }
          });

          let finalStatus = file.status;
          let finalError = null;

          if (hasError && !hasSuccess) {
            finalStatus = 'error';
            finalError = Object.values(newServerErrors).join(', ');
            batchFailedRef.current++;
          } else if (hasSuccess && !hasError) {
            finalStatus = 'success';
            batchSuccessRef.current++;
          } else if (hasSuccess && hasError) {
            finalStatus = 'partial';
            batchFailedRef.current++;
          }

          // Update UI state for this single file immediately!
          setFiles(prev => prev.map(item =>
            item.id === file.id
              ? {
                  ...item,
                  status: finalStatus,
                  error: finalError,
                  serverStatus: newServerStatus,
                  serverErrors: newServerErrors
                }
              : item
          ));
        } catch (err) {
          setFiles(prev => prev.map(item =>
            item.id === file.id
              ? { ...item, status: 'error', error: err.message }
              : item
          ));
          batchFailedRef.current++;
        }
      }
    } finally {
      activeWorkersCountRef.current--;
      if (activeWorkersCountRef.current === 0) {
        onUploadComplete();
      }
    }
  };

  const onUploadComplete = () => {
    const elapsed = (Date.now() - t0Ref.current) / 1000;
    if (totalSizeRef.current > 0 && elapsed > 0) {
      setUploadSpeed(totalSizeRef.current / elapsed);
    }

    if (allRenamedFilesRef.current.length > 0) {
      const msg = allRenamedFilesRef.current.map(r => `[${r.host}] Failed: ${r.failedName} ➔ New: ${r.newName}`).join('\n');
      showToast(`Adobe Stock Update:\n${msg}\nPlease delete the failed original files manually from the portal!`, 'warning');
    }

    if (generatedCsvPathsRef.current.length > 0) {
      showToast(`Adobe Stock CSV file generated:\n${generatedCsvPathsRef.current[0]}`, 'success');
    }

    if (batchFailedRef.current > 0) {
      showToast(`Upload completed, but ${batchFailedRef.current} file(s) failed. Click "Retry Failed" to try again.`, "error");
    } else {
      showToast(`${batchSuccessRef.current} file(s) successfully uploaded to server(s)!`, "success");
    }

    setIsUploading(false);
    setCurrentJobId(null);
    validationCompleteRef.current = false;
  };

  useEffect(() => {
    concurrencyRef.current = concurrency;
    if (isUploading && validationCompleteRef.current) {
      const currentActive = activeWorkersCountRef.current;
      if (concurrency > currentActive) {
        console.log(`[Worker Pool] Spawning ${concurrency - currentActive} new worker(s) dynamically`);
        for (let i = currentActive; i < concurrency; i++) {
          spawnWorker(i);
        }
      }
    }
  }, [concurrency, isUploading]);

  const uploadFiles = async () => {
    if (!window.electronAPI || files.length === 0 || activeConfigs.length === 0) return;
    
    validationCompleteRef.current = false;

    // Assign job ID early so it can be cancelled even during validation
    const newJobId = Math.random().toString(36).substr(2, 9);
    jobIdRef.current = newJobId;
    setCurrentJobId(newJobId);

    setIsUploading(true);
    setUploadSpeed(null);

    const t0 = Date.now();

    const pendingFiles = files.filter(f => {
      // Re-evaluate if there's any active config where the file hasn't succeeded yet
      return activeConfigs.some(conf => !(f.serverStatus && f.serverStatus[conf.host] === 'success'));
    });

    // --- SMART VALIDATION ENGINE ---
    const validatedFiles = [];
    const rejectedFiles = [];
    
    for (let f of pendingFiles) {
      const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
      if (jobIdRef.current === 'CANCELLED') return;
      let errorMsg = null;
      
      // Video Validation
      if (ext === '.mp4' || ext === '.mov') {
        if (f.size > 3900 * 1024 * 1024) {
          errorMsg = "Video size cannot exceed 3.9 GB.";
        } else if (window.electronAPI && window.electronAPI.checkVideoCodec) {
          try {
            const codec = await window.electronAPI.checkVideoCodec(f.path);
            if (!['h264', 'hevc'].includes(codec)) {
              errorMsg = `Unsupported video codec (${codec}). H.264 or H.265 (HEVC) is required for Adobe Stock.`;
            }
          } catch(e) {
            console.error("Codec check failed", e);
          }
        }
      } 
      // Image Validation (JPEG/JPG)
      else if (ext === '.jpg' || ext === '.jpeg') {
        if (f.size > 45 * 1024 * 1024) {
          errorMsg = "Image size cannot exceed 45 MB.";
        } else {
          // Check Resolution
          try {
            let dims = { w: 0, h: 0 };
            if (f.file) {
              dims = await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve({ w: img.width, h: img.height });
                img.onerror = () => resolve({ w: 0, h: 0 });
                img.src = URL.createObjectURL(f.file);
              });
            } else if (window.electronAPI && window.electronAPI.getImageDimensions && f.path) {
              const res = await window.electronAPI.getImageDimensions(f.path);
              if (res) dims = { w: res.width, h: res.height };
            }
            const mp = (dims.w * dims.h) / 1000000;
            if (mp > 0 && mp < 4) {
              errorMsg = `Resolution too low (${mp.toFixed(1)} MP). Minimum 4 Megapixels required.`;
            } else if (mp > 100) {
              errorMsg = `Resolution too high (${mp.toFixed(1)} MP). Maximum 100 Megapixels allowed.`;
            }
          } catch(e) {
            console.error("Resolution check failed", e);
          }
        }
      }
      
      // If cancelled during validation, abort everything
      if (jobIdRef.current === 'CANCELLED') return;

      if (errorMsg) {
        rejectedFiles.push({ ...f, status: 'error', error: errorMsg });
      } else {
        validatedFiles.push(f);
      }
    }
    
    // Update state with rejected files
    if (rejectedFiles.length > 0) {
      setFiles(prev => prev.map(item => {
        const rejected = rejectedFiles.find(rf => rf.id === item.id);
        return rejected ? rejected : item;
      }));
    }

    const filePaths = validatedFiles.map(f => f.path).filter(Boolean);

    if (filePaths.length === 0) {
      setIsUploading(false);
      if (rejectedFiles.length > 0) showToast("All files failed validation!", "error");
      return;
    }

    // Calculate total size for speed estimation
    const totalSize = validatedFiles.reduce((acc, f) => acc + (f.size || 0), 0);

    // If cancelled before we reach here, abort
    if (jobIdRef.current === 'CANCELLED') return;

    setFiles(prev => prev.map(item =>
      validatedFiles.some(pf => pf.id === item.id)
        ? { ...item, status: 'pending', progress: {}, error: null, serverStatus: {}, serverErrors: {} }
        : item
    ));

    // Initialize all Refs for concurrent worker pool execution
    nextFileIndexRef.current = 0;
    activeWorkersCountRef.current = 0;
    concurrencyRef.current = concurrency;
    validatedFilesRef.current = validatedFiles;
    activeConfigsRef.current = activeConfigs;
    newJobIdRef.current = newJobId;
    t0Ref.current = t0;
    totalSizeRef.current = totalSize;
    generatedCsvPathsRef.current = [];
    allRenamedFilesRef.current = [];
    batchFailedRef.current = 0;
    batchSuccessRef.current = 0;
    validationCompleteRef.current = true;

    // Trigger the initial concurrent workers
    for (let i = 0; i < concurrency; i++) {
      spawnWorker(i);
    }
  };

  const getCategorizedError = (rawErr, serverName) => {
    if (!rawErr) return '';
    const errLower = rawErr.toLowerCase();
    
    // Check for network issues
    const isNetworkError = 
      errLower.includes('etimedout') ||
      errLower.includes('econnrefused') ||
      errLower.includes('enotfound') ||
      errLower.includes('eai_again') ||
      errLower.includes('timeout') ||
      errLower.includes('connect') ||
      errLower.includes('socket') ||
      errLower.includes('offline') ||
      errLower.includes('network');
      
    if (isNetworkError) {
      return `Failed due to network issue`;
    } else {
      return `File not eligible for upload to ${serverName || 'server'}`;
    }
  };

  const successCount = files.filter(f => f.status === 'success').length;
  const completelyFailedCount = files.filter(f => f.status === 'error').length;
  const partialCount = files.filter(f => f.status === 'partial').length;
  const failedCount = completelyFailedCount + partialCount;
  const totalSize = files.reduce((a, f) => a + (f.size || 0), 0);

  const adobeSuccessCount = files.reduce((count, f) => {
    const isAdobeSuccess = activeConfigs.filter(isAdobeConfig).some(conf => f.serverStatus && f.serverStatus[conf.host] === 'success');
    return count + (isAdobeSuccess ? 1 : 0);
  }, 0);

  const successfulServerNames = activeConfigs
    .filter(conf => files.length > 0 && files.every(f => f.serverStatus && f.serverStatus[conf.host] === 'success'))
    .map(conf => conf.websiteName || conf.host);
    
  const successServerStr = successfulServerNames.length > 1 
    ? successfulServerNames.slice(0, -1).join(', ') + ' and ' + successfulServerNames[successfulServerNames.length - 1]
    : successfulServerNames[0] || '';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', height: '100%', overflowY: 'auto', paddingRight: '0.5rem', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1.5rem', alignItems: isMobile ? 'stretch' : 'flex-start', minHeight: 0 }}>

        {/* ─── Left Pane: Config Form or List ─── */}
        {editingConfig ? (
          <div className="card glass animate-fade-in" style={{ width: isMobile ? '100%' : '320px', flexShrink: 0, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.65rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Server style={{ width: '1rem', height: '1rem', color: 'var(--accent)' }} />
                {ftpConfigs.some(c => c.id === editingConfig.id) ? 'Edit FTP Connection' : 'New FTP Connection'}
              </h3>
              <button onClick={handleCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--text-3)', display: 'flex' }}>
                <X style={{ width: '1rem', height: '1rem' }} />
              </button>
            </div>

            {/* Quick Setup Buttons */}
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Setup — Agency</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
                {POPULAR_AGENCIES.map(agency => (
                  <button
                    key={agency.name}
                    type="button"
                    onClick={() => handleSelectAgency(agency)}
                    title={`Set up ${agency.name} credentials`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.3rem 0.6rem', fontSize: '0.72rem', borderRadius: '0.35rem',
                      background: editingConfig.websiteName === agency.name ? `rgba(${agency.color === '#e84142' ? '232,65,66' : '99,102,241'},0.15)` : 'var(--surface-2)',
                      border: `1px solid ${editingConfig.websiteName === agency.name ? agency.color + '55' : 'var(--glass-border)'}`,
                      color: editingConfig.websiteName === agency.name ? agency.color : 'var(--text-2)',
                      cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s'
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-1)'; }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = editingConfig.websiteName === agency.name ? `rgba(99,102,241,0.15)` : 'var(--surface-2)';
                      e.currentTarget.style.color = editingConfig.websiteName === agency.name ? agency.color : 'var(--text-2)';
                    }}
                  >
                    <span style={{ fontSize: '0.75rem' }}>{agency.icon}</span>
                    {agency.name}
                    <span style={{ fontSize: '0.58rem', padding: '0.05rem 0.3rem', borderRadius: '99px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-3)' }}>{agency.badge}</span>
                  </button>
                ))}
              </div>

              {/* Agency Help Info */}
              {activeAgencyInfo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.35rem' }}>
                  <div style={{ display: 'flex', gap: '0.45rem', background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)', padding: '0.55rem 0.7rem', borderRadius: '0.4rem' }}>
                    <Info style={{ width: '0.85rem', height: '0.85rem', color: 'var(--accent)', flexShrink: 0, marginTop: '0.05rem' }} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-2)', lineHeight: 1.5 }}>{activeAgencyInfo.helpText}</span>
                  </div>
                  {activeAgencyInfo.url && (
                    <button
                      onClick={() => handleOpenHelpUrl(activeAgencyInfo.url)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.6rem', borderRadius: '0.35rem', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', width: '100%', justifyContent: 'center', transition: 'all 0.15s' }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(6,182,212,0.15)'}
                      onMouseOut={e => e.currentTarget.style.background = 'rgba(6,182,212,0.08)'}
                    >
                      <ExternalLink style={{ width: '0.75rem', height: '0.75rem' }} />
                      Open {activeAgencyInfo.name} Portal
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Platform Name</label>
              <input
                type="text" placeholder="e.g. Adobe Stock"
                value={editingConfig.websiteName || ''}
                onChange={e => setEditingConfig({ ...editingConfig, websiteName: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Host / Server</label>
                <input
                  type="text" placeholder="sftp.contributor.adobestock.com"
                  value={editingConfig.host || ''}
                  onChange={e => setEditingConfig({ ...editingConfig, host: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Port</label>
                <input
                  type="number"
                  value={editingConfig.port || 21}
                  onChange={e => setEditingConfig({ ...editingConfig, port: parseInt(e.target.value) || 21 })}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>
                {editingConfig.host?.toLowerCase().includes('shutterstock') ? 'Account Email / Display Name' : 'Username / Contributor ID'}
              </label>
              <input
                type="text"
                placeholder="Your contributor ID"
                value={editingConfig.user || ''}
                onChange={e => setEditingConfig({ ...editingConfig, user: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Password (SFTP-generated)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Generate from Contributor Portal"
                  value={editingConfig.password || ''}
                  onChange={e => setEditingConfig({ ...editingConfig, password: e.target.value })}
                  style={{ paddingRight: '2.2rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
                    padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  onMouseOver={e => e.currentTarget.style.color = 'var(--text-1)'}
                  onMouseOut={e => e.currentTarget.style.color = 'var(--text-3)'}
                >
                  {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="ftp-secure-checkbox"
                checked={editingConfig.secure || false}
                onChange={e => setEditingConfig({ ...editingConfig, secure: e.target.checked })}
                style={{ cursor: 'pointer', width: '1rem', height: '1rem', accentColor: 'var(--accent)' }}
              />
              <label htmlFor="ftp-secure-checkbox" style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer', userSelect: 'none' }}>
                Use Secure Connection (FTPS) — Shutterstock only
              </label>
            </div>

            {testResult && (
              <div style={{
                padding: '0.65rem', borderRadius: '0.45rem', fontSize: '0.8rem',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: testResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: testResult.success ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${testResult.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
              }}>
                {testResult.success ? <CheckCircle2 style={{ width: '0.95rem', height: '0.95rem' }} /> : <AlertCircle style={{ width: '0.95rem', height: '0.95rem' }} />}
                <span>{testResult.msg}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button
                onClick={handleTest}
                disabled={isTesting || !editingConfig.host || !editingConfig.user}
                className="btn-outline"
                style={{ flex: 1, padding: '0.5rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                {isTesting ? <Loader2 className="animate-spin" style={{ width: '0.9rem', height: '0.9rem' }} /> : <ShieldCheck style={{ width: '0.9rem', height: '0.9rem' }} />}
                Test Connection
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !editingConfig.host}
                className="btn-primary"
                style={{ flex: 1, padding: '0.5rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                {isSaving ? <Loader2 className="animate-spin" style={{ width: '0.9rem', height: '0.9rem' }} /> : <Save style={{ width: '0.9rem', height: '0.9rem' }} />}
                Save Config
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in" style={{ 
            width: isMobile ? '100%' : (isSidebarCollapsed ? '72px' : '260px'), 
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem',
            position: 'relative', zIndex: 10
          }}>
            <FtpConfigManager 
              ftpConfigs={ftpConfigs} setFtpConfigs={setFtpConfigs}
              editingConfig={editingConfig} setEditingConfig={setEditingConfig}
              onStartEdit={(config) => { setEditingConfig(config); }}
              isCollapsed={isSidebarCollapsed}
              setIsCollapsed={setIsSidebarCollapsed}
            />
          </div>
        )}

        {/* ─── Right Pane: Upload Area ─── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>



          {/* Drop Zone */}
          <div
            ref={dropZoneRef}
            className="drop-zone glass"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              position: 'relative',
              overflow: 'hidden',
              background: isDragging 
                ? 'rgba(37, 99, 235, 0.06)' 
                : 'rgba(37, 99, 235, 0.02)',
              border: `2px dashed ${isDragging ? 'var(--primary)' : 'rgba(37, 99, 235, 0.25)'}`,
              borderRadius: '1.25rem', 
              padding: '2.5rem 1.5rem', 
              textAlign: 'center', 
              cursor: 'pointer',
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: '0.85rem',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
              minHeight: '220px', 
              justifyContent: 'center',
              transform: isDragging ? 'scale(1.01)' : 'scale(1)',
              boxShadow: isDragging 
                ? '0 10px 30px rgba(37, 99, 235, 0.1)' 
                : 'var(--glass-shadow)',
              backdropFilter: 'blur(10px)'
            }}
            onMouseOver={e => {
              if (!isDragging) {
                e.currentTarget.style.background = 'rgba(37, 99, 235, 0.04)';
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.4)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.05)';
              }
            }}
            onMouseOut={e => {
              if (!isDragging) {
                e.currentTarget.style.background = 'rgba(37, 99, 235, 0.02)';
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.25)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--glass-shadow)';
              }
            }}
          >
            {/* Ambient Background Glow for Drop Zone */}
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '150px', height: '150px',
              background: 'var(--primary)',
              filter: 'blur(80px)',
              opacity: isDragging ? 0.3 : 0.1,
              transition: 'opacity 0.4s ease',
              pointerEvents: 'none',
              borderRadius: '50%'
            }}></div>

            <input type="file" multiple ref={fileInputRef} onChange={onFilesSelected} style={{ display: "none" }} accept="image/*,.eps,.ai,.svg,.pdf" />
            
            {/* Icon Container with Ripple/Pulse Effect */}
            <div style={{ position: 'relative' }}>
              {isDragging && (
                <div style={{
                  position: 'absolute',
                  inset: -12,
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  opacity: 0.15,
                  animation: 'pulse 1.5s infinite ease-out'
                }}></div>
              )}
              <div style={{ 
                width: '4rem', 
                height: '4rem', 
                borderRadius: '50%', 
                background: isDragging ? 'var(--primary)' : 'var(--bg)',
                color: isDragging ? '#fff' : 'var(--primary)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: isDragging ? '0 10px 25px rgba(37,99,235,0.3)' : 'inset 0 2px 4px rgba(0,0,0,0.04), 0 2px 10px rgba(0,0,0,0.02)',
                transition: 'all 0.3s ease',
                position: 'relative',
                zIndex: 2
              }}>
                <CloudUpload style={{ width: '2rem', height: '2rem' }} />
              </div>
            </div>

            <div style={{ position: 'relative', zIndex: 2 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-1)', margin: '0 0 0.4rem 0', letterSpacing: '-0.02em' }}>
                {activeConfigs.length > 0
                  ? <>Upload to <span style={{ color: 'var(--primary)', background: 'linear-gradient(90deg, var(--primary), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{activeConfigs.map(c => c.websiteName || c.host).join(', ')}</span></>
                  : 'Drag & Drop Files Here'}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', margin: 0, fontWeight: 500 }}>
                {activeConfigs.length > 0
                  ? `${activeConfigs.length} server(s) active — JPG, EPS, AI, SVG, PNG supported`
                  : 'Enable an FTP connection from the list'}
              </p>
              
              <button 
                type="button"
                style={{
                  marginTop: '1rem',
                  padding: '0.5rem 1.25rem',
                  background: 'var(--surface-1)',
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: '99px',
                  color: 'var(--text-1)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.2)'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'var(--surface-1)'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)'; }}
              >
                Browse Files
              </button>
            </div>
          </div>

          {/* Action & Stats Bar */}
          <div className="card glass" style={{ padding: '0.85rem 1rem', background: 'var(--surface-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, color: 'var(--text-1)', fontSize: '0.95rem' }}>
                {files.length} {files.length === 1 ? 'File' : 'Files'}
              </span>
              {totalSize > 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 500 }}>
                  {formatBytes(totalSize)}
                </span>
              )}
              {files.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: successCount === files.length ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                  border: `1px solid ${successCount === files.length ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '99px',
                  color: successCount === files.length ? 'var(--success)' : '#3b82f6',
                  fontSize: '0.75rem',
                  fontWeight: 700
                }}>
                  {successCount === files.length ? (
                    <CheckCircle2 style={{ width: '0.9rem', height: '0.9rem' }} />
                  ) : (
                    <CloudUpload style={{ width: '0.9rem', height: '0.9rem' }} />
                  )}
                  <span>
                    {successCount} / {files.length} ({files.length > 0 ? Math.round((successCount / files.length) * 100) : 0}%) Uploaded
                  </span>
                </div>
              )}
              {completelyFailedCount > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '99px',
                  color: 'var(--danger)',
                  fontSize: '0.75rem',
                  fontWeight: 700
                }}>
                  <AlertCircle style={{ width: '0.9rem', height: '0.9rem' }} />
                  <span>{completelyFailedCount} Failed</span>
                </div>
              )}
              {partialCount > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '99px',
                  color: '#f59e0b',
                  fontSize: '0.75rem',
                  fontWeight: 700
                }}>
                  <AlertTriangle style={{ width: '0.9rem', height: '0.9rem' }} />
                  <span>{partialCount} Partial</span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'nowrap' }}>
                {files.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="btn-outline"
                    style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <Trash2 style={{ width: '0.75rem', height: '0.75rem' }} /> Clear
                  </button>
                )}

                {/* Concurrency Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.5rem', background: 'var(--surface-2)', borderRadius: '0.5rem', border: '1px solid var(--glass-border)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 600 }}>Parallel Uploads:</span>
                  {[1, 2].map(val => (
                    <button
                      key={val}
                      onClick={() => setConcurrency(val)}
                      style={{
                        padding: '0.15rem 0.45rem',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        border: 'none',
                        borderRadius: '0.25rem',
                        background: concurrency === val ? 'var(--primary)' : 'transparent',
                        color: concurrency === val ? '#fff' : 'var(--text-2)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      title={`Upload up to ${val} file(s) in parallel`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.65rem' }}>
              {failedCount > 0 && (
                <button
                  className="btn-outline"
                  onClick={uploadFiles}
                  disabled={isUploading || activeConfigs.length === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'rgba(239,68,68,0.4)', color: 'var(--danger)', padding: '0.45rem 1rem', background: 'rgba(239,68,68,0.05)', fontSize: '0.8rem' }}
                >
                  <span>Retry {failedCount} Failed {failedCount === 1 ? 'File' : 'Files'}</span>
                  {isUploading ? <Loader2 style={{ width: '0.9rem', height: '0.9rem', animation: 'spin 1s linear infinite' }} /> : <RefreshCw style={{ width: '0.9rem', height: '0.9rem' }} />}
                </button>
              )}
              <button
                className="btn-primary"
                onClick={uploadFiles}
                disabled={isUploading || files.length === 0 || activeConfigs.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: 'linear-gradient(135deg, var(--accent), var(--primary))', padding: '0.45rem 1.25rem', fontSize: '0.82rem', fontWeight: 700 }}
              >
                {isUploading
                  ? <><Loader2 style={{ width: '0.9rem', height: '0.9rem', animation: 'spin 1s linear infinite' }} /> Uploading...</>
                  : <><Upload style={{ width: '0.9rem', height: '0.9rem' }} /> Start Upload</>}
              </button>

            </div>
          </div>

          {/* Upload success reminder */}
          {successfulServerNames.length > 0 && !isUploading && (
            <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', padding: '0.65rem 0.85rem', borderRadius: '0.55rem', alignItems: 'flex-start' }}>
              <CheckCircle2 style={{ width: '0.9rem', height: '0.9rem', color: 'var(--success)', flexShrink: 0, marginTop: '0.05rem' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--success)' }}>
                  {successCount === files.length 
                    ? `All files successfully sent to ${successServerStr}!` 
                    : `Files successfully sent to ${successServerStr}!`}
                </strong>
                {failedCount > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}> However, some files failed to upload to other servers. You can retry them.</span>}
              </span>
            </div>
          )}

          {/* Files List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, overflowY: 'auto' }}>
            {[...files].sort((a, b) => {
              const getScore = (f) => {
                if (f.status === 'uploading') return 0;
                if (f.status === 'pending') return 1;
                if (f.status === 'error') return 2;
                if (f.status === 'partial') return 3;
                if (f.status === 'success') return 4;
                return 5;
              };
              return getScore(a) - getScore(b);
            }).map(file => (
              <div key={file.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: file.status === 'success' ? 'rgba(16,185,129,0.04)' : file.status === 'error' ? 'rgba(239,68,68,0.04)' : file.status === 'partial' ? 'rgba(245,158,11,0.04)' : 'var(--surface-1)',
                padding: '0.65rem 0.9rem', borderRadius: '0.65rem',
                border: `1px solid ${file.status === 'success' ? 'rgba(16,185,129,0.2)' : file.status === 'error' ? 'rgba(239,68,68,0.2)' : file.status === 'partial' ? 'rgba(245,158,11,0.2)' : 'var(--glass-border)'}`,
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseOver={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden', flex: 1 }}>
                  {/* Thumbnail */}
                  <div style={{ width: '2.25rem', height: '2.25rem', flexShrink: 0, borderRadius: '0.4rem', overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                    {file.previewUrl
                      ? <img src={file.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: '0.65rem', fontWeight: 700 }}>EPS</div>
                    }
                  </div>

                  {/* Status Icon */}
                  <div style={{
                    padding: '0.35rem', borderRadius: '0.4rem', flexShrink: 0,
                    background: file.status === 'success' ? 'rgba(16,185,129,0.1)' : file.status === 'error' ? 'rgba(239,68,68,0.1)' : file.status === 'partial' ? 'rgba(245,158,11,0.1)' : file.status === 'uploading' ? 'var(--primary-glow)' : 'var(--surface-2)',
                    color: file.status === 'success' ? 'var(--success)' : file.status === 'error' ? 'var(--danger)' : file.status === 'partial' ? '#f59e0b' : file.status === 'uploading' ? 'var(--primary)' : 'var(--text-3)'
                  }}>
                    {file.status === 'success' ? <CheckCircle2 style={{ width: '0.9rem', height: '0.9rem' }} /> :
                      file.status === 'error' ? <X style={{ width: '0.9rem', height: '0.9rem' }} /> :
                        file.status === 'partial' ? <AlertTriangle style={{ width: '0.9rem', height: '0.9rem' }} /> :
                          file.status === 'uploading' ? <Loader2 style={{ width: '0.9rem', height: '0.9rem', animation: 'spin 1s linear infinite' }} /> :
                            <Upload style={{ width: '0.9rem', height: '0.9rem' }} />}
                  </div>

                  {/* File Info */}
                  <div style={{ overflow: 'hidden' }}>
                    <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {file.name}
                    </h4>
                    
                    {/* Progress Bar for Uploading Status */}
                    {file.status === 'uploading' && file.progress !== undefined && (() => {
                      const displayProgress = (() => {
                        if (typeof file.progress === 'number') return file.progress;
                        if (typeof file.progress === 'object' && file.progress !== null) {
                          if (activeConfigs.length === 0) return 0;
                          const sum = activeConfigs.reduce((s, conf) => s + (file.progress[conf.host] || 0), 0);
                          return Math.round(sum / activeConfigs.length);
                        }
                        return 0;
                      })();
                      return (
                        <div style={{ marginTop: '0.35rem', marginBottom: '0.2rem', width: '100%', height: '4px', background: 'var(--surface-2)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ 
                            height: '100%', width: `${displayProgress}%`, 
                            background: 'linear-gradient(90deg, var(--accent), var(--primary), var(--accent))', 
                            backgroundSize: '200% 100%',
                            animation: 'ftpProgressGlow 2s linear infinite',
                            transition: 'width 0.2s ease' 
                          }} />
                        </div>
                      );
                    })()}

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                      {file.size > 0 && <span style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>{formatBytes(file.size)}</span>}
                      {file.status === 'uploading' && (() => {
                        const displayProgress = (() => {
                          if (typeof file.progress === 'number') return file.progress;
                          if (typeof file.progress === 'object' && file.progress !== null) {
                            if (activeConfigs.length === 0) return 0;
                            const sum = activeConfigs.reduce((s, conf) => s + (file.progress[conf.host] || 0), 0);
                            return Math.round(sum / activeConfigs.length);
                          }
                          return 0;
                        })();
                        return (
                          <span style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 600 }}>
                            {displayProgress === 0 ? 'Connecting & preparing...' : `Uploading... ${displayProgress}%`}
                          </span>
                        );
                      })()}
                      {file.status === 'success' && <span style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 600 }}>✓ Uploaded</span>}
                      
                       {/* Detailed per-server status badges */}
                       {file.serverStatus && activeConfigs.length > 1 && (file.status === 'partial' || file.status === 'error' || file.status === 'success' || file.status === 'uploading') && (
                         <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginLeft: '0.25rem', flexWrap: 'wrap' }}>
                           {activeConfigs.map(conf => {
                             const st = file.serverStatus[conf.host];
                             if (!st) return null;
                             const isSucc = st === 'success';
                             const isErr = st === 'error';
                             const name = conf.websiteName || conf.host;
                             let cleanErrText = '';
                             if (isErr && file.serverErrors && file.serverErrors[conf.host]) {
                               cleanErrText = getCategorizedError(file.serverErrors[conf.host], name);
                             }
                             const prg = (file.progress && typeof file.progress === 'object') ? file.progress[conf.host] : undefined;
                             const showProgress = !isSucc && !isErr && typeof prg === 'number';
                             
                             return (
                               <span key={conf.host} title={cleanErrText ? `Error: ${cleanErrText}` : ''} style={{ 
                                 fontSize: '0.6rem', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 600,
                                 background: isSucc ? 'rgba(16,185,129,0.1)' : isErr ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                 color: isSucc ? 'var(--success)' : isErr ? 'var(--danger)' : '#f59e0b',
                                 border: `1px solid ${isSucc ? 'rgba(16,185,129,0.2)' : isErr ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                                 cursor: isErr ? 'help' : 'default', display: 'flex', alignItems: 'center', gap: '0.2rem'
                               }}>
                                 {isSucc ? '✅' : isErr ? '❌' : '⏳'} {name}
                                 {showProgress && ` (${prg}%)`}
                                 {isErr && cleanErrText && (
                                   <span style={{ fontWeight: 400, opacity: 0.85 }}>({cleanErrText})</span>
                                 )}
                               </span>
                             );
                           })}
                         </div>
                       )}
                      
                      {file.error && (activeConfigs.length === 1 || !file.serverStatus) && (() => {
                        const activeConf = activeConfigs[0];
                        const serverName = activeConf ? (activeConf.websiteName || activeConf.host) : '';
                        const hasServerError = file.serverErrors && activeConf && file.serverErrors[activeConf.host];
                        const displayErr = hasServerError ? getCategorizedError(file.error, serverName) : file.error;
                        return (
                          <span style={{ fontSize: '0.65rem', color: 'var(--danger)', maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.error}>
                            {displayErr}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => removeFile(file.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0.2rem', flexShrink: 0 }}
                  title="Remove"
                >
                  <X style={{ width: '0.9rem', height: '0.9rem' }} />
                </button>
              </div>
            ))}

            {files.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-3)' }}>
                <Upload style={{ width: '2rem', height: '2rem', margin: '0 auto 0.75rem', opacity: 0.3 }} />
                <p style={{ fontSize: '0.85rem', margin: 0 }}>Select files or drop them in the drop zone</p>
                <p style={{ fontSize: '0.72rem', margin: '0.25rem 0 0', color: 'var(--text-3)', opacity: 0.7 }}>Supports JPG, EPS, AI, SVG, PNG formats</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Premium Floating Toast Notifications Stack */}
      {createPortal(
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          pointerEvents: 'none'
        }}>
          {toasts.map((t) => {
            const isSuccess = t.type === 'success';
            
            let iconColor = isSuccess ? '#10b981' : '#ef4444';
            let IconComponent = isSuccess ? CheckCircle2 : AlertCircle;
            let title = isSuccess ? 'Upload Successful' : 'Upload Alert';

            return (
              <div 
                key={t.id}
                style={{
                  pointerEvents: 'auto',
                  background: 'rgba(15, 23, 42, 0.95)',
                  color: '#fff',
                  padding: '0.95rem 1.15rem',
                  borderRadius: '0.75rem',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.8rem',
                  animation: 'slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  width: '340px',
                  boxSizing: 'border-box'
                }}
              >
                <IconComponent style={{ width: '1.25rem', height: '1.25rem', color: iconColor, flexShrink: 0, marginTop: '0.1rem' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flexGrow: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</span>
                  <span style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.75)', fontWeight: 500, lineHeight: '1.4', wordBreak: 'break-word' }}>
                    {t.message}
                  </span>
                </div>
                <button 
                  onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.4)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    flexShrink: 0,
                    transition: 'color 0.15s'
                  }}
                  onMouseOver={e => e.currentTarget.style.color = '#fff'}
                  onMouseOut={e => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)'}
                >
                  <X style={{ width: '0.85rem', height: '0.85rem' }} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(100%) scale(0.9); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes ftpProgressGlow {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.2; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
