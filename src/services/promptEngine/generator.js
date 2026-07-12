import { 
  mainCategories,
  categories, 
  styles, 
  lighting, 
  cameraAngles, 
  globalModifiers, 
  safetyModifiers 
} from './dataset';

/**
 * Helper to pick a random item from an array
 */
const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Shuffle an array and return a subset of it
 */
const getMultipleRandom = (arr, num) => {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, num);
};

/**
 * Clean up the custom instruction text to safely append it.
 */
const formatCustomInstruction = (text) => {
  if (!text || text.trim() === '') return '';
  let cleaned = text.trim();
  if (!cleaned.startsWith(',')) {
    cleaned = ', ' + cleaned;
  }
  return cleaned;
};

/**
 * Advanced grammar cleanup to prevent robotic text
 */
const cleanPrompt = (text) => {
  let cleaned = text;
  // Fix "a educator" -> "an educator"
  cleaned = cleaned.replace(/\b([aA])\s+([aeiouAEIOU])/g, '$1n $2');
  // Fix repeated prepositions
  cleaned = cleaned.replace(/\bwithin\s+in\b/gi, 'within');
  cleaned = cleaned.replace(/\bin\s+in\b/gi, 'in');
  cleaned = cleaned.replace(/\bwith\s+with\b/gi, 'with');
  // Fix spacing and punctuation
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\s+,/g, ',');
  cleaned = cleaned.replace(/,{2,}/g, ',');
  cleaned = cleaned.replace(/,\s*\./g, '.');
  cleaned = cleaned.trim();
  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
};

/**
 * Generate a single prompt based on selected parameters
 */
