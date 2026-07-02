import { fetchOpenAICompatible } from "./openAICompatible.js";

/**
 * Build the metadata prompt depending on file context for Groq.
 */
export function buildGroqPrompt({ isEps, isPlaceholder, isVideo, fileName, extractedTextContext, promptSettings }) {
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
{"title":"...","description":"...","keywords":"apple, technology, screen, ... (\${promptKeywordsCount} total)","keywordScores":{"apple":95,"technology":80,"screen":45},"categories":\${categoryList},"commercialConcept":"popular","subjectClarity":"clear","technicalQuality":"good","marketDemand":"evergreen","scoreReason":"...","policyWarning":null}`;
}

export async function fetchGroq(apiKey, prompt, base64Data, mimeType, forceJson = true, promptSettings = {}) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const models = [
    "llama-3.2-90b-vision-preview",
    "meta-llama/llama-4-scout-17b-16e-instruct"
  ];
  return fetchOpenAICompatible("groq", endpoint, models, apiKey, prompt, base64Data, mimeType, forceJson, promptSettings);
}
