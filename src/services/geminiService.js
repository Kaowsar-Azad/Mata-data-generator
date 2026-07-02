import { fetchGemini, buildGeminiPrompt } from "./apis/gemini.js";
import { fetchMistral, buildMistralPrompt } from "./apis/mistral.js";
import { fetchGroq, buildGroqPrompt } from "./apis/groq.js";
import { fetchOpenAI, buildOpenAIPrompt } from "./apis/openai.js";
import { fetchOpenRouter, buildOpenRouterPrompt } from "./apis/openrouter.js";
import { recordApiUsage } from "./apiUsageTracker.js";
/**
 * Super Robust Gemini Service with Multi-Version and Multi-Model fallbacks
 * Supports both raster images and EPS files (via extracted/placeholder previews)
 */


const BRAND_REPLACEMENTS = {
  "iphone": "smartphone",
  "ipad": "tablet",
  "macbook": "laptop",
  "imac": "desktop computer",
  "apple watch": "smartwatch",
  "airpods": "wireless earbuds",
  "android": "smartphone",
  "pixel": "smartphone",
  "chromebook": "laptop",
  "windows": "operating system",
  "xbox": "gaming console",
  "playstation": "gaming console",
  "nintendo switch": "gaming console",
  "wii": "gaming console",
  "facebook": "social media",
  "instagram": "social media",
  "twitter": "social media",
  "tiktok": "social media",
  "whatsapp": "messaging app",
  "snapchat": "social media",
  "youtube": "video platform",
  "linkedin": "social network",
  "netflix": "streaming service",
  "coca-cola": "cola",
  "pepsi": "cola",
  "red bull": "energy drink",
  "starbucks": "coffee shop",
  "mcdonalds": "fast food",
  "mcdonald's": "fast food",
  "nike": "sports brand",
  "adidas": "sports brand",
  "tesla": "electric car",
  "lego": "building blocks",
  "dji": "drone",
  "gopro": "action camera",
  "canon": "camera",
  "nikon": "camera",
  "rolex": "luxury watch"
};

const FORBIDDEN_BRANDS = [
  "apple", "google", "microsoft", "meta", "amazon", "disney", "marvel", 
  "toyota", "honda", "ford", "bmw", "mercedes", "audi", "porsche", 
  "ferrari", "lamborghini", "sony", "samsung", "lg", "panasonic",
  "gucci", "louis vuitton", "prada", "chanel", "dior", "hermes"
];

function sanitizeText(text) {
  if (!text) return text;
  let sanitized = text;
  
  // Replace specific product names with generic terms
  for (const [brand, replacement] of Object.entries(BRAND_REPLACEMENTS)) {
    const regex = new RegExp(`\\b${brand}\\b`, 'gi');
    sanitized = sanitized.replace(regex, replacement);
  }

  // Remove other forbidden brands entirely
  for (const brand of FORBIDDEN_BRANDS) {
    const regex = new RegExp(`\\b${brand}\\b`, 'gi');
    sanitized = sanitized.replace(regex, '');
  }

  // Clean up double spaces and isolated punctuation
  sanitized = sanitized.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!])/g, '$1').trim();
  return sanitized;
}

/**
 * Post-process metadata result by applying user settings (prefix, suffix, negative words).
 */
