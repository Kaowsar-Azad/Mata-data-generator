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
- 70 to 100 (High / Green): ALL physically visible elements, main subjects, secondary details, colors, textures, patterns, and shapes (e.g. "marble", "stone", "black", "white", "veins", "texture", "pattern", "tiles", "wall", "wood").
- 30 to 69 (Medium / Yellow): Abstract concepts, commercial uses, settings, or overarching design themes (e.g. "design", "architecture", "elegance", "branding", "luxury", "interior", "decor").
- 1 to 29 (Low / Red): Low relevance or generic terms (DO NOT GENERATE THESE).
CRITICAL RULE: The number of items in your "keywordScores" object MUST EXACTLY MATCH the number of keywords in your "keywords" string. Do NOT skip scoring ANY keyword.

Output ONLY valid JSON, no markdown formatting:
{"title":"A complete and grammatically correct sentence describing the image.","description":"A detailed visual description explaining the layout, colors, and specific commercial uses.","keywords":"apple, screen, technology, ... (requested total)","keywordScores":{"apple":95,"screen":85,"technology":60},"categories":"Selected Category","commercialConcept":"popular","subjectClarity":"clear","technicalQuality":"good","marketDemand":"evergreen","scoreReason":"...","policyWarning":null}`;
}

export async function fetchGroq(apiKey, prompt, base64Data, mimeType, forceJson = true, promptSettings = {}) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const models = [
    "llama-3.2-90b-vision-preview",
    "llama-3.2-11b-vision-preview",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "qwen/qwen3.6-27b"
  ];

  let processedPrompt = prompt;

  if (!forceJson) {
    const targetModel = promptSettings?.targetModel || 'ChatGPT';
    const mode = promptSettings?.promptSimilarityMode || 'Exact Match';

    // Model-specific formatting instructions
    let modelFormattingRule = "";
    switch (targetModel) {
      case 'ChatGPT':
        modelFormattingRule = `\n\nCRITICAL CHATGPT/DALL-E 3 FORMAT: Write the prompt as a highly descriptive, natural language paragraph. Focus on rich details, sensory descriptions, and cohesive composition. Do not use bullet points or parameters.`;
        break;
      case 'Midjourney':
        modelFormattingRule = `\n\nCRITICAL MIDJOURNEY FORMAT: Write the prompt as a comma-separated list of descriptive keywords and phrases. Start with the main subject, followed by visual medium, stylistic details, lighting, camera settings, and append '--ar 16:9 --style raw --v 6.0' at the end. DO NOT write full conversational sentences.`;
        break;
      case 'Flux':
        modelFormattingRule = `\n\nCRITICAL FLUX FORMAT: Write a highly detailed natural language description, focusing heavily on realistic textures, lighting details, camera lens info, and crisp composition without using generic buzzwords.`;
        break;
      case 'Nano Banana':
        modelFormattingRule = `\n\nCRITICAL NANO BANANA FORMAT: You MUST output the ENTIRE PROMPT as a SINGLE, CONTINUOUS BLOCK OF TEXT. DO NOT use bullet points (- or *). DO NOT use bold headings (e.g., **Subject:**). DO NOT use line breaks or new paragraphs. Just one massively detailed, flowing paragraph.`;
        break;
      case 'Ideogram':
        modelFormattingRule = `\n\nCRITICAL IDEOGRAM FORMAT: Describe text placement precisely if there is typography. Focus on graphic layouts, bold flat illustrations, or photographic rendering with text integration constraints.`;
        break;
      case 'Recraft':
        modelFormattingRule = `\n\nCRITICAL RECRAFT FORMAT: Describe vector icons, modern UI assets, clean line art weight, flat color palette, and minimal asset layouts. Focus on graphic design terminology.`;
        break;
      default:
        modelFormattingRule = `\n\nFormat the prompt as a clean, highly descriptive block of text optimized for image generation.`;
    }

    const dynamicInstruction = `[CRITICAL INSTRUCTION: I am generating an image using ${targetModel}. Please format your final output strictly for ${targetModel}. DO NOT output conversational text, greetings, bullet points, or explanations.]\n\n`;

    if (mode === 'Unique Variation') {
      processedPrompt = dynamicInstruction + `You are a world-class visual prompt engineer. Your job is to look at an image and write a single, detailed text prompt that could be used with ${targetModel} to create a NEW image that is visually distinct but thematically related to the original.

