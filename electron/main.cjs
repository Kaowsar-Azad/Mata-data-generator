const { app, BrowserWindow, ipcMain, shell, dialog, net } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const sharp = require('sharp');
const { Transform } = require('stream');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
if (ffmpegStatic) { ffmpeg.setFfmpegPath(ffmpegStatic); }

const { setupMataAi } = require('./MataAI/index.cjs');

const LOG_FILE = path.join(os.tmpdir(), 'imagemetadata_electron.log');
function fileLog(...args) {
  try {
    const msg = `[${new Date().toISOString()}] ${args.map(a => a instanceof Error ? a.stack || a.message : (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}\n`;
    fs.appendFileSync(LOG_FILE, msg);
    console.log(...args);
  } catch (e) {
    console.error('Logging failed:', e);
  }
}
fileLog('Electron main process starting. Log file path:', LOG_FILE);

let mainWindow;
let isQuitting = false;

app.on('before-quit', () => {
  isQuitting = true;
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, '../public/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      sandbox: true,
    },
    autoHideMenuBar: true,
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Ghostscript Finder
async function findGhostscript() {
  return new Promise((resolve) => {
    // 1. First, check the bundled "bin" folder in the app
    const bundled64 = path.join(app.isPackaged ? process.resourcesPath : __dirname, '..', 'bin', 'win_graphics_proc', 'bin', 'gfx_render64.exe');
    const bundled32 = path.join(app.isPackaged ? process.resourcesPath : __dirname, '..', 'bin', 'win_graphics_proc', 'bin', 'gfx_render32.exe');
    
    if (fs.existsSync(bundled64)) return resolve(bundled64);
    if (fs.existsSync(bundled32)) return resolve(bundled32);

    // 2. Fallback to system installation
    const commands = ['gswin64c', 'gswin32c', 'gs'];
    const commonPaths = [];
    try {
      const gsDirs = ['C:\\Program Files\\gs', 'C:\\Program Files (x86)\\gs'];
      gsDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
          const subDirs = fs.readdirSync(dir);
          subDirs.forEach(subDir => {
            const binPath = path.join(dir, subDir, 'bin');
            if (fs.existsSync(binPath)) {
              if (fs.existsSync(path.join(binPath, 'gswin64c.exe'))) commonPaths.push(path.join(binPath, 'gswin64c.exe'));
              if (fs.existsSync(path.join(binPath, 'gswin32c.exe'))) commonPaths.push(path.join(binPath, 'gswin32c.exe'));
            }
          });
        }
      });
    } catch (err) {
      console.warn('GS search error:', err.message);
    }

    const allCommandsToTry = [...commands, ...commonPaths];
    let attempt = 0;
    
    function tryNext() {
      if (attempt >= allCommandsToTry.length) return resolve(null);
      const cmd = allCommandsToTry[attempt];
      const spawnCmd = cmd;
      
      const proc = spawn(spawnCmd, ['-v']);
      proc.on('error', () => { attempt++; tryNext(); });
      proc.on('close', (code) => {
        if (code === 0) resolve(spawnCmd);
        else { attempt++; tryNext(); }
      });
    }
    tryNext();
  });
}

