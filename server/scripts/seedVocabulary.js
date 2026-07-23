import 'dotenv/config';
import mongoose from 'mongoose';
import PromptVocabulary from '../models/PromptVocabulary.js';

const subjects = [
  "A futuristic robot", "A golden retriever", "A young female professional", "A senior executive", "A group of diverse friends",
  "A glowing jellyfish", "A cybernetic organism", "A majestic lion", "A cute tabby cat", "A rugged mountain climber",
  "A skilled surgeon", "A smiling nurse", "An astronaut", "A deep-sea diver", "A medieval knight", "A wise owl",
  "A colorful parrot", "A racing car driver", "An elegant ballerina", "A street dancer", "A jazz musician",
  "A focused programmer", "A happy family", "A lone wolf", "A soaring eagle", "A beautiful mermaid", "A fierce dragon",
  "A steampunk inventor", "A modern architect", "A creative artist", "A diligent student", "A curious toddler",
  "An elderly couple", "A fitness enthusiast", "A yoga instructor", "A martial arts expert", "A chef", "A baker",
  "A barista", "A bartender", "A police officer", "A firefighter", "A soldier", "A superhero", "A supervillain",
  "A wizard", "A witch", "A fairy", "An elf", "A dwarf", "A giant", "A mermaid", "A centaur", "A unicorn",
  "A pegasus", "A griffin", "A phoenix", "A vampire", "A werewolf", "A zombie", "A ghost", "A skeleton",
  "A cyborg", "An android", "A space marine", "A alien", "A time traveler", "A ninja", "A samurai", "A pirate",
  "A viking", "A cowboy", "A native american", "A pharaoh", "A gladiator", "A spartan", "A roman legionary",
  "A greek god", "A norse god", "A egyptian god", "A hindu god", "A chinese god", "A japanese god",
  "A beautiful woman", "A handsome man", "A cute baby", "A playful puppy", "A sleepy kitten", "A fluffy bunny",
  "A majestic horse", "A wild mustang", "A gentle elephant", "A towering giraffe", "A striped zebra",
  "A fierce tiger", "A stealthy leopard", "A fast cheetah", "A powerful gorilla", "A clever chimpanzee",
  "A wise orangutan", "A playful dolphin", "A massive whale", "A fierce shark", "A colorful clownfish",
  "A slow turtle", "A slimy frog", "A croaking toad", "A slithering snake", "A scaly lizard", "A flying bird",
  "A singing canary", "A talking parrot", "A soaring eagle", "A diving falcon", "A running ostrich",
  "A swimming penguin", "A waddling duck", "A honking goose", "A clucking chicken", "A crowing rooster",
  "A mooing cow", "A baaing sheep", "A oinking pig", "A neighing horse", "A braying donkey",
  // Add 100 more diverse stock subjects
  "A corporate team in a meeting", "A pregnant woman", "A diverse group of students", "A female scientist in a lab",
  "An indigenous elder", "A disabled person using a wheelchair", "A non-binary person smiling", "A grandfather reading to his grandson",
  "A pair of twins", "A marathon runner", "A professional cyclist", "A surfer riding a wave", "A snowboarder doing a trick",
  "A skateboarder in mid-air", "A rock climber scaling a cliff", "A scuba diver exploring a reef", "A skydiver in freefall",
  "A pilot in a cockpit", "A flight attendant serving passengers", "A train conductor", "A bus driver", "A taxi driver",
  "A truck driver", "A delivery person", "A postal worker", "A construction worker", "A factory worker", "A mechanic",
  "A plumber", "A electrician", "A carpenter", "A painter", "A farmer", "A gardener", "A landscaper",
  "A cleaner", "A janitor", "A security guard", "A police officer on patrol", "A firefighter putting out a fire",
  "A paramedic helping a patient", "A doctor performing surgery", "A nurse giving an injection", "A dentist examining teeth",
  "A pharmacist dispensing medication", "A therapist talking to a client", "A social worker", "A teacher in a classroom",
  "A professor giving a lecture", "A student studying in a library", "A researcher in a lab", "A scientist looking through a microscope"
];

