// @ts-nocheck
declare global {
  interface Window {
    electronAPI?: any;
  }
}

import React, { useState, useRef, useEffect } from "react";
import { MdCloudUpload } from "react-icons/md";
import {
  Upload,
  UploadCloud,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  X,
  RefreshCw,
  Search,
  FileCode2,
  Image as ImageIcon,
  Video,
  LayoutGrid,
  List,
  AlertTriangle,
  Clock,
  Rocket,
  Sparkles,
  FileSpreadsheet,
  Tag,
  ImagePlus,
  Server,
  Square,
  Eraser,
  Zap,
  ChevronDown,
  Check,
  Layers
} from "lucide-react";

import { generateMetadata, analyzeImageSecurity } from "../../services/geminiService";

import uploadIcon from "../../assets/icons/upload.png";
import downloadIcon from "../../assets/icons/download.png";
import { processEpsFile, isEpsFile } from "../../services/epsService";

import { computeHashForEntry, detectDuplicates } from "./duplicateDetector";
import { downloadCSV, parseCSV } from "./csvHandlers";
import { StatusBadge } from "./workflowHelpers";
import { ExportFormatModal } from "./ExportFormatModal";
import { MetadataThumbnailGrid } from "./MetadataThumbnailGrid";
import { MetadataCardList } from "./MetadataCardList";
import { MetadataEditorPanel } from "./MetadataEditorPanel";

const ACCEPTED_TYPES =
  "image/jpeg,image/png,image/webp,image/gif,image/svg+xml," +
  "application/postscript,application/eps,image/eps,application/x-eps,.eps,.epsf,.epsi," +
  "video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,.mp4,.mov,.avi,.mkv,.webm";

const isVideoFile = (file: any) => {
  if (file.type && file.type.startsWith('video/')) return true;
  const ext = (file.name || '').split('.').pop().toLowerCase();
  return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
};

let imageWorker = null;
let workerMsgId = 0;
const workerCallbacks = new Map();

function getWorker() {
  if (!imageWorker) {
    imageWorker = new Worker(new URL('../../workers/imageWorker.js', import.meta.url), { type: 'module' });
    imageWorker.onmessage = (e: any) => {
      const { id, success, dataUrl, error } = e.data;
      const cb = workerCallbacks.get(id);
      if (cb) {
        workerCallbacks.delete(id);
        if (success) cb.resolve(dataUrl);
        else cb.reject(new Error(error));
      }
    };
  }
  return imageWorker;
}

const resizeImageToBase64Worker = (file: any, maxSize = 1024) => {
  return new Promise((resolve, reject) => {
    try {
      const worker = getWorker();
      const id = ++workerMsgId;
      workerCallbacks.set(id, { resolve, reject });
      worker.postMessage({ file, maxSize, id });
    } catch (err) {
      reject(err);
    }
  });
};

const PolicyViolationThumbnail = ({ img }: any) => {
  if (!img.preview) {
    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '0.2rem', alignItems: 'center', justifyContent: 'center' }}>
        <ImageIcon size={14} style={{ color: '#ef4444' }} />
      </div>
    );
  }

  return (
    <img 
      src={img.preview} 
      alt="Thumbnail" 
      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '0.2rem' }} 
    />
  );
};

const filterMetadataKeywords = (metadata: any, removeYellow: boolean, removeRed: boolean) => {
  if (!metadata || !metadata.keywords) return metadata;

  const getKeywordScore = (keyword: string, scoreObj: any) => {
    const kl = keyword.toLowerCase().trim();
    if (scoreObj) {
      let scoresObj = scoreObj;
      if (Array.isArray(scoresObj)) {
        scoresObj = scoresObj.reduce((acc: any, curr: any) => {
           if (typeof curr === 'object' && curr !== null) {
              if (curr.keyword && curr.score !== undefined) {
                 acc[curr.keyword] = curr.score;
              } else {
                 Object.assign(acc, curr);
              }
           }
           return acc;
        }, {});
      }

      let scoreKey = Object.keys(scoresObj).find(
        (k: string) => k.toLowerCase().trim() === kl
      );
      
      if (!scoreKey) {
         scoreKey = Object.keys(scoresObj).find(
           (k: string) => k.toLowerCase().split(/[\s,]+/).includes(kl)
         );
      }

      if (scoreKey !== undefined) {
        const exactScore = scoresObj[scoreKey];
        if (exactScore !== undefined && exactScore !== null) {
          const numScore = typeof exactScore === 'object' && exactScore.score !== undefined ? Number(exactScore.score) : Number(exactScore);
          if (!isNaN(numScore)) {
            return Math.min(100, Math.max(1, numScore));
          }
        }
      }
    }
    return -1;
  };

  const kws = metadata.keywords.split(',').map(k => k.trim()).filter(Boolean);
  const newKws = [];
  const newScores = { ...metadata.keywordScores };

  kws.forEach(kw => {
    const score = getKeywordScore(kw, newScores);
    
    let isYellow = false;
    let isRed = false;

    if (score === -1) {
      isRed = true;
    } else {
      if (metadata.provider === 'mistral') {
        isYellow = score >= 30 && score < 60;
        isRed = score < 30;
      } else {
        isYellow = score >= 30 && score < 70;
        isRed = score < 30;
      }
    }

    if (removeYellow && isYellow) {
      delete newScores[kw];
    } else if (removeRed && isRed) {
      delete newScores[kw];
    } else {
      newKws.push(kw);
    }
  });

  // Removed Zero-Keywords Protection: Keywords are allowed to be empty if all match the filter

  return {
    ...metadata,
    keywords: newKws.join(', '),
    keywordScores: newScores
  };
};

let globalTaskCounter = 0;
const getRotatedKeys = (keys: any[], offset: number) => {
  if (!keys || keys.length === 0) return [];
  const start = offset % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
};