// IPC Handler for processing EPS natively
ipcMain.handle('decode-tiff', async (event, tiffBuffer) => {
  try {
    const pngBuffer = await sharp(Buffer.from(tiffBuffer)).png().toBuffer();
    return {
      base64: pngBuffer.toString('base64'),
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`
    };
  } catch (err) {
    console.error('Failed to decode TIFF with sharp:', err);
    return null;
  }
});

ipcMain.handle('process-eps', async (event, inputPath) => {
  try {
    const gsCmd = await findGhostscript();
    if (!gsCmd) {
      throw new Error('Ghostscript not found on this system. Please install Ghostscript.');
    }

    const outputName = `temp_eps_${Date.now()}.png`;
    const outputPath = path.join(os.tmpdir(), outputName);

    const args = [
      '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dNOPROMPT', '-dEPSCrop',
      '-sDEVICE=png16m', '-r50', 
      `-sOutputFile=${outputPath}`, inputPath
    ];

    const bundledBinDir = path.join(app.isPackaged ? process.resourcesPath : __dirname, '..', 'bin');
    const gsLibPath = `${path.join(bundledBinDir, 'win_graphics_proc', 'lib')};${path.join(bundledBinDir, 'win_graphics_proc', 'Resource', 'Init')}`;
    const gsEnv = { ...process.env, GS_LIB: gsLibPath, PATH: `${path.join(bundledBinDir, 'win_graphics_proc', 'bin')};${process.env.PATH || ''}` };

    return new Promise((resolve, reject) => {
      const gsProc = spawn(gsCmd, args, { env: gsEnv });
      
      // Safety timeout of 30 seconds
      const timeoutId = setTimeout(() => {
        try {
          gsProc.kill();
        } catch (e) {}
        reject(new Error('Ghostscript rendering timed out (30 seconds limit reached).'));
      }, 30000);

      // CRITICAL: Consume stdout and stderr to prevent OS pipe buffers from filling up and hanging the process
      let errOutput = '';
      gsProc.stdout.on('data', () => {}); // ignore stdout but consume it
      gsProc.stderr.on('data', (data) => errOutput += data.toString());

      gsProc.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code === 0 && fs.existsSync(outputPath)) {
          const imgBuffer = fs.readFileSync(outputPath);
          const base64 = imgBuffer.toString('base64');
          try { fs.unlinkSync(outputPath); } catch (e) {} // cleanup
          resolve({ success: true, base64, mimeType: 'image/png' });
        } else if (fs.existsSync(outputPath)) {
          // Sometimes GS exits with non-zero but still produces a valid file
          const imgBuffer = fs.readFileSync(outputPath);
          const base64 = imgBuffer.toString('base64');
          try { fs.unlinkSync(outputPath); } catch (e) {} // cleanup
          resolve({ success: true, base64, mimeType: 'image/png' });
        } else {
          reject(new Error(`Ghostscript failed with code ${code}. Details: ${errOutput}`));
        }
      });

      gsProc.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(new Error(`Ghostscript execution error: ${err.message}`));
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC Handler for checking video codec (h264, hevc, etc.)
ipcMain.handle('check-video-codec', async (event, videoPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        fileLog('[check-video-codec] ffprobe failed:', err.message);
        return reject(err);
      }
      try {
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (videoStream && videoStream.codec_name) {
          resolve(videoStream.codec_name.toLowerCase());
        } else {
          resolve('unknown');
        }
      } catch (e) {
        resolve('unknown');
      }
    });
  });
});

// IPC Handler to get image dimensions securely using Sharp
ipcMain.handle('get-image-dimensions', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const metadata = await sharp(filePath).metadata();
    return { width: metadata.width, height: metadata.height };
  } catch (err) {
    fileLog('[get-image-dimensions] Failed:', err.message);
    return null;
  }
});


// IPC Handler for extracting a representative frame from a video file
ipcMain.handle('extract-video-frame', async (event, videoPath) => {
  try {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    // Get video duration
    const duration = await new Promise((resolve) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          fileLog('[extract-video-frame] ffprobe failed:', err.message);
        }
        resolve(metadata?.format?.duration || 10); // default to 10 seconds if probe fails
      });
    });

    const offsets = [
      Math.max(duration * 0.2, 0.5),
      Math.max(duration * 0.5, 1.0),
      Math.max(duration * 0.8, 1.5)
    ];

    fileLog(`[extract-video-frame] Probing duration: ${duration}s. Sampling offsets:`, offsets);

    // Extract frames in parallel
    const extractPromises = offsets.map((offset, idx) => {
      return new Promise((resolve) => {
        const outPath = path.join(os.tmpdir(), `video_frame_${Date.now()}_${idx}.jpg`);
        const offsetStr = offset.toFixed(2);
        
        ffmpeg(videoPath)
          .inputOptions([`-ss ${offsetStr}`])
          .outputOptions(['-frames:v 1', '-vf scale=1280:-1', '-q:v 3'])
          .output(outPath)
          .on('end', () => {
            try {
              if (fs.existsSync(outPath)) {
                const buffer = fs.readFileSync(outPath);
                fs.unlinkSync(outPath);
                resolve(buffer.toString('base64'));
              } else {
                resolve(null);
              }
            } catch (e) {
              resolve(null);
            }
          })
          .on('error', () => {
            // Fallback: try at 0s
            ffmpeg(videoPath)
              .inputOptions(['-ss 0'])
              .outputOptions(['-frames:v 1', '-vf scale=1280:-1', '-q:v 3'])
              .output(outPath)
              .on('end', () => {
                try {
                  if (fs.existsSync(outPath)) {
                    const buffer = fs.readFileSync(outPath);
                    fs.unlinkSync(outPath);
                    resolve(buffer.toString('base64'));
                  } else {
                    resolve(null);
                  }
                } catch (_) {
                  resolve(null);
                }
              })
              .on('error', () => resolve(null))
              .run();
          })
          .run();
      });
    });

    const frames = await Promise.all(extractPromises);
    const validFrames = frames.filter(Boolean);

    if (validFrames.length === 0) {
      throw new Error("FFmpeg failed to extract any frames from the video.");
    }

    // middle frame (index 1 if available, otherwise index 0)
    const middleIndex = validFrames.length >= 2 ? 1 : 0;
    const primaryFrame = validFrames[middleIndex];

    fileLog(`[extract-video-frame] Extracted ${validFrames.length} frames successfully`);
    return {
      success: true,
      base64: primaryFrame,
      base64Array: validFrames,
      mimeType: 'image/jpeg'
    };
  } catch (error) {
    fileLog('[extract-video-frame] Error:', error.message);
    return { success: false, error: error.message };
  }
});

// IPC Handler for generating high-res JPG from EPS or PNG
ipcMain.handle('generate-eps-jpg', async (event, inputPath, addWhiteBgToPng = true, outputExt = '.jpg') => {
  try {
    const parsedPath = path.parse(inputPath);
    const finalExt = outputExt.startsWith('.') ? outputExt : `.${outputExt}`;
    const outputName = `${parsedPath.name}${finalExt}`;
    const outputPath = path.join(parsedPath.dir, outputName);
    const ext = parsedPath.ext.toLowerCase();

    const processWithSharp = async (srcPath, destPath) => {
      const meta = await sharp(srcPath).metadata();
      await sharp({
        create: {
          width: meta.width,
          height: meta.height,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      })
      .composite([{ input: srcPath, blend: 'over' }])
      .jpeg({ quality: 100 })
      .toFile(destPath);
    };

    if (ext === '.png') {
      if (addWhiteBgToPng) {
        await processWithSharp(inputPath, outputPath);
      } else {
        await sharp(inputPath).jpeg({ quality: 100 }).toFile(outputPath);
      }
      return { success: true, outputPath };
    }

    // Ghostscript for EPS
    const gsCmd = await findGhostscript();
    if (!gsCmd) {
      throw new Error('Ghostscript not found on this system. Please install Ghostscript.');
    }

    const tempPngPath = path.join(os.tmpdir(), `temp_eps_res_${Date.now()}.png`);
    const args = [
      '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dNOPROMPT', '-dEPSCrop',
      '-sDEVICE=pngalpha', '-r400', '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4',
      `-sOutputFile=${tempPngPath}`, inputPath
    ];

    const bundledBinDir2 = path.join(app.isPackaged ? process.resourcesPath : __dirname, '..', 'bin');
    const gsLibPath2 = `${path.join(bundledBinDir2, 'win_graphics_proc', 'lib')};${path.join(bundledBinDir2, 'win_graphics_proc', 'Resource', 'Init')}`;
    const gsEnv2 = { 
      ...process.env, 
      GS_LIB: gsLibPath2, 
      PATH: `${path.join(bundledBinDir2, 'win_graphics_proc', 'bin')};${process.env.PATH || ''}` 
    };

    return new Promise((resolve, reject) => {
      const gsProc = spawn(gsCmd, args, { env: gsEnv2 });
      
      // Safety timeout of 45 seconds
      const timeoutId = setTimeout(() => {
        try {
          gsProc.kill();
        } catch (e) {}
        reject(new Error('Ghostscript rendering timed out (45 seconds limit reached).'));
      }, 45000);

      // CRITICAL: Consume stdout and stderr to prevent OS pipe buffers from filling up and hanging the process
      let errOutput = '';
      gsProc.stdout.on('data', () => {}); // ignore stdout but consume it
      gsProc.stderr.on('data', (data) => errOutput += data.toString());

      gsProc.on('close', async (code) => {
        clearTimeout(timeoutId);
        if (code === 0 && fs.existsSync(tempPngPath)) {
          try {
            await processWithSharp(tempPngPath, outputPath);
            fs.unlinkSync(tempPngPath);
            resolve({ success: true, outputPath });
          } catch (err) {
            reject(new Error(`Failed to process temp PNG: ${err.message}`));
          }
        } else {
          reject(new Error(`Ghostscript failed with code ${code}. Error: ${errOutput}`));
        }
      });

      gsProc.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(new Error(`Ghostscript execution error: ${err.message}`));
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

setupMataAi(ipcMain, fileLog);

// IPC Handler for local background removal via Node
ipcMain.handle('remove-bg-local', async (event, inputPath) => {
  const outMaskPath = inputPath + '_mask.png';
  try {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`File not found: ${inputPath}`);
    }
    
    // Get original metadata
    const origMeta = await sharp(inputPath).metadata();
    const mimeType = origMeta.format ? `image/${origMeta.format}` : 'image/png';
    
    console.log('[IPC remove-bg-local] Spawning standalone background removal process in Electron CJS...');
    const cliPath = path.join(process.cwd(), 'server', 'remove-bg-cli.js');
    
    await new Promise((resolve, reject) => {
      const child = spawn('node', [cliPath, inputPath, outMaskPath, mimeType]);
      
      let errOutput = '';
      child.stderr.on('data', (data) => {
        errOutput += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outMaskPath)) {
          resolve();
        } else {
          reject(new Error(errOutput || `Subprocess exited with code ${code}`));
        }
      });
    });
    
    console.log('[IPC remove-bg-local] Standalone process completed. Reading mask...');
    const maskBuffer = fs.readFileSync(outMaskPath);
    try { fs.unlinkSync(outMaskPath); } catch (_) {}
    
    // 2. Prepare mask (Stable way)
    const mask = await sharp(maskBuffer)
      .resize(origMeta.width, origMeta.height)
      .grayscale()
      .png()
      .toBuffer();

    // 3. Composite
    const finalBuffer = await sharp(inputPath)
      .ensureAlpha()
      .composite([{
        input: mask,
        blend: 'dest-in'
      }])
      .png()
      .toBuffer();

    const base64 = finalBuffer.toString('base64');
    return { success: true, base64, mimeType: 'image/png' };
  } catch (error) {
    if (fs.existsSync(outMaskPath)) {
      try { fs.unlinkSync(outMaskPath); } catch (_) {}
    }
    console.error('[IPC remove-bg-local]', error);
    return { success: false, error: error.message || 'Local background removal failed' };
  }
});

// IPC Handler for remove.bg API proxy
ipcMain.handle('remove-bg-api', async (event, inputPath, apiKey) => {
  try {
    if (!apiKey) throw new Error('API key is required');
    if (!fs.existsSync(inputPath)) {
      throw new Error(`File not found: ${inputPath}`);
    }
    const buf = fs.readFileSync(inputPath);
    const form = new FormData();
    form.append('image_file', new Blob([buf]), path.basename(inputPath) || 'image.png');
    form.append('size', 'auto');

    const out = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: form,
    });

    if (!out.ok) {
      const errJson = await out.json().catch(() => ({}));
      const msg = errJson.errors?.[0]?.title || errJson.error || out.statusText;
      throw new Error(msg || `remove.bg API failed (${out.status})`);
    }

    const arrayBuf = await out.arrayBuffer();
    const removeBgBuffer = Buffer.from(arrayBuf);
    
    console.log('[IPC remove-bg-api] Processing high-fidelity (stable mode)...');
    
    // 1. Get original dimensions
    const origMeta = await sharp(buf).metadata();
    
    // 2. Prepare mask with gamma to fix fringes safely
    const mask = await sharp(removeBgBuffer)
      .resize(origMeta.width, origMeta.height, { fit: 'fill' })
      .ensureAlpha()
      .gamma(3)
      .png()
      .toBuffer();

    // 3. Composite
    const finalBuffer = await sharp(buf)
      .ensureAlpha()
      .composite([{
        input: mask,
        blend: 'dest-in'
      }])
      .png()
      .toBuffer();

    const base64 = finalBuffer.toString('base64');
    return { success: true, base64, mimeType: 'image/png' };
  } catch (error) {
    console.error('[IPC remove-bg-api]', error);
    return { success: false, error: error.message || 'remove.bg API failed' };
  }
});

// IPC Handler for Hugging Face free inference proxy
ipcMain.handle('remove-bg-hf', async (event, inputPath, token) => {
  try {
    if (!token) throw new Error('Hugging Face token is required');
    if (!fs.existsSync(inputPath)) {
      throw new Error(`File not found: ${inputPath}`);
    }
    const buf = fs.readFileSync(inputPath);
    const mimeType = inputPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

    const out = await fetch("https://api-inference.huggingface.co/models/briaai/RMBG-1.4", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token.replace(/^Bearer\s+/i, '').trim()}`,
        "Content-Type": mimeType
      },
      body: buf
    });

    if (!out.ok) {
      let msg = out.statusText;
      try {
        const errJson = await out.json();
        if (errJson.error) msg = errJson.error;
      } catch (_) {}
      if (msg?.includes('currently loading')) {
        throw new Error('মডেলটি সার্ভারে লোড হচ্ছে। অনুগ্রহ করে ২০ সেকেন্ড পর আবার চেষ্টা করুন।');
      }
      throw new Error(msg || `Hugging Face API failed (${out.status})`);
    }

    const arrayBuf = await out.arrayBuffer();
    const hfBuffer = Buffer.from(arrayBuf);
    
    console.log('[IPC remove-bg-hf] Restoring original quality...');
    
    // 1. Get original dimensions
    const origMeta = await sharp(buf).metadata();
    
    // 2. Prepare mask
    const mask = await sharp(hfBuffer)
      .resize(origMeta.width, origMeta.height, { fit: 'fill' })
      .ensureAlpha()
      .gamma(3)
      .png()
      .toBuffer();

    // 3. Apply to original
    const finalBuffer = await sharp(buf)
      .ensureAlpha()
      .composite([{
        input: mask,
        blend: 'dest-in'
      }])
      .png()
      .toBuffer();

    const base64 = finalBuffer.toString('base64');
    return { success: true, base64, mimeType: 'image/png' };
  } catch (error) {
    console.error('[IPC remove-bg-hf]', error);
    return { success: false, error: error.message || 'Hugging Face API failed' };
  }
});



