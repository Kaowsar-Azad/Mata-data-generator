import { GoogleGenerativeAI } from "@google/generative-ai";
import { recordApiUsage } from "./apiUsageTracker.js";

/**
 * Super Robust Gemini Service with Multi-Version and Multi-Model fallbacks
 * Supports both raster images and EPS files (via extracted/placeholder previews)
 */

const modelsToTry = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro"
];

// Fallback dynamic fetch
async function getAvailableModels(apiKey) {
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

/**
 * Build the metadata prompt depending on file context.
 *
 * @param {object} options
 * @param {boolean} options.isEps         - Is the source an EPS vector file?
 * @param {boolean} options.isPlaceholder - Was the preview a generated placeholder (no embedded preview)?
 * @param {string}  options.fileName      - Original filename for extra context
 */
function buildPrompt({ isEps, isPlaceholder, fileName, extractedTextContext, promptSettings }) {
  // Clean up filename (remove extension, replace dashes/underscores with spaces)
  let cleanName = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
  
  // If the filename looks like a hash or random string (e.g. c35f75d7...), ignore it
  const isHash = /^[a-f0-9]{20,}$/i.test(cleanName) || cleanName.length > 30 && !cleanName.includes(" ");
  if (isHash) {
    cleanName = "a professional illustration";
  }

  // Default settings fallback
  const s = promptSettings || {
    titleMaxChars: 70,
    descMaxChars: 150,
    keywordCount: 48
  };

  let fileContext = "";
  
  if (isEps) {
    if (isPlaceholder) {
      let deepContext = "";
      if (extractedTextContext && extractedTextContext.trim().length > 0) {
        deepContext = `\n\nI managed to extract the following hidden raw data from the EPS file's code (like layer names, colors, and embedded text):\n${extractedTextContext}\n\nPlease use these deeply extracted clues (especially colors, layers, and embedded text) to build highly accurate metadata!`;
      }

      fileContext = `CRITICAL INSTRUCTION: The attached image is a FAKE PLACEHOLDER. Do NOT describe the attached image. IGNORE the image completely.
Instead, you must guess the content of this vector illustration purely based on its file name: "${cleanName}" and the hidden data below.${deepContext}

Generate metadata as if you are looking at a vector illustration about "${cleanName}". Do NOT mention "file format", "EPS icon", or "placeholder".`;
    } else {
      fileContext = `This is a preview extracted from a stock vector illustration in EPS format. The file name is "${cleanName}". Please describe the actual illustration shown in the image.`;
    }
  } else {
    // Standard raster file
    fileContext = `The file name is "${cleanName}". Please describe the image.`;
  }

  // Build negative words instruction
  let negInstructions = "";
  if (s.negTitleEnabled && s.negTitleWords && s.negTitleWords.trim()) {
    negInstructions += `\n- The title MUST NOT contain any of these words: ${s.negTitleWords}.`;
  }
  if (s.negKeywordsEnabled && s.negKeywords && s.negKeywords.trim()) {
    negInstructions += `\n- The keywords MUST NOT contain any of these words: ${s.negKeywords}.`;
  }

  const targetPlatform = s.exportPlatform || "General";
  let platformContext = "";
  
  if (targetPlatform === "Adobe Stock") {
    platformContext = "Platform: Adobe Stock. Buyers here search with conceptual and emotional terms alongside literal ones.";
  } else if (targetPlatform === "Shutterstock") {
    platformContext = "Platform: Shutterstock. Buyers here use very literal and specific search terms. Keep title and description precise and factual.";
  } else if (targetPlatform === "FreePik") {
    platformContext = "Platform: FreePik. Buyers look for design elements, templates, and vectors. Mention editability and design utility where relevant.";
  } else if (targetPlatform === "Vecteezy") {
    platformContext = "Platform: Vecteezy. Buyers search for practical design assets and flat design illustrations.";
  } else if (targetPlatform === "Pond5") {
    platformContext = "Platform: Pond5. Buyers are media professionals. Be very literal and descriptive.";
  } else if (targetPlatform === "Getty") {
    platformContext = "Platform: Getty Images. Keep an authentic, editorial tone. No marketing language.";
  } else if (targetPlatform === "Depositphotos") {
    platformContext = "Platform: Depositphotos. Be straightforward and commercially focused.";
  } else {
    platformContext = "Platform: General stock sites.";
  }

  let mediaHintStr = "";
  if (s.mediaTypeHint && s.mediaTypeHint !== "None / Auto-detect") {
    mediaHintStr = `\nNote: This file is a "${s.mediaTypeHint}".`;
  }

  let customInstStr = "";
  if (s.customInstruction && s.customInstruction.trim()) {
    customInstStr = `\n\nUSER INSTRUCTION (follow strictly):\n"${s.customInstruction.trim()}"`;
  }

  let categoryList = "";
  if (targetPlatform === "Adobe Stock") {
    categoryList = `["Animals", "Buildings and Architecture", "Business", "Drinks", "The Environment", "States of Mind", "Food", "Graphic Resources", "Hobbies and Leisure", "Industry", "Landscapes", "Lifestyle", "People", "Plants and Flowers", "Culture and Religion", "Science", "Social Issues", "Sports", "Technology", "Transport", "Travel"]`;
  } else if (targetPlatform === "Shutterstock") {
    categoryList = `["Abstract", "Animals/Wildlife", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks", "Business/Finance", "Education", "Food and Drink", "Healthcare/Medical", "Holidays", "Illustrations/Clip-Art", "Industrial", "Interiors", "Miscellaneous", "Nature", "Objects", "Parks/Outdoor", "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vintage"]`;
  } else if (targetPlatform === "General") {
    // Universal hybrid list of broad categories compatible across all platforms
    categoryList = `["Abstract & Textures", "Animals & Wildlife", "Architecture & Buildings", "Business & Finance", "Education & Science", "Food & Drink", "Healthcare & Medical", "Holidays & Celebrations", "Illustrations & Clipart", "Industry & Technology", "Landscapes & Nature", "Lifestyle & People", "Objects & Concepts", "Sports & Recreation", "Transportation & Travel"]`;
  } else {
    // Fallback/Others (Pond5, Getty, Depositphotos, etc.) - use Shutterstock list as it is highly detailed
    categoryList = `["Abstract", "Animals/Wildlife", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks", "Business/Finance", "Education", "Food and Drink", "Healthcare/Medical", "Holidays", "Illustrations/Clip-Art", "Industrial", "Interiors", "Miscellaneous", "Nature", "Objects", "Parks/Outdoor", "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vintage"]`;
  }

  const singleWordRule = s.singleWordKeywords 
    ? "- STRICT: Every keyword must be a single word. No phrases."
    : "- Single words preferred. Widely-used 2-word phrases (e.g., \"coffee cup\", \"social media\") are allowed.";

  // Build keyword instructions
  let keywordEmphasis = "";
  if (s.smartMode) {
    keywordEmphasis = `
KEYWORDS GENERATION (SMART MODE - CRITICAL):
Generate ONLY the most highly relevant, precise keywords necessary for this specific image based on SEO and market analysis.
Do NOT pad the list with unnecessary, generic, or vaguely related words just to increase the count. Quality over quantity.
Provide as many as necessary to accurately describe the image for buyers, but not a single word more. Ensure no filler words are used.`;
  } else {
    keywordEmphasis = `
KEYWORDS GENERATION (CRITICAL - THIS IS YOUR PRIMARY TASK):
You MUST create EXACTLY ${s.keywordCount} keywords. Not fewer. Not approximately. EXACTLY ${s.keywordCount}.

Strategy for reaching ${s.keywordCount} keywords:
  Phase 1: List all direct, literal objects/elements visible (5-15 keywords)
  Phase 2: Add colors, materials, textures (3-5 keywords)
  Phase 3: Add styles, genres, artistic movements (3-5 keywords)
  Phase 4: Add moods, emotions, atmospheres (3-5 keywords)
  Phase 5: Add use-cases, applications, contexts (5-8 keywords)
  Phase 6: Add technical/industry terms, synonyms, related concepts (fill remaining to reach ${s.keywordCount})
  
If you run out of obvious terms, use these exhaustion strategies:
- Broader category terms (if you have "stethoscope", also add "medical", "healthcare", "equipment")
- Opposite/complementary concepts (if "indoor" appears, consider "professional space", "clinical setting")
- Related professions/industries (if "doctor", add "medical professional", "physician", "clinician")
- Visual descriptors (colors, lighting, composition style)
- Market segments (business, education, healthcare, creative, etc.)

COUNT VERIFICATION: Before you output your JSON, COUNT your keywords. Write the count in your mind. If you have fewer than ${s.keywordCount}, add more until you reach exactly ${s.keywordCount}.

UNDER NO CIRCUMSTANCES should your keyword list have fewer than ${s.keywordCount} keywords.`;
  }

  return `${fileContext}

You are a senior stock media contributor with 12+ years of experience selling on Adobe Stock, Shutterstock, and Getty Images. You have personally written metadata for over 50,000 stock assets. Your titles and descriptions always rank high and get sales because they match exactly how real buyers search.

CRITICAL MULTILINGUAL INSTRUCTION: The user may provide file names, hidden context, or USER INSTRUCTIONS in non-English languages (e.g., Bengali, Spanish, French). You MUST understand and translate their intent seamlessly. However, ALL of your generated output (Title, Description, and Keywords) MUST be exclusively in high-quality, industry-standard English. Do NOT output metadata in any language other than English.
${platformContext}${mediaHintStr}${customInstStr}

 Analyze the image carefully. Look at: main subject, objects, colors, style, background, composition, mood, and potential commercial use.

─────────────────────────────────────
TITLE FORMULA: [Main Subject] + [Key Detail] + [Context/Setting]
─────────────────────────────────────
Follow this formula strictly:
• Slot 1 — Main subject (the most important thing in the image)
• Slot 2 — Key detail (color, action, style, number, or material)
• Slot 3 — Context or setting (background, environment, or use)

Real examples of GREAT titles:
  ✓ "Hand holding coffee cup on wooden desk"
  ✓ "20% discount stamp icon on white background"
  ✓ "Young woman working on laptop in home office"
  ✓ "Blue abstract wave background for web design"
  ✓ "Christmas tree with gold ornaments isolated"
  ✓ "Smiling businessman in suit pointing at camera"

Real examples of BAD titles (never write like this):
  ✗ "A stunning, vibrant illustration of a beautiful red apple"
  ✗ "Highly detailed vector showcasing captivating design"
  ✗ "Meticulously crafted premium image for commercial use"

Title rules:
- Start directly with the main subject noun. NEVER start with "A", "An", "The", or adjectives.
- Write exactly as a buyer would search — clear, direct, factual.
- Include specific details: colors, materials, numbers, actions, style when relevant.
- COMPLETELY FORBIDDEN words: stunning, vibrant, captivating, breathtaking, mesmerizing, exquisite, meticulously, seamlessly, showcasing, featuring, beautifully, crafted, rendered, premium, perfect, dynamic, amazing, incredible, gorgeous, elegant (unless it is literally an elegant design style).
${s.smartMode ? `- LENGTH: Write a concise, natural, and highly descriptive SEO-optimized title without artificial padding.` : `- REQUIRED LENGTH: Make the title comprehensive and highly descriptive, fully utilizing between ${s.titleMinChars || 70} and ${s.titleMaxChars} characters. Your title should use nearly all available space.`}${s.negTitleEnabled && s.negTitleWords ? `\n- Also forbidden: ${s.negTitleWords}.` : ""}

─────────────────────────────────────
DESCRIPTION FORMULA: Sentence 1 + Sentence 2
─────────────────────────────────────
• Sentence 1: Factual description — what is shown, style, key visual elements.
• Sentence 2: Practical use — where a buyer can use this (web, print, social media, etc.).

Real examples of GREAT descriptions:
  ✓ "Flat vector icon of a 20% discount stamp in black and white with a circular border. Perfect for e-commerce sale banners, retail promotions, and discount labels."
  ✓ "Top view of a cup of black coffee and an open notebook on a white table. Ideal for blog headers, business presentations, and morning routine content."
  ✓ "Hand-drawn style wreath made of green leaves and red berries on a transparent background. Suitable for Christmas card designs, holiday invitations, and festive decorations."

Rules:
- Sentence 1: Be specific. Mention style (flat, 3D, realistic, watercolor, minimal, etc.), colors, and what exactly is depicted.
- Sentence 2: Mention 2-3 specific real use-cases buyers actually use (e.g., "website banner", "social media post", "product label", "book cover").
- Write in active, plain language. No passive voice.
- Completely forbidden: "stunning", "breathtaking", "beautifully crafted", "meticulously", "showcasing", "featuring", "perfectly designed".
${s.smartMode ? `- LENGTH: Write a natural, concise, and highly effective SEO description without forcing a specific character count.` : `- REQUIRED LENGTH: Write a rich and detailed description utilizing between ${s.descMinChars || 110} and ${s.descMaxChars} characters. Use nearly the full space available.`}

─────────────────────────────────────
${keywordEmphasis}

Additional keyword rules:
- Order: most specific literal subjects first → style/color/mood → use-case concepts last.
- Every keyword must be directly relevant to what is visually present or commercially implied.
- No filler: "thing", "item", "shape", "object", "image", "picture", "look", "nice".
${singleWordRule}
- No brand/trademark names.
- No banned words: "free", "download", "copyright", "watermark".
- No duplicate root words (not both "color" and "colors").
- No hashtags.${negInstructions}

CATEGORY SELECTION:
Based on the image content, select 1 or 2 of the most appropriate stock agency categories from this exact list:
${categoryList}

Output ONLY this JSON. No markdown, no backticks, no extra text:
{
  "title": "A highly descriptive title...",
  "description": "A descriptive explanation of the image...",
  "keywords": "keyword1, keyword2, keyword3, keyword4, keyword5, ... ${s.smartMode ? "(only relevant keywords)" : `(at least ${s.keywordCount} keywords)`}",
  "categories": ["Selected Category 1", "Selected Category 2"]
}`;
}


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
function postProcessMetadata(metadata, promptSettings) {
  const s = promptSettings || {};
  let result = { ...metadata };

  // --- BRAND & TRADEMARK SAFETY SCANNER ---
  if (result.title) result.title = sanitizeText(result.title);
  if (result.description) result.description = sanitizeText(result.description);
  if (result.keywords) {
    result.keywords = result.keywords.split(',')
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

  // Enforce title max chars
  if (!s.smartMode && s.titleMaxChars && title.length > s.titleMaxChars) {
    title = title.substring(0, s.titleMaxChars).replace(/\s+\S*$/, "");
  }
  // Enforce minimum title length
  if (!s.smartMode && s.titleMinChars && title.length < s.titleMinChars) {
    title = title.padEnd(s.titleMinChars, ' ');
  }
  result.title = title;

  // Enforce description max chars
  if (!s.smartMode && s.descMaxChars && result.description && result.description.length > s.descMaxChars) {
    result.description = result.description.substring(0, s.descMaxChars).replace(/\s+\S*$/, "") + ".";
  }
  // Enforce minimum description length
  if (!s.smartMode && s.descMinChars && result.description && result.description.length < s.descMinChars) {
    result.description = result.description.padEnd(s.descMinChars, ' ');
  }

  // Remove negative keywords and STRICTLY enforce count
  if (result.keywords) {
    let kws = result.keywords.split(",").map(k => k.trim()).filter(Boolean);
    
    // 1. Remove banned words
    if (s.negKeywordsEnabled && s.negKeywords && s.negKeywords.trim()) {
      const banned = s.negKeywords.split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
      kws = kws.filter(k => !banned.includes(k.toLowerCase()));
    }

    // 2. STRICTLY enforce the count - if too many, slice; if too few, add intelligent fallbacks
    if (!s.smartMode && s.keywordCount) {
      if (kws.length > s.keywordCount) {
        kws = kws.slice(0, s.keywordCount);
      } else if (kws.length < s.keywordCount) {
        // Add intelligent fallback keywords based on common stock photo categories
        const fallbackKeywords = [
          "professional", "business", "concept", "background", "abstract", "modern",
          "design", "creative", "illustration", "digital", "graphic", "visual",
          "web", "online", "internet", "technology", "communication", "social",
          "corporate", "commercial", "marketing", "advertising", "promotional",
          "icon", "symbol", "element", "asset", "template", "mockup",
          "render", "artwork", "composition", "scene", "object", "lifestyle",
          "people", "person", "human", "figure", "portrait", "close-up",
          "detail", "macro", "texture", "pattern", "surface", "material",
          "color", "vibrant", "bright", "dark", "light", "neutral",
          "minimalist", "clean", "simple", "complex", "detailed", "stylized"
        ];
        
        while (kws.length < s.keywordCount && fallbackKeywords.length > 0) {
          const randomIdx = Math.floor(Math.random() * fallbackKeywords.length);
          const fallback = fallbackKeywords.splice(randomIdx, 1)[0];
          if (!kws.map(k => k.toLowerCase()).includes(fallback.toLowerCase())) {
            kws.push(fallback);
          }
        }
      }
    }
    
    result.keywords = kws.join(", ");
  }

  return result;
}

let globalKeyIndex = 0;

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
 */
async function fetchOpenAICompatible(provider, apiKey, prompt, base64Data, mimeType, forceJson = true) {
  let endpoint = "";
  let models = [];

  if (provider === "groq") {
    endpoint = "https://api.groq.com/openai/v1/chat/completions";
    // Primary: Llama 4 Scout (current production vision model on Groq)
    // Fallback: Legacy model strings in case Groq changes naming
    models = [
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "llama-4-scout-17b-16e-instruct",
      "llama-3.2-90b-vision-preview",
      "llama-3.2-11b-vision-preview"
    ];
  } else if (provider === "openrouter") {
    endpoint = "https://openrouter.ai/api/v1/chat/completions";
    models = ["google/gemini-2.5-flash"];
  } else if (provider === "openai") {
    endpoint = "https://api.openai.com/v1/chat/completions";
    models = ["gpt-4o-mini"];
  } else if (provider === "mistral") {
    endpoint = "https://api.mistral.ai/v1/chat/completions";
    models = ["pixtral-12b-2409"];
  }

  let lastResponseText = null;
  let lastError = null;

  for (let i = 0; i < models.length; i++) {
    const currentModel = models[i];
    const payload = {
      model: currentModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ]
        }
      ]
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
  const { isEps = false, isPlaceholder = false, fileName = "file", extractedTextContext = null, promptSettings = {} } = fileInfo;
  const prompt = buildPrompt({ isEps, isPlaceholder, fileName, extractedTextContext, promptSettings });

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
    const currentProvider = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
    const apiKey = typeof keyItem === 'object' ? keyItem.key : keyItem;

    // Branch to OpenAI compatible providers if not Gemini
    if (currentProvider !== "gemini") {
      try {
        console.log(`[Attempt] Provider: ${currentProvider} using key index ${currentKeyIndex}`);
        const parsed = await fetchOpenAICompatible(currentProvider, apiKey, prompt, imageBuffer, mimeType);
        console.log(`[Success] Metadata generated using ${currentProvider}!`);
        return postProcessMetadata(parsed, promptSettings);
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
    const genAI = new GoogleGenerativeAI(apiKey);
    console.log(`[System] Initializing Gemini with key index ${currentKeyIndex} (${apiKey.substring(0, 8)})...`);

    let modelsToAttempt = [...modelsToTry];
    let keyHitRateLimit = false;

    // Try available models for this specific key
    for (let i = 0; i < modelsToAttempt.length; i++) {
      const modelName = modelsToAttempt[i];
      try {
        console.log(`[Attempt] Model: ${modelName} on key ${currentKeyIndex}`);
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent([
          {
            inlineData: {
              data: imageBuffer,
              mimeType: mimeType,
            },
          },
          { text: prompt },
        ]);

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

        const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch (e) {
          const match = cleaned.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
          else throw new Error("JSON parse error");
        }

        return postProcessMetadata(parsed, promptSettings);

      } catch (error) {
        console.warn(`[Fail] ${modelName} on key ${currentKeyIndex}: ${error.message}`);
        lastError = error;

        if (
          error.message.includes("API_KEY_INVALID") ||
          error.message.includes("403") ||
          error.message.includes("429") ||
          error.message.includes("quota")
        ) {
          console.warn(`[Rate Limit/Quota] Model ${modelName} on key ${currentKeyIndex} exhausted. Trying next model...`);
          keyHitRateLimit = true;
          continue; // Try next model instead of breaking the loop
        }

        if (error.message.includes("400")) {
          continue;
        }

        if (error.message.includes("404")) {
          if (i === modelsToAttempt.length - 1) {
            const dynamicModels = await getAvailableModels(apiKey);
            if (dynamicModels.length > 0) {
              const newModels = dynamicModels.filter(m => !modelsToAttempt.includes(m));
              modelsToAttempt = [...modelsToAttempt, ...newModels];
            }
          }
          continue; // Try next model
        }
      }
    }

    // Outer loop naturally proceeds to test the next API key if inner loop broke
  }

  if (lastError && (lastError.message.includes("429") || lastError.message.includes("quota"))) {
    throw new Error(`API Rate Limit Reached on all ${apiKeys.length} keys. Please wait 30 seconds before generating again.`);
  }

  throw (
    lastError ||
    new Error("Critical: Could not connect to any Gemini model. Please check your API keys.")
  );
}

/**
 * Generate a detailed prompt from an image.
 */
export async function generatePromptFromImage(imageBuffer, mimeType, apiKeys, apiProvider = "gemini", promptSettings = {}) {
  const mode = promptSettings.promptSimilarityMode || 'Exact Match';
  
  let modeInstruction = "";
  if (mode === "Unique Variation") {
    modeInstruction = `\n- UNIQUE VARIATION MODE (CRITICAL): DO NOT create an exact match of this image. Instead, slightly alter the subjects, camera angles, colors, or background details so the resulting image will be a UNIQUE but thematically similar variation. This is to avoid duplicate content on stock sites. Describe a related concept but make it visually distinct.`;
  } else {
    modeInstruction = `\n- EXACT MATCH MODE: Create a prompt that will recreate this exact image as closely and accurately as possible.`;
  }

  const prompt = `Analyze this image in detail and create a comprehensive, descriptive prompt that could be used to recreate this image in an AI model like Midjourney or Stable Diffusion.

Focus on:
1. Main subject, actions, and positioning.
2. Lighting, camera angles, and atmosphere.
3. Artistic style, medium, and color palette.
4. Essential background details.
5. HUMAN ANATOMY (If humans are present): Describe the facial features, gaze direction, eyes, pupils, exact hand/finger placement, and skin texture in extreme detail to ensure flawless anatomical generation.

CRITICAL RULES:
- HUMAN SUBJECTS: If humans are in the image, use terms that encourage perfect anatomy (e.g., "perfectly detailed eyes", "correctly proportioned hands", "5 fingers", "cinematic lighting on face", "sharp focus on pupils").
- EXCLUDE ANY WATERMARKS: Completely ignore any watermarks, logos, or copyright text present in the image. Do not mention them in the prompt.
- SAFETY COMPLIANCE: Do not include any violent, explicit, offensive, or risky words that might trigger safety filters in AI image generators. Keep the language completely safe and policy-compliant.${modeInstruction}
- Output the entire prompt as a SINGLE, continuous paragraph. 
- DO NOT use multiple paragraphs, sections, bullet points, or line breaks.
- Avoid being excessively wordy; keep it descriptive but focused.
- Return ONLY the raw prompt text. No introductory text, quotes, or markdown.`;

  let lastError = null;
  const startKeyIndex = globalKeyIndex;
  if (apiKeys && apiKeys.length > 0) {
    globalKeyIndex = (globalKeyIndex + 1) % apiKeys.length;
  }

  for (let k = 0; k < apiKeys.length; k++) {
    const currentKeyIndex = (startKeyIndex + k) % apiKeys.length;
    const apiKey = apiKeys[currentKeyIndex];

    // OpenAI Compatible Route (Groq, etc.)
    if (apiProvider !== "gemini") {
      try {
        const enrichedPrompt = `You are an Expert AI Prompt Engineer specialized in Midjourney and Stable Diffusion. 
Your task is to analyze the attached image and write a MASTERPIECE prompt.

${prompt}

ADVICE FOR EXCELLENCE: 
Use professional photography terms (e.g. "85mm lens", "soft bokeh", "rim lighting", "high dynamic range"). 
Be vivid and poetic but stay within a single paragraph.`;

        console.log(`[Attempt] Provider: ${apiProvider} (Image to Prompt) using key index ${currentKeyIndex}`);
        const text = await fetchOpenAICompatible(apiProvider, apiKey, enrichedPrompt, imageBuffer, mimeType, false);
        return text;
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
        const result = await model.generateContent([
          {
            inlineData: {
              data: imageBuffer,
              mimeType: mimeType,
            },
          },
          { text: prompt },
        ]);

        const response = await result.response;
        const out = response.text().trim();

        let totalTokens = 0;
        try {
          const um = response.usageMetadata;
          if (um && typeof um.totalTokenCount === "number") totalTokens = um.totalTokenCount;
        } catch {
          /* ignore */
        }
        recordApiUsage("gemini", apiKey, { totalTokens, requests: 1 });

        return out;
      } catch (error) {
        lastError = error;

        if (
          error.message.includes("API_KEY_INVALID") ||
          error.message.includes("403") ||
          error.message.includes("429") ||
          error.message.includes("quota")
        ) {
          break; // Break inner model loop to smoothly test the NEXT API key in the outer loop
        }

        if (error.message.includes("400")) continue;
        if (error.message.includes("404")) continue;
      }
    }
  }

  if (lastError && (lastError.message.includes("429") || lastError.message.includes("quota"))) {
    throw new Error(`API Rate Limit Reached on all ${apiKeys.length} keys. Please wait 30 seconds before generating again.`);
  }

  throw (
    lastError ||
    new Error(`Critical: Could not connect to any ${apiProvider} model. Please check your API keys.`)
  );
}