const actions = [
  "drinking coffee", "typing on a laptop", "laughing out loud", "running in the rain", "jumping with joy",
  "reading a book", "painting a canvas", "playing a guitar", "singing a song", "dancing in the street",
  "cooking a meal", "eating a slice of pizza", "sleeping peacefully", "waking up", "stretching their arms",
  "doing yoga", "lifting weights", "swimming in the ocean", "riding a bicycle", "driving a car",
  "flying an airplane", "sailing a boat", "hiking up a mountain", "camping in the woods", "fishing by a lake",
  "hunting in the forest", "exploring a cave", "climbing a tree", "building a sandcastle", "collecting seashells",
  "watching the sunset", "stargazing", "taking a photograph", "recording a video", "talking on the phone",
  "texting a friend", "scrolling through social media", "playing a video game", "watching a movie",
  "listening to music", "attending a concert", "cheering for a team", "protesting for a cause",
  "volunteering at a shelter", "donating to a charity", "helping a stranger", "giving a hug", "kissing a loved one",
  "holding hands", "smiling at the camera", "looking into the distance", "thinking deeply", "meditating",
  "praying", "crying tears of joy", "laughing uncontrollably", "screaming in terror", "running away",
  "hiding from danger", "fighting for survival", "saving the day", "celebrating a victory", "mourning a loss",
  "learning a new skill", "teaching a lesson", "working hard", "taking a break", "enjoying life",
  // 100 more actions for diversity
  "analyzing financial charts", "brainstorming ideas on a whiteboard", "shaking hands", "presenting a project",
  "debugging code", "designing a website", "testing a prototype", "assembling parts", "packaging products",
  "loading a truck", "delivering a package", "sorting mail", "scanning groceries", "stocking shelves",
  "serving food", "pouring drinks", "cleaning a room", "repairing a car", "fixing a leak", "painting a wall",
  "planting seeds", "watering plants", "harvesting crops", "feeding animals", "milking a cow", "shearing a sheep",
  "riding a horse", "walking a dog", "petting a cat", "playing fetch", "throwing a frisbee", "catching a ball",
  "hitting a home run", "scoring a goal", "making a basket", "serving an ace", "running a marathon",
  "swimming laps", "lifting heavy weights", "doing pushups", "doing situps", "doing pullups", "stretching before a workout",
  "cooling down after a workout", "sweating profusely", "drinking water", "eating healthy food", "taking vitamins",
  "getting enough sleep", "managing stress", "practicing mindfulness", "seeking therapy", "improving mental health",
  "building a campfire", "pitching a tent", "roasting marshmallows", "telling ghost stories", "singing campfire songs",
  "looking at a map", "using a compass", "following a trail", "getting lost", "finding the way back"
];

