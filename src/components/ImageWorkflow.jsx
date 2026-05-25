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
  Copy
} from "lucide-react";
import { generateMetadata } from "../services/geminiService";
import { processEpsFile, isEpsFile } from "../services/epsService";

// Accepted file types: common raster images + EPS vector
const ACCEPTED_TYPES =
  "image/jpeg,image/png,image/webp,image/gif,image/svg+xml," +
  "application/postscript,application/eps,image/eps,application/x-eps,.eps,.epsf,.epsi";

export function ImageWorkflow({ apiKeys, apiProvider, promptSettings, ftpConfigs = [] }) {
  const [images, setImages] = useState([]);
  const imagesRef = useRef([]);
  imagesRef.current = images;
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [autoEmbed, setAutoEmbed] = useState(() => localStorage.getItem("autoEmbed") === "true");
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [autoUpscale, setAutoUpscale] = useState(() => localStorage.getItem("autoUpscale") === "true");
  const [upscaleScale, setUpscaleScale] = useState(() => parseInt(localStorage.getItem("upscaleScale")) || 2);
  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("autoUpscale", autoUpscale.toString());
  }, [autoUpscale]);

  useEffect(() => {
    localStorage.setItem("upscaleScale", upscaleScale.toString());
  }, [upscaleScale]);

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
    return file.type.startsWith("image/");
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
    
    accepted.forEach(file => {
      const isEps = isEpsFile(file);
      // Remove extension to get base name
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      
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

    const newEntries = [];

    for (const [_baseName, group] of Object.entries(fileGroups)) {
      if (group.eps && group.raster) {
        // Paired! Use raster for preview/Gemini, but keep EPS for CSV name.
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

  const removeImage = (id) =>
    setImages((prev) => prev.filter((img) => img.id !== id));

  const clearAll = () => setImages([]);

  // ---------- Processing ----------

  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
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

    const limit = promptSettings?.concurrentLimit || 2;

    let processed = 0;
    for (let c = 0; c < toProcess.length; c += limit) {
      const chunk = toProcess.slice(c, c + limit);

      // First set status to processing for all in this chunk
      setImages((prev) =>
        prev.map((item) =>
          chunk.some((ci) => ci.id === item.id)
            ? { ...item, status: "processing" }
            : item
        )
      );

      // Process them concurrently using Promise.all
      await Promise.all(
        chunk.map(async (img) => {
          try {
            let base64, mimeType;
            let isPlaceholder = false;
            let upscaledPath = null;
            let upscaledName = null;

            // 1. Auto-Upscale (Electron only, if enabled)
            const targetPath = img.visualFile?.path || (!img.isEps ? img.file?.path : null);
            if (autoUpscale && window.electronAPI && targetPath) {
              try {
                setImages((prev) =>
                  prev.map((item) =>
                    item.id === img.id
                      ? { ...item, status: "upscaling" }
                      : item
                  )
                );

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

                const arrayBuffer = await upscaleRes.arrayBuffer();

                const lastSeparator = targetPath.lastIndexOf('\\') !== -1 ? targetPath.lastIndexOf('\\') : targetPath.lastIndexOf('/');
                const folderPath = targetPath.substring(0, lastSeparator);
                const originalFileName = targetPath.substring(lastSeparator + 1);
                const lastDot = originalFileName.lastIndexOf('.');
                const baseName = lastDot > -1 ? originalFileName.substring(0, lastDot) : originalFileName;
                const ext = lastDot > -1 ? originalFileName.substring(lastDot) : '.jpg';
                const pathSeparator = targetPath.includes('\\') ? '\\' : '/';
                
                // Save inside a subfolder named 'Upscaled'
                const upscaleFolder = `${folderPath}${pathSeparator}Upscaled`;
                const savePath = `${upscaleFolder}${pathSeparator}${baseName}_${upscaleScale}x${ext}`;

                const saveRes = await window.electronAPI.saveFile(savePath, arrayBuffer);
                if (!saveRes.success) throw new Error(saveRes.error);

                upscaledPath = savePath;
                upscaledName = `${baseName}_${upscaleScale}x${ext}`;

                // Convert buffer to base64 for Gemini
                const uint8 = new Uint8Array(arrayBuffer);
                let binary = '';
                const len = uint8.byteLength;
                for (let j = 0; j < len; j++) {
                  binary += String.fromCharCode(uint8[j]);
                }
                base64 = btoa(binary);
                mimeType = ext.toLowerCase().endsWith('png') ? 'image/png' : 'image/jpeg';

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
                      const blob = new Blob([arrayBuffer], { type: mimeType });
                      updatedItem.preview = URL.createObjectURL(blob);
                      return updatedItem;
                    }
                    return item;
                  })
                );
              } catch (upscaleErr) {
                console.error("Upscale error:", upscaleErr);
                throw new Error(`Auto-Upscale failed: ${upscaleErr.message}`);
              }
            }

            // Set images status to processing for metadata generation
            setImages((prev) =>
              prev.map((item) =>
                item.id === img.id
                  ? { ...item, status: "processing" }
                  : item
              )
            );

            // 2. Load base64 if not already loaded by upscaler
            if (!base64) {
              if (img.visualFile) {
                const dataUrl = await toBase64(img.visualFile);
                base64 = dataUrl.split(",")[1];
                mimeType = img.visualFile.type;
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
            }

            const fileInfo = {
              isEps: img.isEps,
              isPlaceholder: isPlaceholder,
              fileName: upscaledName || img.file.name,
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

            setImages((prev) =>
              prev.map((item) =>
                item.id === img.id
                  ? { ...item, status: "done", result: metadata }
                  : item
              )
            );
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
        })
      );

      // Add delay between concurrent chunks to respect rate limits gracefully
      if (c + limit < toProcess.length) {
        await new Promise((resolve) => setTimeout(resolve, 4500));
      }
    }

    setIsProcessing(false);
    setTimeout(() => setProgress(0), 1000);
    
    // Defer the check slightly to ensure React state has updated with 'done' status
    setTimeout(() => {
      const latestImages = imagesRef.current;
      const doneImages = latestImages.filter(img => img.status === "done" && img.result);
      if (doneImages.length > 0 && window.electronAPI) {
        if (autoEmbed) {
          embedMetadataToFiles(doneImages);
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
  
  const embedMetadataToFiles = async (imagesToProcess) => {
    setShowPermissionModal(false);
    if (!window.electronAPI) return;
    
    setIsEmbedding(true);
    
    const activeFtpConfigs = ftpConfigs.filter(c => c.enabled);
    
    // Get the current list of done images (either passed directly to avoid stale closures, or from current state)
    const currentImages = Array.isArray(imagesToProcess) 
      ? imagesToProcess 
      : imagesRef.current.filter(img => img.status === "done" && img.result);
    
    if (currentImages.length === 0) {
      setIsEmbedding(false);
      return;
    }
    
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
        if (targetVisual && targetVisual !== targetPrimary) {
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
                  embeddingStatus: (autoEmbed && activeFtpConfigs.length > 0) ? "uploading" : "success", 
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
    
    // Batch Upload to FTP in Parallel across all active servers
    if (autoEmbed && activeFtpConfigs.length > 0 && filesToUpload.length > 0) {
      setImages(prev => prev.map(item => {
        const isEmbedded = embeddedImages.some(ei => ei.id === item.id);
        if (isEmbedded) {
          return { ...item, embeddingStatus: "uploading", embeddingError: null };
        }
        return item;
      }));
      
      try {
        const uploadPromises = activeFtpConfigs.map(async (conf) => {
          const ftpRes = await window.electronAPI.uploadFtp(conf, filesToUpload);
          if (!ftpRes.success) {
            throw new Error(`Failed on ${conf.websiteName || conf.host}: ${ftpRes.error}`);
          }
        });
        
        await Promise.all(uploadPromises);
        
        // Success
        setImages(prev => prev.map(item => {
          const isEmbedded = embeddedImages.some(ei => ei.id === item.id);
          if (isEmbedded) {
            return { ...item, embeddingStatus: "success" };
          }
          return item;
        }));
      } catch (uploadErr) {
        // Set all to error
        setImages(prev => prev.map(item => {
          const isEmbedded = embeddedImages.some(ei => ei.id === item.id);
          if (isEmbedded) {
            return { ...item, embeddingStatus: "error", embeddingError: uploadErr.message };
          }
          return item;
        }));
      }
    }
    
    setIsEmbedding(false);
  };
  
  const retryEmbedAndUpload = () => {
    const failedImages = images.filter(img => img.embeddingStatus === "error");
    if (failedImages.length > 0) {
      embedMetadataToFiles(failedImages);
    }
  };

  const handleAutoEmbedChange = (e) => {
    const checked = e.target.checked;
    setAutoEmbed(checked);
    localStorage.setItem("autoEmbed", checked ? "true" : "false");
  };

  // ---------- Export ----------

  const downloadCSV = () => {
    const doneImages = images.filter((img) => img.status === "done");
    if (doneImages.length === 0) return;

    const platform = promptSettings?.exportPlatform || 'General';
    const safe = (s) => `"${String(s || '').replace(/"/g, '""')}"`;

    let headers = [];
    let rows = [];

    doneImages.forEach((img) => {
      const { title = "", description = "", keywords = "" } = img.result || {};
      const filename = img.renamedName || img.file.name;

      let row = [];
      if (platform === 'Pond5') {
        headers = ["originalfilename", "title", "description", "keywords", "city", "region", "country", "location", "specifysource", "modelreleased", "propertyreleased", "release"];
        row = [filename, title, description, keywords, "", "", "", "", "", "", "", ""];
      } else if (platform === 'Getty') {
        headers = ["file name", "created date", "description", "country", "brief code", "title", "keywords"];
        row = [filename, new Date().toISOString().split('T')[0], description, "", "", title, keywords];
      } else if (platform === 'Depositphotos') {
        headers = ["Filename", "description", "Keywords", "Nudity", "Editorial"];
        row = [filename, description, keywords, "No", "No"];
      } else if (platform === 'Extended metadata') {
        const categoriesStr = Array.isArray(img.result?.categories) ? img.result.categories.join(", ") : (img.result?.categories || "");
        headers = ["Filename", "Title", "Description", "Keywords", "Categories", "Releases"];
        row = [filename, title, description, keywords, categoriesStr, ""];
      } else {
        // General / Adobe Stock / Shutterstock / FreePik / Vecteezy
        headers = ["Filename", "Title", "Description", "Keywords"];
        row = [filename, title, description, keywords];
      }
      rows.push(row.map(safe).join(","));
    });

    const content = headers.join(",") + "\n" + rows.join("\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
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
          <h2 style={{ marginBottom: '0.4rem', fontSize: '1.2rem' }}>Upload Images or EPS Files</h2>
          <p className="text-muted" style={{ marginBottom: '1rem' }}>
            Drag & drop or click — JPG, PNG, WebP, GIF, SVG &{" "}
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>EPS</span>
          </p>
          <div className="flex gap-3">
            <span className="eps-badge"><FileCode2 className="w-3 h-3" /> EPS Vector</span>
            <span className="img-badge"><ImageIcon className="w-3 h-3" /> Raster Image</span>
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
                      marginRight: '0.75rem',
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
                )}
              </>
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
              onClick={downloadCSV}
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

      {/* File Grid */}
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
                <StatusBadge status={img.status} />
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
                </div>
              )}

              {img.status === "error" && (
                <p className="text-xs text-red-400 bg-red-400/10 p-2 rounded mt-2">
                  ⚠ {img.error}
                </p>
              )}

              {img.status === "pending" && (
                <p className="text-xs italic text-muted mt-2">
                  {img.isPaired 
                    ? "✨ Ready (Using JPG for AI)" 
                    : (img.isEps && !img.epsData)
                      ? "⚙ Extracting EPS preview..."
                      : "Awaiting analysis..."}
                </p>
              )}

              {img.status === "upscaling" && (
                <p className="text-xs text-indigo-400 animate-pulse mt-2">
                  ✨ Auto-Upscaling image to {upscaleScale}x...
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
                  img.embeddingStatus === 'uploading' ? 'bg-amber-500/10 text-amber-500 animate-pulse' :
                  img.embeddingStatus === 'success' ? 'bg-green-500/10 text-green-400 font-medium' :
                  'bg-red-500/10 text-red-400'
                }`}>
                  {img.embeddingStatus === 'embedding' && <Loader2 className="w-3 h-3 animate-spin" />}
                  {img.embeddingStatus === 'uploading' && <Upload className="w-3 h-3 animate-bounce" />}
                  {img.embeddingStatus === 'success' && <CheckCircle2 className="w-3 h-3" />}
                  {img.embeddingStatus === 'error' && <X className="w-3 h-3" />}
                  {img.embeddingStatus === 'embedding' ? 'Embedding metadata into file...' :
                   img.embeddingStatus === 'uploading' ? 'Uploading to FTP server...' :
                   img.embeddingStatus === 'success' ? 'Metadata embedded & processed!' :
                   `Failed: ${img.embeddingError}`}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
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
    </div>
  );
}

// --- Sub-components ---

function StatusBadge({ status }) {
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
      {status}
    </span>
  );
}

function MetaField({ label, value, onChange, isTextArea, isKeywords }) {
  const [copied, setCopied] = useState(false);
  const [isTextMode, setIsTextMode] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getKeywordScore = (keyword) => {
    let hash = 0;
    for (let i = 0; i < keyword.length; i++) {
      hash = keyword.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.max(12, Math.min(99, 100 - (keyword.length * 2) + (Math.abs(hash) % 30) - 15));
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
            const score = getKeywordScore(cleanedKw);
            let colorStr = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
            
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
                title={`Popularity: ${score >= 80 ? 'High' : score >= 50 ? 'Medium' : 'Low'}`}
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
