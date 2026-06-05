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
let isQuitting = false;

app.on('before-quit', () => {
  isQuitting = true;
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
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

// IPC Handler for Local GPU Upscaling (Upscayl / realesrgan-ncnn-vulkan)
// Helper functions for Mata AI Upscaling
function detectIntelGPU() {
  try {
    const { execSync } = require('child_process');
    const stdout = execSync('wmic path win32_VideoController get name').toString();
    return stdout.toLowerCase().includes('intel');
  } catch (e) {
    return false;
  }
}

function isVectorOrAnimeFile(filePath) {
  const name = (filePath || '').toLowerCase();
  return (
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
    name.endsWith('.eps')
  );
}

async function upscaleLocalHighFidelitySharp(inputPath, outputPath, scale, outputFormat) {
  fileLog(`[upscale-local-high-fidelity-sharp] Running Local High-Fidelity Sharp pipeline for ${inputPath} (Scale: ${scale}x)`);
  
  const origMeta = await sharp(inputPath).metadata();
  const targetWidth = Math.round(origMeta.width * scale);
  const targetHeight = Math.round(origMeta.height * scale);

  let pipeline = sharp(inputPath)
    .resize(targetWidth, targetHeight, {
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false,
      withoutEnlargement: false
    });

  // Apply unsharp mask to restore edge crispness that scaling loses
  pipeline = pipeline.sharpen({
    sigma: 1.5,
    m1: 1.2,
    m2: 0.7,
    x1: 2,
    y2: 10,
    y3: 20
  });

  if (outputFormat === 'png') {
    await pipeline.png().toFile(outputPath);
  } else {
    await pipeline.jpeg({ quality: 100 }).toFile(outputPath);
  }
  
  fileLog(`[upscale-local-high-fidelity-sharp] High-fidelity sharp upscale complete: ${outputPath}`);
}

async function upscaleCloudHF(inputPath, scale, outputPath) {
  fileLog(`[upscale-cloud-hf] Connecting to finegrain/finegrain-image-enhancer Space...`);
  const { Client, handle_file } = await import('@gradio/client');
  const client = await Client.connect("finegrain/finegrain-image-enhancer");
  
  fileLog(`[upscale-cloud-hf] Sending process request (scale: ${scale})...`);
  const result = await client.predict("/process", [
    handle_file(inputPath), // input_image
    "highly detailed, sharp focus, clean, 4k", // prompt
    "blurry, low quality, noise, grain, text", // negative_prompt
    42, // seed
    parseFloat(scale), // upscale_factor
    0.6, // controlnet_scale
    1.0, // controlnet_decay
    6.0, // condition_scale
    112, // tile_width
    144, // tile_height
    0.35, // denoise_strength
    18, // num_inference_steps
    "DDIM" // solver
  ]);
  
  if (!result || !result.data || !result.data[0] || !result.data[0][1]) {
    throw new Error('Invalid response from Hugging Face Space upscaler');
  }

  const outUrl = result.data[0][1].url || result.data[0][1].path;
  if (!outUrl) {
    throw new Error('No output URL found in Hugging Face result');
  }

  fileLog(`[upscale-cloud-hf] Downloading result from: ${outUrl}`);
  const response = await fetch(outUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Hugging Face result: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
  fileLog(`[upscale-cloud-hf] Saved cloud upscaled result to: ${outputPath}`);
}

// IPC Handler for Local GPU Upscaling (Upscayl / realesrgan-ncnn-vulkan)
ipcMain.handle('upscale-local-ncnn', async (event, inputPath, scale, modelName = 'realesrgan-x4plus', format = 'jpg', saveDir = null) => {
  try {
    const binDir = app.isPackaged 
      ? path.join(process.resourcesPath, 'bin', 'upscayl') 
      : path.join(__dirname, '..', 'bin', 'upscayl');

    // Prefer upscayl-bin.exe (newer, more features), fall back to realesrgan-ncnn-vulkan.exe
    const isUpscaylBin = fs.existsSync(path.join(binDir, 'upscayl-bin.exe'));
    let exePath = isUpscaylBin
      ? path.join(binDir, 'upscayl-bin.exe')
      : path.join(binDir, 'realesrgan-ncnn-vulkan.exe');

    const parsedPath = path.parse(inputPath);
    const outputFormat = (format && format.toLowerCase() === 'png') ? 'png' : 'jpg';
    const filenameSuffix = modelName === 'mata_ai' ? 'MataAI' : 'LocalGPU';
    let outputPath = saveDir
      ? path.join(saveDir, `${parsedPath.name}_${scale}x_${filenameSuffix}.${outputFormat}`)
      : path.join(os.tmpdir(), `${parsedPath.name}_upscaled_${scale}x.${outputFormat}`);

    // Auto-create output directory if it doesn't exist (e.g. "Upscaled" subfolder)
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    let isMataAi = false;
    if (modelName === 'mata_ai') {
      isMataAi = true;
      const isVector = isVectorOrAnimeFile(inputPath);
      const isIntel = detectIntelGPU();
      
      if (!isVector) {
        // Photo: Phase 1 - Try Cloud AI (Hugging Face) for Best Quality + Speed
        try {
          fileLog(`[Mata AI] Running Cloud AI (Hugging Face Space) for photo...`);
          const cloudPromise = upscaleCloudHF(inputPath, scale, outputPath);
          // Increased timeout to 60s since logs show HuggingFace takes ~30s
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Cloud upscaling timed out (60s limit reached)')), 60000)
          );
          
          await Promise.race([cloudPromise, timeoutPromise]);
          fileLog(`[Mata AI] ✅ Cloud upscaling success!`);
          
          if (saveDir) {
            return { success: true, path: outputPath, format: outputFormat, engine: 'cloudHF' };
          } else {
            const buffer = fs.readFileSync(outputPath);
            fs.unlinkSync(outputPath);
            return { success: true, base64: buffer.toString('base64'), format: outputFormat };
          }
        } catch (cloudErr) {
          fileLog(`[Mata AI] ⚠️ Cloud upscaling failed/timed out: ${cloudErr.message}. Falling back to local NCNN...`);
        }

        // Photo: Phase 2 - Fallback to Local GPU
        if (isIntel) {
          fileLog(`[Mata AI] Integrated Intel GPU detected. Running fast AI model 'realesr-animevideov3' to ensure speed.`);
          modelName = 'realesr-animevideov3';
        } else {
          fileLog(`[Mata AI] Dedicated GPU detected. Running high-quality 'ultrasharp' model.`);
          modelName = 'ultrasharp';
        }
      } else {
        // Vector: run local NCNN with 'realesrgan-x4plus-anime'
        fileLog(`[Mata AI] Vector/Anime file detected. Running 'realesrgan-x4plus-anime'.`);
        modelName = 'realesrgan-x4plus-anime';
      }
    }

    if (!fs.existsSync(exePath)) {
      throw new Error(`Local upscaler engine not found at: ${exePath}`);
    }

    let finalInputPath = inputPath;
    let tempResizedPath = null;

    // Model scale: animevideov3 has dedicated x2/x3/x4 variants. All others are x4 models.
    // For x4 models, always run at 4x to get true AI upscaling; then output-scale handles final size.
    let finalModelName = modelName;
    let modelScale = 4; // Most models are 4x
    if (modelName === 'realesr-animevideov3') {
      const clampedScale = Math.min(4, Math.max(2, parseInt(scale)));
      finalModelName = `realesr-animevideov3-x${clampedScale}`;
      modelScale = clampedScale;
    }

    let args;
    if (isUpscaylBin) {
      args = [
        '-i', finalInputPath,
        '-o', outputPath,
        '-z', modelScale.toString(),
        '-s', scale.toString(),
        '-m', 'models',
        '-n', finalModelName,
        '-f', outputFormat,
        '-t', '128',
        '-v'
      ];
    } else {
      args = [
        '-i', finalInputPath,
        '-o', outputPath,
        '-s', scale.toString(),
        '-m', 'models',
        '-n', finalModelName,
        '-f', outputFormat,
        '-t', '128',
        '-v'
      ];
    }

    fileLog(`[upscale-local-ncnn] Engine: ${isUpscaylBin ? 'upscayl-bin' : 'realesrgan-ncnn-vulkan'}`);
    fileLog(`[upscale-local-ncnn] Running: ${exePath} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn(exePath, args, { cwd: binDir });
      let errOutput = '';
      
      const handleData = (data) => {
        const str = data.toString();
        errOutput += str;
        const match = str.match(/(\d+(?:\.\d+)?)\s*%/);
        if (match) {
          const progressVal = parseFloat(match[1]);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('upscale-progress', { filePath: inputPath, progress: progressVal });
          }
        }
      };

      proc.stdout.on('data', handleData);
      proc.stderr.on('data', handleData);
      
      proc.on('close', async (code) => {
        // Clean up temp resized file
        if (tempResizedPath && fs.existsSync(tempResizedPath)) {
          try {
            fs.unlinkSync(tempResizedPath);
          } catch (e) {
            fileLog(`[upscale-local-ncnn] Failed to delete temp resized file: ${e.message}`);
          }
        }

        const fileCreated = fs.existsSync(outputPath);
        if (fileCreated) {
          if (saveDir) {
            resolve({ success: true, path: outputPath, format: outputFormat, engine: 'localNcnn' });
          } else {
            let buffer;
            try {
              buffer = fs.readFileSync(outputPath);
            } catch(e) {
              return reject(new Error(`Failed to read output file: ${e.message}`));
            }
            try { fs.unlinkSync(outputPath); } catch(e) {}
            resolve({ success: true, base64: buffer.toString('base64'), format: outputFormat });
          }
        } else {
          // If NCNN fails, try falling back to the Sharp upscaler as a last resort!
          fileLog(`[upscale-local-ncnn] Local NCNN upscaling failed (exit code ${code}). Attempting emergency Sharp fallback...`);
          try {
            await upscaleLocalHighFidelitySharp(inputPath, outputPath, scale, outputFormat);
            if (saveDir) {
              resolve({ success: true, path: outputPath, format: outputFormat, engine: 'localSharpFallback' });
            } else {
              const buffer = fs.readFileSync(outputPath);
              fs.unlinkSync(outputPath);
              resolve({ success: true, base64: buffer.toString('base64'), format: outputFormat });
            }
          } catch (sharpErr) {
            reject(new Error(`Upscaler failed (exit code ${code}) and Sharp fallback failed: ${sharpErr.message}. Details: ${errOutput.trim()}`));
          }
        }
      });
      
      proc.on('error', async (err) => {
        // Clean up temp resized file
        if (tempResizedPath && fs.existsSync(tempResizedPath)) {
          try {
            fs.unlinkSync(tempResizedPath);
          } catch (e) {}
        }
        
        // If execution errors out (e.g. executable not runnable), try Sharp fallback!
        fileLog(`[upscale-local-ncnn] Execution error: ${err.message}. Attempting emergency Sharp fallback...`);
        try {
          await upscaleLocalHighFidelitySharp(inputPath, outputPath, scale, outputFormat);
          if (saveDir) {
            resolve({ success: true, path: outputPath, format: outputFormat, engine: 'localSharpFallback' });
          } else {
            const buffer = fs.readFileSync(outputPath);
            fs.unlinkSync(outputPath);
            resolve({ success: true, base64: buffer.toString('base64'), format: outputFormat });
          }
        } catch (sharpErr) {
          reject(new Error(`Execution error: ${err.message} and Sharp fallback failed: ${sharpErr.message}`));
        }
      });
    });
  } catch (error) {
    fileLog('[upscale-local-ncnn] Error:', error.message);
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
    exiftoolInstance = new ExifTool({ maxProcs: 2, taskTimeoutMillis: 5000 });
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

const FTP_STREAM_HWM = 2 * 1024 * 1024; // 2MB read-buffer per stream for maximum throughput over high latency
const POOL_IDLE_TTL  = 300_000;          // close pool after 5 mins of inactivity

// pool: Map<cacheKey, { type, clients: Client[], idleTimer, busy }>
const ftpPool = new Map();

// track jobs that the user has cancelled
global.cancelledFtpJobs = new Set();

// Concurrency control variables for dynamic throttle
let activeUploads = 0;
const uploadWaiters = [];

function wakeAllUploadWaiters() {
  while (uploadWaiters.length > 0) {
    const resolve = uploadWaiters.shift();
    if (resolve) resolve();
  }
}

global.uploadConcurrency = 3;

async function acquireUploadSlot(host) {
  while (true) {
    const currentMax = Math.min(global.uploadConcurrency || 3, getWorkerLimit(host));
    if (activeUploads < currentMax) {
      activeUploads++;
      return;
    }
    await new Promise(resolve => uploadWaiters.push(resolve));
  }
}

function releaseUploadSlot() {
  activeUploads = Math.max(0, activeUploads - 1);
  if (uploadWaiters.length > 0) {
    const next = uploadWaiters.shift();
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
        continue;
      }

      let finalTitleToSave = '';
      let finalKeywordsToSave = '';
      let finalCategoryToSave = '';

      // ── AUTOMATIC METADATA SCAN & FORMAT CORRECTION (Red Dot Prevention) ──
      try {
        const ext = path.extname(filePath).toLowerCase();
        // Only process common formats we can write metadata to (jpg, jpeg, png, eps, webp, tiff)
        if (['.jpg', '.jpeg', '.png', '.eps', '.webp', '.tiff'].includes(ext)) {
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
          } else {
            fileLog(`[upload-metadata] File ${fileName} has no metadata. Uploading as-is without adding metadata.`);
          }
        }
      } catch (metadataErr) {
        fileLog('[upload-metadata error] Failed to process metadata:', metadataErr);
      }

      // Acquire concurrency slot first
      await acquireUploadSlot(config.host);

      // Check cancellation again
      if (jobId && global.cancelledFtpJobs.has(jobId)) {
        releaseUploadSlot();
        fileErrors[filePath] = 'Cancelled by user';
        continue;
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
              const stat = await slot.client.stat(`/${fileName}`);
              remoteSize = stat.size;
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
              await slot.client.fastPut(filePath, `/${attemptName}`, {
                concurrency: 64,
                chunkSize: 64 * 1024,
                step: (transferred, chunk, total) => {
                  if (jobId && global.cancelledFtpJobs.has(jobId)) {
                    throw new Error('Cancelled by user');
                  }
                  total_transferred = transferred;
                  const p = Math.round((transferred / total) * 100);
                  if (event && !event.sender.isDestroyed()) {
                    event.sender.send('ftp-progress', { filePath, progress: p, host: config.host });
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
            const stat = await slot.client.stat(`/${finalRemoteName}`);
            verifySize = stat.size;
          }
          fileLog(`[upload-${type}] Verified remote file ${finalRemoteName} size: ${verifySize}/${fileSize} bytes`);
        } catch (sizeErr) {
          fileLog(`[upload-${type}] Size verification could not retrieve size for ${finalRemoteName}: ${sizeErr.message}`);
          verifySize = fileSize; 
        }

        if (verifySize !== fileSize) {
          throw new Error(`Upload verification mismatch: expected ${fileSize} bytes, remote has ${verifySize} bytes`);
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
        releaseUploadSlot();     // always release concurrency slot so other waiting workers can proceed
      }
    }
  });

  await Promise.all(workers);

  // Generate CSV for Adobe Stock
  let generatedCsvPath = null;
  if (successfulAdobeUploads.length > 0 && validPaths.length > 0) {
    try {
      const folderPath = path.dirname(validPaths[0]);
      const csvName = `AdobeStock_Metadata_${Date.now()}.csv`;
      const csvPath = path.join(folderPath, csvName);
      
      const headers = ['Filename', 'Title', 'Keywords', 'Category', 'Releases'];
      const rows = [headers.join(',')];
      
      for (const item of successfulAdobeUploads) {
         const esc = (str) => `"${(str || '').replace(/"/g, '""')}"`;
         rows.push([
            item.filename,
            esc(item.title),
            esc(item.keywords),
            item.category || '',
            '' // Releases
         ].join(','));
      }
      
      fs.writeFileSync(csvPath, rows.join('\n'), 'utf8');
      generatedCsvPath = csvPath;
      fileLog(`[upload-${type}] Generated Adobe Stock CSV at: ${csvPath}`);
    } catch(err) {
      fileLog(`[upload-${type}] Failed to generate CSV: ${err.message}`);
    }
  }

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

// Colab Cloud GPU Engine Handlers
let colabWindow = null;
let colabScanInterval = null;
let activeColabUrl = null; // Track currently connected server URL

function scanFramesForGradioLink(webContents, onFound, onError) {
  if (!webContents || !webContents.mainFrame) return;
  
  const frames = webContents.mainFrame.framesInSubtree || [webContents.mainFrame];
  
  frames.forEach(frame => {
    if (!frame || typeof frame.executeJavaScript !== 'function') return;
    
    // Try to execute script in this frame to find links or printed text containing links or errors
    frame.executeJavaScript(`
      (() => {
        const bodyText = document.body ? document.body.innerText : '';
        
        // Check for specific Python/Kaggle errors
        if (bodyText.includes('AssertionError: Torch not compiled with CUDA enabled')) {
            return { type: 'error', message: 'Kaggle GPU Error: আপনার Public নোটবুকটি GPU দিয়ে সেভ করা নেই! దয়া করে আপনার Kaggle নোটবুকে গিয়ে Accelerator: GPU T4 x2 সিলেক্ট করে Save Version দিন।' };
        }
        if (bodyText.includes('OutOfMemoryError') || bodyText.includes('CUDA out of memory')) {
            return { type: 'error', message: 'GPU Out of Memory! সার্ভার রিস্টার্ট করুন।' };
        }
        
        const links = document.querySelectorAll('a');
        for (let a of links) {
          if (a.href && (a.href.includes('.gradio.live') || a.href.includes('ngrok-free.app') || a.href.includes('trycloudflare.com') || a.href.includes('loca.lt'))) {
            return { type: 'link', data: a.href };
          }
        }
        const match = bodyText.match(/https?:\\/\\/[a-zA-Z0-9-]+\\.(gradio\\.live|ngrok-free\\.app|trycloudflare\\.com|loca\\.lt)/);
        if (match) {
          return { type: 'link', data: match[0] };
        }
        return null;
      })()
    `).then(res => {
      if (res) {
        if (res.type === 'link') onFound(res.data);
        else if (res.type === 'error' && onError) onError(res.message);
      }
    }).catch(err => {
      // Suppress frame execution errors
    });
  });
}

ipcMain.handle('start-colab', async (event, url) => {
  if (colabWindow) {
    colabWindow.destroy(); // Bypass intercept to close old window completely
  }
  if (colabScanInterval) {
    clearInterval(colabScanInterval);
    colabScanInterval = null;
  }
  
  colabWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:colab'
    },
    title: 'Cloud GPU Engine (Colab)'
  });

  colabWindow.setMenu(null);
  colabWindow.loadURL(url);

  // Intercept the close event to hide the window instead of destroying it
  colabWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      colabWindow.hide();
      fileLog('[Colab] Log window hidden by user close request.');
    }
  });

  // Inject observer to find gradio link and auto-click Run All in the main frame
  colabWindow.webContents.on('did-finish-load', () => {
    // Show window briefly so keyboard events work, then auto-hide after 5s if not needing login
    colabWindow.showInactive();
    
    // Send Ctrl+F9 after page settles (only works when window is visible)
    setTimeout(() => {
      if (!colabWindow || colabWindow.isDestroyed()) return;
      fileLog('[Colab] Sending Ctrl+F9 Run All keyboard shortcut');
      colabWindow.focus();
      colabWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F9', modifiers: ['control'] });
      setTimeout(() => {
        if (colabWindow && !colabWindow.isDestroyed()) {
          colabWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F9', modifiers: ['control'] });
        }
      }, 200);
    }, 3500);

    // 2. Run deep DOM search polling in the page
    colabWindow.webContents.executeJavaScript(`
      (function() {
        if (window.__colabAutoRunStarted) return;
        window.__colabAutoRunStarted = true;

        console.log("[AutoRun] Injecting deep search script for Shadow DOM");

        function findElementDeep(root, predicate) {
          if (!root) return null;
          if (predicate(root)) return root;
          
          // Check shadowRoot
          if (root.shadowRoot) {
            const found = findElementDeep(root.shadowRoot, predicate);
            if (found) return found;
          }
          
          // Check children
          const children = root.children || [];
          for (let i = 0; i < children.length; i++) {
            const found = findElementDeep(children[i], predicate);
            if (found) return found;
          }
          return null;
        }

        // Observe for the generated link
        if (!window.__colabObserver) {
          window.__colabObserver = new MutationObserver((mutations) => {
            const links = document.querySelectorAll('a');
            for (let a of links) {
              if (a.href && (a.href.includes('.gradio.live') || a.href.includes('ngrok-free.app') || a.href.includes('trycloudflare.com') || a.href.includes('loca.lt'))) {
                document.title = "GRADIO_LINK:" + a.href;
              }
            }
          });
          window.__colabObserver.observe(document.body, { childList: true, subtree: true });
        }

        // Check if user is logged out (Sign in button exists)
        const isLoggedOut = document.body.innerText.includes('Sign in') || document.querySelector('a[href*="ServiceLogin"]') !== null;
        if (isLoggedOut) {
          return true; // Requires login
        }

        function clickElement(el) {
          try { el.focus(); } catch(e) {}
          try {
            el.click();
          } catch(e) {
            // Dispatch mouse events fallback
            const events = ['mousedown', 'mouseup', 'click'];
            events.forEach(name => {
              const ev = new MouseEvent(name, { bubbles: true, cancelable: true, view: window });
              el.dispatchEvent(ev);
            });
          }
        }

        // Poll every 2 seconds to search and click Run All, Connect & Run Anyway
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (attempts > 30) {
            clearInterval(interval);
            return;
          }

          // A. Find "Run anyway" button in the warning dialog
          const confirmBtn = findElementDeep(document.body, (el) => {
            const text = (el.textContent || '').trim().toLowerCase();
            const id = el.id || '';
            const label = (el.getAttribute && el.getAttribute('aria-label') || '').toLowerCase();
            return id === 'ok' || 
                   text === 'run anyway' || 
                   text.includes('run standard') || 
                   label.includes('run anyway') || 
                   (el.getAttribute && el.getAttribute('dialogaction') === 'ok') ||
                   (el.classList && el.classList.contains('ok-button'));
          });

          if (confirmBtn) {
            console.log("[AutoRun] Found confirmation dialog button, clicking it.");
            clickElement(confirmBtn);
          }

          // B. Find "Connect" button at the top right if disconnected
          const connectBtn = findElementDeep(document.body, (el) => {
            if (!el.tagName) return false;
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || '').trim().toLowerCase();
            return tag === 'colab-connect-button' || 
                   text === 'connect' || 
                   text === 'reconnect' ||
                   text.includes('connect to hosted') ||
                   (el.id && el.id.includes('connect'));
          });

          if (connectBtn) {
            const text = (connectBtn.textContent || '').trim().toLowerCase();
            if (text.includes('connect') || text.includes('reconnect')) {
              console.log("[AutoRun] Found Connect button, clicking it.");
              clickElement(connectBtn);
            }
          }

          // C. Find "Run All" toolbar button
          const runAllBtn = findElementDeep(document.body, (el) => {
            if (!el.tagName) return false;
            const tag = el.tagName.toLowerCase();
            const id = el.id || '';
            const label = (el.getAttribute && el.getAttribute('aria-label') || '').toLowerCase();
            const title = (el.title || '').toLowerCase();
            const text = (el.textContent || '').trim().toLowerCase();
            
            return tag === 'colab-run-button' ||
                   id === 'run-all' ||
                   label.includes('run all') ||
                   title.includes('run all') ||
                   text === 'run all' ||
                   (tag === 'paper-button' && text.includes('run all')) ||
                   (tag === 'button' && text.includes('run all')) ||
                   (el.classList && el.classList.contains('run-all'));
          });

          if (runAllBtn) {
            console.log("[AutoRun] Found Run All button, clicking it.");
            clickElement(runAllBtn);
          }

          // D. Check for GPU limit modal
          const gpuLimitText = findElementDeep(document.body, (el) => {
            const text = (el.textContent || '').trim().toLowerCase();
            return text.includes('cannot connect to gpu backend') || text.includes('usage limits in colab');
          });

          if (gpuLimitText) {
            console.log("[AutoRun] GPU Limit detected!");
            document.title = 'GPU_LIMIT_REACHED';
          }
        }, 2000);

        return false;
      })();
    `).then(isLoggedOut => {
      if (isLoggedOut) {
        fileLog('[Colab] User needs to login. Showing window for login.');
        colabWindow.show(); // Keep visible for login
      } else {
        fileLog('[Colab] User is logged in. Auto-running; will hide window in 6s.');
        // Hide after 6 seconds (keyboard event + DOM clicker had time to run)
        setTimeout(() => {
          if (colabWindow && !colabWindow.isDestroyed() && !colabWindow.isVisible()) return;
          if (colabWindow && !colabWindow.isDestroyed()) {
            colabWindow.hide();
            fileLog('[Colab] Auto-hidden after run trigger.');
          }
        }, 6000);
      }
    }).catch(err => fileLog('[Colab] Inject Error:', err.message));
  });

  // Keep track of active pings and connection state
  const activePings = new Set();
  let successfulLink = null;

  // Watch for main page title updates (fallback)
  colabWindow.on('page-title-updated', (e, title) => {
    if (title === 'GPU_LIMIT_REACHED') {
      fileLog('[Colab] GPU Limit Reached detected from page.');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('colab-status', { status: 'gpu-limit' });
      }
      return;
    }

    if (title.startsWith('GRADIO_LINK:')) {
      const link = title.replace('GRADIO_LINK:', '').trim();
      if (successfulLink) return;
      if (activePings.has(link)) return;

      activePings.add(link);
      fileLog('[Colab] Found potential link via title, testing:', link);

      fetch(link.replace(/\/$/, '') + '/system_stats', {
        headers: { 'bypass-tunnel-reminder': 'true' },
        signal: AbortSignal.timeout(5000)
      }).then(res => {
        if (res.ok) {
          fileLog('[Colab] Verified live link via title:', link);
          successfulLink = link;
          activeColabUrl = link;
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
        }
      }).catch(err => {
        fileLog('[Colab] Link from title ping failed (will retry):', link, err.message);
      }).finally(() => {
        activePings.delete(link);
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
    
    scanFramesForGradioLink(colabWindow.webContents, (link) => {
      if (successfulLink) return;
      if (activePings.has(link)) return;

      activePings.add(link);
      fileLog('[Colab] Found potential link via frame scan, testing:', link);
      
      // Ping the server to verify it's alive and responsive
      fetch(link.replace(/\/$/, '') + '/system_stats', {
        headers: { 'bypass-tunnel-reminder': 'true' },
        signal: AbortSignal.timeout(5000)
      }).then(res => {
        if (res.ok) {
          fileLog('[Colab] Verified live link via frame scan:', link);
          successfulLink = link;
          activeColabUrl = link;
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
        }
      }).catch(err => {
        fileLog('[Colab] Link from frame scan ping failed (will retry):', link, err.message);
      }).finally(() => {
        activePings.delete(link);
      });
    }, (errorMsg) => {
      fileLog('[Colab] Frame scan error:', errorMsg);
      if (errorMsg === 'gpu-limit') {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('colab-status', { status: 'gpu-limit' });
      } else {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('colab-status', { status: 'disconnected', error: errorMsg });
      }
      if (colabScanInterval) {
        clearInterval(colabScanInterval);
        colabScanInterval = null;
      }
    });
  }, 3000);

  colabWindow.on('closed', () => {
    fileLog('[Colab] Window fully closed (destroy called).');
    if (colabScanInterval) {
      clearInterval(colabScanInterval);
      colabScanInterval = null;
    }
    colabWindow = null;
    // Only send disconnected if NOT already connected (stop-colab was called intentionally)
    if (mainWindow && !mainWindow.isDestroyed() && !successfulLink) {
      activeColabUrl = null;
      mainWindow.webContents.send('colab-status', { status: 'disconnected' });
    }
  });

  return { success: true };
});