UNIQUE VARIATION MODE GOAL: Retain the core concept (about 40-50% conceptual similarity), but COMPLETELY CHANGE the secondary visual presentation to avoid duplicate stock content flags (e.g. Adobe Stock rejections). The result should feel like a natural alternate take or "sibling" of the original.

CRITICAL CHANGES TO MAKE BASED ON IMAGE TYPE:

IF THE IMAGE IS A PHOTOGRAPH OR FEATURES PEOPLE:
- Subject(s): STRICTLY MAINTAIN the exact demographics, gender, age, and total number of people. ONLY change their clothing colors, minor pose adjustments, and positioning.
- Environment/Setting: Change the background location, time of day, or specific environment while keeping the same general vibe.
- Lighting & Mood: Alter the lighting setup, camera angle, and shot type.

IF THE IMAGE IS AN ICON SET, UI GRAPHIC, OR VECTOR ART:
- Grid & Background: STRICTLY MAINTAIN the exact grid size (e.g., "A 4x8 grid") and original background type (solid color, white, or gradient). Do not hallucinate a gradient if the original is solid.
- Intelligent Icon Variation: Keep 70-80% of the icons exactly the same. For the remaining 20-30%, replace them with different symbols that belong to the EXACT SAME CATEGORY (e.g., swap a 'gear' for a 'wrench').
- Art Style: Analyze the specific vector style (e.g., 3D, isometric, hand-drawn, flat UI, line-art) and STRICTLY MAINTAIN this exact style. Do not force them into realistic scenes.

Analyze the image and describe it using this flowing structure (do not output these labels):
- Main subject: what it is, its general appearance, materials/clothing/shape — adhering to the variation rules above
- Composition: camera angle, shot type, framing — described as a general approach
- Setting/background: type of environment and its general mood
- Lighting: source, direction, quality, color temperature
- Color palette: dominant colors and overall grade
- Art style/medium: photorealistic, 3D render, flat illustration, etc.
- Texture, materials, and overall atmosphere

Rules:
1. Output ONLY the final prompt — no titles, no explanations, no "Here is the prompt," no markdown.
2. Write it as one dense, comma-separated descriptive paragraph, the way real image-generation prompts are written.
3. For large icon grids, DO NOT list every single icon. Only describe 4-5 representative icons (including your swapped variations) to keep the prompt concise.
4. Deliberately leave the exact pose or exact micro-composition slightly open, so the generator has room to produce natural variation — while keeping subject identity, style, palette, and mood clearly anchored.
5. Do not refer to "the image" or "the photo" — write it as a fresh creative instruction.
6. Length: 60–200 words.
7. End with 4-6 comma-separated quality/style tags appropriate to the content.
8. If the image has a transparent background (or checkerboard pattern), DO NOT mention "transparent background". Instead, instruct to generate it "isolated on a solid white background".
9. DO NOT include any real-world company names, brand names, trademarks, or specific logos in the prompt.
10. DO NOT include the word "watermark" or instruct to generate any watermarks.

${modelFormattingRule}

Return only the prompt text and nothing else.`;
    } else {
      processedPrompt = dynamicInstruction + `You are a forensic-level visual prompt engineer. Your only job is to look at an image and reverse-engineer it into ONE extremely detailed, accurate text prompt that could be used with ${targetModel} to recreate this EXACT image as closely as possible. This is EXACT MATCH mode — maximum fidelity to the original always outranks brevity.

