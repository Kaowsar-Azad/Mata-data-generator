import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

async function transcribe() {
  try {
    const keysFile = fs.readFileSync("C:\\Users\\user\\AppData\\Roaming\\matadata\\secure-keys.json", "utf8");
    const key = JSON.parse(keysFile).gemini[0];
    
    const genAI = new GoogleGenerativeAI(key);
    // Use gemini-1.5-flash or gemini-2.5-flash which is multimodal and fast
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const audioPath = "C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\6a88c4ef-773e-4114-a8af-e8c6a1ce1583\\uploaded_media_1780508203354.img";
    const audioData = fs.readFileSync(audioPath);
    
    console.log("Transcribing audio file with Gemini...");
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "audio/webm",
          data: audioData.toString("base64")
        }
      },
      {
        text: "Please listen very carefully and transcribe exactly what is said in Bengali. Return ONLY the Bengali transcription."
      }
    ]);
    
    console.log("=== Transcription Result ===");
    console.log(result.response.text());
    console.log("============================");
  } catch (err) {
    console.error("Transcription failed:", err);
  }
}

transcribe();
