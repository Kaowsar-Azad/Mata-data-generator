import { fetchOpenAICompatible } from "./openAICompatible.js";

export async function fetchGroq(apiKey, prompt, base64Data, mimeType, forceJson = true) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const models = [
    "llama-3.2-90b-vision-preview",
    "llama-3.2-11b-vision-preview"
  ];
  return fetchOpenAICompatible("groq", endpoint, models, apiKey, prompt, base64Data, mimeType, forceJson);
}