function postProcessMetadata(metadata, promptSettings, fileInfo = {}) {
  const s = promptSettings || {};
  let result = { ...metadata };
  let remainingNeeds;

  // --- Deterministic Selling Score Calculation ---
  let sellingScore = 0;
  if (result.commercialConcept || result.subjectClarity || result.technicalQuality || result.marketDemand) {
    const conceptMap = { evergreen: 32, popular: 25, niche: 15, none: 5 };
    const clarityMap = { perfect: 23, clear: 18, cluttered: 10, confusing: 3 };
    const qualityMap = { professional: 23, good: 18, acceptable: 10, poor: 3 };
    const demandMap = { high: 14, evergreen: 9, low: 4, none: 1 };

    const conceptVal = String(result.commercialConcept || '').toLowerCase().trim();
    const clarityVal = String(result.subjectClarity || '').toLowerCase().trim();
    const qualityVal = String(result.technicalQuality || '').toLowerCase().trim();
    const demandVal = String(result.marketDemand || '').toLowerCase().trim();

    sellingScore += conceptMap[conceptVal] || conceptMap.popular;
    sellingScore += clarityMap[clarityVal] || clarityMap.clear;
    sellingScore += qualityMap[qualityVal] || qualityMap.good;
    sellingScore += demandMap[demandVal] || demandMap.evergreen;

    result.sellingScore = sellingScore;
  } else if (result.sellingScore !== undefined) {
    result.sellingScore = Number(result.sellingScore) || 60;
  } else {
    result.sellingScore = 60;
  }

  // --- BRAND & TRADEMARK SAFETY SCANNER ---
  if (result.title) result.title = sanitizeText(result.title);
  if (result.description) result.description = sanitizeText(result.description);
  if (result.keywords) {
    let rawKws = "";
    if (Array.isArray(result.keywords)) {
      rawKws = result.keywords.join(', ');
    } else if (typeof result.keywords === 'string') {
      rawKws = result.keywords;
    } else {
      rawKws = String(result.keywords);
    }
    result.keywords = rawKws.split(',')
      .map(k => sanitizeText(k.trim()))
      .filter(k => k.length > 0)
      .join(', ');
  }
  // ----------------------------------------

  // Apply prefix/suffix to title
  let title = result.title || "";
  if (s.prefixEnabled && s.prefixText && s.prefixText.trim()) {
    title = `${s.prefixText.trim()} ${title}`;
  }
  if (s.suffixEnabled && s.suffixText && s.suffixText.trim()) {
    title = `${title} ${s.suffixText.trim()}`;
  }

  // Enforce title max chars and words based on Xpiks/Adobe Stock best practices
  let maxTitle = s.titleMaxChars || 150;
  if (maxTitle > 150) maxTitle = 150;
  
  if (title.length > maxTitle) {
    title = title.substring(0, maxTitle).replace(/\s+\S*$/, "");
  }
  
  // Enforce max 25 words to prevent "Title has too many words" warning
  const words = title.split(/\s+/);
  if (words.length > 25) {
    title = words.slice(0, 25).join(' ');
  }
  
  // Enforce minimum title length (only if not in smart mode)
  if (!s.smartMode && s.titleMinChars && title.length < s.titleMinChars) {
    title = title.padEnd(s.titleMinChars, ' ');
  }
  result.title = title;

  // Enforce description max chars
  if (!s.smartMode && s.descMaxChars && result.description && result.description.length > s.descMaxChars) {
    result.description = result.description.substring(0, s.descMaxChars).replace(/[\s.,;:!]+$/, "") + ".";
  }
  // Enforce minimum description length
  if (!s.smartMode && s.descMinChars && result.description && result.description.length < s.descMinChars) {
    result.description = result.description.padEnd(s.descMinChars, ' ');
  }

  // Remove negative keywords and STRICTLY enforce count
  if (result.keywords) {
    const rawKws = result.keywords.split(",").map(k => k.trim()).filter(Boolean);
    const banned = s.negKeywordsEnabled && s.negKeywords && s.negKeywords.trim()
      ? s.negKeywords.split(",").map(w => w.trim().toLowerCase()).filter(Boolean)
      : [];

    const hasHumanSubject = /\b(person|people|man|woman|child|kid|boy|girl|group|family|couple|model|friend|friends|worker|businessman|businesswoman|photographer|artist|teacher|student|doctor|nurse|player|gamer)\b/i.test((result.title || "") + " " + (result.description || ""));
    const abstractJunk = new Set(["fun", "leisure", "recreation", "hobby", "relaxation", "enjoyment", "lifestyle", "play", "interests", "pastime", "pleasure", "activity", "activities"]);

    const seenRoots = new Set();
    const rootCounts = {};
    
    let kws = [];
    let safeFallbackKws = [];
    let multiWordKwsToSplit = [];

    for (const kw of rawKws) {
      const kl = kw.toLowerCase().trim();

      // 1. Hard rejection: empty, length < 2, or banned
      if (kl.length < 2 || banned.includes(kl) || /^(a|an|the|and|or|of|in|on|at|to|for|with|by)$/i.test(kl)) {
        continue;
      }

      // 1b. Hard rejection: pure numbers, timestamps, or hash-like strings (e.g. 202606082234, c35f75d7)
      if (/^\d+$/.test(kl)) continue;                        // purely numeric (timestamps, IDs)
      if (/^[a-f0-9]{8,}$/i.test(kl)) continue;              // hex hash strings
      if (/^\d{4,}\w*$/.test(kl) && kl.length >= 8) continue;// date-prefixed strings like 20260608abcd

      // 2. Camera specs / technical spam: hard rejection
      if (/\b(dslr|4k|8k|camera|megapixels|mp|resolution|fps|lens|shutter|iso|aperture|slr|sensor|photographs|photographed|shoot|shooting|frame)\b/i.test(kl)) {
        continue;
      }

      // 3. Word count filtering: check if user requested single-word keywords only
      const wordCount = kl.split(/\s+/).length;
      if (s.singleWordKeywords && wordCount > 1) {
        multiWordKwsToSplit.push(kw);
        continue; // STRICT: Single-word only, reject phrases
      }
      if (wordCount >= 3) {
        continue; // Max 2 words (no spammy long phrases)
      }

      // Check abstract junk filter
      const isAbstractJunk = !hasHumanSubject && abstractJunk.has(kl);
      
      // Check root duplicate filter
      const root = kl.replace(/s$/, '').replace(/ing$/, '').replace(/ed$/, '');
      const isRootDuplicate = seenRoots.has(root);
      
      // Check anti-stuffing filter
      let isStuffed = false;
      const wordsInKw = kl.split(/\s+/);
      for (const w of wordsInKw) {
        if (w.length < 3) continue;
        const r = w.replace(/s$/, '').replace(/ing$/, '').replace(/ed$/, '');
        if ((rootCounts[r] || 0) >= 3) {
          isStuffed = true;
          break;
        }
      }

      if (isAbstractJunk || isRootDuplicate || isStuffed) {
        // Safe fallback keyword
        safeFallbackKws.push(kw);
      } else {
        // Accepted keyword
        kws.push(kw);
        seenRoots.add(root);
        for (const w of wordsInKw) {
          if (w.length < 3) continue;
          const r = w.replace(/s$/, '').replace(/ing$/, '').replace(/ed$/, '');
          rootCounts[r] = (rootCounts[r] || 0) + 1;
        }
      }
    }

    // Quality scoring
    const getKeywordScore = (keyword) => {
      const kl = keyword.toLowerCase().trim();
      
      if (result.keywordScores) {
        const scoreKey = Object.keys(result.keywordScores).find(
          k => k.toLowerCase().trim() === kl
        );
        if (scoreKey !== undefined) {
          const exactScore = result.keywordScores[scoreKey];
          if (exactScore !== undefined) {
            const numScore = Number(exactScore);
            if (!isNaN(numScore)) return numScore;
          }
        }
      }

      // Fallback if AI didn't score it (e.g., padded keywords from title/desc)
      const junk = new Set(["design", "image", "photo", "picture", "file", "graphic", "visual",
        "element", "object", "thing", "item", "nice", "great", "good", "look", "use"]);
      if (junk.has(kl) || kl.length < 3) return 10;
      
      return 50; // Default to exact middle Medium (Yellow)
    };

    // Sort both arrays by score (descending)
    kws.sort((a, b) => getKeywordScore(b) - getKeywordScore(a));
    safeFallbackKws.sort((a, b) => getKeywordScore(b) - getKeywordScore(a));

    if (s.smartMode) {
      // AI Auto Decide - strict quality filter and cap at 49
      let highQualityKws = kws.filter(k => getKeywordScore(k) >= 40);
      
      // Ensure at least 20 keywords
      const minSmartCount = 20;
      if (highQualityKws.length < minSmartCount) {
        remainingNeeds = minSmartCount - highQualityKws.length;
        if (remainingNeeds > 0) {
          const hqSafeFallback = safeFallbackKws.filter(w => getKeywordScore(w) >= 40 && !highQualityKws.includes(w));
          highQualityKws.push(...hqSafeFallback.slice(0, remainingNeeds));
        }
        
        remainingNeeds = minSmartCount - highQualityKws.length;
        if (remainingNeeds > 0) {
          const titleDescWords = ((result.title || "") + " " + (result.description || ""))
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length >= 4 && !/^(the|and|for|with|this|that|from|have|has|are|was|were|you|your)$/.test(w));
          
          const uniqueExtra = [...new Set(titleDescWords)]
            .filter(w => !highQualityKws.includes(w) && getKeywordScore(w) >= 40);
          highQualityKws.push(...uniqueExtra.slice(0, remainingNeeds));
        }
        
        remainingNeeds = minSmartCount - highQualityKws.length;
        if (remainingNeeds > 0) {
          // Use lower-quality AI keywords before resorting to title/desc words
          const lowerQualityAiKws = kws.filter(k => getKeywordScore(k) < 40 && !highQualityKws.includes(k));
          highQualityKws.push(...lowerQualityAiKws.slice(0, remainingNeeds));
        }
        
        remainingNeeds = minSmartCount - highQualityKws.length;
        if (remainingNeeds > 0) {
          // Use words from title/desc as last resort (no generic array injection)
          const titleDescWords = ((result.title || "") + " " + (result.description || ""))
            .toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
            .filter(w => w.length >= 4 && !/^(the|and|for|with|this|that|from|have|has|are|was|were|you|your|also|into|more|some|than|when|will|they)$/.test(w));
          const uniqueExtra = [...new Set(titleDescWords)].filter(w => !highQualityKws.includes(w));
          highQualityKws.push(...uniqueExtra.slice(0, remainingNeeds));
        }
      }
      
      kws = highQualityKws;
      if (kws.length > 49) {
        kws = kws.slice(0, 49);
      }
    } else {
      // Force Exact Count
      let finalKws = kws.filter(k => getKeywordScore(k) >= 40);
      
      if (s.keywordCount) {
        // Removed Fallback 0 to prevent low-score irrelevant keywords.
        // Fallback 1: If singleWordKeywords is active, split multi-word keywords into individual words
        remainingNeeds = s.keywordCount - finalKws.length;
        if (remainingNeeds > 0 && s.singleWordKeywords && multiWordKwsToSplit.length > 0) {
          let splitWords = [];
          for (const phrase of multiWordKwsToSplit) {
            const words = phrase.split(/\s+/);
            for (const w of words) {
              const wl = w.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
              if (wl.length >= 2 && !banned.includes(wl) && !/^(the|and|for|with|this|that|from|have|has|are|was|were|you|your)$/.test(wl)) {
                splitWords.push(w);
              }
            }
          }
          const uniqueSplitWords = [...new Set(splitWords)].filter(w => !finalKws.includes(w));
          uniqueSplitWords.sort((a, b) => getKeywordScore(b) - getKeywordScore(a));
          finalKws.push(...uniqueSplitWords.slice(0, remainingNeeds));
        }

        // Fallback 2: Use safeFallbackKws with high score (>= 40)
        remainingNeeds = s.keywordCount - finalKws.length;
        if (remainingNeeds > 0) {
          const hqSafeFallback = safeFallbackKws.filter(w => getKeywordScore(w) >= 40 && !finalKws.includes(w));
          finalKws.push(...hqSafeFallback.slice(0, remainingNeeds));
        }

        // Fallback 3: Extract words from title and description that score highly (>= 40)
        remainingNeeds = s.keywordCount - finalKws.length;
        if (remainingNeeds > 0) {
          const titleDescWords = ((result.title || "") + " " + (result.description || ""))
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length >= 4 && !/^(the|and|for|with|this|that|from|have|has|are|was|were|you|your)$/.test(w));
          
          const uniqueExtra = [...new Set(titleDescWords)]
            .filter(w => !finalKws.includes(w) && getKeywordScore(w) >= 40);
          finalKws.push(...uniqueExtra.slice(0, remainingNeeds));
        }

        // Removed Fallbacks 4, 5, 6, and 7 to prevent injection of generic or low-quality terms.

        kws = finalKws.slice(0, s.keywordCount);
      } else {
        kws = finalKws;
      }
    }

    // Final strict sort by score (descending) to ensure Green >= 80 comes before Yellow >= 40
    kws.sort((a, b) => getKeywordScore(b) - getKeywordScore(a));
    result.keywords = kws.join(", ");
  }

  return result;
}