// IPC Handler for Metadata Embedding
let exiftoolInstance = null;

async function getExifTool() {
  fileLog('[getExifTool] Initializing or retrieving ExifTool instance...');
  if (!exiftoolInstance) {
    const { ExifTool, exiftoolPath } = require('exiftool-vendored');
    try {
      const resolvedPath = await exiftoolPath();
      fileLog('[getExifTool] Resolved exiftoolPath:', resolvedPath);
    } catch (e) {
      fileLog('[getExifTool] Failed resolving exiftoolPath:', e);
    }
    exiftoolInstance = new ExifTool({ maxProcs: 2, taskTimeoutMillis: 60000 });
    fileLog('[getExifTool] ExifTool instance created.');
  }
  return exiftoolInstance;
}

app.on('will-quit', () => {
  fileLog('[app will-quit] Ending ExifTool instance...');
  if (exiftoolInstance) {
    exiftoolInstance.end();
    fileLog('[app will-quit] ExifTool instance ended.');
  }
});

// ── Persistent Metadata Cache helper functions for Red Dot prevention ──
const METADATA_CACHE_FILE = path.join(app.getPath('userData'), 'metadata-history-cache.json');

async function saveMetadataToCache(originalPath, newFileName, title, description, keywords, categories) {
  try {
    let cache = {};
    if (fs.existsSync(METADATA_CACHE_FILE)) {
      try {
        cache = JSON.parse(fs.readFileSync(METADATA_CACHE_FILE, 'utf8') || '{}');
      } catch (e) {
        fileLog('[cache] Failed parsing cache file, resetting:', e);
      }
    }
    
    const entry = {
      title,
      description,
      keywords: Array.isArray(keywords) ? keywords : (keywords || '').split(',').map(k => k.trim()).filter(Boolean),
      categories: Array.isArray(categories) ? categories : (categories || '').split(',').map(c => c.trim()).filter(Boolean),
      timestamp: Date.now()
    };
    
    const origKey = path.basename(originalPath).toLowerCase().trim();
    cache[origKey] = entry;
    
    if (newFileName) {
      const newKey = newFileName.toLowerCase().trim();
      cache[newKey] = entry;
    }
    
    fs.writeFileSync(METADATA_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    fileLog('[cache] Metadata saved for keys:', [origKey, newFileName?.toLowerCase().trim()].filter(Boolean));
  } catch (err) {
    fileLog('[cache] Error saving to metadata cache:', err);
  }
}

async function getMetadataFromCache(fileName) {
  try {
    if (!fs.existsSync(METADATA_CACHE_FILE)) return null;
    const cache = JSON.parse(fs.readFileSync(METADATA_CACHE_FILE, 'utf8') || '{}');
    const key = fileName.toLowerCase().trim();
    
    if (cache[key]) {
      fileLog('[cache] Match found for:', key);
      return cache[key];
    }
    
    const normalizedKey = key.replace(/[\s_-]+/g, '');
    for (const [k, entry] of Object.entries(cache)) {
      if (k.replace(/[\s_-]+/g, '') === normalizedKey) {
        fileLog('[cache] Loose match found:', k, 'for:', key);
        return entry;
      }
    }
    return null;
  } catch (err) {
    fileLog('[cache] Error reading from metadata cache:', err);
    return null;
  }
}

// ── File existence checker (exposed to renderer) ─────────────────────────────
ipcMain.handle('check-file-exists', (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) return { exists: true, resolvedPath: filePath };
    // Also try swapping .jpeg <-> .jpg extension in case the file was renamed
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') {
      const altExt = ext === '.jpg' ? '.jpeg' : '.jpg';
      const altPath = path.join(path.dirname(filePath), path.basename(filePath, ext) + altExt);
      if (fs.existsSync(altPath)) return { exists: true, resolvedPath: altPath };
    }
    return { exists: false, resolvedPath: filePath };
  } catch (e) {
    return { exists: false, resolvedPath: filePath };
  }
});

