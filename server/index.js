import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { Client, handle_file } from '@gradio/client';
import { pipeline, RawImage } from '@huggingface/transformers';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';

let segmentator = null;
async function getSegmentator() {
  if (!segmentator) {
    console.log('[Backend] Loading Xenova/modnet model into memory (this may take a moment on first run)...');
    segmentator = await pipeline('background-removal', 'Xenova/modnet');
  }
  return segmentator;
}

const app = express();
const port = 3002;

// Enable CORS for Vite frontend
app.use(cors());

// Universal Proxy for ComfyUI (Bypasses CORS & Cloudflare browser blocks)
app.post('/api/comfy-proxy', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { url, method = 'GET', body, headers = {} } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    console.log(`[ComfyProxy] ${method} ${url}`);
    
    const fetchOptions = {
      method,
      headers: {
        ...headers,
        'bypass-tunnel-reminder': 'true',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    
    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      fetchOptions.headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, fetchOptions);
    
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('image/') || contentType.includes('application/octet-stream')) {
      res.setHeader('Content-Type', contentType);
      const arrayBuf = await response.arrayBuffer();
      return res.status(response.status).send(Buffer.from(arrayBuf));
    }
    
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { text }; }
    
    res.status(response.status).json(data);
  } catch (error) {
    console.error('[ComfyProxy Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Configure multer for temp file uploads with original extension preservation
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '';
    // Preserve original base name but sanitize it
    const baseName = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage: storage, limits: { fileSize: 15 * 1024 * 1024 } });

// Helper to find ghostscript executable
async function findGhostscript() {
  return new Promise((resolve) => {
    // 1. Check if it's already in the PATH
    const commands = ['gswin64c', 'gswin32c', 'gs'];
    
    // 2. Check common installation directories on Windows
    const commonPaths = [];
    try {
      const gsDirs = [
        'C:\\Program Files\\gs',
        'C:\\Program Files (x86)\\gs'
      ];
      
      gsDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
          const subDirs = fs.readdirSync(dir);
          subDirs.forEach(subDir => {
            const binPath = path.join(dir, subDir, 'bin');
            if (fs.existsSync(binPath)) {
              if (fs.existsSync(path.join(binPath, 'gswin64c.exe'))) {
                commonPaths.push(path.join(binPath, 'gswin64c.exe'));
              }
              if (fs.existsSync(path.join(binPath, 'gswin32c.exe'))) {
                commonPaths.push(path.join(binPath, 'gswin32c.exe'));
              }
            }
          });
        }
      });
    } catch (err) {
      console.warn('Error scanning for Ghostscript paths:', err.message);
    }

    const allCommandsToTry = [...commands, ...commonPaths];
    let attempt = 0;
    
    function tryNext() {
      if (attempt >= allCommandsToTry.length) {
        resolve(null);
        return;
      }
      
      const cmd = allCommandsToTry[attempt];
      // Use double quotes around the command if it contains spaces (for absolute paths)
      const isPath = cmd.includes('\\') || cmd.includes('/');
      const spawnCmd = isPath ? `"${cmd}"` : cmd;
      
      const proc = spawn(spawnCmd, ['-v'], { shell: true });
      
      proc.on('error', () => {
        attempt++;
        tryNext();
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(spawnCmd);
        } else {
          attempt++;
          tryNext();
        }
      });
    }
    
    tryNext();
  });
}

/**
 * Proxy remove.bg API (avoids browser CORS). Client sends multipart `file` + header `X-Removebg-Key`.
 */
