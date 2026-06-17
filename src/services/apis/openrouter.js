import { fetchOpenAICompatible } from "./openAICompatible.js";

export async function fetchOpenRouter(apiKey, prompt, base64Data, mimeType, forceJson = true, promptSettings = {}) {
  const endpoint = "https://openrouter.ai/api/v1/chat/completions";
  const models = ["google/gemini-2.5-flash"];
  return fetchOpenAICompatible("openrouter", endpoint, models, apiKey, prompt, base64Data, mimeType, forceJson, promptSettings);
}
