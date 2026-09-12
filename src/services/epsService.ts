/**
 * EPS File Processing Service
 *
 * This service has been upgraded for deep EPS parsing. Since browsers cannot
 * render PostScript to images natively, this service:
 * 1. Tries to extract embedded TIFF/JPEG previews (DOS binary or EPSI).
 * 2. If no visual preview exists, it performs Deep Text & XMP Extraction.
 *    Adobe Illustrator EPS files contain XMP metadata, layer names, swatch
 *    colors, and text elements in plain text inside the file.
 *    We extract this and send it as text context to Gemini!
 */

export interface EpsProcessResult {
  base64: string;
  mimeType: string;
  dataUrl: string;
  isPlaceholder: boolean;
  extractedTextContext?: string | null;
}

export interface EpsProcessOptions {
  fastOnly?: boolean;
}

const readAsArrayBuffer = (file: File | Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
  });

const readAsText = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    // Read first 1MB to ensure we capture XMP metadata, swatches, and layer names
    const blob = file.slice(0, 1048576);
    reader.readAsText(blob, 'ascii');
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });

// --- Image Extraction Methods ---

function extractJpegFromBuffer(buffer: ArrayBuffer): Blob | null {
  const bytes = new Uint8Array(buffer);
  let start = -1;
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8 && bytes[i + 2] === 0xFF) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let end = -1;
  for (let i = start; i < bytes.length - 1; i++) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xD9) {
      end = i + 2;
    }
  }
  if (end === -1) return null;

  const jpegBytes = bytes.slice(start, end);
  return new Blob([jpegBytes], { type: 'image/jpeg' });
}

async function extractDosBinaryEpsPreview(file: File): Promise<{ type: 'jpeg' | 'tiff', data: ArrayBuffer } | null> {
  try {
    // Read only the first 32 bytes to parse the DOS binary header (Instant, zero memory bloat)
    const headerBlob = file.slice(0, 32);
    const headerBuffer = await readAsArrayBuffer(headerBlob);
    
    const bytes = new Uint8Array(headerBuffer);
    const magic = [0xC5, 0xD0, 0xD3, 0xC6];
    if (bytes[0] !== magic[0] || bytes[1] !== magic[1] || bytes[2] !== magic[2] || bytes[3] !== magic[3]) {
      return null;
    }
    
    const readUint32LE = (offset: number) =>
      bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);

    const tiffOffset = readUint32LE(12);
    const tiffLength = readUint32LE(16);

    if (tiffOffset > 0 && tiffLength > 0 && tiffOffset + tiffLength <= file.size) {
      // Read ONLY the preview chunk, avoiding reading the 50MB+ vector data
      const previewBlob = file.slice(tiffOffset, tiffOffset + tiffLength);
      const previewBuffer = await readAsArrayBuffer(previewBlob);
      
      const previewBytes = new Uint8Array(previewBuffer);
      if (previewBytes[0] === 0xFF && previewBytes[1] === 0xD8) {
        return { type: 'jpeg', data: previewBuffer }; 
      }
      return { type: 'tiff', data: previewBuffer };
    }
    return null;
  } catch (err) {
    console.warn("Failed fast extract:", err);
    return null;
  }
}

