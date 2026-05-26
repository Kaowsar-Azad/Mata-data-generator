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
    const writePromise = exiftool.write(filePath, tags, ["-overwrite_original"]);
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
          minVersion: 'TLSv1.2',
          maxVersion: 'TLSv1.2'
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

const FTP_STREAM_HWM = 4 * 1024 * 1024; // 4 MB read-buffer per stream
const POOL_IDLE_TTL  = 60_000;           // close pool after 60 s of inactivity

// pool: Map<cacheKey, { type, clients: Client[], idleTimer, busy }>
const ftpPool = new Map();

// track jobs that the user has cancelled
global.cancelledFtpJobs = new Set();

// ── server-specific settings ─────────────────────────────────────────────────

function getWorkerLimit(host) {
  const h = (host || '').toLowerCase();
  // Adobe Stock / Contributor portal - highly sensitive to parallel uploads, can cause SFTP _fast errors or disconnects
  if (h.includes('adobe') || h.includes('adobestock') || h.includes('contributor.stock')) return 1;
  // Dreamstime limits connections per user, can cause 550 High-end error
  if (h.includes('dreamstime')) return 1;
  // Shutterstock, Getty, Freepik etc.
  return 3; // Reduced from 6 to 3 to be safe and avoid rate limits across all platforms
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
    secureOptions: { rejectUnauthorized: false }
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
    algorithms: {
      kex:    ['ecdh-sha2-nistp256', 'diffie-hellman-group14-sha256'],
      cipher: ['aes128-gcm@openssh.com', 'aes256-gcm@openssh.com', 'aes128-ctr'],
      hmac:   ['hmac-sha2-256', 'hmac-sha1'],
    }
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
  if (validPaths.length === 0) return;

  const key   = poolKey(config, type);
  const entry = await getPool(config, type, key);

  fileLog(`[upload-${type}] ${validPaths.length} file(s) queued into ${entry.slots.length}-slot pool`);

  // Upload each file: acquire a free slot → upload → release
  await Promise.all(validPaths.map(async (filePath) => {
    const fileName = path.basename(filePath);
    
    // Check before acquiring slot
    if (jobId && global.cancelledFtpJobs.has(jobId)) {
       fileLog(`[upload-${type}] ⛔ Skipped ${fileName} (Job Cancelled)`);
       return; // skip
    }

    const slot = await acquireSlot(entry); // blocks until a connection is free

    try {
      // Re-check after acquiring
      if (jobId && global.cancelledFtpJobs.has(jobId)) {
        throw new Error('Cancelled by user');
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
          const stats = fs.statSync(filePath);
          let total_transferred = 0;
          
          readStream.on('data', (chunk) => {
            if (jobId && global.cancelledFtpJobs.has(jobId)) {
               readStream.destroy(new Error('Cancelled by user'));
               return;
            }
            total_transferred += chunk.length;
            if (stats.size > 0 && event) {
               const p = Math.round((total_transferred / stats.size) * 100);
               event.sender.send('ftp-progress', { filePath, progress: p, host: config.host });
            }
          });

          try {
            await slot.client.put(readStream, `/${fileName}`);
          } catch (err) {
            if (jobId && global.cancelledFtpJobs.has(jobId)) {
               slot.client.end();
               throw new Error('Cancelled by user');
            }
            throw err;
          }
        } else {
          // Super-fast parallel chunk upload for all other stock servers
          await slot.client.fastPut(filePath, `/${fileName}`, {
            concurrency: 32, // High concurrency to saturate the user's internet bandwidth
            chunkSize: 1024 * 1024,
            step: function(total_transferred, chunk, total) {
              if (jobId && global.cancelledFtpJobs.has(jobId)) {
                 slot.client.end();
                 throw new Error('Cancelled by user');
              }
              if (total > 0 && event) {
                 const p = Math.round((total_transferred / total) * 100);
                 event.sender.send('ftp-progress', { filePath, progress: p, host: config.host });
              }
            }
          });
        }
      } else {
        const stream = fs.createReadStream(filePath, { highWaterMark: FTP_STREAM_HWM });
        
        stream.on('data', () => {
           if (jobId && global.cancelledFtpJobs.has(jobId)) {
               stream.destroy(new Error('Cancelled by user'));
           }
        });

        slot.client.trackProgress(info => {
           if (info.bytesOverall > 0 && event) {
               const p = Math.round((info.bytes / info.bytesOverall) * 100);
               event.sender.send('ftp-progress', { filePath, progress: p, host: config.host });
           }
        });
        await slot.client.uploadFrom(stream, fileName);
        slot.client.trackProgress(); // clear progress handler
      }
      
      // Emit 100% just in case
      if (event) event.sender.send('ftp-progress', { filePath, progress: 100, host: config.host });
      
      fileLog(`[upload-${type}] ✓ ${fileName}`);
    } catch (err) {
      const isCancelled = jobId && global.cancelledFtpJobs.has(jobId);
      if (isCancelled || (err.message && err.message.includes('Cancelled by user'))) {
         fileLog(`[upload-${type}] ⛔ Aborted ${fileName} (Cancelled)`);
      } else {
         fileLog(`[upload-${type}] ✗ ${fileName}: ${err.message}`);
      }
      // Mark slot dead so getPool rebuilds next call
      if (type === 'ftp') slot.client.close();
      throw err;
    } finally {
      releaseSlot(entry, slot); // always release so other waiters can proceed
    }
  }));

  resetIdleTimer(entry, key);
}

ipcMain.handle('upload-ftp', async (event, config, filePaths, jobId) => {
  const isSftp = parseInt(config.port) === 22 || config.host?.toLowerCase().includes('sftp');
  const type   = isSftp ? 'sftp' : 'ftp';

  fileLog(`[upload-ftp] ▶ ${type.toUpperCase()} ${filePaths.length} file(s) → ${config.host} (Job: ${jobId||'none'})`);
  const t0 = Date.now();

  try {
    await uploadFilesParallel(config, filePaths, type, jobId, event);
    fileLog(`[upload-ftp] ✅ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return { success: true };
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

