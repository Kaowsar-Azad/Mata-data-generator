import { recordApiUsage } from "../apiUsageTracker.js";

/**
 * Base fetcher for all OpenAI-compatible API endpoints.
 */
export async function fetchOpenAICompatible(provider, endpoint, models, apiKey, prompt, base64Data, mimeType, forceJson = true) {
  let lastResponseText = null;
  let lastError = null;

  for (let i = 0; i < models.length; i++) {
    const currentModel = models[i];
    const messageContent = [{ type: "text", text: prompt }];
    if (Array.isArray(base64Data)) {
      base64Data.forEach(buf => {
        messageContent.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${buf}` } });
      });
    } else {
      messageContent.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } });
    }

    // System prompt for OpenAI-compatible providers: focus on quality and strict adherence to rules
    const systemInstruction = `You are a highly strict professional stock media metadata expert and SEO specialist. You MUST STRICTLY obey the user's prompt. Your absolute highest priorities are: 
1) Detecting any trademarks, brands, corporate logos, or design copyright (IP) policy violations in the image. If ANY trademark, logo, or brand is visible, you MUST write a specific explanation in the "policyWarning" field of your JSON output. 
2) Generating EXACTLY the requested number of keywords (or adhering to the 15-30 "Sweet Spot" mode limit).
3) Outputting valid JSON matching the exact schema requested.
Do not hallucinate. Failure to follow the exact keyword count or missing a trademark/brand is unacceptable.`;

    const payload = {
      model: currentModel,
      messages: [
        {
          role: "system",
          content: systemInstruction
        },
        {
          role: "user",
          content: messageContent
        }
      ],
      max_tokens: 4096,
      temperature: 0.4
    };

    if (forceJson) {
      payload.response_format = { type: "json_object" };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(provider === "openrouter" ? { "HTTP-Referer": "http://localhost:5173", "X-Title": "Metadata Pro" } : {})
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error?.message || response.statusText;
        throw new Error(`${provider.toUpperCase()} API Error: ${response.status} ${errMsg}`);
      }

      const data = await response.json();
      lastResponseText = data.choices[0].message.content;
      const tok = data.usage?.total_tokens;
      recordApiUsage(provider, apiKey, {
        totalTokens: typeof tok === "number" ? tok : 0,
        requests: 1,
      });
      console.log(`[Success] Successfully generated using model string: ${currentModel}`);
      break; // Successfully got response!
    } catch (err) {
      lastError = err;
      // If model is decommissioned, deprecated, or not found (usually 400 or 404), try next model candidate smoothly!
      if (err.message.includes("400") || err.message.includes("decommissioned") || err.message.includes("not found") || err.message.includes("404")) {
        console.warn(`[Fallback] Model ${currentModel} failed on ${provider}: ${err.message}. Trying next candidate...`);
        continue;
      }
      // Otherwise break/rethrow immediately (e.g. 401 Unauthorized, 429 Rate Limit)
      throw err;
    }
  }

  if (lastResponseText === null) {
    throw lastError || new Error(`${provider.toUpperCase()} API Error: All model candidates failed.`);
  }

  const text = lastResponseText;

  if (!forceJson) {
    return text.trim();
  }

  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
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
