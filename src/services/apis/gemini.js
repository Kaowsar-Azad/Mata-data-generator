import { GoogleGenerativeAI } from "@google/generative-ai";
import { recordApiUsage } from "../apiUsageTracker.js";

const modelsToTry = [
  "gemini-3.5-flash",
  "gemini-2.5-pro"
];

// Fallback dynamic fetch (kept here for logic completeness)
export async function getAvailableModels(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    if (data.models) {
      // Filter for models that support generateContent and multimodal (vision)
      return data.models
        .filter(m => m.supportedGenerationMethods.includes("generateContent"))
        .map(m => m.name.replace("models/", ""));
    }
    return [];
  } catch (err) {
    console.error("Failed to fetch models list:", err);
    return [];
  }
}

export async function fetchGemini(apiKey, currentKeyIndex, prompt, imageBuffer, mimeType, forceJson = true) {
  const genAI = new GoogleGenerativeAI(apiKey);
  console.log(`[System] Initializing Gemini with key index ${currentKeyIndex} (${apiKey.substring(0, 8)})...`);

  let modelsToAttempt = [...modelsToTry];
  let lastError = null;
  let lastResponseText = null;

  for (let i = 0; i < modelsToAttempt.length; i++) {
    const modelName = modelsToAttempt[i];
    try {
      console.log(`[Attempt] Model: ${modelName} on key ${currentKeyIndex}`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const contentParts = [];
      if (Array.isArray(imageBuffer)) {
        imageBuffer.forEach(buf => {
          contentParts.push({
            inlineData: {
              data: buf,
              mimeType: mimeType,
            },
          });
        });
      } else {
        contentParts.push({
          inlineData: {
            data: imageBuffer,
            mimeType: mimeType,
          },
        });
      }
      contentParts.push({ text: prompt });

      const result = await model.generateContent(contentParts);

      const response = await result.response;
      const text = response.text();

      let totalTokens = 0;
      try {
        const um = response.usageMetadata;
        if (um && typeof um.totalTokenCount === "number") totalTokens = um.totalTokenCount;
      } catch {
        /* ignore */
      }
      recordApiUsage("gemini", apiKey, { totalTokens, requests: 1 });

      console.log(`[Success] Metadata generated using ${modelName} on key index ${currentKeyIndex}!`);
      lastResponseText = text;
      break;
    } catch (err) {
      console.warn(`[Fail] Gemini Model ${modelName} on key ${currentKeyIndex}: ${err.message}`);
      lastError = err;
      if (err.message.includes("429") || err.message.includes("Quota") || err.message.includes("exhausted")) {
        throw err; // Signal caller to switch API key
      }
      // If it's a model not found / internal error, try the next model
      continue;
    }
  }

  if (lastResponseText === null) {
    throw lastError || new Error(`Gemini API Error: All model candidates failed.`);
  }

  if (!forceJson) {
    return lastResponseText.trim();
  }

  const cleaned = lastResponseText.replace(/```json/g, "").replace(/```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error("JSON parse error");
  }
  return parsed;
}
