const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const sharp = require('sharp');

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
      
    // Append categories to keywords for maximum stock compatibility
    const finalKeywordsArray = [...new Set([...keywordsArray, ...categoriesArray])];
      
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

ipcMain.handle('upload-ftp', async (event, config, filePaths) => {
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
      for (const filePath of filePaths) {
        if (fs.existsSync(filePath)) {
          const fileName = path.basename(filePath);
          await sftp.put(filePath, `/${fileName}`);
          fileLog(`[upload-sftp] Successfully uploaded ${fileName} to SFTP`);
        }
      }
      await sftp.end();
      return { success: true };
    } catch (err) {
      fileLog(`[upload-sftp] Error: ${err.message}`);
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
      for (const filePath of filePaths) {
        if (fs.existsSync(filePath)) {
          const fileName = path.basename(filePath);
          await client.uploadFrom(filePath, fileName);
          fileLog(`[upload-ftp] Successfully uploaded ${fileName} to FTP`);
        }
      }
      client.close();
      return { success: true };
    } catch (err) {
      client.close();
      fileLog(`[upload-ftp] Error: ${err.message}`);
      return { success: false, error: 'FTP Error: ' + err.message };
    }
  }
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

