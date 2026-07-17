import { GoogleGenerativeAI } from "@google/generative-ai";
import { mainCategories, categories, styles, lighting, cameraAngles } from './dataset';

const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Text-only AI prompt generator connecting directly to configured AI models.
 * Resolves "auto" settings client-side to ensure diversity, then routes parameter guidelines.
 */
export async function generateAIPrompts({ config, apiKeys, apiProvider }) {
  let {
    categoryName = 'auto',
    mainCategory = 'auto',
    mediaType = 'photo',
    promptLength = 'detailed',
    styleChoice = 'auto',
    lightingChoice = 'auto',
    cameraAngleChoice = 'auto',
    customInstruction = '',
    count = 6,
    targetModel = 'default',
    aspectRatio = '16:9',
    iconLayout = 'set',
    iconStyle = 'colorful'
  } = config;


  // Pre-shuffle styles, lightings, camera angles for deterministic diversity in the batch
  const shuffledStyles = [...styles].sort(() => 0.5 - Math.random());
  const shuffledLightings = [...lighting].sort(() => 0.5 - Math.random());
  const shuffledCameras = [...cameraAngles].sort(() => 0.5 - Math.random());

  // Generate resolved specifications for each prompt in the batch
  const promptSpecs = [];
  for (let i = 0; i < count; i++) {
    // 1. Resolve Category
    let currentMain = mainCategory;
    let currentSub = categoryName;

    if (!currentMain || currentMain === 'auto') {
      const mainKeys = Object.keys(mainCategories);
      currentMain = mainKeys[Math.floor(Math.random() * mainKeys.length)];
    }

    if (!currentSub || currentSub === 'auto') {
      const subs = mainCategories[currentMain] || [];
      if (subs.length > 0) {
        currentSub = subs[Math.floor(Math.random() * subs.length)];
      } else {
        // fallback
        currentSub = "Miscellaneous"; 
      }
    }
    
    // Combine main and sub for better AI context (e.g. "Graphic Elements > Shapes")
    const resolvedCategory = `${currentMain} > ${currentSub}`;

    // Resolve Media Type based on currentMain
    let currentMediaType = mediaType;
    if (currentMain === 'Icons' && (currentMediaType === 'photo' || currentMediaType === 'video')) {
      currentMediaType = 'vector';
    }

    // 2. Resolve Style, Lighting, Camera
    const isFlatGraphic = currentMediaType === 'vector' || currentMediaType === 'illustration';
    const pStyle = styleChoice === 'auto' ? shuffledStyles[i % shuffledStyles.length] : styleChoice;
    
    let pLighting = lightingChoice;
    if (lightingChoice === 'auto') {
      pLighting = isFlatGraphic ? "Flat solid colors (No dynamic lighting)" : shuffledLightings[i % shuffledLightings.length];
    }
    
    let pCamera = cameraAngleChoice;
    if (cameraAngleChoice === 'auto') {
      pCamera = isFlatGraphic ? "2D Flat view (No perspective)" : shuffledCameras[i % shuffledCameras.length];
    }

    let aiSpecificSubject = null;
    if (resolvedCategory === '3D Icons' || currentMain === 'Icons') {
      const materials = ['', 'glossy', 'matte', 'metallic', 'glass', 'neon', 'pastel', 'vibrant', 'minimalist', 'cute', 'futuristic', 'retro', 'elegant', 'holographic', 'translucent', 'frosted glass', 'clay', 'plastic'];
      const colors = ['', 'red', 'blue', 'green', 'gold', 'silver', 'white', 'black', 'purple', 'orange', 'cyan', 'magenta', 'yellow', 'pink', 'teal'];
      
      const randomMaterial = materials[Math.floor(Math.random() * materials.length)];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const prefix = [randomMaterial, randomColor].filter(Boolean).join(' ');

      if (iconLayout === 'single') {
        aiSpecificSubject = `a unique, non-generic creative subject of your choice (material: ${prefix || 'any premium material'}, style: ${iconStyle === 'monochrome' ? 'monochrome line art' : 'colorful'})`;
      } else {
        const themes = [
          'social media', 'e-commerce', 'office and business', 'weather forecast', 'music player', 
          'gaming', 'finance and banking', 'medical and healthcare', 'education', 'travel and tourism', 
          'food and restaurant', 'fitness and gym', 'data analytics', 'cryptocurrency', 'cloud computing', 
          'cyber security', 'smart home', 'photography', 'messaging and chat', 'map and navigation',
          'file management', 'video editing', 'user settings', 'online shopping', 'logistics and delivery',
          'space and astronomy', 'gardening and plants', 'cooking and kitchen', 'automotive and cars', 'music and instruments'
        ];
        const gridSizes = [
          'a set of 4', 'a set of 6', 'a set of 9', 'a set of 12', 'a set of 16',
          'a 2x2 grid of', 'a 3x2 grid of', 'a 3x3 grid of', 'a 4x3 grid of', 'a 4x4 grid of',
          'a collection of 5', 'a collection of 8', 'a pack of 10'
        ];
        const randomTheme = themes[Math.floor(Math.random() * themes.length)];
        const randomGrid = gridSizes[Math.floor(Math.random() * gridSizes.length)];
        aiSpecificSubject = prefix ? `${randomGrid} matching ${currentMediaType === '3d' ? '3D' : 'flat'} ${prefix} ${randomTheme} UI icons` : `${randomGrid} matching ${currentMediaType === '3d' ? '3D' : 'flat'} ${randomTheme} UI icons`;
      }
    }

    promptSpecs.push({
      category: resolvedCategory,
      mainCategory: currentMain,
      mediaType: currentMediaType,
      style: pStyle,
      lighting: pLighting,
      camera: pCamera,
      aiSpecificSubject
    });
  }

  // Build the system instructions telling the AI how to format prompts based on the targetModel and aspectRatio
  let modelFormattingRule = "";
  if (targetModel === 'midjourney') {
    modelFormattingRule = `CRITICAL FORMAT: Generate Midjourney v6.0 prompts.
For Midjourney, the format must be a visually descriptive, comma-separated tag list.
You MUST append the aspect ratio and version parameter exactly as: " --ar ${aspectRatio} --v 6.0" to the end of EVERY generated prompt. Do NOT use backticks, quotes, or nested templates inside the string.`;
  } else if (targetModel === 'dalle3') {
    modelFormattingRule = `CRITICAL FORMAT: Generate DALL-E 3 prompts.
For DALL-E 3, prompts must be written as a single detailed, rich natural language paragraph describing a cohesive scene. Do NOT append aspect ratios or parameters (like --ar or --v).`;
  } else if (targetModel === 'flux') {
    modelFormattingRule = `CRITICAL FORMAT: Generate Flux prompts.
Optimized for the Flux model, focusing on sharp focus, intricate visual details, textured surfaces, and clear composition. Do not use parameters.`;
  } else if (targetModel === 'ideogram') {
    modelFormattingRule = `CRITICAL FORMAT: Generate Ideogram prompts.
Optimized for the Ideogram model, focusing on visual layouts, clarity, lighting, and camera perspectives.`;
  } else if (targetModel === 'recraft') {
    modelFormattingRule = `CRITICAL FORMAT: Generate Recraft prompts.
Optimized for the Recraft model, incorporating detailed styles, lighting, and camera angles.`;
  } else {
    modelFormattingRule = `CRITICAL FORMAT: Generate general image-generation prompts. Focus on detailed creative descriptions.`;
  }

  const systemPrompt = `You are an elite, top-tier stock media prompt engineer. Your sole purpose is to design highly commercial, premium image prompts that will sell on platforms like Adobe Stock, Shutterstock, and Getty Images.
  
CRITICAL GUIDELINES FOR HIGH COMMERCIAL VALUE:
1. Subject & Scene: Focus on high-demand stock themes (e.g., modern corporate teamwork, authentic diverse lifestyle, cutting-edge technology, sustainable environment, premium food, luxury architecture). Avoid obscure, bizarre, or non-commercial subjects unless explicitly requested.
2. Authenticity & Emotion: Describe authentic expressions, natural interactions, and relatable emotions. The scene should tell a micro-story that a brand or business would want to use in advertising.
3. High-End Production: For photos and videos, describe cinematic lighting, professional camera angles, and shallow depth of field. For vectors and illustrations, describe flawless curves, precise digital geometry, and flat 2D elements without shadows. The image must feel like a high-budget commercial photoshoot or top-tier digital art.
4. Detail & Specificity: Provide extremely vivid and descriptive details (clothing, environment, lighting, colors, textures). The more specific and detailed the prompt, the better the resulting image.

Your task is to generate exactly ${count} unique prompts matching the specified configuration for the "${targetModel}" generator.
Return ONLY a valid JSON array of strings:
[
  "First generated prompt...",
  "Second generated prompt...",
  ...
]
Do NOT write category labels, section headers, quotes, backticks, or explanation. Just return the raw JSON array.`;

  // Build specifications list for user prompt
  const specsListText = promptSpecs.map((spec, index) => {
    let specMediaTypeLabel = spec.mediaType;
    if (spec.mediaType === 'vector') specMediaTypeLabel = 'Vector Graphics';
    else if (spec.mediaType === 'illustration') specMediaTypeLabel = 'Digital Illustration';
    else if (spec.mediaType === '3d') specMediaTypeLabel = '3D Render';
    else if (spec.mediaType === 'photo') specMediaTypeLabel = 'Stock Photo';
    else if (spec.mediaType === 'video') specMediaTypeLabel = 'Stock Video';
    else if (spec.mediaType === 'isolated_white') specMediaTypeLabel = 'Isolated on a pure white seamless background';

    return `Prompt ${index + 1}:
- Category/Subject: ${spec.aiSpecificSubject ? `STRICTLY EXACTLY: ${spec.aiSpecificSubject}` : spec.category}
- Media Type: ${specMediaTypeLabel}
- Style: ${spec.style}
- Lighting: ${spec.lighting}
- Camera Perspective: ${spec.camera}
- Prompt Length: ${promptLength}
${(spec.mainCategory === 'Icons' || spec.categoryName === '3D Icons') ? `- Icon Layout: ${iconLayout === 'single' ? 'Single isolated icon' : 'Icon Set / Grid layout'}` : ''}
${spec.mainCategory === 'Icons' ? `- Icon Style: ${iconStyle === 'monochrome' ? 'Monochrome / Minimalist Line Art (Black and White)' : 'Colorful Flat Design'}` : ''}
${spec.aiSpecificSubject ? `- CRITICAL INSTRUCTION: You are FORBIDDEN from generating generic icons (like heart, gear, message, search). You MUST ONLY generate exactly: "${spec.aiSpecificSubject}"` : ''}
${customInstruction ? `- Custom Instructions: ${customInstruction}` : ''}`;
  }).join('\n\n');

  const userPrompt = `Generate exactly ${count} unique prompts according to these specifications for each item:

${specsListText}

${modelFormattingRule}

CRITICAL RULES:
1. COMMERCIAL VIABILITY: Every prompt MUST describe a highly premium, commercially viable scene. Ensure subjects, compositions, and lighting are top-tier and highly desirable for stock photography/vector buyers.
2. GRAMMAR DIVERSITY: Vary the sentence structures and starting words! Do NOT start all prompts with "A" or "An". For example, start one prompt with the subject, another with the environment, another with the camera angle, etc.
3. LENGTH: If the requested length is "detailed", write a rich, long description (40-70 words). If "short", write 1-2 concise sentences.
4. MEDIA ACCURACY: If the Media Type is "Vector Graphics" or "Digital Illustration", DO NOT use photographic terms like "shot on 35mm lens", "drone photography", "shallow depth of field", or "camera setup". Describe it strictly as a piece of graphic art (e.g., flat design, scalable curves, clean lines, or digital painting). If the Media Type is "3D Render", use premium 3D terminology like "Octane Render", "Unreal Engine 5", "volumetric lighting", and "ray tracing".
5. ICONS BACKGROUND: If the Category involves "Icons" or is "3D Icons", you MUST explicitly describe the background as pure white and non-transparent (e.g. "isolated on a pristine pure white background, completely opaque"). NEVER describe a transparent background.
6. ICONS SPECIFICITY: If the Category involves "Icons" or is "3D Icons", strictly follow the requested Icon Layout and Icon Style from the specifications. If layout is "Single isolated icon", you MUST describe exactly ONE singular focal icon, even if the Category name is plural (e.g., "3D Icons" -> "A single 3D icon"). DO NOT generate a set or grid. If layout is "Icon Set", describe a grid or collection of icons. If style is "Monochrome", you MUST use black and white line-art and clean strokes. DO NOT describe a general illustration, a dashboard, or a complex scene.
7. NO MARKDOWN: Output absolutely NO markdown formatting (do NOT use **bold**, *italics*, or bullet points). The generated prompts must be plain text only.
8. UNIVERSAL VECTOR ENFORCEMENT: If the Media Type is "Vector Graphics", you MUST format the subject as a pure vector (e.g. "A flat vector illustration of..."). You MUST explicitly forbid 3D elements. Describe it as "strictly 2D flat art, zero 3D elements, no isometric, solid fills only".
8. MIXED VECTOR CHARACTERS: If generating "Vector Graphics" for human categories (e.g., "People", "Business", "Healthcare"), alternate your character styles across the batch. Describe some as "faceless minimalist corporate characters" and others as "expressive characters with detailed facial features". Both styles MUST remain 100% flat 2D vectors.
9. DIGITAL ILLUSTRATION ROUTING: If Media Type is "Digital Illustration", you MUST match the art style to the category:
   - For Technology, Architecture, Environment: Use "cyberpunk, glowing neon, digital network nodes, glassmorphism".
   - For Nature, Food, Animals, Beauty: Use "delicate watercolor, floral aesthetic, soft pastel, clean digital painting".
   - For People, Lifestyle, Healthcare, Sports: Use "expressive digital painting, minimalist line art, clean boho aesthetic".
   - For Business, Finance: Use "claymorphism, clean abstract gradients, holographic textures".
   Ensure the artwork is described as polished and flawless. NEVER use messy abstract styles for humans, and NEVER use photographic terms.
10. 3D RENDERS: If the Media Type is "3D Render", the prompt MUST explicitly describe a high-end 3D rendering. Use terms like "Cinema 4D", "stunning 3D graphics", "Octane Render", and "soft studio lighting". CRITICAL: For human subjects, you MUST use stylized 3D terms like "stylized 3D character design", "3D claymorphism", "Pixar style 3D animation", or "smooth plastic textures" to ensure they look like 3D models and not photographs. DO NOT use 2D vector or flat illustration terms.
11. 3D ICONS SIMPLICITY & UNIQUENESS: If the Category is "3D Icons", you MUST describe a simple, clean, and literal UI/UX icon. DO NOT generate overly complex abstract objects, sci-fi spheres, or complicated scenes.
    - STYLING: You MUST use terms like "3D UI icon", "claymorphism", "smooth soft plastic materials", "front-facing or isometric view", "clean minimalist design", and "UI/UX asset".
    - FORBIDDEN TERMS: NEVER use terms like "macro photography", "hyper-realistic", "cinematic", "depth of field", "photorealistic", or "detailed textures". The prompt MUST describe a stylized digital 3D icon, not a real-life object.
    - FORBIDDEN SUBJECTS: You are STRICTLY FORBIDDEN from generating generic, overused icons (specifically: heart, gear, folder, envelope, chat bubble, magnifying glass/search, shopping cart, shopping bag, home, user/profile, lock, star, checkmark).
    - MANDATORY SUBJECT DIVERSITY: If a specific subject is requested in the "Category/Subject" specifications, you MUST strictly follow it. If the specification requests "a unique, non-generic creative subject of your choice", you MUST invent a highly unique, premium, and commercially viable icon concept. Do NOT duplicate concepts across the batch. Choose from diverse topics like:
      * Food & Kitchen: pizza slice, hamburger, slice of watermelon, avocado, coffee mug, chef hat, cupcake, donut.
      * Tech & Hobby: retro camera, gaming controller, headphones, telescope, microscope, chess piece, paint palette, vintage typewriter.
      * Travel & Nature: hot air balloon, space rocket, potted cactus, compass, anchor, lighthouse, rainbow, crescent moon.
      * Business & Tools: megaphone, credit card, piggy bank, target, hourglass, lightbulb, gold coin, trophy.
    - If layout is "Icon Set", ensure the multiple icons within the set match the exact theme requested in the constraint.

Ensure each prompt is creative, visually rich, and highly distinct from the others in the batch.`;

  // Select active provider
  const provider = Array.isArray(apiProvider) ? apiProvider[0] : apiProvider;

  // Filter keys for this provider
  const providerKeys = apiKeys.filter(k => k.provider === provider);
  if (providerKeys.length === 0) {
    throw new Error(`No API key configured for "${provider}". Please add one under API Keys in the top-left.`);
  }

  let lastErrors = [];

  // Try each API key for this provider
  for (let keyIndex = 0; keyIndex < providerKeys.length; keyIndex++) {
    const apiKey = providerKeys[keyIndex].key;
    
    // Handle Gemini
    if (provider === 'gemini') {
      const genAI = new GoogleGenerativeAI(apiKey);
      const modelsToAttempt = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-1.5-flash-latest", "gemini-1.0-pro"];
      let errors = [];

      for (const modelName of modelsToAttempt) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
          });
          const responseText = result.response.text();
          return parseResponse(responseText);
        } catch (err) {
          errors.push(`${modelName}: ${err.message}`);
          console.warn(`[Gemini Fallback] Failed for model ${modelName} using key index ${keyIndex}: ${err.message}`);
        }
      }
      
      // If we got here, this specific key failed for all models
      lastErrors.push(`Key Index ${keyIndex}: ${errors.join(', ')}`);
      continue; // Try next key
    }

    // Handle OpenAI / Groq / Mistral / OpenRouter
    let endpoint = "";
    let modelName = "";

    if (provider === 'openai') {
      endpoint = "https://api.openai.com/v1/chat/completions";
      modelName = "gpt-4o-mini";
    } else if (provider === 'groq') {
      endpoint = "https://api.groq.com/openai/v1/chat/completions";
      modelName = "llama-3.3-70b-versatile";
    } else if (provider === 'mistral') {
      endpoint = "https://api.mistral.ai/v1/chat/completions";
      modelName = "pixtral-12b-2409";
    } else if (provider === 'openrouter') {
      endpoint = "https://openrouter.ai/api/v1/chat/completions";
      modelName = "google/gemini-2.5-flash";
    }

    const payload = {
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    };

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
        const errorText = await response.text();
        throw new Error(`API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      return parseResponse(content);
    } catch (err) {
      lastErrors.push(`Key Index ${keyIndex}: ${err.message}`);
      console.warn(`[${provider} Fallback] Failed using key index ${keyIndex}: ${err.message}`);
    }
  }

  // If we reach here, all configured keys failed
  const errorString = lastErrors.join('\n');
  if (errorString.includes('429') || errorString.toLowerCase().includes('quota') || errorString.includes('Limit')) {
    throw new Error('Google Gemini API Quota Exceeded! You are generating too fast.\n\nPlease wait about 1 minute and try again, or use a different API key.');
  }

  throw new Error(`All available API keys for "${provider}" failed. Details:\n${errorString}`);
}

/**
 * Safely parse AI response into array of strings
 */
function parseResponse(raw) {
  if (!raw) throw new Error("Empty response from AI.");
  let cleaned = raw.trim();

  // Strip markdown code block wrapping
  cleaned = cleaned.replace(/```json/g, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object') {
      const key = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      if (key) return parsed[key];
    }
  } catch (e) {
    // Fallback: parse line by line
    const lines = cleaned.split('\n');
    const prompts = [];
    for (const line of lines) {
      const cleanLine = line.replace(/^\s*\d+\.\s*/, "").replace(/^["']|["']$/g, "").trim();
      if (cleanLine.length > 5) {
        prompts.push(cleanLine);
      }
    }
    if (prompts.length > 0) return prompts;
    throw new Error(`Failed to parse AI response: ${raw}`);
  }
}
