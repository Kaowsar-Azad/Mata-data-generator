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
  let platformContext = "You must act as a master microstock photographer and keyword expert.";
  
  if (targetPlatform === "Adobe Stock") {
    platformContext += " Your metadata is specifically tailored for Adobe Stock. Adobe Stock algorithms heavily favor conceptual relevance, emotional descriptors, and precise noun phrases.";
  } else if (targetPlatform === "Shutterstock") {
    platformContext += " Your metadata is specifically tailored for Shutterstock. Shutterstock favors extremely literal, exact keywords and precise visual subject descriptions over abstract concepts.";
  } else if (targetPlatform === "FreePik") {
    platformContext += " Your metadata is specifically tailored for FreePik. FreePik users often search for design elements, editable templates, backgrounds, and colorful vectors for commercial use.";
  } else if (targetPlatform === "Vecteezy") {
    platformContext += " Your metadata is specifically tailored for Vecteezy. Vecteezy users search for practical design assets, web banners, user interface elements, and flat design illustrations.";
  } else if (targetPlatform === "Pond5") {
    platformContext += " Your metadata is specifically tailored for Pond5. Focus on highly descriptive, literal media asset keywords suitable for media buyers and video editors.";
  } else if (targetPlatform === "Getty") {
    platformContext += " Your metadata is specifically tailored for Getty Images. Focus on authentic, editorial-style descriptions and highly relevant, non-spammy keywords.";
  } else if (targetPlatform === "Depositphotos") {
    platformContext += " Your metadata is specifically tailored for Depositphotos. Focus on commercial utility and straightforward, accurate keywords.";
  }

  let mediaHintStr = "";
  if (s.mediaTypeHint && s.mediaTypeHint !== "None / Auto-detect") {
    mediaHintStr = `\nMedia Type Hint: The user explicitly notes this image is a "${s.mediaTypeHint}". Incorporate appropriate stylistic keywords.`;
  }

  let customInstStr = "";
  if (s.customInstruction && s.customInstruction.trim()) {
    customInstStr = `\n\nCRITICAL CUSTOM INSTRUCTION FROM USER:\n"${s.customInstruction.trim()}"\nYou MUST follow this instruction carefully when crafting the title, description, and keywords.`;
  }

  const singleWordRule = s.singleWordKeywords 
    ? "- STRICT SINGLE WORD RULE: EVERY keyword MUST be a single individual word. NO spaces, NO compound phrases."
    : "- ONLY SINGLE WORDS or widely accepted compound noun phrases (like \"artificial intelligence\", \"living room\").";

  return `${fileContext}

Generate highly commercial, SEO-optimized metadata for this ${isEps ? "vector illustration" : "image"}. 
${platformContext}${mediaHintStr}${customInstStr}

Follow this mental process before outputting JSON:
1. Identify the main subjects, objects, and actions.
2. Analyze the visual style, colors, composition, and lighting.
3. Determine the emotional tone and conceptual meaning (e.g., success, teamwork, futuristic, vintage).
4. Identify the potential commercial use-case (e.g., background, banner, editorial, technology article).

Generate the metadata strictly as a JSON object:
{
  "title": "A highly descriptive, commercially viable title. MUST be under ${s.titleMaxChars} characters total.",
  "description": "A detailed description. MUST be under ${s.descMaxChars} characters total. Mention the subject, style, and commercial utility.",
  "keywords": "A comma-separated list of EXACTLY ${s.keywordCount} lowercase keywords."
}

CRITICAL RULES FOR KEYWORDS:
- Use ONLY highly relevant, commercial microstock keywords.
- Order: Place the most literal, important subjects first. Place abstract/conceptual terms last.
- EVERY keyword MUST accurately describe something clearly visible or conceptually highly relevant to the image.
- DO NOT use low-value filler words, generic fluff, or full sentences (e.g., "thing", "item", "shape", "object", "picture", "the", "a", "an", "image", "there is", "look").
${singleWordRule}
- TRADEMARK BAN: NEVER include trademarked names, brand names, or logos (e.g., "Apple", "Nike", "Instagram", "Facebook", "Windows").
- STOCK BAN: NEVER use words prohibited by stock agencies (e.g., "free", "download", "copyright", "watermark", "vectorization", "cheap").
- NO SIMILAR/DUPLICATES: Do not use different grammatical forms of the same word (e.g., if you use "color", DO NOT use "colors" or "colored").
- DO NOT use hashtags.
- Ensure EXACTLY ${s.keywordCount} keywords. This is a strict requirement.${negInstructions}

Return ONLY the valid JSON block. No markdown formatting, no explanations, no backticks.`;
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

  // Try each API key, starting from the globalKeyIndex so we don't repeatedly hit exhausted keys
  for (let k = 0; k < apiKeys.length; k++) {
    const keyIndexToTry = (globalKeyIndex + k) % apiKeys.length;
    const apiKey = apiKeys[keyIndexToTry];

    // Branch to OpenAI compatible providers if not Gemini
    if (apiProvider !== "gemini") {
      try {
        console.log(`[Attempt] Provider: ${apiProvider}`);
        const parsed = await fetchOpenAICompatible(apiProvider, apiKey, prompt, imageBuffer, mimeType);
        console.log(`[Success] Metadata generated using ${apiProvider}!`);
        return postProcessMetadata(parsed, promptSettings);
      } catch (error) {
        console.warn(`[Fail] ${apiProvider}: ${error.message}`);
        lastError = error;
        if (error.message.includes("401") || error.message.includes("403") || error.message.includes("429")) {
          globalKeyIndex = (globalKeyIndex + 1) % apiKeys.length;
          continue; // Try next key
        }
        throw error; // Other errors abort immediately
      }
    }

    // Gemini branch
    const genAI = new GoogleGenerativeAI(apiKey);
    console.log(`[System] Initializing with key ${apiKey.substring(0, 8)}...`);

    // First try our hardcoded priority list
    let modelsToAttempt = [...modelsToTry];

    // Try everything in the list
    for (let i = 0; i < modelsToAttempt.length; i++) {
      const modelName = modelsToAttempt[i];
      try {
        console.log(`[Attempt] Model: ${modelName}`);
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

        console.log(`[Success] Metadata generated using ${modelName}!`);

        const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch (e) {
          const match = cleaned.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
          else throw new Error("JSON parse error");
        }

        // Apply post-processing (prefix, suffix, negative words, char limits)
        return postProcessMetadata(parsed, promptSettings);

      } catch (error) {
        console.warn(`[Fail] ${modelName}: ${error.message}`);
        lastError = error;

        if (
          error.message.includes("API_KEY_INVALID") ||
          error.message.includes("403") ||
          error.message.includes("429") ||
          error.message.includes("quota")
        ) {
          console.warn(`[API Key Exhausted/Invalid] Switching to next key if available. Error: ${error.message}`);
          // Permanently shift the global pointer to the next key for subsequent image requests
          globalKeyIndex = (globalKeyIndex + 1) % apiKeys.length;
          break; // Skip to next API key in the outer loop
        }

        if (error.message.includes("400")) {
          console.warn(`[400 Error] from ${modelName}:`, error.message);
          // Don't throw immediately, let it try other models or fallback!
          continue;
        }

        if (error.message.includes("404")) {
          // If we exhausted our hardcoded list and still got 404s, let's dynamically fetch available models!
          if (i === modelsToAttempt.length - 1) {
            console.log(`[System] All static models failed with 404. Fetching available models for this API key dynamically...`);
            const dynamicModels = await getAvailableModels(apiKey);
            if (dynamicModels.length > 0) {
              console.log(`[System] Found dynamic models:`, dynamicModels);
              // Add dynamic models that we haven't tried yet
              const newModels = dynamicModels.filter(m => !modelsToAttempt.includes(m));
              modelsToAttempt = [...modelsToAttempt, ...newModels];
            }
          }
          continue; // Try next model
        }
      }
    }
  }

  if (lastError && (lastError.message.includes("429") || lastError.message.includes("quota"))) {
    throw new Error("API Rate Limit Reached (429). Please wait 30 seconds before generating again, or add another API Key in settings.");
  }

  throw (
    lastError ||
    new Error(
      "Critical: Could not connect to any Gemini model. Please check your API key."
    )
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

  for (let k = 0; k < apiKeys.length; k++) {
    const keyIndexToTry = (globalKeyIndex + k) % apiKeys.length;
    const apiKey = apiKeys[keyIndexToTry];

    // OpenAI Compatible Route
    if (apiProvider !== "gemini") {
      try {
        console.log(`[Attempt] Provider: ${apiProvider} (Image to Prompt)`);
        const text = await fetchOpenAICompatible(apiProvider, apiKey, prompt, imageBuffer, mimeType, false);
        return text;
      } catch (error) {
        lastError = error;
        if (error.message.includes("401") || error.message.includes("403") || error.message.includes("429")) {
          globalKeyIndex = (globalKeyIndex + 1) % apiKeys.length;
          continue;
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
        return response.text().trim();
      } catch (error) {
        lastError = error;

        if (
          error.message.includes("API_KEY_INVALID") ||
          error.message.includes("403") ||
          error.message.includes("429") ||
          error.message.includes("quota")
        ) {
          globalKeyIndex = (globalKeyIndex + 1) % apiKeys.length;
          break; // Skip to next API key
        }

        if (error.message.includes("400")) continue;
        if (error.message.includes("404")) continue;
      }
    }
  }

  if (lastError && (lastError.message.includes("429") || lastError.message.includes("quota"))) {
    throw new Error("API Rate Limit Reached (429). Please wait 30 seconds before generating again, or add another API Key in settings.");
  }

  throw (
    lastError ||
    new Error(`Critical: Could not connect to any ${apiProvider} model. Please check your API key.`)
  );
}

