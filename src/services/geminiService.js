import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Super Robust Gemini Service with Multi-Version and Multi-Model fallbacks
 * Supports both raster images and EPS files (via extracted/placeholder previews)
 */

// Expanded list of models, from oldest to newest stable, to ensure backward compatibility
const modelsToTry = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite-preview-02-05",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-pro-vision",
  "gemini-pro"
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
  const cleanName = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
  
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

  const singleWordRule = s.singleWordKeywords 
    ? "- STRICT: Every keyword must be a single word. No phrases."
    : "- Single words preferred. Widely-used 2-word phrases (e.g., \"coffee cup\", \"social media\") are allowed.";

  return `${fileContext}

You are a senior stock media contributor with 12+ years of experience selling on Adobe Stock, Shutterstock, and Getty Images. You have personally written metadata for over 50,000 stock assets. Your titles and descriptions always rank high and get sales because they match exactly how real buyers search.
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
- Max ${s.titleMaxChars} characters.${s.negTitleEnabled && s.negTitleWords ? `\n- Also forbidden: ${s.negTitleWords}.` : ""}

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
- Max ${s.descMaxChars} characters.

─────────────────────────────────────
KEYWORDS
─────────────────────────────────────
- Order: most specific literal subjects first → style/color/mood → use-case concepts last.
- Every keyword must be directly relevant to what is visually present or commercially implied.
- No filler: "thing", "item", "shape", "object", "image", "picture", "look", "nice".
${singleWordRule}
- No brand/trademark names.
- No banned words: "free", "download", "copyright", "watermark".
- No duplicate root words (not both "color" and "colors").
- No hashtags.
- Exactly ${s.keywordCount} keywords.${negInstructions}

Output ONLY this JSON. No markdown, no backticks, no extra text:
{
  "title": "...",
  "description": "...",
  "keywords": "..."
}`;
}

/**
 * Post-process metadata result by applying user settings (prefix, suffix, negative words).
 */
function postProcessMetadata(metadata, promptSettings) {
  const s = promptSettings || {};
  let result = { ...metadata };

  // Apply prefix/suffix to title
  let title = result.title || "";
  if (s.prefixEnabled && s.prefixText && s.prefixText.trim()) {
    title = `${s.prefixText.trim()} ${title}`;
  }
  if (s.suffixEnabled && s.suffixText && s.suffixText.trim()) {
    title = `${title} ${s.suffixText.trim()}`;
  }

  // Enforce title max chars
  if (s.titleMaxChars && title.length > s.titleMaxChars) {
    title = title.substring(0, s.titleMaxChars).replace(/\s+\S*$/, "");
  }
  result.title = title;

  // Enforce description max chars
  if (s.descMaxChars && result.description && result.description.length > s.descMaxChars) {
    result.description = result.description.substring(0, s.descMaxChars).replace(/\s+\S*$/, "") + ".";
  }

  // Remove negative keywords and STRICTLY enforce count
  if (result.keywords) {
    let kws = result.keywords.split(",").map(k => k.trim()).filter(Boolean);
    
    // 1. Remove banned words
    if (s.negKeywordsEnabled && s.negKeywords && s.negKeywords.trim()) {
      const banned = s.negKeywords.split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
      kws = kws.filter(k => !banned.includes(k.toLowerCase()));
    }

    // 2. STRICTLY enforce the count requested by the user
    if (s.keywordCount && kws.length > s.keywordCount) {
      kws = kws.slice(0, s.keywordCount);
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
  let model = "";

  if (provider === "groq") {
    endpoint = "https://api.groq.com/openai/v1/chat/completions";
    model = "llama-3.2-90b-vision-preview"; // Groq's main vision model
  } else if (provider === "openrouter") {
    endpoint = "https://openrouter.ai/api/v1/chat/completions";
    model = "google/gemini-2.5-flash"; // Default openrouter vision model
  } else if (provider === "openai") {
    endpoint = "https://api.openai.com/v1/chat/completions";
    model = "gpt-4o-mini"; // Fast vision
  } else if (provider === "mistral") {
    endpoint = "https://api.mistral.ai/v1/chat/completions";
    model = "pixtral-12b-2409"; // Mistral vision
  }

  const payload = {
    model: model,
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
    throw new Error(`${provider.toUpperCase()} API Error: ${response.status} ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices[0].message.content;

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
  const startKeyIndex = globalKeyIndex;

  // Try each API key precisely once for this specific file request if needed
  for (let k = 0; k < apiKeys.length; k++) {
    const currentKeyIndex = (startKeyIndex + k) % apiKeys.length;
    const apiKey = apiKeys[currentKeyIndex];

    // Branch to OpenAI compatible providers if not Gemini
    if (apiProvider !== "gemini") {
      try {
        console.log(`[Attempt] Provider: ${apiProvider} using key index ${currentKeyIndex}`);
        const parsed = await fetchOpenAICompatible(apiProvider, apiKey, prompt, imageBuffer, mimeType);
        console.log(`[Success] Metadata generated using ${apiProvider}!`);
        // Rotate global key index for the NEXT file request to achieve perfect Round-Robin load balancing
        globalKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        return postProcessMetadata(parsed, promptSettings);
      } catch (error) {
        console.warn(`[Fail] ${apiProvider} (key ${currentKeyIndex}): ${error.message}`);
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

        console.log(`[Success] Metadata generated using ${modelName} on key index ${currentKeyIndex}!`);

        // Rotate global key index for the NEXT file request (Round-Robin load balancing)
        globalKeyIndex = (currentKeyIndex + 1) % apiKeys.length;

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
          console.warn(`[Rate Limit/Quota] Key index ${currentKeyIndex} exhausted. Switching to next backup key.`);
          keyHitRateLimit = true;
          break; // Break model loop to test the NEXT API key in the outer loop
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
export async function generatePromptFromImage(imageBuffer, mimeType, apiKeys, apiProvider = "gemini") {
  const prompt = `Analyze this image in extreme detail and create a highly comprehensive, descriptive prompt that could be used to recreate this exact image in a text-to-image AI model like Midjourney or Stable Diffusion.

Focus on:
1. The main subject, actions, and positioning.
2. The exact lighting, camera angles, and depth of field.
3. The mood, atmosphere, and color grading.
4. The artistic style, medium, or render engine (e.g., cinematic photography, vector illustration, Unreal Engine 5 render, oil painting, etc.).
5. Tiny background details or textures.

Return ONLY the raw prompt text. Do not include introductory text, quotes, or markdown formatting.`;

  let lastError = null;
  const startKeyIndex = globalKeyIndex;

  for (let k = 0; k < apiKeys.length; k++) {
    const currentKeyIndex = (startKeyIndex + k) % apiKeys.length;
    const apiKey = apiKeys[currentKeyIndex];

    // OpenAI Compatible Route
    if (apiProvider !== "gemini") {
      try {
        console.log(`[Attempt] Provider: ${apiProvider} (Image to Prompt) using key index ${currentKeyIndex}`);
        const text = await fetchOpenAICompatible(apiProvider, apiKey, prompt, imageBuffer, mimeType, false);
        // Rotate global key index for the NEXT file request (perfect Round-Robin)
        globalKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
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
        // Success! Rotate global key index for the NEXT file request (Round-Robin load balancing)
        globalKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        return response.text().trim();
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

