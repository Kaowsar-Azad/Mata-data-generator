const fs = require('fs');
const https = require('https');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return download(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function main() {
  const zipPath = path.join(os.tmpdir(), 'realesrgan.zip');
  console.log('Downloading zip...');
  await download('https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip', zipPath);
  console.log('Extracting...');
  execSync(`powershell -command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${os.tmpdir()}\\realesrgan'"`);
  const modelsDir = path.join(os.tmpdir(), 'realesrgan', 'models');
  const destDir = path.join('e:', 'matadata', 'bin', 'upscayl', 'models');
  
  const filesToCopy = [
    'realesrgan-x4plus.bin', 'realesrgan-x4plus.param',
    'realesrgan-x4plus-anime.bin', 'realesrgan-x4plus-anime.param',
    'realesr-animevideov3-x2.bin', 'realesr-animevideov3-x2.param',
    'realesr-animevideov3-x3.bin', 'realesr-animevideov3-x3.param',
    'realesr-animevideov3-x4.bin', 'realesr-animevideov3-x4.param'
  ];
  for (const f of filesToCopy) {
    if (fs.existsSync(path.join(modelsDir, f))) {
      fs.copyFileSync(path.join(modelsDir, f), path.join(destDir, f));
      console.log('Copied ' + f);
    } else {
      console.log('Skipping ' + f + ' (not found in zip)');
    }
  }
}
main().catch(console.error);
