import { fetchOpenAICompatible } from "./openAICompatible.js";

export async function fetchGroq(apiKey, prompt, base64Data, mimeType, forceJson = true, promptSettings = {}) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const models = [
    "llama-3.2-90b-vision-preview",
    "meta-llama/llama-4-scout-17b-16e-instruct"
  ];
  return fetchOpenAICompatible("groq", endpoint, models, apiKey, prompt, base64Data, mimeType, forceJson, promptSettings);
}
