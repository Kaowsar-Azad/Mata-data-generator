import fs from 'fs';
import path from 'path';

async function listRealModels() {
  try {
    const keysPath = "C:\\Users\\user\\AppData\\Roaming\\matadata\\secure-keys.json";
    const content = fs.readFileSync(keysPath, 'utf8');
    const keys = JSON.parse(content);
    const geminiKeys = keys.gemini || [];
    
    const apiKey = geminiKeys[0];
    if (!apiKey) {
      console.log("No Gemini API key found in secure-keys.json");
      return;
    }
    
    console.log("Using API Key:", apiKey.substring(0, 8) + "...");
    
    // Let's query models list
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    
    const imageModels = data.models?.filter(m => m.name.toLowerCase().includes('image') || m.supportedGenerationMethods?.includes('generateImages'));
    console.log("Image generation models available:");
    console.log(JSON.stringify(imageModels, null, 2));
    
  } catch (err) {
    console.error(err);
  }
}

listRealModels();
