import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

async function testVisionQuality() {
  const keysFile = fs.readFileSync("C:\\Users\\user\\AppData\\Roaming\\matadata\\secure-keys.json", "utf8");
  const key = JSON.parse(keysFile).gemini[0];
  const genAI = new GoogleGenerativeAI(key);

  const imagePath = "C:\\Users\\user\\Downloads\\demo as\\_Cinematic_photography_of_a_soccer_202605190247.jpeg";
  if (!fs.existsSync(imagePath)) {
    console.error("Test image not found at:", imagePath);
    return;
  }

  const imageBuffer = fs.readFileSync(imagePath).toString("base64");
  const mimeType = "image/jpeg";

  const prompt = `Analyze this image in detail and create a comprehensive, descriptive prompt that could be used to recreate this image in an AI model like Midjourney or Stable Diffusion.
Focus on:
1. Main subject, actions, and positioning.
2. Lighting, camera angles, and atmosphere.
3. Artistic style, medium, and color palette.
4. Essential background details.
Output the entire prompt as a SINGLE, continuous paragraph. Return ONLY the raw prompt text.`;

  const modelsToTest = [
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash"
  ];

  for (const modelName of modelsToTest) {
    try {
      console.log(`\n--- Testing Model: ${modelName} ---`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { inlineData: { data: imageBuffer, mimeType } },
        { text: prompt }
      ]);
      const response = await result.response;
      console.log(response.text().trim());
    } catch (err) {
      console.error(`[ERROR] ${modelName}:`, err.message);
    }
  }
}

testVisionQuality();
