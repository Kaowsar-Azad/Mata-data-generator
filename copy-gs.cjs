const fs = require('fs');
const path = require('path');

const targetBinDir = path.join(__dirname, 'bin');

// Possible installation directories
const gsDirs = [
  'C:\\Program Files\\gs',
  'C:\\Program Files (x86)\\gs'
];

let sourceBinPath = null;

// Find the Ghostscript bin folder
for (const dir of gsDirs) {
  if (fs.existsSync(dir)) {
    const subDirs = fs.readdirSync(dir);
    for (const subDir of subDirs) {
      const binPath = path.join(dir, subDir, 'bin');
      if (fs.existsSync(binPath) && fs.existsSync(path.join(binPath, 'gswin64c.exe'))) {
        sourceBinPath = binPath;
        break;
      } else if (fs.existsSync(binPath) && fs.existsSync(path.join(binPath, 'gswin32c.exe'))) {
        sourceBinPath = binPath;
        break;
      }
    }
  }
  if (sourceBinPath) break;
}

if (!sourceBinPath) {
  console.error("❌ Ghostscript খুঁজে পাওয়া যায়নি! দয়া করে নিশ্চিত করুন যে Ghostscript আপনার কম্পিউটারে ইন্সটল করা আছে।");
  process.exit(1);
}

// Create target bin directory if it doesn't exist
if (!fs.existsSync(targetBinDir)) {
  fs.mkdirSync(targetBinDir, { recursive: true });
}

// Files to copy
const is64 = fs.existsSync(path.join(sourceBinPath, 'gswin64c.exe'));
const filesToCopy = is64 
  ? ['gswin64c.exe', 'gsdll64.dll'] 
  : ['gswin32c.exe', 'gsdll32.dll'];

console.log(`🔍 Ghostscript পাওয়া গেছে: ${sourceBinPath}`);
console.log('⏳ ফাইল কপি করা হচ্ছে...');

let allCopied = true;
for (const file of filesToCopy) {
  const src = path.join(sourceBinPath, file);
  const dest = path.join(targetBinDir, file);
  try {
    fs.copyFileSync(src, dest);
    console.log(`✅ কপি সফল হয়েছে: ${file}`);
  } catch (err) {
    console.error(`❌ কপি করতে ব্যর্থ হয়েছে: ${file}`, err);
    allCopied = false;
  }
}

if (allCopied) {
  console.log('\n🎉 অভিনন্দন! Ghostscript সফলভাবে আপনার প্রজেক্টের bin ফোল্ডারে যুক্ত হয়েছে।');
  console.log('এখন আপনি আমাকে জানাতে পারেন, আমি পরবর্তী কাজ শুরু করব।');
}
