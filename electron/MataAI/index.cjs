const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');

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
  } else if (outputFormat === 'webp') {
    await pipeline.webp({ quality: 95 }).toFile(outputPath);
  } else {
    await pipeline.jpeg({ quality: 95, mozjpeg: true }).toFile(outputPath);
  }

  fileLog('[Mata AI Sharp Fallback] Done: ' + outputPath);
}

// ─────────────────────────────────────────────
// IPC HANDLER: upscale-local-ncnn
// ─────────────────────────────────────────────
let activeUpscaleProc = null;

function setupMataAi(ipcMain, fileLog) {
  ipcMain.handle('cancel-upscale-local-ncnn', () => {
    if (activeUpscaleProc) {
      try {
        fileLog('[Mata AI] Canceling active upscale process (PID: ' + activeUpscaleProc.pid + ')');
        activeUpscaleProc.killedByCancel = true;
        activeUpscaleProc.kill('SIGKILL');
      } catch (err) {
        fileLog('[Mata AI] Error killing process: ' + err.message);
      }
      activeUpscaleProc = null;
    }
  });

  ipcMain.handle('toggle-devtools', (event) => {
    try {
      const { BrowserWindow } = require('electron');
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.webContents.toggleDevTools();
        return true;
      }
    } catch (e) {
      fileLog('[toggle-devtools] error: ' + e.message);
    }
    return false;
  });

  ipcMain.handle('upscale-local-ncnn', async (event, inputPath, scale, modelName, format, saveDir, customSuffix) => {
    modelName = modelName || 'realesrgan-x4plus';
    format    = format    || 'jpg';
    saveDir   = saveDir   || null;

    try {
      fileLog('[upscale-local-ncnn] model=' + modelName + '  scale=' + scale + 'x  fmt=' + format + (customSuffix ? '  suffix=' + customSuffix : ''));

      const parsedPath   = path.parse(inputPath);
      const outputFormat = format === 'jpeg' ? 'jpg' : format;

      const { app } = require('electron');
      const appRootDir = app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, '..', '..');
      const binDir = path.join(appRootDir, 'bin', 'upscayl');

      const isUpscaylBin = fs.existsSync(path.join(binDir, 'upscayl-bin.exe'));
      const exeName      = isUpscaylBin ? 'upscayl-bin.exe' : 'realesrgan-ncnn-vulkan.exe';
      const exePath      = path.join(binDir, exeName);

      const suffixToUse = customSuffix || modelName;
      const filenameSuffix = suffixToUse.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const outputPath = saveDir
        ? path.join(saveDir, parsedPath.name + '_' + scale + 'x_' + filenameSuffix + '.' + outputFormat)
        : path.join(os.tmpdir(), parsedPath.name + '_upscaled_' + scale + 'x.' + outputFormat);

      const outDir = path.dirname(outputPath);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

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
      // NCNN PATH — With multi-engine support
      // (upscayl-bin, span-ncnn-vulkan, realsr-ncnn-vulkan)
      // ═══════════════════════════════════════════════
      let activeExePath = path.resolve(exePath);
      let activeCwd = path.resolve(binDir);
      let activeModelsDir = path.resolve(binDir, 'models');
      let isSpan = false;
      let isRealSR = false;

      const spanExePath = path.resolve(appRootDir, 'bin', 'span', 'span-ncnn-vulkan.exe');
      const realsrExePath = path.resolve(appRootDir, 'bin', 'realsr', 'realsr-ncnn-vulkan.exe');

      if ((modelName === 'span' || modelName === 'span_nomos') && fs.existsSync(spanExePath)) {
        activeExePath = spanExePath;
        activeCwd = path.resolve(appRootDir, 'bin', 'span');
        activeModelsDir = path.resolve(appRootDir, 'bin', 'span', 'models');
        isSpan = true;
      } else if ((modelName === 'realsr' || modelName === 'bsrgan' || modelName === 'realsr_photo') && fs.existsSync(realsrExePath)) {
        activeExePath = realsrExePath;
        activeCwd = path.resolve(appRootDir, 'bin', 'realsr');
        activeModelsDir = path.resolve(appRootDir, 'bin', 'realsr', 'models-DF2K_JPEG');
        isRealSR = true;
      }

      if (!fs.existsSync(activeExePath)) {
        throw new Error('Upscaler engine not found: ' + activeExePath);
      }

      const finalInputPath  = inputPath;

      // Tile size: 256 ensures zero-crash stability and high GPU throughput on Intel UHD & laptop GPUs
      let tileSize = '256';
      if (isRealSR) {
        tileSize = '128'; // RealSR has deep residual blocks; 128 ensures 100% stability on Intel UHD GPUs without VRAM crash
      }
      // Multi-thread pipeline: 1 loader, 1 GPU inference, 1 save (prevents CPU/GPU thread saturation)
      const threadArgs = ['-j', '1:1:1'];

      let args;
      if (isSpan) {
        const clampedScale = Math.min(4, Math.max(2, parseInt(scale) || 2));
        const spanModelName = clampedScale === 2 ? 'spanx2_ch48' : 'spanx4_ch48';
        args = [
          '-i', finalInputPath,
          '-o', outputPath,
          '-s', clampedScale.toString(),
          '-m', activeModelsDir,
          '-n', spanModelName,
          '-f', outputFormat,
          '-t', tileSize,
          ...threadArgs,
          '-v',
        ];
      } else if (isRealSR) {
        args = [
          '-i', finalInputPath,
          '-o', outputPath,
          '-s', '4',
          '-m', activeModelsDir,
          '-f', outputFormat,
          '-t', tileSize,
          ...threadArgs,
          '-v',
        ];
      } else {
        let finalModelName = modelName;
        let modelScale = 4;
        if (modelName === 'realesr-animevideov3' || modelName === 'realesr-general-x4v3') {
          const clampedScale = Math.min(4, Math.max(2, parseInt(scale)));
          finalModelName = 'realesr-animevideov3-x' + clampedScale;
          modelScale     = clampedScale;
        }

        if (isUpscaylBin) {
          args = [
            '-i', finalInputPath,
            '-o', outputPath,
            '-z', modelScale.toString(),
            '-s', scale.toString(),
            '-m', activeModelsDir,
            '-n', finalModelName,
            '-f', outputFormat,
            '-t', tileSize,
            ...threadArgs,
            '-v',
          ];
        } else {
          args = [
            '-i', finalInputPath,
            '-o', outputPath,
            '-s', scale.toString(),
            '-m', activeModelsDir,
            '-n', finalModelName,
            '-f', outputFormat,
            '-t', tileSize,
            ...threadArgs,
            '-v',
          ];
        }
      }

      fileLog('[upscale-local-ncnn] Active Engine: ' + path.basename(activeExePath) + ' [TileSize: ' + tileSize + ']');

      return new Promise((resolve, reject) => {
        const spawnEnv = {
          ...process.env,
          // Prioritize Dedicated High-Performance GPU on laptops (NVIDIA & AMD)
          VK_LAYER_NV_optimus: '1',
          DISABLE_LAYER_AMD_SWITCHABLE_GRAPHICS_1: '1',
          SHIM_MCCOMPAT: '0x000000001',
          __NV_PRIME_RENDER_OFFLOAD: '1',
          __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
          // CPU / Thread optimizations — Leave at least 2 CPU cores free for Windows & Electron UI
          OMP_NUM_THREADS: String(Math.max(1, (os.cpus().length || 4) - 2)),
          OMP_WAIT_POLICY: 'PASSIVE',                   // Efficient CPU thread management (no busy-spin starvation)
        };

        const proc = spawn(activeExePath, args, { cwd: activeCwd, env: spawnEnv });
        activeUpscaleProc = proc;

        // Set BELOW_NORMAL Priority to protect Windows OS, Electron UI, and mouse from freezing/lagging
        try {
          if (proc.pid && typeof os.setPriority === 'function') {
            const priorityLevel = os.constants.priority.PRIORITY_BELOW_NORMAL !== undefined 
              ? os.constants.priority.PRIORITY_BELOW_NORMAL 
              : 10;
            os.setPriority(proc.pid, priorityLevel);
            fileLog('[upscale-local-ncnn] Set Windows OS Priority to BELOW_NORMAL (protecting UI smoothness) for PID: ' + proc.pid);
          }
        } catch (pErr) {
          fileLog('[upscale-local-ncnn] Priority allocation note: ' + pErr.message);
        }

        let errOutput = '';
        let lastProgressTime = 0;
        let maxFileProgress = 0;

        const handleData = (data) => {
          const str = data.toString();
          errOutput += str;
          const lines = str.split(/[\r\n]+/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (/^\d+(?:\.\d+)?%$/.test(trimmed)) {
              const progressVal = parseFloat(trimmed);
              // Monotonic check: Ensure progress only moves forward and never drops/resets
              if (progressVal > maxFileProgress) {
                maxFileProgress = progressVal;
                const now = Date.now();
                if (now - lastProgressTime > 60 || maxFileProgress >= 100) {
                  lastProgressTime = now;
                  try {
                    if (event && !event.sender.isDestroyed()) {
                      event.sender.send('upscale-progress', { filePath: inputPath, progress: maxFileProgress });
                    }
                  } catch (_) {}
                }
              }
            }
          }
        };

        proc.stdout.on('data', handleData);
        proc.stderr.on('data', handleData);

        proc.on('close', async (code) => {
          const wasCancelled = proc.killedByCancel;
          if (activeUpscaleProc === proc) activeUpscaleProc = null;
          try {
            if (event && !event.sender.isDestroyed()) {
              event.sender.send('upscale-progress', { filePath: inputPath, progress: 100 });
            }
          } catch (_) {}

          if (wasCancelled) {
            fileLog('[upscale-local-ncnn] Process was cancelled by user. Skipping fallback.');
            return resolve({ success: false, cancelled: true, error: 'Cancelled by user' });
          }

          let fileCreated = fs.existsSync(outputPath);

          // Cleanup accidental duplicates created by buggy NCNN wrappers (e.g. creating .png when requested .jpg)
          try {
            const baseWithoutExt = outputPath.substring(0, outputPath.lastIndexOf('.'));
            const extensions = ['.jpg', '.png', '.webp', '.jpeg'];
            for (const ext of extensions) {
              const altPath = baseWithoutExt + ext;
              if (altPath !== outputPath && fs.existsSync(altPath)) {
                if (fileCreated) {
                  fs.unlinkSync(altPath); // Delete unwanted duplicate
                  fileLog('[upscale-local-ncnn] Deleted unwanted duplicate format: ' + altPath);
                } else {
                  // NCNN only created the wrong format. Convert it to requested format.
                  fileLog('[upscale-local-ncnn] NCNN ignored extension, converting ' + ext + ' to ' + outputFormat + '...');
                  if (outputFormat === 'jpg' || outputFormat === 'jpeg') {
                    await sharp(altPath).jpeg({ quality: 95 }).toFile(outputPath);
                  } else if (outputFormat === 'webp') {
                    await sharp(altPath).webp({ quality: 95 }).toFile(outputPath);
                  } else {
                    await sharp(altPath).png({ compressionLevel: 6 }).toFile(outputPath);
                  }
                  fs.unlinkSync(altPath);
                  fileCreated = true;
                }
              }
            }
          } catch (cleanupErr) {
            fileLog('[upscale-local-ncnn] Duplicate cleanup error: ' + cleanupErr.message);
          }

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
            // Target scale dimension adjustment (e.g. RealSR running at 4x for 2x target, or Custom 6x/8x)
            try {
              const inMeta = await sharp(inputPath).metadata();
              const targetW = Math.round(inMeta.width * scale);
              const targetH = Math.round(inMeta.height * scale);
              const outMeta = await sharp(outputPath).metadata();
              if (Math.abs(outMeta.width - targetW) > 2 || Math.abs(outMeta.height - targetH) > 2) {
                fileLog('[upscale-local-ncnn] Dimension adjustment to target: ' + outMeta.width + 'x' + outMeta.height + ' -> ' + targetW + 'x' + targetH);
                const tmpResize = outputPath + '.res.tmp';
                if (outputFormat === 'png') {
                  await sharp(outputPath).resize(targetW, targetH, { kernel: sharp.kernel.lanczos3 }).png({ compressionLevel: 6 }).toFile(tmpResize);
                } else if (outputFormat === 'webp') {
                  await sharp(outputPath).resize(targetW, targetH, { kernel: sharp.kernel.lanczos3 }).webp({ quality: 95 }).toFile(tmpResize);
                } else {
                  await sharp(outputPath).resize(targetW, targetH, { kernel: sharp.kernel.lanczos3 }).jpeg({ quality: 95 }).toFile(tmpResize);
                }
                fs.unlinkSync(outputPath);
                fs.renameSync(tmpResize, outputPath);
              }
            } catch (dimErr) {
              fileLog('[upscale-local-ncnn] Dimension adjustment note: ' + dimErr.message);
            }



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
          const wasCancelled = proc.killedByCancel;
          if (activeUpscaleProc === proc) activeUpscaleProc = null;
          
          if (wasCancelled) {
            fileLog('[upscale-local-ncnn] Process was cancelled by user on error event. Skipping fallback.');
            return resolve({ success: false, cancelled: true, error: 'Cancelled by user' });
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
