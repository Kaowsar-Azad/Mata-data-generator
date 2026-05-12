import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const app = express();
const port = 3001;

// Enable CORS for Vite frontend
app.use(cors());

// Configure multer for temp file uploads
const upload = multer({ dest: os.tmpdir() });

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

app.listen(port, () => {
  console.log(`\n========================================`);
  console.log(`✅ EPS Processing Backend running on port ${port}`);
  console.log(`========================================\n`);
});
