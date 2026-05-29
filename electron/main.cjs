const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const sharp = require('sharp');
const { Transform } = require('stream');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
if (ffmpegStatic) { ffmpeg.setFfmpegPath(ffmpegStatic); }

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
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
    const bundled64 = path.join(app.isPackaged ? process.resourcesPath : __dirname, '..', 'bin', 'gswin64c.exe');
    const bundled32 = path.join(app.isPackaged ? process.resourcesPath : __dirname, '..', 'bin', 'gswin32c.exe');
    
    if (fs.existsSync(bundled64)) return resolve(`"${bundled64}"`);
    if (fs.existsSync(bundled32)) return resolve(`"${bundled32}"`);

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
      const spawnCmd = cmd.includes('\\') ? `"${cmd}"` : cmd;
      
      const proc = spawn(spawnCmd, ['-v'], { shell: true });
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
      '-sDEVICE=png16m', '-r100', '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4',
      `-sOutputFile=${outputPath}`, `"${inputPath}"`
    ];

    return new Promise((resolve, reject) => {
      const gsProc = spawn(gsCmd, args, { shell: true });

      gsProc.on('close', (code) => {
        if (fs.existsSync(outputPath)) {
          const imgBuffer = fs.readFileSync(outputPath);
          const base64 = imgBuffer.toString('base64');
          try { fs.unlinkSync(outputPath); } catch (e) {} // cleanup
          resolve({ success: true, base64, mimeType: 'image/png' });
        } else {
          reject(new Error(`Ghostscript failed with code ${code}`));
        }
      });

      gsProc.on('error', (err) => {
        reject(new Error(`Ghostscript execution error: ${err.message}`));
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
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
ipcMain.handle('generate-eps-jpg', async (event, inputPath, addWhiteBgToPng = true) => {
  try {
    const parsedPath = path.parse(inputPath);
    const outputName = `${parsedPath.name}.jpg`;
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
      `-sOutputFile="${tempPngPath}"`, `"${inputPath}"`
    ];

    return new Promise((resolve, reject) => {
      const gsProc = spawn(gsCmd, args, { shell: true });
      let errOutput = '';
      gsProc.stderr.on('data', (data) => errOutput += data.toString());

      gsProc.on('close', async (code) => {
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
        reject(new Error(`Ghostscript execution error: ${err.message}`));
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC Handler for local background removal via Node
ipcMain.handle('remove-bg-local', async (event, inputPath) => {
  try {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`File not found: ${inputPath}`);
    }
    const buf = fs.readFileSync(inputPath);
    const { removeBackground } = await import('@imgly/background-removal-node');
    
    // Get original metadata
    const origMeta = await sharp(buf).metadata();
    
    console.log('[IPC remove-bg-local] Processing high-res mask...');
    const blob = await removeBackground(new Blob([buf]), {
      model: 'medium',
      output: { format: 'image/png', quality: 1.0, type: 'foreground' },
    });
    
    const arrayBuf = await blob.arrayBuffer();
    const maskBuffer = Buffer.from(arrayBuf);

    // 2. Prepare mask (Stable way)
    const mask = await sharp(maskBuffer)
      .resize(origMeta.width, origMeta.height)
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
    exiftoolInstance = new ExifTool({ maxProcs: 2 });
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

ipcMain.handle('write-metadata', async (event, filePath, title, description, keywords, categories) => {
  fileLog('[write-metadata] Called with:', { filePath, title, description, keywords, categories });
  try {
    if (!fs.existsSync(filePath)) {
      fileLog('[write-metadata] File does not exist:', filePath);
      throw new Error(`File not found: ${filePath}`);
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
      timeoutId = setTimeout(() => reject(new Error('ExifTool write operation timed out (15s)')), 15000);
    });
    
    try {
      await Promise.race([writePromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
    fileLog('[write-metadata] Write completed successfully.');
    
    // Rename the file to match the title
    let finalPath = filePath;
    let newFileName = path.basename(filePath);
    
    if (title && title.trim().length > 0) {
      try {
        const ext = path.extname(filePath);
        const dir = path.dirname(filePath);
        // Sanitize title: remove invalid characters, trim, limit length
        let sanitizedTitle = title.replace(/[<>:"/\\|?*]+/g, '').trim().substring(0, 150);
        
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

ipcMain.handle('save-ftp-config', async (event, configs) => {
  const filePath = getFtpFilePath();
  try {
    const configsArray = Array.isArray(configs) ? configs : [configs];
    const configsToSave = configsArray.map(c => ({ ...c, password: '' }));
    fs.writeFileSync(filePath, JSON.stringify(configsToSave, null, 2), 'utf8');
    
    if (keytar) {
      for (const config of configsArray) {
        if (config.id && config.password) {
          await keytar.setPassword(SERVICE_NAME, `ftp_password_${config.id}`, config.password);
        } else if (config.password && !config.id) {
          // fallback
          await keytar.setPassword(SERVICE_NAME, 'ftp_password', config.password);
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
  if (keytar) {
    for (let c of configs) {
      try {
        let pwd;
        if (c.id) {
          pwd = await keytar.getPassword(SERVICE_NAME, `ftp_password_${c.id}`);
        }
        if (!pwd && c.id === 'legacy_1') {
          pwd = await keytar.getPassword(SERVICE_NAME, 'ftp_password');
        }
        if (pwd) c.password = pwd;
      } catch (e) { /* ignore */ }
    }
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

const FTP_STREAM_HWM = 16 * 1024 * 1024; // 16 MB read-buffer per stream
const POOL_IDLE_TTL  = 60_000;           // close pool after 60 s of inactivity

// pool: Map<cacheKey, { type, clients: Client[], idleTimer, busy }>
const ftpPool = new Map();

// track jobs that the user has cancelled
global.cancelledFtpJobs = new Set();

// ── server-specific settings ─────────────────────────────────────────────────

function getWorkerLimit(host) {
  const h = (host || '').toLowerCase();
  // Adobe Stock / Contributor portal - highly sensitive to parallel uploads, must be 1 to prevent SFTP _fast errors or disconnects
  if (h.includes('adobe') || h.includes('adobestock') || h.includes('contributor.stock')) return 1;
  // Dreamstime limits connections per user
  if (h.includes('dreamstime')) return 1;
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
    readyTimeout: 30000
  });
  return client;
}

// ── pool management ───────────────────────────────────────────────────────────
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
  constructor(totalBytes, onProgress) {
    super();
    this.totalBytes = totalBytes;
    this.transferred = 0;
    this.onProgress = onProgress;
  }

  _transform(chunk, encoding, callback) {
    this.transferred += chunk.length;
    if (this.totalBytes > 0) {
      const p = Math.round((this.transferred / this.totalBytes) * 100);
      this.onProgress(p);
    }
    this.push(chunk);
    callback();
  }
}

async function uploadFilesParallel(config, filePaths, type, jobId, event) {
  const validPaths = filePaths.filter(p => fs.existsSync(p));
  const fileErrors = {};
  if (validPaths.length === 0) return fileErrors;

  const key   = poolKey(config, type);
  const entry = await getPool(config, type, key);

  fileLog(`[upload-${type}] ${validPaths.length} file(s) queued into ${entry.slots.length}-slot pool`);

  // Upload each file: acquire a free slot → upload → release
  await Promise.all(validPaths.map(async (filePath) => {
    let fileName = path.basename(filePath);
    // Dreamstime and some other stock sites reject .jpeg extensions, they require .jpg
    if (fileName.toLowerCase().endsWith('.jpeg')) {
      fileName = fileName.substring(0, fileName.length - 5) + '.jpg';
    }
    
    // Check before acquiring slot
    if (jobId && global.cancelledFtpJobs.has(jobId)) {
       fileLog(`[upload-${type}] ⛔ Skipped ${fileName} (Job Cancelled)`);
       fileErrors[filePath] = 'Cancelled by user';
       return; // skip
    }

    // ── AUTOMATIC METADATA SCAN & FORMAT CORRECTION (Red Dot Prevention) ──
    try {
      const ext = path.extname(filePath).toLowerCase();
      // Only process common formats we can write metadata to (jpg, jpeg, png, eps)
      if (['.jpg', '.jpeg', '.png', '.eps'].includes(ext)) {
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
            writeTags["IPTC:SupplementalCategories"] = cleanCategories;
            writeTags["XMP-photoshop:Category"] = cleanCategories[0] || "";
            writeTags["XMP-photoshop:SupplementalCategories"] = cleanCategories;
          }
          
          fileLog('[upload-metadata] Re-writing formatted tags to ensure Adobe Stock compatibility:', writeTags);
          await exiftool.write(filePath, writeTags, ["-overwrite_original", "-codedcharacterset=utf8"]);
          fileLog('[upload-metadata] Metadata formatting completed for:', fileName);
        } else {
          fileLog(`[upload-metadata] File ${fileName} has no metadata. Uploading as-is without adding metadata.`);
        }
      }
    } catch (metadataErr) {
      fileLog('[upload-metadata error] Failed to process metadata:', metadataErr);
    }

    const slot = await acquireSlot(entry); // blocks until a connection is free
    let total_transferred = 0;
    let fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

    try {
      // Re-check after acquiring
      if (jobId && global.cancelledFtpJobs.has(jobId)) {
        throw new Error('Cancelled by user');
      }

      // Reconnect slot if dead/closed before upload starts
      if (slot.dead || (type === 'ftp' && slot.client.closed)) {
        fileLog(`[pool] Reconnecting dead/closed slot for ${config.host}...`);
        slot.client = type === 'sftp' ? await createSftpClient(config) : await createFtpClient(config);
        slot.dead = false;
      }

      if (type === 'sftp') {
        const isAdobe = config.host && (
          config.host.toLowerCase().includes('adobe') ||
          config.host.toLowerCase().includes('adobestock') ||
          config.host.toLowerCase().includes('contributor.stock')
        );

        if (isAdobe) {
          // For Adobe Stock, fastPut is rejected by the server (throws "fastPut: _fast..." error).
          // Switching to standard put with a manual read stream to track progress.
          const readStream = fs.createReadStream(filePath);
          
          const progressStream = new ProgressTransform(fileSize, (p) => {
             if (jobId && global.cancelledFtpJobs.has(jobId)) {
                readStream.destroy(new Error('Cancelled by user'));
                progressStream.destroy(new Error('Cancelled by user'));
                try { slot.client.end(); } catch(e){}
                return;
             }
             total_transferred = Math.floor((p / 100) * fileSize);
             if (event && !event.sender.isDestroyed()) {
                event.sender.send('ftp-progress', { filePath, progress: p, host: config.host });
             }
          });
          
          readStream.on('error', () => {}); // Prevent uncaught exception
          progressStream.on('error', () => {}); // Prevent uncaught exception

          try {
            await slot.client.put(readStream.pipe(progressStream), `/${fileName}`);
          } catch (err) {
            if (jobId && global.cancelledFtpJobs.has(jobId)) {
               try { slot.client.end(); } catch(e){}
               throw new Error('Cancelled by user');
            }
            throw err;
          }
        } else {
          // Super-fast parallel chunk upload for all other stock servers
          await slot.client.fastPut(filePath, `/${fileName}`, {
            concurrency: 32, // High concurrency to saturate the user's internet bandwidth
            chunkSize: 1024 * 1024,
            step: function(transferred, chunk, total) {
              total_transferred = transferred;
              if (jobId && global.cancelledFtpJobs.has(jobId)) {
                 try { slot.client.end(); } catch(e){}
                 throw new Error('Cancelled by user');
              }
              if (total > 0 && event && !event.sender.isDestroyed()) {
                 const p = Math.round((total_transferred / total) * 100);
                 event.sender.send('ftp-progress', { filePath, progress: p, host: config.host });
              }
            }
          });
        }
      } else {
        const readStream = fs.createReadStream(filePath, { highWaterMark: FTP_STREAM_HWM });
        
        const progressStream = new ProgressTransform(fileSize, (p) => {
           if (jobId && global.cancelledFtpJobs.has(jobId)) {
               readStream.destroy(new Error('Cancelled by user'));
               progressStream.destroy(new Error('Cancelled by user'));
               try { slot.client.close(); } catch(e){}
               return;
           }
           total_transferred = Math.floor((p / 100) * fileSize);
           if (event && !event.sender.isDestroyed()) {
               event.sender.send('ftp-progress', { filePath, progress: p, host: config.host });
           }
        });
        
        readStream.on('error', () => {}); // Prevent uncaught exception
        progressStream.on('error', () => {}); // Prevent uncaught exception

        await slot.client.uploadFrom(readStream.pipe(progressStream), fileName);
      }
      
      // Emit 100% just in case
      if (event && !event.sender.isDestroyed()) event.sender.send('ftp-progress', { filePath, progress: 100, host: config.host });
      
      fileLog(`[upload-${type}] ✓ ${fileName}`);
      fileErrors[filePath] = null;
    } catch (err) {
      const isCancelled = jobId && global.cancelledFtpJobs.has(jobId);
      if (isCancelled || (err.message && err.message.includes('Cancelled by user'))) {
         fileLog(`[upload-${type}] ⛔ Aborted ${fileName} (Cancelled)`);
         slot.dead = true;
         if (type === 'ftp') slot.client.close();
         if (type === 'sftp') try { slot.client.end(); } catch(e){}
         fileErrors[filePath] = 'Cancelled by user';
         if (event && !event.sender.isDestroyed()) {
            event.sender.send('ftp-progress', { filePath, progress: -1, host: config.host, error: 'Cancelled by user' });
         }
      } else if ((err.code === 'ECONNRESET' || err.message.includes('ECONNRESET')) && total_transferred >= fileSize && fileSize > 0) {
         // Server closed connection after receiving the whole file (common on Dreamstime)
         fileLog(`[upload-${type}] ⚠️ ${fileName}: Connection reset after transfer (ignoring). Treated as success.`);
         if (event && !event.sender.isDestroyed()) event.sender.send('ftp-progress', { filePath, progress: 100, host: config.host });
         fileErrors[filePath] = null;
      } else {
         fileLog(`[upload-${type}] ✗ ${fileName}: ${err.message}`);
         // Mark slot dead so getPool rebuilds next call
         slot.dead = true;
         if (type === 'ftp') slot.client.close();
         if (type === 'sftp') try { slot.client.end(); } catch(e){}
         fileErrors[filePath] = err.message;
         if (event && !event.sender.isDestroyed()) {
            event.sender.send('ftp-progress', { filePath, progress: -1, host: config.host, error: err.message });
         }
      }
    } finally {
      releaseSlot(entry, slot); // always release so other waiters can proceed
    }
  }));

  resetIdleTimer(entry, key);
  return fileErrors;
}

ipcMain.handle('upload-ftp', async (event, config, filePaths, jobId) => {
  const isSftp = parseInt(config.port) === 22 || config.host?.toLowerCase().includes('sftp');
  const type   = isSftp ? 'sftp' : 'ftp';

  fileLog(`[upload-ftp] ▶ ${type.toUpperCase()} ${filePaths.length} file(s) → ${config.host} (Job: ${jobId||'none'})`);
  const t0 = Date.now();

  try {
    const fileErrors = await uploadFilesParallel(config, filePaths, type, jobId, event);
    fileLog(`[upload-ftp] ✅ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return { success: true, fileErrors };
  } catch (err) {
    const key = poolKey(config, type);
    await closePool(key); // rebuild pool on next call
    fileLog(`[upload-ftp] ❌ Failed (${((Date.now() - t0) / 1000).toFixed(1)}s): ${err.message}`);
    return { success: false, error: `${type.toUpperCase()} Error: ${err.message}` };
  } finally {
    if (jobId) {
      global.cancelledFtpJobs.delete(jobId);
    }
  }
});

ipcMain.handle('cancel-ftp', (event, jobId) => {
  if (jobId) {
    global.cancelledFtpJobs.add(jobId);
    fileLog(`[upload-ftp] 🛑 Cancelled job: ${jobId}`);
  }
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

// Colab Cloud GPU Engine Handlers
let colabWindow = null;
let colabScanInterval = null;

function scanFramesForGradioLink(frame, onFound) {
  if (!frame) return;
  
  // Try to execute script in this frame to find links or printed text containing links
  frame.executeJavaScript(`
    (() => {
      const links = document.querySelectorAll('a');
      for (let a of links) {
        if (a.href && (a.href.includes('.gradio.live') || a.href.includes('ngrok-free.app') || a.href.includes('trycloudflare.com') || a.href.includes('loca.lt'))) {
          return a.href;
        }
      }
      const bodyText = document.body ? document.body.innerText : '';
      const match = bodyText.match(/https?:\\/\\/[a-zA-Z0-9-]+\\.(gradio\\.live|ngrok-free\\.app|trycloudflare\\.com|loca\\.lt)/);
      if (match) {
        return match[0];
      }
      return null;
    })()
  `).then(link => {
    if (link) {
      onFound(link);
    }
  }).catch(err => {
    // Suppress frame execution errors
  });

  // Recurse into child frames
  if (frame.frames && frame.frames.length > 0) {
    frame.frames.forEach(child => scanFramesForGradioLink(child, onFound));
  }
}

ipcMain.handle('start-colab', async (event, url) => {
  if (colabWindow) {
    colabWindow.close();
  }
  if (colabScanInterval) {
    clearInterval(colabScanInterval);
    colabScanInterval = null;
  }
  
  colabWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:colab'
    },
    title: 'Cloud GPU Engine (Colab)'
  });

  colabWindow.setMenu(null);
  colabWindow.loadURL(url);

  // Inject observer to find gradio link and auto-click Run All in the main frame
  colabWindow.webContents.on('did-finish-load', () => {
    colabWindow.webContents.executeJavaScript(`
      (function() {
        if (window.__colabObserver) return;
        
        // 1. Observe for the generated link
        window.__colabObserver = new MutationObserver((mutations) => {
          const links = document.querySelectorAll('a');
          for (let a of links) {
            if (a.href && (a.href.includes('.gradio.live') || a.href.includes('ngrok-free.app') || a.href.includes('trycloudflare.com') || a.href.includes('loca.lt'))) {
              document.title = "GRADIO_LINK:" + a.href;
            }
          }
        });
        window.__colabObserver.observe(document.body, { childList: true, subtree: true });
        
        // 2. Try to auto-click Run All after a short delay
        setTimeout(() => {
          const runAllBtn = document.querySelector('colab-toolbar-button#run-all');
          if (runAllBtn) {
            runAllBtn.click();
            // A dialog might appear "Warning: This notebook was not authored by Google."
            // We can try to click "Run anyway" after a second.
            setTimeout(() => {
              const runAnywayBtn = document.getElementById('ok');
              if (runAnywayBtn) runAnywayBtn.click();
            }, 1000);
          }
        }, 5000);
      })();
    `).catch(err => fileLog('[Colab] Inject Error:', err.message));
  });

  // Watch for main page title updates (fallback)
  colabWindow.on('page-title-updated', (e, title) => {
    if (title.startsWith('GRADIO_LINK:')) {
      const link = title.replace('GRADIO_LINK:', '').trim();
      
      if (global.testedLinks && global.testedLinks.has(link + "_dead")) {
        return;
      }
      
      fileLog('[Colab] Found potential Gradio link via title:', link);
      
      // Ping the server to verify it's alive and responsive
      fetch(link.replace(/\/$/, '') + '/system_info', {
        headers: { 'bypass-tunnel-reminder': 'true' }
      }).then(res => {
        if (res.ok) {
          fileLog('[Colab] Verified live link via title:', link);
          if (colabScanInterval) {
            clearInterval(colabScanInterval);
            colabScanInterval = null;
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('colab-status', { status: 'connected', url: link });
          }
          if (colabWindow) {
            colabWindow.hide();
          }
        } else {
          fileLog('[Colab] Link from title returned non-ok status:', link, res.status);
          if (global.testedLinks) global.testedLinks.add(link + "_dead");
        }
      }).catch(err => {
        fileLog('[Colab] Link from title ping failed:', link, err.message);
        if (global.testedLinks) global.testedLinks.add(link + "_dead");
      });
    }
  });

  // Start periodic recursive frame scanning (handles sandboxed output iframes)
  colabScanInterval = setInterval(() => {
    if (!colabWindow || colabWindow.isDestroyed()) {
      clearInterval(colabScanInterval);
      colabScanInterval = null;
      return;
    }
    
    scanFramesForGradioLink(colabWindow.webContents.mainFrame, (link) => {
      // Avoid scanning same link repeatedly if we already know it's dead or being tested
      if (global.testedLinks && global.testedLinks.has(link)) {
        return;
      }
      if (!global.testedLinks) {
        global.testedLinks = new Set();
      }
      global.testedLinks.add(link);
      
      fileLog('[Colab] Found potential Gradio link via frame scan, testing:', link);
      
      // Ping the server to verify it's alive and responsive
      fetch(link.replace(/\/$/, '') + '/system_info', {
        headers: { 'bypass-tunnel-reminder': 'true' }
      }).then(res => {
        if (res.ok) {
          fileLog('[Colab] Verified live link via frame scan:', link);
          if (colabScanInterval) {
            clearInterval(colabScanInterval);
            colabScanInterval = null;
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('colab-status', { status: 'connected', url: link });
          }
          if (colabWindow) {
            colabWindow.hide();
          }
        } else {
          fileLog('[Colab] Link from frame scan returned non-ok status:', link, res.status);
          global.testedLinks.add(link + "_dead");
        }
      }).catch(err => {
        fileLog('[Colab] Link from frame scan ping failed:', link, err.message);
        global.testedLinks.add(link + "_dead");
      });
    });
  }, 3000);

  colabWindow.on('closed', () => {
    if (colabScanInterval) {
      clearInterval(colabScanInterval);
      colabScanInterval = null;
    }
    colabWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('colab-status', { status: 'disconnected' });
    }
  });

  return { success: true };
});

ipcMain.handle('stop-colab', async () => {
  if (colabScanInterval) {
    clearInterval(colabScanInterval);
    colabScanInterval = null;
  }
  if (colabWindow) {
    colabWindow.close();
    colabWindow = null;
  }
  return { success: true };
});

ipcMain.handle('show-colab', async () => {
  if (colabWindow) {
    colabWindow.show();
  }
  return { success: true };
});