ipcMain.handle('get-colab-url', async () => {
  return { url: activeColabUrl };
});

ipcMain.handle('start-kaggle', async (event, url) => {
  if (colabWindow) {
    colabWindow.destroy(); 
  }
  if (colabScanInterval) {
    clearInterval(colabScanInterval);
    colabScanInterval = null;
  }
  
  colabWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:colab' // Share same partition so it doesn't need double login
    },
    title: 'Kaggle Fallback GPU Engine'
  });

  colabWindow.setMenu(null);
  
  // Intercept window close
  colabWindow.on('close', (e) => {
    if (!colabWindow) return;
    e.preventDefault();
    colabWindow.hide();
    fileLog('[Kaggle] Window hidden by user close request.');
  });

  colabWindow.loadURL(url);

  colabWindow.webContents.on('did-finish-load', () => {
    const currentUrl = colabWindow.webContents.getURL();
    if (currentUrl === 'https://www.kaggle.com/' || currentUrl === 'https://www.kaggle.com') {
      fileLog('[Kaggle] Ended up on home page, redirecting back to notebook...');
      colabWindow.loadURL(url);
      return;
    }

    colabWindow.webContents.executeJavaScript(`
      (() => {
        function findElementDeep(root, predicate) {
          if (!root) return null;
          if (predicate(root)) return root;
          let node = root.firstElementChild;
          while (node) {
            let res = findElementDeep(node, predicate);
            if (res) return res;
            node = node.nextElementSibling;
          }
          if (root.shadowRoot) {
            let res = findElementDeep(root.shadowRoot, predicate);
            if (res) return res;
          }
          return null;
        }

        const isLoggedOut = document.body.innerText.includes('Sign In') || 
                            document.body.innerText.includes('Register') || 
                            document.title === 'Kaggle: Your Home for Data Science' ||
                            window.location.pathname.includes('/account/login');

        if (isLoggedOut) {
          if (!window.location.pathname.includes('/account/login')) {
            window.location.href = 'https://www.kaggle.com/account/login?returnUrl=' + encodeURIComponent(window.location.pathname + window.location.search);
          }
          return true;
        }

        function clickElement(el) {
          try { el.click(); } catch(e) {}
        }

        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (attempts > 30) {
            clearInterval(interval);
            return;
          }

          // If we are on the View page (URL doesn't end with /edit), look for "Copy & Edit" or "Edit"
          if (!window.location.pathname.includes('/edit')) {
            const editBtn = findElementDeep(document.body, (el) => {
              if (!el.tagName) return false;
              const text = (el.textContent || '').trim().toLowerCase();
              return el.tagName === 'BUTTON' && (text === 'copy & edit' || text === 'edit' || text === 'edit notebook');
            });
            if (editBtn) {
              console.log("[AutoRun] Kaggle Edit button found! Forking/Editing...");
              clickElement(editBtn);
            }
          } else {
            // We are on the Editor page, look for "Run All"
            const runAllBtn = findElementDeep(document.body, (el) => {
              if (!el.tagName) return false;
              const text = (el.textContent || '').trim().toLowerCase();
              const title = (el.title || '').toLowerCase();
              const aria = (el.getAttribute && el.getAttribute('aria-label') || '').toLowerCase();
              return (el.tagName === 'BUTTON' && (text === 'run all' || title.includes('run all') || aria.includes('run all')));
            });

            if (runAllBtn) {
              console.log("[AutoRun] Kaggle Run All button found!");
              clickElement(runAllBtn);
            }
          }

          // Check if Kaggle GPU quota exceeded (30h limit)
          const limitText = findElementDeep(document.body, (el) => {
            const text = (el.textContent || '').trim().toLowerCase();
            return text.includes('quota exceeded') || text.includes('exceeded your gpu quota');
          });

          if (limitText) {
            document.title = 'KAGGLE_LIMIT_REACHED';
          }
        }, 2500);

        return false;
      })();
    `).then(isLoggedOut => {
      if (isLoggedOut) {
        fileLog('[Kaggle] User needs to login.');
        colabWindow.show();
      } else {
        fileLog('[Kaggle] User is logged in. Auto-running...');
        setTimeout(() => {
          if (colabWindow && !colabWindow.isDestroyed()) colabWindow.hide();
        }, 8000);
      }
    }).catch(err => fileLog('[Kaggle] Inject Error:', err.message));
  });

  const activePings = new Set();
  let successfulLink = null;

  colabWindow.on('page-title-updated', (e, title) => {
    if (title === 'KAGGLE_LIMIT_REACHED') {
      fileLog('[Kaggle] GPU Limit Reached.');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('colab-status', { status: 'disconnected', error: 'Kaggle GPU Quota Exceeded' });
      }
      return;
    }
  });

  colabScanInterval = setInterval(() => {
    if (!colabWindow || colabWindow.isDestroyed()) return;
    scanFramesForGradioLink(colabWindow.webContents, (link) => {
      if (successfulLink) return;
      if (activePings.has(link)) return;

      activePings.add(link);
      fileLog('[Kaggle] Found link via frame scan:', link);

      fetch(link.replace(/\/$/, '') + '/system_stats', {
        headers: { 'bypass-tunnel-reminder': 'true' },
        signal: AbortSignal.timeout(5000)
      }).then(res => {
        if (res.ok) {
          fileLog('[Kaggle] Verified link:', link);
          successfulLink = link;
          activeColabUrl = link;
          if (colabScanInterval) {
            clearInterval(colabScanInterval);
            colabScanInterval = null;
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('colab-status', { status: 'connected', url: link });
          }
          if (colabWindow) colabWindow.hide();
        }
      }).catch(() => {}).finally(() => activePings.delete(link));
    });
  }, 3000);

  colabWindow.on('closed', () => {
    if (colabScanInterval) {
      clearInterval(colabScanInterval);
      colabScanInterval = null;
    }
    colabWindow = null;
    if (mainWindow && !mainWindow.isDestroyed() && !successfulLink) {
      activeColabUrl = null;
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
    colabWindow.destroy(); // Destroy window directly to bypass hide interceptor
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

ipcMain.handle('fetch-image', async (event, url) => {
  try {
    fileLog('[fetch-image] Fetching URL:', url);
    const res = await fetch(url);
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


