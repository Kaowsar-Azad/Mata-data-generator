import { 
  mainCategories,
  categories, 
  styles, 
  lighting, 
  cameraAngles, 
  globalModifiers, 
  vectorModifiers,
  techIllustrationModifiers,
  natureIllustrationModifiers,
  lifestyleIllustrationModifiers,
  generalIllustrationModifiers,
  threeDModifiers,
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
const generateSinglePrompt = (categoryName, mediaType, promptLength, styleChoice, lightingChoice, cameraChoice, customInstruction, mainCategory, targetModel = 'default', aspectRatio = '16:9', promptIndex = 0, iconLayout = 'set', iconStyle = 'colorful') => {
  let resolvedCategory = categoryName;
  
  if (mainCategory === 'Icons' && (mediaType === 'photo' || mediaType === 'video')) {
    mediaType = 'vector';
  }

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
  let subject = getRandom(categoryData.subjects);
  let environment = getRandom(categoryData.environments);
  const action = getRandom(categoryData.actions);

  if (mainCategory === 'Icons' || resolvedCategory === '3D Icons') {
    if (iconLayout === 'single') {
      if (resolvedCategory === '3D Icons') {
        const baseIcons = [
          'heart', 'gear', 'folder', 'document', 'clipboard', 'mail envelope', 'chat bubble', 'notification bell', 'magnifying glass', 'shopping cart', 'shopping bag', 'home', 'user profile', 'group of users', 'lock', 'padlock', 'key', 'star', 'thumb up', 'bookmark', 'tag', 'checkmark', 'cross', 'plus', 'hamburger menu', 'grid', 'sliders',
          'laptop', 'desktop computer', 'smartphone', 'tablet', 'smartwatch', 'server', 'database', 'microchip', 'motherboard', 'USB drive', 'hard drive', 'mouse', 'keyboard', 'WiFi router', 'cloud', 'network node', 'code brackets', 'terminal window', 'bug', 'shield', 'battery', 'plug', 'printer', 'webcam',
          'briefcase', 'calculator', 'tie', 'pen', 'pencil', 'chart', 'bar graph', 'pie chart', 'desk', 'office chair', 'stamp', 'calendar', 'agenda', 'business card', 'target', 'trophy', 'medal', 'handshake', 'presentation board', 'megaphone', 'push pin', 'paperclip',
          'credit card', 'wallet', 'money bill', 'stack of coins', 'gold coin', 'cash register', 'receipt', 'barcode', 'QR code', 'discount percentage', 'delivery truck', 'shipping box', 'safe', 'piggy bank', 'diamond', 'gemstone', 'crown',
          'paper airplane', 'double chat bubble', 'microphone', 'telephone', 'contact book', 'video camera', 'broadcast tower', 'play button', 'pause button', 'music note', 'headphones', 'speaker', 'film strip', 'clapperboard', 'ticket', 'game controller', 'joystick', 'puzzle piece', 'magic wand', 'paint palette', 'camera', 'picture frame', 'television', 'radio',
          'book', 'open book', 'graduation cap', 'diploma', 'microscope', 'telescope', 'beaker', 'test tube', 'atom', 'DNA strand', 'magnet', 'lightbulb', 'globe', 'blackboard', 'ruler', 'compass tool', 'flask', 'chemistry set',
          'coffee cup', 'tea cup', 'wine glass', 'beer mug', 'cocktail', 'pizza slice', 'hamburger', 'hot dog', 'taco', 'donut', 'ice cream cone', 'cake', 'cookie', 'apple', 'banana', 'strawberry', 'fork and knife', 'chef hat', 'cooking pot', 'frying pan', 'candy', 'popcorn',
          'sun', 'crescent moon', 'star', 'cloud', 'rain drop', 'snowflake', 'lightning bolt', 'thermometer', 'umbrella', 'tree', 'leaf', 'flower', 'rose', 'mountain', 'fire', 'water drop', 'tornado', 'wind', 'rainbow',
          'car', 'taxi', 'bus', 'train', 'bicycle', 'motorcycle', 'airplane', 'helicopter', 'rocket', 'boat', 'ship', 'anchor', 'steering wheel', 'map', 'location pin', 'compass', 'luggage', 'passport', 'boarding pass', 'gas pump', 'traffic light',
          'heartbeat line', 'stethoscope', 'syringe', 'pill', 'pill bottle', 'first aid kit', 'medical cross', 'band-aid', 'tooth', 'bone', 'brain', 'eye', 'blood drop', 'wheelchair', 'weight scale', 'hospital building',
          'hammer', 'wrench', 'screwdriver', 'handsaw', 'drill', 'tape measure', 'traffic cone', 'hard hat', 'paint brush', 'paint roller', 'shovel', 'bricks', 'gear wheel', 'anvil',
          'magic hat', 'crystal ball', 'dice', 'playing cards', 'chess piece', 'teddy bear', 'balloon', 'party hat', 'gift box', 'bow tie', 'sunglasses', 'umbrella', 'ghost', 'alien', 'robot'
        ];
        
        const materials = ['', 'glossy', 'matte', 'metallic', 'glass', 'neon', 'pastel', 'vibrant', 'minimalist', 'cute', 'futuristic', 'retro', 'elegant', 'holographic', 'translucent', 'frosted glass', 'clay', 'plastic'];
        const colors = ['', 'red', 'blue', 'green', 'gold', 'silver', 'white', 'black', 'purple', 'orange', 'cyan', 'magenta', 'yellow', 'pink', 'teal'];
        
        const baseIndex = promptIndex % baseIcons.length;
        const materialIndex = Math.floor(promptIndex / baseIcons.length) % materials.length;
        const colorIndex = Math.floor(promptIndex / (baseIcons.length * materials.length)) % colors.length;
        
        const baseIcon = baseIcons[baseIndex];
        const material = materials[materialIndex];
        const color = colors[colorIndex];
        const prefix = [material, color].filter(Boolean).join(' ');
        
        subject = prefix ? `a single 3D ${prefix} ${baseIcon} icon` : `a single 3D ${baseIcon} icon`;
      } else {
        const cleanName = resolvedCategory.toLowerCase().replace(' icons', '');
        subject = `a single flat UI icon depicting ${cleanName}`;
      }
    } else {
      // Icon Set / Grid Layout
      if (resolvedCategory === '3D Icons') {
        const themes = [
          'social media', 'e-commerce', 'office and business', 'weather forecast', 'music player', 
          'gaming', 'finance and banking', 'medical and healthcare', 'education', 'travel and tourism', 
          'food and restaurant', 'fitness and gym', 'data analytics', 'cryptocurrency', 'cloud computing', 
          'cyber security', 'smart home', 'photography', 'messaging and chat', 'map and navigation',
          'file management', 'video editing', 'user settings', 'online shopping', 'logistics and delivery'
        ];
        const gridSizes = [
          'a set of 4', 'a set of 6', 'a set of 9', 'a set of 12', 'a set of 16',
          'a 2x2 grid of', 'a 3x2 grid of', 'a 3x3 grid of', 'a 4x3 grid of', 'a 4x4 grid of',
          'a collection of 5', 'a collection of 8', 'a pack of 10'
        ];
        
        const themeIndex = promptIndex % themes.length;
        const gridIndex = Math.floor(promptIndex / themes.length) % gridSizes.length;
        
        const theme = themes[themeIndex];
        const grid = gridSizes[gridIndex];
        
        const materials = ['', 'glossy', 'matte', 'metallic', 'glass', 'neon', 'pastel', 'vibrant', 'minimalist', 'cute', 'futuristic', 'retro', 'elegant', 'holographic', 'translucent', 'frosted glass', 'clay', 'plastic'];
        const colors = ['', 'red', 'blue', 'green', 'gold', 'silver', 'white', 'black', 'purple', 'orange', 'cyan', 'magenta', 'yellow', 'pink', 'teal'];
        
        const materialIndex = Math.floor(promptIndex / (themes.length * gridSizes.length)) % materials.length;
        const colorIndex = Math.floor(promptIndex / (themes.length * gridSizes.length * materials.length)) % colors.length;
        
        const material = materials[materialIndex];
        const color = colors[colorIndex];
        const prefix = [material, color].filter(Boolean).join(' ');
        
        subject = prefix ? `${grid} matching 3D ${prefix} ${theme} UI icons` : `${grid} matching 3D ${theme} UI icons`;
      } else {
        const cleanName = resolvedCategory.toLowerCase().replace(' icons', '');
        subject = `a matching set of flat UI icons depicting ${cleanName}`;
      }
    }
  }

  if (resolvedCategory === '3D Icons') {
    environment = 'isolated on a pure white seamless background';
  }
  
  if (mediaType === 'vector') {
    if (!subject.toLowerCase().includes('vector') && !subject.toLowerCase().includes('icon')) {
      // Remove leading 'a ' or 'an ' if present to avoid "a flat vector illustration of a..."
      const cleanSubject = subject.replace(/^(a|an)\s+/i, '');
      subject = `a flat vector illustration of ${cleanSubject}`;
    }
    if (!environment.toLowerCase().includes('flat') && !environment.toLowerCase().includes('white background')) {
      environment = `${environment}, drawn in a minimal flat style`;
    }
  }
  
  // Get modifiers
  let sourceModifiers = globalModifiers;
  if (mediaType === 'vector') {
    sourceModifiers = vectorModifiers;
  } else if (mediaType === 'illustration') {
    const techCategories = ['Technology', 'Architecture', 'Environment'];
    const natureCategories = ['Nature', 'Animals', 'Food', 'Drinks', 'Fashion', 'Beauty'];
    const lifestyleCategories = ['People', 'Lifestyle', 'Healthcare', 'Wellness', 'Education', 'Sports', 'Travel'];
    
    // Find the main category for the current categoryName
    let resolvedMain = 'Business'; // fallback
    for (const [mainCat, subCats] of Object.entries(mainCategories)) {
      if (subCats.includes(categoryName)) {
        resolvedMain = mainCat;
        break;
      }
    }

    if (techCategories.includes(resolvedMain)) {
      sourceModifiers = techIllustrationModifiers;
    } else if (natureCategories.includes(resolvedMain)) {
      sourceModifiers = natureIllustrationModifiers;
    } else if (lifestyleCategories.includes(resolvedMain)) {
      sourceModifiers = lifestyleIllustrationModifiers;
    } else {
      sourceModifiers = generalIllustrationModifiers;
    }
  } else if (mediaType === '3d') {
    sourceModifiers = threeDModifiers;
  }
  
  let selectedModifiers = getMultipleRandom(sourceModifiers, promptLength === 'detailed' ? 3 : 1).join(', ');
  
  if (mainCategory === 'Icons' && iconStyle === 'monochrome') {
    selectedModifiers = `monochrome line art, minimal black and white, clean outline, ${selectedModifiers}`;
  }
  const safety = getRandom(safetyModifiers);
  const custom = formatCustomInstruction(customInstruction);

  let rawPrompt = '';
  const selectOpening = (openings, index) => openings[index % openings.length];

  if (targetModel === 'midjourney') {
    const base = `${subject}, ${action}, ${environment}`;
    const isGraphic = mediaType === 'vector' || mediaType === 'illustration' || mediaType === '3d';
    const keywords = isGraphic ? `${selectedModifiers}, ${safety}${custom}` : `${pLighting}, ${pCamera}, ${selectedModifiers}, ${safety}${custom}`;
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
    const isGraphic = mediaType === 'vector' || mediaType === 'illustration' || mediaType === '3d';
    const tail = isGraphic 
      ? `Emphasizing ${selectedModifiers}. ${safety}${custom}.`
      : `The scene is illuminated by ${pLighting} with ${pCamera}, emphasizing ${selectedModifiers}. ${safety}${custom}.`;
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
    const isGraphic = mediaType === 'vector' || mediaType === 'illustration' || mediaType === '3d';
    const tail = isGraphic
      ? `Clean composition, ${selectedModifiers}. ${safety}${custom}.`
      : `Detailed textures, ${pLighting}, and ${pCamera}. Crisp composition, ${selectedModifiers}. ${safety}${custom}.`;
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
    const isGraphic = mediaType === 'vector' || mediaType === 'illustration' || mediaType === '3d';
    const tail = isGraphic 
      ? `This stunning composition features clean elements, perfect layout, and ${selectedModifiers} for a professional look. ${safety}${custom}.` 
      : `Beautifully captured with ${pLighting} and ${pCamera}, this highly detailed composition highlights intricate details, striking visual elements, and ${selectedModifiers} for a flawless look. ${safety}${custom}.`;
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
    const isGraphic = mediaType === 'vector' || mediaType === 'illustration' || mediaType === '3d';
    const tail = isGraphic
      ? `High quality, ${selectedModifiers}, ${safety}${custom}.`
      : `lit by ${pLighting} with ${pCamera}. High quality, ${selectedModifiers}, ${safety}${custom}.`;
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
    const isGraphic = mediaType === 'vector' || mediaType === 'illustration' || mediaType === '3d';
    const tail = isGraphic
      ? `${pStyle} style, ${typeText}, ${selectedModifiers}. ${safety}${custom}.`
      : `${pStyle} style, ${pLighting}, ${pCamera}, ${typeText}, ${selectedModifiers}. ${safety}${custom}.`;
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
      case '3d': {
        if (promptLength === 'detailed') {
          const openings = [
            `${pStyle} 3D render of ${subject} ${action}, ${environment}.`,
            `${subject} ${action}, ${environment} — ${pStyle} highly detailed 3D graphic.`,
            `A ${pStyle} photorealistic 3D render of ${subject} ${action}, ${environment}.`,
            `In ${environment}, a ${pStyle} stunning 3D rendering of ${subject} ${action}.`,
          ];
          rawPrompt = `${selectOpening(openings, promptIndex)} Rendered in Cinema 4D, Unreal Engine 5, Octane Render, soft volumetric lighting, ${selectedModifiers}, ${safety}${custom}.`;
        } else {
          rawPrompt = `${pStyle} 3D render of ${subject} ${action}, ${environment}, Octane Render, 8k, ${selectedModifiers}${custom}.`;
        }
        break;
      }
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
      case 'vector': {
        if (promptLength === 'detailed') {
          const openings = [
            `${pStyle} flat vector design of ${subject} ${action}, ${environment}.`,
            `${subject} ${action}, ${environment} — ${pStyle} vector graphic.`,
            `A ${pStyle} scalable vector illustration of ${subject} ${action}, ${environment}.`,
            `Against ${environment}, a ${pStyle} clean vector art of ${subject} ${action}.`,
          ];
          rawPrompt = `${selectOpening(openings, promptIndex)} Clean edges, solid colors, Adobe Illustrator style, strong focal point, ${selectedModifiers}, ${safety}${custom}.`;
        } else {
          rawPrompt = `${pStyle} vector graphic of ${subject} ${action}, clean shapes, ${selectedModifiers}${custom}.`;
        }
        break;
      }
      case 'illustration': {
        if (promptLength === 'detailed') {
          const openings = [
            `${pStyle} digital illustration of ${subject} ${action}, ${environment}.`,
            `${subject} ${action}, ${environment} — ${pStyle} detailed artwork.`,
            `A ${pStyle} beautifully drawn illustration of ${subject} ${action}, ${environment}.`,
            `Against ${environment}, a ${pStyle} conceptual illustration of ${subject} ${action}.`,
          ];
          rawPrompt = `${selectOpening(openings, promptIndex)} Expressive style, artistic detail, strong focal point, ${selectedModifiers}, ${safety}${custom}.`;
        } else {
          rawPrompt = `${pStyle} digital illustration of ${subject} ${action}, ${selectedModifiers}${custom}.`;
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
  aspectRatio = '16:9',
  iconLayout = 'set',
  iconStyle = 'colorful'
}) => {
  const uniquePrompts = new Set();
  const maxAttempts = count * 30; // increased from 20 to 30 for better uniqueness
  let attempts = 0;

  // Pre-shuffle styles, lightings, camera angles for deterministic diversity in the batch
  const shuffledStyles = [...styles].sort(() => 0.5 - Math.random());
  const shuffledLightings = [...lighting].sort(() => 0.5 - Math.random());
  const shuffledCameras = [...cameraAngles].sort(() => 0.5 - Math.random());

  const batchOffset = Math.floor(Math.random() * 1000);

  while (uniquePrompts.size < count && attempts < maxAttempts) {
    const currentIndex = attempts;
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
      currentIndex + batchOffset,
      iconLayout,
      iconStyle
    );
    uniquePrompts.add(prompt);
    attempts++;
  }

  return Array.from(uniquePrompts).map((text, index) => ({
    id: `prompt-${Date.now()}-${index}`,
    text
  }));
};