let globalKeyIndex = 0;

/**
 * Helper to run content generation with a strict timeout (default 45 seconds).
 */
async function generateContentWithTimeout(model, contentParts, timeoutMs = 90000) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Model request timed out (90s). Google API is taking too long.")), timeoutMs);
  });

  const executeRequest = async () => {
    // NOTE: Do NOT pass {timeout} as a second argument – it is not supported by
    // the @google/generative-ai SDK and causes the request to silently hang.
    const res = await model.generateContent(contentParts);
    // res.response is a plain property (not a Promise); access it directly.
    return res.response;
  };

  try {
    const response = await Promise.race([
      executeRequest(),
      timeoutPromise
    ]);
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate metadata for an image or EPS file.
 *
 * @param {string}  imageBuffer  - Base64-encoded image data (PNG/JPEG preview)
 * @param {string}  mimeType     - MIME type of the image buffer (always image/png or image/jpeg)
 * @param {string[]} apiKeys     - Array of Gemini API keys to try
 * @param {object}  [fileInfo]   - Extra context about the original file
 * @param {boolean} [fileInfo.isEps]         - Source was EPS
 * @param {boolean} [fileInfo.isPlaceholder] - Preview is a generated placeholder
 * @param {string}  [fileInfo.fileName]      - Original file name

/**
 * Main function to orchestrate Gemini or OpenAI-compatible generation.
 *
 * @param {string} imageBuffer           - Base64 string of the image
 * @param {string} mimeType              - Mime type of the image
 * @param {Array<string>} apiKeys        - Array of API keys
 * @param {string} apiProvider           - ID of the AI provider
 * @param {object} fileInfo              - Context info
 */
export async function generateMetadata(imageBuffer, mimeType, apiKeys, apiProvider = "gemini", fileInfo = {}) {
  const { isEps = false, isPlaceholder = false, isVideo = false, fileName = "file", extractedTextContext = null, promptSettings = {} } = fileInfo;

  let lastError = null;
  
  // Atomically claim the current key index and immediately advance globalKeyIndex
  // so concurrent calls receive distinct API keys!
  const startKeyIndex = globalKeyIndex;
  if (apiKeys && apiKeys.length > 0) {
    globalKeyIndex = (globalKeyIndex + 1) % apiKeys.length;
  }

  // Try each API key precisely once for this specific file request if needed
  for (let k = 0; k < apiKeys.length; k++) {
    const currentKeyIndex = (startKeyIndex + k) % apiKeys.length;
    const keyItem = apiKeys[currentKeyIndex];
    
    // Support both new {provider, key} object format and legacy string format
    let currentProvider = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
    if (Array.isArray(currentProvider)) currentProvider = currentProvider[0] || 'gemini';
    const apiKey = typeof keyItem === 'object' ? keyItem.key : keyItem;

    // Branch to OpenAI compatible providers if not Gemini
    if (currentProvider !== "gemini") {
      try {
        console.log(`[Attempt] Provider: ${currentProvider} using key index ${currentKeyIndex}`);
        let parsed;
        if (currentProvider === "groq") {
          const prompt = buildGroqPrompt(fileInfo);
          parsed = await fetchGroq(apiKey, prompt, imageBuffer, mimeType, true, promptSettings);
        } else if (currentProvider === "openai") {
          const prompt = buildOpenAIPrompt(fileInfo);
          parsed = await fetchOpenAI(apiKey, prompt, imageBuffer, mimeType, true, promptSettings);
        } else if (currentProvider === "openrouter") {
          const prompt = buildOpenRouterPrompt(fileInfo);
          parsed = await fetchOpenRouter(apiKey, prompt, imageBuffer, mimeType, true, promptSettings);
        } else if (currentProvider === "mistral") {
          const prompt = buildMistralPrompt(fileInfo);
          parsed = await fetchMistral(apiKey, prompt, imageBuffer, mimeType, true, promptSettings);
        } else {
          throw new Error("Unknown provider: " + currentProvider);
        }
        
        console.log(`[Success] Metadata generated using ${currentProvider}!`);
        return postProcessMetadata(parsed, promptSettings, fileInfo);
      } catch (error) {
        console.warn(`[Fail] ${currentProvider} (key ${currentKeyIndex}): ${error.message}`);
        lastError = error;
        if (error.message.includes("401") || error.message.includes("403") || error.message.includes("429")) {
          continue; // Try next key gracefully
        }
        throw error; // Other errors abort immediately
      }
    }

    // Gemini branch
    try {
      const prompt = buildGeminiPrompt(fileInfo);
      const parsed = await fetchGemini(apiKey, currentKeyIndex, prompt, imageBuffer, mimeType, true, promptSettings);
      return postProcessMetadata(parsed, promptSettings, fileInfo);
    } catch (error) {
      lastError = error;
      const keyHitRateLimit = error.keyHitRateLimit || false;
      if (keyHitRateLimit) {
        continue; // Switch key
      }
      if (error.message.includes("API_KEY_INVALID") || error.message.includes("401") || error.message.includes("403")) {
        continue; // Switch key
      }
      throw error;
    }
  }

  if (lastError && (lastError.message.includes("429") || lastError.message.includes("quota"))) {
    throw new Error(`API Rate Limit Reached on all ${apiKeys.length} keys. Please wait 30 seconds before generating again.`);
  }

  if (lastError) {
    let msg = lastError.message || String(lastError);
    if (msg.length > 250) {
      msg = msg.substring(0, 250) + "... (truncated)";
    }
    throw new Error(`Critical API Error: ${msg}`);
  }

  throw new Error("Critical: Could not connect to any Gemini model. Please check your API keys.");
}

/**
 * Generate a detailed prompt from an image.
 */
export async function generatePromptFromImage(imageBuffer, mimeType, apiKeys, apiProvider = "gemini", promptSettings = {}) {
  const mode = promptSettings.promptSimilarityMode || 'Exact Match';
  
  if (mode === "Unique Variation") {
    // Variation mode: creative narrative paragraph
    const variationPrompt = `You are a creative AI art prompt engineer specializing in Midjourney v6, Stable Diffusion XL, DALL-E 3, and Flux.

UNIQUE VARIATION MODE: Do NOT recreate this image. Instead, analyze its theme, mood, and subject, then invent a visually distinct but thematically related variation. Change the subject's pose, camera angle, lighting, or environment significantly to ensure the result is entirely unique and avoids duplicate stock content.

Output ONLY the raw prompt text as ONE single continuous paragraph (80–130 words). No bullets, no line breaks, no intro phrases like "This image shows".

Use this structure blended into a flowing description:
[Artistic Medium] + [Subject + appearance + action] + [New environment/setting] + [New lighting & color palette] + [Camera angle & composition]

Be specific, vivid, and commercially viable. Avoid watermarks, brand names, and explicit content.`;

    // Store variation prompt and fall through to the API call logic
    const promptToUse = variationPrompt;
    
    // Prioritize keys that match the selected provider
    const preferredKeys = [];
    const otherKeys = [];
    (apiKeys || []).forEach(keyItem => {
      let p = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
      if (Array.isArray(p)) p = p[0] || 'gemini';
      if (p === apiProvider) preferredKeys.push(keyItem);
      else otherKeys.push(keyItem);
    });
    const orderedKeys = [...preferredKeys, ...otherKeys];

    let lastError = null;
    const startKeyIndex = globalKeyIndex;
    if (orderedKeys.length > 0) globalKeyIndex = (globalKeyIndex + 1) % orderedKeys.length;

    for (let k = 0; k < orderedKeys.length; k++) {
      const currentKeyIndex = (startKeyIndex + k) % orderedKeys.length;
      const keyItem = orderedKeys[currentKeyIndex];
      let currentProvider = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
      if (Array.isArray(currentProvider)) currentProvider = currentProvider[0] || 'gemini';
      const apiKey = typeof keyItem === 'object' ? keyItem.key : keyItem;

      if (currentProvider !== "gemini") {
        try {
          let text;
          if (currentProvider === "groq") text = await fetchGroq(apiKey, promptToUse, imageBuffer, mimeType, false);
          else if (currentProvider === "openai") text = await fetchOpenAI(apiKey, promptToUse, imageBuffer, mimeType, false);
          else if (currentProvider === "openrouter") text = await fetchOpenRouter(apiKey, promptToUse, imageBuffer, mimeType, false);
          else if (currentProvider === "mistral") text = await fetchMistral(apiKey, promptToUse, imageBuffer, mimeType, false);
          else throw new Error("Unknown provider: " + currentProvider);
          const finalPrompt = typeof text === 'string' ? text.trim() : (text?.title || JSON.stringify(text));
          return { prompt: finalPrompt, provider: currentProvider };
        } catch (error) {
          lastError = error;
          if (error.message.includes("401") || error.message.includes("403") || error.message.includes("429")) continue;
          throw error;
        }
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      let modelsToAttempt = [...modelsToTry];
      for (let i = 0; i < modelsToAttempt.length; i++) {
        const modelName = modelsToAttempt[i];
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const response = await generateContentWithTimeout(model, [{ inlineData: { data: imageBuffer, mimeType } }, { text: promptToUse }]);
          const out = response.text().trim();
          let totalTokens = 0;
          try { const um = response.usageMetadata; if (um && typeof um.totalTokenCount === "number") totalTokens = um.totalTokenCount; } catch { /* ignore */ }
          recordApiUsage("gemini", apiKey, { totalTokens, requests: 1 });
          return { prompt: out, provider: "gemini" };
        } catch (error) {
          lastError = error;
          if (error.message.includes("API_KEY_INVALID") || error.message.toLowerCase().includes("key not valid") || error.message.includes("403") || error.message.includes("429") || error.message.toLowerCase().includes("quota")) break;
          if (error.message.includes("400") || error.message.includes("404")) continue;
        }
      }
    }
    if (lastError && (lastError.message.includes("429") || lastError.message.includes("quota"))) throw new Error(`API Rate Limit Reached on all ${apiKeys.length} keys.`);
    if (lastError) {
      let msg = lastError.message || String(lastError);
      if (msg.length > 250) msg = msg.substring(0, 250) + "... (truncated)";
      throw new Error(`API Error: ${msg}`);
    }
    throw new Error(`Could not connect to any ${apiProvider} model.`);
  }

  const exactMatchPrompt = `Act as a professional photographer and AI art director. Analyze the provided image in extreme detail and write a comprehensive, technical image generation prompt that will recreate this exact image in a text-to-image AI model (like Midjourney or DALL-E).

Focus on capturing these specific dimensions in your description:
1. Primary subject(s) and their exact physical appearance, attire, and pose.
2. Camera details and framing (e.g., 85mm lens, macro, wide shot, depth of field, f/1.8). If it's an illustration, specify the art style and medium (e.g., digital painting, vector art, 3D render).
3. Lighting setup (e.g., cinematic, softbox, harsh sunlight, neon glow, rim lighting).
4. Color palette, color grading, and overall mood/atmosphere.
5. Background and environmental details.

CRITICAL RULES:
- Output ONLY the final raw prompt text.
- Do NOT include any introductory sentences, explanations, or tips.
- Do NOT use markdown, bold text, or bullet points.
- Output the result as a single, continuous paragraph.
- SAFETY RULE: Ensure the vocabulary is completely safe. Avoid any overly sensitive, violent, or explicit terminology that could trigger strict AI safety filters.`;



  // Prioritize keys that match the selected provider, fallback to others if limit is reached
  const preferredKeys = [];
  const otherKeys = [];
  (apiKeys || []).forEach(keyItem => {
    let p = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
    if (Array.isArray(p)) p = p[0] || 'gemini';
    if (p === apiProvider) preferredKeys.push(keyItem);
    else otherKeys.push(keyItem);
  });
  const orderedKeys = [...preferredKeys, ...otherKeys];

  let lastError = null;
  const startKeyIndex = globalKeyIndex;
  if (orderedKeys.length > 0) {
    globalKeyIndex = (globalKeyIndex + 1) % orderedKeys.length;
  }

  for (let k = 0; k < orderedKeys.length; k++) {
    const currentKeyIndex = (startKeyIndex + k) % orderedKeys.length;
    const keyItem = orderedKeys[currentKeyIndex];
    
    // Support both new {provider, key} object format and legacy string format
    let currentProvider = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
    if (Array.isArray(currentProvider)) currentProvider = currentProvider[0] || 'gemini';
    const apiKey = typeof keyItem === 'object' ? keyItem.key : keyItem;

    // OpenAI Compatible Route (Groq, etc.)
    if (currentProvider !== "gemini") {
      try {
        console.log(`[Attempt] Provider: ${currentProvider} (Image to Prompt) using key index ${currentKeyIndex}`);
        let text;
        if (currentProvider === "groq") text = await fetchGroq(apiKey, exactMatchPrompt, imageBuffer, mimeType, false);
        else if (currentProvider === "openai") text = await fetchOpenAI(apiKey, exactMatchPrompt, imageBuffer, mimeType, false);
        else if (currentProvider === "openrouter") text = await fetchOpenRouter(apiKey, exactMatchPrompt, imageBuffer, mimeType, false);
        else if (currentProvider === "mistral") text = await fetchMistral(apiKey, exactMatchPrompt, imageBuffer, mimeType, false);
        else throw new Error("Unknown provider: " + currentProvider);
        const rawText = typeof text === 'string' ? text.trim() : (text?.title || JSON.stringify(text));
        return {
          prompt: parseExactMatchOutput(rawText),
          provider: currentProvider
        };
      } catch (error) {
        lastError = error;
        if (error.message.includes("401") || error.message.includes("403") || error.message.includes("429")) {
          continue; // Try next key smoothly
        }
        throw error;
      }
    }

    // Gemini Route
    const genAI = new GoogleGenerativeAI(apiKey);
    let modelsToAttempt = [...modelsToTry];

    for (let i = 0; i < modelsToAttempt.length; i++) {
      const modelName = modelsToAttempt[i];
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const response = await generateContentWithTimeout(model, [
          {
            inlineData: {
              data: imageBuffer,
              mimeType: mimeType,
            },
          },
          { text: exactMatchPrompt },
        ]);
        const out = response.text().trim();

        let totalTokens = 0;
        try {
          const um = response.usageMetadata;
          if (um && typeof um.totalTokenCount === "number") totalTokens = um.totalTokenCount;
        } catch {
          /* ignore */
        }
        recordApiUsage("gemini", apiKey, { totalTokens, requests: 1 });

        return {
          prompt: parseExactMatchOutput(out),
          provider: "gemini"
        };
      } catch (error) {
        console.warn(`[Fail] ${modelName} on key ${currentKeyIndex} (ImageToPrompt): ${error.message}`);
        lastError = error;

        if (
          error.message.includes("API_KEY_INVALID") ||
          error.message.toLowerCase().includes("key not valid") ||
          error.message.toLowerCase().includes("invalid key") ||
          error.message.includes("403") ||
          error.message.includes("429") ||
          error.message.toLowerCase().includes("quota") ||
          error.message.toLowerCase().includes("limit")
        ) {
          console.warn(`[Key Exhausted] Key index ${currentKeyIndex} is invalid or exhausted. Proceeding to next key.`);
          break; // Break inner model loop to smoothly test the NEXT API key in the outer loop
        }

        if (error.message.includes("400")) {
          throw new Error(`Invalid Image or Prompt (400 Bad Request): ${error.message}`);
        }
        if (error.message.includes("404")) continue;
      }
    }
  }

  if (lastError && (lastError.message.includes("429") || lastError.message.includes("quota"))) {
    throw new Error(`API Rate Limit Reached on all ${apiKeys.length} keys. Google says: "${lastError.message.substring(0, 150)}...". Please check your Google Cloud quota or region.`);
  }

  throw (
    lastError ||
    new Error(`Critical: Could not connect to any ${apiProvider} model. Please check your API keys.`)
  );
}

