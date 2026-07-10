/**
 * Advanced Prompt Engine Dataset
 * Researched and compiled for highest-selling stock categories 2024-2025:
 * Authentic Lifestyle, Diversity & Inclusion, Wellness & Self-Care, Technology & AI, Nature & Landmarks, Minimalism.
 */

export const mainCategories = {
  "People & Lifestyle": [
    "Authentic Lifestyle & Candid Moments",
    "Diversity & Inclusive Representation",
    "Wellness & Self-Care"
  ],
  "Business & Technology": [
    "Technology & AI Integration",
    "Minimalism & Negative Space (Business)"
  ],
  "Travel & Environments": [
    "Parks, Landmarks & Nature"
  ]
};

export const categories = {
  "Authentic Lifestyle & Candid Moments": {
    subjects: [
      "a diverse group of friends",
      "a multi-generational family",
      "a young professional couple",
      "creative coworkers",
      "a single father with his child",
      "a group of roommates",
      "a digital nomad",
      "active senior citizens"
    ],
    environments: [
      "in a cozy, sunlit living room",
      "at a bustling local coffee shop",
      "in an open-plan creative office",
      "during a weekend backyard barbecue",
      "at a lively urban farmers market",
      "in a warmly lit kitchen",
      "on a city apartment balcony",
      "at an outdoor cafe terrace"
    ],
    actions: [
      "laughing genuinely together",
      "sharing a casual meal",
      "collaborating on a laptop",
      "engaged in a deep, candid conversation",
      "playing a board game",
      "cooking dinner together",
      "celebrating a small victory",
      "enjoying a quiet morning coffee"
    ]
  },
  "Diversity & Inclusive Representation": {
    subjects: [
      "a confident businesswoman in a wheelchair",
      "a neurodivergent young adult",
      "a same-sex couple",
      "a diverse team of entrepreneurs",
      "an elderly woman with vibrant style",
      "a plus-size fitness enthusiast",
      "people of mixed ethnicities",
      "a professional with a prosthetic limb"
    ],
    environments: [
      "in a modern accessible workplace",
      "at a community wellness center",
      "in a bright corporate boardroom",
      "at a vibrant city park",
      "in a contemporary home studio",
      "at a local community event",
      "in a stylish urban apartment",
      "at a university campus"
    ],
    actions: [
      "leading a dynamic meeting",
      "smiling confidently at the camera",
      "working focused at a desk",
      "embracing warmly",
      "participating in a group activity",
      "stretching during a workout",
      "presenting a creative idea",
      "enjoying a leisure activity"
    ]
  },
  "Wellness & Self-Care": {
    subjects: [
      "a peaceful woman",
      "a focused athlete",
      "a mindful young man",
      "a senior practicing yoga",
      "a holistic health coach",
      "a person meditating",
      "someone enjoying a spa day",
      "a fitness instructor"
    ],
    environments: [
      "in a minimalist zen studio",
      "surrounded by lush green house plants",
      "on a quiet sandy beach at sunrise",
      "in a spa-like modern bathroom",
      "at a tranquil mountain retreat",
      "in a bright, airy bedroom",
      "in a sun-drenched outdoor patio",
      "by a calm forest lake"
    ],
    actions: [
      "practicing deep breathing exercises",
      "doing a gentle yoga stretch",
      "writing in a gratitude journal",
      "applying natural skincare products",
      "drinking herbal tea",
      "resting with closed eyes",
      "holding a meditation pose",
      "preparing a healthy smoothie"
    ]
  },
  "Technology & AI Integration": {
    subjects: [
      "a software engineer",
      "a creative digital artist",
      "a tech-savvy student",
      "a modern medical professional",
      "a remote worker",
      "an AI researcher",
      "a futuristic smart home user",
      "a data analyst"
    ],
    environments: [
      "in a sleek high-tech laboratory",
      "at a minimal desk with multiple monitors",
      "in a smart home living room",
      "in a server room with neon lights",
      "at a bright, modern coworking space",
      "in a VR simulation environment",
      "in a modern hospital ward",
      "at a futuristic command center"
    ],
    actions: [
      "interacting with a glowing holographic interface",
      "coding on a dual-monitor setup",
      "wearing a VR headset and reaching out",
      "analyzing complex data visualizations",
      "using a futuristic tablet device",
      "monitoring AI algorithms",
      "working remotely from a laptop",
      "controlling smart home devices"
    ]
  },
  "Parks, Landmarks & Nature": {
    subjects: [
      "a solo traveler",
      "a group of hikers",
      "a wildlife photographer",
      "a family on vacation",
      "a trail runner",
      "a nature enthusiast",
      "a local tour guide",
      "a peaceful camper"
    ],
    environments: [
      "at a famous national park overlook",
      "by a majestic waterfall",
      "in a dense, misty pine forest",
      "at a historical city landmark",
      "on a rugged mountain peak",
      "in a blooming spring botanical garden",
      "by a crystal clear alpine lake",
      "on a scenic coastal cliff"
    ],
    actions: [
      "looking out at the breathtaking view",
      "taking a photograph with a professional camera",
      "walking along a winding trail",
      "setting up a camping tent",
      "marveling at the natural beauty",
      "navigating with a map",
      "enjoying the golden hour sunlight",
      "resting after a long hike"
    ]
  },
  "Minimalism & Negative Space (Business)": {
    subjects: [
      "a single cup of artisan coffee",
      "a sleek modern laptop",
      "a pair of designer eyeglasses",
      "a minimal ceramic vase",
      "a stylish desk lamp",
      "an elegant fountain pen",
      "a blank notebook",
      "a geometric abstract object"
    ],
    environments: [
      "on a clean pastel background",
      "on a pristine white marble desk",
      "against a soft beige textured wall",
      "on a smooth slate grey surface",
      "on a bright seamless backdrop",
      "in a spacious, empty studio",
      "on a polished wooden table",
      "against a deep navy blue background"
    ],
    actions: [
      "positioned centrally with generous copy space",
      "placed in the lower right corner with vast negative space",
      "isolated cleanly for easy text overlay",
      "arranged neatly with a minimalist aesthetic",
      "casting a soft, subtle shadow",
      "framed perfectly for a website header",
      "presented with a focus on form and texture",
      "sitting alone to emphasize simplicity"
    ]
  }
};

