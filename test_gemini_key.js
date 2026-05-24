import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

async function listModels() {
  const keysFile = fs.readFileSync("C:\\Users\\user\\AppData\\Roaming\\matadata\\secure-keys.json", "utf8");
  const key = JSON.parse(keysFile).gemini[0];
  
  const genAI = new GoogleGenerativeAI(key);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await response.json();
    if (data.models) {
      console.log("Available models:");
      data.models.forEach(m => console.log(m.name, m.supportedGenerationMethods));
    } else {
      console.log("No models array:", data);
    }
  } catch (err) {
    console.error(err.message);
  }
}

listModels();
