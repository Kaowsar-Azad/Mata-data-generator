import React, { useState, useRef, useEffect } from "react";
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
  Video,
  LayoutGrid,
  List,
  AlertTriangle
} from "lucide-react";

import { generateMetadata, analyzeImageSecurity } from "../../services/geminiService";
import { processEpsFile, isEpsFile } from "../../services/epsService";

import { computeHashForEntry, detectDuplicates } from "./duplicateDetector";
import { downloadCSV, parseCSV } from "./csvHandlers";
import { StatusBadge } from "./workflowHelpers";
import { ExportFormatModal } from "./ExportFormatModal";
import { MetadataGrid } from "./MetadataGrid";
import { MetadataCardList } from "./MetadataCardList";
import { MetadataEditorPanel } from "./MetadataEditorPanel";

const ACCEPTED_TYPES =
  "image/jpeg,image/png,image/webp,image/gif,image/svg+xml," +
  "application/postscript,application/eps,image/eps,application/x-eps,.eps,.epsf,.epsi," +
  "video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,.mp4,.mov,.avi,.mkv,.webm";

const isVideoFile = (file) => {
  if (file.type && file.type.startsWith('video/')) return true;
  const ext = (file.name || '').split('.').pop().toLowerCase();
  return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
};

export function ImageWorkflow({ apiKeys, apiProvider, promptSettings, setPromptSettings, ftpConfigs = [] }) {
  const [images, setImages] = useState([]);
  const imagesRef = useRef([]);
  imagesRef.current = images;
  const [viewMode, setViewMode] = useState('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const cancelRef = useRef(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [autoEmbed, setAutoEmbed] = useState(() => localStorage.getItem("autoEmbed") === "true");
  const [embeddingCount, setEmbeddingCount] = useState(0);
  const isEmbedding = embeddingCount > 0;
  const [autoUpscale, setAutoUpscale] = useState(() => localStorage.getItem("autoUpscale") === "true");
  const [upscaleScale, setUpscaleScale] = useState(() => parseInt(localStorage.getItem("upscaleScale")) || 2);
  const [upscaleEngine, setUpscaleEngine] = useState(() => localStorage.getItem("upscaleEngine") || "mata_ai");
  const [uploadBatchIds, setUploadBatchIds] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeCell, setActiveCell] = useState(null); // { id: '...', field: '...' }
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set()); // row IDs selected in grid
  const [gridSort, setGridSort] = useState({ field: null, dir: 'asc' }); // column sort
  const [gridFilter, setGridFilter] = useState(''); // quick filter text
  const cellRefs = useRef({}); // { [id_field]: textareaDOM }

  // ─── Duplicate Detection State ─────────────────────────────────────────────
  const [duplicatePairs, setDuplicatePairs] = useState([]);
  const [dismissedDuplicates, setDismissedDuplicates] = useState(false);
  const hashMapRef = useRef({}); // { [imageId]: hashString }

  const getTitleCounterClass = (val) => {
    const len = (val || '').length;
    if (len === 0) return '';
    if (len >= 10 && len <= 120) return 'valid';
    if (len > 120 && len <= 150) return 'warning';
    return 'invalid';
  };

  const getDescriptionCounterClass = (val) => {
    const len = (val || '').length;
    if (len === 0) return '';
    if (len >= 15 && len <= 200) return 'valid';
    if (len > 200 && len <= 250) return 'warning';
    return 'invalid';
  };

  const getKeywordsCounterClass = (val) => {
    const count = (val || '').split(',').map(k => k.trim()).filter(Boolean).length;
    if (count === 0) return '';
    if (count >= 10 && count <= 40) return 'valid';
    if (count > 40 && count <= 50) return 'warning';
    return 'invalid';
  };

  useEffect(() => {
    const savedConcurrency = parseInt(localStorage.getItem('ftp_concurrency') || '3');
    if (window.electronAPI?.setUploadConcurrency) {
      window.electronAPI.setUploadConcurrency(savedConcurrency).catch(e => console.error(e));
    }

    let unsubFtp = null;
    let unsubUpscale = null;

    if (window.electronAPI?.onFtpProgress) {
      unsubFtp = window.electronAPI.onFtpProgress(({ filePath, progress, host }) => {
        setImages(prev => prev.map(img => {
          const p1 = (img.renamedPath || (img.file && img.file.path) || '').replace(/\\/g, '/').toLowerCase();
          const p2 = (img.renamedVisualPath || (img.visualFile && img.visualFile.path) || '').replace(/\\/g, '/').toLowerCase();
          const fPath = filePath.replace(/\\/g, '/').toLowerCase();
          if (p1 === fPath || p2 === fPath) {
            const currentProgressMap = typeof img.uploadProgress === 'object' && img.uploadProgress !== null
              ? { ...img.uploadProgress }
              : {};
            currentProgressMap[host] = progress;
            return { ...img, uploadProgress: currentProgressMap };
          }
          return img;
        }));
      });
    }

    if (window.electronAPI?.onUpscaleProgress) {
      unsubUpscale = window.electronAPI.onUpscaleProgress(({ filePath, progress }) => {
        setImages(prev => prev.map(img => {
          const p1 = (img.visualFile && img.visualFile.path || '').replace(/\\/g, '/').toLowerCase();
          const p2 = (img.file && img.file.path || '').replace(/\\/g, '/').toLowerCase();
          const fPath = filePath.replace(/\\/g, '/').toLowerCase();
          if (p1 === fPath || p2 === fPath) {
            return { ...img, upscaleProgress: progress };
          }
          return img;
          }));
      });
    }

    return () => {
      if (unsubFtp) unsubFtp();
      if (unsubUpscale) unsubUpscale();
    };
  }, []);

  const concurrentLimit = promptSettings?.concurrentLimit || 2;
  const setConcurrentLimit = (val) => {
    if (typeof setPromptSettings === "function") {
      setPromptSettings((prev) => ({ ...prev, concurrentLimit: val }));
    }
  };
  const fileInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = "success") => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    localStorage.setItem("autoUpscale", autoUpscale.toString());
  }, [autoUpscale]);

  useEffect(() => {
    localStorage.setItem("upscaleScale", upscaleScale.toString());
  }, [upscaleScale]);

  useEffect(() => {
    localStorage.setItem("upscaleEngine", upscaleEngine);
  }, [upscaleEngine]);

  const pickMataAIModel = (filePath, engine) => {
    const name = (filePath || '').toLowerCase();
    const isAnimeOrVector =
      name.includes('anime') ||
      name.includes('vector') ||
      name.includes('cartoon') ||
      name.includes('illustration') ||
      name.includes('illust') ||
      name.includes('drawing') ||
      name.includes('art') ||
      name.includes('clip') ||
      name.includes('graphic') ||
      name.endsWith('.svg') ||
      name.endsWith('.ai') ||
      name.endsWith('.eps');

    if (engine === 'fast') return isAnimeOrVector ? 'realesr-animevideov3' : 'realesrgan-x4plus';
    if (engine === 'standard') return 'realesrgan-x4plus';
    if (isAnimeOrVector) return 'realesrgan-x4plus-anime';
    return 'ultrasharp';
  };

  const hasFaceOrPerson = (metadata) => {
    if (!metadata) return false;
    const keywords = Array.isArray(metadata.keywords) 
      ? metadata.keywords.map(k => k.toLowerCase()) 
      : (typeof metadata.keywords === 'string' ? metadata.keywords.split(',').map(k => k.trim().toLowerCase()) : []);
    
    const faceKeywords = [
      'face', 'human', 'person', 'people', 'man', 'woman', 'girl', 'boy', 'portrait', 
      'model', 'eye', 'eyes', 'hair', 'lips', 'mouth', 'nose', 'portraiture', 'headshot',
      'selfie', 'smile', 'facial', 'couple', 'family', 'photographer', 'worker'
    ];
    
    const hasKeyword = keywords.some(kw => faceKeywords.some(fkw => kw.includes(fkw)));
    const textContext = `${metadata.title || ''} ${metadata.description || ''}`.toLowerCase();
    const hasText = faceKeywords.some(fkw => textContext.includes(fkw));
    
    return hasKeyword || hasText;
  };

  const detectModelFromMetadata = (metadata, filePath) => {
    const text = (`${filePath || ''} ${metadata?.title || ''} ${metadata?.keywords || ''} ${metadata?.description || ''}`).toLowerCase();
    
    const isAnimeOrVector = 
      text.includes('anime') || 
      text.includes('vector') || 
      text.includes('illustration') || 
      text.includes('cartoon') || 
      text.includes('drawing') || 
      text.includes('clipart') || 
      text.includes('flat design') || 
      text.includes('graphic');
      
    const is3dRender = 
      text.includes('3d render') || 
      text.includes('cgi') || 
      text.includes('unreal engine') || 
      text.includes('octane render') || 
      text.includes('cinema4d');

    if (isAnimeOrVector) return 'realesrgan-x4plus-anime';
    if (is3dRender) return 'realesrgan-x4plus';
    return 'ultrasharp'; // Default for real photos
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
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

  const isAccepted = (file) => {
    if (isEpsFile(file)) return true;
    if (isVideoFile(file)) return true;
    return file.type.startsWith("image/");
  };

  const addImages = async (files) => {
    const accepted = files.filter(isAccepted);

    if (accepted.length < files.length) {
      const skipped = files.length - accepted.length;
      console.warn(`[Upload] Skipped ${skipped} unsupported file(s).`);
    }

    const fileGroups = {};
    const newEntries = [];
    
    accepted.forEach(file => {
      const isEps = isEpsFile(file);
      const isVideo = isVideoFile(file);
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      
      if (isVideo) {
        newEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          file: file,
          visualFile: null,
          preview: null,
          isEps: false,
          isVideo: true,
          isPaired: false,
          epsData: null,
          status: "pending",
          embeddingStatus: "none",
          result: null,
          error: null,
        });
        return;
      }
      
      if (!fileGroups[baseName]) {
        fileGroups[baseName] = { eps: null, raster: null };
      }
      
      if (isEps) {
        fileGroups[baseName].eps = file;
      } else {
        if (!fileGroups[baseName].raster) {
          fileGroups[baseName].raster = file;
        }
      }
    });

    for (const [_baseName, group] of Object.entries(fileGroups)) {
      if (group.eps && group.raster) {
        newEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          file: group.eps,
          visualFile: group.raster,
          preview: URL.createObjectURL(group.raster),
          isEps: true,
          isPaired: true,
          epsData: null,
          status: "pending",
          embeddingStatus: "none",
          result: null,
          error: null,
        });
      } else if (group.eps) {
        newEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          file: group.eps,
          visualFile: null,
          preview: null,
          isEps: true,
          isPaired: false,
          epsData: null,
          status: "pending",
          embeddingStatus: "none",
          result: null,
          error: null,
        });
      } else if (group.raster) {
        newEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          file: group.raster,
          visualFile: group.raster,
          preview: URL.createObjectURL(group.raster),
          isEps: false,
          isPaired: false,
          epsData: null,
          status: "pending",
          embeddingStatus: "none",
          result: null,
          error: null,
        });
      }
    }

    setImages((prev) => [...prev, ...newEntries]);

    setTimeout(async () => {
      const hashPromises = newEntries
        .filter(e => !e.isVideo)
        .map(async (entry) => {
          const hash = await computeHashForEntry(entry);
          if (hash) {
            hashMapRef.current[entry.id] = hash;
          }
        });
      await Promise.all(hashPromises);

      const currentImages = imagesRef.current;
      const pairs = detectDuplicates(currentImages, [], hashMapRef.current);
      if (pairs.length > 0) {
        setDuplicatePairs(pairs);
        setDismissedDuplicates(false);
      } else {
        setDuplicatePairs([]);
      }
    }, 200);

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

    newEntries
      .filter((e) => e.isVideo)
      .forEach(async (entry) => {
        if (window.electronAPI?.extractVideoFrame && entry.file.path) {
          try {
            const frameResult = await window.electronAPI.extractVideoFrame(entry.file.path);
            if (frameResult.success) {
              setImages((prev) =>
                prev.map((item) =>
                  item.id === entry.id
                    ? { ...item, preview: `data:image/jpeg;base64,${frameResult.base64}` }
                    : item
                )
              );
            }
          } catch (error) {
            console.error("Failed to extract video thumbnail preview:", error);
          }
        }
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

  const removeImage = (id) => {
    setImages((prev) => {
      const img = prev.find(i => i.id === id);
      if (img && img.preview && img.preview.startsWith('blob:')) {
        URL.revokeObjectURL(img.preview);
      }
      return prev.filter((i) => i.id !== id);
    });
    delete hashMapRef.current[id];
    
    Object.keys(cellRefs.current).forEach(key => {
      if (key.startsWith(id + '_')) {
        delete cellRefs.current[key];
      }
    });

    setDuplicatePairs((prev) => prev.filter((p) => p.id1 !== id && p.id2 !== id));
  };

  const clearAll = () => {
    cancelRef.current = true;
    setIsProcessing(false);
    setProgress(0);
    
    // Also cancel active FTP upload
    if (activeJobId && window.electronAPI?.cancelFtp) {
      window.electronAPI.cancelFtp(activeJobId).catch(console.error);
    }
    
    images.forEach(img => {
      if (img.preview && img.preview.startsWith('blob:')) {
        URL.revokeObjectURL(img.preview);
      }
    });
    setImages([]);
    setUploadBatchIds([]);
    setActiveJobId(null);
    hashMapRef.current = {};
    cellRefs.current = {};
    setDuplicatePairs([]);
    setDismissedDuplicates(false);
  };

  const resizeImageToBase64 = (file, maxSize = 800) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      
      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };
      
      img.src = objectUrl;
    });

  const [progress, setProgress] = useState(0);

  const processBatch = async (onlyErrors = false) => {
    if (apiKeys.length === 0) {
      alert("Please add at least one Gemini API key first.");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    cancelRef.current = false;

    const toProcess = images.filter((img) => {
      if (img.status === "done" || img.status === "upscaling" || img.status === "upscale_queued") return false;
      if (onlyErrors && img.status !== "error") return false;
      return true;
    });

    const limit = concurrentLimit;
    const embedPromises = [];

    let processed = 0;
    const activePromises = new Set();
    
    const upscaleQueue = [];
    let upscaleRunning = 0;
    const runUpscaleQueue = async () => {
      if (upscaleRunning >= 1 || upscaleQueue.length === 0) return;
      upscaleRunning++;
      const task = upscaleQueue.shift();
      try {
        await task();
      } catch (e) {
        console.error(e);
      } finally {
        upscaleRunning--;
        runUpscaleQueue();
      }
    };

    for (const img of toProcess) {
      if (cancelRef.current) break;
      setImages((prev) =>
        prev.map((item) =>
          item.id === img.id ? { ...item, status: "processing" } : item
        )
      );

      const p = (async () => {
        try {
            if (cancelRef.current) return;
            let base64, mimeType;
            let isPlaceholder = false;
            let upscaledPath = null;
            let upscaledName = null;

            if (img.isVideo) {
              setImages((prev) =>
                prev.map((item) =>
                  item.id === img.id
                    ? { ...item, status: "extracting" }
                    : item
                )
              );
              if (!window.electronAPI?.extractVideoFrame) {
                throw new Error('Video frame extraction is only available in the desktop app.');
              }
              const extractPromise = window.electronAPI.extractVideoFrame(img.file.path);
              const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('Video frame extraction timed out (60s)')), 60000));
              const frameResult = await Promise.race([extractPromise, timeoutPromise]);
              if (!frameResult.success) {
                throw new Error(`Failed to extract video frame: ${frameResult.error}`);
              }
              base64 = frameResult.base64Array || frameResult.base64;
              mimeType = frameResult.mimeType;
              setImages((prev) =>
                prev.map((item) =>
                  item.id === img.id
                    ? { ...item, preview: `data:image/jpeg;base64,${frameResult.base64}` }
                    : item
                )
              );
            } else if (img.visualFile) {
              const dataUrl = await resizeImageToBase64(img.visualFile, 800);
              base64 = dataUrl.split(",")[1];
              mimeType = "image/jpeg";
            } else if (img.isEps) {
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

            if (cancelRef.current) return;
            if (promptSettings?.securityScanEnabled) {
              setImages((prev) =>
                prev.map((item) =>
                  item.id === img.id
                    ? { ...item, status: "scanning" }
                    : item
                )
              );
              const securityRes = await analyzeImageSecurity(
                base64,
                mimeType,
                apiKeys,
                apiProvider || "gemini"
              );
              if (!securityRes.isSafe) {
                throw new Error(`Policy Violation: ${securityRes.reason}`);
              }
            }

            const fileInfo = {
              isEps: img.isEps,
              isVideo: img.isVideo || false,
              isPlaceholder: isPlaceholder,
              fileName: img.file?.name,
              extractedTextContext: img.epsData?.extractedTextContext || null,
              promptSettings: promptSettings,
            };

            if (cancelRef.current) return;
            const metadata = await generateMetadata(
              base64,
              mimeType,
              apiKeys,
              apiProvider || "gemini",
              fileInfo
            );

            const targetPath = img.visualFile?.path || (!img.isEps && !img.isVideo ? img.file?.path : null);
            const needsUpscale = (autoUpscale && window.electronAPI && targetPath && !img.isVideo);

            setImages((prev) =>
              prev.map((item) =>
                item.id === img.id
                  ? { ...item, result: metadata, status: needsUpscale ? "upscale_queued" : "done" }
                  : item
              )
            );

            if (cancelRef.current) return;
            
            const postMetadataTask = async () => {
              if (cancelRef.current) return;
              try {
            if (needsUpscale) {
              try {
                setImages((prev) =>
                  prev.map((item) =>
                    item.id === img.id
                      ? { ...item, status: "upscaling", upscaleProgress: 0 }
                      : item
                  )
                );

                const normalizedPath = targetPath.replace(/\\/g, '/');
                const lastSeparator = normalizedPath.lastIndexOf('/');
                const folderPath = lastSeparator > -1 ? targetPath.substring(0, lastSeparator) : '.';
                const originalFileName = lastSeparator > -1 ? targetPath.substring(lastSeparator + 1) : targetPath;
                const lastDot = originalFileName.lastIndexOf('.');
                const baseName = lastDot > -1 ? originalFileName.substring(0, lastDot) : originalFileName;
                const ext = lastDot > -1 ? originalFileName.substring(lastDot) : '.jpg';
                const pathSeparator = targetPath.includes('\\') ? '\\' : '/';
                const upscaleFolder = `${folderPath}${pathSeparator}Upscaled`;
                const outputFormat = ext.toLowerCase() === '.png' ? 'png' : 'jpg';
                const upscaledMimeType = outputFormat === 'png' ? 'image/png' : 'image/jpeg';

                const smartNameForModel = img.file?.name || originalFileName;
                let modelName;
                
                if (upscaleEngine === 'auto_detect') {
                  modelName = detectModelFromMetadata(metadata, smartNameForModel);
                } else if (upscaleEngine === 'mata_ai') {
                  modelName = hasFaceOrPerson(metadata) ? 'mata_ai_face' : 'mata_ai';
                } else {
                  modelName = pickMataAIModel(smartNameForModel, upscaleEngine);
                }
                
                console.log(`[Mata AI] Engine: ${upscaleEngine} | Model: ${modelName} | File: ${smartNameForModel}`);

                let arrayBuffer;

                try {
                  const upscalePromise = window.electronAPI.upscaleLocalNcnn(
                    targetPath,
                    upscaleScale,
                    modelName,
                    outputFormat,
                    upscaleFolder
                  );
                  const upscaleTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Local GPU upscaler timed out (15m limit)')), 900000));
                  
                  const localRes = await Promise.race([upscalePromise, upscaleTimeout]);
                  if (!localRes || !localRes.success) {
                    throw new Error(localRes?.error || 'Local GPU upscaler returned failure');
                  }
                  
                  upscaledPath = localRes.path;
                  upscaledName = upscaledPath.substring(upscaledPath.lastIndexOf(pathSeparator) + 1);
                  console.log(`[Mata AI] ✅ Local GPU success → ${upscaledName}`);
                } catch (localErr) {
                  console.warn('[Mata AI] Local GPU failed, falling back to server API...', localErr.message);
                  const formData = new FormData();
                  formData.append('scale', upscaleScale);
                  formData.append('filePath', targetPath);
                  const upscaleRes = await fetch('http://127.0.0.1:3002/api/upscale', {
                    method: 'POST',
                    body: formData
                  });
                  if (!upscaleRes.ok) {
                    const errData = await upscaleRes.json().catch(() => ({}));
                    throw new Error(errData.error || upscaleRes.statusText);
                  }
                  arrayBuffer = await upscaleRes.arrayBuffer();
                  const savePath = `${upscaleFolder}${pathSeparator}${baseName}_${upscaleScale}x${ext}`;
                  const saveRes = await window.electronAPI.saveFile(savePath, new Uint8Array(arrayBuffer));
                  if (!saveRes.success) throw new Error(saveRes.error);
                  upscaledPath = savePath;
                  upscaledName = `${baseName}_${upscaleScale}x${ext}`;
                  console.log(`[Mata AI] ✅ Server API fallback success: ${upscaledName}`);
                }

                setImages((prev) =>
                  prev.map((item) => {
                    if (item.id === img.id) {
                      const updatedItem = { ...item };
                      if (item.isEps) {
                        updatedItem.renamedVisualPath = upscaledPath;
                      } else {
                        updatedItem.file = {
                          ...item.file,
                          path: upscaledPath,
                          name: upscaledName
                        };
                        updatedItem.visualFile = {
                          ...item.visualFile,
                          path: upscaledPath,
                          name: upscaledName
                        };
                      }
                      if (arrayBuffer) {
                        const blob = new Blob([arrayBuffer], { type: upscaledMimeType });
                        updatedItem.preview = URL.createObjectURL(blob);
                      }
                      return updatedItem;
                    }
                    return item;
                  })
                );
              } catch (upscaleErr) {
                console.error('[Mata AI] Upscale error:', upscaleErr);
                throw new Error(`Auto-Upscale failed: ${upscaleErr.message}`);
              }
            }

            setImages((prev) =>
              prev.map((item) =>
                item.id === img.id
                  ? { ...item, status: "done" }
                  : item
              )
            );

            if (autoEmbed && window.electronAPI) {
              const doneImg = {
                ...img,
                status: "done",
                result: metadata,
                renamedPath: upscaledPath || img.renamedPath,
                renamedVisualPath: upscaledPath || img.renamedVisualPath,
                renamedName: upscaledName || img.renamedName
              };
              if (upscaledPath) {
                if (doneImg.isEps) {
                  doneImg.renamedVisualPath = upscaledPath;
                } else {
                  doneImg.file = {
                    ...doneImg.file,
                    path: upscaledPath,
                    name: upscaledName
                  };
                  doneImg.visualFile = {
                    ...doneImg.visualFile,
                    path: upscaledPath,
                    name: upscaledName
                  };
                }
              }
              const p = embedMetadataToFiles([doneImg], false, false);
              embedPromises.push(p);
            }
          } catch (err) {
            setImages((prev) =>
                prev.map((item) =>
                  item.id === img.id
                    ? { ...item, status: "error", error: err.message || 'Unknown error occurred. Please check your API key or network connection.' }
                    : item
                )
              );
            } finally {
              processed++;
              setProgress(Math.round((processed / toProcess.length) * 100));
            }
          };

          if (needsUpscale) {
            upscaleQueue.push(postMetadataTask);
            runUpscaleQueue();
          } else {
            postMetadataTask();
          }
      } catch (err) {
          setImages((prev) =>
            prev.map((item) =>
              item.id === img.id
                ? { ...item, status: "error", error: err.message || 'Unknown error occurred.' }
                : item
            )
          );
          processed++;
          setProgress(Math.round((processed / toProcess.length) * 100));
      }
    })();

      activePromises.add(p);
      p.finally(() => activePromises.delete(p));

      if (cancelRef.current) {
        setIsProcessing(false);
        return;
      }
      if (activePromises.size >= limit) {
        await Promise.race(activePromises);
      }
      
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    await Promise.all(activePromises);

    while (upscaleRunning > 0 || upscaleQueue.length > 0) {
      if (cancelRef.current) break;
      await new Promise(r => setTimeout(r, 200));
    }

    if (cancelRef.current) {
      setIsProcessing(false);
      return;
    }

    setIsProcessing(false);
    setTimeout(() => setProgress(0), 1000);
    
    if (autoEmbed && window.electronAPI && embedPromises.length > 0) {
      await Promise.allSettled(embedPromises);
    }
    
    setTimeout(() => {
      const latestImages = imagesRef.current;
      const doneImages = latestImages.filter(img => img.status === "done" && img.result && img.embeddingStatus === "none");
      if (doneImages.length > 0 && window.electronAPI) {
        if (autoEmbed) {
          // already handled
        } else {
          if (!localStorage.getItem('embedToastSeen')) {
            setShowPermissionModal(true);
            localStorage.setItem('embedToastSeen', 'true');
          }
        }
      }
    }, 500);
  };
  
  const embedMetadataToFiles = async (imagesToProcess, forceUpload = false, skipAdobeUpload = false) => {
    setShowPermissionModal(false);
    if (!window.electronAPI) return;
    
    setEmbeddingCount(prev => prev + 1);
    
    try {
      const activeFtpConfigs = ftpConfigs.filter(c => c.enabled);
      
      const currentImages = (Array.isArray(imagesToProcess) 
        ? imagesToProcess 
        : imagesRef.current.filter(img => img.status === "done" && img.result))
        .filter(img => img.embeddingStatus === "none" || img.embeddingStatus === "error");
      
      if (currentImages.length === 0) {
        return;
      }
      
      setUploadBatchIds(currentImages.map(img => img.id));
      
      setImages(prev => prev.map(img => {
        const shouldEmbed = currentImages.some(ci => ci.id === img.id);
        if (shouldEmbed) {
          return { ...img, embeddingStatus: "embedding", embeddingError: null };
        }
        return img;
      }));
      
      const embeddedImages = [];
      const filesToUpload = [];
      
      for (const img of currentImages) {
        try {
          if (cancelRef.current) return;
          const pathsToEmbed = [];

          // Resolve primary path — verify it exists on disk, fallback to original if renamed path is gone
          let resolvedPrimaryPath = img.renamedPath || img.file?.path;
          if (resolvedPrimaryPath && window.electronAPI?.checkFileExists) {
            const check = await window.electronAPI.checkFileExists(resolvedPrimaryPath);
            resolvedPrimaryPath = check.resolvedPath; // may swap .jpeg <-> .jpg or stay same
            if (!check.exists && img.file?.path && img.file.path !== resolvedPrimaryPath) {
              // Fallback to original file path if renamed path is completely missing
              const origCheck = await window.electronAPI.checkFileExists(img.file.path);
              if (origCheck.exists) resolvedPrimaryPath = origCheck.resolvedPath;
            }
          }
          if (resolvedPrimaryPath) pathsToEmbed.push({ type: 'primary', path: resolvedPrimaryPath });

          // Resolve visual path for EPS files
          let resolvedVisualPath = img.renamedVisualPath || img.visualFile?.path;
          if (resolvedVisualPath && window.electronAPI?.checkFileExists) {
            const check = await window.electronAPI.checkFileExists(resolvedVisualPath);
            resolvedVisualPath = check.resolvedPath;
          }
          if (img.isEps && resolvedVisualPath && resolvedVisualPath !== resolvedPrimaryPath) {
            pathsToEmbed.push({ type: 'visual', path: resolvedVisualPath });
          }
          
          let success = true;
          let errMsg = '';
          let newPrimaryPath = img.renamedPath;
          let newVisualPath = img.renamedVisualPath;
          let newPrimaryName = img.renamedName;
          
          for (const target of pathsToEmbed) {
            if (cancelRef.current) return;
            const res = await window.electronAPI.writeMetadata(
              target.path,
              img.result.title || '',
              img.result.description || '',
              img.result.keywords || '',
              img.result.categories || []
            );
            if (!res.success) {
              success = false;
              errMsg = res.error || 'Failed to embed';
            } else {
              if (target.type === 'primary') {
                newPrimaryPath = res.newPath || targetPrimary;
                newPrimaryName = res.newFileName || newPrimaryName;
              }
              if (target.type === 'visual') {
                newVisualPath = res.newPath || targetVisual;
              }
            }
          }
          
          if (success) {
            const updatedImg = {
              ...img,
              renamedPath: newPrimaryPath,
              renamedVisualPath: newVisualPath,
              renamedName: newPrimaryName
            };
            embeddedImages.push(updatedImg);
            
            if (newPrimaryPath) filesToUpload.push(newPrimaryPath);
            if (newVisualPath && newVisualPath !== newPrimaryPath) filesToUpload.push(newVisualPath);
            
            setImages(prev => prev.map(item => 
              item.id === img.id 
                ? { 
                    ...item, 
                    embeddingStatus: ((autoEmbed || forceUpload) && activeFtpConfigs.length > 0) ? "uploading" : "success", 
                    renamedPath: newPrimaryPath,
                    renamedVisualPath: newVisualPath,
                    renamedName: newPrimaryName
                  } 
                : item
            ));
          } else {
            setImages(prev => prev.map(item => 
              item.id === img.id 
                ? { ...item, embeddingStatus: "error", embeddingError: errMsg } 
                : item
            ));
          }
        } catch (err) {
          setImages(prev => prev.map(item => 
            item.id === img.id 
              ? { ...item, embeddingStatus: "error", embeddingError: err.message } 
              : item
          ));
        }
      }
      
      const uploadConfigs = activeFtpConfigs;

      if ((autoEmbed || forceUpload) && uploadConfigs.length > 0 && filesToUpload.length > 0) {
        setImages(prev => prev.map(item => {
          const isEmbedded = embeddedImages.some(ei => ei.id === item.id);
          if (isEmbedded) {
            return { ...item, embeddingStatus: "uploading", uploadProgress: {}, embeddingError: null };
          }
          return item;
        }));
        
        const jobId = Math.random().toString(36).substr(2, 9);
        setActiveJobId(jobId);
        
        try {
          const uploadPromises = uploadConfigs.map(async (conf) => {
            const ftpRes = await window.electronAPI.uploadFtp(conf, filesToUpload, jobId);
            if (!ftpRes.success) {
              throw new Error(`Failed on ${conf.websiteName || conf.host}: ${ftpRes.error}`);
            }
            return { host: conf.websiteName || conf.host, fileErrors: ftpRes.fileErrors || {} };
          });
          
          const uploadResults = await Promise.all(uploadPromises);

          const fileErrorsMap = {};
          for (const res of uploadResults) {
            for (const [filePath, err] of Object.entries(res.fileErrors)) {
              if (err) {
                const normalizedPath = filePath.replace(/\\/g, '/');
                if (!fileErrorsMap[normalizedPath]) fileErrorsMap[normalizedPath] = {};
                fileErrorsMap[normalizedPath][res.host] = err;
              }
            }
          }

          setImages(prev => prev.map(item => {
            const isEmbedded = embeddedImages.some(ei => ei.id === item.id);
            if (!isEmbedded) return item;

            const primaryPath = (item.renamedPath || item.file?.path || '').replace(/\\/g, '/');
            const visualPath = (item.renamedVisualPath || item.visualFile?.path || '').replace(/\\/g, '/');

            const primaryErrors = fileErrorsMap[primaryPath];
            const visualErrors = item.isEps && visualPath !== primaryPath ? fileErrorsMap[visualPath] : null;

            const mergedErrors = { ...(primaryErrors || {}), ...(visualErrors || {}) };

            if (Object.keys(mergedErrors).length > 0) {
              const errMsg = Object.entries(mergedErrors).map(([h, err]) => `${h}: ${err}`).join(', ');
              return { ...item, embeddingStatus: "error", embeddingError: errMsg };
            } else {
              return { ...item, embeddingStatus: "success", embeddingError: null };
            }
          }));

          const failedCount = embeddedImages.filter(img => {
            const primaryPath = (img.renamedPath || img.file?.path || '').replace(/\\/g, '/');
            const visualPath = (img.renamedVisualPath || img.visualFile?.path || '').replace(/\\/g, '/');
            const primaryErrors = fileErrorsMap[primaryPath];
            const visualErrors = img.isEps && visualPath !== primaryPath ? fileErrorsMap[visualPath] : null;
            return (primaryErrors && Object.keys(primaryErrors).length > 0) || (visualErrors && Object.keys(visualErrors).length > 0);
          }).length;

          const successCount = embeddedImages.length - failedCount;

          if (failedCount > 0) {
            showToast(`মেটাডাটা এম্বেড হয়েছে, কিন্তু ${failedCount}টি ফাইল আপলোড ব্যর্থ হয়েছে।`, "error");
          } else {
            if (successCount === 1) {
              showToast(`"${embeddedImages[0].renamedName || embeddedImages[0].file.name}" সফলভাবে FTP-তে আপলোড করা হয়েছে!`, "success");
            } else {
              showToast(`${successCount}টি ফাইল সফলভাবে FTP-তে আপলোড করা হয়েছে!`, "success");
            }
          }

        } catch (uploadErr) {
          setImages(prev => prev.map(item => {
            const isEmbedded = embeddedImages.some(ei => ei.id === item.id);
            if (isEmbedded) {
              return { ...item, embeddingStatus: "error", embeddingError: uploadErr.message };
            }
            return item;
          }));
          showToast(`FTP আপলোড ব্যর্থ হয়েছে: ${uploadErr.message}`, "error");
        } finally {
          setActiveJobId(null);
        }
      } else if (embeddedImages.length > 0 && (!skipAdobeUpload || uploadConfigs.length > 0)) {
        if (embeddedImages.length === 1) {
          showToast(`"${embeddedImages[0].renamedName || embeddedImages[0].file.name}" ফাইলে মেটাডাটা সফলভাবে এম্বেড করা হয়েছে!`, "success");
        } else if (embeddedImages.length > 1) {
          showToast(`${embeddedImages.length}টি ফাইলে মেটাডাটা সফলভাবে এম্বেড করা হয়েছে!`, "success");
        }
      }
    } finally {
      setEmbeddingCount(prev => Math.max(0, prev - 1));
    }
  };
  
  const retryEmbedAndUpload = () => {
    const failedImages = images.filter(img => img.embeddingStatus === "error");
    if (failedImages.length > 0) {
      embedMetadataToFiles(failedImages, true);
    }
  };

  const handleAutoEmbedChange = (e) => {
    const checked = e.target.checked;
    setAutoEmbed(checked);
    localStorage.setItem("autoEmbed", checked ? "true" : "false");
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      try {
        const rows = parseCSV(text);
        if (rows.length < 2) {
          showToast("CSV ফাইলে কোনো ডেটা পাওয়া যায়নি।", "error");
          return;
        }

        const headers = rows[0].map(h => String(h || '').trim().toLowerCase().replace(/[\s_-]+/g, ''));
        
        const filenameIdx = headers.findIndex(h => h.includes('filename') || h.includes('file'));
        const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('name'));
        const descIdx = headers.findIndex(h => h.includes('description') || h.includes('desc') || h.includes('caption'));
        const keywordsIdx = headers.findIndex(h => h.includes('keywords') || h.includes('tags') || h.includes('subject'));

        if (filenameIdx === -1) {
          showToast("CSV ফাইলে 'Filename' কলামটি পাওয়া যায়নি।", "error");
          return;
        }

        let updateCount = 0;
        const newImages = [...images];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const csvFilename = String(row[filenameIdx] || '').trim();
          if (!csvFilename) continue;

          const matchIdx = newImages.findIndex(img => {
            const currentName = img.renamedName || img.file?.name || '';
            if (currentName.toLowerCase() === csvFilename.toLowerCase()) return true;
            const base1 = currentName.substring(0, currentName.lastIndexOf('.')) || currentName;
            const base2 = csvFilename.substring(0, csvFilename.lastIndexOf('.')) || csvFilename;
            return base1.toLowerCase() === base2.toLowerCase();
          });

          if (matchIdx !== -1) {
            const title = titleIdx !== -1 ? String(row[titleIdx] || '').trim() : '';
            const description = descIdx !== -1 ? String(row[descIdx] || '').trim() : '';
            const keywords = keywordsIdx !== -1 ? String(row[keywordsIdx] || '').trim() : '';

            newImages[matchIdx] = {
              ...newImages[matchIdx],
              status: 'done',
              result: {
                ...(newImages[matchIdx].result || {}),
                title: title || newImages[matchIdx].result?.title || '',
                description: description || newImages[matchIdx].result?.description || '',
                keywords: keywords || newImages[matchIdx].result?.keywords || '',
              }
            };
            updateCount++;
          }
        }

        if (updateCount > 0) {
          setImages(newImages);
          showToast(`${updateCount}টি ফাইলের মেটাডাটা CSV থেকে সফলভাবে ইমপোর্ট করা হয়েছে!`, "success");
        } else {
          showToast("CSV ফাইলের নামের সাথে রানিং কোনো ইমেজের মিল পাওয়া যায়নি।", "warning");
        }
      } catch (err) {
        showToast(`CSV ইমপোর্ট করতে সমস্যা হয়েছে: ${err.message}`, "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

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

  const applyToSelected = (sourceId, field, value) => {
    if (selectedRows.size < 2) return;
    setImages((prev) =>
      prev.map((img) => {
        if (selectedRows.has(img.id) && img.result) {
          return { ...img, result: { ...img.result, [field]: value } };
        }
        return img;
      })
    );
  };

  const getGridImages = () => {
    let list = [...images];
    if (gridFilter.trim()) {
      const q = gridFilter.toLowerCase();
      list = list.filter(img =>
        (img.file?.name || '').toLowerCase().includes(q) ||
        (img.result?.title || '').toLowerCase().includes(q) ||
        (img.result?.keywords || '').toLowerCase().includes(q)
      );
    }
    if (gridSort.field) {
      list.sort((a, b) => {
        let av = '', bv = '';
        if (gridSort.field === 'filename') { av = a.file?.name || ''; bv = b.file?.name || ''; }
        else if (gridSort.field === 'status') { av = a.status || ''; bv = b.status || ''; }
        else if (gridSort.field === 'title') { av = a.result?.title || ''; bv = b.result?.title || ''; }
        else if (gridSort.field === 'score') { av = Number(a.result?.sellingScore ?? -1); bv = Number(b.result?.sellingScore ?? -1); }
        if (typeof av === 'number') return gridSort.dir === 'asc' ? av - bv : bv - av;
        return gridSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return list;
  };

  const toggleSort = (field) => {
    setGridSort(prev => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getProviderName = (prov) => {
    const map = {
      gemini: "Gemini",
      groq: "Groq",
      openrouter: "OpenRouter",
      openai: "OpenAI",
      mistral: "Mistral"
    };
    return map[prov] || "Gemini";
  };
  const activeProviderName = getProviderName(Array.isArray(apiProvider) ? apiProvider[0] : apiProvider);

  const doneCount = images.filter((i) => i.result !== null).length;
  const errorCount = images.filter((i) => i.status === "error").length;
  const pendingCount = images.filter((i) => i.status === "pending").length;
  const epsCount = images.filter((i) => i.isEps).length;

  const embeddingSuccessCount = images.filter((i) => i.embeddingStatus === "success").length;
  const embeddingErrorCount = images.filter((i) => i.embeddingStatus === "error").length;

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
          <h2 style={{ marginBottom: '0.4rem', fontSize: '1.2rem' }}>Upload Media, EPS or Video Files</h2>
          <p className="text-muted" style={{ marginBottom: '1rem' }}>
            Drag & drop or click — JPG, PNG, WebP, GIF, SVG, <span style={{ color: 'var(--accent)', fontWeight: 700 }}>EPS</span> & MP4/MOV
          </p>
          <div className="flex gap-3">
            <span className="eps-badge"><FileCode2 className="w-3 h-3" /> EPS Vector</span>
            <span className="img-badge"><ImageIcon className="w-3 h-3" /> Raster Image</span>
            <span className="eps-indicator" style={{ background: 'rgba(124,58,237,0.15)', color: '#a855f7', padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Video className="w-3 h-3" /> Video</span>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.75rem' }}>
            Maximum recommended: 50 files per batch
          </p>
        </div>
      </div>

      {/* ERROR BANNER */}
      {errorCount > 0 && (
        <div className="glass card animate-fade-in" style={{ borderLeft: '4px solid var(--danger)', background: 'rgba(248,113,113,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'var(--danger)', fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RefreshCw className="w-4 h-4" /> 
              {errorCount} File{errorCount !== 1 ? 's' : ''} Failed to Generate
            </h3>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
              কিছু ফাইলের মেটাডেটা তৈরি হয়নি (সম্ভবত API rate limit বা সংযোগ সমস্যার কারণে)। শুধু ব্যর্থ ফাইলগুলো পুনরায় চেষ্টা করতে পারেন।
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

      {/* UPLOAD ERROR BANNER */}
      {embeddingErrorCount > 0 && (
        <div className="glass card animate-fade-in mt-4" style={{ borderLeft: '4px solid var(--danger)', background: 'rgba(248,113,113,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'var(--danger)', fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RefreshCw className="w-4 h-4" /> 
              {embeddingErrorCount} File{embeddingErrorCount !== 1 ? 's' : ''} Failed to Upload/Embed
            </h3>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
              কিছু ফাইল আপলোড বা এম্বেড হতে ব্যর্থ হয়েছে (সম্ভবত নেটওয়ার্ক বা সার্ভার সমস্যার কারণে)। শুধু ব্যর্থ ফাইলগুলো পুনরায় চেষ্টা করুন।
            </p>
          </div>
          <button
            className="btn-primary shrink-0"
            style={{ background: 'var(--danger)', boxShadow: '0 4px 15px rgba(248,113,113,0.3)' }}
            disabled={isEmbedding}
            onClick={() => retryEmbedAndUpload()}
          >
            {isEmbedding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isEmbedding ? 'Retrying...' : 'Retry Failed Uploads'}
          </button>
        </div>
      )}

      {/* DUPLICATE DETECTION BANNER */}
      {duplicatePairs.length > 0 && !dismissedDuplicates && (
        <div
          className="glass card animate-fade-in"
          style={{
            borderLeft: '4px solid #f59e0b',
            background: 'rgba(245,158,11,0.05)',
            padding: '0.85rem 1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ color: '#f59e0b', fontSize: '0.95rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.55rem' }}>
                <AlertTriangle style={{ width: '1rem', height: '1rem', flexShrink: 0 }} />
                {duplicatePairs.length} Duplicate{duplicatePairs.length !== 1 ? 's' : ''} Detected
                <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-3)', marginLeft: '0.25rem' }}>
                  — এই ছবিগুলো প্রায় একই। স্টক সাইট reject করতে পারে!
                </span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {duplicatePairs.map((pair, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: 'rgba(245,158,11,0.08)',
                      borderRadius: '0.4rem',
                      padding: '0.3rem 0.6rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pair.name1}>
                      {pair.name1}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>≈</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pair.name2}>
                      {pair.name2}
                    </span>
                    <span style={{ fontSize: '0.65rem', background: pair.similarity >= 95 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: pair.similarity >= 95 ? '#ef4444' : '#f59e0b', borderRadius: '999px', padding: '1px 7px', fontWeight: 700, marginLeft: 'auto' }}>
                      {pair.similarity}% match
                    </span>
                    <button
                      title={`Remove "${pair.name2}" (keep first)`}
                      onClick={() => removeImage(pair.id2)}
                      style={{
                        background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        color: '#ef4444',
                        borderRadius: '0.35rem',
                        padding: '2px 8px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        flexShrink: 0,
                        transition: 'background 0.15s',
                      }}
                    >
                      <Trash2 style={{ width: '0.6rem', height: '0.6rem' }} /> Remove 2nd
                    </button>
                    <button
                      title={`Remove "${pair.name1}" (keep second)`}
                      onClick={() => removeImage(pair.id1)}
                      style={{
                        background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        color: '#ef4444',
                        borderRadius: '0.35rem',
                        padding: '2px 8px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        flexShrink: 0,
                        transition: 'background 0.15s',
                      }}
                    >
                      <Trash2 style={{ width: '0.6rem', height: '0.6rem' }} /> Remove 1st
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => setDismissedDuplicates(true)}
              title="Dismiss warning"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-3)',
                cursor: 'pointer',
                padding: '2px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                marginTop: '2px',
              }}
            >
              <X style={{ width: '0.9rem', height: '0.9rem' }} />
            </button>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {isProcessing && progress > 0 && (
        <div style={{ width: '100%', margin: '10px 0' }}>
          <div style={{ height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #06b6d4)', transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: '2px', textAlign: 'right' }}>{progress}%</div>
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

            <div style={{ width: '1px', height: '1.2rem', background: 'var(--glass-border)' }}></div>

            <div className="flex gap-3 text-sm font-semibold">
              <span className="text-muted" title="Waiting to process">⏳ {pendingCount}</span>
              <span style={{ color: 'var(--success)' }} title="Successfully generated">✔ {doneCount}</span>
              {errorCount > 0 && (
                <span style={{ color: 'var(--danger)' }} title="Failed (Rate limit or error)">✖ {errorCount}</span>
              )}
              {embeddingSuccessCount > 0 && (
                <span style={{ color: '#10b981', marginLeft: '0.5rem' }} title="Successfully Uploaded/Embedded">🚀 {embeddingSuccessCount} Uploaded</span>
              )}
              {embeddingErrorCount > 0 && (
                <span style={{ color: '#ef4444' }} title="Failed Upload/Embed">✖ {embeddingErrorCount} Failed Upload</span>
              )}
            </div>

            <button className="btn-outline" style={{ color: 'var(--danger)', fontSize: '0.75rem', padding: '0.3rem 0.6rem', marginLeft: 'auto' }} onClick={clearAll}>
              <Trash2 className="w-3 h-3" /> Clear All
            </button>
          </div>

          <div className="flex gap-2 flex-wrap mt-3 sm:mt-0 items-center">
            {window.electronAPI && (
              <>
                <label 
                  className="flex items-center gap-2 text-sm cursor-pointer mr-2 select-none"
                  title="Automatically embed metadata and upload to FTP when generation finishes"
                  style={{ color: autoEmbed ? 'var(--accent)' : 'var(--text-3)', transition: 'color 0.2s' }}
                >
                  <input 
                    type="checkbox" 
                    checked={autoEmbed} 
                    onChange={handleAutoEmbedChange}
                    style={{ accentColor: 'var(--accent)', width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: autoEmbed ? 600 : 500 }}>Auto Embed & Upload</span>
                </label>
                
                <label 
                  className="flex items-center gap-2 text-sm cursor-pointer mr-2 select-none"
                  title="Automatically upscale images before generating metadata"
                  style={{ color: autoUpscale ? 'var(--accent)' : 'var(--text-3)', transition: 'color 0.2s' }}
                >
                  <input 
                    type="checkbox" 
                    checked={autoUpscale} 
                    onChange={(e) => setAutoUpscale(e.target.checked)}
                    style={{ accentColor: 'var(--accent)', width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: autoUpscale ? 600 : 500 }}>Auto Upscale</span>
                </label>
                
                {autoUpscale && (
                  <>
                    <select
                      value={upscaleScale}
                      onChange={(e) => setUpscaleScale(parseInt(e.target.value) || 2)}
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.4rem',
                        background: 'var(--surface-2)',
                        color: 'var(--text-1)',
                        border: '1px solid var(--glass-border)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        marginRight: '0.35rem',
                        outline: 'none'
                      }}
                    >
                      <option value="2">2x</option>
                      <option value="3">3x</option>
                      <option value="4">4x</option>
                      <option value="5">5x</option>
                      <option value="6">6x</option>
                      <option value="8">8x</option>
                      <option value="10">10x</option>
                    </select>

                    <select
                      value={upscaleEngine}
                      onChange={(e) => setUpscaleEngine(e.target.value)}
                      title="Mata AI: Smart model auto-selection for best quality"
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.4rem',
                        background: upscaleEngine === 'mata_ai' ? 'linear-gradient(135deg, #7c3aed22, #2563eb22)' : 'var(--surface-2)',
                        color: 'var(--text-1)',
                        border: upscaleEngine === 'mata_ai' ? '1px solid #7c3aed88' : '1px solid var(--glass-border)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        marginRight: '0.75rem',
                        outline: 'none',
                        fontWeight: upscaleEngine === 'mata_ai' ? 600 : 400
                      }}
                    >
                      <option value="mata_ai">✨ Mata AI</option>
                      <option value="auto_detect">🔍 Auto Detect</option>
                      <option value="fast">⚡ Fast</option>
                    </select>
                  </>
                )}
              </>
            )}

            <div className="flex items-center gap-1 p-1 rounded-md" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', marginRight: '0.5rem' }}>
              <button
                className="btn-icon"
                style={{ padding: '0.3rem', borderRadius: '0.3rem', background: viewMode === 'card' ? 'var(--surface-3)' : 'transparent', color: viewMode === 'card' ? 'var(--text-1)' : 'var(--text-3)', border: 'none', cursor: 'pointer' }}
                onClick={() => { setViewMode('card'); setSelectedRows(new Set()); }}
                title="Card View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                className="btn-icon"
                style={{ padding: '0.3rem', borderRadius: '0.3rem', background: viewMode === 'grid' ? 'var(--surface-3)' : 'transparent', color: viewMode === 'grid' ? 'var(--text-1)' : 'var(--text-3)', border: 'none', cursor: 'pointer' }}
                onClick={() => setViewMode('grid')}
                title="Spreadsheet View (Bulk Edit)"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            {viewMode === 'grid' && (
              <div className="flex items-center gap-2" style={{ marginRight: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Filter rows..."
                  value={gridFilter}
                  onChange={e => setGridFilter(e.target.value)}
                  className="grid-filter-input"
                />
                {selectedRows.size > 0 && (
                  <span className="grid-selected-pill">
                    {selectedRows.size} selected · Ctrl+Enter to apply
                  </span>
                )}
              </div>
            )}



            <button
              className="btn-primary"
              disabled={isProcessing || images.every(img => img.status === 'done')}
              onClick={() => processBatch(false)}
              title="Keyboard shortcut: Enter"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isProcessing ? 'Generating...' : (images.every(img => img.status === 'done') ? 'All Done!' : 'Generate All')}
            </button>
            
            {window.electronAPI ? (
              <button
                className={`btn-outline ${doneCount > 0 && !isProcessing && !isEmbedding ? 'animate-pulse' : ''}`}
                style={{ 
                  color: 'var(--accent)', 
                  borderColor: doneCount > 0 && !isProcessing && !isEmbedding ? 'var(--accent)' : 'var(--glass-border)',
                  opacity: doneCount === 0 ? 0.6 : undefined,
                  boxShadow: doneCount > 0 && !isProcessing && !isEmbedding ? '0 0 15px var(--accent-glow)' : 'none',
                  transition: 'background-color 0.3s, border-color 0.3s, box-shadow 0.3s'
                }}
                disabled={isEmbedding || doneCount === 0}
                onClick={() => {
                  setShowPermissionModal(true);
                  localStorage.setItem('embedToastSeen', 'true');
                }}
                title="Embed Title & Keywords into your original files"
              >
                {isEmbedding ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {isEmbedding ? 'Embedding...' : 'Embed to Files'}
              </button>
            ) : (
              <button
                className="btn-outline"
                style={{ color: 'var(--text-3)', borderColor: 'var(--glass-border)', opacity: 0.6, cursor: 'not-allowed' }}
                onClick={() => alert("ফাইলের ভেতর সরাসরি মেটাডেটা এম্বেড করতে অ্যাপটি ডেস্কটপ অ্যাপ্লিকেশন হিসেবে চালান (npm run app:dev)। ব্রাউজারে এটি সম্ভব নয়।")}
                title="Direct embedding is only supported in Desktop app mode"
                disabled={doneCount === 0}
              >
                <CheckCircle2 className="w-4 h-4" /> Embed to Files
              </button>
            )}

            <button
              className="btn-outline"
              style={{ color: 'var(--success)', borderColor: 'rgba(52,211,153,0.25)' }}
              disabled={isProcessing || doneCount === 0}
              onClick={() => setShowExportModal(true)}
            >
              <Download className="w-4 h-4" /> Export CSV ({doneCount})
            </button>
          </div>
          {!window.electronAPI && (
            <div style={{ width: '100%', borderTop: '1px solid var(--glass-border)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--warning)', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                ⚠️ ফাইলের ভেতর সরাসরি মেটাডেটা এম্বেড করার জন্য অ্যাপটি ডেস্কটপ সংস্করণে চালান: <code style={{background: 'var(--surface-3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent)'}}>npm run app:dev</code>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Overall Upload Progress Bar at the Top */}
      {uploadBatchIds.length > 0 && images.some(img => uploadBatchIds.includes(img.id) && (img.embeddingStatus === 'uploading' || img.embeddingStatus === 'embedding')) && (() => {
        const batchImages = images.filter(img => uploadBatchIds.includes(img.id));
        const totalInBatch = batchImages.length;
        const uploadedCount = batchImages.filter(img => img.embeddingStatus === 'success').length;
        const averageProgress = totalInBatch > 0 ? Math.round((uploadedCount / totalInBatch) * 100) : 0;

        return (
          <div className="glass card animate-fade-in p-4" style={{ background: 'rgba(245,158,11,0.03)', borderLeft: '4px solid #f59e0b' }}>
            <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Upload className="w-4 h-4 text-amber-500 animate-bounce" />
                  FTP Server Upload in Progress
                </h4>
                <p className="text-muted" style={{ fontSize: '0.75rem', margin: '2px 0 0 0' }}>
                  ফাইলগুলো মেটাডেটাসহ এফটিপি সার্ভারে পাঠানো হচ্ছে...
                </p>
              </div>
              <div className="flex items-center gap-3">
                {activeJobId && window.electronAPI?.cancelFtp && (
                  <button
                    className="btn-outline"
                    style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    onClick={async () => {
                      await window.electronAPI.cancelFtp(activeJobId);
                      showToast("আপলোড বাতিল করা হয়েছে।", "warning");
                    }}
                  >
                    Cancel Upload
                  </button>
                )}
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-1)' }}>
                    {uploadedCount} / {totalInBatch} Files Completed
                  </span>
                  <span className="ml-2 px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded text-xs font-bold">
                    {averageProgress}%
                  </span>
                </div>
              </div>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(245,158,11,0.15)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${averageProgress}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #d97706)', transition: 'width 0.2s ease-out' }} />
            </div>
          </div>
        );
      })()}

      {/* View Container */}
      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'stretch' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {viewMode === 'grid' ? (
            <MetadataGrid 
              images={images}
              gridImages={getGridImages()}
              selectedRows={selectedRows}
              setSelectedRows={setSelectedRows}
              gridSort={gridSort}
              toggleSort={toggleSort}
              activeCell={activeCell}
              setActiveCell={setActiveCell}
              cellRefs={cellRefs}
              handleMetaChange={handleMetaChange}
              applyToSelected={applyToSelected}
              removeImage={removeImage}
              getTitleCounterClass={getTitleCounterClass}
              getDescriptionCounterClass={getDescriptionCounterClass}
              getKeywordsCounterClass={getKeywordsCounterClass}
            />
          ) : (
            <MetadataCardList 
              images={images}
              duplicatePairs={duplicatePairs}
              removeImage={removeImage}
              handleMetaChange={handleMetaChange}
              activeProviderName={activeProviderName}
              upscaleScale={upscaleScale}
              ftpConfigs={ftpConfigs}
            />
          )}
        </div>

        {/* Right-hand side panel editor shown in grid mode */}
        {viewMode === 'grid' && (
          <div style={{ width: '360px', flexShrink: 0 }}>
            <MetadataEditorPanel
              img={images.find(img => img.id === activeCell?.id)}
              handleMetaChange={handleMetaChange}
              activeCell={activeCell}
              setActiveCell={setActiveCell}
            />
          </div>
        )}
      </div>
      
      {/* Embedding Permission Modal */}
      {showPermissionModal && (
        <div style={{
          position: 'fixed',
          top: '1.5rem',
          right: '1.5rem',
          zIndex: 9999,
          width: '320px',
          background: 'var(--surface-1)',
          borderRadius: '0.75rem',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 0 0 1px var(--glass-border)',
          overflow: 'hidden',
          animation: 'fade-in 0.3s ease-out forwards'
        }}>
          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)' }}>
                <FileCode2 className="w-5 h-5" />
                <h3 style={{ fontWeight: 'bold', color: 'var(--text-1)', margin: 0, fontSize: '0.875rem' }}>মেটাডেটা এম্বেড করুন</h3>
              </div>
              <button 
                onClick={() => setShowPermissionModal(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <p style={{ color: 'var(--text-2)', fontSize: '0.75rem', lineHeight: 1.5, marginBottom: '1rem' }}>
              সবগুলো ফাইলের এআই মেটাডেটা তৈরি সফল হয়েছে। আপনি কি এই টাইটেল ও কিওয়ার্ড সরাসরি ফাইলগুলোর ভেতর (IPTC/XMP) এম্বেড করতে চান?
            </p>
            
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={autoEmbed} 
                onChange={handleAutoEmbedChange}
                style={{ marginTop: '0.125rem' }}
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-2)', lineHeight: 1.2 }}>
                ভবিষ্যতে মেটাডেটা জেনারেট হওয়ার পর স্বয়ংক্রিয়ভাবে পারমিশন ছাড়াই এম্বেড করুন
              </span>
            </label>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                style={{ flex: 1, padding: '0.5rem', background: 'var(--surface-2)', border: 'none', color: 'var(--text-2)', fontSize: '0.75rem', fontWeight: 600, borderRadius: '0.5rem', cursor: 'pointer' }}
                onClick={() => setShowPermissionModal(false)}
              >
                না, থাক
              </button>
              <button 
                style={{ flex: 1, padding: '0.5rem', background: 'linear-gradient(135deg, var(--accent), #0891b2)', border: 'none', color: 'white', fontSize: '0.75rem', fontWeight: 600, borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                onClick={() => embedMetadataToFiles()}
              >
                হ্যাঁ, এম্বেড করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Export Format Picker Modal */}
      <ExportFormatModal 
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onSelect={(formatId) => {
          downloadCSV(formatId, images, promptSettings);
          setShowExportModal(false);
        }}
        activePlatform={promptSettings?.exportPlatform || 'General'}
      />

      {/* Toast Notifications */}
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
        {toasts.map((t) => (
          <div 
            key={t.id}
            style={{
              pointerEvents: 'auto',
              background: t.type === 'success' ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)',
              color: '#fff',
              padding: '1rem 1.5rem',
              borderRadius: '0.75rem',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              animation: 'slideIn 0.3s ease-out',
              border: '1px solid rgba(255,255,255,0.1)',
              width: '320px',
              boxSizing: 'border-box'
            }}
          >
            {t.type === 'success' ? (
              <CheckCircle2 style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }} />
            ) : (
              <X style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: '0.85rem', fontWeight: 600, flexGrow: 1, wordBreak: 'break-word', lineHeight: '1.3' }}>{t.message}</span>
            <button 
              onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                marginLeft: '0.5rem',
                display: 'flex',
                flexShrink: 0
              }}
            >
              <X style={{ width: '0.9rem', height: '0.9rem' }} />
            </button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(100%) scale(0.9); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