ipcMain.handle('write-metadata', async (event, filePath, title, description, keywords, categories) => {
  fileLog('[write-metadata] Called with:', { filePath, title, description, keywords, categories });
  try {
    // Resolve actual file path — try alternate .jpeg <-> .jpg extension if primary not found
    if (!fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.jpg' || ext === '.jpeg') {
        const altExt = ext === '.jpg' ? '.jpeg' : '.jpg';
        const altPath = path.join(path.dirname(filePath), path.basename(filePath, ext) + altExt);
        if (fs.existsSync(altPath)) {
          fileLog('[write-metadata] Primary not found, using alternate extension:', altPath);
          filePath = altPath;
        } else {
          // Third fallback: scan parent directory for an already-renamed file using the title
          // This handles the case where the file was successfully renamed in a previous session
          try {
            const dir = path.dirname(filePath);
            const sanitizedTitle = (title || '').replace(/[^\w\s-]/gi, '').replace(/\s+/g, '_').trim().substring(0, 120);
            if (sanitizedTitle) {
              const candidates = (fs.readdirSync(dir) || []).filter(f => {
                const base = path.basename(f, path.extname(f));
                return base.toLowerCase() === sanitizedTitle.toLowerCase();
              });
              if (candidates.length === 1) {
                const alreadyRenamedPath = path.join(dir, candidates[0]);
                fileLog('[write-metadata] File was already renamed in previous session to:', alreadyRenamedPath);
                // File already processed — return success with already-renamed path without re-writing
                return { success: true, newPath: alreadyRenamedPath, newFileName: candidates[0], alreadyProcessed: true };
              }
            }
          } catch (scanErr) {
            fileLog('[write-metadata] Error scanning directory for renamed file:', scanErr);
          }
          fileLog('[write-metadata] File does not exist:', filePath);
          throw new Error(`File not found: ${filePath}`);
        }
      } else {
        fileLog('[write-metadata] File does not exist:', filePath);
        throw new Error(`File not found: ${filePath}`);
      }
    }
    fileLog('[write-metadata] File exists, resolving exiftool...');
    
    const exiftool = await getExifTool();
    fileLog('[write-metadata] ExifTool instance retrieved.');
    
    const keywordsArray = Array.isArray(keywords) 
      ? keywords 
      : (keywords || '').split(',').map(k => k.trim()).filter(Boolean);
      
    const categoriesArray = Array.isArray(categories)
      ? categories
      : (categories || '').split(',').map(c => c.trim()).filter(Boolean);
      
    // Append categories to keywords for maximum stock compatibility and limit to 49 for Adobe Stock
    const finalKeywordsArray = [...new Set([...keywordsArray, ...categoriesArray])].slice(0, 49);
      
    const tags = {
      "XMP-dc:Title": title,
      "XMP-dc:Description": description,
      "XMP-dc:Subject": finalKeywordsArray,
      "IPTC:ObjectName": title,
      "IPTC:Caption-Abstract": description,
      "IPTC:Keywords": finalKeywordsArray,
      "EXIF:ImageDescription": description,
      "EXIF:XPTitle": title,
      "EXIF:XPComment": description,
      "EXIF:XPKeywords": finalKeywordsArray.join('; '),
      "IPTC:SupplementalCategories": categoriesArray,
      "XMP-photoshop:Category": categoriesArray.length > 0 ? categoriesArray[0] : "",
      "XMP-photoshop:SupplementalCategories": categoriesArray
    };

    fileLog('[write-metadata] Writing tags to file:', tags);
    
    // "-overwrite_original" ensures no *_original backup files are created
    const writePromise = exiftool.write(filePath, tags, ["-overwrite_original", "-codedcharacterset=utf8"]);
    fileLog('[write-metadata] write promise triggered, awaiting...');
    
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('ExifTool write operation timed out (60s)')), 60000);
    });
    
    try {
      await Promise.race([writePromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
    fileLog('[write-metadata] Write completed successfully.');
    
    // Clean up any lingering _exiftool_tmp or _original files
    try {
      if (fs.existsSync(filePath + '_exiftool_tmp')) fs.unlinkSync(filePath + '_exiftool_tmp');
      if (fs.existsSync(filePath + '_original')) fs.unlinkSync(filePath + '_original');
    } catch (cleanupErr) {
      fileLog('[write-metadata] Cleanup error:', cleanupErr);
    }
    
    // Rename the file to match the title
    let finalPath = filePath;
    let newFileName = path.basename(filePath);
    
    if (title && title.trim().length > 0) {
      try {
        const ext = path.extname(filePath);
        const dir = path.dirname(filePath);
        // Sanitize title: replace spaces with underscores, remove special chars, limit length
        let sanitizedTitle = title
          .replace(/[^\w\s-]/gi, '') // Remove all non-word characters except spaces and hyphens
          .replace(/\s+/g, '_')      // Replace spaces with underscores
          .trim()
          .substring(0, 120);        // Keep filename length reasonable
        
        if (sanitizedTitle) {
          let targetName = sanitizedTitle + ext;
          let targetPath = path.join(dir, targetName);
          
          // Handle collisions if file exists and it's not the exact same file
          let counter = 1;
          while (fs.existsSync(targetPath) && targetPath.toLowerCase() !== filePath.toLowerCase()) {
            targetName = `${sanitizedTitle} (${counter})${ext}`;
            targetPath = path.join(dir, targetName);
            counter++;
          }
          
          if (targetPath.toLowerCase() !== filePath.toLowerCase()) {
            fs.renameSync(filePath, targetPath);
            finalPath = targetPath;
            newFileName = targetName;
            fileLog('[write-metadata] File renamed to:', targetPath);
          }
        }
      } catch (renameErr) {
        fileLog('[write-metadata] Failed to rename file, keeping original name:', renameErr);
      }
    }
    
    await saveMetadataToCache(filePath, newFileName, title, description, keywords, categories);
    return { success: true, newPath: finalPath, newFileName };
  } catch (error) {
    fileLog('[write-metadata error]', error);
    return { success: false, error: error.message };
  }
});

// Secure Storage IPC Handlers
const SERVICE_NAME = 'ImageMetadataPro';
let keytar = null;
try {
  keytar = require('keytar');
} catch (e) {
  console.warn('Keytar native module not available, falling back to secure JSON file storage.');
}

const getKeysFilePath = () => path.join(app.getPath('userData'), 'secure-keys.json');

async function internalLoadAllKeys() {
  const filePath = getKeysFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Error reading secure keys file:', err);
    }
  }
  return { gemini: [], groq: [], openrouter: [], openai: [], mistral: [] };
}

async function internalSaveAllKeys(allKeys) {
  const filePath = getKeysFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(allKeys, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing secure keys file:', err);
  }
}

ipcMain.handle('save-key', async (event, provider, key, index) => {
  const allKeys = await internalLoadAllKeys();
  if (!allKeys[provider]) allKeys[provider] = [];
  allKeys[provider][index] = key;
  await internalSaveAllKeys(allKeys);
  
  if (keytar) {
    try {
      await keytar.setPassword(SERVICE_NAME, `${provider}_${index}`, key);
    } catch (e) { /* ignore */ }
  }
  return true;
});

ipcMain.handle('get-key', async (event, provider, index) => {
  if (keytar) {
    try {
      const pwd = await keytar.getPassword(SERVICE_NAME, `${provider}_${index}`);
      if (pwd) return pwd;
    } catch (e) { /* ignore */ }
  }
  const allKeys = await internalLoadAllKeys();
  return (allKeys[provider] && allKeys[provider][index]) || null;
});

ipcMain.handle('delete-key', async (event, provider, index) => {
  const allKeys = await internalLoadAllKeys();
  if (allKeys[provider]) {
    allKeys[provider].splice(index, 1);
    await internalSaveAllKeys(allKeys);
  }
  if (keytar) {
    try {
      await keytar.deletePassword(SERVICE_NAME, `${provider}_${index}`);
    } catch (e) { /* ignore */ }
  }
  return true;
});

ipcMain.handle('save-all-keys', async (event, allKeys) => {
  await internalSaveAllKeys(allKeys);
  if (keytar) {
    try {
      for (const [prov, keys] of Object.entries(allKeys)) {
        for (let i = 0; i < keys.length; i++) {
          await keytar.setPassword(SERVICE_NAME, `${prov}_${i}`, keys[i]);
        }
      }
    } catch (e) { /* ignore */ }
  }
  return true;
});

ipcMain.handle('load-all-keys', async (event) => {
  return await internalLoadAllKeys();
});

// FTP Upload Handlers
const getFtpFilePath = () => path.join(app.getPath('userData'), 'ftp-config.json');
const getSecureFtpFilePath = () => path.join(app.getPath('userData'), 'secure-ftp-config.json');