const environments = [
  "in a neon-lit cyberpunk city", "on a sunny beach", "in a cozy living room", "inside a modern office",
  "at the peak of a snowy mountain", "deep in a lush rainforest", "in a vast desert", "on a distant planet",
  "inside a spaceship", "in a medieval castle", "in a bustling marketplace", "in a quiet library",
  "at a noisy concert", "in a peaceful garden", "in a dark alley", "on a busy street",
  "in a fast-moving train", "on a large cruise ship", "in a small airplane", "in a hot air balloon",
  "under the sea", "in a coral reef", "in a deep trench", "in a dark cave", "in a bright meadow",
  "in a dense forest", "in a spooky graveyard", "in a haunted house", "in a magical realm",
  "in a dream world", "in a virtual reality", "in a computer simulation", "in a parallel universe",
  "in a post-apocalyptic wasteland", "in a utopian city", "in a dystopian society", "in a steampunk world",
  "in a cyberpunk dystopia", "in a high fantasy setting", "in a low fantasy world", "in a sci-fi universe",
  "in a historical era", "in the present day", "in the near future", "in the distant future",
  "at dawn", "at sunrise", "in the morning", "at noon", "in the afternoon", "at sunset",
  "at dusk", "in the evening", "at night", "at midnight", "under the moonlight", "under the stars",
  "in the rain", "in the snow", "in the fog", "in the mist", "in a thunderstorm", "in a blizzard",
  "in a hurricane", "in a tornado", "in an earthquake", "in a volcano eruption", "in a meteor shower",
  // 100 more environments
  "in a minimalist modern kitchen", "in a high-tech laboratory", "in a crowded subway station",
  "in a quiet suburban neighborhood", "in a rural farmhouse", "in an industrial warehouse",
  "in a bustling airport terminal", "in a hospital emergency room", "in a university lecture hall",
  "in a grand theater", "in a sports stadium", "in a museum gallery", "in an art studio",
  "in a music recording studio", "in a TV broadcasting room", "in a radio station", "in a newsroom",
  "in a courtroom", "in a police station", "in a firehouse", "in a military base", "in a submarine",
  "in a space station", "in a lunar colony", "in a martian settlement", "in a terraformed planet",
  "in a virtual chat room", "in an online multiplayer game", "in a metaverse environment",
  "in a digital landscape", "in a cybernetic construct", "in a holographic projection",
  "in a memory sequence", "in a dreamscape", "in a nightmare realm", "in a spiritual dimension",
  "in a heavenly paradise", "in a hellish inferno", "in a purgatorial void", "in a cosmic void",
  "in a nebula", "in a galaxy", "in a star cluster", "in a planetary system", "in an asteroid belt",
  "in a comet tail", "in a solar flare", "in a supernova explosion", "in a black hole event horizon",
  "in a wormhole", "in a time vortex", "in a parallel dimension", "in an alternate timeline",
  "in a pocket universe", "in a microscopic world", "in a macroscopic realm", "in a subatomic scale",
  "in a quantum state", "in a wave function", "in a probability field"
];

const concepts = [
  "focusing on teamwork", "representing freedom", "symbolizing artificial intelligence", "showing true love",
  "depicting sadness", "illustrating joy", "capturing a moment of peace", "expressing anger",
  "highlighting diversity", "promoting sustainability", "encouraging innovation", "inspiring creativity",
  "demonstrating strength", "revealing vulnerability", "conveying hope", "radiating positivity",
  "embracing change", "overcoming adversity", "seeking truth", "finding purpose",
  "chasing dreams", "achieving success", "experiencing failure", "learning from mistakes",
  "growing as a person", "connecting with others", "building relationships", "breaking boundaries",
  "pushing limits", "exploring the unknown", "discovering new worlds", "inventing the future",
  "preserving the past", "honoring traditions", "challenging norms", "questioning authority",
  "fighting for justice", "advocating for equality", "protecting the environment", "saving the planet",
  "exploring deep space", "understanding the universe", "unraveling mysteries", "solving puzzles",
  "creating masterpieces", "composing symphonies", "writing epics", "telling stories",
  "sharing knowledge", "spreading wisdom", "inspiring generations", "leaving a legacy",
  "making a difference", "changing the world", "leaving a mark", "being remembered",
  "living life to the fullest", "enjoying the moment", "appreciating the little things", "finding happiness",
  // more concepts
  "visualizing data", "representing cybersecurity", "showing financial growth", "depicting a crisis",
  "illustrating a breakthrough", "capturing a climax", "expressing a revelation", "highlighting a contrast",
  "promoting a healthy lifestyle", "encouraging mindfulness", "inspiring fitness", "demonstrating agility",
  "revealing a secret", "conveying a message", "radiating energy", "embracing a culture",
  "overcoming an obstacle", "seeking a solution", "finding a balance", "chasing a goal",
  "achieving a milestone", "experiencing a transition", "learning a lesson", "growing a business",
  "connecting a network", "building a community", "breaking a record", "pushing a boundary",
  "exploring a concept", "discovering a truth", "inventing a product", "preserving a memory",
  "honoring a hero", "challenging a belief", "questioning a theory", "fighting a disease",
  "advocating for a cause", "protecting a resource", "saving a species", "exploring a culture",
  "understanding a phenomenon", "unraveling a secret", "solving a mystery", "creating a vision",
  "composing a melody", "writing a poem", "telling a joke", "sharing a smile",
  "spreading a rumor", "inspiring a movement", "leaving a footprint", "making a statement",
  "changing a perspective", "leaving an impression", "being a leader", "living a dream",
  "enjoying a journey", "appreciating a view", "finding a passion", "living in the moment"
];

