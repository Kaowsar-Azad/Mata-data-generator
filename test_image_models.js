import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

async function testWorkingModelsWithImage() {
  const keysFile = fs.readFileSync("C:\\Users\\user\\AppData\\Roaming\\matadata\\secure-keys.json", "utf8");
  const key = JSON.parse(keysFile).gemini[0];
  const genAI = new GoogleGenerativeAI(key);

  const modelsToTest = [
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
  ];

  // 1x1 transparent PNG
  const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  for (const modelName of modelsToTest) {
    try {
      console.log(`\nTesting model with image: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { inlineData: { data: base64Image, mimeType: "image/png" } },
        { text: "What is this image? Respond in one word." }
      ]);
      const response = await result.response;
      console.log(`[SUCCESS] ${modelName} returned: ${response.text().trim()}`);
    } catch (err) {
      console.error(`[ERROR] ${modelName}: ${err.message.split('\n')[0]}`);
    }
  }
}

testWorkingModelsWithImage();