const generateSinglePrompt = (categoryName, mediaType, promptLength, styleChoice, lightingChoice, cameraChoice, customInstruction, mainCategory, targetModel = 'default', aspectRatio = '16:9', promptIndex = 0) => {
  let resolvedCategory = categoryName;
  
  if (!resolvedCategory || resolvedCategory === 'auto') {
    let resolvedMain = mainCategory;
    if (!resolvedMain || resolvedMain === 'auto') {
      const mainKeys = Object.keys(mainCategories);
      resolvedMain = mainKeys[Math.floor(Math.random() * mainKeys.length)];
    }
    const subs = mainCategories[resolvedMain] || [];
    if (subs.length > 0) {
      resolvedCategory = subs[Math.floor(Math.random() * subs.length)];
    } else {
      resolvedCategory = Object.keys(categories)[0];
    }
  }

  const categoryData = categories[resolvedCategory] || categories[Object.keys(categories)[0]];
  
  // Resolve Auto or explicit choices
  const pStyle = styleChoice === 'auto' ? getRandom(styles) : styleChoice;
  const pLighting = lightingChoice === 'auto' ? getRandom(lighting) : lightingChoice;
  const pCamera = cameraChoice === 'auto' ? getRandom(cameraAngles) : cameraChoice;
  
  // Get category specific elements
  const subject = getRandom(categoryData.subjects);
  const environment = getRandom(categoryData.environments);
  const action = getRandom(categoryData.actions);
  
  // Get modifiers
  const selectedModifiers = getMultipleRandom(globalModifiers, promptLength === 'detailed' ? 3 : 1).join(', ');
  const safety = getRandom(safetyModifiers);
  const custom = formatCustomInstruction(customInstruction);

  let rawPrompt = '';
  const selectOpening = (openings, index) => openings[index % openings.length];

  if (targetModel === 'midjourney') {
    const base = `${subject}, ${action}, ${environment}`;
    const keywords = `${pLighting}, ${pCamera}, ${selectedModifiers}, ${safety}${custom}`;
    if (mediaType === 'isolated_white') {
      const openings = [
        `${pStyle} ${subject}, ${action}, isolated on pure white seamless background`,
        `${subject}, ${action}, isolated on pure white seamless background, ${pStyle} style`,
        `Isolated on pure white seamless background: ${pStyle} ${subject}, ${action}`,
        `${subject}, ${action}, ${pStyle} design, isolated on white`,
      ];
      rawPrompt = `${selectOpening(openings, promptIndex)}, ${keywords} --v 6.0 --ar ${aspectRatio}`;
    } else {
      const mjOpenings = [
        `${pStyle} ${mediaType} of ${subject}, ${action}, ${environment}`,
        `${subject}, ${action}, ${pStyle} ${mediaType}, ${environment}`,
        `${environment}, ${pStyle} ${mediaType} of ${subject}, ${action}`,
        `A ${pStyle} ${mediaType} capturing ${subject} ${action}, ${environment}`,
      ];
      rawPrompt = `${selectOpening(mjOpenings, promptIndex)}, ${keywords}`;
      if (mediaType === 'photo') rawPrompt += ` --v 6.0 --style raw --ar ${aspectRatio}`;
      else rawPrompt += ` --v 6.0 --ar ${aspectRatio}`;
    }
  } 
  else if (targetModel === 'dalle3') {
    const typeText = mediaType === 'isolated_white' ? 'cutout on a pure white background' : mediaType;
    const tail = `The scene is illuminated by ${pLighting} with ${pCamera}, emphasizing ${selectedModifiers}. ${safety}${custom}.`;
    const openings = [
      `A ${pStyle} ${typeText} of ${subject} ${action}, ${environment}.`,
      `${subject} ${action}, ${environment} — a ${pStyle} ${typeText}.`,
      `${environment}, a ${pStyle} ${typeText} of ${subject} ${action}.`,
      `A ${typeText} capturing ${subject} ${action}, ${environment}, in a ${pStyle} aesthetic.`,
    ];
    rawPrompt = `${selectOpening(openings, promptIndex)} ${tail}`;
  } 
  else if (targetModel === 'flux') {
    const typeText = mediaType === 'isolated_white' ? 'cutout on a pure white background' : mediaType;
    const tail = `Detailed textures, ${pLighting}, and ${pCamera}. Crisp composition, ${selectedModifiers}. ${safety}${custom}.`;
    const openings = [
      `A ${pStyle} ${typeText} of ${subject} ${action}, ${environment}.`,
      `${subject} ${action}, ${environment} — a ${pStyle} ${typeText}.`,
      `${environment}, a ${pStyle} ${typeText} of ${subject} ${action}.`,
      `A ${typeText} capturing ${subject} ${action}, ${environment}, in a ${pStyle} style.`,
    ];
    rawPrompt = `${selectOpening(openings, promptIndex)} ${tail}`;
  }
  else if (targetModel === 'nanobanana') {
    const typeText = mediaType === 'isolated_white' ? 'cutout on a pure white seamless background' : mediaType;
    const tail = `Beautifully captured with ${pLighting} and ${pCamera}, this highly detailed composition highlights intricate details, striking visual elements, and ${selectedModifiers} for a flawless look. ${safety}${custom}.`;
    const openings = [
      `A ${pStyle} ${typeText} of ${subject} ${action}, ${environment}.`,
      `${subject} ${action}, ${environment} — a ${pStyle} ${typeText}.`,
      `${environment}, a ${pStyle} ${typeText} of ${subject} ${action}.`,
      `A ${typeText} featuring ${subject} ${action}, ${environment}, in a ${pStyle} style.`,
    ];
    rawPrompt = `${selectOpening(openings, promptIndex)} ${tail}`;
  }
  else if (targetModel === 'ideogram') {
    const typeText = mediaType === 'isolated_white' ? 'isolated cutout on white background' : mediaType;
    const tail = `lit by ${pLighting} with ${pCamera}. High quality, ${selectedModifiers}, ${safety}${custom}.`;
    const openings = [
      `A ${pStyle} ${typeText} of ${subject} ${action}, ${environment},`,
      `${subject} ${action}, ${environment} — ${pStyle} ${typeText},`,
      `${environment}, a ${pStyle} ${typeText} of ${subject} ${action},`,
      `A ${typeText} showing ${subject} ${action}, ${environment}, in a ${pStyle} aesthetic,`,
    ];
    rawPrompt = `${selectOpening(openings, promptIndex)} ${tail}`;
  }
  else if (targetModel === 'recraft') {
    const typeText = mediaType === 'isolated_white' ? 'isolated white background' : mediaType;
    const tail = `${pStyle} style, ${pLighting}, ${pCamera}, ${typeText}, ${selectedModifiers}. ${safety}${custom}.`;
    const openings = [
      `${subject} ${action}, ${environment},`,
      `${environment} — ${subject} ${action},`,
      `${subject}, ${environment}, ${action},`,
      `A visual layout of ${subject} ${action}, ${environment},`,
    ];
    rawPrompt = `${selectOpening(openings, promptIndex)} ${tail}`;
  }
  else {
    // Default (General) - with opening variations per media type
    switch (mediaType) {
      case 'video': {
        if (promptLength === 'detailed') {
          const openings = [
            `${pStyle} stock footage featuring ${subject} ${action}, ${environment}.`,
            `${subject} ${action}, ${environment} — ${pStyle} stock footage.`,
            `A ${pStyle} video of ${subject} ${action}, ${environment}.`,
            `In ${environment}, a ${pStyle} stock video capturing ${subject} ${action}.`,
          ];
          rawPrompt = `${selectOpening(openings, promptIndex)} Cinematic ${pLighting} and ${pCamera}, stable motion, ${selectedModifiers}, ${safety}${custom}.`;
        } else {
          rawPrompt = `${pStyle} stock footage of ${subject} ${action}, ${environment}, ${pLighting}, ${pCamera}${custom}.`;
        }
        break;
      }
      case 'vector':
      case 'illustration': {
        if (promptLength === 'detailed') {
          const openings = [
            `${pStyle} illustration of ${subject} ${action}, ${environment}.`,
            `${subject} ${action}, ${environment} — ${pStyle} vector art.`,
            `A ${pStyle} vector design of ${subject} ${action}, ${environment}.`,
            `Against ${environment}, a ${pStyle} illustration of ${subject} ${action}.`,
          ];
          rawPrompt = `${selectOpening(openings, promptIndex)} Clean edges, strong focal point, ${selectedModifiers}, ${safety}${custom}.`;
        } else {
          rawPrompt = `${pStyle} vector design of ${subject} ${action}, ${selectedModifiers}${custom}.`;
        }
        break;
      }
      case 'isolated_white': {
        if (promptLength === 'detailed') {
          const openings = [
            `${pStyle} cutout of ${subject} ${action}, isolated cleanly on a pure white seamless background.`,
            `${subject} ${action} — ${pStyle} isolated cutout on a pure white seamless background.`,
            `A ${pStyle} clean cutout of ${subject} ${action}, on a pure white seamless background.`,
            `Isolated cleanly on a pure white seamless background: a ${pStyle} cutout of ${subject} ${action}.`,
          ];
          rawPrompt = `${selectOpening(openings, promptIndex)} Entire object fully visible, realistic detail, no shadow, no reflection, ${selectedModifiers}, ${safety}${custom}.`;
        } else {
          rawPrompt = `${pStyle} isolated ${subject} ${action}, pure white background, centered, clean cutout${custom}.`;
        }
        break;
      }
      case 'photo':
      default: {
        if (promptLength === 'detailed') {
          const openings = [
            `${pStyle} stock photography of ${subject} ${action}, ${environment}.`,
            `A ${pStyle} photograph of ${subject} ${action}, ${environment}.`,
            `${subject} ${action}, ${environment} — ${pStyle} stock photo.`,
            `In ${environment}, a ${pStyle} stock photo of ${subject} ${action}.`,
          ];
          rawPrompt = `${selectOpening(openings, promptIndex)} Beautiful ${pLighting} with ${pCamera}, realistic textures, ${selectedModifiers}, ${safety}${custom}.`;
        } else {
          rawPrompt = `${pStyle} photo of ${subject} ${action}, ${environment}, ${pLighting}, ${pCamera}, ${selectedModifiers}${custom}.`;
        }
        break;
      }
    }
  }

  return cleanPrompt(rawPrompt);
};