ABSOLUTE RULE — DESCRIBE ONLY WHAT YOU SEE:
- Never invent, assume, guess, or add any detail not clearly visible in the image.
- Never add backstory, purpose, meaning, or generic marketing words ("beautiful," "amazing," "stunning," "gorgeous").
- Never add extra objects, people, colors, background elements, textures, or style cues that are not present.
- If a detail is unclear, ambiguous, or cut off at the frame edge, describe only what is confidently visible — never fill the gap with a guess.
- Every single word in your output must correspond to something actually visible. Zero hallucination, zero embellishment — and zero omission of real visible detail.

━━━━━━━━━━━━━━━━━━━━
STEP 1 — SILENTLY IDENTIFY THE MAIN CATEGORY (pick exactly one, do not output this label):
A) Photograph — real-world camera photo
B) Vector / flat graphic — go to STEP 2 for sub-type
C) 3D render — claymation, Pixar-style, low-poly, isometric 3D, glossy toy-like, realistic PBR, etc.
D) Illustration / Painting / Digital art — watercolor, digital painting, anime, cel-shaded, etc.
E) Other — pixel art, sketch, etc.

━━━━━━━━━━━━━━━━━━━━
STEP 2 — IF CATEGORY = VECTOR, SILENTLY IDENTIFY THE EXACT SUB-TYPE FIRST (mandatory, never skip):

SILHOUETTE — tell-tale sign: the entire shape is ONE flat solid color (often black, but any single color) with zero internal linework, zero facial features, zero texture. Reads as a solid cutout/shadow shape.

LINE ART — tell-tale sign: built only from visible strokes/lines with little or no solid fill, showing illustrative detail such as contour lines, cross-hatching, or varying line thickness — sketch/engraving/pen-drawing quality. Can be monochrome or limited-color linework. More artistic and detailed than a simple icon.

OUTLINE / STROKE ICON — tell-tale sign: a simple, minimal icon made of UNIFORM-width strokes forming basic geometric shapes, with little to no internal detail beyond the essential outline — looks like a standard clean UI icon (gear, home, cart, heart, arrow). Difference from Line Art: outline icons are minimal/geometric/functional; Line Art is illustrative/decorative/varied stroke weight.

COLORFUL ABSTRACT VECTOR — tell-tale sign: the subject is built from MULTIPLE flat color blocks/shapes (geometric or organic), moderately-to-highly stylized rather than literal, flat-design aesthetic, may include subtle flat gradients or duotone shading but no realistic lighting. This style has the highest error rate — describe it with extra rigor:
- Count and name every distinct color used
- Describe each major shape/color-block and which part of the subject it represents (e.g., "a rounded orange rectangle forms the body, a smaller tan circle forms the head, thin dark-brown curved shapes form the arms")
- State whether shapes are geometric (circles/triangles/polygons/rounded rectangles) or organic/flowing
- Describe layering/overlap — which shapes sit in front of or behind others
- State how abstracted vs recognizable the subject is (e.g., "simplified but clearly recognizable as a person" vs "highly abstracted, only suggestive of a figure")
- Note any negative space use (background color showing through as part of the design)
- Note any flat gradient/duotone shading inside a shape, only if actually present

After identifying the sub-type, describe the vector through this shared checklist:
- Sub-type + subject: what the object/figure is, how simplified vs literal
- Stroke/line: present or not, weight, corner style (sharp vs rounded)
- Fill: none / flat solid / flat with soft pseudo-shadow-highlight / gradient / duotone — state exactly which
- Color palette: name every distinct color seen
- Outline/border: any white or colored outline separating shapes, only if present
- Composition: single centered object or arrangement, orientation/angle exactly as shown
- Any pattern actually drawn (stripes, dots, shapes) — exact shape, direction, placement
- Background: see BACKGROUND MODULE below

End with sub-type-matched tags only — e.g. Silhouette: "silhouette icon, solid fill, flat vector, isolated on white background"; Line Art: "line art, illustrative linework, fine detail, monochrome"; Outline Icon: "outline icon, stroke icon, minimalist, clean vector, flat UI icon"; Colorful Abstract: "flat design, abstract vector illustration, geometric shapes, modern flat colors." Never mix tags across sub-types.

