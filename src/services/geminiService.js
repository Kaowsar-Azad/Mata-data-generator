import { GoogleGenerativeAI } from "@google/generative-ai";
import { recordApiUsage } from "./apiUsageTracker.js";

/**
 * Super Robust Gemini Service with Multi-Version and Multi-Model fallbacks
 * Supports both raster images and EPS files (via extracted/placeholder previews)
 */

const modelsToTry = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
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
    ? "- STRICT: Every keyword must be a single word. No phrases."
    : "- Single words preferred. Short 2-word phrases that buyers actually search (e.g., \"coffee cup\", \"social media\") are allowed. NEVER write 3+ word phrases as a keyword.";

  // ── Keyword generation strategy ────────────────────────────────────────────
  let keywordEmphasis = "";
  if (s.smartMode) {
    keywordEmphasis = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEYWORD STRATEGY — SMART QUALITY MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generate ONLY the most commercially valuable, high-buyer-intent keywords. No padding, no generic filler.

Use this 4-tier framework:
  TIER 1 — EXACT MATCH (highest priority): The precise literal terms a buyer types to find THIS specific image (3-8 keywords)
  TIER 2 — LONG-TAIL PHRASES: 2-word combinations that capture specific buyer intent (5-10 keywords)
  TIER 3 — SEMANTIC/CONCEPTUAL: Broader themes, moods, emotions, and contexts strongly implied by the image (5-10 keywords)
  TIER 4 — COMMERCIAL APPLICATION: Real use-cases, industries, or contexts where buyers license this image (3-7 keywords)

Do NOT generate generic terms like "image", "photo", "picture", "file", "design", "element" unless they appear as part of a specific compound like "flat design" or "vector element".
Do NOT pad the list. Every keyword must pass this test: "Would a buyer searching ONLY this term want to find this specific image?"`;  
  } else {
    keywordEmphasis = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEYWORD STRATEGY — MAXIMUM COVERAGE MODE (EXACTLY ${s.keywordCount} keywords required)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST generate EXACTLY ${s.keywordCount} keywords using this precise 6-tier framework:

  TIER 1 — PRIMARY SUBJECTS (6-10 keywords): The literal nouns visible in the image. Most important tier — buyers search these first.
    Examples: "laptop", "coffee", "woman", "mountain", "heart icon", "stethoscope"

  TIER 2 — DESCRIPTIVE ATTRIBUTES (8-12 keywords): Specific colors, materials, quantities, styles, lighting, and conditions.
    Examples: "red", "wooden", "three", "hand-drawn", "transparent background", "overhead view", "studio light"

  TIER 3 — ACTIONS & STATES (6-10 keywords): What is happening, movement, poses, interactions.
    Examples: "working", "smiling", "flying", "isolated", "growing", "connected", "holding"

  TIER 4 — MOODS & CONCEPTS (8-12 keywords): High-value abstract ideas, emotions, and themes the image conveys.
    Examples: "success", "freedom", "teamwork", "healthcare", "innovation", "sustainability", "leadership"

  TIER 5 — COMMERCIAL USE-CASES (5-10 keywords): Specific industries or ways buyers will use this image.
    Examples: "website banner", "social media", "presentation", "infographic", "logo", "packaging"

  TIER 6 — HIGH-VALUE SYNONYMS & RELATED CONCEPTS (Fill exactly to reach ${s.keywordCount}): Do NOT use generic filler. Use highly specific, related commercial terms, regional variants, and niche industry vocabulary.
    Examples: "fintech", "wellness", "e-commerce", "startup", "remote work", "cybersecurity"

COUNT ENFORCEMENT PROTOCOL:
  Step 1: Generate all keywords across all 6 tiers using ONLY highly descriptive, valuable terms.
  Step 2: Count your total. If below ${s.keywordCount}, expand Tier 6 with more high-value synonyms or related industry terms. Do NOT use generic words like "nice", "picture", "background".
  Step 3: If above ${s.keywordCount}, remove the weakest keywords.
  Step 4: Final count MUST be EXACTLY ${s.keywordCount}. Not one more, not one less.

ABSOLUTE MINIMUM STANDARD: Every single keyword must be a highly relevant, commercial search term a real buyer would type. No generic filler!`;
  }

  // ── Master prompt assembly (token-efficient) ──────────────────────────────
  const kwMode = s.smartMode
    ? `KEYWORDS — QUALITY MODE: Generate only high buyer-intent keywords. Use 4 tiers:
  T1 Exact-match literals (3-8), T2 2-word buyer phrases (5-10), T3 Semantic/concepts (5-10), T4 Commercial use-cases (3-7).
  Test: "Would a buyer searching ONLY this word want THIS image?" Remove anything that fails.`
    : `KEYWORDS — COUNT MODE: Generate EXACTLY ${s.keywordCount} keywords using 6 tiers:
  T1 Primary nouns/subjects (6-10), T2 Colors/materials/style attributes (5-8),
  T3 Actions/states/composition (4-6), T4 Moods/concepts/emotions (5-8),
  T5 Commercial use-cases (5-8), T6 Industry/niche/synonym terms (fill to hit ${s.keywordCount} exactly).
  Count before output. Adjust T6 up/down to hit exactly ${s.keywordCount}. Never submit fewer.`;

  return `${fileContext}

You are a stock media SEO expert (15 yrs, 100k+ assets optimized on Adobe Stock, Shutterstock, Getty). Your metadata consistently ranks top-3 and drives downloads.

LANGUAGE: All input may be in any language. ALL output MUST be in English only.

${platformContext}${mediaHintStr}${customInstStr}

== TITLE (SEO Optimized Headline) ==
Formula: [Primary Subject] + [Specific Action/Attribute] + [Setting/Context]
Rules:
- Write a highly descriptive, factual sentence. Answer: Who, What, Where, and Why.
- NEVER start with articles (A/An/The) or adjectives. Start with the most searched noun.
- Be highly specific: "Businesswoman typing on silver laptop in modern glass office" NOT "Woman working on laptop".
- For vectors/illustrations: explicitly state the style ("flat vector illustration", "3D render", "seamless pattern").
- Forbidden words: stunning, vibrant, captivating, breathtaking, mesmerizing, showcasing, beautifully, perfect, amazing.
${s.smartMode ? `- Concise and heavily keyword-dense.` : `- Target Length: 55–70 characters. This is the SEO sweet spot.`}${s.negTitleEnabled && s.negTitleWords ? `\n- Forbidden in title: ${s.negTitleWords}.` : ""}

== DESCRIPTION (SEO Optimized Detail) ==
Formula: [Factual visual description + Style/Lighting] + [2-3 specific commercial use-cases]
Rules:
- Expand on the title with factual details. Do not just list keywords.
- Sentence 1: Detail the style, colors, composition, and specific subjects.
- Sentence 2: Name concrete commercial applications (e.g., "Ideal for corporate presentations, marketing materials, and web banners").
- Keep it professional, objective, and active voice.
- Forbidden words: stunning, breathtaking, meticulously, "This image shows", "Here we can see".
${s.smartMode ? `- Concise, natural, and keyword-rich.` : `- Target Length: 80–150 characters.`}

== ${kwMode} ==

Keyword rules (apply to all modes):
- Order of Importance: Place the absolute most relevant 10 keywords FIRST. Include all Title words in the first 10 keywords.
- NO generic filler: "thing", "item", "nice", "great", "image", "photo", "picture", "background", "graphic".
- Rule for Abstract Concepts: DO NOT use abstract concepts (e.g., "fun", "reality", "enjoyment", "virtual") UNLESS they are the absolute primary commercial theme of the specific image. Stick strictly to concrete, visible nouns and highly relevant industry terms.
- NO root duplicates: do not use both "car" and "cars", or "color" and "colorful". Use the single most commercial form.
- Be hyper-specific: use "beagle puppy" instead of just "dog".
- No brand/trademark names. No banned words: "free", "download", "copyright", "watermark".
- No hashtags. ${singleWordRule}${negInstructions}

== CATEGORY ==
Choose 1-2 best-fit from: ${categoryList}

== COMMERCIAL EVALUATION ==
Evaluate this image's COMMERCIAL POTENTIAL for stock photo marketplaces (Adobe Stock, Shutterstock, Getty) across 4 dimensions:
1. commercialConcept: Choose exactly one value: "evergreen" (universal evergreen appeal, teamwork, sunset, family), "popular" (highly searched but competitive, food, travel, tech), "niche" (limited audience, personal/artistic), or "none" (obscure, no clear commercial use).
2. subjectClarity: Choose exactly one value: "perfect" (isolated, single clear subject, perfect composition), "clear" (clear subject, minor distractions), "cluttered" (visible but cluttered/busy/poor framing), or "confusing" (ambiguous/confusing content).
3. technicalQuality: Choose exactly one value: "professional" (sharp, excellent lighting, clean finish), "good" (minor lighting/sharpness issues, usable), "acceptable" (noticeable noise, flat lighting), or "poor" (blurry, out of focus, heavily noisy).
4. marketDemand: Choose exactly one value: "high" (currently trending high-demand, AI, tech, sustainability, wellness), "evergreen" (consistently popular evergreen topic), "low" (declining/oversaturated trend), or "none" (no identifiable demand).

In "scoreReason": write exactly 1 sentence (max 15 words) naming the PRIMARY factor.

== KEYWORD SCORES ==
For every single keyword generated, you must assign a "Commercial Relevance Score" from 1 to 100 representing how accurately it matches the visual content of the image and its search value for buyers.
- 80-100 (High): Primary subjects, essential descriptive attributes (like prominent colors, styles, materials, or actions visible in the image), and high-intent commercial search terms that are directly relevant to the image. (Most of your keywords should be scored in this range if they are highly relevant and accurate!).
- 40-79 (Medium): Broad context, general category terms, or secondary thematic concepts.
- 1-39 (Low): Very generic words, weak synonyms, or peripheral details.

Output ONLY valid JSON, no markdown:
{"title":"...","description":"...","keywords":"kw1, kw2, kw3${s.smartMode ? '' : `, ... (${s.keywordCount} total)`}","keywordScores":{"kw1":95,"kw2":80,"kw3":45},"categories":["Cat1"],"commercialConcept":"popular","subjectClarity":"clear","technicalQuality":"good","marketDemand":"evergreen","scoreReason":"..."}`;
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
    let kws = result.keywords.split(",").map(k => k.trim()).filter(Boolean);

    // 1. Remove banned words
    if (s.negKeywordsEnabled && s.negKeywords && s.negKeywords.trim()) {
      const banned = s.negKeywords.split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
      kws = kws.filter(k => !banned.includes(k.toLowerCase()));
    }

    // 2. Remove keywords shorter than 2 chars or obvious junk
    kws = kws.filter(k => k.length >= 2 && !/^(a|an|the|and|or|of|in|on|at|to|for|with|by)$/i.test(k));

    // 3. Deduplicate root forms (e.g. remove "colors" if "color" present)
    const seen = new Set();
    kws = kws.filter(k => {
      const root = k.toLowerCase().replace(/s$/, '').replace(/ing$/, '').replace(/ed$/, '');
      if (seen.has(root)) return false;
      seen.add(root);
      return true;
    });

    // 4. Quality scoring — prefer specific multi-word phrases and concrete nouns over generic single words
    const getKeywordScore = (keyword) => {
      const kl = keyword.toLowerCase().trim();
      
      // If AI provided a score, use it for accurate sorting!
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

      // Extremely generic single words that add no value
      const junk = new Set(["design", "image", "photo", "picture", "file", "graphic", "visual",
        "element", "object", "thing", "item", "nice", "great", "good", "look", "use"]);
      if (junk.has(kl)) return 10; // Very low score
      // Boost multi-word phrases (more specific = more valuable for SEO)
      const wordCount = kl.split(' ').length;
      let score = 60 + (wordCount > 1 ? 15 : 0);
      // Boost keywords that are 4-15 chars (specific enough)
      if (kl.length >= 4 && kl.length <= 15) score += 10;
      // Small hash-based variance for stable ordering
      let hash = 0;
      for (let i = 0; i < kl.length; i++) hash = kl.charCodeAt(i) + ((hash << 5) - hash);
      score += (Math.abs(hash) % 15);
      return Math.min(99, score);
    };

    // 5. Filter out zero-value keywords
    kws = kws.filter(k => getKeywordScore(k) >= 20);
    // Sort: highest SEO value first
    kws.sort((a, b) => getKeywordScore(b) - getKeywordScore(a));

    // 6. Enforce count — trim only, never pad with generic fallbacks (quality is paramount)
    if (!s.smartMode && s.keywordCount) {
      if (kws.length > s.keywordCount) {
        kws = kws.slice(0, s.keywordCount);
      }
      // If under count, accept what the AI gave (it may have given quality-filtered fewer keywords)
      // Do NOT pad with generic words — that would hurt SEO ranking
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
    const messageContent = [{ type: "text", text: prompt }];
    if (Array.isArray(base64Data)) {
      base64Data.forEach(buf => {
        messageContent.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${buf}` } });
      });
    } else {
      messageContent.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } });
    }

    const payload = {
      model: currentModel,
      messages: [
        {
          role: "user",
          content: messageContent
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
          error.message.toLowerCase().includes("key not valid") ||
          error.message.toLowerCase().includes("invalid key") ||
          error.message.includes("403") ||
          error.message.includes("429") ||
          error.message.toLowerCase().includes("quota") ||
          error.message.toLowerCase().includes("limit")
        ) {
          console.warn(`[Key Exhausted] Key index ${currentKeyIndex} is invalid or exhausted. Proceeding to next key.`);
          keyHitRateLimit = true;
          break; // Break the inner model loop to try the next key
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
  
  const modeInstruction = mode === "Unique Variation" 
    ? `\nUNIQUE VARIATION MODE (CRITICAL): Do not describe the exact image. Instead, invent a visually distinct but thematically related variation. Change the subject's pose, the camera angle, the lighting, or the environment significantly to ensure the resulting image is entirely unique and avoid duplicate stock content.`
    : `\nEXACT MATCH MODE (CRITICAL): Describe this exact image as meticulously as possible to act as a 1:1 recreation recipe.`;

  const prompt = `You are an expert AI image prompt engineer specializing in Midjourney v6 and Stable Diffusion. Your task is to analyze the provided image and reverse-engineer it into a highly detailed, professional text-to-image prompt.
${modeInstruction}

Construct your prompt using the following structure, blended into a single continuous, highly descriptive paragraph. Do not use bullet points or line breaks in the final output.

1. Subject & Core Action: Clearly state what the main subject is, their exact physical appearance (age, ethnicity, attire, expression, exact pose), and what they are doing. 
2. Environment & Background: Describe the setting, foreground, background elements, and atmosphere in detail.
3. Camera & Composition: Include precise photography terminology (e.g., 35mm lens, f/1.8, cinematic shot, extreme close-up, low angle, macro photography, rule of thirds, depth of field, bokeh, sharp focus).
4. Lighting & Color Palette: Specify lighting types (e.g., golden hour, neon lighting, volumetric lighting, rim lighting, soft diffused light, studio lighting, dramatic shadows) and the exact color grading or dominant colors.
5. Artistic Style & Medium: Note the medium (e.g., hyper-realistic photography, 3D render in Unreal Engine 5, flat vector illustration, watercolor, cyberpunk aesthetic, vintage film aesthetic, ultra-detailed 8k resolution).
6. Human Anatomy (If humans are present): Explicitly describe precise anatomical features to force the AI to render them correctly (e.g., "perfectly formed hands with exactly 5 fingers, symmetrical facial features, highly detailed eyes with distinct pupils and iris reflections, realistic skin texture with pores").

CRITICAL RULES:
- Output ONLY the raw text of the final prompt. Do not include introductory text, quotes, or markdown formatting.
- Do NOT use multiple paragraphs, sections, bullet points, or line breaks. It must be ONE single continuous paragraph of text.
- WATERMARKS: Completely ignore any watermarks, logos, or copyright text. Do not mention them.
- SAFETY: Keep all language perfectly safe and policy-compliant (no explicit, violent, or risky terms).
- Use rich, evocative visual adjectives (e.g., "glowing," "textured," "dynamic").
- Aim for a length of roughly 60 to 120 words for optimal AI generation.`;

  let lastError = null;
  const startKeyIndex = globalKeyIndex;
  if (apiKeys && apiKeys.length > 0) {
    globalKeyIndex = (globalKeyIndex + 1) % apiKeys.length;
  }

  for (let k = 0; k < apiKeys.length; k++) {
    const currentKeyIndex = (startKeyIndex + k) % apiKeys.length;
    const keyItem = apiKeys[currentKeyIndex];
    
    // Support both new {provider, key} object format and legacy string format
    let currentProvider = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
    if (Array.isArray(currentProvider)) currentProvider = currentProvider[0] || 'gemini';
    const apiKey = typeof keyItem === 'object' ? keyItem.key : keyItem;

    // OpenAI Compatible Route (Groq, etc.)
    if (currentProvider !== "gemini") {
      try {
        const enrichedPrompt = `You are an Expert AI Prompt Engineer specialized in Midjourney and Stable Diffusion. 
Your task is to analyze the attached image and write a MASTERPIECE prompt.

${prompt}

ADVICE FOR EXCELLENCE: 
Use professional photography terms (e.g. "85mm lens", "soft bokeh", "rim lighting", "high dynamic range"). 
Be vivid and poetic but stay within a single paragraph.`;

        console.log(`[Attempt] Provider: ${currentProvider} (Image to Prompt) using key index ${currentKeyIndex}`);
        const text = await fetchOpenAICompatible(currentProvider, apiKey, enrichedPrompt, imageBuffer, mimeType, false);
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
    throw new Error(`API Rate Limit Reached on all ${apiKeys.length} keys. Please wait 30 seconds before generating again.`);
  }

  throw (
    lastError ||
    new Error(`Critical: Could not connect to any ${apiProvider} model. Please check your API keys.`)
  );
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
        const parsed = await fetchOpenAICompatible(currentProvider, apiKey, enrichedPrompt, imageBuffer, mimeType, true);
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

