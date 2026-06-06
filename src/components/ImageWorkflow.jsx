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
  Copy,
  Video,
  LayoutGrid,
  List,
  AlertTriangle
} from "lucide-react";

// ─── Perceptual Hash Utility ───────────────────────────────────────────────
// Resizes image/dataURL to an 8x8 grayscale grid and returns a 64-bit binary
// string. Two hashes with Hamming distance <= 10 are considered near-duplicates.
const computePHash = (src) =>
  new Promise((resolve) => {
    const SIZE = 8;
    const img = new Image();
    img.onload = () => {
      if (src && src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
        const grays = [];
        for (let i = 0; i < data.length; i += 4) {
          // BT.601 luminance
          grays.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }
        const avg = grays.reduce((a, b) => a + b, 0) / grays.length;
        resolve(grays.map((g) => (g >= avg ? "1" : "0")).join(""));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      if (src && src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
      resolve(null);
    };
    img.src = src;
  });

const hammingDistance = (a, b) => {
  if (!a || !b || a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) dist++;
  return dist;
};

// Threshold: ≤ 10 out of 64 bits → near-duplicate
const DUPLICATE_THRESHOLD = 10;
import { generateMetadata, analyzeImageSecurity } from "../services/geminiService";
import { processEpsFile, isEpsFile } from "../services/epsService";

// Accepted file types: common raster images + EPS vector + common videos
const ACCEPTED_TYPES =
  "image/jpeg,image/png,image/webp,image/gif,image/svg+xml," +
  "application/postscript,application/eps,image/eps,application/x-eps,.eps,.epsf,.epsi," +
  "video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,.mp4,.mov,.avi,.mkv,.webm";

// Detect video files by mime type or extension
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
  // duplicatePairs: Array of { id1, name1, id2, name2, similarity }
  const [duplicatePairs, setDuplicatePairs] = useState([]);
  const [dismissedDuplicates, setDismissedDuplicates] = useState(false);
  // Store computed hashes: { [imageId]: hashString }
  const hashMapRef = useRef({});

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

  // Sync concurrentLimit with App's promptSettings state
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

  // ── Mata AI: Smart model picker ─────────────────────────────────────────────
  // Picks the best Real-ESRGAN model based on image type and selected engine.
  // Logic:
  //   mata_ai    → auto selects ultrasharp for photos, anime model for vectors/cartoons
  //   auto_detect→ same as mata_ai (intelligent selection)
  //   fast       → animevideov3 (fastest, works well on Intel/low-end GPU)
  //   standard   → realesrgan-x4plus (reliable general-purpose fallback)
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

    if (engine === 'fast') return 'realesr-animevideov3';
    if (engine === 'standard') return 'realesrgan-x4plus';
    // mata_ai and auto_detect: intelligent pick
    if (isAnimeOrVector) return 'realesrgan-x4plus-anime';
    return 'ultrasharp'; // best quality for real photos
  };

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
    if (isVideoFile(file)) return true;
    return file.type.startsWith("image/");
  };

  // ─── Perceptual Hash helpers ──────────────────────────────────────────────
  const computeHashForEntry = async (entry) => {
    try {
      let src = null;
      if (entry.preview && !entry.preview.includes('placeholder')) {
        // Only use existing preview if it's not a generic placeholder
        src = entry.preview;
      } else if (entry.visualFile) {
        src = URL.createObjectURL(entry.visualFile);
      } else if (entry.file && !entry.isEps && !entry.isVideo) {
        src = URL.createObjectURL(entry.file);
      }
      
      if (!src) return null;
      // `computePHash` handles `URL.revokeObjectURL` automatically now
      return await computePHash(src);
    } catch {
      return null;
    }
  };

  const detectDuplicates = (existingImages, newEntries) => {
    const allEntries = [...existingImages, ...newEntries];
    const pairs = [];
    const seenPairs = new Set();
    for (let i = 0; i < allEntries.length; i++) {
      const hashA = hashMapRef.current[allEntries[i].id];
      if (!hashA) continue;
      for (let j = i + 1; j < allEntries.length; j++) {
        const hashB = hashMapRef.current[allEntries[j].id];
        if (!hashB) continue;
        const dist = hammingDistance(hashA, hashB);
        if (dist <= DUPLICATE_THRESHOLD) {
          const key = [allEntries[i].id, allEntries[j].id].sort().join('|');
          if (!seenPairs.has(key)) {
            seenPairs.add(key);
            pairs.push({
              id1: allEntries[i].id,
              name1: allEntries[i].file?.name || allEntries[i].renamedName || 'File 1',
              id2: allEntries[j].id,
              name2: allEntries[j].file?.name || allEntries[j].renamedName || 'File 2',
              similarity: Math.round((1 - dist / 64) * 100),
            });
          }
        }
      }
    }
    return pairs;
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
    const newEntries = [];
    
    accepted.forEach(file => {
      const isEps = isEpsFile(file);
      const isVideo = isVideoFile(file);
      // Remove extension to get base name
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      
      if (isVideo) {
        // Videos are never paired — always standalone
        newEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          file: file,
          visualFile: null,
          preview: null, // No thumbnail yet — generated after frame extraction
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
        // Keep the first raster image found for this base name
        if (!fileGroups[baseName].raster) {
          fileGroups[baseName].raster = file;
        }
      }
    });

    for (const [_baseName, group] of Object.entries(fileGroups)) {
      if (group.eps && group.raster) {        // Paired! Use raster for preview/Gemini, but keep EPS for CSV name.
        newEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          file: group.eps,           // Target file for CSV (icon-4.eps)
          visualFile: group.raster,  // Used for AI analysis
          preview: URL.createObjectURL(group.raster),
          isEps: true,
          isPaired: true,            // Custom flag for UI badge
          epsData: null,             // Not needed because we have visualFile
          status: "pending",
          embeddingStatus: "none",
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
          embeddingStatus: "none",
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
          embeddingStatus: "none",
          result: null,
          error: null,
        });
      }
    }

    setImages((prev) => [...prev, ...newEntries]);

    // ─── Compute perceptual hashes for new non-video, non-EPS entries ───────
    // Run asynchronously in background so UI isn't blocked.
    // After hashing, re-run duplicate detection across all images.
    setTimeout(async () => {
      const hashPromises = newEntries
        .filter(e => !e.isVideo) // skip videos (no raster to hash yet)
        .map(async (entry) => {
          const hash = await computeHashForEntry(entry);
          if (hash) {
            hashMapRef.current[entry.id] = hash;
          }
        });
      await Promise.all(hashPromises);

      // Re-detect across all currently loaded images
      const currentImages = imagesRef.current;
      const pairs = detectDuplicates(currentImages, []);
      if (pairs.length > 0) {
        setDuplicatePairs(pairs);
        setDismissedDuplicates(false);
      } else {
        setDuplicatePairs([]);
      }
    }, 200);

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

    // Extract video frames in background immediately for thumbnail preview
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
    // Clean up hash entry and remove any duplicate pairs referencing this id
    delete hashMapRef.current[id];
    
    // Clean up cellRefs to prevent memory leaks
    Object.keys(cellRefs.current).forEach(key => {
      if (key.startsWith(id + '_')) {
        delete cellRefs.current[key];
      }
    });

    setDuplicatePairs((prev) => prev.filter((p) => p.id1 !== id && p.id2 !== id));
  };

  const clearAll = () => {
    images.forEach(img => {
      if (img.preview && img.preview.startsWith('blob:')) {
        URL.revokeObjectURL(img.preview);
      }
    });
    setImages([]);
    setUploadBatchIds([]);
    setActiveJobId(null);
    hashMapRef.current = {};
    cellRefs.current = {}; // Prevent memory leak
    setDuplicatePairs([]);
    setDismissedDuplicates(false);
  };

  // ---------- Processing ----------

  const resizeImageToBase64 = (file, maxSize = 800) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl); // Clean up memory immediately
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

    // Filter the images that need processing
    const toProcess = images.filter((img) => {
      if (img.status === "done") return false;
      if (onlyErrors && img.status !== "error") return false;
      return true;
    });

    const limit = concurrentLimit;
    const embedPromises = [];

    let processed = 0;
    const activePromises = new Set();

    for (const img of toProcess) {
      // First set status to processing for this image
      setImages((prev) =>
        prev.map((item) =>
          item.id === img.id ? { ...item, status: "processing" } : item
        )
      );

      const p = (async () => {
        try {
            let base64, mimeType;
            let isPlaceholder = false;
            let upscaledPath = null;
            let upscaledName = null;

            // 1. First, load the base64 of the original image/video-frame for AI analysis
            if (img.isVideo) {
              // Video: extract a representative frame using FFmpeg via Electron IPC
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
              mimeType = frameResult.mimeType; // 'image/jpeg'
              // Set the extracted frame as the preview thumbnail
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

            // 2. Pre-generation Security Scan (if enabled)
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
                // Throw an error with a specific prefix so we can handle it distinctly if needed
                throw new Error(`Policy Violation: ${securityRes.reason}`);
              }
            }

            // 3. Generate Metadata FIRST (using original image/video frame)
            const fileInfo = {
              isEps: img.isEps,
              isVideo: img.isVideo || false,
              isPlaceholder: isPlaceholder,
              fileName: img.file?.name,
              extractedTextContext: img.epsData?.extractedTextContext || null,
              promptSettings: promptSettings,
            };

            const metadata = await generateMetadata(
              base64,
              mimeType,
              apiKeys,
              apiProvider || "gemini",
              fileInfo
            );

            // Update state with metadata result immediately
            setImages((prev) =>
              prev.map((item) =>
                item.id === img.id
                  ? { ...item, result: metadata }
                  : item
              )
            );

            // 3. Auto-Upscale (Electron only, if enabled, SKIPPED for videos)
            const targetPath = img.visualFile?.path || (!img.isEps && !img.isVideo ? img.file?.path : null);
            if (autoUpscale && window.electronAPI && targetPath && !img.isVideo) {
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

                // ── Mata AI: pick smart model ────────────────────────────────
                const smartNameForModel = img.file?.name || originalFileName;
                const modelName = (upscaleEngine === 'mata_ai' || upscaleEngine === 'auto_detect')
                  ? 'mata_ai'
                  : pickMataAIModel(smartNameForModel, upscaleEngine);
                console.log(`[Mata AI] Engine: ${upscaleEngine} | Model: ${modelName} | File: ${smartNameForModel}`);

                let arrayBuffer;

                // Primary: Local GPU — get base64 back, then save manually
                try {
                  // Pass saveDir=null so backend returns base64 (avoids separate readFile)
                  const upscalePromise = window.electronAPI.upscaleLocalNcnn(
                    targetPath,
                    upscaleScale,
                    modelName,
                    outputFormat,
                    null  // null = return base64, don't save directly
                  );
                  const upscaleTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Local GPU upscaler timed out (15m limit)')), 900000)); // 15 mins max
                  
                  const localRes = await Promise.race([upscalePromise, upscaleTimeout]);
                  if (!localRes || !localRes.success) {
                    throw new Error(localRes?.error || 'Local GPU upscaler returned failure');
                  }
                  // Decode base64 → ArrayBuffer
                  const binaryStr = atob(localRes.base64);
                  const bytes = new Uint8Array(binaryStr.length);
                  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                  arrayBuffer = bytes.buffer;

                  // Ensure Upscaled folder exists, then save (saveFile handler auto-creates dirs)
                  const savePath = `${upscaleFolder}${pathSeparator}${baseName}_${upscaleScale}x_MataAI.${outputFormat}`;
                  const saveRes = await window.electronAPI.saveFile(savePath, bytes);
                  if (!saveRes.success) throw new Error(saveRes.error || 'Save failed');
                  upscaledPath = savePath;
                  upscaledName = `${baseName}_${upscaleScale}x_MataAI.${outputFormat}`;
                  console.log(`[Mata AI] ✅ Local GPU success → ${upscaledName}`);
                } catch (localErr) {
                  // Fallback: server-based upscale API
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
                      const blob = new Blob([arrayBuffer], { type: upscaledMimeType });
                      updatedItem.preview = URL.createObjectURL(blob);
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

            // 4. Mark image generation as done
            setImages((prev) =>
              prev.map((item) =>
                item.id === img.id
                  ? { ...item, status: "done" }
                  : item
              )
            );

            // 5. If autoEmbed is enabled, immediately trigger embedding and upload for this SINGLE file!
            if (autoEmbed && window.electronAPI) {
              const doneImg = {
                ...img,
                status: "done",
                result: metadata,
                renamedPath: upscaledPath || img.renamedPath,
                renamedVisualPath: upscaledPath || img.renamedVisualPath,
                renamedName: upscaledName || img.renamedName
              };
              // Update file paths in doneImg if upscaled
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
          }
          processed++;
          setProgress(Math.round((processed / toProcess.length) * 100));
      })();

      activePromises.add(p);
      p.finally(() => activePromises.delete(p));

      if (activePromises.size >= limit) {
        await Promise.race(activePromises);
      }
      
      // Add a small delay between starting requests to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    // Wait for the remaining active promises to finish
    await Promise.all(activePromises);

    setIsProcessing(false);
    setTimeout(() => setProgress(0), 1000);
    
    // Wait for all sequential embeddings and their associated FTP uploads to finish before showing end states
    if (autoEmbed && window.electronAPI && embedPromises.length > 0) {
      await Promise.allSettled(embedPromises);
    }
    
    // Defer the check slightly to ensure React state has updated with 'done' status
    setTimeout(() => {
      const latestImages = imagesRef.current;
      const doneImages = latestImages.filter(img => img.status === "done" && img.result && img.embeddingStatus === "none");
      if (doneImages.length > 0 && window.electronAPI) {
        if (autoEmbed) {
          // Already handled individually in real-time
        } else {
          // Only show Toast automatically for first-time users
          if (!localStorage.getItem('embedToastSeen')) {
            setShowPermissionModal(true);
            localStorage.setItem('embedToastSeen', 'true');
          }
        }
      }
    }, 500);
  };
  
  // ---------- Embedding Metadata ----------
  
  const embedMetadataToFiles = async (imagesToProcess, forceUpload = false, skipAdobeUpload = false) => {
    setShowPermissionModal(false);
    if (!window.electronAPI) return;
    
    setEmbeddingCount(prev => prev + 1);
    
    try {
      const activeFtpConfigs = ftpConfigs.filter(c => c.enabled);
      
      // Get the current list of done images (either passed directly to avoid stale closures, or from current state)
      // Only select those with embeddingStatus: none or error
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
      
      // Embed sequentially to prevent exiftool process conflicts/CPU overload
      for (const img of currentImages) {
        try {
          const pathsToEmbed = [];
          const targetPrimary = img.renamedPath || img.file?.path;
          if (targetPrimary) pathsToEmbed.push({ type: 'primary', path: targetPrimary });
          
          const targetVisual = img.renamedVisualPath || img.visualFile?.path;
          if (img.isEps && targetVisual && targetVisual !== targetPrimary) {
            pathsToEmbed.push({ type: 'visual', path: targetVisual });
          }
          
          let success = true;
          let errMsg = '';
          let newPrimaryPath = img.renamedPath;
          let newVisualPath = img.renamedVisualPath;
          let newPrimaryName = img.renamedName;
          
          for (const target of pathsToEmbed) {
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

      // Batch Upload to FTP in Parallel across selected active servers
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

          // Combine errors from all servers
          const fileErrorsMap = {}; // { [filePath]: { [host]: error } }
          for (const res of uploadResults) {
            for (const [filePath, err] of Object.entries(res.fileErrors)) {
              if (err) {
                const normalizedPath = filePath.replace(/\\/g, '/');
                if (!fileErrorsMap[normalizedPath]) fileErrorsMap[normalizedPath] = {};
                fileErrorsMap[normalizedPath][res.host] = err;
              }
            }
          }

          // Update image states based on whether they had upload errors
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

          // Calculate batch success/failure counts
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
          // Set all to error
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
        // Just local embedding success (only show if we didn't skip all uploads intentionally)
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

  // ---------- Export ----------

  // ---------- CSV Export & Import ----------

  const parseCSV = (text) => {
    const lines = [];
    let row = [''];
    let inQuotes = false;
    let delimiter = ',';
    
    const firstLine = text.split('\n')[0] || '';
    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    if (semicolons > commas) {
      delimiter = ';';
    }

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i+1];
      if (inQuotes) {
        if (char === '"' && next === '"') {
          row[row.length - 1] += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          row[row.length - 1] += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          row.push('');
        } else if (char === '\r' || char === '\n') {
          if (row.length > 1 || row[0] !== '') {
            lines.push(row);
          }
          row = [''];
          if (char === '\r' && next === '\n') {
            i++;
          }
        } else {
          row[row.length - 1] += char;
        }
      }
    }
    if (row.length > 1 || row[0] !== '') {
      lines.push(row);
    }
    return lines;
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

  const getAvailableExportFormats = () => {
    const activePlatform = promptSettings?.exportPlatform || 'General';
    const allPlatforms = [
      { id: 'General', icon: '✦', label: 'General Format', desc: 'Standard CSV with Filename, Title, Description, Keywords' },
      { id: 'Adobe Stock', icon: 'St', label: 'Adobe Stock', desc: 'Category codes mapping and official column order' },
      { id: 'Shutterstock', icon: '📷', label: 'Shutterstock', desc: 'Includes Categories mapping column' },
      { id: 'FreePik', icon: '🎨', label: 'Freepik', desc: 'Semicolon delimiter and exact required headers' },
      { id: 'Vecteezy', icon: '🖌', label: 'Vecteezy', desc: 'Official Vecteezy formatting requirements' },
      { id: 'Dreamstime', icon: '💭', label: 'Dreamstime', desc: 'Features Category columns structure' },
      { id: 'Pond5', icon: '🎬', label: 'Pond5', desc: 'Detailed model release and location metadata' },
      { id: 'Getty', icon: '🖼', label: 'Getty Images', desc: 'Brief codes, dates, and Getty specification' },
      { id: 'Depositphotos', icon: '📸', label: 'Depositphotos', desc: 'Includes nudity and editorial settings' },
      { id: 'Extended metadata', icon: '📋', label: 'Extended CSV', desc: 'Full categories list and releases' },
    ];

    if (activePlatform === 'General') {
      return allPlatforms;
    } else {
      return allPlatforms.filter(p => p.id === activePlatform || p.id === 'General');
    }
  };

  const downloadCSV = (targetPlatform) => {
    const doneImages = images.filter((img) => img.status === "done");
    if (doneImages.length === 0) return;

    const platform = targetPlatform || promptSettings?.exportPlatform || 'General';
    const safe = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
    const delimiter = platform === 'FreePik' ? ';' : ',';

    // Adobe Stock category name-to-code map
    const adobeCategoryMap = {
      "Animals": 1, "Buildings": 2, "Architecture": 2, "Business": 3, "Drinks": 4,
      "Environment": 5, "Nature": 5, "Mind": 6, "Mood": 6, "Food": 7,
      "Graphic": 8, "Illustration": 8, "Hobbies": 9, "Leisure": 9,
      "Industry": 10, "Landscape": 11, "Lifestyle": 12, "People": 13,
      "Plants": 14, "Flowers": 14, "Culture": 15, "Religion": 15,
      "Science": 16, "Social": 17, "Sports": 18, "Technology": 19,
      "Transport": 20, "Travel": 21
    };

    const getCategoryCode = (categories) => {
      if (!categories) return "11"; // default Landscape
      const cats = Array.isArray(categories) ? categories : [categories];
      for (const cat of cats) {
        for (const [key, code] of Object.entries(adobeCategoryMap)) {
          if (cat.toLowerCase().includes(key.toLowerCase())) return String(code);
        }
      }
      return "11";
    };

    let headers = [];
    let rows = [];

    doneImages.forEach((img) => {
      const { title = "", description = "", keywords = "" } = img.result || {};
      const filename = img.renamedName || img.file?.name || "";
      const categoriesStr = Array.isArray(img.result?.categories) ? img.result.categories.join(", ") : (img.result?.categories || "");

      let row = [];
      if (platform === 'Adobe Stock') {
        headers = ["filename", "title", "keywords", "category", "releases"];
        const categoryCode = getCategoryCode(img.result?.categories);
        row = [filename, title, keywords, categoryCode, ""];
      } else if (platform === 'Shutterstock') {
        headers = ["Filename", "Description", "Keywords", "Categories"];
        row = [filename, description, keywords, categoriesStr];
      } else if (platform === 'FreePik') {
        headers = ["File name", "Title", "Keywords"];
        row = [filename, title, keywords];
      } else if (platform === 'Vecteezy') {
        headers = ["Filename", "Title", "Description", "Keywords", "License"];
        row = [filename, title, description, keywords, "Standard"];
      } else if (platform === 'Dreamstime') {
        headers = ["Filename", "Title", "Description", "Keywords", "Category 1"];
        row = [filename, title, description, keywords, categoriesStr.split(',')[0] || ""];
      } else if (platform === 'Pond5') {
        headers = ["originalfilename", "title", "description", "keywords", "city", "region", "country", "location", "specifysource", "modelreleased", "propertyreleased", "release"];
        row = [filename, title, description, keywords, "", "", "", "", "", "", "", ""];
      } else if (platform === 'Getty') {
        headers = ["file name", "created date", "description", "country", "brief code", "title", "keywords"];
        row = [filename, new Date().toISOString().split('T')[0], description, "", "", title, keywords];
      } else if (platform === 'Depositphotos') {
        headers = ["Filename", "description", "Keywords", "Nudity", "Editorial"];
        row = [filename, description, keywords, "No", "No"];
      } else if (platform === 'Extended metadata') {
        headers = ["Filename", "Title", "Description", "Keywords", "Categories", "Releases"];
        row = [filename, title, description, keywords, categoriesStr, ""];
      } else {
        // General
        headers = ["Filename", "Title", "Description", "Keywords"];
        row = [filename, title, description, keywords];
      }
      rows.push(row.map(safe).join(delimiter));
    });

    // UTF-8 BOM for Excel compatibility
    const bom = "\uFEFF";
    const content = bom + headers.join(delimiter) + "\n" + rows.join("\n");

    const blob = new Blob([content], { type: `text/csv;charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${platform.replace(/\s+/g, '_').toLowerCase()}_metadata_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  const doneCount = images.filter((i) => i.status === "done").length;
  const errorCount = images.filter((i) => i.status === "error").length;
  const pendingCount = images.filter((i) => i.status === "pending").length;
  const epsCount = images.filter((i) => i.isEps).length;

  const embeddingSuccessCount = images.filter((i) => i.embeddingStatus === "success").length;
  const embeddingErrorCount = images.filter((i) => i.embeddingStatus === "error").length;

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

  // ─── Grid: apply value to all selected rows ────────────────────────────────
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

  // ─── Grid: computed sorted+filtered list ───────────────────────────────────
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

  // ─── Grid: toggle sort ────────────────────────────────────────────────────
  const toggleSort = (field) => {
    setGridSort(prev => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc'
    }));
  };

  // ─── Grid: keyboard navigation (Tab / Shift+Tab / ArrowDown / ArrowUp) ────
  const GRID_FIELDS = ['title', 'description', 'keywords'];
  const handleCellKeyDown = (e, imgId, field) => {
    const gridImages = getGridImages();
    const rowIndex = gridImages.findIndex(img => img.id === imgId);
    const fieldIndex = GRID_FIELDS.indexOf(field);

    let nextId = imgId, nextField = field;

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      if (fieldIndex < GRID_FIELDS.length - 1) {
        nextField = GRID_FIELDS[fieldIndex + 1];
      } else if (rowIndex < gridImages.length - 1) {
        nextField = GRID_FIELDS[0];
        nextId = gridImages[rowIndex + 1].id;
      }
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      if (fieldIndex > 0) {
        nextField = GRID_FIELDS[fieldIndex - 1];
      } else if (rowIndex > 0) {
        nextField = GRID_FIELDS[GRID_FIELDS.length - 1];
        nextId = gridImages[rowIndex - 1].id;
      }
    } else if (e.key === 'ArrowDown' && e.ctrlKey) {
      e.preventDefault();
      if (rowIndex < gridImages.length - 1) nextId = gridImages[rowIndex + 1].id;
    } else if (e.key === 'ArrowUp' && e.ctrlKey) {
      e.preventDefault();
      if (rowIndex > 0) nextId = gridImages[rowIndex - 1].id;
    } else if (e.key === 'Enter' && e.ctrlKey) {
      // Ctrl+Enter: apply this cell's value to all selected rows
      const curImg = images.find(i => i.id === imgId);
      if (curImg?.result) applyToSelected(imgId, field, curImg.result[field] || '');
      return;
    } else {
      return; // normal typing
    }

    if (nextId !== imgId || nextField !== field) {
      setActiveCell({ id: nextId, field: nextField });
      const key = `${nextId}_${nextField}`;
      setTimeout(() => cellRefs.current[key]?.focus(), 10);
    }
  };

  // ─── Grid: toggle row selection ───────────────────────────────────────────
  const toggleRowSelect = (id) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const visible = getGridImages();
    setSelectedRows(prev => {
      if (prev.size === visible.length) return new Set();
      return new Set(visible.map(i => i.id));
    });
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

  // ─── Selling Score helpers ───────────────────────────────────────────
  const getScoreMeta = (score) => {
    if (score >= 80) return { label: 'Hot', emoji: '🔥', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', trackColor: '#10b981' };
    if (score >= 60) return { label: 'Good', emoji: '✅', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', trackColor: '#3b82f6' };
    if (score >= 40) return { label: 'Average', emoji: '⚠️', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', trackColor: '#f59e0b' };
    return { label: 'Low', emoji: '❌', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', trackColor: '#ef4444' };
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

      {/* ERROR BANNER - Shows at the very top when there are failed files */}
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

            {/* Stats Separator */}
            <div style={{ width: '1px', height: '1.2rem', background: 'var(--glass-border)' }}></div>

            {/* Detailed Stats */}
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

            {/* Clear Button */}
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
                    {/* Scale selector */}
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

                    {/* Mata AI Engine selector */}
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
                      <option value="standard">📸 Standard</option>
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
            {/* Grid quick filter & selected count */}
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

            <div 
              className="flex items-center gap-1.5 text-sm select-none mr-2"
              title="Limit the number of images generated in parallel (1-4)"
              style={{ color: 'var(--text-2)' }}
            >
              <span style={{ fontWeight: 500 }}>Parallel:</span>
              <select
                value={concurrentLimit}
                onChange={(e) => setConcurrentLimit(parseInt(e.target.value) || 2)}
                style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: '0.4rem',
                  background: 'var(--surface-2)',
                  color: 'var(--text-1)',
                  border: '1px solid var(--glass-border)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="1">1 File</option>
                <option value="2">2 Files</option>
                <option value="3">3 Files</option>
                <option value="4">4 Files</option>
              </select>
            </div>

            <button
              className="btn-primary"
              disabled={isProcessing || images.every(img => img.status === 'done')}
              onClick={() => processBatch(false)}
              title="Keyboard shortcut: Enter"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isProcessing ? 'Generating...' : (images.every(img => img.status === 'done') ? 'All Done!' : 'Generate All')}
            </button>
            {window.electronAPI && (
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
            )}
            {!window.electronAPI && (
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
      {viewMode === 'grid' && (() => {
        const gridImages = getGridImages();
        const allSelected = gridImages.length > 0 && selectedRows.size === gridImages.length;
        const SortIcon = ({ field }) => {
          if (gridSort.field !== field) return <span className="grid-sort-arrow idle">⇅</span>;
          return <span className="grid-sort-arrow active">{gridSort.dir === 'asc' ? '↑' : '↓'}</span>;
        };
        return (
          <div className="grid-view-container">
            {/* Bulk action bar */}
            {selectedRows.size > 0 && (
              <div className="grid-bulk-bar">
                <span className="grid-bulk-bar-count">
                  ✓ {selectedRows.size} row{selectedRows.size > 1 ? 's' : ''} selected
                </span>
                <span className="grid-bulk-bar-hint">— Ctrl+Enter in any cell to copy that value to all selected rows</span>
                <button onClick={() => setSelectedRows(new Set())} className="grid-bulk-bar-clear">Clear</button>
              </div>
            )}
            <table className="bulk-edit-table">
              <thead>
                <tr>
                  {/* Select-all checkbox */}
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      title="Select / Deselect all"
                      className="grid-checkbox"
                    />
                  </th>
                  <th className="col-width-preview">Preview</th>
                  <th className="col-width-filename sortable" onClick={() => toggleSort('filename')}>
                    Filename <SortIcon field="filename" />
                  </th>
                  <th className="col-width-title sortable" onClick={() => toggleSort('title')}>
                    Title <SortIcon field="title" />
                  </th>
                  <th className="col-width-description">Description</th>
                  <th className="col-width-keywords">Keywords</th>
                  <th className="col-width-status sortable" onClick={() => toggleSort('status')}>
                    Status <SortIcon field="status" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {gridImages.map(img => {
                  const isSelected = selectedRows.has(img.id);
                  return (
                    <tr
                      key={img.id}
                      className={isSelected ? 'row-selected' : ''}
                    >
                      {/* Row checkbox */}
                      <td className="grid-td-check">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRowSelect(img.id)}
                          className="grid-checkbox"
                        />
                      </td>

                      {/* Thumbnail Preview */}
                      <td className="grid-td-preview">
                        <div className="grid-thumb-wrap">
                          {img.preview ? (
                            <img src={img.preview} alt="preview" />
                          ) : img.isVideo ? (
                            <Video className="w-6 h-6 text-purple-500" />
                          ) : (
                            <Loader2 className="w-5 h-5 text-primary animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Filename & Type/Size badges */}
                      <td className="grid-td-filename">
                        <span className="grid-filename-name" title={img.file?.name || img.renamedName}>
                          {img.file?.name || img.renamedName}
                        </span>
                        <div className="grid-filename-badges">
                          {img.isEps && <span className="eps-badge" style={{ fontSize: '0.55rem', padding: '1px 4px' }}>EPS</span>}
                          {img.isVideo && <span className="eps-indicator" style={{ position: 'static', transform: 'none', fontSize: '0.55rem', padding: '1px 4px', background: 'rgba(124,58,237,0.15)', color: '#a855f7' }}>Video</span>}
                          {!img.isEps && !img.isVideo && <span className="img-badge" style={{ fontSize: '0.55rem', padding: '1px 4px' }}>IMG</span>}
                          {img.file?.size && (
                            <span className="grid-filesize-badge">
                              {(img.file.size / (1024 * 1024)).toFixed(2)} MB
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Title editor */}
                      <td className="grid-td-editor">
                        <div className={`grid-cell-editor ${activeCell?.id === img.id && activeCell?.field === 'title' ? 'focused' : ''}`}>
                          <textarea
                            ref={el => { cellRefs.current[`${img.id}_title`] = el; }}
                            className="bulk-edit-input"
                            value={img.result?.title || ''}
                            onChange={(e) => handleMetaChange(img.id, 'title', e.target.value)}
                            onFocus={() => setActiveCell({ id: img.id, field: 'title' })}
                            onBlur={() => setActiveCell(null)}
                            onKeyDown={(e) => handleCellKeyDown(e, img.id, 'title')}
                            disabled={!img.result}
                            placeholder={img.status === 'done' ? 'Enter title…' : '—'}
                          />
                          {img.result && (
                            <span className={`grid-cell-counter ${getTitleCounterClass(img.result.title)}`}>
                              {img.result.title?.length || 0} / 150
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Description editor */}
                      <td className="grid-td-editor">
                        <div className={`grid-cell-editor ${activeCell?.id === img.id && activeCell?.field === 'description' ? 'focused' : ''}`}>
                          <textarea
                            ref={el => { cellRefs.current[`${img.id}_description`] = el; }}
                            className="bulk-edit-input"
                            value={img.result?.description || ''}
                            onChange={(e) => handleMetaChange(img.id, 'description', e.target.value)}
                            onFocus={() => setActiveCell({ id: img.id, field: 'description' })}
                            onBlur={() => setActiveCell(null)}
                            onKeyDown={(e) => handleCellKeyDown(e, img.id, 'description')}
                            disabled={!img.result}
                            placeholder={img.status === 'done' ? 'Enter description…' : '—'}
                          />
                          {img.result && (
                            <span className={`grid-cell-counter ${getDescriptionCounterClass(img.result.description)}`}>
                              {img.result.description?.length || 0} / 250
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Keywords editor */}
                      <td className="grid-td-editor">
                        <div className={`grid-cell-editor ${activeCell?.id === img.id && activeCell?.field === 'keywords' ? 'focused' : ''}`}>
                          <textarea
                            ref={el => { cellRefs.current[`${img.id}_keywords`] = el; }}
                            className="bulk-edit-input"
                            value={img.result?.keywords || ''}
                            onChange={(e) => handleMetaChange(img.id, 'keywords', e.target.value)}
                            onFocus={() => setActiveCell({ id: img.id, field: 'keywords' })}
                            onBlur={() => setActiveCell(null)}
                            onKeyDown={(e) => handleCellKeyDown(e, img.id, 'keywords')}
                            disabled={!img.result}
                            placeholder={img.status === 'done' ? 'Enter keywords…' : '—'}
                          />
                          {img.result && (
                            <span className={`grid-cell-counter ${getKeywordsCounterClass(img.result.keywords)}`}>
                              {(img.result.keywords || '').split(',').map(k => k.trim()).filter(Boolean).length} / 50 kws
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status & Row Action */}
                      <td className="grid-td-status">
                        <div className="grid-status-stack">
                          <StatusBadge status={img.status} progress={img.upscaleProgress} />

                          {/* Selling Score */}
                          {img.result?.sellingScore !== undefined && img.result?.sellingScore !== null && (() => {
                            const sc = Number(img.result.sellingScore);
                            const meta = getScoreMeta(sc);
                            return (
                              <div
                                title={img.result.scoreReason || `Selling Score: ${sc}/100`}
                                style={{
                                  background: meta.bg,
                                  border: `1px solid ${meta.border}`,
                                  color: meta.color,
                                  borderRadius: '999px',
                                  padding: '1px 6px',
                                  fontSize: '0.65rem',
                                  fontWeight: 800,
                                  cursor: 'default',
                                }}
                              >
                                {meta.emoji} {sc}
                              </div>
                            );
                          })()}

                          {/* Embedding Status */}
                          {img.embeddingStatus && img.embeddingStatus !== 'none' && (
                            <div
                              className={`grid-embed-chip ${
                                img.embeddingStatus === 'embedding' ? 'bg-indigo-500/10 text-indigo-500 animate-pulse' :
                                img.embeddingStatus === 'uploading' ? 'bg-amber-500/10 text-amber-500' :
                                img.embeddingStatus === 'success' ? 'bg-green-500/10 text-green-500' :
                                'bg-red-500/10 text-red-500'
                              }`}
                              title={img.embeddingStatus === 'error' ? img.embeddingError : ''}
                            >
                              {img.embeddingStatus === 'embedding' && 'Embedding'}
                              {img.embeddingStatus === 'uploading' && 'FTP'}
                              {img.embeddingStatus === 'success' && 'Embedded'}
                              {img.embeddingStatus === 'error' && 'Failed'}
                            </div>
                          )}

                          <button onClick={() => removeImage(img.id)} className="grid-row-remove-btn" title="Delete Row">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {gridImages.length === 0 && gridFilter && (
              <div className="grid-no-results">
                No rows match <strong>"{gridFilter}"</strong>
              </div>
            )}
          </div>
        );
      })()}

      {viewMode !== 'grid' && (
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
              ) : img.isVideo ? (
                <div className="thumb-loading" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(168,85,247,0.08))' }}>
                  <Video className="w-7 h-7" style={{ color: '#a855f7' }} />
                </div>
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

              {img.isVideo && (
                <div className="eps-indicator" style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }} title="Video File">
                  <Video className="w-2.5 h-2.5" />
                  Video
                </div>
              )}

              {/* Duplicate badge on thumbnail */}
              {duplicatePairs.some((p) => p.id1 === img.id || p.id2 === img.id) && (
                <div
                  title="Near-duplicate detected!"
                  style={{
                    position: 'absolute',
                    bottom: '22px',
                    left: '4px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#fff',
                    borderRadius: '4px',
                    padding: '1px 5px',
                    fontSize: '0.6rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                    zIndex: 3,
                    letterSpacing: '0.03em',
                  }}
                >
                  <AlertTriangle style={{ width: '0.55rem', height: '0.55rem' }} />
                  DUP
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
                <StatusBadge status={img.status} progress={img.upscaleProgress} />
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
                    isKeywords
                    img={img}
                  />
                  {img.result.categories && img.result.categories.length > 0 && (
                    <div className="flex gap-2 items-center mt-2">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Categories:</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {img.result.categories.map((cat, idx) => (
                          <span key={idx} className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-primary/20">
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ─── SELLING SCORE GAUGE ─── */}
                  {img.result.sellingScore !== undefined && img.result.sellingScore !== null && (() => {
                    const sc = Math.max(0, Math.min(100, Number(img.result.sellingScore)));
                    const meta = getScoreMeta(sc);
                    const R = 22; const cx = 28; const cy = 28;
                    const circ = 2 * Math.PI * R;
                    const offset = circ - (sc / 100) * circ;
                    return (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        marginTop: '0.65rem', padding: '0.55rem 0.8rem',
                        background: meta.bg, border: `1px solid ${meta.border}`,
                        borderRadius: '0.6rem',
                      }}>
                        {/* SVG circular arc */}
                        <svg width="56" height="56" style={{ flexShrink: 0, filter: `drop-shadow(0 0 5px ${meta.trackColor}66)` }}>
                          <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
                          <circle
                            cx={cx} cy={cy} r={R} fill="none"
                            stroke={meta.trackColor} strokeWidth="5"
                            strokeLinecap="round"
                            strokeDasharray={circ} strokeDashoffset={offset}
                            transform={`rotate(-90 ${cx} ${cy})`}
                            style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)' }}
                          />
                          <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                            fontSize="11" fontWeight="800" fill={meta.trackColor}>{sc}</text>
                        </svg>
                        {/* Right: label + reason */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {meta.emoji} {meta.label} Score
                            </span>
                            <span style={{ fontSize: '0.63rem', color: 'var(--text-3)', fontWeight: 500 }}>/ 100</span>
                          </div>
                          {img.result.scoreReason && (
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-2)', margin: '0.18rem 0 0', lineHeight: 1.4, fontStyle: 'italic' }}>
                              {img.result.scoreReason}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {img.status === "error" && (
                <p className="text-xs text-red-400 bg-red-400/10 p-2 rounded mt-2">
                  ⚠ {img.error}
                </p>
              )}

              {img.status === "pending" && (
                <p className="text-xs italic text-muted mt-2">
                  {img.isVideo
                    ? "🎬 Ready — Frame will be extracted for AI analysis"
                    : img.isPaired 
                      ? "✨ Ready (Using JPG for AI)" 
                      : (img.isEps && !img.epsData)
                        ? "⚙ Extracting EPS preview..."
                        : "Awaiting analysis..."}
                </p>
              )}

              {img.status === "upscaling" && (
                <p className="text-xs text-indigo-400 animate-pulse mt-2">
                  ✨ Auto-Upscaling image to {upscaleScale}x...{img.upscaleProgress !== undefined && img.upscaleProgress > 0 ? ` ${Math.round(img.upscaleProgress)}%` : ''}
                </p>
              )}

              {img.status === "scanning" && (
                <p className="text-xs text-amber-500 animate-pulse mt-2">
                  🛡️ Scanning for Policy Violations...
                </p>
              )}

              {img.status === "extracting" && (
                <p className="text-xs text-violet-400 animate-pulse mt-2">
                  🎬 Extracting video frame for AI analysis...
                </p>
              )}

              {img.status === "processing" && (
                <p className="text-xs text-primary animate-pulse mt-2">
                  🤖 Generating metadata with {activeProviderName} AI...
                </p>
              )}
              
              {img.embeddingStatus && img.embeddingStatus !== 'none' && (
                <div className={`mt-3 p-2 rounded text-xs flex items-center gap-2 ${
                  img.embeddingStatus === 'embedding' ? 'bg-indigo-500/10 text-indigo-400 animate-pulse' :
                  img.embeddingStatus === 'uploading' ? 'bg-amber-500/10 text-amber-500 w-full' :
                  img.embeddingStatus === 'success' ? 'bg-green-500/10 text-green-400 font-medium' :
                  'bg-red-500/10 text-red-400'
                }`} style={{ width: '100%' }}>
                  {img.embeddingStatus === 'embedding' && (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Embedding metadata into file...</span>
                    </>
                  )}
                  {img.embeddingStatus === 'uploading' && (() => {
                    const singleProgress = (() => {
                      if (typeof img.uploadProgress === 'number') return img.uploadProgress;
                      if (typeof img.uploadProgress === 'object' && img.uploadProgress !== null) {
                        const activeConfigs = ftpConfigs.filter(c => c.enabled);
                        if (activeConfigs.length === 0) return 0;
                        const sum = activeConfigs.reduce((s, conf) => s + (img.uploadProgress[conf.host] || 0), 0);
                        return Math.round(sum / activeConfigs.length);
                      }
                      return 0;
                    })();
                    return (
                      <div className="w-full" style={{ width: '100%' }}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="flex items-center gap-2">
                            <Upload className="w-3 h-3 animate-bounce" />
                            Uploading to FTP server...
                          </span>
                          <span className="font-bold">{singleProgress}%</span>
                        </div>
                        <div style={{ width: '100%', height: '4px', background: 'rgba(245,158,11,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${singleProgress}%`, height: '100%', background: '#f59e0b', transition: 'width 0.1s' }} />
                        </div>
                      </div>
                    );
                  })()}
                  {img.embeddingStatus === 'success' && (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Metadata embedded & processed!</span>
                    </>
                  )}
                  {img.embeddingStatus === 'error' && (
                    <>
                      <X className="w-3 h-3" />
                      <span>Failed: {img.embeddingError}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      )}
      
      {/* ----- Embedding Permission Toast ----- */}
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
                onClick={embedMetadataToFiles}
              >
                হ্যাঁ, এম্বেড করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Export Format Picker Modal */}
      {showExportModal && (
        <div className="modal-overlay animate-fade-in" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div className="glass card" style={{
            width: '450px',
            maxWidth: '90%',
            padding: '1.5rem',
            background: 'var(--surface-1)',
            borderRadius: '1rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.2), 0 0 0 1px var(--glass-border)',
            animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Download className="w-5 h-5 text-primary" />
                Select CSV Export Format
              </h3>
              <button 
                onClick={() => setShowExportModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0.2rem' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: 1.45 }}>
              অনুগ্রহ করে যে এজেন্সির জন্য সিএসভি ফাইলটি ডাউনলোড করতে চান তা নির্বাচন করুন। প্রতিটি ফরম্যাট তাদের নিজস্ব গাইডলাইন অনুযায়ী সাজানো হয়েছে।
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
              {getAvailableExportFormats().map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => {
                    downloadCSV(fmt.id);
                    setShowExportModal(false);
                  }}
                  className="export-format-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.6rem',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--glass-border)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.2rem', minWidth: '24px', textAlign: 'center', display: 'inline-block' }}>{fmt.icon}</span>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-1)' }}>{fmt.label}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '2px' }}>{fmt.desc}</div>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-primary" style={{ opacity: 0.6 }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Premium Floating Toast Notifications Stack */}
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

// --- Sub-components ---

function StatusBadge({ status, progress }) {
  const map = {
    done: "bg-green-500/20 text-green-400",
    processing: "bg-primary/20 text-primary animate-pulse",
    upscaling: "bg-indigo-500/20 text-indigo-400 animate-pulse",
    error: "bg-red-500/20 text-red-500",
    pending: "bg-surface text-muted",
  };
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider shrink-0 ${
        map[status] || map.pending
      }`}
    >
      {status === "upscaling" && progress !== undefined && progress > 0
        ? `upscaling (${Math.round(progress)}%)`
        : status}
    </span>
  );
}

function MetaField({ label, value, onChange, isTextArea, isKeywords, img }) {
  const [copied, setCopied] = useState(false);
  const [isTextMode, setIsTextMode] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getKeywordScore = (keyword, img) => {
    const kl = keyword.toLowerCase().trim();
    
    // Check if AI provided a real SEO score
    if (img && img.result && img.result.keywordScores) {
        const exactScore = img.result.keywordScores[kl] || img.result.keywordScores[keyword.trim()];
        if (exactScore !== undefined && typeof exactScore === 'number') {
           return Math.min(100, Math.max(1, exactScore));
        }
    }

    // Fallback pseudo-random heuristic if AI score is missing
    const junk = new Set(["design", "image", "photo", "picture", "file", "graphic", "visual", "element", "object", "thing", "item", "nice", "great", "good", "look", "use", "fun", "enjoyment", "reality", "pastime", "recreation", "interests", "relaxation", "simulate"]);
    if (junk.has(kl) || kl.length < 3) return 10; 
    
    let score = 75; // Increased base score so single words can easily hit green
    const wordCount = kl.split(' ').length;
    if (wordCount > 1) score += 10; // Slight boost for phrases
    if (kl.length >= 4 && kl.length <= 25) score += 10; // Boost for good length
    
    let hash = 0;
    for (let i = 0; i < kl.length; i++) hash = kl.charCodeAt(i) + ((hash << 5) - hash);
    score += (Math.abs(hash) % 10);
    
    return Math.min(99, score);
  };

  const removeKeyword = (idxToRemove) => {
    const keywords = (value || '').split(',').map(k => k.trim()).filter(Boolean);
    const newKws = keywords.filter((_, idx) => idx !== idxToRemove);
    onChange(newKws.join(', '));
  };

  return (
    <div style={{ marginBottom: '0.65rem' }}>
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-3">
          <span className="meta-label" style={{ marginBottom: 0 }}>{label}</span>
          {isKeywords && !isTextMode && (
            <div className="flex items-center gap-3 text-xs text-muted font-medium ml-3">
              <span className="flex items-center gap-1.5"><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></div> High</span>
              <span className="flex items-center gap-1.5"><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></div> Medium</span>
              <span className="flex items-center gap-1.5"><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></div> Low</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {isKeywords && (
            <button 
              onClick={() => setIsTextMode(!isTextMode)}
              title={isTextMode ? "Switch to colored tags" : "Edit as plain text"}
              style={{
                background: 'var(--surface-3)', border: '1px solid var(--glass-border)', padding: '0.2rem 0.5rem', borderRadius: '4px',
                color: 'var(--accent)', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              {isTextMode ? '🎨 Visual Tags' : '📝 Edit Text'}
            </button>
          )}
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
      </div>
      
      {isKeywords && !isTextMode ? (
        <div 
          className="flex flex-wrap gap-2 p-3 rounded-lg"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', minHeight: '90px', alignContent: 'flex-start' }}
        >
          {(value || '').split(',').map(k => k.trim()).filter(Boolean).map((kw, idx) => {
            const cleanedKw = kw.replace(/\s+\d+$/, '');
            const score = getKeywordScore(cleanedKw, img);
            let colorStr = score >= 75 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
            
            return (
              <div 
                key={idx} 
                className="group flex items-center transition-all"
                style={{ 
                  background: 'var(--surface-1)', 
                  color: 'var(--text-1)', 
                  border: '1px solid var(--glass-border)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  fontSize: '0.72rem',
                  fontWeight: '500',
                  borderRadius: '100px',
                  padding: '2px 6px 2px 8px',
                  gap: '5px',
                  height: '24px',
                  boxSizing: 'border-box'
                }}
                title={`Relevance: ${score >= 75 ? 'High' : score >= 40 ? 'Medium' : 'Low'} (${score}/100)`}
              >
                <span 
                  style={{ 
                    width: '5px', 
                    height: '5px', 
                    borderRadius: '50%', 
                    backgroundColor: colorStr,
                    display: 'inline-block',
                    flexShrink: 0
                  }} 
                />
                <span className="select-none" style={{ letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{cleanedKw}</span>
                <span 
                  role="button"
                  onClick={() => removeKeyword(idx)}
                  className="flex items-center justify-center rounded-full transition-all"
                  style={{ 
                    cursor: 'pointer',
                    color: 'var(--text-3)',
                    padding: '2px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.6,
                    width: '14px',
                    height: '14px',
                    flexShrink: 0
                  }}
                  onMouseOver={(e) => { 
                    e.currentTarget.style.color = 'var(--text-1)';
                    e.currentTarget.style.background = 'rgba(156, 163, 175, 0.15)';
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseOut={(e) => { 
                    e.currentTarget.style.color = 'var(--text-3)';
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.opacity = '0.6';
                  }}
                >
                  <X style={{ width: '10px', height: '10px' }} />
                </span>
              </div>
            );
          })}
          {(!value || value.trim() === '') && (
            <span className="text-xs text-muted italic flex items-center w-full justify-center pt-4">
              No keywords generated
            </span>
          )}
        </div>
      ) : isTextArea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="meta-value w-full outline-none resize-y"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--glass-border)',
            borderRadius: '0.4rem',
            padding: '0.5rem',
            minHeight: label === 'Keywords' ? '85px' : '60px',
            color: 'var(--text-1)',
            fontFamily: 'inherit',
            transition: 'border-color 0.2s',
            fontSize: '0.85rem'
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="meta-value w-full outline-none"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--glass-border)',
            borderRadius: '0.4rem',
            padding: '0.4rem 0.5rem',
            color: 'var(--text-1)',
            fontFamily: 'inherit',
            transition: 'border-color 0.2s',
            fontSize: '0.85rem'
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
        />
      )}
    </div>
  );
}
