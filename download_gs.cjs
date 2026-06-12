const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const url = 'https://ghproxy.net/https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10031/gs10031w64.exe';
const dest = path.join(__dirname, 'gs_installer.exe');
const targetBin = path.join(__dirname, 'bin');
const gsTempDir = path.join(targetBin, 'gs_temp');

async function downloadResumable(url, dest) {
  return new Promise((resolve, reject) => {
    let downloaded = 0;
    if (fs.existsSync(dest)) {
      downloaded = fs.statSync(dest).size;
    }

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      }
    };

    if (downloaded > 0) {
      options.headers['Range'] = `bytes=${downloaded}-`;
      console.log(`Resuming download from ${downloaded} bytes...`);
    } else {
      console.log('Starting fresh download...');
    }

    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadResumable(res.headers.location, dest).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200 && res.statusCode !== 206) {
        if (res.statusCode === 416) {
          console.log('File already fully downloaded!');
          return resolve();
        }
        return reject(new Error(`Server returned ${res.statusCode}`));
      }

      const totalSize = parseInt(res.headers['content-length'] || '0', 10) + downloaded;
      console.log(`Total file size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

      const file = fs.createWriteStream(dest, { flags: downloaded > 0 ? 'a' : 'w' });
      res.pipe(file);

      let current = downloaded;
      res.on('data', chunk => {
        current += chunk.length;
        if (Math.random() < 0.05) {
          process.stdout.write(`\rProgress: ${((current / totalSize) * 100).toFixed(2)}% (${(current / 1024 / 1024).toFixed(2)} MB)`);
        }
      });

      file.on('finish', () => {
        process.stdout.write('\n');
        file.close(resolve);
      });

      res.on('error', (err) => {
        console.error('\nNetwork error during download:', err.message);
        file.close(() => resolve(false)); // Resolve false to trigger retry
      });
    }).on('error', (err) => {
      console.error('\nHTTP Request Error:', err.message);
      resolve(false);
    });
  });
}

async function extractGhostscript() {
  console.log('Extracting Ghostscript silently...');
  if (!fs.existsSync(targetBin)) fs.mkdirSync(targetBin, { recursive: true });
  if (fs.existsSync(gsTempDir)) fs.rmSync(gsTempDir, { recursive: true, force: true });
  
  // Run installer silently targeting our temp folder
  const installArgs = ['/S', `/D=${gsTempDir}`];
  console.log(`Running: ${dest} ${installArgs.join(' ')}`);
  
  const result = spawnSync(dest, installArgs, { stdio: 'inherit' });
  if (result.error) {
    console.error('Failed to run installer:', result.error);
    return;
  }
  
  // Wait a few seconds for the installer to finish writing files
  await new Promise(r => setTimeout(r, 5000));
  
  const gsBinPath = path.join(gsTempDir, 'bin');
  if (fs.existsSync(gsBinPath)) {
    console.log('Copying Ghostscript binaries to /bin...');
    if (fs.existsSync(path.join(gsBinPath, 'gswin64c.exe'))) {
      fs.copyFileSync(path.join(gsBinPath, 'gswin64c.exe'), path.join(targetBin, 'gswin64c.exe'));
      fs.copyFileSync(path.join(gsBinPath, 'gsdll64.dll'), path.join(targetBin, 'gsdll64.dll'));
      console.log('✅ gswin64c.exe and gsdll64.dll successfully placed in bin folder!');
    }
    
    console.log('Uninstalling the temporary Ghostscript...');
    const uninstaller = path.join(gsTempDir, 'uninst.exe');
    if (fs.existsSync(uninstaller)) {
      spawnSync(uninstaller, ['/S'], { stdio: 'ignore' });
      await new Promise(r => setTimeout(r, 3000));
    }
  } else {
    console.error('Extraction failed. /bin folder not found inside temp dir.');
  }

  // Cleanup
  console.log('Cleaning up installer...');
  try { fs.unlinkSync(dest); } catch (e) {}
  try { fs.rmSync(gsTempDir, { recursive: true, force: true }); } catch (e) {}
  
  console.log('🎉 Ghostscript installation complete!');
}

async function main() {
  let attempts = 0;
  let success = false;
  
  while (attempts < 10 && !success) {
    console.log(`\nDownload Attempt ${attempts + 1}...`);
    try {
      const res = await downloadResumable(url, dest);
      if (res !== false) {
        success = true;
      } else {
        console.log('Download interrupted. Retrying in 2 seconds...');
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) {
      console.error('Fatal error:', e.message);
      break;
    }
    attempts++;
  }
  
  if (success) {
    console.log('Download finished! Now extracting...');
    await extractGhostscript();
  } else {
    console.error('Failed to download after 10 attempts.');
  }
}

main();
