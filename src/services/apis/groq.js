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
  const keywordEmphasis = s.smartMode
    ? `KEYWORDS: Generate EXACTLY 15 to 30 highly relevant, commercial search terms. Do not exceed 30 keywords. Do not pad with generic words. Ensure they describe the image perfectly.`
    : `KEYWORDS: Generate EXACTLY 50 highly relevant keywords. Use primary subjects, colors, materials, actions, and commercial themes. NO generic filler. If the image is simple, you MUST use related synonyms, precise color shades, lighting conditions, specific material textures, and relevant design styles to reach 50. ABSOLUTELY DO NOT use random verbs (e.g. 'creates', 'features', 'various'), vague adjectives, or hallucinate unrelated contexts (e.g. 'social', 'media', 'online'). Separate keywords by commas.`;

  return `${fileContext}

You are a stock media SEO expert (15 yrs, 100k+ assets optimized on Adobe Stock, Shutterstock, Getty).
Your job is to return ONLY a valid JSON object.

LANGUAGE: All output MUST be in English only.

${platformContext}${mediaHintStr}${customInstStr}

== TITLE ==
- Formula: [Primary Subject] + [Specific Action/Attribute] + [Setting/Context]
- Must be a complete, natural, grammatically correct sentence.
- CRITICAL: Do NOT just list keywords separated by spaces (e.g. do NOT write 'Beige marble stone tiles wall background'). Instead, write a natural descriptive sentence with proper grammar (e.g. 'Beige marble stone tiles form a textured wall background').
- Length: STRICTLY between ${s.titleMinChars || 25} and ${s.titleMaxChars || 70} characters.${s.negTitleEnabled && s.negTitleWords ? `\\n- Forbidden in title: ${s.negTitleWords}.` : ""}

== DESCRIPTION ==
- Expand on title. Describe visual details, style, lighting, and 2-3 commercial use-cases.
- Length: STRICTLY between ${s.descMinChars || 50} and ${s.descMaxChars || 100} characters.

== ${keywordEmphasis} ==
- ${singleWordRule}
- Use SINGULAR nouns only (e.g. "dog", not "dogs").
- Use INFINITIVE verbs only (e.g. "run", not "running").
- STRICT VISIBILITY RULE: ONLY describe what is PHYSICALLY VISIBLE.
- NO BRAND NAMES: Never include trademarks (use "smartwatch" not "Apple Watch").
- NO generic filler keywords: "image", "photo", "picture", "file", "graphic", "visual", "element", "object", "thing", "item", "nice", "great", "good", "look", "use".
${s.negKeywordsEnabled && s.negKeywords ? `\\n- Forbidden keywords: ${s.negKeywords}.` : ""}

== CATEGORY ==
You MUST choose exactly ONE category from this exact list. Do NOT invent your own:
${categoryList}

== COMMERCIAL EVALUATION ==
Evaluate commercial potential across 4 dimensions. You MUST use exactly one of the allowed values:
1. commercialConcept: Choose exactly one: "evergreen", "popular", "niche", or "none".
2. subjectClarity: Choose exactly one: "perfect", "clear", "cluttered", or "confusing".
3. technicalQuality: Choose exactly one: "professional", "good", "acceptable", or "poor".
4. marketDemand: Choose exactly one: "high", "evergreen", "low", or "none".
5. scoreReason: Write exactly 1 short sentence naming the primary factor.

== KEYWORD SCORES ==
You MUST assign a score from 1 to 100 for EVERY generated keyword based on how LITERAL and VISIBLE it is in the image.
Follow this STRICT scoring rubric to match our frontend visualization:
- 75 to 100 (High / Green): ALL physically visible elements, main subjects, secondary details, colors, textures, patterns, and shapes (e.g. "marble", "stone", "black", "white", "veins", "texture", "pattern", "tiles", "wall", "wood").
- 40 to 74 (Medium / Yellow): Abstract concepts, commercial uses, settings, or overarching design themes (e.g. "design", "architecture", "elegance", "branding", "luxury", "interior", "decor").
- 1 to 39 (Low / Red): Low relevance or generic terms (DO NOT GENERATE THESE).
CRITICAL RULE: The number of items in your "keywordScores" object MUST EXACTLY MATCH the number of keywords in your "keywords" string. Do NOT skip scoring ANY keyword.

Output ONLY valid JSON, no markdown formatting:
{"title":"A complete and grammatically correct sentence describing the image.","description":"A detailed visual description explaining the layout, colors, and specific commercial uses.","keywords":"apple, screen, technology, ... (requested total)","keywordScores":{"apple":95,"screen":85,"technology":60},"categories":"Selected Category","commercialConcept":"popular","subjectClarity":"clear","technicalQuality":"good","marketDemand":"evergreen","scoreReason":"...","policyWarning":null}`;
}

export async function fetchGroq(apiKey, prompt, base64Data, mimeType, forceJson = true, promptSettings = {}) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const models = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "qwen/qwen3.6-27b"
  ];
  return fetchOpenAICompatible("groq", endpoint, models, apiKey, prompt, base64Data, mimeType, forceJson, promptSettings);
}