function parseExactMatchOutput(raw) {
  if (!raw) return '';
  let clean = raw.trim();
  
  // Remove markdown code blocks if any (e.g. ```markdown ... ```)
  clean = clean.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, '$1').trim();
  
  // Remove common prefixes
  clean = clean.replace(/^(here is the prompt:|prompt:|\*\*prompt:\*\*|>|interactive prompt:)/i, '').trim();
  
  // Strip leading/trailing double quotes or single quotes
  clean = clean.replace(/^["']|["']$/g, '').trim();
  
  // Strip common tips/notes sections at the end
  const splitKeywords = [
    /\n\s*Tips for/i,
    /\n\s*Note:/i,
    /\n\s*\*\*Tips/i,
    /\n\s*\*\*Note/i,
    /\n\s*### Tips/i,
    /\n\s*### Note/i,
    /\n\s*Aspect Ratio/i
  ];
  for (const rx of splitKeywords) {
    const index = clean.search(rx);
    if (index !== -1) {
      clean = clean.substring(0, index).trim();
    }
  }
  
  return clean;
}

/**
 * Scans an image for policy violations (copyright, watermarks, explicit content, spam)
 * Returns { isSafe: boolean, reason: string }
 */
export async function analyzeImageSecurity(imageBuffer, mimeType, apiKeys, apiProvider = "gemini") {
  const prompt = `Analyze this image strictly for stock photography marketplace policy violations.
Check for the following issues:
1. Watermarks, signatures, or dates indicating ownership by a specific photographer/agency (e.g., "© 2024 John Doe", "Shutterstock", "Getty Images"). Note: General typography, event titles, or template text (like "2026 Soccer Tournament") are perfectly FINE and should NOT be flagged.
2. Copyrighted brand logos, trademarks, or highly recognizable intellectual property (e.g., Apple logo, Nike swoosh, Disney characters, Marvel characters).
3. Explicit, offensive, excessively violent, or NSFW content.

If ANY of these policy violations are found, mark it as unsafe and provide a short, specific reason.
If the image is clean (even if it contains event posters, template text, or typography), mark it as safe.

Return ONLY a valid JSON object matching this schema:
{
  "isSafe": boolean,
  "reason": "Specific reason if not safe, otherwise empty string"
}`;

  let lastError = null;
  const startKeyIndex = globalKeyIndex;
  if (apiKeys && apiKeys.length > 0) {
    globalKeyIndex = (globalKeyIndex + 1) % apiKeys.length;
  }

  for (let k = 0; k < apiKeys.length; k++) {
    const currentKeyIndex = (startKeyIndex + k) % apiKeys.length;
    const keyItem = apiKeys[currentKeyIndex];
    
    let currentProvider = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
    if (Array.isArray(currentProvider)) currentProvider = currentProvider[0] || 'gemini';
    const apiKey = typeof keyItem === 'object' ? keyItem.key : keyItem;

    if (currentProvider !== "gemini") {
      try {
        const enrichedPrompt = `You are a strict Stock Photography AI Moderator.\n${prompt}`;
        let parsed;
        if (currentProvider === "groq") parsed = await fetchGroq(apiKey, enrichedPrompt, imageBuffer, mimeType, true);
        else if (currentProvider === "openai") parsed = await fetchOpenAI(apiKey, enrichedPrompt, imageBuffer, mimeType, true);
        else if (currentProvider === "openrouter") parsed = await fetchOpenRouter(apiKey, enrichedPrompt, imageBuffer, mimeType, true);
        else if (currentProvider === "mistral") parsed = await fetchMistral(apiKey, enrichedPrompt, imageBuffer, mimeType, true);
        else throw new Error("Unknown provider: " + currentProvider);
        return parsed;
      } catch (error) {
        lastError = error;
        if (error.message.includes("401") || error.message.includes("403") || error.message.includes("429")) {
          continue;
        }
        throw error;
      }
    }

    // Gemini branch
    const genAI = new GoogleGenerativeAI(apiKey);
    let modelsToAttempt = [...modelsToTry];

    for (let i = 0; i < modelsToAttempt.length; i++) {
      const modelName = modelsToAttempt[i];
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const response = await generateContentWithTimeout(model, [
          {
            inlineData: {
              data: imageBuffer,
              mimeType: mimeType,
            },
          },
          { text: prompt },
        ]);
        const out = response.text().trim();
        const cleaned = out.replace(/```json/g, "").replace(/```/g, "").trim();
        
        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch (e) {
          const match = cleaned.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
          else throw new Error("JSON parse error");
        }

        let totalTokens = 0;
        try {
          const um = response.usageMetadata;
          if (um && typeof um.totalTokenCount === "number") totalTokens = um.totalTokenCount;
        } catch { /* ignore */ }
        recordApiUsage("gemini", apiKey, { totalTokens, requests: 1 });

        return parsed;
      } catch (error) {
        console.warn(`[Fail] ${modelName} on key ${currentKeyIndex} (SecurityScan): ${error.message}`);
        lastError = error;
        const isQuotaExceeded =
          error.message.toLowerCase().includes("quota") ||
          error.message.toLowerCase().includes("exceeded") ||
          error.message.toLowerCase().includes("billing");

        if (isQuotaExceeded) {
          console.warn(`[Quota Exceeded] Key index ${currentKeyIndex} has no remaining daily quota for security scan. Proceeding to next key.`);
          break; // Break inner model loop → try next key immediately
        }

        const isRateLimit = error.message.includes("429") || error.message.toLowerCase().includes("limit");
        const isHighDemand = error.message.includes("503") || error.message.toLowerCase().includes("high demand");
        
        if (isRateLimit || isHighDemand) {
          // Retry current model up to 3 times with exponential backoff
          let retried = false;
          for (let retry = 0; retry < 3; retry++) {
            const waitMs = isRateLimit ? (retry + 1) * 10000 : (retry + 1) * 3000;
            const errorType = isRateLimit ? "429 Rate Limit" : "503 High Demand";
            console.warn(`[SecurityScan ${errorType}] Waiting ${waitMs / 1000}s before retry ${retry + 1}/3...`);
            await new Promise(r => setTimeout(r, waitMs));
            try {
              const model2 = genAI.getGenerativeModel({ model: modelName });
              const response2 = await generateContentWithTimeout(model2, [
                { inlineData: { data: imageBuffer, mimeType: mimeType } },
                { text: prompt },
              ]);
              const text2 = response2.text();
              const cleaned2 = text2.replace(/```json/g, "").replace(/```/g, "").trim();
              let parsed2;
              try { parsed2 = JSON.parse(cleaned2); }
              catch (e2) {
                const match2 = cleaned2.match(/\{[\s\S]*\}/);
                if (match2) parsed2 = JSON.parse(match2[0]);
                else throw new Error("JSON parse error");
              }
              retried = true;
              return parsed2;
            } catch (retryErr) {
              lastError = retryErr;
              const isStillRateLimit = retryErr.message.includes("429") || retryErr.message.toLowerCase().includes("quota");
              const isStillHighDemand = retryErr.message.includes("503") || retryErr.message.toLowerCase().includes("high demand");
              if ((isRateLimit && !isStillRateLimit) || (isHighDemand && !isStillHighDemand)) break;
            }
          }
          if (!retried) {
            if (isRateLimit) break; // If still rate limited after 3 retries, skip key
            continue; // Try next model
          }
          break;
        }

        if (
          error.message.includes("API_KEY_INVALID") ||
          error.message.toLowerCase().includes("key not valid") ||
          error.message.toLowerCase().includes("invalid key") ||
          error.message.includes("403")
        ) {
          console.warn(`[Key Exhausted] Key index ${currentKeyIndex} is invalid or exhausted. Proceeding to next key.`);
          break; // Break inner loop, go to next key
        }
        if (error.message.includes("400")) {
          throw new Error(`Invalid Image or Prompt (400 Bad Request): ${error.message}`);
        }
        if (error.message.includes("404")) continue;
      }
    }
  }

  if (lastError && (lastError.message.includes("429") || lastError.message.includes("quota"))) {
    throw new Error(`API Rate Limit Reached. Please wait 30 seconds.`);
  }

  if (lastError) {
    let msg = lastError.message || String(lastError);
    if (msg.length > 250) msg = msg.substring(0, 250) + "... (truncated)";
    throw new Error(`API Error: ${msg}`);
  }

  throw new Error(`Could not connect to any model for security scan.`);
}

