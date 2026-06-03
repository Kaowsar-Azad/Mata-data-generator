import fs from 'fs';
import { generatePromptFromImage } from './src/services/geminiService.js';

async function testPrompt() {
  try {
    const keysFile = fs.readFileSync("C:\\Users\\user\\AppData\\Roaming\\matadata\\secure-keys.json", "utf8");
    const keys = JSON.parse(keysFile).gemini || [];
    if (keys.length === 0) {
      console.log("No keys found.");
      return;
    }
    
    // We will use a dummy small base64 just to see if the API responds to the new prompt template
    // A 1x1 white pixel in JPEG
    const dummyImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAwAB/AL+f4R4AAAAASUVORK5CYII=";
    
    console.log("Testing Exact Match Mode...");
    const promptExact = await generatePromptFromImage(dummyImage, "image/png", keys, "gemini", { promptSimilarityMode: "Exact Match" });
    console.log("Exact Match Result:\n", promptExact, "\n");
    
    console.log("Testing Unique Variation Mode...");
    const promptUnique = await generatePromptFromImage(dummyImage, "image/png", keys, "gemini", { promptSimilarityMode: "Unique Variation" });
    console.log("Unique Variation Result:\n", promptUnique, "\n");

  } catch (err) {
    console.error("Test failed:", err);
  }
}

testPrompt();
