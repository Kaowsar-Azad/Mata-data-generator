import { fetchOpenAICompatible } from "./openAICompatible.js";

export async function fetchMistral(apiKey, prompt, base64Data, mimeType, forceJson = true, promptSettings = {}) {
  const endpoint = "https://api.mistral.ai/v1/chat/completions";
  const models = ["pixtral-12b-2409"];
  return fetchOpenAICompatible("mistral", endpoint, models, apiKey, prompt, base64Data, mimeType, forceJson, promptSettings);
}
