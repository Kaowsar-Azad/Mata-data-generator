const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');

// ─────────────────────────────────────────────
// UTILITY: Intel GPU Detection (for fallback)
// ─────────────────────────────────────────────
function detectIntelGPU() {
  try {
    const { execSync } = require('child_process');
    const stdout = execSync('wmic path win32_VideoController get name', { timeout: 3000 }).toString();
    return stdout.toLowerCase().includes('intel');
  } catch (e) {
    return false;
  }
}

// ─────────────────────────────────────────────
// UTILITY: Detect Vector / Anime content
// ─────────────────────────────────────────────
function isVectorOrAnimeFile(filePath) {
  const name = (filePath || '').toLowerCase();
  return (
    name.includes('anime')        ||
    name.includes('vector')       ||
    name.includes('cartoon')      ||
    name.includes('illustration') ||
    name.includes('illust')       ||
    name.includes('drawing')      ||
    name.includes('art')          ||
    name.includes('clip')         ||
    name.includes('graphic')      ||
    name.endsWith('.svg')         ||
    name.endsWith('.ai')          ||
    name.endsWith('.eps')
  );
}

// ─────────────────────────────────────────────
// LAYER 1: Smart Pre-Processing
// Resize large images before NCNN to reduce GPU time.
// NCNN will still 4x; we size input so output ~ origW * scale.
// ─────────────────────────────────────────────
const PRE_RESIZE_THRESHOLD = 1500; // longest side in px — pre-resize aggressively for speed

async function smartPreProcess(inputPath, scale, fileLog) {
  const meta = await sharp(inputPath).metadata();
  const longestSide = Math.max(meta.width, meta.height);

  if (longestSide <= PRE_RESIZE_THRESHOLD) {
    return { path: inputPath, tempPath: null };
  }

  // Feed size so that NCNN 4x output === origSize * scale
  const targetFeedW = Math.round(meta.width  * scale / 4);
  const targetFeedH = Math.round(meta.height * scale / 4);

  if (targetFeedW >= meta.width && targetFeedH >= meta.height) {
    return { path: inputPath, tempPath: null };
  }

  const tempPath = inputPath + '.mata_pre.tmp.png';
  fileLog('[Mata AI] Pre-process: ' + meta.width + 'x' + meta.height + ' -> ' + targetFeedW + 'x' + targetFeedH + ' before NCNN');

  await sharp(inputPath)
    .resize(targetFeedW, targetFeedH, {
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false,
      withoutEnlargement: false,
    })
    .png()
    .toFile(tempPath);

  fileLog('[Mata AI] Pre-process done. Temp: ' + tempPath);
  return { path: tempPath, tempPath };
}



// ─────────────────────────────────────────────
// Sharp Fallback Upscaler
// ─────────────────────────────────────────────
async function upscaleLocalHighFidelitySharp(inputPath, outputPath, scale, outputFormat, fileLog) {
  fileLog('[Mata AI Sharp Fallback] ' + path.basename(inputPath) + ' -> ' + scale + 'x');

  const meta = await sharp(inputPath).metadata();
  const targetW = Math.round(meta.width  * scale);
  const targetH = Math.round(meta.height * scale);

  let pipeline = sharp(inputPath)
    .resize(targetW, targetH, {
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false,
      withoutEnlargement: false,
    })
    .sharpen({ sigma: 1.0, m1: 1.5, m2: 0.5, x1: 2.0, y2: 1.0, y3: 2.0 });

  if (outputFormat === 'png') {
    await pipeline.png({ compressionLevel: 6 }).toFile(outputPath);
  } else {
    await pipeline.jpeg({ quality: 95, mozjpeg: true }).toFile(outputPath);
  }

  fileLog('[Mata AI Sharp Fallback] Done: ' + outputPath);
}