export const mediaTypes = [
  { id: "photo", label: "Stock Photo" },
  { id: "video", label: "Stock Video (Footage)" },
  { id: "vector", label: "Vector Illustration" },
  { id: "isolated_white", label: "Isolated on White (Cutout)" }
];

export const styles = [
  "Premium commercial",
  "High-end editorial",
  "Authentic lifestyle",
  "Documentary-style",
  "Cinematic",
  "Minimalist",
  "Vibrant and bold",
  "Soft and airy",
  "Dark and moody",
  "Corporate professional"
];

export const lighting = [
  "natural golden hour sunlight",
  "soft diffused window light",
  "dramatic cinematic lighting",
  "bright even studio lighting",
  "moody low-key lighting",
  "neon cyberpunk glow",
  "warm ambient indoor lighting",
  "crisp daylight"
];

export const cameraAngles = [
  "eye-level shot",
  "low angle heroic shot",
  "high angle overhead shot",
  "wide establishing shot",
  "close-up detail shot",
  "over-the-shoulder shot",
  "drone perspective",
  "macro shot"
];

export const globalModifiers = [
  "ultra-realistic 8k resolution",
  "shot on 35mm lens",
  "shallow depth of field",
  "award-winning photography",
  "highly detailed textures",
  "commercial grade color grading",
  "perfect composition",
  "vogue editorial style"
];

export const safetyModifiers = [
  "no logos, no trademarks, no copyrighted characters, brand-safe",
  "clear of any branded elements, commercial-safe",
  "generic designs only, no recognizable brands, safe for stock"
];