ipcMain.handle('save-ftp-config', async (event, configs) => {
  const filePath = getFtpFilePath();
  const securePath = getSecureFtpFilePath();
  try {
    const configsArray = Array.isArray(configs) ? configs : [configs];
    
    // Save public configs without passwords
    const configsToSave = configsArray.map(c => ({ ...c, password: '' }));
    fs.writeFileSync(filePath, JSON.stringify(configsToSave, null, 2), 'utf8');
    
    // Save secure configs containing passwords for fallback storage
    const secureConfigs = configsArray.map(c => ({ id: c.id, password: c.password || '' }));
    fs.writeFileSync(securePath, JSON.stringify(secureConfigs, null, 2), 'utf8');
    
    if (keytar) {
      for (const config of configsArray) {
        if (config.id && config.password) {
          try {
            await keytar.setPassword(SERVICE_NAME, `ftp_password_${config.id}`, config.password);
          } catch (_) {}
        } else if (config.password && !config.id) {
          // fallback
          try {
            await keytar.setPassword(SERVICE_NAME, 'ftp_password', config.password);
          } catch (_) {}
        }
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-ftp-config', async (event) => {
  const filePath = getFtpFilePath();
  const securePath = getSecureFtpFilePath();
  let configs = [];
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) {
        configs = data;
      } else if (data && data.host) {
        data.id = data.id || 'legacy_1';
        configs = [data];
      }
    } catch (err) {
      console.error('Error reading ftp config', err);
    }
  }
  
  // Load passwords from keytar first, then fallback to secure file
  let secureFallbackMap = {};
  if (fs.existsSync(securePath)) {
    try {
      const secureData = JSON.parse(fs.readFileSync(securePath, 'utf8'));
      if (Array.isArray(secureData)) {
        secureData.forEach(s => {
          if (s.id) secureFallbackMap[s.id] = s.password;
        });
      }
    } catch (err) {
      console.error('Error reading secure ftp config', err);
    }
  }

  for (let c of configs) {
    let pwd = null;
    if (keytar && c.id) {
      try {
        pwd = await keytar.getPassword(SERVICE_NAME, `ftp_password_${c.id}`);
      } catch (e) { /* ignore */ }
    }
    if (keytar && !pwd && c.id === 'legacy_1') {
      try {
        pwd = await keytar.getPassword(SERVICE_NAME, 'ftp_password');
      } catch (e) { /* ignore */ }
    }
    // Fallback to secure config file if password is not found in keytar
    if (!pwd && c.id && secureFallbackMap[c.id]) {
      pwd = secureFallbackMap[c.id];
    }
    if (pwd) c.password = pwd;
  }
  return configs;
});

ipcMain.handle('test-ftp', async (event, config) => {
  const isSftp = parseInt(config.port) === 22 || config.host?.toLowerCase().includes('sftp');
  if (isSftp) {
    const Client = require('ssh2-sftp-client');
    const sftp = new Client();
    try {
      await sftp.connect({
        host: config.host?.trim(),
        username: config.user?.trim(),
        password: config.password?.trim(),
        port: parseInt(config.port) || 22,
        readyTimeout: 30000,
      });
      await sftp.end();
      return { success: true };
    } catch (err) {
      return { success: false, error: 'SFTP Error: ' + err.message };
    }
  } else {
    const ftp = require('basic-ftp');
    const client = new ftp.Client();
    client.ftp.log = fileLog;
    try {
      await client.access({
        host: config.host?.trim(),
        user: config.user?.trim(),
        password: config.password?.trim(),
        port: parseInt(config.port) || 21,
        secure: config.secure === true ? true : false,
        secureOptions: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2'
        }
      });
      client.close();
      return { success: true };
    } catch (err) {
      client.close();
      return { success: false, error: 'FTP Error: ' + err.message };
    }
  }
});

// ─── FTP / SFTP PERSISTENT CONNECTION POOL ────────────────────────────────────
//
// Problem with previous approach: every upload call created N new TLS connections
// to the server. For Adobe Stock (US servers), each TLS handshake takes 300-500 ms
// from Asia. With 8 connections per upload that's 2.4–4 seconds of PURE OVERHEAD
// before the first byte of data is sent — for EVERY image.
//
// Solution: Keep a pool of warm connections per server. Once established they are
// reused for ALL subsequent uploads. Connections are closed only after 60 s of
// inactivity. This means the TLS cost is paid ONCE per session, not once per image.
//
// Adobe Stock note: their servers reject >4 simultaneous connections per account.
// We detect the host and cap at 3 workers for Adobe Stock.
// ─────────────────────────────────────────────────────────────────────────────

const FTP_STREAM_HWM = 2 * 1024 * 1024; // 2MB read-buffer per stream for maximum throughput over high latency
const POOL_IDLE_TTL  = 300_000;          // close pool after 5 mins of inactivity

// pool: Map<cacheKey, { type, clients: Client[], idleTimer, busy }>
const ftpPool = new Map();

// track jobs that the user has cancelled
global.cancelledFtpJobs = new Set();

// Concurrency control variables for dynamic throttle per host
const activeUploadsByHost = new Map();
const uploadWaitersByHost = new Map();

function wakeAllUploadWaiters() {
  for (const [, waiters] of uploadWaitersByHost.entries()) {
    while (waiters.length > 0) {
      const resolve = waiters.shift();
      if (resolve) resolve();
    }
  }
}

global.uploadConcurrency = 3;

async function acquireUploadSlot(host) {
  if (!host) return;
  const key = host.toLowerCase().trim();
  while (true) {
    const currentActive = activeUploadsByHost.get(key) || 0;
    const currentMax = Math.min(global.uploadConcurrency || 3, getWorkerLimit(key));
    if (currentActive < currentMax) {
      activeUploadsByHost.set(key, currentActive + 1);
      return;
    }
    if (!uploadWaitersByHost.has(key)) {
      uploadWaitersByHost.set(key, []);
    }
    await new Promise(resolve => uploadWaitersByHost.get(key).push(resolve));
  }
}

function releaseUploadSlot(host) {
  if (!host) return;
  const key = host.toLowerCase().trim();
  const currentActive = activeUploadsByHost.get(key) || 0;
  activeUploadsByHost.set(key, Math.max(0, currentActive - 1));
  const waiters = uploadWaitersByHost.get(key) || [];
  if (waiters.length > 0) {
    const next = waiters.shift();
    if (next) next();
  }
}

// ── server-specific settings ─────────────────────────────────────────────────

function getWorkerLimit(host) {
  const h = (host || '').toLowerCase();
  // Adobe Stock / Contributor portal - highly sensitive to parallel uploads, must be 1 to prevent SFTP _fast errors or disconnects
  if (h.includes('adobe') || h.includes('adobestock') || h.includes('contributor.stock')) return 1;
  // Dreamstime allows up to 2 concurrent uploads
  if (h.includes('dreamstime')) return 2;
  // Shutterstock, Getty, Freepik etc.
  return 3; // Reduced to 3 to ensure maximum stability and 0% error rate
}

// ── client factories ──────────────────────────────────────────────────────────

async function createFtpClient(config) {
  const ftp    = require('basic-ftp');
  const client = new ftp.Client();
  client.ftp.timeout = 300000;
  await client.access({
    host:          config.host?.trim(),
    user:          config.user?.trim(),
    password:      config.password?.trim(),
    port:          parseInt(config.port) || 21,
    secure:        config.secure === true,
    secureOptions: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2'
    }
  });
  // Force binary mode once – avoids per-file TYPE I round-trip
  await client.send('TYPE I');
  // Disable Nagle so small control frames go out immediately
  try { client.ftp.socket.setNoDelay(true); } catch (_) {}
  return client;
}

async function createSftpClient(config) {
  const Client = require('ssh2-sftp-client');
  const client = new Client();
  await client.connect({
    host:         config.host?.trim(),
    username:     config.user?.trim(),
    password:     config.password?.trim(),
    port:         parseInt(config.port) || 22,
    readyTimeout: 30000,
    keepaliveInterval: 15000 // Send keep-alive packet every 15s to prevent timeouts on large files
  });
  return client;
}

