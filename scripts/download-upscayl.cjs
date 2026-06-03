const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const binDir = path.join(__dirname, '..', 'bin', 'upscayl');
const zipFile = path.join(__dirname, '..', 'bin', 'upscayl.zip');

if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

console.log('Fetching latest release info...');
https.get('https://api.github.com/repos/xinntao/Real-ESRGAN-ncnn-vulkan/releases/latest', { headers: { 'User-Agent': 'Node.js' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const release = JSON.parse(data);
    const asset = release.assets.find(a => a.name.includes('windows'));
    if (!asset) {
      console.error('Windows asset not found.');
      process.exit(1);
    }
    
    console.log(`Downloading ${asset.browser_download_url}...`);
    const file = fs.createWriteStream(zipFile);
    
    // Simple redirect follower
    const download = (url) => {
      https.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          download(response.headers.location);
        } else {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            console.log('Download complete. Extracting...');
            try {
              execSync(`powershell -Command "Expand-Archive -Path '${zipFile}' -DestinationPath '${binDir}' -Force"`);
              fs.unlinkSync(zipFile);
              console.log('Extraction complete.');
            } catch (e) {
              console.error('Extraction failed:', e.message);
            }
          });
        }
      });
    };
    
    download(asset.browser_download_url);
  });
}).on('error', (e) => {
  console.error('Error fetching release:', e.message);
});