const styles = [
  "cinematic", "photorealistic", "anime style", "oil painting", "watercolor", "pencil sketch",
  "3D render", "unreal engine 5", "cyberpunk aesthetic", "steampunk style", "minimalist",
  "pop art", "surrealism", "cubism", "impressionism", "expressionism", "abstract",
  "gothic", "baroque", "renaissance", "rococo", "neoclassical", "romanticism",
  "realism", "naturalism", "symbolism", "art nouveau", "art deco", "bauhaus",
  "constructivism", "dadaism", "surrealism", "abstract expressionism", "pop art",
  "minimalism", "conceptual art", "performance art", "installation art", "digital art",
  "glitch art", "pixel art", "voxel art", "low poly", "high poly", "cell shaded",
  "flat design", "skeuomorphism", "material design", "neumorphism", "glassmorphism",
  "grunge", "vintage", "retro", "nostalgic", "futuristic", "sci-fi", "fantasy",
  "horror", "thriller", "mystery", "romance", "comedy", "drama", "action",
  // more styles
  "documentary photography", "street photography", "fashion editorial", "architectural visualization",
  "isometric 3D", "macro photography", "astrophotography", "drone photography", "underwater photography",
  "tilt-shift photography", "long exposure photography", "infrared photography", "ultraviolet photography",
  "kirlian photography", "schlieren photography", "holographic", "volumetric", "fractal art",
  "algorithmic art", "generative art", "AI generated art", "neural network art", "deep dream art",
  "style transfer art", "gan art", "vqgan+clip art", "diffusion model art", "dall-e style",
  "midjourney style", "stable diffusion style", "novelai style", "waifu diffusion style",
  "craiyon style", "nightcafe style", "artbreeder style", "runwayml style", "wombo dream style",
  "starryai style", "deepai style", "hotpot.ai style", "fotor style", "canva style",
  "adobe firefly style", "leonardo.ai style", "lexica.art style", "playgroundai style",
  "mage.space style", "civitai style", "huggingface style", "replicate style", "fal.ai style",
  "bria.ai style", "photoroom style", "remove.bg style", "upscayl style", "topaz labs style"
];

const lighting = [
  "golden hour lighting", "neon lighting", "dramatic shadows", "soft studio lighting",
  "hard sunlight", "moonlight", "starlight", "firelight", "candlelight",
  "bioluminescent glow", "lens flare", "volumetric lighting", "god rays",
  "backlit", "silhouetted", "rim lighting", "edge lighting", "underlighting",
  "top lighting", "side lighting", "front lighting", "flat lighting",
  "high key lighting", "low key lighting", "chiaroscuro", "tenebrism",
  "ambient lighting", "diffused lighting", "bounced lighting", "reflected lighting",
  "colored lighting", "rgb lighting", "laser lighting", "strobe lighting",
  "flash lighting", "continuous lighting", "natural lighting", "artificial lighting",
  "mixed lighting", "practical lighting", "motivating lighting", "cinematic lighting",
  // more lighting
  "blue hour lighting", "overcast lighting", "foggy lighting", "misty lighting",
  "hazy lighting", "smoggy lighting", "smoky lighting", "dusty lighting",
  "glaring lighting", "blinding lighting", "dazzling lighting", "sparkling lighting",
  "shimmering lighting", "glistening lighting", "glowing lighting", "radiating lighting",
  "pulsing lighting", "flickering lighting", "flashing lighting", "strobing lighting",
  "blinking lighting", "winking lighting", "twinkling lighting", "glinting lighting",
  "gleaming lighting", "shining lighting", "beaming lighting", "ray tracing",
  "global illumination", "ambient occlusion", "screen space reflections", "subsurface scattering",
  "caustics", "bloom", "lens dirt", "chromatic aberration", "vignetting",
  "depth of field", "motion blur", "film grain", "color grading", "lut",
  "hdr", "sdr", "dolby vision", "hdr10", "hdr10+", "hlg", "raw", "log"
];

