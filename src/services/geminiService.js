import { GoogleGenerativeAI } from "@google/generative-ai";
import { recordApiUsage } from "./apiUsageTracker.js";
import { fetchGroq } from "./apis/groq.js";
import { fetchOpenAI } from "./apis/openai.js";
import { fetchOpenRouter } from "./apis/openrouter.js";
import { fetchMistral } from "./apis/mistral.js";

/**
 * Super Robust Gemini Service with Multi-Version and Multi-Model fallbacks
 * Supports both raster images and EPS files (via extracted/placeholder previews)
 */

const modelsToTry = [
  "gemini-3.5-flash",
  "gemini-2.5-pro"
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
function buildPrompt({ isEps, isPlaceholder, isVideo, fileName, extractedTextContext, promptSettings }) {
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

  return `${fileContext}

You are a stock media SEO expert (15 yrs, 100k+ assets optimized on Adobe Stock, Shutterstock, Getty). Your metadata consistently ranks top-3 and drives downloads.

LANGUAGE: All input may be in any language. ALL output MUST be in English only.

${platformContext}${mediaHintStr}${customInstStr}

== TITLE (SEO Optimized Headline) ==
Formula: [Primary Subject] + [Specific Action/Attribute] + [Setting/Context]
Rules:
- Write a complete, descriptive sentence answering Who, What, Where, and Why (the 5W structure Shutterstock's semantic engine relies on).
- NEVER start with articles (A/An/The) or adjectives. Start with the most-searched noun.
- Be hyper-specific: "Businesswoman typing on silver laptop in modern glass office" NOT "Woman working on laptop".
- For vectors/illustrations: explicitly state the style ("flat vector illustration", "3D render", "seamless pattern", "glyph icon set").
- Forbidden words: stunning, vibrant, captivating, breathtaking, mesmerizing, showcasing, beautifully, perfect, amazing.
- Target Length: STRICTLY between ${s.titleMinChars || 10} and ${s.titleMaxChars || 80} characters. The title MUST be a complete grammatically correct sentence.${s.negTitleEnabled && s.negTitleWords ? `\n- Forbidden in title: ${s.negTitleWords}.` : ""}
- CRITICAL FOR ADOBE STOCK: Every important noun, adjective and verb in your title MUST also appear in the keyword list, because Adobe Stock titles are NOT searchable — only keywords are indexed.

== DESCRIPTION (SEO Optimized Detail) ==
Formula: [Factual visual description + Style/Lighting] + [2-3 specific commercial use-cases]
Rules:
- Expand on the title with factual details. Do not just list keywords.
- Sentence 1: Detail the style, colors, composition, and specific subjects.
- Sentence 2: Name concrete commercial applications (e.g., "Ideal for corporate presentations, marketing materials, and web banners").
- Keep it professional, objective, and active voice.
- Forbidden words: stunning, breathtaking, meticulously, "This image shows", "Here we can see".
- Target Length: STRICTLY between ${s.descMinChars || 50} and ${s.descMaxChars || 120} characters.

== ${kwMode} ==

Keyword rules (apply to all modes):

SLOT ORDER & STRICT RANKING — You MUST order and rank keywords exactly by their relevance to the image. The most accurate, literal, and important words MUST come first:
  TOP 10 KEYWORDS (Positions 1-10): THE CORE (CRITICAL FOR ADOBE STOCK) — These are the absolute most important, highest-ranking, literal, and descriptive search terms for this specific image. You MUST place them at the very front.
  SLOT 2 (Positions 11-25): ATTRIBUTES & SECONDARY SUBJECTS — Colors, materials, lighting style, camera angle, composition, secondary background elements, and specific demographics.
  SLOT 3 (Positions 26+): COMMERCIAL CONCEPTS & THEMES — To reach your exact total keyword count, fill these slots primarily with abstract themes, emotions, industry niches, and buyer use-cases. You may include a MAXIMUM of 1 or 2 specific focal colors. DO NOT hallucinate fake physical objects.

GRAMMAR RULES (Adobe Stock NLP requirements):
- Use SINGULAR nouns only. The algorithm auto-expands to plural. Write "dog" not "dogs", "camera" not "cameras".
- Use INFINITIVE verb forms only. Write "run", "smile", "hold" — NOT "running", "smiled", "holding".

QUALITY RULES:
- NO generic filler: "thing", "item", "nice", "great", "image", "photo", "picture", "graphic", "element".
- STRICT VISIBILITY RULE: ONLY describe what is PHYSICALLY VISIBLE. Never infer tech concepts not shown (e.g., a physical camera icon does NOT justify adding "software", "web", "data", "application", "wireless").
- NO root duplicates: never use both "camera" and "cameras", or "color" and "colorful". Pick the most commercial singular form.
- UNIVERSAL BRAND & TRADEMARK BAN: You must NEVER include ANY brand name, company name, corporate entity, trademarked term, product model name, or protected design name in keywords, titles, or descriptions. This ban applies universally to ALL brands and trademarks globally (not just famous ones like Nike, Apple, Adidas, etc.). You must use generic, non-branded alternatives instead (e.g., "smartwatch" instead of "Apple Watch", "athletic shoes" instead of "Nikes", "carbonated soft drink" instead of "Coca-Cola", "gaming console" instead of "PlayStation").
- No banned words: "free", "download", "copyright", "watermark".
- No hashtags. ${singleWordRule}${negInstructions}

== IP & POLICY VIOLATION SCAN (UNIVERSAL TRADEMARK CHECK) ==
Before generating metadata, carefully examine the image for elements that would cause REJECTION on Adobe Stock, Shutterstock, or Getty Images due to intellectual property (IP) laws. You must check for:
- LOGOS & BRANDING: Any visible logo, wordmark, brand name, corporate identity, emblem, or trademarked symbol on clothing, products, vehicles, devices, signs, or in the background.
- TRADEMARKED SPORTS DESIGNS: Distinctive designs or official match items associated with specific sports leagues, teams, tournaments, or sponsors.
- COMMERCIAL PRODUCTS WITH PROTECTED DESIGN: Recognizable toys, specific consumer electronics, designer goods, or vehicles where the product's shape or design itself is protected.
- COPYRIGHTED ARTWORK: Art, murals, sculptures, graffiti, or illustrations created by a known or unknown artist that are clearly visible and identifiable.
- RESTRICTED ARCHITECTURE: Modern buildings, landmarks, or private properties with a distinctive trademarked design.
- METADATA KEYWORD VIOLATIONS: Any brand name or trademarked word in the generated title, description, or keywords.

CRITICAL MANDATE FOR WARNINGS: If you detect ANY brand name, trademark, company logo, or protected design in the image (regardless of whether it is a famous brand or not), you MUST set the "policyWarning" field in your JSON output to a brief (max 2 sentences), specific, actionable message explaining exactly what the trademark or brand issue is and what the user should do about it. If there is absolutely no trademark, brand, logo, or design copyright issue, set "policyWarning" to null.

Example warning: "The soccer ball features a trademarked brand design, which may cause an IP refusal. Consider using a generic soccer ball without the pattern."

== CATEGORY ==
Choose 1-2 best-fit from: ${categoryList}

== COMMERCIAL EVALUATION ==
Evaluate this image's COMMERCIAL POTENTIAL for stock photo marketplaces (Adobe Stock, Shutterstock, Getty) across 4 dimensions:
1. commercialConcept: Choose exactly one value: "evergreen" (universal evergreen appeal, teamwork, sunset, family), "popular" (highly searched but competitive, food, travel, tech), "niche" (limited audience, personal/artistic), or "none" (obscure, no clear commercial use).
2. subjectClarity: Choose exactly one value: "perfect" (isolated, single clear subject, perfect composition), "clear" (clear subject, minor distractions), "cluttered" (visible but cluttered/busy/poor framing), or "confusing" (ambiguous/confusing content).
3. technicalQuality: Choose exactly one value: "professional" (sharp, excellent lighting, clean finish), "good" (minor lighting/sharpness issues, usable), "acceptable" (noticeable noise, flat lighting), or "poor" (blurry, out of focus, heavily noisy).
4. marketDemand: Choose exactly one value: "high" (currently trending high-demand, AI, tech, sustainability, wellness), "evergreen" (consistently popular evergreen topic), "low" (declining/oversaturated trend), or "none" (no identifiable demand).

In "scoreReason": write exactly 1 sentence (max 15 words) naming the PRIMARY factor.

== KEYWORD SCORES (ABSOLUTE CRITICAL MANDATE) ==
You MUST evaluate EVERY SINGLE keyword you generate and assign it a "Commercial Relevance Score" from 1 to 100 based strictly on how accurately and importantly it describes THIS SPECIFIC image.
CRITICAL RULE: The number of items in your "keywordScores" object MUST EXACTLY MATCH the number of keywords in your "keywords" string. Do NOT skip scoring ANY keyword. If you output 48 keywords, you MUST output 48 scores.
We use this score to color-code keywords (Green/Yellow/Red):
- 80-100 (Green): Highly relevant SEO terms. The keyword perfectly describes the primary subjects, main actions, or core themes physically visible in this specific image.
- 40-79 (Yellow): Moderately relevant. The keyword describes background details, secondary elements, or broader related commercial concepts (this includes your Tier 6 conceptual keywords).
- 1-39 (Red): Low relevance or generic. DO NOT GENERATE THESE. Every keyword must be a high-value SEO search term.
Evaluate each keyword with brutal honesty based on the image content. Rank and score them exactly and accurately according to their true relevance to the image. Do not artificially inflate scores. A keyword must NEVER receive a high score if it is not physically visible or directly relevant.

Output ONLY valid JSON, no markdown:
{"title":"...","description":"...","keywords":"apple, technology, screen, ... (${promptKeywordsCount} total)","keywordScores":{"apple":95,"technology":80,"screen":45},"categories":["Cat1"],"commercialConcept":"popular","subjectClarity":"clear","technicalQuality":"good","marketDemand":"evergreen","scoreReason":"...","policyWarning":null}`;
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
function postProcessMetadata(metadata, promptSettings, fileInfo = {}) {
  const s = promptSettings || {};
  let result = { ...metadata };

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
          if (exactScore !== undefined && typeof exactScore === 'number') {
            return exactScore;
          }
        }
      }

      // Fallback if AI didn't score it (e.g., padded keywords from title/desc)
      const junk = new Set(["design", "image", "photo", "picture", "file", "graphic", "visual",
        "element", "object", "thing", "item", "nice", "great", "good", "look", "use"]);
      if (junk.has(kl) || kl.length < 3) return 10;
      
      let score = 70; // Default to Yellow/Medium
      const wordCount = kl.split(' ').length;
      if (wordCount > 1) score += 5;
      
      return Math.min(99, score);
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
        let remainingNeeds = minSmartCount - highQualityKws.length;
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
        // Fallback 0: Use valid kws that have lower relevance score (< 40)
        let remainingNeeds = s.keywordCount - finalKws.length;
        if (remainingNeeds > 0) {
          const lowerQualityKws = kws.filter(k => getKeywordScore(k) < 40 && !finalKws.includes(k));
          finalKws.push(...lowerQualityKws.slice(0, remainingNeeds));
        }

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

        // Fallback 4: Use safeFallbackKws with lower score (< 40)
        remainingNeeds = s.keywordCount - finalKws.length;
        if (remainingNeeds > 0) {
          const lqSafeFallback = safeFallbackKws.filter(w => getKeywordScore(w) < 40 && !finalKws.includes(w));
          finalKws.push(...lqSafeFallback.slice(0, remainingNeeds));
        }

        // Fallback 5: Extract remaining words from title and description (< 40)
        remainingNeeds = s.keywordCount - finalKws.length;
        if (remainingNeeds > 0) {
          const titleDescWords = ((result.title || "") + " " + (result.description || ""))
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length >= 3 && !/^(the|and|for|with|this|that|from|have|has|are|was|were|you|your)$/.test(w));
          
          const uniqueExtra = [...new Set(titleDescWords)]
            .filter(w => !finalKws.includes(w));
          finalKws.push(...uniqueExtra.slice(0, remainingNeeds));
        }

        // Fallback 6: Extract words from cleanName/fileName
        remainingNeeds = s.keywordCount - finalKws.length;
        const fn = fileInfo.fileName || "";
        if (remainingNeeds > 0 && fn) {
          let cleanName = fn.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
          const nameWords = cleanName.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !/^(the|and|for|with|this|that|from|have|has|are|was|were|you|your|eps|vector|illustration|file|placeholder)$/.test(w));
          const uniqueNameWords = [...new Set(nameWords)].filter(w => !finalKws.includes(w));
          finalKws.push(...uniqueNameWords.slice(0, remainingNeeds));
        }

        // Fallback 7: General high-quality stock keywords as a last resort to hit the exact count
        remainingNeeds = s.keywordCount - finalKws.length;
        if (remainingNeeds > 0) {
          const isVector = fileInfo.isEps || (result.title + " " + result.description).toLowerCase().includes("vector") || (result.title + " " + result.description).toLowerCase().includes("illustration");
          const isVid = fileInfo.isVideo;
          
          let generalPool = [];
          if (isVector) {
            generalPool = [
              "vector", "illustration", "graphic", "design", "creative", "element", "isolated", "backdrop", 
              "background", "artwork", "template", "clipart", "modern", "flat design", "art", "draw", "drawing", 
              "concept", "decorative", "style", "layout", "symbol", "icon", "banner", "poster", "pattern"
            ];
          } else if (isVid) {
            generalPool = [
              "video", "footage", "clip", "motion", "cinematic", "real time", "action", "scene", "concept", 
              "background", "creative", "isolated", "film", "production", "movement", "backdrop", "view", "atmosphere"
            ];
          } else {
            generalPool = [
              "photo", "photography", "image", "concept", "background", "isolated", "creative", "shot", "picture", 
              "scene", "backdrop", "wallpaper", "modern", "studio", "view", "object", "detail", "clear", "professional"
            ];
          }
          
          const uniqueGeneral = generalPool.filter(w => !finalKws.includes(w));
          finalKws.push(...uniqueGeneral.slice(0, remainingNeeds));
        }

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
  const prompt = buildPrompt({ isEps, isPlaceholder, isVideo, fileName, extractedTextContext, promptSettings });

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
        if (currentProvider === "groq") parsed = await fetchGroq(apiKey, prompt, imageBuffer, mimeType, true, promptSettings);
        else if (currentProvider === "openai") parsed = await fetchOpenAI(apiKey, prompt, imageBuffer, mimeType, true, promptSettings);
        else if (currentProvider === "openrouter") parsed = await fetchOpenRouter(apiKey, prompt, imageBuffer, mimeType, true, promptSettings);
        else if (currentProvider === "mistral") parsed = await fetchMistral(apiKey, prompt, imageBuffer, mimeType, true, promptSettings);
        else throw new Error("Unknown provider: " + currentProvider);
        
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
    const genAI = new GoogleGenerativeAI(apiKey);
    console.log(`[System] Initializing Gemini with key index ${currentKeyIndex} (${apiKey.substring(0, 8)})...`);

    let modelsToAttempt = [];
    const modelSelection = promptSettings?.modelName || (typeof apiProvider === 'string' ? apiProvider : '');
    
    // Parse Safety Settings from the dropdown (e.g., "Gemini 3.5 Flash (Medium)")
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

    // Clean and match model names based on UI selections
    if (msLower.includes('2.5') || msLower.includes('pro')) {
      modelsToAttempt = ["gemini-2.5-pro", "gemini-3.5-flash"];
    } else if (msLower.includes('3.5') || msLower.includes('flash') || msLower.includes('gemini') || !msLower) {
      modelsToAttempt = ["gemini-3.5-flash", "gemini-2.5-pro"];
    } else {
      // Direct string match fallback if a custom raw model is passed in
      modelsToAttempt = [modelSelection.split(' ')[0], "gemini-3.5-flash", "gemini-2.5-pro"];
    }
    
    // Remove duplicates
    modelsToAttempt = [...new Set(modelsToAttempt)];

    let keyHitRateLimit = false;

    // Try available models for this specific key
    for (let i = 0; i < modelsToAttempt.length; i++) {
      const modelName = modelsToAttempt[i];
      try {
        // Suppress exact model name logging to avoid confusion
        // console.log(`[Attempt] Model: ${modelName} on key ${currentKeyIndex}`);
        const modelArgs = { 
          model: modelName,
          generationConfig: { responseMimeType: "application/json" }
        };
        if (safetySettings) modelArgs.safetySettings = safetySettings;
        const model = genAI.getGenerativeModel(modelArgs);

        const contentParts = [];
        if (Array.isArray(imageBuffer)) {
          imageBuffer.forEach(buf => {
            contentParts.push({
              inlineData: {
                data: buf,
                mimeType: mimeType,
              },
            });
          });
        } else {
          contentParts.push({
            inlineData: {
              data: imageBuffer,
              mimeType: mimeType,
            },
          });
        }
        contentParts.push({ text: prompt });

        const result = await model.generateContent(contentParts);

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

        // console.log(`[Success] Metadata generated using ${modelName} on key index ${currentKeyIndex}!`);

        const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch (e) {
          const match = cleaned.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
          else throw new Error("JSON parse error");
        }

        return postProcessMetadata(parsed, promptSettings, fileInfo);

      } catch (error) {
        // console.warn(`[Fail] ${modelName} on key ${currentKeyIndex}: ${error.message}`);
        lastError = error;

        // Key is definitively invalid → skip this key entirely
        const isKeyInvalid =
          error.message.includes("API_KEY_INVALID") ||
          error.message.toLowerCase().includes("key not valid") ||
          error.message.toLowerCase().includes("invalid key") ||
          error.message.includes("401") ||
          error.message.includes("403");

        if (isKeyInvalid) {
          console.warn(`[Key Invalid] Key index ${currentKeyIndex} is invalid. Proceeding to next key.`);
          keyHitRateLimit = true;
          break; // Break inner model loop → try next key
        }

        // Rate limit / quota on THIS MODEL → try next model on same key first
        const isRateLimit =
          error.message.includes("429") ||
          error.message.toLowerCase().includes("quota") ||
          error.message.toLowerCase().includes("rate limit") ||
          error.message.toLowerCase().includes("resource_exhausted");

        if (isRateLimit) {
          console.warn(`[Rate Limit] Model ${modelName} rate limited on key ${currentKeyIndex}. Trying next model...`);
          // Only break to next key if this is the LAST model to try
          if (i === modelsToAttempt.length - 1) {
            console.warn(`[Key Exhausted] All models rate limited on key ${currentKeyIndex}. Proceeding to next key.`);
            keyHitRateLimit = true;
            break;
          }
          continue; // Try next model on same key
        }

        // 503 Service Unavailable (high demand) → retry same model with backoff
        const isHighDemand =
          error.message.includes("503") ||
          error.message.toLowerCase().includes("high demand") ||
          error.message.toLowerCase().includes("service unavailable") ||
          error.message.toLowerCase().includes("overloaded");

        if (isHighDemand) {
          // Retry current model up to 3 times with exponential backoff
          let retried = false;
          for (let retry = 0; retry < 3; retry++) {
            const waitMs = (retry + 1) * 3000; // 3s, 6s, 9s
            console.warn(`[503 High Demand] Waiting ${waitMs / 1000}s before retry ${retry + 1}/3 for ${modelName}...`);
            await new Promise(r => setTimeout(r, waitMs));
            try {
              const modelArgs2 = {
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
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
              const result2 = await model2.generateContent(contentParts2);
              const response2 = await result2.response;
              const text2 = response2.text();
              try {
                const um2 = response2.usageMetadata;
                if (um2 && typeof um2.totalTokenCount === "number") recordApiUsage("gemini", apiKey, { totalTokens: um2.totalTokenCount, requests: 1 });
              } catch { /* ignore */ }
              const cleaned2 = text2.replace(/```json/g, "").replace(/```/g, "").trim();
              let parsed2;
              try { parsed2 = JSON.parse(cleaned2); }
              catch (e2) {
                const match2 = cleaned2.match(/\{[\s\S]*\}/);
                if (match2) parsed2 = JSON.parse(match2[0]);
                else throw new Error("JSON parse error after 503 retry");
              }
              retried = true;
              return postProcessMetadata(parsed2, promptSettings, fileInfo);
            } catch (retryErr) {
              lastError = retryErr;
              // If still 503, continue retry loop; otherwise break
              if (!retryErr.message.includes("503") && !retryErr.message.toLowerCase().includes("high demand") && !retryErr.message.toLowerCase().includes("overloaded")) {
                break;
              }
            }
          }
          if (!retried) continue; // Give up on this model, try next
          break;
        }

        if (error.message.includes("400")) {
          continue;
        }

        if (error.message.includes("404")) {
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
          const result = await model.generateContent([{ inlineData: { data: imageBuffer, mimeType } }, { text: promptToUse }]);
          const response = await result.response;
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
    throw (lastError || new Error(`Could not connect to any ${apiProvider} model.`));
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
        const result = await model.generateContent([
          {
            inlineData: {
              data: imageBuffer,
              mimeType: mimeType,
            },
          },
          { text: exactMatchPrompt },
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

        if (error.message.includes("400")) continue;
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
          break; // Break inner loop, go to next key
        }
        if (error.message.includes("400") || error.message.includes("404")) continue;
      }
    }
  }

  if (lastError && (lastError.message.includes("429") || lastError.message.includes("quota"))) {
    throw new Error(`API Rate Limit Reached. Please wait 30 seconds.`);
  }

  throw (lastError || new Error(`Could not connect to any model for security scan.`));
}

