import { fetchOpenAICompatible } from "./openAICompatible.js";

export async function fetchOpenAI(apiKey, prompt, base64Data, mimeType, forceJson = true, promptSettings = {}) {
  const endpoint = "https://api.openai.com/v1/chat/completions";
  const models = ["gpt-4o-mini"];
  return fetchOpenAICompatible("openai", endpoint, models, apiKey, prompt, base64Data, mimeType, forceJson, promptSettings);
}