async function convertTiffToPng(tiffBuffer: ArrayBuffer): Promise<EpsProcessResult | null> {
  try {
    // 1. Desktop App Mode (Electron) - Try Sharp C++ (Fastest)
    if (window.electronAPI && window.electronAPI.decodeTiff) {
      console.log("[EPS] Offloading TIFF decode to Main Process (Sharp)...");
      const result = await window.electronAPI.decodeTiff(tiffBuffer);
      if (result) {
        return {
          ...result,
          isPlaceholder: false,
          extractedTextContext: null
        };
      }
    }
    
    // 2. Main Thread UTIF.js Decoding (Fast and reliable for embedded EPS TIFFs)
    if (!(window as any).UTIF) {
      console.warn("[EPS] UTIF library not found on window object.");
      return null;
    }

    // Yield control to the UI event loop for 10ms to keep clicks responsive
    await new Promise((resolve) => setTimeout(resolve, 10));

    const ifds = (window as any).UTIF.decode(tiffBuffer);
    if (!ifds || ifds.length === 0) {
      throw new Error("No TIFF image layers found");
    }
    (window as any).UTIF.decodeImage(tiffBuffer, ifds[0]);
    const rgba = (window as any).UTIF.toRGBA8(ifds[0]);
    const width = ifds[0].width;
    const height = ifds[0].height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    const imgData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(imgData, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    return {
      base64: dataUrl.split(',')[1],
      mimeType: 'image/png',
      dataUrl,
      isPlaceholder: false,
      extractedTextContext: null
    };
  } catch (err) {
    console.error("[EPS] Failed to decode TIFF:", err);
    return null;
  }
}

async function blobToPngBase64(blob: Blob): Promise<EpsProcessResult | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 512;
      canvas.height = img.naturalHeight || 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/png');
      resolve({
        base64: dataUrl.split(',')[1],
        mimeType: 'image/png',
        dataUrl,
        isPlaceholder: false,
        extractedTextContext: null
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

// --- Deep Text Extraction (The Magic!) ---

function extractEpsTextContext(epsText: string): string {
  let contextParts: string[] = [];

  const xmpStart = epsText.indexOf('<x:xmpmeta');
  const xmpEnd = epsText.indexOf('</x:xmpmeta>');
  if (xmpStart !== -1 && xmpEnd !== -1 && xmpEnd > xmpStart) {
    const xmpSection = epsText.substring(xmpStart, xmpEnd + 12);
    
    const titleBlockMatch = xmpSection.match(/<dc:title>([\s\S]*?)<\/dc:title>/i);
    if (titleBlockMatch) {
      const liMatch = titleBlockMatch[1].match(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i);
      if (liMatch && liMatch[1]) {
        contextParts.push(`Embedded Title: ${liMatch[1].trim()}`);
      }
    }

    const descBlockMatch = xmpSection.match(/<dc:description>([\s\S]*?)<\/dc:description>/i);
    if (descBlockMatch) {
      const liMatch = descBlockMatch[1].match(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i);
      if (liMatch && liMatch[1]) {
        contextParts.push(`Embedded Description: ${liMatch[1].trim()}`);
      }
    }
  }

  const lines = epsText.split(/\r?\n/);
  const layers: string[] = [];
  const swatches: string[] = [];
  const textStrings: string[] = [];
  let docTitle = "";

  for (let line of lines) {
    if (line.length > 1000) continue;
    
    line = line.trim();
    if (!line) continue;

    if (line.startsWith('%%Title:')) {
      docTitle = line.replace('%%Title:', '').trim();
    }

    if (line.includes('%AI5_BeginLayer')) {
      const matchQuote = line.match(/"([^"]+)"/);
      if (matchQuote) {
        layers.push(matchQuote[1]);
      } else {
        const matchParen = line.match(/\(([^)]+)\)/);
        if (matchParen) {
          layers.push(matchParen[1]);
        }
      }
    }

    if (line.includes('%AI5_Begin_NonPrintable')) {
      const matchQuote = line.match(/"([^"]+)"/);
      if (matchQuote) {
        swatches.push(matchQuote[1]);
      } else {
        const matchParen = line.match(/\(([^)]+)\)/);
        if (matchParen) {
          swatches.push(matchParen[1]);
        }
      }
    }

    if (textStrings.length < 10) {
      const tjMatch = line.match(/\(([^)]+)\)\s+Tj/);
      if (tjMatch) {
        textStrings.push(tjMatch[1]);
      }
    }
  }

  const uniqueLayers = [...new Set(layers)].filter(l => l !== "Layer 1");
  if (uniqueLayers.length > 0) {
    contextParts.push(`Illustration Layers: ${uniqueLayers.join(', ')}`);
  }

  const uniqueSwatches = [...new Set(swatches)];
  if (uniqueSwatches.length > 0) {
    contextParts.push(`Prominent Colors/Swatches used: ${uniqueSwatches.join(', ')}`);
  }

  if (textStrings.length > 0) {
    contextParts.push(`Text visible in design: "${textStrings.join('", "')}"`);
  }

  if (docTitle) {
    contextParts.push(`EPS Document Title: ${docTitle}`);
  }

  return contextParts.join('\n');
}

// --- Placeholder rendering ---
function renderEpsPlaceholder(fileName: string): EpsProcessResult {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Canvas context failed");

  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#1e1b4b');
  grad.addColorStop(1, '#312e81');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
  ctx.roundRect(156, 156, 200, 200, 20);
  ctx.fill();

  ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
  ctx.lineWidth = 3;
  ctx.roundRect(156, 156, 200, 200, 20);
  ctx.stroke();

  ctx.fillStyle = '#a5b4fc';
  ctx.font = 'bold 72px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EPS', 256, 256);

  const truncated = fileName.length > 28 ? fileName.substring(0, 25) + '...' : fileName;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px system-ui';
  ctx.fillText(truncated, 256, 380);

  const dataUrl = canvas.toDataURL('image/png');
  return {
    base64: dataUrl.split(',')[1],
    mimeType: 'image/png',
    dataUrl,
    isPlaceholder: true,
  };
}

let activeEpsProcesses = 0;
const MAX_CONCURRENT_EPS = 1;
const epsQueue: (() => void)[] = [];

async function acquireEpsLock(): Promise<void> {
  if (activeEpsProcesses < MAX_CONCURRENT_EPS) {
    activeEpsProcesses++;
    return Promise.resolve();
  }
  return new Promise(resolve => epsQueue.push(resolve as () => void));
}

function releaseEpsLock() {
  if (epsQueue.length > 0) {
    const next = epsQueue.shift();
    if (next) next();
  } else {
    activeEpsProcesses--;
  }
}

export async function processEpsFile(file: File, options: EpsProcessOptions = {}): Promise<EpsProcessResult> {
  console.log(`[EPS Lock] Attempting to acquire lock for: ${file.name}`);
  await acquireEpsLock();
  console.log(`[EPS Lock] Lock ACQUIRED for: ${file.name}`);
  try {
    return await _processEpsFile(file, options);
  } finally {
    console.log(`[EPS Lock] Releasing lock for: ${file.name}`);
    releaseEpsLock();
  }
}

async function _processEpsFile(file: File, options: EpsProcessOptions = {}): Promise<EpsProcessResult> {
  try {
    console.log(`[EPS] Starting processing of file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    let textContext: string | null = null;
    try {
      console.log(`[EPS] Slicing first 1MB for text context...`);
      const textChunk = file.slice(0, 1048576);
      const text = await readAsText(textChunk);
      console.log(`[EPS] Extracting text context from header...`);
      textContext = extractEpsTextContext(text);
      console.log(`[EPS] Text context extracted successfully.`);
    } catch (err) {
      console.warn('[EPS] Non-fatal: Could not extract deep text context.', err);
    }

    try {
      console.log(`[EPS] Checking if file has built-in DOS binary preview...`);
      const preview = await extractDosBinaryEpsPreview(file);
      if (preview) {
        console.log(`[EPS] Found DOS binary preview of type: ${preview.type}`);
        if (preview.type === 'jpeg') {
          console.log(`[EPS] Extracting JPEG preview bytes...`);
          const blob = new Blob([preview.data], { type: 'image/jpeg' });
          const base64Data = await blobToPngBase64(blob);
          if (base64Data) {
            console.log('[EPS] Successfully extracted built-in JPEG preview.');
            return {
              base64: base64Data.base64,
              mimeType: base64Data.mimeType,
              dataUrl: base64Data.dataUrl,
              isPlaceholder: false,
              extractedTextContext: textContext || "No readable context found inside this EPS."
            };
          }
        } else if (preview.type === 'tiff') {
          console.log(`[EPS] Converting TIFF preview to PNG...`);
          const pngResult = await convertTiffToPng(preview.data);
          if (pngResult) {
            console.log('[EPS] Successfully extracted and converted built-in TIFF preview.');
            return {
              base64: pngResult.base64,
              mimeType: pngResult.mimeType,
              dataUrl: pngResult.dataUrl,
              isPlaceholder: false,
              extractedTextContext: textContext || "No readable context found inside this EPS."
            };
          }
          console.log(`[EPS] TIFF conversion returned empty result.`);
        }
      } else {
        console.log(`[EPS] File is NOT a DOS binary EPS (No TIFF/JPEG preview found).`);
      }
    } catch (err) {
      console.warn('[EPS] Fast binary preview extraction failed, falling back:', err);
    }

    if (options.fastOnly) {
      console.log('[EPS] fastOnly mode active. Returning placeholder without Ghostscript.');
      const placeholder = renderEpsPlaceholder(file.name);
      placeholder.extractedTextContext = textContext || "No readable context found inside this EPS.";
      return placeholder;
    }

    if (window.electronAPI) {
      console.log('[EPS] Running in Electron. Spawning Native Ghostscript...');
      
      const filePath = (file as any).path; 
      if (!filePath) {
        console.error('[EPS] filePath is missing on File object!');
        throw new Error("File path is missing. Drag and drop the file directly.");
      }

      try {
        console.log(`[EPS] Calling window.electronAPI.processEps with path: ${filePath}`);
        const result = await window.electronAPI.processEps(filePath);
        console.log(`[EPS] Native Ghostscript finished. Success: ${result?.success}`);
        
        if (result && result.success && result.base64 && result.mimeType) {
          return {
            base64: result.base64,
            mimeType: result.mimeType,
            dataUrl: `data:${result.mimeType};base64,${result.base64}`,
            isPlaceholder: false,
            extractedTextContext: textContext || "No readable context found inside this EPS."
          };
        } else {
          throw new Error(result?.error || 'Electron processing failed');
        }
      } catch (procErr) {
        console.warn('[EPS] Native Ghostscript failed or timed out. Falling back to text-only placeholder.', procErr);
        const placeholder = renderEpsPlaceholder(file.name);
        placeholder.extractedTextContext = textContext || "No readable context found inside this EPS.";
        return placeholder;
      }
    }

    console.log('[EPS] Web Browser fallback mode. Rendering canvas placeholder...');
    const placeholder = renderEpsPlaceholder(file.name);
    placeholder.extractedTextContext = textContext || "No readable context found inside this EPS.";
    return placeholder;

  } catch (err: any) {
    console.error('[EPS] Processing failed critically:', err);
    throw new Error('Failed to process EPS file: ' + err.message);
  }
}

export function isEpsFile(file: File): boolean {
  if (!file) return false;
  if (file.type === 'application/postscript' ||
      file.type === 'application/eps' ||
      file.type === 'image/eps' ||
      file.type === 'application/x-eps') {
    return true;
  }
  const name = file.name ? file.name.toLowerCase() : '';
  return name.endsWith('.eps') || name.endsWith('.epsf') || name.endsWith('.epsi');
}
