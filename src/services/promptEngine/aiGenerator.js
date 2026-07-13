import { GoogleGenerativeAI } from "@google/generative-ai";
import { mainCategories, categories, styles, lighting, cameraAngles } from './dataset';

const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Text-only AI prompt generator connecting directly to configured AI models.
 * Resolves "auto" settings client-side to ensure diversity, then routes parameter guidelines.
 */
export async function generateAIPrompts({ config, apiKeys, apiProvider }) {
  const {
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
    aspectRatio = '16:9'
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

    // 2. Resolve Style, Lighting, Camera
    const isGraphic = mediaType === 'vector' || mediaType === 'illustration';
    const pStyle = styleChoice === 'auto' ? shuffledStyles[i % shuffledStyles.length] : styleChoice;
    
    let pLighting = lightingChoice;
    if (lightingChoice === 'auto') {
      pLighting = isGraphic ? "Flat solid colors (No dynamic lighting)" : shuffledLightings[i % shuffledLightings.length];
    }
    
    let pCamera = cameraAngleChoice;
    if (cameraAngleChoice === 'auto') {
      pCamera = isGraphic ? "2D Flat view (No perspective)" : shuffledCameras[i % shuffledCameras.length];
    }

    promptSpecs.push({
      category: resolvedCategory,
      style: pStyle,
      lighting: pLighting,
      camera: pCamera
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

  let mediaTypeLabel = mediaType;
  if (mediaType === 'vector') mediaTypeLabel = 'Vector Graphics';
  else if (mediaType === 'illustration') mediaTypeLabel = 'Digital Illustration';
  else if (mediaType === '3d') mediaTypeLabel = '3D Render';
  else if (mediaType === 'photo') mediaTypeLabel = 'Stock Photo';
  else if (mediaType === 'video') mediaTypeLabel = 'Stock Video';
  else if (mediaType === 'isolated_white') mediaTypeLabel = 'Isolated on a pure white seamless background';

  // Build specifications list for user prompt
  const specsListText = promptSpecs.map((spec, index) => {
    return `Prompt ${index + 1}:
- Category/Subject: ${spec.category}
- Media Type: ${mediaTypeLabel}
- Style: ${spec.style}
- Lighting: ${spec.lighting}
- Camera Perspective: ${spec.camera}
- Prompt Length: ${promptLength}
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
5. ICONS BACKGROUND: If the Category involves "Icons", you MUST explicitly describe the background as pure white and non-transparent (e.g. "isolated on a pristine pure white background, completely opaque"). NEVER describe a transparent background.
6. ICONS SPECIFICITY: If the Category involves "Icons", the prompt MUST explicitly describe "a set of minimalist icons", "a collection of UI icons", or "flat design graphic icons" arranged in a grid or isolated layout. Do NOT describe a general illustration, a dashboard, or a complex scene.
7. UNIVERSAL VECTOR ENFORCEMENT: If the Media Type is "Vector Graphics", you MUST format the subject as a pure vector (e.g. "A flat vector illustration of..."). You MUST explicitly forbid 3D elements. Describe it as "strictly 2D flat art, zero 3D elements, no isometric, solid fills only".
8. MIXED VECTOR CHARACTERS: If generating "Vector Graphics" for human categories (e.g., "People", "Business", "Healthcare"), alternate your character styles across the batch. Describe some as "faceless minimalist corporate characters" and others as "expressive characters with detailed facial features". Both styles MUST remain 100% flat 2D vectors.
9. DIGITAL ILLUSTRATION ROUTING: If Media Type is "Digital Illustration", you MUST match the art style to the category:
   - For Technology, Architecture, Environment: Use "cyberpunk, glowing neon, digital network nodes, glassmorphism".
   - For Nature, Food, Animals, Beauty: Use "delicate watercolor, floral aesthetic, soft pastel, clean digital painting".
   - For People, Lifestyle, Healthcare, Sports: Use "expressive digital painting, minimalist line art, clean boho aesthetic".
   - For Business, Finance: Use "claymorphism, clean abstract gradients, holographic textures".
   Ensure the artwork is described as polished and flawless. NEVER use messy abstract styles for humans, and NEVER use photographic terms.
10. 3D RENDERS: If the Media Type is "3D Render", the prompt MUST explicitly describe a high-end 3D rendering. Use terms like "Cinema 4D", "stunning 3D graphics", "Octane Render", and "soft studio lighting". CRITICAL: For human subjects, you MUST use stylized 3D terms like "stylized 3D character design", "3D claymorphism", "Pixar style 3D animation", or "smooth plastic textures" to ensure they look like 3D models and not photographs. DO NOT use 2D vector or flat illustration terms.

Ensure each prompt is creative, visually rich, and highly distinct from the others in the batch.`;

  // Select active provider
  const provider = Array.isArray(apiProvider) ? apiProvider[0] : apiProvider;

  // Filter keys for this provider
  const providerKeys = apiKeys.filter(k => k.provider === provider);
  if (providerKeys.length === 0) {
    throw new Error(`No API key configured for "${provider}". Please add one under API Keys in the top-left.`);
  }

  // Use the first configured key
  const apiKey = providerKeys[0].key;

  // Handle Gemini
  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelsToAttempt = ["gemini-2.5-flash", "gemini-1.5-flash"];
    let lastError = null;

    for (const modelName of modelsToAttempt) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
        });
        const responseText = result.response.text();
        return parseResponse(responseText);
      } catch (err) {
        lastError = err;
        console.warn(`[Gemini Fallback] Failed for model ${modelName}: ${err.message}`);
      }
    }
    throw lastError || new Error(`Failed to connect to Gemini: ${lastError.message}`);
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