const cameras = [
  "shot on 35mm lens", "wide angle", "telephoto", "macro lens", "fisheye lens",
  "drone view", "satellite view", "microscopic view", "telescopic view",
  "go-pro", "dashcam", "security camera", "bodycam", "webcam",
  "polaroid", "disposable camera", "film camera", "digital camera",
  "dslr", "mirrorless", "medium format", "large format",
  "imax camera", "red camera", "arri alexa", "panavision",
  "sony venice", "canon cinema", "blackmagic", "phantom flex",
  "gimbal stabilized", "steadicam", "handheld", "tripod mounted",
  "crane shot", "dolly shot", "tracking shot", "panning shot",
  "tilting shot", "zooming shot", "focus pull", "rack focus",
  // more cameras
  "85mm portrait lens", "50mm standard lens", "24mm wide angle", "14mm ultra wide",
  "200mm telephoto", "400mm super telephoto", "800mm extreme telephoto", "1200mm astronomical telescope",
  "electron microscope", "scanning tunneling microscope", "atomic force microscope",
  "hubble space telescope", "james webb space telescope", "chandra x-ray observatory",
  "spitzer space telescope", "kepler space telescope", "tess space telescope",
  "gopro hero 11", "dji mavic 3", "dji mini 3 pro", "dji inspire 3",
  "dji fpv", "dji avata", "skydio 2", "autel evo", "parrot anafi",
  "iphone 14 pro max", "samsung galaxy s23 ultra", "google pixel 7 pro",
  "leica m11", "hasselblad x2d", "fujifilm gfx 100s", "phase one xt",
  "arri alexa 65", "red v-raptor", "sony venice 2", "panavision millennium dxl2",
  "z-cam e2", "kinefinity mavo", "bolex h16", "arri sr3", "aaton penelope"
];

const seedDB = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    console.log('Clearing old vocabulary...');
    await PromptVocabulary.deleteMany({});

    console.log('Inserting new vocabulary...');
    
    const allWords = [];
    
    subjects.forEach(w => allWords.push({ word: w, category: 'Subject' }));
    actions.forEach(w => allWords.push({ word: w, category: 'Action' }));
    environments.forEach(w => allWords.push({ word: w, category: 'Environment' }));
    concepts.forEach(w => allWords.push({ word: w, category: 'Concept' }));
    styles.forEach(w => allWords.push({ word: w, category: 'Style' }));
    lighting.forEach(w => allWords.push({ word: w, category: 'Lighting' }));
    cameras.forEach(w => allWords.push({ word: w, category: 'Camera' }));

    // Remove duplicates
    const uniqueWordsMap = new Map();
    allWords.forEach(item => {
      uniqueWordsMap.set(item.word.toLowerCase() + '-' + item.category, item);
    });

    const uniqueWords = Array.from(uniqueWordsMap.values());
    
    await PromptVocabulary.insertMany(uniqueWords);
    console.log(`✅ Successfully seeded ${uniqueWords.length} vocabulary words!`);

    mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error seeding DB:', error);
    process.exit(1);
  }
};

seedDB();