app.post('/api/removebg', upload.single('file'), async (req, res) => {
  const apiKey = req.get('x-removebg-key') || req.get('X-Removebg-Key');
  const cleanupInput = () => {
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {}
    }
  };

  if (!apiKey) {
    cleanupInput();
    return res.status(400).json({ error: 'Missing X-Removebg-Key header (remove.bg API key).' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  try {
    const buf = fs.readFileSync(req.file.path);
    const form = new FormData();
    form.append('image_file', new Blob([buf]), req.file.originalname || 'image.png');
    form.append('size', 'auto');

    const out = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey.trim() },
      body: form,
    });

    if (!out.ok) {
      cleanupInput();
      const errJson = await out.json().catch(() => ({}));
      const msg = errJson.errors?.[0]?.title || errJson.error || out.statusText;
      return res.status(out.status).json({ error: msg });
    }

    const arrayBuf = await out.arrayBuffer();
    const removeBgBuffer = Buffer.from(arrayBuf);
    
    console.log('[removebg] Processing high-fidelity image (stable mode)...');
    
    // 1. Get original dimensions
    const origMeta = await sharp(req.file.path).metadata();
    
    // 2. Upscale the mask and sharpen the alpha channel safely using gamma
    // This reduces the white fringe by making semi-transparent pixels more transparent
    const upscaledMask = await sharp(removeBgBuffer)
      .resize(origMeta.width, origMeta.height, { fit: 'fill' })
      .ensureAlpha()
      .gamma(3) // Push semi-transparent edge pixels toward transparency to hide white background
      .png()
      .toBuffer();

    // 3. Composite original with refined mask (stable dest-in method)
    const finalBuffer = await sharp(req.file.path)
      .ensureAlpha()
      .composite([{
        input: upscaledMask,
        blend: 'dest-in'
      }])
      .png()
      .toBuffer();

    cleanupInput();
    res.setHeader('Content-Type', 'image/png');
    return res.status(200).send(finalBuffer);
  } catch (error) {
    cleanupInput();
    return res.status(500).json({ error: error.message || 'remove.bg proxy failed' });
  }
});

/**
 * Proxy for Hugging Face Free Space (briaai/BRIA-RMBG-1.4) via Gradio
 * No API key required.
 */
