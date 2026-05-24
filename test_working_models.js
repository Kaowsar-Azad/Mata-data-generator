import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

async function testWorkingModels() {
  const keysFile = fs.readFileSync("C:\\Users\\user\\AppData\\Roaming\\matadata\\secure-keys.json", "utf8");
  const key = JSON.parse(keysFile).gemini[0];
  const genAI = new GoogleGenerativeAI(key);

  const modelsToTest = [
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash"
  ];

  for (const modelName of modelsToTest) {
    try {
      console.log(`\nTesting model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Respond with exactly one word: YES");
      const response = await result.response;
      console.log(`[SUCCESS] ${modelName} returned: ${response.text().trim()}`);
    } catch (err) {
      console.error(`[ERROR] ${modelName}: ${err.message.split('\n')[0]}`);
    }
  }
}

testWorkingModels();
