import sharp from 'sharp';
import fs from 'fs';

async function testMedian() {
  try {
    const inputPath = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\95c702d6-e227-4695-87b2-d60adb45955d\\media__1779555734069.png';
    const outputPath = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\95c702d6-e227-4695-87b2-d60adb45955d\\test_median_output.png';
    
    // Original upscaling + median pipeline
    await sharp(inputPath)
      .resize({ width: 3000, withoutEnlargement: true, fit: 'inside' }) // Lanczos creates smooth gradients
      .median(7) // Large median snaps gradients to sharp edges without creating halos
      .png({ palette: true, colors: 16 }) // Small palette
      .toFile(outputPath);
      
    console.log('Successfully saved to', outputPath);
  } catch (err) {
    console.error(err);
  }
}

testMedian();
