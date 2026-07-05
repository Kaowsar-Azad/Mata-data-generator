import { recordApiUsage } from "../apiUsageTracker.js";

/**
 * Base fetcher for all OpenAI-compatible API endpoints.
 */
export async function fetchOpenAICompatible(provider, endpoint, models, apiKey, prompt, base64Data, mimeType, forceJson = true, promptSettings = {}) {
  let lastResponseText = null;
  let lastError = null;

  // Build dynamic keyword count instruction from promptSettings (mirrors geminiService buildPrompt logic)
  const s = promptSettings || {};
  const isSmartMode = !!s.smartMode;
  const targetKwCount = isSmartMode ? null : Math.min(100, (s.keywordCount || 48) + 25);
  const kwCountInstruction = isSmartMode
    ? `KEYWORDS: Generate between 15 and 30 of the most relevant keywords only. No padding, no filler.`
    : `KEYWORDS: You MUST generate EXACTLY ${targetKwCount} keywords. Not ${targetKwCount - 5}, not ${targetKwCount + 5}. EXACTLY ${targetKwCount}. Count them before outputting. If you have fewer, add high-value synonyms or commercial use-case terms. If you have more, remove the weakest ones.`;

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

    // System prompt for OpenAI-compatible providers: focus on output structure and critical rules.
    const systemInstruction = forceJson
      ? `You are a professional stock media metadata expert. Your ENTIRE job is to respond with ONLY a single valid JSON object conforming EXACTLY to the guidelines, count requirements, grammar rules, and trademark scanning instructions provided in the user prompt. 

CRITICAL RULES:
1. TRADEMARK & IP SAFETY: You must perform the detailed IP/Trademark Scan requested in the user prompt. If any brand name, trademark, company logo, or protected design is found, you MUST set "policyWarning" to a brief (max 2 sentences), specific, actionable message explaining it. If clean, set to null.
2. KEYWORD COUNT: You must generate the exact keyword count requested in the user prompt (${isSmartMode ? "15-30" : targetKwCount} words). Add commercial use-cases, abstract concepts, or industry terms if you need more keywords to reach this target. Do not stop early.
3. KEYWORD SCORES: You must score every single keyword 1-100. The number of scores in the "keywordScores" object MUST EXACTLY MATCH the number of keywords in your "keywords" string.

REQUIRED JSON FORMAT:
{
  "title": "Specific sentence following user prompt guidelines.",
  "description": "Factual details plus commercial use cases.",
  "keywords": "word1, word2, word3, ... (MUST match the requested count)",
  "keywordScores": {
    "word1": 95,
    "word2": 80,
    "word3": 45
  },
  "categories": ["Category Name"],
  "commercialConcept": "popular",
  "subjectClarity": "clear",
  "technicalQuality": "professional",
  "marketDemand": "high",
  "scoreReason": "Brief explanation.",
  "policyWarning": null
}`
      : `You are a helpful AI assistant specializing in describing images in extreme detail and generating highly technical, descriptive AI image prompts. Respond with ONLY the raw prompt text. Do NOT wrap it in JSON.`;

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
      max_tokens: provider === "groq" ? 2048 : 4096,
      temperature: 0.4
    };

    if (forceJson) {
      payload.response_format = { type: "json_object" };
    }

    let retries = 0;
    const maxRetries = 3;
    while (retries <= maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(provider === "openrouter" ? { "HTTP-Referer": "http://localhost:5173", "X-Title": "Metadata Pro" } : {})
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errMsg = errorData.error?.message || response.statusText;
          const isRateLimit = response.status === 429 || errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("limit") || errMsg.toLowerCase().includes("quota");
          
          if (isRateLimit && retries < maxRetries) {
            retries++;
            const backoffMs = retries * 5000;
            console.warn(`[${provider.toUpperCase()} Rate Limit] 429/quota received. Retrying in ${backoffMs/1000}s (Retry ${retries}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            continue;
          }
          
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
        break; // Success, break models loop
      } catch (err) {
        clearTimeout(timeoutId);
        let errorToThrow = err;
        if (err.name === 'AbortError') {
          errorToThrow = new Error(`Request timed out (90s). ${provider.toUpperCase()} API is taking too long.`);
        }
        
        const isRateLimitErr = errorToThrow.message.includes("429") || errorToThrow.message.toLowerCase().includes("rate limit") || errorToThrow.message.toLowerCase().includes("limit") || errorToThrow.message.toLowerCase().includes("quota");
        if (isRateLimitErr && retries < maxRetries && !errorToThrow.message.includes("timed out")) {
          retries++;
          const backoffMs = retries * 5000;
          console.warn(`[${provider.toUpperCase()} Rate Limit Catch] Rate limit caught. Retrying in ${backoffMs/1000}s (Retry ${retries}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        lastError = errorToThrow;
        if (errorToThrow.message.includes("400") || errorToThrow.message.includes("decommissioned") || errorToThrow.message.includes("not found") || errorToThrow.message.includes("404")) {
          console.warn(`[Fallback] Model ${currentModel} failed on ${provider}: ${errorToThrow.message}. Trying next candidate...`);
          break; // Break retries loop, proceed to next model
        }
        throw errorToThrow;
      }
    }
  }

  if (lastResponseText === null) {
    throw lastError || new Error(`${provider.toUpperCase()} API Error: All model candidates failed.`);
  }

  const text = lastResponseText;

  if (!forceJson) {
    return text.trim();
  }

function extractJson(str) {
  const firstBrace = str.indexOf('{');
  if (firstBrace === -1) return null;
  
  let braceCount = 0;
  let inString = false;
  let escape = false;
  
  for (let i = firstBrace; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return str.substring(firstBrace, i + 1);
        }
      }
    }
  }
  return null;
}

  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const extracted = extractJson(cleaned);
    if (extracted) {
      parsed = JSON.parse(extracted);
    } else {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("JSON parse error: " + e.message);
    }
  }
  return parsed;
}