// ── pool management
//
// Each pool entry has SLOTS. A slot = { client, inUse }.
// Before using a connection a worker must ACQUIRE its slot (sets inUse=true).
// After finishing it RELEASES the slot (sets inUse=false) and wakes the next waiter.
// This guarantees a connection is NEVER used by two concurrent operations.
//
// Multiple concurrent upload-ftp IPC calls (from auto-embed) all share the same
// pool — they simply queue behind busy slots instead of crashing basic-ftp.
// ─────────────────────────────────────────────────────────────────────────────

function poolKey(config, type) {
  return `${type}|${config.host?.trim()}|${config.user?.trim()}`;
}

function resetIdleTimer(entry, key) {
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(async () => {
    // Check if any slot is in use
    const anyInUse = entry.slots && entry.slots.some(s => s.inUse);
    if (anyInUse) {
      fileLog(`[pool] Rescheduling idle pool close for ${key} because connections are in use`);
      resetIdleTimer(entry, key);
      return;
    }
    fileLog(`[pool] Closing idle pool for ${key}`);
    await closePool(key);
  }, POOL_IDLE_TTL);
}

async function closePool(key) {
  const entry = ftpPool.get(key);
  if (!entry) return;
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  ftpPool.delete(key);
  await Promise.allSettled(entry.slots.map(s =>
    entry.type === 'sftp' ? s.client.end() : Promise.resolve(s.client.close())
  ));
  fileLog(`[pool] Pool closed for ${key}`);
}

// Acquire a free slot; waits if all are busy
function acquireSlot(entry) {
  return new Promise((resolve) => {
    const tryGet = () => {
      const slot = entry.slots.find(s => !s.inUse);
      if (slot) {
        slot.inUse = true;
        resolve(slot);
      } else {
        entry.waiters.push(tryGet); // put ourselves in the wait queue
      }
    };
    tryGet();
  });
}

// Release a slot back to the pool and wake the next waiter if any
function releaseSlot(entry, slot) {
  slot.inUse = false;
  if (entry.waiters.length > 0) {
    const next = entry.waiters.shift();
    next(); // let the waiter try again immediately
  }
}

const poolLocks = new Map();

async function getPool(config, type, key) {
  // Wait if another concurrent request is currently building this pool
  while (poolLocks.get(key)) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (ftpPool.has(key)) {
    const entry = ftpPool.get(key);
    // Check for dead connections (basic-ftp sets .closed = true)
    const deadCount = entry.slots.filter(s => type === 'ftp' && s.client.closed).length;
    if (deadCount > 0) {
      fileLog(`[pool] ${deadCount} dead slot(s), rebuilding pool...`);
      await closePool(key);
    } else {
      fileLog(`[pool] ♻️  Reusing ${entry.slots.length}-slot pool for ${config.host}`);
      resetIdleTimer(entry, key);
      return entry;
    }
  }

  // Lock this key so concurrent callers wait
  poolLocks.set(key, true);
  
  try {
    // DNS Pre-check
    try {
      const dns = require('dns').promises;
      await dns.lookup(config.host.trim());
    } catch (dnsErr) {
      throw new Error(`Couldn't resolve host name ${config.host}. Please check your internet connection or DNS settings.`);
    }

    // Build new pool
    const limit = getWorkerLimit(config.host);
    fileLog(`[pool] 🔌 Opening ${limit} ${type.toUpperCase()} connections to ${config.host}...`);
    const t0 = Date.now();

    const clients = await Promise.all(
      Array.from({ length: limit }, () =>
        type === 'sftp' ? createSftpClient(config) : createFtpClient(config)
      )
    );
    fileLog(`[pool] ✅ Pool ready in ${Date.now() - t0}ms (${limit} slots)`);

    const entry = {
      type,
      slots:   clients.map(client => ({ client, inUse: false })),
      waiters: [],
      idleTimer: null,
    };
    ftpPool.set(key, entry);
    resetIdleTimer(entry, key);
    return entry;
  } finally {
    poolLocks.set(key, false);
  }
}

// ── work-stealing uploader ────────────────────────────────────────────────────
//
// All files go into a shared queue. Multiple concurrent callers share the same
// pool. Each file is uploaded by acquiring a free slot, uploading, then releasing.
// If no slot is free the caller waits — basic-ftp is NEVER asked to run two
// operations simultaneously on the same connection.
// ─────────────────────────────────────────────────────────────────────────────

class ProgressTransform extends Transform {
  constructor(totalBytes, startOffset, onProgress, onTimeout) {
    super();
    this.totalBytes = totalBytes;
    this.transferred = startOffset || 0;
    this.onProgress = onProgress;
    this.onTimeout = onTimeout;
    this.lastDataTime = Date.now();
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastDataTime > 30000) {
        if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
        if (this.onTimeout) this.onTimeout();
      }
    }, 5000);
  }

  _destroy(err, callback) {
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
    callback(err);
  }

  _final(callback) {
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
    callback();
  }

  _transform(chunk, encoding, callback) {
    this.lastDataTime = Date.now();
    this.transferred += chunk.length;
    if (this.totalBytes > 0) {
      const p = Math.round((this.transferred / this.totalBytes) * 100);
      this.onProgress(p);
    }
    this.push(chunk);
    callback();
  }

  _destroy(err, callback) {
    clearInterval(this.watchdog);
    callback(err);
  }
}

const globalMetadataLocks = new Map();

async function acquireMetadataLock(filePath) {
  while (globalMetadataLocks.get(filePath)) {
    await new Promise(r => setTimeout(r, 100));
  }
  globalMetadataLocks.set(filePath, true);
}

function releaseMetadataLock(filePath) {
  globalMetadataLocks.delete(filePath);
}