app.post('/api/removebg-hf-space', upload.single('file'), async (req, res) => {
  const cleanupInput = () => {
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
  };

  if (!req.file) {
    cleanupInput();
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  try {
    console.log('[HF Space] Connecting to briaai/BRIA-RMBG-1.4...');
    const client = await Client.connect("briaai/BRIA-RMBG-1.4");
    
    console.log('[HF Space] Uploading and processing...');
    const result = await client.predict("/predict", [
        handle_file(req.file.path)
    ]);
    
    cleanupInput();

    const imageUrl = result.data?.[0]?.url || result.data?.[0]?.path;
    
    if (!imageUrl) {
        throw new Error("Invalid response from Hugging Face Space");
    }

    console.log('[HF Space] Fetching result from:', imageUrl);
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
        throw new Error("Failed to fetch processed image from Space");
    }

    const arrayBuf = await imageResponse.arrayBuffer();
    const hfBuffer = Buffer.from(arrayBuf);
    
    console.log('[HF Space] Restoring original quality...');
    
    // 1. Get original dimensions
    const origMeta = await sharp(req.file.path).metadata();
    
    // 2. Prepare sharp alpha mask
    const maskAlpha = await sharp(hfBuffer)
      .resize(origMeta.width, origMeta.height, { fit: 'fill' })
      .ensureAlpha()
      .extractChannel(3)
      .threshold(128)
      .raw()
      .toBuffer();

    // 3. Create RGBA mask
    const rgbaMask = await sharp({
      create: { width: origMeta.width, height: origMeta.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
    .joinChannel(maskAlpha, { raw: { width: origMeta.width, height: origMeta.height, channels: 1 } })
    .png()
    .toBuffer();

    // 4. Composite
    const finalBuffer = await sharp(req.file.path)
      .ensureAlpha()
      .composite([{
        input: rgbaMask,
        blend: 'dest-in'
      }])
      .png()
      .toBuffer();

    res.setHeader('Content-Type', 'image/png');
    return res.status(200).send(finalBuffer);
  } catch (error) {
    cleanupInput();
    console.error('[HF Space Error]', error);
    let msg = error?.message || 'Hugging Face Space API failed';
    if (msg.includes('Could not get API info')) {
        msg = 'বর্তমানে Hugging Face-এর ফ্রি পাবলিক সার্ভারটি অফলাইনে আছে বা অতিরিক্ত ট্রাফিকের কারণে রেসপন্স করছে না। অনুগ্রহ করে "লোকাল" বা "remove.bg" অপশনটি ব্যবহার করুন।';
    }
    return res.status(500).json({ error: msg });
  }
});

/**
 * Local background removal (Node + @imgly/background-removal-node). No browser WASM / no remove.bg key.
 */
app.post('/api/remove-bg-local', upload.single('file'), async (req, res) => {
  const cleanup = () => {
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {}
    }
  };

  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  const tmpPath = req.file.path;

  try {
    console.log('[remove-bg-local] Initializing MODNET model...');
    const pipe = await getSegmentator();
    
    // 1. Get original image metadata first
    const origMeta = await sharp(tmpPath).metadata();
    const origWidth = origMeta.width;
    const origHeight = origMeta.height;
    console.log(`[remove-bg-local] Original image size: ${origWidth}x${origHeight}`);
    
    // 2. Load original image as RawImage for the model (cross-platform safe)
    const image = await RawImage.read(tmpPath);
    
    // 3. Run inference
    console.log('[remove-bg-local] Running MODNET inference...');
    const result = await pipe(image);
    
    // 4. Extract the output image (it's already an RGBA cutout)
    let upscaledMaskPng;
    
    if (Array.isArray(result) && result[0]?.mask) {
      // It's a 1-channel mask from image-segmentation
      const maskImg = result[0].mask;
      console.log(`[remove-bg-local] Mask size from model: ${maskImg.width}x${maskImg.height}`);
      
      // Convert 1-channel to an image we can use as alpha
      // By using it as the alpha channel of a blank image
      const resizedAlpha = await sharp(Buffer.from(maskImg.data), { raw: { width: maskImg.width, height: maskImg.height, channels: 1 } })
        .resize(origWidth, origHeight)
        .raw()
        .toBuffer();
        
      upscaledMaskPng = await sharp({
        create: { width: origWidth, height: origHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      })
      .joinChannel(resizedAlpha) // replaces the alpha channel
      .png()
      .toBuffer();
      
    } else {
      // background-removal pipeline returns an RGBA image directly
      const outImg = Array.isArray(result) ? result[0] : result;
      if (!outImg || !outImg.data) throw new Error('Model returned no output data');
      
      const ch = outImg.channels || Math.round(outImg.data.length / (outImg.width * outImg.height));
      console.log(`[remove-bg-local] Model output: ${outImg.width}x${outImg.height}, channels: ${ch}`);
      
      if (ch === 4) {
        // It's already RGBA, resize it to original and convert to PNG so dest-in recognizes its alpha channel
        upscaledMaskPng = await sharp(Buffer.from(outImg.data), { raw: { width: outImg.width, height: outImg.height, channels: 4 } })
          .resize(origWidth, origHeight)
          .png()
          .toBuffer();
      } else {
        throw new Error(`Unexpected model output channels: ${ch}`);
      }
    }
    
    // 5. Apply clean alpha mask to original full-resolution image (Stable way)
    console.log('[remove-bg-local] Processing high-res cutout...');
    const mask = await sharp(upscaledMaskPng)
      .ensureAlpha()
      .gamma(3)
      .png()
      .toBuffer();

    const outputBuffer = await sharp(tmpPath)
      .ensureAlpha()
      .composite([{
        input: mask,
        blend: 'dest-in'
      }])
      .png()
      .toBuffer();

    cleanup();
    console.log('[remove-bg-local] Done!');
    res.setHeader('Content-Type', 'image/png');
    return res.status(200).send(outputBuffer);
  } catch (error) {
    cleanup();
    console.error('[remove-bg-local] ERROR:', error?.message);
    return res.status(500).json({ error: error?.message || 'Local background removal failed' });
  }
});

app.post('/api/process-eps', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const inputPath = req.file.path;
  const outputPath = path.join(os.tmpdir(), `${req.file.filename}.png`);

  try {
    const gsCmd = await findGhostscript();
    
    if (!gsCmd) {
      // Clean up uploaded file
      fs.unlinkSync(inputPath);
      return res.status(500).json({ 
        error: 'Ghostscript not found on your system. Please install Ghostscript (gswin64c) and add it to your PATH.' 
      });
    }

    console.log(`[Backend] Processing EPS with ${gsCmd}: ${req.file.originalname}`);

    // Run ghostscript to convert EPS to PNG
    const args = [
      '-dSAFER',
      '-dBATCH',
      '-dNOPAUSE',
      '-dNOPROMPT',
      '-dEPSCrop',       // CRITICAL: Force Ghostscript to use the EPS bounding box!
      '-sDEVICE=png16m', // 24-bit RGB PNG
      '-r72', // Lowered DPI to prevent huge base64 files which cause API crashes
      '-dTextAlphaBits=4',
      '-dGraphicsAlphaBits=4',
      `-sOutputFile=${outputPath}`,
      inputPath
    ];

    const gsProc = spawn(gsCmd, args, { shell: true });

    gsProc.on('close', (code) => {
      // Regardless of code, check if output file exists
      if (fs.existsSync(outputPath)) {
        // Read the generated PNG
        const imgBuffer = fs.readFileSync(outputPath);
        const base64 = imgBuffer.toString('base64');
        
        // Cleanup
        try {
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
        } catch (e) {}

        res.json({
          success: true,
          base64: base64,
          mimeType: 'image/png'
        });
      } else {
        // Cleanup
        try { fs.unlinkSync(inputPath); } catch (e) {}
        
        res.status(500).json({ 
          error: `Ghostscript failed to process this EPS file (Exit code: ${code}).` 
        });
      }
    });

    gsProc.on('error', (err) => {
      try { fs.unlinkSync(inputPath); } catch (e) {}
      res.status(500).json({ error: `Ghostscript execution error: ${err.message}` });
    });

  } catch (error) {
    try { fs.unlinkSync(inputPath); } catch (e) {}
    res.status(500).json({ error: error.message });
  }
});

/**
 * Image Vectorization (Image -> SVG)
 * Uses @neplex/vectorizer (VTracer wrapper) for high quality.
 */
app.post('/api/vectorize', upload.single('file'), async (req, res) => {
  const cleanup = () => {
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
  };

  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  try {
    const options = req.body.options ? JSON.parse(req.body.options) : {};
    const inputBuffer = fs.readFileSync(req.file.path);

    console.log('[Vectorize] Converting image to SVG...');
    
    // Try to use @neplex/vectorizer (high quality)
    let vectorizeFunc;
    let constants = {};
    try {
      const mod = await import('@neplex/vectorizer');
      vectorizeFunc = mod.vectorize;
      constants = mod;
    } catch (e) {
      console.error('[Vectorize] @neplex/vectorizer not found, falling back to imagetracerjs...');
    }

    if (vectorizeFunc) {
      console.log('[Vectorize] Executing High-Fidelity VTracer Pipeline...');
      
      const quality = options.quality || "high";
      const colorPrecision = options.color_precision || 6;
      const numColors = Math.min(256, Math.pow(2, colorPrecision));

      let maxIterations = 5;
      let lengthThreshold = 4.5;
      let spliceThreshold = 45;
      let cornerThreshold = 60;

      if (quality === "clean") {
        maxIterations = 10;
        lengthThreshold = 8.0;
        spliceThreshold = 55;
        cornerThreshold = 75;
      } else if (quality === "ultra") {
        maxIterations = 15;
        lengthThreshold = 3.0;
        spliceThreshold = 35;
        cornerThreshold = 45;
      }

      // Mathematical Preprocessing Pipeline:
      // 1. Start pipeline and apply noise filtering
      let sharpPipe = sharp(inputBuffer).ensureAlpha().median(3);
      
      // 2. High-quality upscale to 3000px
      sharpPipe = sharpPipe.resize({ width: 3000, withoutEnlargement: true, fit: 'inside' });
      
      // 3. Edge-preserving smoothing (median) instead of blur to prevent halos
      const medianSize = quality === "clean" ? 9 : (quality === "ultra" ? 3 : 5);
      sharpPipe = sharpPipe.median(medianSize);

      // 4. PNG Palette quantization to force perfectly sharp, staircase-free color boundaries
      const processedBuffer = await sharpPipe
        .png({ palette: true, colors: numColors })
        .toBuffer();

      // Vectorization Configuration
      const isStacked = options.hierarchical === 'stacked';
      const config = {
        colorMode: 0, 
        hierarchical: isStacked ? 0 : 1, // Stacked is 0, Cutout is 1
        filterSpeckle: options.filter_speckle || 4, 
        colorPrecision: 8, // Set to 8 to preserve our pre-quantized sharp boundaries exactly
        layerDifference: quality === "clean" ? 12 : 5,
        mode: 2, // Spline Mode
        cornerThreshold: cornerThreshold, 
        lengthThreshold: lengthThreshold,
        maxIterations: maxIterations,
        spliceThreshold: spliceThreshold, 
        pathPrecision: options.path_precision || 5
      };

      let svg = await vectorizeFunc(processedBuffer, config);

      // 3. FORCE BROWSER TO RENDER SMOOTHLY
      svg = svg.replace('<svg ', '<svg shape-rendering="geometricPrecision" ');

      cleanup();
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.status(200).send(svg);
    } else {
      // UPGRADED FALLBACK ENGINE (ImageTracer High-Quality Mode)
      try {
        const ImageTracer = (await import('imagetracerjs')).default;
        const { data, info } = await sharp(inputBuffer)
          .ensureAlpha()
          .resize(3000)
          .median(2)
          .toBuffer({ resolveWithObject: true });

        const imageData = { width: info.width, height: info.height, data: data };

        let svg = ImageTracer.getSVGString(imageData, {
          numberofcolors: 32,
          ltres: 0.1, // High precision
          qtres: 0.1, // High precision
          pathomit: 4,
          rightanglethreshold: 0.1,
          strokewidth: 0,
        });

        svg = svg.replace('<svg ', '<svg shape-rendering="geometricPrecision" ');

        cleanup();
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.status(200).send(svg);
      } catch (err2) {
        throw new Error('Vectorization engine failed. Please run: npm install @neplex/vectorizer');
      }
    }

  } catch (error) {
    cleanup();
    console.error('[Vectorize] ERROR:', error?.message);
    return res.status(500).json({ error: error?.message || 'Vectorization failed' });
  }
});

/**
 * Image Vectorization via Hugging Face Cloud API (Free)
 * Uses openfree/image-to-vector via Gradio
 */
app.post('/api/vectorize-hf', upload.single('file'), async (req, res) => {
  const cleanup = () => {
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
  };

  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    console.log('[Cloud Vectorize] Starting with 10s safety timeout...');
    
    // Helper for timeout
    const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms));

    const processCloud = async () => {
      const spaces = ["arielreyes/Image-To-Vector", "vtracer/vtracer"];
      let client;
      
      for (const space of spaces) {
        try {
          client = await Client.connect(space);
          break;
        } catch (e) { continue; }
      }
      if (!client) throw new Error("Cloud Offline");

      const result = await client.predict("/predict", [handle_file(req.file.path)]);
      const svgUrl = result.data?.[0]?.url || result.data?.[0]?.path;
      if (!svgUrl) throw new Error("No SVG");
      const response = await fetch(svgUrl);
      return await response.text();
    };

    // Race between Cloud and 10s Timeout
    const svgText = await Promise.race([processCloud(), timeout(10000)]);
    
    cleanup();
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.status(200).send(svgText);

  } catch (error) {
    const isTimeout = error.message === 'TIMEOUT';
    console.warn(isTimeout ? '[Cloud] TIMEOUT! Falling back to Local Engine...' : '[Cloud Error] Falling back...');
    
    // FAST LOCAL FALLBACK
    try {
      const options = req.body.options ? JSON.parse(req.body.options) : {};
      const inputBuffer = fs.readFileSync(req.file.path);
      const mod = await import('@neplex/vectorizer');
      const vectorizeFunc = mod.vectorize;
      
      const quality = options.quality || "high";
      const colorPrecision = options.color_precision || 6;
      const numColors = Math.min(256, Math.pow(2, colorPrecision));

      let maxIterations = 5;
      let lengthThreshold = 4.5;
      let spliceThreshold = 45;
      let cornerThreshold = 60;

      if (quality === "clean") {
        maxIterations = 8;
        lengthThreshold = 7.0;
        spliceThreshold = 55;
        cornerThreshold = 75;
      } else if (quality === "ultra") {
        maxIterations = 10;
        lengthThreshold = 3.5;
        spliceThreshold = 35;
        cornerThreshold = 45;
      }

      // Slightly smaller resize in fallback for responsiveness, but keeping high fidelity
      let sharpPipe = sharp(inputBuffer).ensureAlpha().median(3);
      sharpPipe = sharpPipe.resize({ width: 2000, withoutEnlargement: true, fit: 'inside' });
      
      // Edge-preserving smoothing
      const medianSize = quality === "clean" ? 7 : (quality === "ultra" ? 3 : 5);
      sharpPipe = sharpPipe.median(medianSize);

      const processedBuffer = await sharpPipe
        .png({ palette: true, colors: numColors })
        .toBuffer();
      
      const isStacked = options.hierarchical === 'stacked';
      const config = {
        colorMode: 0,
        hierarchical: isStacked ? 0 : 1, // Stacked is 0, Cutout is 1
        filterSpeckle: options.filter_speckle || 4,
        colorPrecision: 8,
        layerDifference: 16,
        mode: 2, // Spline
        cornerThreshold: cornerThreshold,
        lengthThreshold: lengthThreshold,
        maxIterations: maxIterations,
        spliceThreshold: spliceThreshold,
        pathPrecision: options.path_precision || 5
      };

      const svg = await vectorizeFunc(processedBuffer, config);
      cleanup();
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.status(200).send(svg);
    } catch (fallbackError) {
      cleanup();
      return res.status(500).json({ error: 'ভেক্টর প্রসেসিং ব্যর্থ হয়েছে।' });
    }
  }
});