export function ImageWorkflow({ apiKeys, apiProvider, promptSettings, setPromptSettings, ftpConfigs = [] }: any) {
  const [images, setImages] = useState<any[]>([]);
  const imagesRef = useRef<any[]>([]);
  imagesRef.current = images;
  const promptSettingsRef = useRef(promptSettings);
  promptSettingsRef.current = promptSettings;
  const apiKeysRef = useRef(apiKeys);
  apiKeysRef.current = apiKeys;
  const apiProviderRef = useRef(apiProvider);
  apiProviderRef.current = apiProvider;
  const [viewMode, setViewMode] = useState('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const cancelRef = useRef(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [autoEmbed, setAutoEmbed] = useState(() => localStorage.getItem("autoEmbed") === "true");
  const autoEmbedRef = useRef(autoEmbed);
  autoEmbedRef.current = autoEmbed;
  
  const [autoRemoveYellow, setAutoRemoveYellow] = useState(() => localStorage.getItem("autoRemoveYellow") === "true");
  const autoRemoveYellowRef = useRef(autoRemoveYellow);
  autoRemoveYellowRef.current = autoRemoveYellow;
  
  const [autoRemoveRed, setAutoRemoveRed] = useState(() => localStorage.getItem("autoRemoveRed") === "true");
  const autoRemoveRedRef = useRef(autoRemoveRed);
  autoRemoveRedRef.current = autoRemoveRed;
  const [embedScale, setEmbedScale] = useState(() => parseInt(localStorage.getItem("embedScale")) || 2);
  const [embedEngine, setEmbedEngine] = useState(() => {
    let val = localStorage.getItem("embedEngine");
    if (val === "mata_ai" || val === "auto_detect") val = "balanced";
    return val || "balanced";
  });
  const [embeddingCount, setEmbeddingCount] = useState(0);
  const isEmbedding = embeddingCount > 0;
  const [autoUpscale, setAutoUpscale] = useState(() => localStorage.getItem("autoUpscale") === "true");
  const [upscaleScale, setUpscaleScale] = useState(() => Math.min(parseInt(localStorage.getItem("upscaleScale")) || 2, 4));
  const [upscaleEngine, setUpscaleEngine] = useState(() => {
    let val = localStorage.getItem("upscaleEngine");
    if (val === "mata_ai" || val === "auto_detect") val = "balanced";
    return val || "balanced";
  });
  const [engineDropdownOpen, setEngineDropdownOpen] = useState(false);
  const engineDropdownRef = useRef<any>(null);
  const [hardwareTier, setHardwareTier] = useState('low-end');

  useEffect(() => {
    if (window.electronAPI?.getHardwareTier) {
      window.electronAPI.getHardwareTier().then((tier: string) => setHardwareTier(tier)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: any) => {
      if (engineDropdownRef.current && !engineDropdownRef.current.contains(e.target)) {
        setEngineDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const UPSCALE_ENGINE_OPTIONS = [
    { id: 'fast', label: 'Fast', icon: Zap, color: '#d97706', desc: 'High-Speed Performance' },
    { id: 'balanced', label: 'Balanced', icon: Sparkles, color: '#16a34a', desc: 'Smart AI Auto-Selection' },
  ];

  const [uploadBatchIds, setUploadBatchIds] = useState<any[]>([]);
  const [activeJobId, setActiveJobId] = useState<any>(null);
  const [activeCell, setActiveCell] = useState<any>(null); // { id: '...', field: '...' }
  const [showExportModal, setShowExportModal] = useState(false);
  const [showRetroactiveModal, setShowRetroactiveModal] = useState(false);
  const [retroactiveOptions, setRetroactiveOptions] = useState({ cleanYellow: false, cleanRed: false });
  const [retroactivePendingImages, setRetroactivePendingImages] = useState<any[]>([]);
  const [selectedRows, setSelectedRows] = useState<any>(new Set()); // row IDs selected in grid
  const [gridSort, setGridSort] = useState({ field: null, dir: 'asc' }); // column sort
  const [gridFilter, setGridFilter] = useState(''); // quick filter text
  const [isFilterFocused, setIsFilterFocused] = useState(false);
  const cellRefs = useRef<any>({}); // { [id_field]: textareaDOM }

  // ─── Duplicate Detection State ─────────────────────────────────────────────
  const [duplicatePairs, setDuplicatePairs] = useState<any[]>([]);
  const [dismissedDuplicates, setDismissedDuplicates] = useState(false);
  const hashMapRef = useRef<any>({}); // { [imageId]: hashString }

  const getTitleCounterClass = (val: any) => {
    const len = (val || '').length;
    if (len === 0) return '';
    if (len >= 10 && len <= 120) return 'valid';
    if (len > 120 && len <= 150) return 'warning';
    return 'invalid';
  };

  const getDescriptionCounterClass = (val: any) => {
    const len = (val || '').length;
    if (len === 0) return '';
    if (len >= 15 && len <= 200) return 'valid';
    if (len > 200 && len <= 250) return 'warning';
    return 'invalid';
  };

  const getKeywordsCounterClass = (val: any) => {
    const count = ((val as any) || '').split(',').map(k => k.trim()).filter(Boolean).length;
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
  const setConcurrentLimit = (val: any) => {
    if (typeof setPromptSettings === "function") {
      setPromptSettings((prev: any) => ({ ...prev, concurrentLimit: val }));
    }
  };
  const fileInputRef = useRef<any>(null);
  const csvInputRef = useRef<any>(null);
  const [toasts, setToasts] = useState<any[]>([]);

  const showToast = (message: any, type: any = "success") => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 8000);
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

  const pickMataAIModel = (filePath: any, engine: any) => {
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

    if (engine === 'fast') return 'fast_sharp';
    if (engine === 'standard') return 'realesrgan-x4plus';
    if (isAnimeOrVector) return 'realesrgan-x4plus-anime';
    return 'ultrasharp';
  };

  const resolveUpscaleModel = (metadata: any, originalFileName: string, activeEngine: string, tier: string) => {
    let modelName = 'span';
    const keywordStr = (Array.isArray(metadata?.keywords) ? metadata.keywords.join(',') : (metadata?.keywords || '')).toString().toLowerCase();
    const titleStr = (metadata?.title || '').toString().toLowerCase();
    const allMeta = keywordStr.trim() ? keywordStr : titleStr;
    
    let isAnime = false;
    let hasFace = false;
    let is3dRender = false;

    if (allMeta.trim()) {
      isAnime = /\b(anime|vector|cartoon|illustration|illust|drawing|art|clipart|graphic|digital|interface|ui|ux|logo|icon|design|abstract|pattern)\b/i.test(allMeta);
      hasFace = /\b(person|portrait|face|human|man|woman|girl|boy|people|model|headshot|selfie|men|women|guy|lady|child|kid|baby|toddler|teen|adult|couple|crowd|family|group|character|avatar)\b/i.test(allMeta);
      is3dRender = /\b(3d|render|cgi|unreal|octane|cinema4d)\b/i.test(allMeta);
    } else {
      const fname = (originalFileName || '').toLowerCase();
      isAnime = /\b(anime|vector|cartoon|illustration|illust|drawing|art|clipart|graphic|digital|interface|ui|ux|logo|icon|design|abstract|pattern)\b|\.svg|\.ai|\.eps/i.test(fname);
      hasFace = /\b(person|portrait|face|human|man|woman|girl|boy|people|model|headshot|selfie|men|women|guy|lady|child|kid|baby|toddler|teen|adult|couple|crowd|family|group|character|avatar)\b/i.test(fname);
      is3dRender = /\b(3d|render|cgi|unreal|octane|cinema4d)\b/i.test(fname);
    }

    if (activeEngine === 'balanced') { // Balanced
      if (isAnime) modelName = tier === 'high-end' ? 'realesrgan-x4plus-anime' : 'realesr-animevideov3';
      else if (hasFace) modelName = tier === 'high-end' ? 'realsr' : 'span';
      else modelName = 'span';
    } else {
      modelName = pickMataAIModel(originalFileName, activeEngine);
    }
    return modelName;
  };

  useEffect(() => {
    const handleKeyDown = (e: any) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Enter') {
        const canProcess = images.length > 0 && !isProcessing && !images.every((img: any) => img.status === "done");
        if (canProcess) {
          processBatch();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images, isProcessing, apiKeys]);

  const isAccepted = (file: any) => {
    if (isEpsFile(file)) return true;
    if (isVideoFile(file)) return true;
    return file.type.startsWith("image/");
  };

  const addImages = async (files: any) => {
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
      if ((group as any).eps && (group as any).raster) {
        newEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          file: (group as any).eps,
          visualFile: (group as any).raster,
          preview: URL.createObjectURL((group as any).raster),
          isEps: true,
          isPaired: true,
          epsData: null,
          status: "pending",
          embeddingStatus: "none",
          result: null,
          error: null,
        });
      } else if ((group as any).eps) {
        newEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          file: (group as any).eps,
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
      } else if ((group as any).raster) {
        newEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          file: (group as any).raster,
          visualFile: (group as any).raster,
          preview: URL.createObjectURL((group as any).raster),
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

    setImages((prev: any) => [...prev, ...newEntries]);

    setTimeout(async () => {
      const hashEntries = newEntries.filter(e => !e.isVideo);
      const HASH_BATCH = 5;
      for (let i = 0; i < hashEntries.length; i += HASH_BATCH) {
        const batch = hashEntries.slice(i, i + HASH_BATCH);
        await Promise.all(
          batch.map(async (entry) => {
            const hash = await computeHashForEntry(entry);
            if (hash) {
              hashMapRef.current[entry.id] = hash;
            }
          })
        );
        if (i + HASH_BATCH < hashEntries.length) {
          await new Promise(r => setTimeout(r, 50));
        }
      }

      const currentImages = imagesRef.current;
      const pairs = detectDuplicates(currentImages, [], hashMapRef.current);
      if (pairs.length > 0) {
        setDuplicatePairs(pairs);
        setDismissedDuplicates(false);
      } else {
        setDuplicatePairs([]);
      }
    }, 200);

    // Process EPS files sequentially to prevent system hang under concurrent CPU load
    (async () => {
      // Yield to let React re-render and populate imagesRef.current with new entries
      await new Promise((resolve) => setTimeout(resolve, 50));
      
      const epsEntries = newEntries.filter((e: any) => e.isEps && !e.isPaired);
      for (const entry of epsEntries) {
        // CRITICAL FIX: If the image was deleted (e.g., Clear All clicked), skip it!
        if (!imagesRef.current.some((img: any) => img.id === entry.id)) continue;
        
        try {
          let epsData = await processEpsFile(entry.file);
          
          // Check again after processing in case they clicked Clear All during processing
          if (!imagesRef.current.some((img: any) => img.id === entry.id)) continue;
          
          if (!epsData) {
            // Fallback to a placeholder if result is empty to stop the loading spinner
            console.warn(`[EPS] Processing returned empty data for ${entry.file.name}. Falling back to placeholder.`);
            epsData = {
              base64: null,
              mimeType: null,
              dataUrl: null,
              isPlaceholder: true,
              extractedTextContext: "Failed to extract preview or metadata."
            };
          }
          
          setImages((prev: any) =>
            prev.map((item: any) =>
              (item as any).id === entry.id
                ? { ...item, epsData, preview: epsData.dataUrl || 'placeholder-error' }
                : item
            )
          );
        } catch (err) {
          console.error("Failed to process EPS sequentially:", err);
          // Stop spinner on error too
          if (imagesRef.current.some((img: any) => img.id === entry.id)) {
            setImages((prev: any) =>
              prev.map((item: any) =>
                (item as any).id === entry.id
                  ? { ...item, preview: 'placeholder-error' }
                  : item
              )
            );
          }
        }
      }
    })();

    // Extract video frames sequentially to avoid overloading FFmpeg processes
    (async () => {
      // Yield to let React re-render and populate imagesRef.current with new entries
      await new Promise((resolve) => setTimeout(resolve, 50));
      
      const videoEntries = newEntries.filter((e: any) => e.isVideo);
      for (const entry of videoEntries) {
        // Skip if deleted
        if (!imagesRef.current.some((img: any) => img.id === entry.id)) continue;
        
        if (window.electronAPI?.extractVideoFrame && entry.file.path) {
          try {
            const frameResult = await window.electronAPI.extractVideoFrame(entry.file.path);
            
            // Skip if deleted during processing
            if (!imagesRef.current.some((img: any) => img.id === entry.id)) continue;
            
            if (frameResult.success) {
              setImages((prev: any) =>
                prev.map((item: any) =>
                  (item as any).id === entry.id
                    ? { ...item, preview: `data:image/jpeg;base64,${frameResult.base64}` }
                    : item
                )
              );
            }
          } catch (error) {
            console.error("Failed to extract video thumbnail preview sequentially:", error);
          }
        }
      }
    })();
  };

  const onFileChange = (e: any) => {
    addImages(Array.from(e.target.files));
    e.target.value = "";
  };

  const handleDragOver = (e: any) => e.preventDefault();

  const handleDrop = (e: any) => {
    e.preventDefault();
    addImages(Array.from(e.dataTransfer.files));
  };

  const removeImage = (id: any) => {
    setImages((prev: any) => {
      const img = prev.find((i: any) => i.id === id);
      if (img && img.preview && img.preview.startsWith('blob:')) {
        URL.revokeObjectURL(img.preview);
      }
      return prev.filter((i: any) => i.id !== id);
    });
    delete hashMapRef.current[id];
    
    Object.keys(cellRefs.current).forEach(key => {
      if (key.startsWith(`${id}-`)) delete cellRefs.current[key];
    });

    setDuplicatePairs((prev: any) => prev.filter((p: any) => p.id1 !== id && p.id2 !== id));
  };

  const handleApprovePolicy = (id: any) => {
    setImages((prev: any) =>
      prev.map((img: any) => {
        if (img.id === id) {
          const newResult = img.result ? { ...img.result } : null;
          if (newResult) {
            delete newResult.policyWarning;
            delete newResult.policyReason;
          }
          return { 
            ...img, 
            result: newResult, 
            status: "pending", 
            error: undefined,
            ignorePolicy: true
          };
        }
        return img;
      })
    );
    
    // Automatically trigger reprocessing
    setTimeout(() => {
      // By using imagesRef.current inside processBatch, it will pick up the updated state
      processBatch();
    }, 50);
  };

  const clearAll = () => {
    cancelRef.current = true;
    setIsProcessing(false);
    setProgress(0);
    setProgressStats({ total: 0, success: 0, error: 0, processed: 0, percent: 0, successPercent: 0, errorPercent: 0 });
    
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

  const stopProcessing = () => {
    cancelRef.current = true;
    setIsProcessing(false);
    setProgress(0);
    setProgressStats({ total: 0, success: 0, error: 0, processed: 0, percent: 0, successPercent: 0, errorPercent: 0 });
    if (activeJobId && window.electronAPI?.cancelFtp) {
      window.electronAPI.cancelFtp(activeJobId).catch(console.error);
    }
    setImages(prev => prev.map(img => 
      (img.status === 'processing' || img.status === 'extracting' || img.status === 'upscaling' || img.status === 'upscale_queued' || img.status === 'error') 
      ? { ...img, status: 'pending', error: undefined } 
      : img
    ));
  };

  const resizeImageToBase64 = (file: any, maxSize = 1024) => resizeImageToBase64Worker(file, maxSize);

  const [progress, setProgress] = useState(0);
  const [progressStats, setProgressStats] = useState({
    total: 0,
    success: 0,
    error: 0,
    processed: 0,
    percent: 0,
    successPercent: 0,
    errorPercent: 0,
    isRetry: false
  });


  const handleEmbedScaleChange = (val: any) => {
    setEmbedScale(val);
    localStorage.setItem("embedScale", val.toString());
  };

  const handleEmbedEngineChange = (val: any) => {
    setEmbedEngine(val);
    localStorage.setItem("embedEngine", val);
  };

  const getUserFriendlyErrorMessage = (msg: string, phase: string) => {
    const lower = (msg || '').toLowerCase();
    if (lower.includes('failed to fetch') || lower.includes('econnrefused') || lower.includes('network error') || lower.includes('offline')) {
      return `Network Error: Please check your network connection.`;
    }
    if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota') || lower.includes('too many requests') || lower.includes('overloaded')) {
      return `API Limit Exceeded: Daily quota or rate limit reached.`;
    }
    if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
      return `Invalid API Key: Please check your API settings.`;
    }
    return `${phase} Failed: ${msg || 'Unknown error occurred.'}`;
  };

  const processBatch = async (onlyErrors = false) => {
    if (apiKeys.length === 0) {
      const pName = Array.isArray(apiProvider) ? apiProvider.join(", ") : apiProvider;
      showToast(`Please add at least one API key for ${pName} first.`, "error");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    cancelRef.current = false;

    const currentImages = imagesRef.current;

    const toProcess = currentImages.filter((img: any) => {
      if (img.status === "done" || img.status === "upscaling" || img.status === "upscale_queued") return false;
      if (onlyErrors && img.status !== "error") return false;
      return true;
    });

    let totalItems = currentImages.length;
    let successCount = 0;
    let errorCount = 0;

    currentImages.forEach((img: any) => {
      const willBeProcessed = toProcess.some((p: any) => p.id === img.id);
      if (!willBeProcessed) {
        if (img.status === "done" || img.status === "upscaling" || img.status === "upscale_queued") {
          successCount++;
        } else if (img.status === "error") {
          errorCount++;
        }
      }
    });

    let processed = successCount + errorCount;

    const updateProgress = () => {
      if (cancelRef.current) return;
      const sPct = totalItems > 0 ? (successCount / totalItems) * 100 : 0;
      const ePct = totalItems > 0 ? (errorCount / totalItems) * 100 : 0;
      const totalPct = totalItems > 0 ? Math.round((processed / totalItems) * 100) : 0;
      setProgress(totalPct);
      setProgressStats({
        total: totalItems,
        success: successCount,
        error: errorCount,
        processed,
        percent: totalPct,
        successPercent: sPct,
        errorPercent: ePct,
        isRetry: Boolean(onlyErrors)
      });
    };

    const initialSPct = totalItems > 0 ? (successCount / totalItems) * 100 : 0;
    const initialEPct = totalItems > 0 ? (errorCount / totalItems) * 100 : 0;
    const initialTotalPct = totalItems > 0 ? Math.round((processed / totalItems) * 100) : 0;

    setProgressStats({
      total: totalItems,
      success: successCount,
      error: errorCount,
      processed: processed,
      percent: initialTotalPct,
      successPercent: initialSPct,
      errorPercent: initialEPct,
      isRetry: Boolean(onlyErrors)
    });


    const embedPromises = [];

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

    const activeProviderName: any = apiProviderRef.current || "gemini";
    const isGroqBatch = Array.isArray(activeProviderName) ? activeProviderName.includes("groq") : activeProviderName === "groq";

    for (let imgIndex = 0; imgIndex < toProcess.length; imgIndex++) {
      const img = toProcess[imgIndex];
      if (cancelRef.current) break;
      if (!imagesRef.current.some((i: any) => i.id === img.id)) {
        totalItems--;
        updateProgress();
        continue;
      }

      // Stagger Groq batch requests by 2.5s per item to stay within 30 RPM limits
      if (isGroqBatch && imgIndex > 0) {
        await new Promise(r => setTimeout(r, 2500));
      }
      if (cancelRef.current) break;

      setImages((prev: any) =>
        prev.map((item: any) =>
          (item as any).id === img.id ? { ...item, status: "processing" } : item
        )
      );

      const p = (async () => {
        try {
            if (cancelRef.current) return;
            const currentTaskIndex = globalTaskCounter++;
            const policyKeys = getRotatedKeys(apiKeysRef.current, currentTaskIndex);
            const metadataKeys = getRotatedKeys(apiKeysRef.current, currentTaskIndex + 1);

            if (!imagesRef.current.some((i: any) => i.id === img.id)) {
              throw new Error("Image was removed");
            }
            let base64, mimeType;
            let isPlaceholder = false;
            let upscaledPath = null;
            let upscaledName = null;

            if (img.isVideo) {
              setImages((prev: any) =>
                prev.map((item: any) =>
                  (item as any).id === img.id
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
              setImages((prev: any) =>
                prev.map((item: any) =>
                  (item as any).id === img.id
                    ? { ...item, preview: `data:image/jpeg;base64,${frameResult.base64}` }
                    : item
                )
              );
            } else if (img.visualFile) {
              const currentApiProvider = apiProviderRef.current;
              const currentApiKeys = apiKeysRef.current;
              const hasGroqInProvider = Array.isArray(currentApiProvider) ? currentApiProvider.includes("groq") : currentApiProvider === "groq";
              const hasGroqInKeys = currentApiKeys && currentApiKeys.some(k => (typeof k === 'object' && k.provider === 'groq') || k === 'groq');
              const targetSize = (hasGroqInProvider || hasGroqInKeys) ? 512 : 1024;
              const dataUrl = await resizeImageToBase64(img.visualFile, targetSize);
              base64 = dataUrl.split(",")[1];
              mimeType = "image/jpeg";
            } else if (img.isEps) {
              let epsData = (img as any).epsData;
              if (!epsData) {
                epsData = await processEpsFile(img.file);
                setImages((prev: any) =>
                  prev.map((item: any) =>
                    (item as any).id === img.id
                      ? { ...item, epsData, preview: epsData.dataUrl }
                      : item
                  )
                );
              }
              base64 = epsData.base64;
              mimeType = epsData.mimeType;
              isPlaceholder = epsData.isPlaceholder ?? false;
            }

            const currentProvider = apiProviderRef.current || "gemini";
            const isCombinedScan = Array.isArray(currentProvider) 
              ? (currentProvider.includes("groq")) 
              : (currentProvider === "groq");

            if (cancelRef.current) return;
            // For Groq, safety/trademark scan is combined into single metadata call to reduce API usage by 50%
            if (promptSettingsRef.current?.securityScanEnabled && !img.ignorePolicy) {
              if (isCombinedScan) {
                setImages((prev: any) =>
                  prev.map((item: any) =>
                    (item as any).id === img.id
                      ? { ...item, status: "scanning" }
                      : item
                  )
                );
              } else {
                setImages((prev: any) =>
                  prev.map((item: any) =>
                    (item as any).id === img.id
                      ? { ...item, status: "scanning" }
                      : item
                  )
                );
                const securityRes = await analyzeImageSecurity(
                  base64,
                  mimeType,
                  policyKeys,
                  currentProvider
                );
                if (!securityRes.isSafe) {
                  setImages((prev: any) =>
                    prev.map((item: any) =>
                      (item as any).id === img.id
                        ? { ...item, status: "policy_warning", result: { policyWarning: securityRes.reason, policyReason: securityRes.reason } }
                        : item
                    )
                  );
                  if (!cancelRef.current) {
                    successCount++;
                    processed++;
                    updateProgress();
                  }
                  return; // Halt pipeline gracefully
                }
                setImages((prev: any) =>
                  prev.map((item: any) =>
                    (item as any).id === img.id
                      ? { ...item, status: "processing" }
                      : item
                  )
                );
              }
            }

            const fileInfo = {
              isEps: img.isEps,
              isVideo: img.isVideo || false,
              isPlaceholder: isPlaceholder,
              fileName: img.file?.name,
              extractedTextContext: img.epsData?.extractedTextContext || null,
              promptSettings: promptSettingsRef.current,
              skipPolicyScan: img.ignorePolicy || !promptSettingsRef.current?.securityScanEnabled,
            };

            if (cancelRef.current) return;
            let metadata;
            
            // If user clicked Ignore Policy and we already have the previous valid metadata, reuse it to save API calls
            if (img.ignorePolicy && img.result && img.result.title && img.result.title !== "...") {
              metadata = { ...img.result };
              console.log("[Mata AI] Re-using previous metadata after ignoring policy.");
            } else {
              metadata = await generateMetadata(
                base64,
                mimeType,
                metadataKeys,
                currentProvider,
                fileInfo
              );
            }

            // Strip hallucinated policy warnings if scan is disabled or ignored
            if (!promptSettingsRef.current?.securityScanEnabled || img.ignorePolicy) {
              if (metadata) {
                delete metadata.policyWarning;
                delete metadata.policyReason;
              }
            }

            // Check policy warning returned in single combined scan
            if (promptSettingsRef.current?.securityScanEnabled && !img.ignorePolicy && metadata?.policyWarning) {
              setImages((prev: any) =>
                prev.map((item: any) =>
                  (item as any).id === img.id
                    ? { ...item, status: "policy_warning", result: metadata }
                    : item
                )
              );
              if (!cancelRef.current) {
                successCount++;
                processed++;
                updateProgress();
              }
              return; // Halt pipeline gracefully
            }

            if (autoEmbedRef.current) {
              metadata = filterMetadataKeywords(metadata, autoRemoveYellowRef.current, autoRemoveRedRef.current);
            }

            const activeScale = autoUpscale ? upscaleScale : (autoEmbedRef.current ? embedScale : 2);
            const activeEngine = autoUpscale ? upscaleEngine : (autoEmbedRef.current ? embedEngine : 'balanced');
            const targetPath = img.visualFile?.path || (!img.isEps && !img.isVideo ? img.file?.path : null);
            const needsUpscale = (autoUpscale && window.electronAPI && targetPath && !img.isVideo);

            setImages((prev: any) =>
              prev.map((item: any) =>
                (item as any).id === img.id
                  ? { ...item, result: metadata, status: needsUpscale ? "upscale_queued" : "done" }
                  : item
              )
            );

            if (cancelRef.current) return;
            
            const postMetadataTask = async () => {
              if (cancelRef.current) return;
              try {
                if (!imagesRef.current.some((i: any) => i.id === img.id)) {
                  throw new Error("Image was removed");
                }
            if (needsUpscale) {
              try {
                setImages((prev: any) =>
                  prev.map((item: any) =>
                    (item as any).id === img.id
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
                let modelName = resolveUpscaleModel(metadata, smartNameForModel, activeEngine, hardwareTier);
                const displayModelName = activeEngine === 'balanced' ? 'Balanced' : (activeEngine === 'fast' ? 'Fast' : modelName);
                
                console.log(`[Mata AI] Engine: ${activeEngine} | Model: ${modelName} | File: ${smartNameForModel}`);
                setImages(prev => prev.map(i => i.id === img.id ? { ...i, upscaleModel: displayModelName } : i));
 
                let arrayBuffer;
 
                try {
                  const customSuffix = displayModelName;
                  const upscalePromise = window.electronAPI.upscaleLocalNcnn(
                    targetPath,
                    activeScale,
                    modelName,
                    outputFormat,
                    upscaleFolder,
                    customSuffix
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
                  formData.append('scale', activeScale);
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
                  const savePath = `${upscaleFolder}${pathSeparator}${baseName}_${activeScale}x${ext}`;
                  const saveRes = await window.electronAPI.saveFile(savePath, new Uint8Array(arrayBuffer));
                  if (!saveRes.success) throw new Error(saveRes.error);
                  upscaledPath = savePath;
                  upscaledName = `${baseName}_${activeScale}x${ext}`;
                  console.log(`[Mata AI] ✅ Server API fallback success: ${upscaledName}`);
                }

                if (!cancelRef.current) {
                  setImages((prev: any) =>
                    prev.map((item: any) => {
                      if ((item as any).id === img.id) {
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
                }
              } catch (upscaleErr) {
                console.error('[Mata AI] Upscale error:', upscaleErr);
                throw new Error(`Auto-Upscale failed: ${upscaleErr.message}`);
              }
            }

            if (!cancelRef.current) {
              setImages((prev: any) =>
                prev.map((item: any) =>
                  (item as any).id === img.id
                    ? { ...item, status: "done" }
                    : item
                )
              );
            }

            if (autoEmbedRef.current && window.electronAPI) {
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
            if (!cancelRef.current) {
              successCount++;
            }
          } catch (err: any) {
            if (!cancelRef.current) {
              const friendlyError = getUserFriendlyErrorMessage(err.message, 'Upscaling');
              setImages((prev: any) =>
                  prev.map((item: any) =>
                    (item as any).id === img.id
                      ? { ...item, status: "error", error: friendlyError }
                      : item
                  )
                );
              errorCount++;
            }
          } finally {
            if (!cancelRef.current) {
              processed++;
              updateProgress();
            }
          }
        };

        if (needsUpscale) {
          upscaleQueue.push(postMetadataTask);
          runUpscaleQueue();
        } else {
          postMetadataTask();
        }
      } catch (err: any) {
          if (!cancelRef.current) {
            if (err.message === "Image was removed") {
              totalItems--;
              updateProgress();
              return;
            }
            const friendlyError = getUserFriendlyErrorMessage(err.message, 'Metadata');
            setImages((prev: any) =>
              prev.map((item: any) =>
                (item as any).id === img.id
                  ? { ...item, status: "error", error: friendlyError }
                  : item
              )
            );
            errorCount++;
            processed++;
            updateProgress();
          }
      }
    })();

      activePromises.add(p);
      p.finally(() => activePromises.delete(p));

      if (cancelRef.current) {
        setIsProcessing(false);
        return;
      }

      if (isGroqBatch) {
        // Groq rate limit protection (TPM/RPM): Wait for current image to complete + 8s cool-down before next image
        await p;
        if (imgIndex < toProcess.length - 1 && !cancelRef.current) {
          await new Promise(r => setTimeout(r, 8000));
        }
      } else {
        while (activePromises.size >= (promptSettingsRef.current?.concurrentLimit || 2)) {
          await Promise.race(activePromises);
        }
      }
      
      if (cancelRef.current) break;
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
    
    if (autoEmbedRef.current && window.electronAPI && embedPromises.length > 0) {
      await Promise.allSettled(embedPromises);
    }
    
    setTimeout(() => {
      const latestImages = imagesRef.current;
      const doneImages = latestImages.filter(img => img.status === "done" && img.result && img.embeddingStatus === "none");
      if (doneImages.length > 0 && window.electronAPI) {
        if (autoEmbedRef.current) {
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
      
      if (activeFtpConfigs.length > 0) {
        setUploadBatchIds(currentImages.map(img => img.id));
      } else {
        setUploadBatchIds([]);
      }
      
      setImages(prev => prev.map(img => {
        const shouldEmbed = currentImages.some(ci => ci.id === img.id);
        if (shouldEmbed) {
          return { ...img, embeddingStatus: "embedding", embeddingError: null };
        }
        return img;
      }));
      
      const embeddedImages: any[] = [];
      const filesToUpload: any[] = [];
      
      for (const img of currentImages) {
        try {
          if (cancelRef.current) return;
          if (!imagesRef.current.some((i: any) => i.id === img.id)) continue;
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
                newPrimaryPath = res.newPath || target.path;
                newPrimaryName = res.newFileName || newPrimaryName;
              }
              if (target.type === 'visual') {
                newVisualPath = res.newPath || target.path;
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
              (item as any).id === img.id 
                ? { 
                    ...item, 
                    embeddingStatus: ((autoEmbedRef.current || forceUpload) && activeFtpConfigs.length > 0) ? "uploading" : "success", 
                    renamedPath: newPrimaryPath,
                    renamedVisualPath: newVisualPath,
                    renamedName: newPrimaryName
                  } 
                : item
            ));
          } else {
            setImages(prev => prev.map(item => 
              (item as any).id === img.id 
                ? { ...item, embeddingStatus: "error", embeddingError: getUserFriendlyErrorMessage(errMsg, 'Embedding') } 
                : item
            ));
          }
        } catch (err) {
          setImages(prev => prev.map(item => 
            (item as any).id === img.id 
              ? { ...item, embeddingStatus: "error", embeddingError: getUserFriendlyErrorMessage(err.message, 'Embedding') } 
              : item
          ));
        }
      }
      
      const uploadConfigs = activeFtpConfigs;

      if ((autoEmbedRef.current || forceUpload) && uploadConfigs.length > 0 && filesToUpload.length > 0) {
        setImages(prev => prev.map(item => {
          const isEmbedded = embeddedImages.some(ei => ei.id === (item as any).id);
          if (isEmbedded) {
            return { ...item, embeddingStatus: "uploading", uploadProgress: {}, embeddingError: null };
          }
          return item;
        }));
        
        const jobId = Math.random().toString(36).substr(2, 9);
        setActiveJobId(jobId);
        
        try {
          const uploadPromises = uploadConfigs.map(async (conf: any) => {
            try {
              const ftpRes = await window.electronAPI.uploadFtp(conf, filesToUpload, jobId);
              if (!ftpRes.success) {
                return { host: conf.websiteName || conf.host, globalError: ftpRes.error, fileErrors: {} };
              }
              return { host: conf.websiteName || conf.host, fileErrors: ftpRes.fileErrors || {}, globalError: null };
            } catch (err) {
              return { host: conf.websiteName || conf.host, globalError: err.message, fileErrors: {} };
            }
          });
          
          const uploadResults = await Promise.all(uploadPromises);

          const fileErrorsMap = {};
          for (const res of uploadResults) {
            if (res.globalError) {
              for (const filePath of filesToUpload) {
                const normalizedPath = filePath.replace(/\\/g, '/');
                if (!fileErrorsMap[normalizedPath]) fileErrorsMap[normalizedPath] = {};
                fileErrorsMap[normalizedPath][res.host] = res.globalError;
              }
            } else {
              for (const [filePath, err] of Object.entries(res.fileErrors)) {
                if (err) {
                  const normalizedPath = filePath.replace(/\\/g, '/');
                  if (!fileErrorsMap[normalizedPath]) fileErrorsMap[normalizedPath] = {};
                  fileErrorsMap[normalizedPath][res.host] = err;
                }
              }
            }
          }

          setImages(prev => prev.map(item => {
            const isEmbedded = embeddedImages.some(ei => ei.id === (item as any).id);
            if (!isEmbedded) return item;

            const primaryPath = (item.renamedPath || item.file?.path || '').replace(/\\/g, '/');
            const visualPath = (item.renamedVisualPath || item.visualFile?.path || '').replace(/\\/g, '/');

            const primaryErrors = fileErrorsMap[primaryPath];
            const visualErrors = item.isEps && visualPath !== primaryPath ? fileErrorsMap[visualPath] : null;

            const mergedErrors = { ...(primaryErrors || {}), ...(visualErrors || {}) };

            if (Object.keys(mergedErrors).length > 0) {
              const errMsg = Object.entries(mergedErrors).map(([h, err]) => `${h}: ${err}`).join(', ');
              return { ...item, embeddingStatus: "error", embeddingError: getUserFriendlyErrorMessage(errMsg, 'FTP Upload') };
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
            showToast(`Metadata embedded, but upload failed for ${failedCount} file${failedCount !== 1 ? 's' : ''}.`, "error");
          } else {
            if (successCount === 1) {
              showToast(`"${embeddedImages[0].renamedName || embeddedImages[0].file.name}" successfully uploaded to FTP!`, "success");
            } else {
              showToast(`${successCount} files successfully uploaded to FTP!`, "success");
            }
          }

        } catch (uploadErr) {
          setImages(prev => prev.map(item => {
            const isEmbedded = embeddedImages.some(ei => ei.id === (item as any).id);
            if (isEmbedded) {
              return { ...item, embeddingStatus: "error", embeddingError: getUserFriendlyErrorMessage(uploadErr.message, 'FTP Upload') };
            }
            return item;
          }));
          showToast(`FTP upload failed: ${uploadErr.message}`, "error");
        } finally {
          setActiveJobId(null);
        }
      } else if (embeddedImages.length > 0) {
        const isAutoEmbedWithNoFtp = autoEmbedRef.current && activeFtpConfigs.length === 0;
        if (isAutoEmbedWithNoFtp) {
          if (embeddedImages.length === 1) {
            showToast(`Metadata successfully embedded in "${embeddedImages[0].renamedName || embeddedImages[0].file.name}", but FTP upload was skipped because no active servers are selected.`, "warning");
          } else {
            showToast(`Metadata successfully embedded in ${embeddedImages.length} files, but FTP upload was skipped because no active servers are selected.`, "warning");
          }
        } else {
          if (embeddedImages.length === 1) {
            showToast(`Metadata successfully embedded in "${embeddedImages[0].renamedName || embeddedImages[0].file.name}"!`, "success");
          } else if (embeddedImages.length > 1) {
            showToast(`Metadata successfully embedded in ${embeddedImages.length} files!`, "success");
          }
        }
      }
    } finally {
      setEmbeddingCount(prev => Math.max(0, prev - 1));
      setUploadBatchIds([]);
    }
  };
  
  const retryEmbedAndUpload = () => {
    const failedImages = images.filter(img => img.embeddingStatus === "error");
    if (failedImages.length > 0) {
      embedMetadataToFiles(failedImages, true);
    }
  };

  const handleAutoEmbedChange = (e: any) => {
    const checked = e.target.checked;
    
    if (checked) {
      const pendingEmbedImages = images.filter((img: any) => 
        img.status === "done" && 
        (!img.embeddingStatus || img.embeddingStatus === "none" || img.embeddingStatus === "error")
      );

      if (pendingEmbedImages.length > 0) {
        setRetroactivePendingImages(pendingEmbedImages);
        setRetroactiveOptions({ cleanYellow: false, cleanRed: false });
        setShowRetroactiveModal(true);
        return; // Wait for modal action
      }

      setAutoEmbed(true);
      localStorage.setItem("autoEmbed", "true");

      const activeConfigs = ftpConfigs.filter(c => c.enabled);
      if (activeConfigs.length === 0) {
        showToast("No active FTP servers connected or selected! Metadata will be embedded locally, but FTP upload will be skipped.", "warning");
      }
    } else {
      setAutoEmbed(false);
      localStorage.setItem("autoEmbed", "false");
    }
  };

  const confirmRetroactiveProcess = () => {
    let pendingImages = [...retroactivePendingImages];

    if (retroactiveOptions.cleanYellow || retroactiveOptions.cleanRed) {
      setAutoRemoveYellow(retroactiveOptions.cleanYellow);
      localStorage.setItem("autoRemoveYellow", retroactiveOptions.cleanYellow ? "true" : "false");
      
      setAutoRemoveRed(retroactiveOptions.cleanRed);
      localStorage.setItem("autoRemoveRed", retroactiveOptions.cleanRed ? "true" : "false");

      pendingImages = pendingImages.map(img => {
        if (img.result) {
          return {
            ...img,
            result: filterMetadataKeywords(img.result, retroactiveOptions.cleanYellow, retroactiveOptions.cleanRed)
          };
        }
        return img;
      });

      setImages((prev: any[]) => prev.map((p: any) => {
        const updated = pendingImages.find((u: any) => u.id === p.id);
        return updated ? updated : p;
      }));
    }

    setAutoEmbed(true);
    localStorage.setItem("autoEmbed", "true");
    
    embedMetadataToFiles(pendingImages, true);
    
    const activeConfigs = ftpConfigs.filter(c => c.enabled);
    if (activeConfigs.length === 0) {
      showToast("No active FTP servers connected or selected! Metadata will be embedded locally, but FTP upload will be skipped.", "warning");
    }
    setShowRetroactiveModal(false);
  };

  const cancelRetroactiveProcess = () => {
    setShowRetroactiveModal(false);
    // the toggle remains off
  };

  const handleAutoRemoveYellowChange = (e: any) => {
    const checked = e.target.checked;
    setAutoRemoveYellow(checked);
    localStorage.setItem("autoRemoveYellow", checked ? "true" : "false");
  };

  const handleAutoRemoveRedChange = (e: any) => {
    const checked = e.target.checked;
    setAutoRemoveRed(checked);
    localStorage.setItem("autoRemoveRed", checked ? "true" : "false");
  };

  const handleCSVImport = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event: any) => {
      const text = event.target.result;
      try {
        const rows = parseCSV(text);
        if (rows.length < 2) {
          showToast("No data found in the CSV file.", "error");
          return;
        }

        const headers = rows[0].map(h => String(h || '').trim().toLowerCase().replace(/[\s_-]+/g, ''));
        
        const filenameIdx = headers.findIndex(h => h.includes('filename') || h.includes('file'));
        const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('name'));
        const descIdx = headers.findIndex(h => h.includes('description') || h.includes('desc') || h.includes('caption'));
        const keywordsIdx = headers.findIndex(h => h.includes('keywords') || h.includes('tags') || h.includes('subject'));

        if (filenameIdx === -1) {
          showToast("Filename column not found in the CSV file.", "error");
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
          showToast(`Metadata for ${updateCount} file${updateCount !== 1 ? 's' : ''} successfully imported from CSV!`, "success");
        } else {
          showToast("No matching files found in the CSV for current batch images.", "warning");
        }
      } catch (err) {
        showToast(`CSV import error: ${err.message}`, "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleMetaChange = (id: any, field: any, value: any) => {
    setImages((prev: any) =>
      prev.map((img: any) => {
        if (img.id === id && img.result) {
          return { ...img, result: { ...img.result, [field]: value } };
        }
        return img;
      })
    );
  };

  const applyToSelected = (sourceId: any, field: any, value: any) => {
    if (selectedRows.size < 2) return;
    setImages((prev: any) =>
      prev.map((img: any) => {
        if (selectedRows.has(img.id) && img.result) {
          return { ...img, result: { ...img.result, [field]: value } };
        }
        return img;
      })
    );
  };

  const removeKeywordsByColor = (color: any) => {
    const getKeywordScore = (keyword: any, img: any) => {
      const kl = keyword.toLowerCase().trim();
      if (img && img.result && img.result.keywordScores) {
        let scoresObj = img.result.keywordScores;
        if (Array.isArray(scoresObj)) {
          scoresObj = scoresObj.reduce((acc: any, curr: any) => {
             if (typeof curr === 'object' && curr !== null) {
                if (curr.keyword && curr.score !== undefined) {
                   acc[curr.keyword] = curr.score;
                } else {
                   Object.assign(acc, curr);
                }
             }
             return acc;
          }, {});
        }

        let scoreKey = Object.keys(scoresObj).find(
          (k: string) => k.toLowerCase().trim() === kl
        );
        
        if (!scoreKey) {
           scoreKey = Object.keys(scoresObj).find(
             (k: string) => k.toLowerCase().split(/[\s,]+/).includes(kl)
           );
        }

        if (scoreKey !== undefined) {
          const exactScore = scoresObj[scoreKey];
          if (exactScore !== undefined && exactScore !== null) {
            const numScore = typeof exactScore === 'object' && exactScore.score !== undefined ? Number(exactScore.score) : Number(exactScore);
            if (!isNaN(numScore)) {
              return Math.min(100, Math.max(1, numScore));
            }
          }
        }
      }
      const isEpsAsset = Boolean(img?.isEps || (img?.file?.name && /\.(eps|epsf|epsi)$/i.test(img.file.name)));
      const junk = new Set(isEpsAsset
        ? ["image", "photo", "picture", "file", "thing", "item", "nice", "great", "good", "look", "use", "fun", "enjoyment", "reality", "pastime", "recreation", "interests", "relaxation", "simulate"]
        : ["design", "image", "photo", "picture", "file", "graphic", "visual", "element", "object", "thing", "item", "nice", "great", "good", "look", "use", "fun", "enjoyment", "reality", "pastime", "recreation", "interests", "relaxation", "simulate"]
      );
      if (junk.has(kl) || kl.length < 3) return -1;
      if (img && img.result && img.result.keywords) {
        const allKws = img.result.keywords.split(',').map((k: string) => k.toLowerCase().trim());
        const kwIdx = allKws.indexOf(kl);
        if (kwIdx !== -1) {
          if (kwIdx < 15) return Math.max(70, Math.round(95 - (kwIdx * 1.6)));
          if (kwIdx < 35) return Math.max(30, Math.round(68 - ((kwIdx - 15) * 1.8)));
          return Math.max(5, Math.round(28 - ((kwIdx - 35) * 1.5)));
        }
      }
      return -1;
    };

    setImages(prev => prev.map(img => {
      if (!img.result || !img.result.keywords) return img;
      
      const kws = img.result.keywords.split(',').map(k => k.trim()).filter(Boolean);
      const newKws = [];
      const newScores = { ...img.result.keywordScores };

      kws.forEach(kw => {
        const score = getKeywordScore(kw, img);
        let isYellow = false;
        let isRed = false;

        if (score === -1) {
          isRed = true;
        } else {
          if (img.result?.provider === 'mistral') {
            isYellow = score >= 30 && score < 60;
            isRed = score < 30;
          } else {
            isYellow = score >= 30 && score < 70;
            isRed = score < 30;
          }
        }

        if (color === 'yellow' && isYellow) {
          delete newScores[kw];
        } else if (color === 'red' && isRed) {
          delete newScores[kw];
        } else {
          newKws.push(kw);
        }
      });

      return {
        ...img,
        result: {
          ...img.result,
          keywords: newKws.join(', '),
          keywordScores: newScores
        }
      };
    }));
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
    list.sort((a, b) => {
      const aHasError = a.status === 'error' || a.embeddingStatus === 'error' || !!a.result?.policyWarning;
      const bHasError = b.status === 'error' || b.embeddingStatus === 'error' || !!b.result?.policyWarning;
      
      if (aHasError && !bHasError) return -1;
      if (!aHasError && bHasError) return 1;

      if (gridSort.field) {
        let av = '', bv = '';
        if (gridSort.field === 'filename') { av = a.file?.name || ''; bv = b.file?.name || ''; }
        else if (gridSort.field === 'status') { av = a.status || ''; bv = b.status || ''; }
        else if (gridSort.field === 'title') { av = a.result?.title || ''; bv = b.result?.title || ''; }
        else if (gridSort.field === 'score') { av = Number(a.result?.sellingScore ?? -1); bv = Number(b.result?.sellingScore ?? -1); }
        if (typeof av === 'number') return gridSort.dir === 'asc' ? av - bv : bv - av;
        return gridSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return 0;
    });

    return list;
  };

  const toggleSort = (field: any) => {
    setGridSort(prev => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getProviderName = (prov: any) => {
    const map = {
      gemini: "Gemini",
      groq: "Groq",
      openai: "OpenAI",
      mistral: "Mistral"
    };
    return map[prov] || "Gemini";
  };
  const activeProviderName = getProviderName(Array.isArray(apiProvider) ? apiProvider[0] : apiProvider);

  const metadataDoneCount = images.filter((i) => i.result !== null).length;
  const upscaleDoneCount = images.filter((i) => i.status === "done" && (i.upscaleModel || i.upscaleProgress !== undefined)).length;
  const doneCount = images.filter((i) => i.status === "done").length;
  const allDoneCount = images.filter((i) => i.status === "done" && (!autoEmbed || i.embeddingStatus === "success") && (!autoUpscale || i.upscaleProgress !== undefined)).length;
  const errorCount = images.filter((i) => i.status === "error").length;
  const pendingCount = images.filter((i) => i.status === "pending").length;
  const epsCount = images.filter((i) => i.isEps).length;

  const embeddingSuccessCount = images.filter((i) => i.embeddingStatus === "success").length;
  const embeddingErrorCount = images.filter((i) => i.embeddingStatus === "error").length;
  const localEmbedErrorCount = images.filter((i) => i.embeddingStatus === "error" && (!i.embeddingError || !i.embeddingError.includes(':'))).length;
  const ftpErrorCount = images.filter((i) => i.embeddingStatus === "error" && i.embeddingError && i.embeddingError.includes(':')).length;
  const policyViolationCount = images.filter((i) => i.result?.policyWarning || (i.result?.policyReason && i.result.policyReason.trim().length > 0)).length;

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
          <div className="upload-icon-wrap" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '4.5rem',
            height: '4.5rem',
            borderRadius: '1.25rem',
            background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
            boxShadow: '0 8px 20px -4px rgba(139, 92, 246, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '1.25rem',
            transition: 'transform 0.2s ease',
          }}>
            <MdCloudUpload style={{ width: '2.5rem', height: '2.5rem', color: '#ffffff' }} />
          </div>
          <h2 style={{ marginBottom: '0.4rem', fontSize: '1.2rem', fontWeight: 600 }}>Upload Media, EPS or Video Files</h2>
          <p className="text-muted" style={{ marginBottom: '1rem' }}>
            Drag & drop or click — JPG, PNG, WebP, GIF, SVG, <span style={{ color: 'var(--accent)', fontWeight: 700 }}>EPS</span> & MP4/MOV
          </p>
          <div className="flex gap-3">
            <span className="eps-badge"><FileCode2 className="w-3 h-3" /> EPS Vector</span>
            <span className="img-badge"><ImageIcon className="w-3 h-3" /> Raster Image</span>
            <span className="video-badge"><Video className="w-3 h-3" /> Video</span>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.75rem' }}>
            Maximum recommended: 300 files per batch
          </p>
        </div>
      </div>

      {/* ERROR BANNER 1: GENERATION FAILED (API LIMIT / DISCONNECTED) */}
      {errorCount > 0 && (
        <div className="glass card animate-fade-in" style={{ borderLeft: '4px solid var(--danger)', background: 'rgba(248,113,113,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'var(--danger)', fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RefreshCw className="w-4 h-4" /> 
              {errorCount} File{errorCount !== 1 ? 's' : ''} Failed to Generate Metadata
            </h3>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Metadata could not be generated due to API rate limits, daily quota limits, or internet connection issues.
            </p>
          </div>
          <button
            className="btn-primary shrink-0"
            style={{ background: 'var(--danger)', boxShadow: '0 4px 15px rgba(248,113,113,0.3)' }}
            disabled={isProcessing}
            onClick={() => processBatch(true)}
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isProcessing ? 'Retrying...' : 'Retry Generation'}
          </button>
        </div>
      )}

      {/* ERROR BANNER 2: LOCAL EMBEDDING FAILED */}
      {localEmbedErrorCount > 0 && (
        <div className="glass card animate-fade-in mt-4" style={{ borderLeft: '4px solid var(--danger)', background: 'rgba(248,113,113,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'var(--danger)', fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RefreshCw className="w-4 h-4" /> 
              {localEmbedErrorCount} File{localEmbedErrorCount !== 1 ? 's' : ''} Failed to Embed (Local Save)
            </h3>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Metadata could not be embedded or saved locally. Please try again.
            </p>
          </div>
          <button
            className="btn-primary shrink-0"
            style={{ background: 'var(--danger)', boxShadow: '0 4px 15px rgba(248,113,113,0.3)' }}
            disabled={isEmbedding}
            onClick={() => retryEmbedAndUpload()}
          >
            {isEmbedding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isEmbedding ? 'Retrying...' : 'Retry Embedding'}
          </button>
        </div>
      )}

      {/* ERROR BANNER 3: FTP UPLOAD FAILED */}
      {ftpErrorCount > 0 && (
        <div className="glass card animate-fade-in mt-4" style={{ borderLeft: '4px solid var(--danger)', background: 'rgba(248,113,113,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'var(--danger)', fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RefreshCw className="w-4 h-4" /> 
              {ftpErrorCount} File{ftpErrorCount !== 1 ? 's' : ''} Failed to Upload to FTP
            </h3>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
              File upload to FTP server was not completed (network disconnect or server unreachable).
            </p>
          </div>
          <button
            className="btn-primary shrink-0"
            style={{ background: 'var(--danger)', boxShadow: '0 4px 15px rgba(248,113,113,0.3)' }}
            disabled={isEmbedding}
            onClick={() => retryEmbedAndUpload()}
          >
            {isEmbedding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isEmbedding ? 'Retrying...' : 'Retry FTP Upload'}
          </button>
        </div>
      )}

      {/* ERROR BANNER 4: POLICY / COPYRIGHT / TRADEMARK FLAGGED */}
      {policyViolationCount > 0 && (
        <div className="glass card animate-fade-in mt-4" style={{ borderLeft: '4px solid #f43f5e', background: 'rgba(244,63,94,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: '#f43f5e', fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle className="w-4 h-4" /> 
              {policyViolationCount} File{policyViolationCount !== 1 ? 's' : ''} Flagged for Copyright / Policy Issue
            </h3>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Files flagged as sensitive due to potential brand trademark or marketplace policy violations.
            </p>
          </div>
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
                  — These images are almost identical. Stock sites might reject them!
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
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-primary, inherit)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pair.name1}>
                      {pair.name1}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>=</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-primary, inherit)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pair.name2}>
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

      {/* Dual Progress Bar (Success + Error Split) */}
      {images.length > 0 && (
        <div style={{ width: '100%', margin: '12px 0', padding: '12px 16px', background: 'var(--surface-1, #ffffff)', borderRadius: '12px', border: '1px solid var(--surface-3, #e2e8f0)', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-1)' }}>
                {isProcessing
                  ? (progressStats.isRetry ? `Retrying (${progressStats.processed} of ${progressStats.total} files)` : `Processing (${progressStats.processed} of ${progressStats.total} files)`)
                  : (progressStats.isRetry ? `Retry Summary (${progressStats.processed} of ${progressStats.total} files)` : `Batch Summary (${progressStats.processed} of ${progressStats.total} files)`)}
              </span>
              <>
                <span style={{ color: '#06b6d4', background: 'transparent', border: '1px solid rgba(6, 182, 212, 0.35)', padding: '2px 8px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                  <UploadCloud style={{ width: '0.85rem', height: '0.85rem' }} /> {images.length} Uploaded
                </span>
                <span style={{ color: '#3b82f6', background: 'transparent', border: '1px solid rgba(59, 130, 246, 0.35)', padding: '2px 8px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                  <FileCode2 style={{ width: '0.85rem', height: '0.85rem' }} /> {metadataDoneCount} Metadata done
                </span>
                {autoUpscale && (
                  <span style={{ color: '#6366f1', background: 'transparent', border: '1px solid rgba(99, 102, 241, 0.35)', padding: '2px 8px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                    <ImagePlus style={{ width: '0.85rem', height: '0.85rem' }} /> {upscaleDoneCount} Upscale done
                  </span>
                )}
                {autoEmbed && (
                  <span style={{ color: '#8b5cf6', background: 'transparent', border: '1px solid rgba(139, 92, 246, 0.35)', padding: '2px 8px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                    <Server style={{ width: '0.85rem', height: '0.85rem' }} /> {embeddingSuccessCount} Server Synced
                  </span>
                )}
                {(autoEmbed || autoUpscale) && allDoneCount > 0 && (
                  <span style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 8px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                    <CheckCircle2 style={{ width: '0.85rem', height: '0.85rem' }} /> {allDoneCount} All done
                  </span>
                )}
              </>
              {progressStats.error > 0 && (
                <span style={{ color: '#ef4444', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.12)', padding: '2px 8px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                  ✕ {progressStats.error} Failed ({Math.round(progressStats.errorPercent)}%)
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-2)', fontSize: '0.85rem' }}>
                {progressStats.percent}%
              </div>
              {!isProcessing && (
                <button
                  onClick={() => setProgressStats({ total: 0, success: 0, error: 0, processed: 0, percent: 0, successPercent: 0, errorPercent: 0, isRetry: false })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px', display: 'flex', alignItems: 'center' }}
                  title="Dismiss summary"
                >
                  <X style={{ width: '0.85rem', height: '0.85rem' }} />
                </button>
              )}
            </div>
          </div>
          <div style={{ height: '9px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', display: 'flex', width: '100%' }}>
            {/* Success Segment (Cyan/Green Gradient) */}
            <div
              style={{
                width: `${progressStats.successPercent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #3b82f6, #10b981)',
                transition: 'width 0.3s ease'
              }}
            />
            {/* Error Segment (Red/Crimson) */}
            <div
              style={{
                width: `${progressStats.errorPercent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #ef4444, #dc2626)',
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>
      )}

      {/* Control Bar */}
      {images.length > 0 && (
        <div className="control-bar" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div className="control-bar-bg" />
          {/* ── ROW 1: Main Actions ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.65rem' }}>
            
            {/* Left side: View Toggle + Main Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              
              {/* 1. View mode toggle */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                background: '#e4e7ec', 
                padding: '2px', 
                borderRadius: '0.55rem',
                border: '1px solid rgba(0, 0, 0, 0.04)',
                boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.06)',
                gap: '2px'
              }}>
                <button
                  className="btn-icon"
                  style={{ 
                    padding: '0.35rem', 
                    borderRadius: '0.4rem', 
                    background: viewMode === 'card' ? '#ffffff' : 'transparent', 
                    color: viewMode === 'card' ? 'var(--text-1)' : '#71717a', 
                    border: 'none', 
                    cursor: 'pointer',
                    boxShadow: viewMode === 'card' ? '0 2px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    outline: 'none'
                  }}
                  onClick={() => { setViewMode('card'); setSelectedRows(new Set()); }}
                  title="Card View"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  className="btn-icon"
                  style={{ 
                    padding: '0.35rem', 
                    borderRadius: '0.4rem', 
                    background: viewMode === 'grid' ? '#ffffff' : 'transparent', 
                    color: viewMode === 'grid' ? 'var(--text-1)' : '#71717a', 
                    border: 'none', 
                    cursor: 'pointer',
                    boxShadow: viewMode === 'grid' ? '0 2px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    outline: 'none'
                  }}
                  onClick={() => setViewMode('grid')}
                  title="Spreadsheet View (Bulk Edit)"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>

              {/* Badges (Errors) right next to view toggle if they exist */}
              {(localEmbedErrorCount > 0 || ftpErrorCount > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ width: '1px', height: '1.4rem', background: 'var(--glass-border, #e2e8f0)', margin: '0 2px' }} />
                  {localEmbedErrorCount > 0 && (
                    <span style={{ color: '#f43f5e', display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(244, 63, 94, 0.08)', padding: '2px 8px', borderRadius: '5px', border: '1px solid rgba(244, 63, 94, 0.2)', fontSize: '0.75rem', fontWeight: 600 }} title="Failed Local Embed">
                      <AlertTriangle style={{ width: '0.8rem', height: '0.8rem' }} /> {localEmbedErrorCount}
                    </span>
                  )}
                  {ftpErrorCount > 0 && (
                    <span style={{ color: '#f43f5e', display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(244, 63, 94, 0.08)', padding: '2px 8px', borderRadius: '5px', border: '1px solid rgba(244, 63, 94, 0.2)', fontSize: '0.75rem', fontWeight: 600 }} title="Failed FTP Upload">
                      <AlertTriangle style={{ width: '0.8rem', height: '0.8rem' }} /> {ftpErrorCount}
                    </span>
                  )}
                </div>
              )}

              <div style={{ width: '1px', height: '1.6rem', background: 'var(--glass-border, #e2e8f0)', margin: '0 4px' }} />

              {/* 2. Generate All */}
              {!images.every(img => img.status === 'done') && (
                <button
                  className="btn-glass-blue"
                  style={{ padding: '0.38rem 0.8rem', boxShadow: 'none' }}
                  disabled={isProcessing}
                  onClick={() => processBatch(false)}
                  title="Keyboard shortcut: Enter"
                >
                  {isProcessing ? <Loader2 style={{ width: '0.95rem', height: '0.95rem' }} className="animate-spin" /> : <Sparkles style={{ width: '0.95rem', height: '0.95rem' }} />}
                  {isProcessing ? 'Generating...' : 'Generate all'}
                </button>
              )}
              
              {/* 3. Embed to files */}
              {window.electronAPI ? (
                <button
                  className={`btn-glass-blue ${doneCount > 0 && !isProcessing && !isEmbedding ? 'animate-border-glow' : ''}`}
                  style={{ padding: '0.38rem 0.8rem', transition: 'background-color 0.3s, border-color 0.3s' }}
                  disabled={isEmbedding || doneCount === 0}
                  onClick={() => {
                    setShowPermissionModal(true);
                    localStorage.setItem('embedToastSeen', 'true');
                  }}
                >
                  {isEmbedding ? <Loader2 style={{ width: '0.9rem', height: '0.9rem' }} className="animate-spin" /> : <Tag style={{ width: '0.9rem', height: '0.9rem', strokeWidth: 2.2 }} />}
                  {isEmbedding ? 'Embedding...' : 'Embed to files'}
                </button>
              ) : (
                <button
                  className="btn-glass-blue"
                  style={{ padding: '0.38rem 0.8rem' }}
                  onClick={() => alert("To embed metadata directly into files, run the app as a desktop application (npm run app:dev).")}
                  disabled
                >
                  <Tag style={{ width: '0.9rem', height: '0.9rem', strokeWidth: 2.2 }} /> Embed to files
                </button>
              )}

              {/* 4. Export CSV */}
              <button
                className="btn-csv-grad"
                style={{ padding: '0.38rem 0.8rem' }}
                disabled={isProcessing || doneCount === 0}
                onClick={() => setShowExportModal(true)}
              >
                <FileSpreadsheet style={{ width: '0.9rem', height: '0.9rem', strokeWidth: 2.2 }} /> Export CSV ({doneCount})
              </button>

              {/* Clean Yellow/Red buttons (conditional) */}
              {doneCount > 0 && !autoEmbed && (
                <>
                  <div style={{ width: '1px', height: '1.4rem', background: 'var(--glass-border, #e2e8f0)', margin: '0 4px' }} />
                    <button
                      className="btn-glass-inactive"
                      style={{
                        padding: '0.32rem 0.7rem',
                        border: '1.5px solid rgba(245, 158, 11, 0.3)',
                        color: '#d97706',
                        background: 'rgba(245, 158, 11, 0.04)',
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        borderRadius: '0.4rem',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        transition: 'all 0.2s',
                      }}
                      disabled={isProcessing}
                      onClick={() => {
                        if (confirm("Are you sure you want to remove all Medium (Yellow) keywords across all files?")) removeKeywordsByColor('yellow');
                      }}
                    >
                      <Eraser style={{ width: '0.82rem', height: '0.82rem', strokeWidth: 2.2 }} /> Clean Yellow KW
                    </button>
                    <button
                      className="btn-glass-inactive"
                      style={{
                        padding: '0.32rem 0.7rem',
                        border: '1.5px solid rgba(239, 68, 68, 0.3)',
                        color: '#dc2626',
                        background: 'rgba(239, 68, 68, 0.04)',
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        borderRadius: '0.4rem',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        transition: 'all 0.2s',
                      }}
                      disabled={isProcessing}
                      onClick={() => {
                        if (confirm("Are you sure you want to remove all Low (Red) keywords across all files?")) removeKeywordsByColor('red');
                      }}
                    >
                      <Eraser style={{ width: '0.82rem', height: '0.82rem', strokeWidth: 2.2 }} /> Clean Red KW
                    </button>
                </>
              )}
            </div>

            {/* Right side: 5. Clear all / Stop */}
            <div style={{ flexShrink: 0 }}>
              {isProcessing ? (
                <button style={{
                  color: '#f43f5e',
                  background: 'rgba(244, 63, 94, 0.06)',
                  border: '1.5px solid rgba(244, 63, 94, 0.35)',
                  borderRadius: '99px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  padding: '0.3rem 0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }} onClick={stopProcessing}>
                  <Square style={{ width: '0.75rem', height: '0.75rem', fill: 'currentColor' }} /> Stop
                </button>
              ) : (
                <button style={{
                  color: '#f43f5e',
                  background: 'transparent',
                  border: '1px solid rgba(244, 63, 94, 0.35)',
                  borderRadius: '99px',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  padding: '0.3rem 0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={clearAll}>
                  <Trash2 style={{ width: '0.8rem', height: '0.8rem' }} /> Clear all
                </button>
              )}
            </div>
          </div>

          {/* ── ROW 2: Automation Toggles ── */}
          {window.electronAPI && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', paddingLeft: '2px' }}>
              
              {/* 1. Auto Embed Group */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div 
                  className={`${autoEmbed ? 'btn-glass-green-custom' : 'btn-glass-inactive'} flex items-center gap-2 select-none`}
                >
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="ios-toggle ios-toggle-green-custom"
                      checked={autoEmbed} 
                      onChange={handleAutoEmbedChange}
                    />
                    <span style={{ fontWeight: 500 }}>Auto embed and upload</span>
                  </label>
                </div>

                {autoEmbed && (
                  <>
                    <div 
                      className={`${autoRemoveYellow ? 'btn-glass-amber-custom' : 'btn-glass-inactive'} flex items-center gap-2 select-none`}
                      style={{
                        background: autoRemoveYellow ? 'rgba(245, 158, 11, 0.08)' : 'var(--surface-2)',
                        borderColor: autoRemoveYellow ? 'rgba(245, 158, 11, 0.3)' : 'var(--glass-border)',
                        color: autoRemoveYellow ? '#d97706' : 'var(--text-2)'
                      }}
                    >
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="ios-toggle ios-toggle-amber-custom"
                          checked={autoRemoveYellow} 
                          onChange={handleAutoRemoveYellowChange}
                        />
                        <span style={{ fontWeight: 500 }}>Auto Clean Yellow</span>
                      </label>
                    </div>

                    <div 
                      className={`${autoRemoveRed ? 'btn-glass-red-custom' : 'btn-glass-inactive'} flex items-center gap-2 select-none`}
                      style={{
                        background: autoRemoveRed ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-2)',
                        borderColor: autoRemoveRed ? 'rgba(239, 68, 68, 0.3)' : 'var(--glass-border)',
                        color: autoRemoveRed ? '#dc2626' : 'var(--text-2)'
                      }}
                    >
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="ios-toggle ios-toggle-red-custom"
                          checked={autoRemoveRed} 
                          onChange={handleAutoRemoveRedChange}
                        />
                        <span style={{ fontWeight: 500 }}>Auto Clean Red</span>
                      </label>
                    </div>
                  </>
                )}
              </div>

              {/* 2. Auto Upscale Group */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div 
                  className={`${autoUpscale ? 'btn-glass-green-custom' : 'btn-glass-inactive'} flex items-center gap-2 select-none`}
                >
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="ios-toggle ios-toggle-green-custom"
                      checked={autoUpscale} 
                      onChange={(e: any) => setAutoUpscale(e.target.checked)}
                    />
                    <span style={{ fontWeight: 500 }}>Auto upscale</span>
                  </label>
                  
                  {autoUpscale && (
                    <>
                      <div style={{ width: '1.5px', height: '1.2rem', background: 'rgba(22, 163, 74, 0.3)', margin: '0 4px' }} />
                      <select
                        value={upscaleScale}
                        onChange={(e: any) => setUpscaleScale(parseInt(e.target.value) || 2)}
                        style={{
                          background: 'rgba(22, 163, 74, 0.08)',
                          color: '#15803D',
                          border: '1px solid rgba(22, 163, 74, 0.3)',
                          borderRadius: '0.35rem',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          outline: 'none',
                          padding: '0.15rem 0.4rem'
                        }}
                      >
                        {[2, 3, 4].map(val => (
                          <option key={val} value={val} style={{ background: 'var(--surface-1)', color: 'var(--text-1)' }}>{val}x</option>
                        ))}
                      </select>
                      <div style={{ width: '1.5px', height: '1.2rem', background: 'rgba(22, 163, 74, 0.3)', margin: '0 4px' }} />
                      <div ref={engineDropdownRef} style={{ position: 'relative' }}>
                        <button
                          type="button"
                          onClick={() => setEngineDropdownOpen(!engineDropdownOpen)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'rgba(22, 163, 74, 0.08)',
                            color: '#15803D',
                            border: '1px solid rgba(22, 163, 74, 0.3)',
                            borderRadius: '0.35rem',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            outline: 'none',
                            padding: '0.15rem 0.45rem',
                            lineHeight: '1.2',
                            userSelect: 'none'
                          }}
                        >
                          {upscaleEngine === 'balanced' && <Sparkles style={{ width: '0.82rem', height: '0.82rem', color: '#16a34a' }} />}
                          {upscaleEngine === 'fast' && <Zap style={{ width: '0.82rem', height: '0.82rem', color: '#d97706' }} />}
                          <span>{upscaleEngine === 'balanced' ? 'Balanced' : 'Fast'}</span>
                          <ChevronDown style={{ width: '0.75rem', height: '0.75rem', transform: engineDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease', opacity: 0.7 }} />
                        </button>

                        {engineDropdownOpen && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 'calc(100% + 5px)',
                              left: 0,
                              minWidth: '150px',
                              background: 'var(--surface-1, #ffffff)',
                              border: '1px solid var(--glass-border, rgba(22, 163, 74, 0.25))',
                              borderRadius: '0.5rem',
                              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
                              backdropFilter: 'blur(12px)',
                              zIndex: 1000,
                              padding: '4px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px'
                            }}
                          >
                            {UPSCALE_ENGINE_OPTIONS.map((item) => {
                              const IconComponent = item.icon;
                              const isSelected = upscaleEngine === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setUpscaleEngine(item.id);
                                    localStorage.setItem('upscaleEngine', item.id);
                                    setEngineDropdownOpen(false);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '8px',
                                    padding: '0.4rem 0.55rem',
                                    borderRadius: '0.35rem',
                                    border: 'none',
                                    background: isSelected ? 'rgba(22, 163, 74, 0.12)' : 'transparent',
                                    color: isSelected ? '#15803D' : 'var(--text-1)',
                                    fontSize: '0.8rem',
                                    fontWeight: isSelected ? 600 : 500,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    width: '100%',
                                    transition: 'all 0.15s ease'
                                  }}
                                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-2, rgba(0,0,0,0.05))'; }}
                                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                    <IconComponent style={{ width: '0.85rem', height: '0.85rem', color: item.color }} />
                                    <span>{item.label}</span>
                                  </div>
                                  {isSelected && <Check style={{ width: '0.75rem', height: '0.75rem', color: '#16a34a' }} />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Web-mode warning */}
          {!window.electronAPI && (
            <div style={{ width: '100%', borderTop: '1px solid var(--glass-border)', paddingTop: '0.5rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--warning)', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                ⚠️ To embed metadata directly into files, run the app in Desktop mode: <code style={{background: 'var(--surface-3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent)'}}>npm run app:dev</code>
              </p>
            </div>
          )}
        </div>
      )}
      {/* Policy Violation Summary Banner */}
      {images.some(img => img.result?.policyWarning) && (
        <div className="glass card animate-fade-in p-4" style={{ background: 'rgba(239, 68, 68, 0.05)', borderLeft: '4px solid #ef4444', marginBottom: '1.25rem' }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: '1.5rem' }}>🛑</span>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#ef4444', fontWeight: 800 }}>STOCK SITE POLICY VIOLATION DETECTED</h4>
              <p className="text-muted" style={{ fontSize: '0.8rem', margin: '2px 0 0 0', color: 'var(--text-2)' }}>
                Policy violations detected in {images.filter(img => img.result?.policyWarning).length} file{images.filter(img => img.result?.policyWarning).length !== 1 ? 's' : ''}. You can delete them directly from here.
              </p>
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {images.filter(img => img.result?.policyWarning).map(img => (
              <div key={img.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.3rem 0.5rem 0.3rem 0.3rem', borderRadius: '0.4rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <div style={{ position: 'relative', width: '28px', height: '28px', flexShrink: 0 }}>
                  <PolicyViolationThumbnail img={img} />
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-1)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{img.file.name}</span>
                <button 
                  onClick={() => handleApprovePolicy(img.id)}
                  style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', cursor: 'pointer', padding: '0.2rem 0.6rem', borderRadius: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', fontSize: '0.7rem', fontWeight: 600 }}
                  title="Ignore Policy Warning"
                  onMouseOver={(e: any) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)'; }}
                  onMouseOut={(e: any) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'; }}
                >
                  Ignore Policy Violation
                </button>
                <button 
                  onClick={() => removeImage(img.id)}
                  style={{ background: 'var(--surface-1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', cursor: 'pointer', padding: '0.2rem', borderRadius: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                  title="Remove this image"
                  onMouseOver={(e: any) => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
                  onMouseOut={(e: any) => { e.currentTarget.style.background = 'var(--surface-1)'; e.currentTarget.style.color = '#ef4444'; }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      {images.length > 0 && viewMode === 'grid' && (
        <div className="flex items-center justify-between mb-3 w-full animate-fade-in" style={{ gap: '1rem', marginTop: '0.5rem' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, maxWidth: '320px' }}>
            <input
              type="text"
              className="filter-input"
              placeholder="Filter files..."
              value={gridFilter}
              onChange={e => setGridFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 2.2rem 0.45rem 2.25rem',
                borderRadius: '0.55rem',
                border: '1.5px solid #c0c7d4',
                background: '#f0f2f5',
                color: 'var(--text-1)',
                outline: 'none',
                fontSize: '0.82rem',
                boxSizing: 'border-box'
              }}
            />
            <Search 
              style={{ 
                position: 'absolute', 
                left: '12px', 
                color: '#6b7280',
                width: '15px', 
                height: '15px',
                zIndex: 2,
                pointerEvents: 'none'
              }} 
            />
            {gridFilter && (
              <button
                onClick={() => setGridFilter('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.4)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px',
                  borderRadius: '50%'
                }}
              >
                <X style={{ width: '12px', height: '12px' }} />
              </button>
            )}
          </div>
          {selectedRows.size > 0 && (
            <span className="grid-selected-pill" style={{
              background: 'rgba(34, 197, 94, 0.12)',
              color: '#22C55E',
              border: '1.5px solid rgba(34, 197, 94, 0.35)',
              padding: '0.35rem 0.8rem',
              borderRadius: '99px',
              fontSize: '0.78rem',
              fontWeight: 600
            }}>
              {selectedRows.size} selected · Ctrl+Enter to apply
            </span>
          )}
        </div>
      )}

      {/* View Container */}
      {images.length > 0 && (() => {
        const activeEditImage = (() => {
          if (activeCell?.id && selectedRows.has(activeCell.id)) {
            return images.find(img => img.id === activeCell.id);
          }
          if (selectedRows.size > 0) {
            const checkedIds = Array.from(selectedRows);
            const lastCheckedId = checkedIds[checkedIds.length - 1];
            return images.find(img => img.id === lastCheckedId);
          }
          return null;
        })();

        return (
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'stretch' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {viewMode === 'grid' ? (
                <MetadataThumbnailGrid 
                  images={getGridImages()}
                  selectedRows={selectedRows}
                  setSelectedRows={setSelectedRows}
                  activeCell={activeCell}
                  setActiveCell={setActiveCell}
                  removeImage={removeImage}
                  editingImageId={activeEditImage?.id}
                />
              ) : (
                <MetadataCardList 
                  images={getGridImages()}
                  duplicatePairs={duplicatePairs}
                  removeImage={removeImage}
                  onIgnorePolicy={handleApprovePolicy}
                  handleMetaChange={handleMetaChange}
                  activeProviderName={activeProviderName}
                  upscaleScale={upscaleScale}
                  ftpConfigs={ftpConfigs}
                />
              )}
            </div>

            {/* Right-hand side panel editor shown in grid mode */}
            {viewMode === 'grid' && activeEditImage && (
              <div style={{ width: '360px', flexShrink: 0 }}>
                <MetadataEditorPanel
                  img={activeEditImage}
                  handleMetaChange={handleMetaChange}
                  activeCell={activeCell}
                  setActiveCell={setActiveCell}
                  selectedCount={selectedRows.size}
                  applyToSelected={applyToSelected}
                />
              </div>
            )}
          </div>
        );
      })()}
      
      {/* Embedding Permission Modal */}
      {showPermissionModal && (
        <div style={{
          position: 'fixed',
          top: '1.5rem',
          right: '1.5rem',
          zIndex: 9999,
          width: '360px',
          background: 'var(--surface-1)',
          borderRadius: '1.25rem',
          boxShadow: '0 24px 50px rgba(0,0,0,0.4), 0 0 0 1px var(--glass-border) inset',
          border: '1px solid var(--glass-border)',
          overflow: 'hidden',
          animation: 'fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          backdropFilter: 'blur(24px) saturate(150%)',
          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
        }}>
          {/* Glowing Top Border */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: 'linear-gradient(90deg, transparent, var(--accent), var(--secondary), transparent)',
            opacity: 0.8,
            boxShadow: '0 0 10px var(--accent)'
          }} />
          
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', gap: '0.75rem' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                width: '38px', 
                height: '38px', 
                borderRadius: '0.75rem', 
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(59, 130, 246, 0.15))', 
                color: 'var(--accent)',
                flexShrink: 0,
                boxShadow: '0 0 15px rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.2)'
              }}>
                <FileCode2 className="w-5 h-5" />
              </div>
              <div style={{ flexGrow: 1, paddingTop: '0.15rem' }}>
                <h3 style={{ fontWeight: 700, color: 'var(--text-1)', margin: 0, fontSize: '0.95rem', letterSpacing: '0.01em' }}>
                  Embed Metadata
                </h3>
              </div>
              <button 
                onClick={() => setShowPermissionModal(false)} 
                style={{ 
                  background: 'var(--surface-2)', 
                  border: '1px solid var(--glass-border)', 
                  cursor: 'pointer', 
                  color: 'var(--text-3)',
                  padding: '6px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  marginTop: '-0.1rem'
                }}
                onMouseEnter={(e: any) => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.transform = 'rotate(90deg)'; }}
                onMouseLeave={(e: any) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.transform = 'rotate(0deg)'; }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <p style={{ 
              color: 'var(--text-2)', 
              fontSize: '0.82rem', 
              lineHeight: 1.6, 
              marginBottom: '1.25rem',
              marginTop: '0'
            }}>
              AI metadata has been successfully generated for all files. Do you want to embed these titles and keywords directly into the files (IPTC/XMP)?
            </p>
            
            <label 
              style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '0.75rem', 
                marginBottom: '1.5rem', 
                cursor: 'pointer',
                background: 'var(--surface-2)',
                padding: '0.85rem',
                borderRadius: '0.75rem',
                border: '1px solid var(--glass-border)',
                transition: 'all 0.2s',
                boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.05)'
              }}
              onMouseEnter={(e: any) => { e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.4)'; e.currentTarget.style.background = 'rgba(6, 182, 212, 0.05)'; }}
              onMouseLeave={(e: any) => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
            >
              <input 
                type="checkbox" 
                checked={autoEmbed} 
                onChange={handleAutoEmbedChange}
                style={{ 
                  accentColor: 'var(--accent)', 
                  width: '16px', 
                  height: '16px', 
                  cursor: 'pointer',
                  margin: 0,
                  marginTop: '1.5px',
                  flexShrink: 0
                }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: 1.4, userSelect: 'none' }}>
                Always embed automatically without asking in the future
              </span>
            </label>
            
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                style={{ 
                  flex: 1, 
                  padding: '0.65rem', 
                  background: 'var(--surface-2)', 
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-2)', 
                  fontSize: '0.8rem', 
                  fontWeight: 600, 
                  borderRadius: '0.65rem', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
                onClick={() => setShowPermissionModal(false)}
                onMouseEnter={(e: any) => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-1)'; }}
                onMouseLeave={(e: any) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-2)'; }}
              >
                No, Cancel
              </button>
              <button 
                style={{ 
                  flex: 1.5, 
                  padding: '0.65rem', 
                  background: 'linear-gradient(135deg, var(--accent), #3b82f6)', 
                  border: 'none', 
                  color: 'white', 
                  fontSize: '0.8rem', 
                  fontWeight: 600, 
                  borderRadius: '0.65rem', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '0.4rem',
                  boxShadow: '0 4px 15px rgba(6, 182, 212, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                  transition: 'all 0.2s',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onClick={() => embedMetadataToFiles()}
                onMouseEnter={(e: any) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(6, 182, 212, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'; }}
                onMouseLeave={(e: any) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(6, 182, 212, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)'; }}
              >
                Yes, Embed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Retroactive Auto Embed Modal */}
      {showRetroactiveModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          animation: 'fade-in 0.2s ease-out forwards'
        }}>
          <div style={{
            width: '420px', background: 'var(--surface-1)', borderRadius: '1.25rem',
            boxShadow: '0 24px 50px rgba(0,0,0,0.5), 0 0 0 1px var(--glass-border) inset',
            border: '1px solid var(--glass-border)', overflow: 'hidden', position: 'relative'
          }}>
            {/* Glowing Top Border */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
              background: 'linear-gradient(90deg, transparent, var(--accent), var(--secondary), transparent)',
              opacity: 0.8, boxShadow: '0 0 10px var(--accent)'
            }} />
            
            <div style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '42px', height: '42px', borderRadius: '0.75rem',
                  background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(59, 130, 246, 0.15))',
                  color: 'var(--accent)', flexShrink: 0,
                  boxShadow: '0 0 15px rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.2)'
                }}>
                  <Layers className="w-5 h-5" />
                </div>
                <h3 style={{ fontWeight: 700, color: 'var(--text-1)', margin: 0, fontSize: '1.05rem' }}>
                  Retroactive Auto Embed
                </h3>
              </div>
              
              <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                You have <strong>{retroactivePendingImages.length}</strong> previously processed files that haven't been embedded yet. Do you want to auto-embed and upload them now?
              </p>

              <div style={{ 
                background: 'var(--surface-2)', border: '1px solid var(--glass-border)', 
                borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.5rem',
                display: 'flex', flexDirection: 'column', gap: '0.75rem'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    className="ios-toggle ios-toggle-amber-custom"
                    checked={retroactiveOptions.cleanYellow} 
                    onChange={e => setRetroactiveOptions(prev => ({ ...prev, cleanYellow: e.target.checked }))}
                  />
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-2)', fontWeight: 500 }}>Auto Clean Yellow KW</span>
                </label>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    className="ios-toggle ios-toggle-red-custom"
                    checked={retroactiveOptions.cleanRed} 
                    onChange={e => setRetroactiveOptions(prev => ({ ...prev, cleanRed: e.target.checked }))}
                  />
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-2)', fontWeight: 500 }}>Auto Clean Red KW</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button 
                  onClick={cancelRetroactiveProcess}
                  style={{
                    padding: '0.5rem 1rem', background: 'var(--surface-2)', border: '1px solid var(--glass-border)',
                    borderRadius: '0.5rem', color: 'var(--text-2)', fontWeight: 600, fontSize: '0.9rem',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmRetroactiveProcess}
                  style={{
                    padding: '0.5rem 1.25rem', background: 'linear-gradient(135deg, var(--accent), var(--secondary))',
                    border: 'none', borderRadius: '0.5rem', color: 'white', fontWeight: 600, fontSize: '0.9rem',
                    cursor: 'pointer', boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)', transition: 'all 0.2s'
                  }}
                >
                  Process Files
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Export Format Picker Modal */}
      <ExportFormatModal 
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onSelect={(formatId: any) => {
          downloadCSV(formatId, images, promptSettings);
          setShowExportModal(false);
        }}
        activePlatform={promptSettings?.exportPlatform || 'General'}
      />

      {/* Toast Notifications */}
      <div style={{
        position: 'fixed',
        top: '2rem',
        right: '2rem',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        pointerEvents: 'none'
      }}>
        {toasts.map((t) => {
          const isSuccess = t.type === 'success';
          const isWarning = t.type === 'warning';
          
          let bgColor = 'rgba(255, 255, 255, 0.88)';
          let borderColor = 'rgba(0, 0, 0, 0.08)';
          let textColor = 'var(--text-1)';
          let iconColor = 'var(--primary)';
          let IconComponent = AlertCircle;

          if (isSuccess) {
            bgColor = 'rgba(240, 253, 244, 0.85)';
            borderColor = 'rgba(34, 197, 94, 0.35)';
            textColor = '#14532d';
            iconColor = '#15803d';
            IconComponent = CheckCircle2;
          } else if (isWarning) {
            bgColor = 'rgba(254, 235, 235, 0.88)'; // Soft red/peach tint warning
            borderColor = 'rgba(239, 68, 68, 0.35)';
            textColor = '#7f1d1d';
            iconColor = '#dc2626';
            IconComponent = AlertTriangle;
          } else { // error
            bgColor = 'rgba(254, 226, 226, 0.9)'; // Deeper red glass
            borderColor = 'rgba(239, 68, 68, 0.35)';
            textColor = '#7f1d1d';
            iconColor = '#b91c1c';
            IconComponent = AlertCircle;
          }

          return (
            <div 
              key={t.id}
              style={{
                pointerEvents: 'auto',
                background: bgColor,
                color: textColor,
                padding: '0.85rem 1.1rem',
                borderRadius: '0.75rem',
                boxShadow: '0 10px 25px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.02)',
                backdropFilter: 'blur(16px) saturate(180%)',
                WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem',
                animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                border: `1.5px solid ${borderColor}`,
                width: '340px',
                boxSizing: 'border-box'
              }}
            >
              <IconComponent style={{ width: '1.2rem', height: '1.2rem', color: iconColor, flexShrink: 0, marginTop: '1px' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, flexGrow: 1, wordBreak: 'break-word', lineHeight: '1.4' }}>
                {t.message}
              </span>
              <button 
                onClick={() => setToasts(prev => prev.filter(item => (item as any).id !== t.id))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(0, 0, 0, 0.3)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px',
                  borderRadius: '4px',
                  flexShrink: 0,
                  transition: 'background 0.2s, color 0.2s',
                  marginTop: '1px'
                }}
              >
                <X style={{ width: '0.85rem', height: '0.85rem' }} />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%) scale(0.95); opacity: 0; }
          to { transform: translateX(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