/**
 * Generate an array of unique prompts
 */
export const generatePrompts = ({
  categoryName,
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
}) => {
  const uniquePrompts = new Set();
  const maxAttempts = count * 30; // increased from 20 to 30 for better uniqueness
  let attempts = 0;

  // Pre-shuffle styles, lightings, camera angles for deterministic diversity in the batch
  const shuffledStyles = [...styles].sort(() => 0.5 - Math.random());
  const shuffledLightings = [...lighting].sort(() => 0.5 - Math.random());
  const shuffledCameras = [...cameraAngles].sort(() => 0.5 - Math.random());

  while (uniquePrompts.size < count && attempts < maxAttempts) {
    const currentIndex = uniquePrompts.size;
    const batchStyle = styleChoice === 'auto' ? shuffledStyles[currentIndex % shuffledStyles.length] : styleChoice;
    const batchLighting = lightingChoice === 'auto' ? shuffledLightings[currentIndex % shuffledLightings.length] : lightingChoice;
    const batchCamera = cameraAngleChoice === 'auto' ? shuffledCameras[currentIndex % shuffledCameras.length] : cameraAngleChoice;

    const prompt = generateSinglePrompt(
      categoryName,
      mediaType,
      promptLength,
      batchStyle,
      batchLighting,
      batchCamera,
      customInstruction,
      mainCategory,
      targetModel,
      aspectRatio,
      currentIndex
    );
    uniquePrompts.add(prompt);
    attempts++;
  }

  return Array.from(uniquePrompts).map((text, index) => ({
    id: `prompt-${Date.now()}-${index}`,
    text
  }));
};