// ─────────────────────────────────────────────
// IPC HANDLER: upscale-local-ncnn
// ─────────────────────────────────────────────
function setupMataAi(ipcMain, fileLog) {
  ipcMain.handle('upscale-local-ncnn', async (event, inputPath, scale, modelName, format, saveDir) => {
    modelName = modelName || 'realesrgan-x4plus';
    format    = format    || 'jpg';
    saveDir   = saveDir   || null;

    try {
      fileLog('[upscale-local-ncnn] model=' + modelName + '  scale=' + scale + 'x  fmt=' + format);

      const parsedPath   = path.parse(inputPath);
      const outputFormat = format === 'jpeg' ? 'jpg' : format;

      const { app } = require('electron');
      const binDir = app.isPackaged
        ? path.join(process.resourcesPath, 'bin', 'upscayl')
        : path.join(__dirname, '..', '..', 'bin', 'upscayl');

      const isUpscaylBin = fs.existsSync(path.join(binDir, 'upscayl-bin.exe'));
      const exeName      = isUpscaylBin ? 'upscayl-bin.exe' : 'realesrgan-ncnn-vulkan.exe';
      const exePath      = path.join(binDir, exeName);

      const filenameSuffix = modelName.replace(/[^a-zA-Z0-9]/g, '_');
      const outputPath = saveDir
        ? path.join(saveDir, parsedPath.name + '_' + scale + 'x_' + filenameSuffix + '.' + outputFormat)
        : path.join(os.tmpdir(), parsedPath.name + '_upscaled_' + scale + 'x.' + outputFormat);

      const outDir = path.dirname(outputPath);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      if (modelName === 'auto_model_detect' || modelName === 'auto_detect') {
        const isAnimeOrVector = isVectorOrAnimeFile(inputPath);
        const name = path.basename(inputPath).toLowerCase();
        const is3dRender = 
          name.includes('3d') || name.includes('render') || name.includes('cgi') || 
          name.includes('unreal') || name.includes('octane') || name.includes('cinema4d');
        const hasFace = /person|portrait|face|human|man|woman|girl|boy|people|model|headshot|selfie/i.test(name);

        if (isAnimeOrVector) {
          fileLog('[Mata AI] Auto Model Detect -> Vector/Anime detected: using realesrgan-x4plus-anime.');
          modelName = 'realesrgan-x4plus-anime';
        } else if (is3dRender) {
          fileLog('[Mata AI] Auto Model Detect -> 3D Render detected: using realesrgan-x4plus.');
          modelName = 'realesrgan-x4plus';
        } else if (hasFace) {
          fileLog('[Mata AI] Auto Model Detect -> Portrait/Face detected: using remacri.');
          modelName = 'remacri';
        } else {
          fileLog('[Mata AI] Auto Model Detect -> Real Photo/General: using ultrasharp.');
          modelName = 'ultrasharp';
        }
      } else if (modelName === 'fast') {
        fileLog('[Mata AI] Fast selected -> using pure Sharp Lanczos3 (1-2s).');
        modelName = 'fast_sharp';
      } else if (modelName === 'balanced') {
        const name = path.basename(inputPath).toLowerCase();
        const hasFace = /person|portrait|face|human|man|woman|girl|boy|people|model|headshot|selfie/i.test(name);
        if (hasFace) {
          fileLog('[Mata AI] Balanced -> Face detected: using remacri.');
          modelName = 'remacri';
        } else {
          fileLog('[Mata AI] Balanced -> No face detected: using ultramix_balanced.');
          modelName = 'ultramix_balanced';
        }
      } else if (modelName === 'mata_ai_face') {
        fileLog('[Mata AI] Face detected! Routing to remacri for realistic human details.');
        modelName = 'remacri';
      } else if (modelName === 'mata_ai') {
        modelName = 'realesrgan-x4plus-anime';
      }

      if (modelName === 'fast_sharp') {
        fileLog('[Mata AI] Fast Mode selected! Bypassing NCNN and using pure Sharp Lanczos3 (no fake details, no cartoon effect, 2 seconds).');
        await upscaleLocalHighFidelitySharp(inputPath, outputPath, scale, outputFormat, fileLog);
        
        try {
          if (event && !event.sender.isDestroyed()) {
            event.sender.send('upscale-progress', { filePath: inputPath, progress: 100 });
          }
        } catch (_) {}

        if (saveDir) {
          return { success: true, path: outputPath, format: outputFormat, engine: 'fast_sharp' };
        } else {
          const buffer = fs.readFileSync(outputPath);
          try { fs.unlinkSync(outputPath); } catch (_) {}
          return { success: true, base64: buffer.toString('base64'), format: outputFormat };
        }
      }

      // ═══════════════════════════════════════════════
      // NCNN PATH — Only for explicit model selections
      // (ultrasharp, remacri, realesrgan-x4plus, etc.)
      // ═══════════════════════════════════════════════
      if (!fs.existsSync(exePath)) {
        throw new Error('Upscaler engine not found: ' + exePath);
      }

      const finalInputPath  = inputPath;
      const tempResizedPath = null;

      // Build NCNN args
      let finalModelName = modelName;
      let modelScale = 4;
      if (modelName === 'realesr-animevideov3') {
        const clampedScale = Math.min(4, Math.max(2, parseInt(scale)));
        finalModelName = 'realesr-animevideov3-x' + clampedScale;
        modelScale     = clampedScale;
      }

      // Tile size: 192 gives best GPU throughput on most cards (higher = more VRAM but faster)
      const tileSize = '192';

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
          '-t', tileSize,
          '-v',
        ];
      } else {
        args = [
          '-i', finalInputPath,
          '-o', outputPath,
          '-s', scale.toString(),
          '-m', 'models',
          '-n', finalModelName,
          '-f', outputFormat,
          '-t', tileSize,
          '-v',
        ];
      }

      fileLog('[upscale-local-ncnn] Engine: ' + (isUpscaylBin ? 'upscayl-bin' : 'realesrgan-ncnn-vulkan'));

      return new Promise((resolve, reject) => {
        const proc = spawn(exePath, args, { cwd: binDir });
        let errOutput = '';

        const handleData = (data) => {
          const str = data.toString();
          errOutput += str;
          const lines = str.split(/[\r\n]+/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (/^\d+(?:\.\d+)?%$/.test(trimmed)) {
              const progressVal = parseFloat(trimmed);
              try {
                if (event && !event.sender.isDestroyed()) {
                  event.sender.send('upscale-progress', { filePath: inputPath, progress: progressVal });
                }
              } catch (_) {}
            }
          }
        };

        proc.stdout.on('data', handleData);
        proc.stderr.on('data', handleData);

        proc.on('close', async (code) => {
          if (tempResizedPath && fs.existsSync(tempResizedPath)) {
            try { fs.unlinkSync(tempResizedPath); } catch (e) {
              fileLog('[Mata AI] Could not clean pre-process temp: ' + e.message);
            }
          }

          const fileCreated = fs.existsSync(outputPath);

          if (fileCreated) {
            // Fix RIFF/WebP -> JPG
            try {
              const fd = fs.openSync(outputPath, 'r');
              const header = Buffer.alloc(4);
              fs.readSync(fd, header, 0, 4, 0);
              fs.closeSync(fd);
              if (header.toString('ascii') === 'RIFF' && (outputFormat === 'jpg' || outputFormat === 'jpeg')) {
                fileLog('[upscale-local-ncnn] Detected RIFF/WebP -> converting to JPG...');
                const tmpP = outputPath + '.riff.tmp';
                await sharp(outputPath).jpeg({ quality: 95 }).toFile(tmpP);
                fs.unlinkSync(outputPath);
                fs.renameSync(tmpP, outputPath);
                fileLog('[upscale-local-ncnn] RIFF->JPG done.');
              }
            } catch (_) {}



            if (saveDir) {
              resolve({ success: true, path: outputPath, format: outputFormat, engine: 'localNcnn' });
            } else {
              let buffer;
              try { buffer = fs.readFileSync(outputPath); }
              catch (e) { return reject(new Error('Failed to read output: ' + e.message)); }
              try { fs.unlinkSync(outputPath); } catch (_) {}
              resolve({ success: true, base64: buffer.toString('base64'), format: outputFormat });
            }

          } else {
            fileLog('[upscale-local-ncnn] NCNN failed (code ' + code + '). Sharp fallback...');
            try {
              await upscaleLocalHighFidelitySharp(inputPath, outputPath, scale, outputFormat, fileLog);
              if (saveDir) {
                resolve({ success: true, path: outputPath, format: outputFormat, engine: 'localSharpFallback' });
              } else {
                const buffer = fs.readFileSync(outputPath);
                fs.unlinkSync(outputPath);
                resolve({ success: true, base64: buffer.toString('base64'), format: outputFormat });
              }
            } catch (sharpErr) {
              reject(new Error('NCNN (code ' + code + ') + Sharp fallback failed: ' + sharpErr.message + '. ' + errOutput.trim()));
            }
          }
        });

        proc.on('error', async (err) => {
          if (tempResizedPath && fs.existsSync(tempResizedPath)) {
            try { fs.unlinkSync(tempResizedPath); } catch (_) {}
          }
          fileLog('[upscale-local-ncnn] Spawn error: ' + err.message + '. Sharp fallback...');
          try {
            await upscaleLocalHighFidelitySharp(inputPath, outputPath, scale, outputFormat, fileLog);
            if (saveDir) {
              resolve({ success: true, path: outputPath, format: outputFormat, engine: 'localSharpFallback' });
            } else {
              const buffer = fs.readFileSync(outputPath);
              fs.unlinkSync(outputPath);
              resolve({ success: true, base64: buffer.toString('base64'), format: outputFormat });
            }
          } catch (sharpErr) {
            reject(new Error('Spawn error + Sharp fallback failed: ' + sharpErr.message));
          }
        });
      });

    } catch (error) {
      fileLog('[upscale-local-ncnn] Fatal error: ' + error.message);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupMataAi };
