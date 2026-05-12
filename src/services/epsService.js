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

const readAsArrayBuffer = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });

const readAsText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    // Read first 1MB to ensure we capture XMP metadata, swatches, and layer names
    const blob = file.slice(0, 1048576);
    reader.readAsText(blob, 'ascii');
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });

// --- Image Extraction Methods ---

function extractJpegFromBuffer(buffer) {
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

function extractDosBinaryEpsPreview(buffer) {
  const bytes = new Uint8Array(buffer);
  const magic = [0xC5, 0xD0, 0xD3, 0xC6];
  if (bytes[0] !== magic[0] || bytes[1] !== magic[1] ||
      bytes[2] !== magic[2] || bytes[3] !== magic[3]) {
    return null;
  }
  const readUint32LE = (offset) =>
    bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);

  const tiffOffset = readUint32LE(12);
  const tiffLength = readUint32LE(16);

  if (tiffOffset > 0 && tiffLength > 0 && tiffOffset + tiffLength <= buffer.byteLength) {
    const previewBytes = bytes.slice(tiffOffset, tiffOffset + tiffLength);
    if (previewBytes[0] === 0xFF && previewBytes[1] === 0xD8) {
      return { type: 'jpeg', data: previewBytes };
    }
    return { type: 'tiff', data: previewBytes };
  }
  return null;
}

async function convertTiffToPng(tiffBuffer) {
  try {
    if (!window.UTIF) {
      console.warn("[EPS] UTIF library not found for TIFF decoding.");
      return null;
    }
    const ifds = window.UTIF.decode(tiffBuffer);
    window.UTIF.decodeImage(tiffBuffer, ifds[0]);
    const rgba = window.UTIF.toRGBA8(ifds[0]);
    const w = ifds[0].width;
    const h = ifds[0].height;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const imgData = new ImageData(new Uint8ClampedArray(rgba), w, h);
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

async function blobToPngBase64(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 512;
      canvas.height = img.naturalHeight || 512;
      const ctx = canvas.getContext('2d');
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

/**
 * Extracts XMP metadata, layer names, swatches, and embedded text strings
 * from the raw EPS file text to give Gemini contextual clues.
 */
function extractEpsTextContext(epsText) {
  let contextParts = [];

  // 1. Extract XMP Metadata Title/Description
  const titleMatch = epsText.match(/<dc:title>[\s\S]*?<rdf:Alt>[\s\S]*?<rdf:li[^>]*>(.*?)<\/rdf:li>/i);
  if (titleMatch && titleMatch[1]) contextParts.push(`Embedded Title: ${titleMatch[1]}`);

  const descMatch = epsText.match(/<dc:description>[\s\S]*?<rdf:Alt>[\s\S]*?<rdf:li[^>]*>(.*?)<\/rdf:li>/i);
  if (descMatch && descMatch[1]) contextParts.push(`Embedded Description: ${descMatch[1]}`);

  // 2. Extract Illustrator Layer Names (often look like: %AI5_BeginLayer: "Background")
  const layerMatches = [...epsText.matchAll(/%AI5_BeginLayer[\s\S]*?"(.*?)"/g)];
  if (layerMatches.length > 0) {
    const layers = layerMatches.map(m => m[1]).filter(l => l !== "Layer 1");
    if (layers.length > 0) {
      contextParts.push(`Illustration Layers: ${layers.join(', ')}`);
    }
  }

  // 3. Extract Swatch Colors (often look like: %AI5_Begin_NonPrintable: "Red")
  const swatchMatches = [...epsText.matchAll(/%AI5_Begin_NonPrintable[\s\S]*?"(.*?)"/g)];
  if (swatchMatches.length > 0) {
    const swatches = swatchMatches.map(m => m[1]);
    contextParts.push(`Prominent Colors/Swatches used: ${swatches.join(', ')}`);
  }

  // 4. Extract standard text elements inside the vector
  const textStrings = [...epsText.matchAll(/\((.*?)\)\s+Tj/g)];
  if (textStrings.length > 0) {
    const texts = textStrings.map(m => m[1]).slice(0, 10); // get first 10
    if (texts.length > 0) {
      contextParts.push(`Text visible in design: "${texts.join('", "')}"`);
    }
  }

  // 5. Check document creator and title
  const docTitle = epsText.match(/%%Title:\s*(.*?)\n/);
  if (docTitle && docTitle[1]) contextParts.push(`EPS Document Title: ${docTitle[1]}`);

  return contextParts.join('\n');
}

// --- Placeholder rendering ---
function renderEpsPlaceholder(fileName) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

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

export async function processEpsFile(file) {
  try {
    // 1. Desktop App Mode (Electron) - The Ultimate Solution
    if (window.electronAPI) {
      console.log('[EPS] Running in Electron Desktop App. Using Native Ghostscript...');
      
      // In Electron, File objects have a path property
      const filePath = file.path; 
      if (!filePath) throw new Error("File path is missing. Drag and drop the file directly.");

      const result = await window.electronAPI.processEps(filePath);
      
      if (result.success) {
        return {
          base64: result.base64,
          mimeType: result.mimeType,
          dataUrl: `data:${result.mimeType};base64,${result.base64}`,
          isPlaceholder: false,
          extractedTextContext: null
        };
      } else {
        throw new Error(result.error || 'Electron processing failed');
      }
    }

    // 2. Web Browser Mode (Fallback) - Pure Client-Side
    console.log('[EPS] Running in Web Browser. Starting Pure Client-Side Extraction...');
    const buffer = await readAsArrayBuffer(file);
    
    // Attempt DOS Binary header extraction (TIFF or JPEG)
    const preview = extractDosBinaryEpsPreview(buffer);
    if (preview) {
      if (preview.type === 'jpeg') {
        const blob = new Blob([preview.data], { type: 'image/jpeg' });
        return await blobToPngBase64(blob);
      } else if (preview.type === 'tiff') {
        const pngResult = await convertTiffToPng(preview.data);
        if (pngResult) return pngResult;
      }
    }

    // Attempt Deep Text Extraction if visual preview fails
    const text = await readAsText(file);
    const textContext = extractEpsTextContext(text);
    
    const placeholder = renderEpsPlaceholder(file.name);
    placeholder.extractedTextContext = textContext || "No readable context found inside this EPS.";
    return placeholder;

  } catch (err) {
    console.warn('[EPS] Processing failed:', err);
    throw new Error('Failed to process EPS file: ' + err.message);
  }
}

export function isEpsFile(file) {
  if (file.type === 'application/postscript' ||
      file.type === 'application/eps' ||
      file.type === 'image/eps' ||
      file.type === 'application/x-eps') {
    return true;
  }
  const name = file.name.toLowerCase();
  return name.endsWith('.eps') || name.endsWith('.epsf') || name.endsWith('.epsi');
}