async function uploadFilesParallel(config, filePaths, type, jobId, event) {
  const validPaths = filePaths.filter(p => fs.existsSync(p));
  const fileErrors = {};
  const renamedFiles = {};
  const successfulAdobeUploads = [];
  if (validPaths.length === 0) return { fileErrors, renamedFiles };

  const key   = poolKey(config, type);
  const entry = await getPool(config, type, key);

  fileLog(`[upload-${type}] ${validPaths.length} file(s) queued into ${entry.slots.length}-slot pool`);

  // We process the files using a queue index to maintain exact serial order
  let nextFileIndex = 0;
  const limit = entry.slots.length; // number of workers = number of slots in the pool

  // Create N worker loops to process files in parallel, each worker pulls sequentially
  const workers = Array.from({ length: limit }, async (_, workerId) => {
    while (true) {
      if (jobId && global.cancelledFtpJobs.has(jobId)) {
        break;
      }
      
      const index = nextFileIndex++;
      if (index >= validPaths.length) {
        break;
      }

      const filePath = validPaths[index];
      let fileName = path.basename(filePath);
      if (fileName.toLowerCase().endsWith('.jpeg')) {
        fileName = fileName.substring(0, fileName.length - 5) + '.jpg';
      }

      // Check before acquiring slot
      if (jobId && global.cancelledFtpJobs.has(jobId)) {
        fileLog(`[upload-${type}] ⛔ Skipped ${fileName} (Job Cancelled)`);
        fileErrors[filePath] = 'Cancelled by user';
        break;
      }

      let finalTitleToSave = '';
      let finalKeywordsToSave = '';
      let finalCategoryToSave = '';

      // ── AUTOMATIC METADATA SCAN & FORMAT CORRECTION (Red Dot Prevention) ──
      try {
        const ext = path.extname(filePath).toLowerCase();
        // Only process common formats we can write metadata to (jpg, jpeg, png, eps, webp, tiff)
        if (['.jpg', '.jpeg', '.png', '.eps', '.webp', '.tiff'].includes(ext)) {
          await acquireMetadataLock(filePath);
          try {
            const exiftool = await getExifTool();
            let tags = {};
          try {
            tags = await exiftool.read(filePath);
          } catch (e) {
            fileLog('[upload-metadata] Failed reading tags from:', fileName, e);
          }
          
          const title = tags.Title || tags.ObjectName || tags.XPTitle || '';
          
          let keywords = [];
          const rawKeywords = tags.Subject || tags.Keywords || tags.XPKeywords || [];
          if (Array.isArray(rawKeywords)) {
            keywords = rawKeywords;
          } else if (typeof rawKeywords === 'string') {
            keywords = rawKeywords.split(/[,;]/).map(k => k.trim()).filter(Boolean);
          }
          
          const hasTitle = title && String(title).trim().length > 0;
          const hasKeywords = keywords.length > 0;
          
          if (hasTitle || hasKeywords) {
            // File has metadata. Check and format it correctly to avoid Red Dot issues on Adobe Stock
            fileLog(`[upload-metadata] Formatting existing metadata for ${fileName} (Title: ${hasTitle}, Keywords: ${keywords.length})`);
            
            // Deduplicate and clean up keywords
            const finalKeywordsArray = [...new Set(keywords)].map(k => String(k).trim()).filter(Boolean).slice(0, 49);
            const finalTitle = String(title).trim();
            
            finalTitleToSave = finalTitle;
            finalKeywordsToSave = finalKeywordsArray.join(', ');

            // Re-write in correct standard XMP and IPTC formats with UTF-8 encoding
            const writeTags = {
              "XMP-dc:Title": finalTitle,
              "XMP-dc:Subject": finalKeywordsArray,
              "IPTC:ObjectName": finalTitle,
              "IPTC:Keywords": finalKeywordsArray,
              "EXIF:XPTitle": finalTitle,
              "EXIF:XPKeywords": finalKeywordsArray.join('; ')
            };
            
            // If description exists, preserve and rewrite it in correct fields
            const description = tags.Description || tags.Caption || tags['Caption-Abstract'] || tags.ImageDescription || tags.XPComment;
            if (description) {
              const finalDesc = String(description).trim();
              writeTags["XMP-dc:Description"] = finalDesc;
              writeTags["IPTC:Caption-Abstract"] = finalDesc;
              writeTags["EXIF:ImageDescription"] = finalDesc;
              writeTags["EXIF:XPComment"] = finalDesc;
            }
            
            // If supplemental categories exist, preserve them
            const categories = tags.SupplementalCategories || tags['XMP-photoshop:SupplementalCategories'] || [];
            const categoriesArray = Array.isArray(categories) ? categories : (typeof categories === 'string' ? categories.split(',') : []);
            if (categoriesArray.length > 0) {
              const cleanCategories = categoriesArray.map(c => String(c).trim()).filter(Boolean);
              finalCategoryToSave = cleanCategories[0] || '';
              writeTags["IPTC:SupplementalCategories"] = cleanCategories;
              writeTags["XMP-photoshop:Category"] = cleanCategories[0] || "";
              writeTags["XMP-photoshop:SupplementalCategories"] = cleanCategories;
            }
            
            fileLog('[upload-metadata] Re-writing formatted tags to ensure Adobe Stock compatibility:', writeTags);
            await exiftool.write(filePath, writeTags, ["-overwrite_original", "-codedcharacterset=utf8"]);
            fileLog('[upload-metadata] Metadata formatting completed for:', fileName);
            
            // Clean up any lingering _exiftool_tmp or _original files
            try {
              if (fs.existsSync(filePath + '_exiftool_tmp')) fs.unlinkSync(filePath + '_exiftool_tmp');
              if (fs.existsSync(filePath + '_original')) fs.unlinkSync(filePath + '_original');
            } catch (cleanupErr) {
              fileLog('[upload-metadata] Cleanup error:', cleanupErr);
            }
          } else {
            fileLog(`[upload-metadata] File ${fileName} has no metadata. Uploading as-is without adding metadata.`);
          }
          } finally {
            releaseMetadataLock(filePath);
          }
        }
      } catch (metadataErr) {
        fileLog('[upload-metadata error] Failed to process metadata:', metadataErr);
      }

      // Acquire concurrency slot first
      await acquireUploadSlot(config.host);

      // Check cancellation again
      if (jobId && global.cancelledFtpJobs.has(jobId)) {
        releaseUploadSlot(config.host);
        fileErrors[filePath] = 'Cancelled by user';
        break;
      }

      const slot = await acquireSlot(entry); // blocks until a connection is free
      let total_transferred = 0;
      const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

      const isAdobe = config.host && (
        config.host.toLowerCase().includes('adobe') ||
        config.host.toLowerCase().includes('adobestock') ||
        config.host.toLowerCase().includes('contributor.stock')
      );

      let finalRemoteName = fileName;
      const MAX_RETRIES = 5;
      let uploadSuccess = false;

      try {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          if (uploadSuccess) break;

          // Re-check after acquiring or retrying
          if (jobId && global.cancelledFtpJobs.has(jobId)) throw new Error('Cancelled by user');

          // Reconnect slot if dead/closed before upload starts
          if (slot.dead || (type === 'ftp' && slot.client.closed)) {
            fileLog(`[pool] Reconnecting dead/closed slot for ${config.host}...`);
            slot.client = type === 'sftp' ? await createSftpClient(config) : await createFtpClient(config);
            slot.dead = false;
          }

          let attemptName = fileName;
          let remoteSize = 0;

          // Non-Adobe Method: Check size and Smart Resume
          try {
            if (type === 'ftp') {
              remoteSize = await slot.client.size(fileName);
            } else {
              remoteSize = await slot.client.stat(fileName).then(s => s.size);
            }
            fileLog(`[upload-${type}] Checked remote file ${fileName}: size = ${remoteSize} bytes`);
          } catch (err) {
            // Only "file not found" is acceptable. Code 2 is SSH_FX_NO_SUCH_FILE
            if (err.code !== 2 && err.code !== 'ENOENT' && !(err.message||'').toLowerCase().includes('no such file')) {
              fileLog(`[upload-${type}] Unexpected stat error: ${err.message}`);
            }
            remoteSize = 0;
          }
          
          if (remoteSize === fileSize && fileSize > 0) {
            fileLog(`[upload-${type}] File ${fileName} already exists on remote with identical size (${remoteSize} bytes). Skipping.`);
            if (event && !event.sender.isDestroyed()) {
              event.sender.send('ftp-progress', { filePath, progress: 100, host: config.host });
            }
            uploadSuccess = true;
            break;
          }

          fileLog(`[upload-${type}] Worker ${workerId} uploading ${attemptName} (Attempt ${attempt}/${MAX_RETRIES})`);
          total_transferred = 0;

          try {
            if (type === 'sftp') {
              // We use fastPut for SFTP to gain speed and get native progress tracking
              let lastProgress = 0;
              await slot.client.fastPut(filePath, attemptName, {
                concurrency: 64,
                chunkSize: 64 * 1024,
                step: (transferred, chunk, total) => {
                  if (jobId && global.cancelledFtpJobs.has(jobId)) {
                    throw new Error('Cancelled by user');
                  }
                  total_transferred = transferred;
                  const p = Math.round((transferred / total) * 100);
                  if (p !== lastProgress) {
                    lastProgress = p;
                    if (event && !event.sender.isDestroyed()) {
                      event.sender.send('ftp-progress', { filePath, progress: p, host: config.host });
                    }
                  }
                }
              });
            } else {
              let lastProgress = 0;
              slot.client.trackProgress(info => {
                if (jobId && global.cancelledFtpJobs.has(jobId)) {
                  slot.client.trackProgress();
                  try { slot.client.close(); } catch (_) {}
                  return;
                }
                total_transferred = info.bytesOverall;
                if (fileSize > 0) {
                  const p = Math.min(Math.round((info.bytesOverall / fileSize) * 100), 99); // cap at 99 until fully finished
                  if (p !== lastProgress) {
                    lastProgress = p;
                    if (event && !event.sender.isDestroyed()) {
                      event.sender.send('ftp-progress', { filePath, progress: p, host: config.host });
                    }
                  }
                }
              });
              await slot.client.uploadFrom(filePath, attemptName);
            }
            uploadSuccess = true;
            fileLog(`[upload-${type}] ✓ Uploaded successfully: ${attemptName}`);
          } catch (uploadErr) {
            // Detect Overwrite / Permission Denied specifically for Non-Adobe sites if they throw it
            const errMsg = (uploadErr.message || '').toLowerCase();
            const isOverwrite = errMsg.includes('550') || errMsg.includes('overwrite') || errMsg.includes('exists') || errMsg.includes('permission') || errMsg.includes('denied');
            
            fileLog(`[upload-${type}] Upload error on attempt ${attempt}: ${uploadErr.message}`);
            slot.dead = true;
            if (type === 'ftp') try { slot.client.close(); } catch(e){}
            else try { slot.client.end(); } catch(e){}
            
            if (!isAdobe && isOverwrite) {
               // For non-Adobe, fallback rename logic if permission denied
               const ext = path.extname(fileName);
               const base = path.basename(fileName, ext);
               fileName = `${base}_${attempt}${ext}`;
               finalRemoteName = fileName;
               fileLog(`[upload-${type}] Non-Adobe overwrite error, renaming to ${fileName} for next attempt.`);
            }
            
            if (attempt === MAX_RETRIES) throw uploadErr;
          } finally {
            if (type === 'ftp') {
              slot.client.trackProgress();
            }
          }
        } // end retry loop

        // Verify uploaded file size
        let verifySize = 0;
        try {
          if (type === 'ftp') {
            verifySize = await slot.client.size(finalRemoteName);
          } else {
            verifySize = await slot.client.stat(finalRemoteName).then(s => s.size);
          }
          fileLog(`[upload-${type}] Verified remote file ${finalRemoteName} size: ${verifySize}/${fileSize} bytes`);
        } catch (sizeErr) {
          fileLog(`[upload-${type}] Size verification could not retrieve size for ${finalRemoteName}: ${sizeErr.message}`);
          verifySize = fileSize; 
        }

        if (verifySize !== fileSize) {
          if (verifySize === 0) {
            throw new Error(`Upload verification failed: remote file is 0 bytes (expected ${fileSize} bytes)`);
          } else {
            fileLog(`[upload-${type}] ⚠️ Warning: Size mismatch. Local: ${fileSize}, Remote: ${verifySize}. Assuming successful upload due to host processing.`);
          }
        }
        
        // Emit 100% just in case
        if (event && !event.sender.isDestroyed()) event.sender.send('ftp-progress', { filePath, progress: 100, host: config.host });
        
        fileLog(`[upload-${type}] ✓ ${fileName} (as ${finalRemoteName})`);
        
        if (isAdobe) {
           successfulAdobeUploads.push({
             filename: finalRemoteName,
             title: finalTitleToSave,
             keywords: finalKeywordsToSave,
             category: finalCategoryToSave
           });
        }
        
        fileErrors[filePath] = null;
      } catch (err) {
        const isCancelled = jobId && global.cancelledFtpJobs.has(jobId);
        if (isCancelled || (err.message && err.message.includes('Cancelled by user'))) {
           fileLog(`[upload-${type}] ⛔ Aborted ${fileName} (Cancelled)`);
           slot.dead = true;
           if (type === 'ftp') try { slot.client.close(); } catch(e){}
           else try { slot.client.end(); } catch(e){}
           fileErrors[filePath] = 'Cancelled by user';
           if (event && !event.sender.isDestroyed()) {
              event.sender.send('ftp-progress', { filePath, progress: -1, host: config.host, error: 'Cancelled by user' });
           }
        } else if ((err.code === 'ECONNRESET' || err.message.includes('ECONNRESET')) && total_transferred >= fileSize && fileSize > 0) {
           // Server closed connection after receiving the whole file
           fileLog(`[upload-${type}] ⚠️ ${fileName}: Connection reset after transfer (ignoring). Treated as success.`);
           if (event && !event.sender.isDestroyed()) event.sender.send('ftp-progress', { filePath, progress: 100, host: config.host });
           fileErrors[filePath] = null;
        } else {
           fileLog(`[upload-${type}] ✗ ${fileName}: ${err.message}`);
           slot.dead = true;
           if (type === 'ftp') try { slot.client.close(); } catch(e){}
           else try { slot.client.end(); } catch(e){}
           fileErrors[filePath] = err.message;
           if (event && !event.sender.isDestroyed()) {
              event.sender.send('ftp-progress', { filePath, progress: -1, host: config.host, error: err.message });
           }
        }
      } finally {
        releaseSlot(entry, slot); // always release so other waiters can proceed
        releaseUploadSlot(config.host);     // always release concurrency slot so other waiting workers can proceed
      }
    }
  });

  await Promise.all(workers);

  // Automatic CSV generation removed as requested
  let generatedCsvPath = null;

  resetIdleTimer(entry, key);
  return { fileErrors, renamedFiles, csvPath: generatedCsvPath };
}

