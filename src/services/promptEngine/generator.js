import { 
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
 * Generate a single prompt based on selected parameters
 */
const generateSinglePrompt = (categoryName, mediaType, promptLength, styleChoice, lightingChoice, cameraChoice, customInstruction) => {
  const categoryData = categories[categoryName] || categories[Object.keys(categories)[0]];
  
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

  // Switch based on media type
  switch (mediaType) {
    case 'video':
      if (promptLength === 'detailed') {
        const templates = [
          `${pStyle} 4k stock footage prompt featuring ${subject}, ${action}, set in ${environment}, with ${pLighting}, ${pCamera}, stable cinematic framing, natural motion continuity, realistic detail, ${selectedModifiers}, ${safety}${custom}.`,
          `${pStyle} commercial video prompt centered on ${subject}, ${action}, in ${environment}, shaped by ${pLighting} and ${pCamera}, smooth visual pacing, realistic scene detail, ${selectedModifiers}, ${safety}${custom}.`
        ];
        return getRandom(templates);
      }
      return `${pStyle} stock footage of ${subject}, ${action}, in ${environment}, ${pLighting}, ${pCamera}${custom}.`;
      
    case 'vector':
    case 'illustration':
      if (promptLength === 'detailed') {
        const templates = [
          `${pStyle} commercial illustration focused on ${subject}, ${action}, placed in ${environment}, with polished visual storytelling, clean edges, strong focal point, ${selectedModifiers}, controlled color balance, ${safety}${custom}.`,
          `${pStyle} scalable vector asset built around ${subject}, ${action}, in ${environment}, disciplined shape language, ${selectedModifiers}, professional stock-library usability, ${safety}${custom}.`
        ];
        return getRandom(templates);
      }
      return `${pStyle} vector design for ${subject}, ${action}, clean scalable shapes, ${selectedModifiers}, editable look${custom}.`;
      
    case 'isolated_white':
      if (promptLength === 'detailed') {
        const templates = [
          `${pStyle} commercial stock cutout of ${subject}, ${action}, isolated on a pure white seamless background, entire object fully visible with generous margins, no crop, no cut off edges, no shadow, no reflection, realistic detail, ${selectedModifiers}, ${safety}${custom}.`,
          `${pStyle} extraction-ready stock subject featuring ${subject}, ${action}, placed on pure white seamless background, fully visible with safe margins, balanced centered layout, no cut off edges, no shadow, no reflection, ${selectedModifiers}, ${safety}${custom}.`
        ];
        return getRandom(templates);
      }
      return `${pStyle} isolated ${subject}, ${action}, pure white seamless background, fully visible, centered, no crop, no shadow, clean cutout${custom}.`;

    case 'photo':
    default:
      if (promptLength === 'detailed') {
        const templates = [
          `${pStyle} commercial stock photo of ${subject}, ${action}, placed in ${environment}, with ${pLighting}, ${pCamera}, ${selectedModifiers}, realistic textures, natural proportions, strong subject clarity, authentic stock photography detail, ${safety}${custom}.`,
          `${pStyle} high-end stock image featuring ${subject}, ${action}, within ${environment}, shaped by ${pLighting}, ${pCamera}, refined visual hierarchy, authentic surface detail, premium commercial atmosphere, ${selectedModifiers}, polished photography look, ${safety}${custom}.`,
          `${pStyle} premium commercial photography prompt showing ${subject}, ${action}, inside ${environment}, with ${pLighting} and ${pCamera}, strong buyer-friendly framing, ${selectedModifiers}, authentic real-world detail, brand-safe output${custom}.`
        ];
        return getRandom(templates);
      }
      return `${pStyle} stock photo of ${subject}, ${action}, in ${environment}, ${pLighting}, ${pCamera}, ${selectedModifiers}${custom}.`;
  }
};

/**
 * Generate an array of unique prompts
 */
export const generatePrompts = ({
  categoryName,
  mediaType = 'photo',
  promptLength = 'detailed',
  styleChoice = 'auto',
  lightingChoice = 'auto',
  cameraAngleChoice = 'auto',
  customInstruction = '',
  count = 6
}) => {
  const uniquePrompts = new Set();
  const maxAttempts = count * 20; // prevent infinite loops
  let attempts = 0;

  while (uniquePrompts.size < count && attempts < maxAttempts) {
    const prompt = generateSinglePrompt(
      categoryName,
      mediaType,
      promptLength,
      styleChoice,
      lightingChoice,
      cameraAngleChoice,
      customInstruction
    );
    uniquePrompts.add(prompt);
    attempts++;
  }

  return Array.from(uniquePrompts).map((text, index) => ({
    id: `prompt-${Date.now()}-${index}`,
    text
  }));
};