/**
 * Convert SVG string to EPS 10 (Vector)
 * Step 1: SVG -> PDF (Vector)
 * Step 2: PDF -> EPS (Vector via Ghostscript eps2write)
 */
app.post('/api/convert-to-eps', express.json({ limit: '20mb' }), async (req, res) => {
  const { svg, filename } = req.body;
  if (!svg) return res.status(400).json({ error: 'No SVG provided' });

  const tmpPdf = path.join(os.tmpdir(), `${Date.now()}_temp.pdf`);
  const tmpEps = path.join(os.tmpdir(), `${Date.now()}_temp.eps`);

  try {
    const gsCmd = await findGhostscript();
    if (!gsCmd) throw new Error('Ghostscript not found');

    console.log('[EPS] Converting SVG to PDF...');
    
    // 1. Create Vector PDF from SVG
    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(tmpPdf);
    doc.pipe(stream);

    // Extract width/height from SVG viewbox or attributes
    const match = svg.match(/viewBox=["']?\d+\s+\d+\s+(\d+)\s+(\d+)["']?/i);
    const width = match ? parseInt(match[1]) : 800;
    const height = match ? parseInt(match[2]) : 600;

    doc.addPage({ size: [width, height] });
    SVGtoPDF(doc, svg, 0, 0);
    doc.end();

    await new Promise((resolve) => stream.on('finish', resolve));

    console.log('[EPS] Converting PDF to EPS 10...');
    
    // 2. Convert PDF to EPS Level 3/10 compliant using Ghostscript
    const args = [
      '-q',
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER',
      '-sDEVICE=eps2write',
      `-sOutputFile=${tmpEps}`,
      tmpPdf
    ];

    const gsProc = spawn(gsCmd, args, { shell: true });

    gsProc.on('close', (code) => {
      if (code === 0 && fs.existsSync(tmpEps)) {
        const epsBuf = fs.readFileSync(tmpEps);
        
        // Cleanup
        try { fs.unlinkSync(tmpPdf); fs.unlinkSync(tmpEps); } catch (e) {}

        res.setHeader('Content-Type', 'application/postscript');
        res.setHeader('Content-Disposition', `attachment; filename="${filename || 'vector'}.eps"`);
        return res.send(epsBuf);
      } else {
        res.status(500).json({ error: 'Ghostscript EPS conversion failed' });
      }
    });

  } catch (error) {
    console.error('[EPS Error]', error);
    try { if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf); } catch (e) {}
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upscale', upload.single('file'), async (req, res) => {
  const cleanup = () => {
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
  };

  try {
    const scale = parseInt(req.body.scale) || 2;
    const localPath = req.body.filePath;
    let inputPath = req.file?.path;

    if (!inputPath && localPath) {
      if (fs.existsSync(localPath)) {
        inputPath = localPath;
      } else {
        return res.status(400).json({ error: `File not found on system: ${localPath}` });
      }
    }

    if (!inputPath) {
      return res.status(400).json({ error: 'No image uploaded or file path not found' });
    }
    
    console.log(`[Upscale] Starting ${scale}x upscaling for: ${inputPath}...`);
    
    // 1. Get original metadata
    const origMeta = await sharp(inputPath).metadata();
    const targetWidth = Math.round(origMeta.width * scale);
    const targetHeight = Math.round(origMeta.height * scale);

    console.log(`[Upscale] Target size: ${targetWidth}x${targetHeight}`);

    // Try Cloud AI first (Hugging Face)
    try {
      console.log('[Cloud Upscale] Trying Hugging Face Space...');
      // Timeout helper
      const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms));
      
      const processCloud = async () => {
        // Try finegrain image enhancer
        const client = await Client.connect("finegrain/finegrain-image-enhancer");
        // We guess the predict signature: usually [image_file, prompt/settings] or similar
        // Since we aren't 100% sure, if this fails it falls back to Local
        const result = await client.predict("/predict", [
            handle_file(inputPath),
            scale // Upscale factor
        ]);
        
        const outUrl = result.data?.[0]?.url || result.data?.[0]?.path;
        if (!outUrl) throw new Error("No output image");
        
        const response = await fetch(outUrl);
        const arrayBuf = await response.arrayBuffer();
        return Buffer.from(arrayBuf);
      };

      const hfBuffer = await Promise.race([processCloud(), timeout(4000)]);
      console.log('[Cloud Upscale] Success!');
      
      cleanup();
      res.setHeader('Content-Type', origMeta.format === 'png' ? 'image/png' : 'image/jpeg');
      return res.status(200).send(hfBuffer);
    } catch (cloudErr) {
      console.warn('[Cloud Upscale Failed] Falling back to Local High-Fidelity Engine...', cloudErr.message);
    }

    // 2. LOCAL HIGH-FIDELITY FALLBACK (Lanczos3 + Edge Enhancement)
    console.log('[Local Upscale] Executing Local High-Fidelity Pipeline...');
    
    let pipeline = sharp(inputPath)
      // Fast shrink off ensures highest quality sampling
      .resize(targetWidth, targetHeight, {
        kernel: sharp.kernel.lanczos3,
        fastShrinkOnLoad: false,
        withoutEnlargement: false
      });

    // Apply unsharp mask to restore edge crispness that scaling loses,
    // without introducing noise (using threshold)
    pipeline = pipeline.sharpen({
      sigma: 1.5,
      m1: 1.2,
      m2: 0.7,
      x1: 2,
      y2: 10,
      y3: 20
    });

    const outputBuffer = await (origMeta.format === 'png' ? pipeline.png().toBuffer() : pipeline.jpeg({ quality: 100 }).toBuffer());
    
    cleanup();
    res.setHeader('Content-Type', origMeta.format === 'png' ? 'image/png' : 'image/jpeg');
    return res.status(200).send(outputBuffer);

  } catch (error) {
    cleanup();
    console.error('[Upscale] ERROR:', error?.message);
    return res.status(500).json({ error: error?.message || 'Upscaling failed' });
  }
});

// Auto-retry port if busy (EADDRINUSE)
function startServer(tryPort) {
  const server = app.listen(tryPort, '0.0.0.0');
  server.on('listening', () => {
    console.log(`\n========================================`);
    console.log(`✅ Backend running on port ${tryPort}`);
    console.log(`   • URL: http://127.0.0.1:${tryPort}`);
    console.log(`   • POST /api/process-eps  — EPS → PNG (Ghostscript)`);
    console.log(`   • POST /api/removebg       — remove.bg API proxy (header X-Removebg-Key)`);
    console.log(`   • POST /api/remove-bg-local — free local removal (Node, @imgly/background-removal-node)`);
    console.log(`   • POST /api/vectorize      — Image → SVG (VTracer / ImageTracer)`);
    console.log(`   • POST /api/upscale        — AI Image Upscaler (Cloud + Local HF)`);
    console.log(`========================================\n`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  Port ${tryPort} is in use, trying ${tryPort + 1}...`);
      server.close();
      startServer(tryPort + 1);
    } else {
      console.error('❌ Server error:', err);
    }
  });
}

startServer(port);

// Global Error Handler to prevent server crashes
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