ipcMain.handle('upload-ftp', async (event, config, filePaths, jobId) => {
  const isSftp = parseInt(config.port) === 22 || config.host?.toLowerCase().includes('sftp');
  const type   = isSftp ? 'sftp' : 'ftp';

  fileLog(`[upload-ftp] ▶ ${type.toUpperCase()} ${filePaths.length} file(s) → ${config.host} (Job: ${jobId||'none'})`);
  const t0 = Date.now();

  try {
    const { fileErrors, renamedFiles, csvPath } = await uploadFilesParallel(config, filePaths, type, jobId, event);
    fileLog(`[upload-ftp] ✅ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return { success: true, fileErrors, renamedFiles, csvPath };
  } catch (err) {
    const key = poolKey(config, type);
    await closePool(key); // rebuild pool on next call
    fileLog(`[upload-ftp] ❌ Failed (${((Date.now() - t0) / 1000).toFixed(1)}s): ${err.message}`);
    return { success: false, error: `${type.toUpperCase()} Error: ${err.message}` };
  }
});

ipcMain.handle('cancel-ftp', (event, jobId) => {
  if (jobId) {
    global.cancelledFtpJobs.add(jobId);
    fileLog(`[upload-ftp] 🛑 Cancelled job: ${jobId}`);
    wakeAllUploadWaiters(); // Wake up any workers waiting on concurrency throttle so they can cancel
  }
  return true;
});

ipcMain.handle('set-upload-concurrency', (event, concurrency) => {
  global.uploadConcurrency = parseInt(concurrency) || 3;
  fileLog(`[upload-ftp] Concurrency limit updated to ${global.uploadConcurrency}`);
  wakeAllUploadWaiters(); // Wake up any waiting workers to start new uploads
  return true;
});

ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    fileLog(`[open-external] Error: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// IPC Handler for folder and file selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('select-files', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: options?.filters || [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths;
});

// IPC Handler to save a file from Base64 or ArrayBuffer
ipcMain.handle('save-file', async (event, filePath, bufferArray) => {
  try {
    const buffer = Buffer.from(bufferArray);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, buffer);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer;
  } catch (err) {
    throw new Error(err.message);
  }
});

// Colab Cloud GPU Engine Handlers removed as requested.

ipcMain.handle('fetch-image', async (event, url) => {
  try {
    fileLog('[fetch-image] Fetching URL:', url);
    const res = await net.fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch image: HTTP ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return { success: true, buffer: Buffer.from(arrayBuffer) };
  } catch (err) {
    fileLog('[fetch-image] Error fetching URL:', url, err);
    return { success: false, error: err.message };
  }
});

// TopSellers Handler Registration
try {
  const backendPath = path.join(__dirname, '..', 'src', 'components', 'TopSellers', 'backend.cjs');
  fileLog('Attempting to load TopSellers backend from:', backendPath);
  const { registerTopSellersIPC } = require(backendPath);
  registerTopSellersIPC(ipcMain, BrowserWindow);
  fileLog('Successfully registered TopSellers IPC handler.');
} catch (err) {
  fileLog('Failed to register TopSellers IPC:', err);
}