━━━━━━━━━━━━━━━━━━━━
IF CATEGORY = 3D RENDER:
- Render style: claymation/clay, Pixar/Disney-style, low-poly, glossy toy-like, isometric 3D icon, realistic PBR — name the closest match
- Subject: exact object/character, shape, proportions — if a human/humanoid character appears, use the HUMAN SUBJECTS MODULE below for pose/clothing/gaze, adapted to the render's material language (e.g. "clay-textured skin" instead of "skin")
- Material per visible element: matte clay, glossy plastic, metallic, glass, fabric weave, rubber — describe each surface honestly, never assume an invisible material
- Surface finish: smooth rounded edges, subtle sculpted texture, reflective highlights, specular points — only if visible
- Lighting: direction, soft vs hard shadow, studio-light look, rim light, ambient occlusion in creases
- Shadow: soft drop shadow / ambient occlusion / none
- Color palette: exact color per part
- Camera/perspective: front-facing / three-quarter / top-down isometric, flat vs slight depth
- Background: see BACKGROUND MODULE below
- Any fine surface detail actually visible (seams, ridges, sculpted lines)

End with 3D-appropriate tags only, e.g. "3D render, claymation style, soft studio lighting, smooth shading, high detail."

━━━━━━━━━━━━━━━━━━━━
IF CATEGORY = PHOTOGRAPH:
- Main subject: what/who is in the photo — if it includes one or more people, use the HUMAN SUBJECTS MODULE below in full; if non-human, describe exact appearance, material, shape, distinguishing features here
- Composition: camera angle, shot type (close-up/medium/wide), framing
- Lighting: source, direction, quality, color temperature, time of day, shadow behavior
- Color palette & grade: dominant colors, saturation, mood
- Camera/lens cues genuinely implied: focal length feel, depth of field, bokeh, motion blur — only if actually visible
- Texture: fabric, surfaces, materials
- Fine details: patterns, text, logos, jewelry, reflections
- Background: see BACKGROUND MODULE below

End with photography-appropriate tags only, e.g. "photorealistic, sharp focus, 8k, natural lighting."

━━━━━━━━━━━━━━━━━━━━
IF CATEGORY = ILLUSTRATION / PAINTING / DIGITAL ART:
- Medium: watercolor, oil painting, digital painting, ink, anime/cel-shaded, flat illustration
- Subject — if it includes one or more people, use the HUMAN SUBJECTS MODULE below in full
- Line quality and brushwork: visible strokes, texture, edge softness/hardness
- Color palette and shading style: flat color, cel-shaded, painterly blending, cross-hatching
- Background: see BACKGROUND MODULE below
- Fine details actually present

End with style-matched tags only, tied to the actual medium.

━━━━━━━━━━━━━━━━━━━━
UNIVERSAL MODULE — BACKGROUND (apply to any category above, whenever relevant):

First check: is the background plain/isolated (solid white, solid color, transparent, simple studio gradient) or an actual scene/pattern?

If PLAIN/ISOLATED: simply state "isolated on [exact color] background" or "transparent background" — invent nothing further.

If an ACTUAL SCENE is visible, describe it with the same rigor as the main subject:
- Setting/location type: exactly what kind of place (e.g. "indoor office with gray cubicle walls," "outdoor city street at dusk," "gradient studio backdrop, light blue fading to white")
- Key background objects/elements and their position (left/right/center, near/far, foreground/midground/background)
- Depth & focus: sharp and detailed, or genuinely soft/blurred — only state blur if visible
- Background color(s) and their relation to the subject (contrast/harmony)
- Background lighting vs subject lighting
- Any visible text, signage, logos, screens, or patterns in the background — describe/transcribe exactly if legible, never guess illegible text
- If other people appear in the background, use the HUMAN SUBJECTS MODULE below for them too

