import { recordApiUsage } from "../apiUsageTracker.js";

/**
 * Base fetcher for all OpenAI-compatible API endpoints.
 */
export async function fetchOpenAICompatible(provider, endpoint, models, apiKey, prompt, base64Data, mimeType, forceJson = true, promptSettings = {}) {
  let lastResponseText = null;
  let lastError = null;

  // Build dynamic keyword count instruction from promptSettings (mirrors geminiService buildPrompt logic)
  const s = promptSettings || {};
  const targetKwCount = Math.min(100, (s.keywordCount || 48) + 25);
  const kwCountInstruction = `KEYWORDS: You MUST generate EXACTLY ${targetKwCount} keywords. Not ${targetKwCount - 5}, not ${targetKwCount + 5}. EXACTLY ${targetKwCount}. Count them before outputting. If you have fewer, add high-value synonyms or commercial use-case terms. If you have more, remove the weakest ones.`;

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
    const isSecurityScan = prompt.toLowerCase().includes("policy violations");
    const skipPolicyScan = !prompt.includes("policyWarning");
    const policyWarningKey = skipPolicyScan ? "" : `,\n  "policyWarning": null`;
    const policyWarningRule = skipPolicyScan ? "" : `\n- TRADEMARK & IP SAFETY: You must perform the detailed IP/Trademark Scan requested in the user prompt. If any brand name, trademark, company logo, or protected design is found, you MUST set "policyWarning" to a brief (max 2 sentences), specific, actionable message explaining it. If clean, set to null.`;
    const policyWarningRuleNum = skipPolicyScan ? "" : `\n2. TRADEMARK & IP SAFETY: You must perform the detailed IP/Trademark Scan requested in the user prompt. If any brand name, trademark, company logo, or protected design is found, you MUST set "policyWarning" to a brief (max 2 sentences), specific, actionable message explaining it. If clean, set to null.`;
    
    const systemInstruction = forceJson
      ? (isSecurityScan
          ? `You are a professional safety scan assistant. Your ENTIRE job is to analyze the image and respond with ONLY a single valid JSON object conforming EXACTLY to the safety scan guidelines.

REQUIRED JSON FORMAT:
{
  "isSafe": boolean,
  "reason": "Specific reason if not safe, otherwise empty string"
}`
          : `You are a professional stock media metadata expert. Your ENTIRE job is to respond with ONLY a single valid JSON object conforming EXACTLY to the guidelines, count requirements, grammar rules, and trademark scanning instructions provided in the user prompt. 

CRITICAL RULES:
1. NO REASONING OR PREAMBLE: Do NOT output any reasoning, thinking process, thoughts, or <think> tags. Go straight to the JSON output.${policyWarningRuleNum}
3. KEYWORD COUNT: You must generate the exact keyword count requested in the user prompt (${targetKwCount} words). Add commercial use-cases, abstract concepts, or industry terms if you need more keywords to reach this target. Do not stop early.
4. KEYWORD SCORES: You must score every single keyword 1-100. The number of scores in the "keywordScores" object MUST EXACTLY MATCH the number of keywords in your "keywords" string.

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
}`)
      : `You are a helpful AI assistant specializing in describing images in extreme detail and generating highly technical, descriptive AI image prompts. Respond with ONLY the raw prompt text. Do NOT wrap it in JSON.`;

    const maxTokens = 2048;
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
      max_tokens: maxTokens,
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
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errMsg = errorData.error?.message || response.statusText;
          const isRateLimit = response.status === 429 || errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("quota");
          
          if (isRateLimit) {
            let waitMs = (retries + 1) * 5000;

            if (retries < 5) {
              retries++;
              console.warn(`[${provider.toUpperCase()} Rate Limit] 429 received. Waiting ${Math.ceil(waitMs / 1000)}s before retry ${retries}/5...`);
              await new Promise(resolve => setTimeout(resolve, waitMs));
              continue;
            }
          }

          // 413 = Request too large for this model — try the next smaller model instead
          if (response.status === 413 || errMsg.toLowerCase().includes("too large") || errMsg.toLowerCase().includes("request too large")) {
            lastError = new Error(`${provider.toUpperCase()} API Error: ${response.status} ${errMsg}`);
            console.warn(`[Fallback] Model ${currentModel} rejected request as too large (413). Trying next candidate...`);
            break; // Try next model
          }
          
          throw new Error(`${provider.toUpperCase()} API Error: ${response.status} ${errMsg}`);
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0]) {
          console.error(`[${provider.toUpperCase()} API Error] Unexpected response format:`, data);
          throw new Error(`Unexpected API response: ${JSON.stringify(data).substring(0, 100)}`);
        }
        const choiceMsg = data.choices[0].message || {};
        lastResponseText = (choiceMsg.content && choiceMsg.content.trim()) ? choiceMsg.content : (choiceMsg.reasoning || "");
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
        
        const isRateLimitErr = errorToThrow.message.includes("429") || errorToThrow.message.toLowerCase().includes("rate limit") || errorToThrow.message.toLowerCase().includes("quota");
        if (isRateLimitErr && !errorToThrow.message.includes("Daily Quota") && retries < 5 && !errorToThrow.message.includes("timed out")) {
          retries++;
          const backoffMs = retries * 5000;
          console.warn(`[${provider.toUpperCase()} Rate Limit Catch] Rate limit caught. Retrying in ${backoffMs/1000}s (Retry ${retries}/5)...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        lastError = errorToThrow;
        // 413 / too large / model fallback errors → try next model, not a hard failure
        if (
          errorToThrow.message.includes("400") ||
          errorToThrow.message.includes("413") ||
          errorToThrow.message.toLowerCase().includes("too large") ||
          errorToThrow.message.includes("decommissioned") ||
          errorToThrow.message.includes("not found") ||
          errorToThrow.message.includes("404")
        ) {
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
    let finalOutput = text.trim();
    // Remove reasoning blocks (e.g. <think>...</think>) from models like Qwen or DeepSeek.
    // Handles cases where the closing </think> tag is missing due to token limits.
    finalOutput = finalOutput.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim();
    return finalOutput;
  }

function extractJsonHelper(str) {
  const results = [];
  let braceCount = 0;
  let inString = false;
  let escape = false;
  let startIndex = -1;
  
  for (let i = 0; i < str.length; i++) {
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
        if (braceCount === 0) {
          startIndex = i;
        }
        braceCount++;
      } else if (char === '}') {
        if (braceCount > 0) {
          braceCount--;
          if (braceCount === 0 && startIndex !== -1) {
            results.push(str.substring(startIndex, i + 1));
            startIndex = -1;
          }
        }
      }
    }
  }
  return results.length > 0 ? results : null;
}

function safeParseJsonString(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return null;
  let str = rawStr.trim();
  
  // 1. Direct parse attempt
  try {
    return JSON.parse(str);
  } catch (e) {
    console.debug('Direct JSON parse failed, trying fallback 1:', e.message);
  }

  // 2. Remove comments and trailing commas before } or ]
  try {
    let cleaned = str
      .replace(/\/\/[^\n\r]*/g, '') // remove line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // remove block comments
      .replace(/,\s*([}\]])/g, '$1'); // remove trailing commas
    return JSON.parse(cleaned);
  } catch (e) {
    console.debug('Fallback 1 JSON parse failed, trying fallback 2:', e.message);
  }

  // 3. Fix unescaped newlines/tabs inside strings
  try {
    let fixed = str
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\r\n\t]+/g, ' ');
    return JSON.parse(fixed);
  } catch (e) {
    console.debug('Fallback 2 JSON parse failed:', e.message);
  }

  return null;
}

function extractFieldsByRegex(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  const getMatch = (regex) => {
    const match = rawText.match(regex);
    return match ? (match[1] || match[2] || match[3] || '').trim() : '';
  };

  const title = getMatch(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
  const description = getMatch(/"description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
  const keywords = getMatch(/"keywords"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
  const keywordScoresMatch = rawText.match(/"keywordScores"\s*:\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|\[([\s\S]*?)\]|\{([\s\S]*?)\})/i);
  let keywordScores = "";
  if (keywordScoresMatch) {
    keywordScores = (keywordScoresMatch[1] || keywordScoresMatch[2] || keywordScoresMatch[3] || '').trim();
  }
  
  const categoriesMatch = rawText.match(/"categories"\s*:\s*\[([\s\S]*?)\]/i);
  let categories = [];
  if (categoriesMatch && categoriesMatch[1]) {
    categories = categoriesMatch[1].replace(/["']/g, '').split(',').map(c => c.trim()).filter(Boolean);
  }

  if (title || keywords || description) {
    return {
      title,
      description,
      keywords,
      keywordScores: keywordScores || {},
      categories: categories.length > 0 ? categories : ["General"],
      policyWarning: null
    };
  }

  return null;
}

function extractValidJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error("Empty or invalid response from AI model.");
  }

  // 1. If there is a </think> tag, strip everything up to and including the LAST </think>
  let cleanText = text;
  if (cleanText.includes("</think>")) {
    cleanText = cleanText.substring(cleanText.lastIndexOf("</think>") + 8);
  }

  let parsed = null;

  // 2. Look for ```json ... ``` code blocks first
  const codeBlockMatch = cleanText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (codeBlockMatch) {
    parsed = safeParseJsonString(codeBlockMatch[1]);
  }

  // 3. Find JSON object from first '{' to last '}' in cleanText
  if (!parsed) {
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleanText.substring(firstBrace, lastBrace + 1);
      parsed = safeParseJsonString(candidate);
      if (!parsed) {
        const extracted = extractJsonHelper(cleanText);
        if (extracted && Array.isArray(extracted)) {
          // Iterate backwards to get the last valid JSON object
          for (let i = extracted.length - 1; i >= 0; i--) {
            parsed = safeParseJsonString(extracted[i]);
            if (parsed) break;
          }
        }
      }
    }
  }

  // 4. Fallback: Search in raw text if </think> was missing or unclosed
  if (!parsed) {
    const extractedFromRaw = extractJsonHelper(text);
    if (extractedFromRaw && Array.isArray(extractedFromRaw)) {
      // Iterate backwards on raw text
      for (let i = extractedFromRaw.length - 1; i >= 0; i--) {
        parsed = safeParseJsonString(extractedFromRaw[i]);
        if (parsed) break;
      }
    }
  }

  // 5. Final attempt on full raw text
  if (!parsed) {
    const fb = text.indexOf('{');
    const lb = text.lastIndexOf('}');
    if (fb !== -1 && lb > fb) {
      parsed = safeParseJsonString(text.substring(fb, lb + 1));
    }
  }

  // 6. Super Fallback: Regex-based field extraction
  if (!parsed || typeof parsed !== 'object') {
    parsed = extractFieldsByRegex(cleanText) || extractFieldsByRegex(text);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error("Could not parse JSON response from AI model. Raw output: " + String(text).substring(0, 150) + "...");
  }

  // Unwrap if nested in metadata, data, result, response
  let data = parsed;
  if (data.metadata && typeof data.metadata === 'object') data = data.metadata;
  else if (data.data && typeof data.data === 'object') data = data.data;
  else if (data.result && typeof data.result === 'object') data = data.result;
  else if (data.response && typeof data.response === 'object') data = data.response;

  // Case-insensitive key lookup helper
  const getField = (...keys) => {
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null) return data[k];
      const matchKey = Object.keys(data).find(dk => dk.toLowerCase() === k.toLowerCase());
      if (matchKey && data[matchKey] !== undefined && data[matchKey] !== null) return data[matchKey];
    }
    return undefined;
  };

  let title = getField('title', 'headline', 'caption', 'name', 'image_title', 'prompt') || '';
  let description = getField('description', 'desc', 'summary', 'details', 'visual_description') || '';
  let keywordsRaw = getField('keywords', 'tags', 'keyword_list', 'key_words', 'tag_list') || '';
  let categories = getField('categories', 'category') || [];
  let keywordScores = getField('keywordScores', 'keyword_scores', 'scores', 'keywords_scores');
  let policyWarning = getField('policyWarning', 'policy_warning', 'warning', 'violation') || null;

  if (Array.isArray(keywordsRaw)) {
    keywordsRaw = keywordsRaw.filter(Boolean).map(k => String(k).trim()).join(', ');
  } else {
    keywordsRaw = String(keywordsRaw || '').trim();
  }

  if (typeof categories === 'string') {
    categories = categories.split(',').map(c => c.trim()).filter(Boolean);
  } else if (!Array.isArray(categories)) {
    categories = categories ? [String(categories)] : [];
  }

  return {
    ...data,
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    keywords: keywordsRaw,
    categories,
    keywordScores: keywordScores !== undefined && keywordScores !== null ? keywordScores : {},
    policyWarning: policyWarning ? String(policyWarning) : null,
  };
}

  return extractValidJson(text);
}
