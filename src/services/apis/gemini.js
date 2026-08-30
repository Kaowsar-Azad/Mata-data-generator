import { GoogleGenerativeAI } from "@google/generative-ai";
import { recordApiUsage } from "../apiUsageTracker.js";

/**
 * Build the metadata prompt depending on file context for Gemini.
 */
export function buildGeminiPrompt({ isEps, isPlaceholder, isVideo, fileName, extractedTextContext, promptSettings, skipPolicyScan }) {
  // Clean up filename (remove extension, replace dashes/underscores with spaces)
  let cleanName = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
  
  // If the filename looks like a hash or random string (e.g. c35f75d7...), ignore it
  const isHash = /^[a-f0-9]{20,}$/i.test(cleanName) || cleanName.length > 30 && !cleanName.includes(" ");
  if (isHash) {
    cleanName = isVideo ? "a professional stock video clip" : "a professional illustration";
  }

  // Default settings fallback
  const s = promptSettings || {
    titleMaxChars: 70,
    descMaxChars: 150,
    keywordCount: 48
  };
  const promptKeywordsCount = s.smartMode ? 49 : Math.min(100, s.keywordCount + 25);

  // ── File-type context ──────────────────────────────────────────────────────
  let fileContext = "";

  if (isVideo) {
    fileContext = `CRITICAL INSTRUCTION: The attached images are 3 representative FRAMES (sampled at 20%, 50%, and 80% duration) extracted from a stock VIDEO CLIP. The video file name is "${cleanName}".
Do NOT treat this as a photo or illustration. You are writing metadata for a STOCK VIDEO, not a static image.
Analyze these 3 frames carefully to understand the visual progression, motion, action, setting, mood, and subject of the video clip over time.
Consider: what type of video motion is implied (e.g., pan, tilt, zoom, tracking shot, timelapse, slow-motion, handheld), what action is taking place, what story is told, and who would license it.
The metadata will be used on stock video platforms: Adobe Stock, Shutterstock, Pond5, Getty Images, Storyblocks.`;
  } else if (isEps) {
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
    fileContext = `The file name is "${cleanName}". Please describe the image.`;
  }

  // ── Negative-word instructions ─────────────────────────────────────────────
  let negInstructions = "";
  if (s.negTitleEnabled && s.negTitleWords && s.negTitleWords.trim()) {
    negInstructions += `\n- The title MUST NOT contain any of these words: ${s.negTitleWords}.`;
  }
  if (s.negKeywordsEnabled && s.negKeywords && s.negKeywords.trim()) {
    negInstructions += `\n- The keywords MUST NOT contain any of these words: ${s.negKeywords}.`;
  }

  // ── Platform-specific SEO signals ─────────────────────────────────────────
  const targetPlatform = s.exportPlatform || "General";
  let platformContext = "";

  const PLATFORM_SEO = {
    "Adobe Stock":    `Platform: Adobe Stock (up to 49 keywords). Algorithm weights title+description match. Buyers use conceptual+emotional+literal terms. Irrelevant keywords are AI-penalized.\nSEO: Lead with primary buyer-intent term. Include emotional concepts (success, freedom, teamwork). Mirror Adobe autocomplete phrases. Add "vector"/"flat design"/"icon" for illustrations; lighting cues for photos.`,
    "Shutterstock":   `Platform: Shutterstock (up to 50 keywords). Title match = #1 ranking factor. Buyers use literal, specific terms.\nSEO: Put strongest keyword FIRST (extra ranking weight). Use exact colors/materials/quantities. Add occupation keywords for people shots. Include composition terms buyers filter by: "overhead view", "close up", "wide shot". Make description keyword-dense.`,
    "Getty":          `Platform: Getty Images. Editorial+premium commercial buyers. Authentic, journalistic tone — no marketing language.\nSEO: Use editorial language. Emphasize real-life authenticity. Note location/event/social context if identifiable. Add conceptual storytelling terms. Zero superlatives.`,
    "FreePik":        `Platform: FreePik. Designers seeking editable templates, vectors, design elements.\nSEO: Emphasize editability — "editable", "customizable", "layered", "template". Add design file style: "flat", "outline", "gradient", "minimal", "3D". Include style-descriptors designers search: "modern", "retro", "corporate". Pair element + use-case.`,
    "Vecteezy":       `Platform: Vecteezy. Buyers want practical flat design assets and vectors.\nSEO: Lead title with design style — "flat", "outline", "doodle", "cartoon", "geometric". Pair subject + design application. Include utility terms: "scalable", "vector", "SVG".`,
    "Dreamstime":     `Platform: Dreamstime. Broad audience of commercial buyers and bloggers. Both literal and thematic searches.\nSEO: Title must start with the most-searched literal subject. Add age/gender/ethnicity context for people shots (general terms only). Include seasonal and holiday modifiers when relevant. Add niche industry terms: "editorial", "stock", "royalty free concept" terms in description. Use both American and British spelling variants for key nouns.`,
    "Pond5":          `Platform: Pond5. Media professionals: video editors, filmmakers, broadcast producers.\nSEO: Extremely literal terms. Include production context: "4K", "HD", "looping", "seamless", "footage". Add location, time of day, season. Pair subject with production style.`,
    "Depositphotos":  `Platform: Depositphotos. Commercially focused. Balanced literal+conceptual.\nSEO: Equal mix of literal and conceptual terms. Commercial use-cases: "marketing", "advertising", "website", "presentation". Add demographic details for people.`,
    "General":        `Platform: General (all major stock sites). Maximize cross-platform discovery.\nSEO: Balance conceptual and literal equally. Optimize title for the top buyer search query. Cover all intent layers in keywords: object → action → concept → use-case.`,
  };

  platformContext = PLATFORM_SEO[targetPlatform] || PLATFORM_SEO["General"];


  let mediaHintStr = "";
  if (s.mediaTypeHint && s.mediaTypeHint !== "None / Auto-detect") {
    mediaHintStr = `\nNote: This file is a "${s.mediaTypeHint}".`;
  }

  let customInstStr = "";
  if (s.customInstruction && s.customInstruction.trim()) {
    customInstStr = `\n\nUSER INSTRUCTION (follow strictly):\n"${s.customInstruction.trim()}"`;
  }

  // ── Category list ──────────────────────────────────────────────────────────
  let categoryList = "";
  if (targetPlatform === "Adobe Stock") {
    categoryList = `["Animals", "Buildings and Architecture", "Business", "Drinks", "The Environment", "States of Mind", "Food", "Graphic Resources", "Hobbies and Leisure", "Industry", "Landscapes", "Lifestyle", "People", "Plants and Flowers", "Culture and Religion", "Science", "Social Issues", "Sports", "Technology", "Transport", "Travel"]`;
  } else if (targetPlatform === "Shutterstock") {
    categoryList = `["Abstract", "Animals/Wildlife", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks", "Business/Finance", "Education", "Food and Drink", "Healthcare/Medical", "Holidays", "Illustrations/Clip-Art", "Industrial", "Interiors", "Miscellaneous", "Nature", "Objects", "Parks/Outdoor", "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vintage"]`;
  } else if (targetPlatform === "General") {
    categoryList = `["Abstract & Textures", "Animals & Wildlife", "Architecture & Buildings", "Business & Finance", "Education & Science", "Food & Drink", "Healthcare & Medical", "Holidays & Celebrations", "Illustrations & Clipart", "Industry & Technology", "Landscapes & Nature", "Lifestyle & People", "Objects & Concepts", "Sports & Recreation", "Transportation & Travel"]`;
  } else {
    categoryList = `["Abstract", "Animals/Wildlife", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks", "Business/Finance", "Education", "Food and Drink", "Healthcare/Medical", "Holidays", "Illustrations/Clip-Art", "Industrial", "Interiors", "Miscellaneous", "Nature", "Objects", "Parks/Outdoor", "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vintage"]`;
  }

  const singleWordRule = s.singleWordKeywords 
    ? "- STRICT: Every keyword must be a valid, standalone dictionary word. Do NOT combine or squish multiple words together (e.g. do NOT write 'highcontrast' or 'userinterface'). No phrases."
    : "- Single words preferred. Short 2-word phrases that buyers actually search (e.g., \"coffee cup\", \"social media\") are allowed. NEVER write 3+ word phrases as a keyword.";

  // ── Keyword generation strategy ────────────────────────────────────────────
  let keywordEmphasis = "";
  if (s.smartMode) {
    keywordEmphasis = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEYWORD STRATEGY — SWEET SPOT MODE (ADOBE OPTIMIZED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Adobe Stock recommends generating exactly 15 to 30 highly relevant keywords. You MUST ignore any other count requirements and ONLY generate the best 15 to 30 keywords. No padding, no generic filler.

Use this framework to find the best 15-30 keywords:
  TIER 1 — EXACT MATCH (highest priority): The precise literal terms a buyer types to find THIS specific image.
  TIER 2 — LONG-TAIL PHRASES: 2-word combinations that capture specific buyer intent.
  TIER 3 — SEMANTIC/CONCEPTUAL: Broader themes, moods, emotions, and contexts strongly implied by the image.
  TIER 4 — COMMERCIAL APPLICATION: Real use-cases, industries, or contexts where buyers license this image.

Do NOT generate generic terms like "image", "photo", "picture", "file", "design", "element" unless they appear as part of a specific compound like "flat design" or "vector element".
Do NOT pad the list. Every keyword must pass this test: "Would a buyer searching ONLY this term want to find this specific image?"`;  
  } else {
    keywordEmphasis = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEYWORD STRATEGY — MAXIMUM COVERAGE MODE (EXACTLY ${promptKeywordsCount} keywords required)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST generate EXACTLY ${promptKeywordsCount} keywords using this precise 6-tier framework:

  TIER 1 — PRIMARY SUBJECTS: The literal nouns visible in the image. Most important tier — buyers search these first.
    Examples: "laptop", "coffee", "woman", "mountain", "heart icon", "stethoscope"

  TIER 2 — DESCRIPTIVE ATTRIBUTES: Specific colors, materials, quantities, styles, lighting, and conditions.
    Examples: "red", "wooden", "three", "hand-drawn", "transparent background", "overhead view", "studio light"

  TIER 3 — ACTIONS & STATES: What is happening, movement, poses, interactions.
    Examples: "working", "smiling", "flying", "isolated", "growing", "connected", "holding"

  TIER 4 — MOODS & CONCEPTS: High-value abstract ideas, emotions, and themes the image conveys.
    Examples: "success", "freedom", "teamwork", "healthcare", "innovation", "sustainability", "leadership"

  TIER 5 — COMMERCIAL USE-CASES: Specific industries or ways buyers will use this image.
    Examples: "website banner", "social media", "presentation", "infographic", "logo", "packaging"

  TIER 6 — HIGH-VALUE SYNONYMS & RELATED CONCEPTS (Fill exactly to reach ${promptKeywordsCount}): Use highly specific, related commercial terms, regional variants, and niche industry vocabulary. DO NOT USE GENERIC FILLER.

COUNT ENFORCEMENT PROTOCOL:
  Step 1: Generate all keywords across all 6 tiers using ONLY highly descriptive, valuable terms.
  Step 2: Count your total. If below ${promptKeywordsCount}, expand Tier 6 with more high-value synonyms or related industry terms. 
  CRITICAL RULE: NEVER invent random, "garbage" keywords, or hallucinate physical objects that are not in the image. To reach the exact count of ${promptKeywordsCount}, you MUST use broader commercial concepts, industry themes, and abstract meanings. You may include a maximum of 1 or 2 focal color names (e.g., "navy blue").
  Step 3: If above ${promptKeywordsCount}, remove the weakest keywords.
  Step 4: Final count MUST be EXACTLY ${promptKeywordsCount}. Not one more, not one less. This is an absolute requirement.

ABSOLUTE MINIMUM STANDARD: Every single keyword must be a highly relevant, commercial search term a real buyer would type. No generic filler and NO hallucinated elements!`;
  }

  // ── Master prompt assembly (token-efficient) ──────────────────────────────
  const kwMode = s.smartMode
    ? `KEYWORDS — SWEET SPOT MODE: Generate EXACTLY 15 to 30 of the most relevant, high buyer-intent keywords. Do not exceed 30 keywords. Do not pad with generic or irrelevant words. Output only keywords that are directly relevant to this specific asset.`
    : `KEYWORDS — COUNT MODE: Generate EXACTLY ${promptKeywordsCount} keywords using 6 tiers.
  T1 Primary nouns, T2 Attributes, T3 Actions, T4 Concepts, T5 Use-cases, T6 Industry terms (fill to hit ${promptKeywordsCount} exactly).
  Count before output. Adjust T6 up/down to hit exactly ${promptKeywordsCount}. Never submit fewer or more.`;

  const policyRule = skipPolicyScan ? "" : `
== BRAND / TRADEMARK BAN (ZERO TOLERANCE — CHECK BEFORE FINALIZING) ==
This is a hard compliance rule, not a style preference. Violations can get contributor accounts suspended.
- NEVER output a brand name, company name, trademarked term, product model name, protected character/design name, sports team name, or celebrity name — in the title, the description, OR any keyword — even if the brand is clearly visible, spoken, written, or present in the source filename.
- Before finalizing your output, scan every noun in the title, description, and full keyword list against known brands. If a term is, or could plausibly be, a registered trademark, replace it with its generic functional equivalent. Examples:
  - "Apple Watch" / "iPhone" -> "smartwatch" / "smartphone"
  - "Nike" / "Nikes" -> "athletic shoes"
  - "Coca-Cola" / "Coke" -> "carbonated soft drink"
  - "Photoshop" -> "photo editing software"
  - "Tesla" -> "electric car"
  - Sports team names/kits -> "professional sports team" / "athletic jersey"
- If a logo, trademarked design, or unmistakably branded product is visible and cannot be described without implying the brand: do NOT guess at a workaround. Describe only the generic category of object, omit the brand-specific term entirely from every field, and set "policyWarning" to a short factual note (e.g., "Visible logo detected on product; brand references excluded from all fields.").
- This ban applies with equal force across ALL keyword tiers below — including Tier 5 (commercial use-cases) and Tier 6 (synonyms), where brand names most often slip in disguised as "trending" or "high-value" search terms.
`;

  const policyWarningField = skipPolicyScan ? '' : ',"policyWarning":null';

  return `${fileContext}
${policyRule}
You are a stock media SEO expert (15 yrs, 100k+ assets optimized on Adobe Stock, Shutterstock, Getty). Your metadata consistently ranks top-3 and drives downloads.

LANGUAGE: All input may be in any language. ALL output MUST be in English only.

${platformContext}${mediaHintStr}${customInstStr}

== TITLE (SEO Optimized Headline) ==
Formula: [Primary Subject] + [Specific Action/Attribute] + [Setting/Context]
Rules:
- Write a complete, descriptive sentence answering Who, What, Where, and Why.
- NEVER start with articles (A/An/The) or adjectives. Start with the most-searched noun.
- Be hyper-specific: "Businesswoman typing on silver laptop in modern glass office" NOT "Woman working on laptop".
- For vectors/illustrations: explicitly state the style ("flat vector illustration", "3D render", "seamless pattern", "glyph icon set").
- Forbidden words: stunning, vibrant, captivating, breathtaking, mesmerizing, showcasing, beautifully, perfect, amazing.
- Target Length: STRICTLY between 25 and 70 characters. Compose the full grammatically complete sentence FIRST, then check its length. If it runs long, shorten it by trimming an adjective or a secondary detail — never by cutting the sentence off mid-word or mid-clause. If it runs short, add one concise contextual detail. The title must never trail off or end mid-thought.
- NEVER end the title on a preposition, conjunction, or article (e.g., never end with "for", "with", "and", "in", "on", "of", "the", "a"). The final word must complete the thought — a concrete noun, or an adjective directly modifying one.\${s.negTitleEnabled && s.negTitleWords ? \`\\n- Forbidden in title: \${s.negTitleWords}.\` : ""}
- CRITICAL FOR ADOBE STOCK: Every important noun, adjective and verb in your title MUST also appear in the keyword list.

== DESCRIPTION (SEO Optimized Detail) ==
Formula: [Factual visual description + Style/Lighting] + [2-3 specific commercial use-cases]
Rules:
- Expand on the title with factual details. Do not just list keywords.
- Sentence 1: Detail the style, colors, composition, and specific subjects.
- Sentence 2: Name concrete commercial applications (e.g., "Ideal for corporate presentations, marketing materials, and web banners").
- Keep it professional, objective, and active voice.
- Forbidden words: stunning, breathtaking, meticulously, "This image shows", "Here we can see".
- Target Length: STRICTLY between 50 and 100 characters.
\${policyRule}
== KEYWORDS STRATEGY (UNIFIED TIER-ORDER SYSTEM) ==
Generate EXACTLY ${promptKeywordsCount} keywords total. There is only ONE ranking system in this prompt: the tier order below. Output the keyword list in this exact tier sequence — Tier 1 keywords first, Tier 6 keywords last. Because Adobe Stock and Shutterstock weight earlier keyword positions more heavily in search, this tier order IS the ranking. Do not apply any separate position/slot scheme on top of it — there isn't one.

Allocate the ${promptKeywordsCount} keywords across tiers using these target proportions. Round each to the nearest whole number, then adjust Tier 6 up or down so the total matches ${promptKeywordsCount} exactly:

- TIER 1 — PRIMARY SUBJECTS (~35% of total, minimum 5, or all available keywords if the total requested is smaller than 5): the literal nouns physically visible in the image.
- TIER 2 — ATTRIBUTES (~20%): specific colors, materials, quantities, styles, lighting, and conditions.
- TIER 3 — ACTIONS & STATES (~15%): what is happening — movement, poses, interactions. Infinitive verbs only (see Grammar Rules).
- TIER 4 — MOODS & CONCEPTS (~10%): high-value abstract ideas, emotions, and themes the image genuinely conveys.
- TIER 5 — COMMERCIAL USE-CASES (~10%): specific industries or ways buyers will use this image (e.g., "corporate presentation", "marketing campaign").
- TIER 6 — HIGH-VALUE SYNONYMS (remainder — fill exactly to reach ${promptKeywordsCount}): closely related, highly searched commercial terms not already used elsewhere in the list.

Within each tier, order keywords by descending relevance to the image (most relevant term in that tier first).

If ${promptKeywordsCount} is small (15 or fewer), prioritize Tiers 1-3 and reduce or skip Tiers 4-6 as needed. Never pad the list with generic filler just to hit the count.

== KEYWORD RELEVANCE SCORING (keywordScores) ==
The "keywordScores" object in the final JSON MUST contain one integer score (0-100) for EVERY keyword in the "keywords" list — never a partial sample, never just the top few.

Rules for scoring:
1. Rank each keyword based on its true relevance to the image. 
2. Let the scores spread naturally between 1 and 100 based on true relevance. Do NOT artificially compress them or force them into a strict countdown.
3. If a keyword is highly relevant, score it high (e.g., 70-100). You can give multiple keywords similar high scores if they are equally important.
4. If a keyword is moderately relevant, score it lower (e.g., 30-69).
5. The least relevant or abstract keywords MUST score lower (e.g., 1-29).
6. Do NOT force every score to be strictly lower than the previous one. It's okay if multiple keywords have the same score, as long as it reflects their true relevance.

GRAMMAR RULES (Adobe Stock NLP requirements):
- Use SINGULAR nouns only. The algorithm auto-expands to plural. Write "dog" not "dogs", "camera" not "cameras".
- Use INFINITIVE verb forms only. Write "run", "smile", "hold" — NOT "running", "smiled", "holding".

QUALITY RULES:
- NO generic filler: "thing", "item", "nice", "great", "image", "photo", "picture", "graphic", "element".
- STRICT VISIBILITY RULE: ONLY describe what is PHYSICALLY VISIBLE. Never infer tech concepts not shown.
- NO root duplicates: never use both "camera" and "cameras", or "color" and "colorful". Pick the single most commercial singular form.
- No banned words: "free", "download", "copyright", "watermark".

Before writing your final answer, silently verify each of these — do NOT print this checklist, only the final JSON:
- Title is one complete sentence, 25-70 characters, does not end on a preposition/conjunction/article.
- Description follows the 2-sentence formula, 50-100 characters.
- Exactly ${promptKeywordsCount} keywords, ordered Tier 1 -> Tier 6, singular nouns, infinitive verbs, no brand names anywhere.
- "keywordScores" contains a valid integer score for every keyword based on true relevance.
- Output is valid JSON only — no markdown, no commentary, no trailing text before or after the braces.

"keywordScores" must include an entry for every single keyword in "keywords" — all ${promptKeywordsCount} of them, not a sample. The 3-key example below is illustrative of the format only, not the required length.

Output ONLY valid JSON, no markdown, no conversational text:
{"title":"...","description":"...","keywords":"apple, technology, screen, ... (${promptKeywordsCount} total)","keywordScores":{"apple":95,"technology":80,"screen":65},"categories":${categoryList}${policyWarningField}}`;
}

/**
 * Helper to run content generation with a strict timeout.
 */
async function generateContentWithTimeout(model, contentParts, timeoutMs = 90000) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    const sec = Math.round(timeoutMs / 1000);
    timeoutId = setTimeout(() => reject(new Error(`Model request timed out (${sec}s). Google API is taking too long.`)), timeoutMs);
  });

  const executeRequest = async () => {
    const res = await model.generateContent(contentParts);
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
 * Fetch Gemini API content generation.
 * (Identical logic to geminiService.js to maintain 100% consistency)
 */
export async function fetchGemini(apiKey, currentKeyIndex, prompt, imageBuffer, mimeType, forceJson = true, promptSettings = {}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  console.log(`[System] Initializing Gemini with key index ${currentKeyIndex} (${apiKey.substring(0, 8)})...`);

  let modelsToAttempt = [];
  const modelSelection = promptSettings?.modelName || '';
  const msLower = modelSelection.toLowerCase();

  let safetySettings = undefined;
  if (msLower.includes("(low)")) {
    safetySettings = [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_LOW_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_LOW_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_LOW_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_LOW_AND_ABOVE" }
    ];
  } else if (msLower.includes("(high)")) {
    safetySettings = [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
    ];
  } else if (msLower.includes("(none)")) {
    safetySettings = [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ];
  }

  // Start with the best available 2026 models
  // gemini-2.5-flash is the primary fast model for free tier in 2026
  if (msLower.includes('pro') || msLower.includes('high')) {
    modelsToAttempt = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];
  } else if (msLower.includes('flash') || msLower.includes('fast')) {
    modelsToAttempt = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.1-flash-lite"];
  } else {
    modelsToAttempt = ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];
  }
  modelsToAttempt = [...new Set(modelsToAttempt)];

  let lastError = null;
  let lastResponseText = null;
  let keyHitRateLimit = false;

  for (let i = 0; i < modelsToAttempt.length; i++) {
    const modelName = modelsToAttempt[i];
    try {
      const modelArgs = { 
        model: modelName,
        generationConfig: { responseMimeType: forceJson ? "application/json" : "text/plain" }
      };
      if (safetySettings) modelArgs.safetySettings = safetySettings;
      const model = genAI.getGenerativeModel(modelArgs);

      const contentParts = [];
      if (Array.isArray(imageBuffer)) {
        imageBuffer.forEach(buf => {
          contentParts.push({ inlineData: { data: buf, mimeType: mimeType } });
        });
      } else {
        contentParts.push({ inlineData: { data: imageBuffer, mimeType: mimeType } });
      }
      contentParts.push({ text: prompt });

      const response = await generateContentWithTimeout(model, contentParts, 60000); // Strict 60s timeout
      const text = response.text();

      let totalTokens = 0;
      try {
        const um = response.usageMetadata;
        if (um && typeof um.totalTokenCount === "number") totalTokens = um.totalTokenCount;
      } catch { /* ignore */ }
      recordApiUsage("gemini", apiKey, { totalTokens, requests: 1 });

      lastResponseText = text;
      break; // Successfully got response!
    } catch (error) {
      if (lastError && lastError.message && lastError.message.includes("Combined Errors:")) {
        lastError = new Error(`${lastError.message}\n- [${modelName}]: ${error.message}`);
      } else {
        lastError = error;
      }

      const isKeyInvalid =
        error.message.includes("API_KEY_INVALID") ||
        error.message.toLowerCase().includes("key not valid") ||
        error.message.toLowerCase().includes("invalid key") ||
        error.message.includes("401") ||
        error.message.includes("403");

      if (isKeyInvalid) {
        console.warn(`[Key Invalid] Key index ${currentKeyIndex} is invalid. Skipping key.`);
        keyHitRateLimit = true;
        break; 
      }

      const isQuotaExceeded =
        (error.message.toLowerCase().includes("quota") ||
         error.message.toLowerCase().includes("exceeded") ||
         error.message.toLowerCase().includes("billing")) &&
        !error.message.toLowerCase().includes("perminute") &&
        !error.message.toLowerCase().includes("rate limit");

      if (isQuotaExceeded) {
        console.warn(`[Quota Exceeded] Key index ${currentKeyIndex}: Model ${modelName} has no daily quota left. Falling back to next model...`);
        keyHitRateLimit = true;
        continue; 
      }

      const isRateLimit =
        error.message.includes("429") ||
        error.message.toLowerCase().includes("rate limit") ||
        error.message.toLowerCase().includes("perminute") ||
        error.message.toLowerCase().includes("resource_exhausted");

      const isHighDemand =
        error.message.includes("503") ||
        error.message.toLowerCase().includes("high demand") ||
        error.message.toLowerCase().includes("service unavailable") ||
        error.message.toLowerCase().includes("overloaded");

      if (isRateLimit || isHighDemand) {
        let retried = false;
        const maxRetries = isRateLimit ? 0 : 2;
        
        for (let retry = 0; retry < maxRetries; retry++) {
          const waitMs = (retry + 1) * 2000;
          const errorType = "503 High Demand";
          console.warn(`[${errorType}] Waiting ${waitMs / 1000}s before retry ${retry + 1}/${maxRetries} for ${modelName}...`);
          await new Promise(r => setTimeout(r, waitMs));
          
          try {
            const modelArgs2 = {
              model: modelName,
              generationConfig: { responseMimeType: forceJson ? "application/json" : "text/plain" }
            };
            if (safetySettings) modelArgs2.safetySettings = safetySettings;
            const model2 = genAI.getGenerativeModel(modelArgs2);
            const contentParts2 = [];
            if (Array.isArray(imageBuffer)) {
              imageBuffer.forEach(buf => contentParts2.push({ inlineData: { data: buf, mimeType } }));
            } else {
              contentParts2.push({ inlineData: { data: imageBuffer, mimeType } });
            }
            contentParts2.push({ text: prompt });
            const response2 = await generateContentWithTimeout(model2, contentParts2, 60000); // Strict 60s timeout
            const text2 = response2.text();
            try {
              const um2 = response2.usageMetadata;
              if (um2 && typeof um2.totalTokenCount === "number") recordApiUsage("gemini", apiKey, { totalTokens: um2.totalTokenCount, requests: 1 });
            } catch { /* ignore */ }
            lastResponseText = text2;
            retried = true;
            break;
          } catch (retryErr) {
            lastError = retryErr;
            const isStillHighDemand = retryErr.message.includes("503") || retryErr.message.toLowerCase().includes("high demand");
            if (!isStillHighDemand) {
              break;
            }
          }
        }
        
        if (retried) {
          break;
        } else {
          console.warn(`[Fail] ${modelName} on key ${currentKeyIndex}: Exhausted retries or Rate Limited.`);
          if (isRateLimit) keyHitRateLimit = true;
          continue; 
        }
      }

      if (error.message.includes("400")) {
        throw new Error(`Invalid Image or Prompt (400 Bad Request): ${error.message}`);
      }

      if (error.message.includes("404")) {
        continue; 
      }

      if (error.message.toLowerCase().includes("timed out") || error.message.toLowerCase().includes("timeout")) {
        console.warn(`[Timeout] Model ${modelName} request timed out on key ${currentKeyIndex}.`);
        if (i === modelsToAttempt.length - 1) {
          break; 
        }
        continue; 
      }
    }
  }

  if (lastResponseText === null) {
    const errorObj = lastError || new Error(`Gemini API Error: All model candidates failed.`);
    errorObj.keyHitRateLimit = keyHitRateLimit;
    throw errorObj;
  }

  if (!forceJson) {
    return lastResponseText.trim();
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

  const cleaned = lastResponseText.replace(/```json/g, "").replace(/```/g, "").trim();
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