━━━━━━━━━━━━━━━━━━━━
UNIVERSAL MODULE — HUMAN SUBJECTS (apply to any category, whenever one or more people are visible — critical for Exact Match fidelity):

For EACH person, in order from most prominent/foreground to background, cover all of the following before moving to the next person:
1. Position in frame: left/center/right, foreground/midground/background, relative to other people/objects
2. Pose & body orientation: standing/sitting/walking/other; which way the torso and shoulders face (toward camera, side profile, back turned, three-quarter view)
3. Head & eye direction (never skip this): which way the head is turned, and precisely where the eyes are looking — directly at camera / at another specific person / at an object / off to the side / downward / upward / closed
4. Facial expression: only the emotion clearly visible (smiling, neutral, serious, laughing, surprised)
5. Hair: color, length, style
6. Clothing: list EVERY visible clothing item with its exact color and type (e.g. "red short-sleeve t-shirt, dark blue denim jeans, white sneakers, black cap") — never skip a visible layer
7. Arms & hands: exact position per visible arm (e.g. "right arm raised overhead," "both hands in pockets," "left hand holding a phone," "arms crossed," "hand resting on another person's shoulder")
8. Legs & feet: exact stance (e.g. "feet shoulder-width apart," "right leg stepped forward," "seated with legs crossed")
9. Accessories: glasses, hats, jewelry, bags, watches — only if clearly visible
10. Skin tone and approximate age impression: state factually and only if clearly visible (e.g. "child," "elderly man," "light skin tone") — for recreation accuracy only

WHEN MULTIPLE PEOPLE ARE PRESENT (highest-priority failure point — apply extra care):
- Identify each person by position ("the person on the left," "the middle person," "the person in the background on the right") and fully complete the 10-point structure above for each one before moving to the next
- State the spatial relationship explicitly: who stands next to whom, who is in front of/behind/overlapping whom, relative height/size differences, spacing between them
- Describe interaction: facing each other, facing the same direction, touching/arms around each other, or independent
- For a crowd or indistinct background people: describe as a group with shared traits (e.g. "a loosely blurred group of five or six people in muted casual clothing in the background") rather than individually — but still capture approximate number, density, color impression, and general activity

Do not skip any visible person, including partially visible or background ones — every person contributes to Exact Match accuracy.

━━━━━━━━━━━━━━━━━━━━
OUTPUT RULES:
1. Output ONLY the final prompt — no category labels, no section headers, no explanation, no "Here is the prompt," no markdown.
2. Merge everything — subject, style, background, and every person's details — into ONE dense, comma-separated descriptive paragraph, exactly the way real image-generation prompts are written. The structure above is for your internal analysis only; never output it as labeled sections.
3. Every descriptive word must map to something actually visible. Zero invention, zero embellishment, zero unrequested extra detail, and zero omission of real visible detail — this is the single most important rule.
4. Do not refer to "the image" or "the photo" — write it as a direct creative instruction to generate the scene.
5. Length: adapt to real complexity. A simple isolated icon may need only 40-100 words. A scene with a background needs more. A scene with multiple people needs enough length to fully cover every person (position, pose, clothing, hands, legs, eyes) plus the background — this can reasonably reach 150-300+ words. Never pad with invented detail to hit a length, and never cut real detail short to save length.
6. End with 4-6 comma-separated quality/style tags appropriate to the content (e.g., "highly detailed, sharp focus, 8k, cinematic lighting" for photos; "trending on artstation, digital painting, intricate details" for illustrations).
7. If the image has a transparent background (or checkerboard pattern), DO NOT mention "transparent background". Instead, instruct to generate it "isolated on a solid white background".
8. DO NOT include any real-world company names, brand names, trademarks, or specific logos in the prompt.
9. DO NOT include the word "watermark" or instruct to generate any watermarks.

${modelFormattingRule}

Return only the prompt text and nothing else.`;
    }
  }

  return fetchOpenAICompatible("groq", endpoint, models, apiKey, processedPrompt, base64Data, mimeType, forceJson, promptSettings);
}
