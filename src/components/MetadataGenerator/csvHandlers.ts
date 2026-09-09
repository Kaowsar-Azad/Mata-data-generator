// @ts-nocheck
export const parseCSV = (text: string): string[][] => {
  let lines: string[][] = [];
  let row: string[] = [""];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    let next = text[i+1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }
  return lines;
};

const adobeCategoryMap: Record<string, number> = {
  // 1. Animals
  "animals": 1, "animal": 1, "wildlife": 1, "pet": 1, "pets": 1, "dog": 1, "cat": 1, "horse": 1, "bird": 1, "fish": 1, "insect": 1, "bear": 1, "lion": 1, "tiger": 1, "monkey": 1, "zoo": 1, "fauna": 1, "mammal": 1,
  // 2. Buildings and Architecture
  "buildings and architecture": 2, "buildings": 2, "architecture": 2, "building": 2, "landmark": 2, "landmarks": 2, "city": 2, "urban": 2, "house": 2, "home": 2, "bridge": 2, "street": 2, "interior": 2, "exterior": 2, "room": 2, "skyline": 2, "skyscraper": 2, "town": 2,
  // 3. Business
  "business": 3, "finance": 3, "office": 3, "commerce": 3, "corporate": 3, "money": 3, "work": 3, "professional": 3, "job": 3, "meeting": 3, "desk": 3, "economy": 3, "career": 3,
  // 4. Drinks
  "drinks": 4, "drink": 4, "beverage": 4, "beverages": 4, "coffee": 4, "tea": 4, "alcohol": 4, "beer": 4, "wine": 4, "water": 4, "liquid": 4, "glass": 4, "cocktail": 4, "juice": 4, "cafe": 4,
  // 5. The Environment
  "the environment": 5, "environment": 5, "nature": 5, "eco": 5, "ecological": 5, "forest": 5, "green": 5, "earth": 5, "planet": 5, "outdoor": 5, "jungle": 5, "woods": 5, "ecology": 5,
  // 6. States of Mind
  "states of mind": 6, "mind": 6, "mood": 6, "emotion": 6, "emotions": 6, "feeling": 6, "happy": 6, "sad": 6, "angry": 6, "thought": 6, "mental": 6, "stress": 6, "depression": 6, "joy": 6, "smile": 6, "crying": 6, "psychological": 6,
  // 7. Food
  "food": 7, "culinary": 7, "dish": 7, "meal": 7, "cooking": 7, "restaurant": 7, "vegetable": 7, "fruit": 7, "meat": 7, "sweet": 7, "dessert": 7, "baking": 7, "breakfast": 7, "lunch": 7, "dinner": 7, "snack": 7,
  // 8. Graphic Resources
  "graphic resources": 8, "graphic": 8, "graphics": 8, "illustration": 8, "illustrations": 8, "clipart": 8, "clip-art": 8, "vector": 8, "backgrounds": 8, "textures": 8, "abstract": 8, "pattern": 8, "design": 8, "3d render": 8, "template": 8, "layout": 8, "frame": 8,
  // 9. Hobbies and Leisure
  "hobbies and leisure": 9, "hobbies": 9, "hobby": 9, "leisure": 9, "craft": 9, "pastime": 9, "play": 9, "game": 9, "guitar": 9, "music": 9, "art": 9, "painting": 9, "reading": 9, "knitting": 9, "entertainment": 9,
  // 10. Industry
  "industry": 10, "industrial": 10, "factory": 10, "manufacturing": 10, "warehouse": 10, "construction": 10, "worker": 10, "machine": 10, "engineer": 10, "equipment": 10, "production": 10,
  // 11. Landscapes
  "landscapes": 11, "landscape": 11, "scenery": 11, "outdoors": 11, "mountain": 11, "river": 11, "lake": 11, "sunset": 11, "sunrise": 11, "sky": 11, "field": 11, "hill": 11, "valley": 11, "panorama": 11, "scenic": 11,
  // 12. Lifestyle
  "lifestyle": 12, "life": 12, "living": 12, "wellness": 12, "family": 12, "healthy": 12, "relaxation": 12, "spa": 12, "yoga": 12, "fitness": 12, "daily": 12, "casual": 12,
  // 13. People
  "people": 13, "person": 13, "human": 13, "portrait": 13, "men": 13, "women": 13, "children": 13, "man": 13, "woman": 13, "child": 13, "girl": 13, "boy": 13, "group": 13, "team": 13, "crowd": 13, "face": 13, "adult": 13, "kid": 13,
  // 14. Plants and Flowers
  "plants and flowers": 14, "plants": 14, "plant": 14, "flowers": 14, "flower": 14, "botanical": 14, "flora": 14, "tree": 14, "trees": 14, "leaf": 14, "leaves": 14, "garden": 14, "blossom": 14, "bloom": 14, "petal": 14,
  // 15. Culture and Religion
  "culture and religion": 15, "culture": 15, "cultural": 15, "religion": 15, "religious": 15, "tradition": 15, "faith": 15, "cross": 15, "church": 15, "temple": 15, "islam": 15, "holy": 15, "spiritual": 15, "god": 15, "pray": 15,
  // 16. Science
  "science": 16, "scientific": 16, "medical": 16, "medicine": 16, "healthcare": 16, "research": 16, "laboratory": 16, "doctor": 16, "hospital": 16, "biology": 16, "chemistry": 16, "physics": 16, "anatomy": 16,
  // 17. Social Issues
  "social issues": 17, "social": 17, "society": 17, "community": 17, "protest": 17, "politics": 17, "issue": 17, "equality": 17, "climate change": 17, "poverty": 17, "strike": 17, "awareness": 17, "charity": 17,
  // 18. Sports
  "sports": 18, "sport": 18, "athlete": 18, "athletic": 18, "exercise": 18, "gym": 18, "run": 18, "football": 18, "soccer": 18, "basketball": 18, "training": 18, "workout": 18, "active": 18,
  // 19. Technology
  "technology": 19, "tech": 19, "computer": 19, "digital": 19, "ai": 19, "cyber": 19, "electronics": 19, "robot": 19, "internet": 19, "software": 19, "smartphone": 19, "network": 19, "device": 19, "screen": 19, "laptop": 19,
  // 20. Transport
  "transport": 20, "transportation": 20, "vehicle": 20, "vehicles": 20, "car": 20, "truck": 20, "train": 20, "aviation": 20, "airplane": 20, "ship": 20, "boat": 20, "road": 20, "drive": 20, "flight": 20, "traffic": 20,
  // 21. Travel
  "travel": 21, "tourism": 21, "tourist": 21, "vacation": 21, "trip": 21, "destination": 21, "holiday": 21, "journey": 21, "tour": 21, "explore": 21, "world": 21, "map": 21, "adventure": 21
};

const getCategoryCode = (categories: any, title?: string, keywords?: string) => {
  if (categories) {
    const cats = Array.isArray(categories) ? categories : [categories];
    for (const rawCat of cats) {
      const cat = String(rawCat || '').trim();
      if (/^\d+$/.test(cat)) {
        const num = parseInt(cat, 10);
        if (num >= 1 && num <= 21) return String(num);
      }
      const lower = cat.toLowerCase();
      for (const [key, code] of Object.entries(adobeCategoryMap)) {
        if (lower === key || lower.includes(key) || key.includes(lower)) {
          return String(code);
        }
      }
    }
  }

  const text = `${title || ''} ${keywords || ''}`.toLowerCase();
  for (const [key, code] of Object.entries(adobeCategoryMap)) {
    if (key.length >= 4 && new RegExp(`\\b${key}\\b`, 'i').test(text)) {
      return String(code);
    }
  }

  return "";
};

const SHUTTERSTOCK_CATEGORIES = [
  "Abstract",
  "Animals/Wildlife",
  "Arts",
  "Backgrounds/Textures",
  "Beauty/Fashion",
  "Buildings/Landmarks",
  "Business/Finance",
  "Celebrities",
  "Education",
  "Food and Drink",
  "Healthcare/Medical",
  "Holidays",
  "Industrial",
  "Interiors",
  "Miscellaneous",
  "Nature",
  "Objects",
  "Parks/Outdoor",
  "People",
  "Religion",
  "Science",
  "Signs/Symbols",
  "Sports/Recreation",
  "Technology",
  "Transportation",
  "Vintage"
];

const shutterstockCategoryMap: Record<string, string> = {
  // Abstract
  "abstract": "Abstract", "geometry": "Abstract", "geometric": "Abstract", "fractal": "Abstract", "shapes": "Abstract", "psychedelic": "Abstract", "fluid": "Abstract", "fluids": "Abstract", "surreal": "Abstract", "minimalist": "Abstract",
  // Animals/Wildlife
  "animals/wildlife": "Animals/Wildlife", "animals": "Animals/Wildlife", "animal": "Animals/Wildlife", "wildlife": "Animals/Wildlife", "pet": "Animals/Wildlife", "pets": "Animals/Wildlife", "dog": "Animals/Wildlife", "dogs": "Animals/Wildlife", "cat": "Animals/Wildlife", "cats": "Animals/Wildlife", "horse": "Animals/Wildlife", "bird": "Animals/Wildlife", "birds": "Animals/Wildlife", "fish": "Animals/Wildlife", "fauna": "Animals/Wildlife", "mammal": "Animals/Wildlife", "insect": "Animals/Wildlife", "insects": "Animals/Wildlife", "zoo": "Animals/Wildlife", "lion": "Animals/Wildlife", "tiger": "Animals/Wildlife", "bear": "Animals/Wildlife", "wolf": "Animals/Wildlife", "puppy": "Animals/Wildlife", "kitten": "Animals/Wildlife",
  // Arts
  "arts": "Arts", "art": "Arts", "artistic": "Arts", "painting": "Arts", "paintings": "Arts", "draw": "Arts", "drawing": "Arts", "illustration": "Arts", "illustrations": "Arts", "sculpture": "Arts", "canvas": "Arts", "sketch": "Arts", "watercolor": "Arts", "oil painting": "Arts", "gallery": "Arts", "craft": "Arts", "creative": "Arts", "museum": "Arts", "graphic resources": "Arts", "clipart": "Arts", "vector": "Arts",
  // Backgrounds/Textures
  "backgrounds/textures": "Backgrounds/Textures", "backgrounds": "Backgrounds/Textures", "background": "Backgrounds/Textures", "textures": "Backgrounds/Textures", "texture": "Backgrounds/Textures", "backdrop": "Backgrounds/Textures", "wallpaper": "Backgrounds/Textures", "surface": "Backgrounds/Textures", "grunge": "Backgrounds/Textures", "marble": "Backgrounds/Textures", "pattern": "Backgrounds/Textures", "bokeh": "Backgrounds/Textures", "gradient": "Backgrounds/Textures",
  // Beauty/Fashion
  "beauty/fashion": "Beauty/Fashion", "beauty": "Beauty/Fashion", "fashion": "Beauty/Fashion", "cosmetics": "Beauty/Fashion", "makeup": "Beauty/Fashion", "model": "Beauty/Fashion", "style": "Beauty/Fashion", "stylish": "Beauty/Fashion", "clothing": "Beauty/Fashion", "apparel": "Beauty/Fashion", "dress": "Beauty/Fashion", "glamour": "Beauty/Fashion", "skincare": "Beauty/Fashion", "hair": "Beauty/Fashion", "hairstyle": "Beauty/Fashion", "salon": "Beauty/Fashion", "accessories": "Beauty/Fashion", "jewelry": "Beauty/Fashion",
  // Buildings/Landmarks
  "buildings/landmarks": "Buildings/Landmarks", "buildings and architecture": "Buildings/Landmarks", "buildings": "Buildings/Landmarks", "building": "Buildings/Landmarks", "landmarks": "Buildings/Landmarks", "landmark": "Buildings/Landmarks", "architecture": "Buildings/Landmarks", "city": "Buildings/Landmarks", "cityscape": "Buildings/Landmarks", "urban": "Buildings/Landmarks", "skyscraper": "Buildings/Landmarks", "skyline": "Buildings/Landmarks", "monument": "Buildings/Landmarks", "tower": "Buildings/Landmarks", "bridge": "Buildings/Landmarks", "house": "Buildings/Landmarks", "facade": "Buildings/Landmarks", "exterior": "Buildings/Landmarks", "palace": "Buildings/Landmarks",
  // Business/Finance
  "business/finance": "Business/Finance", "business": "Business/Finance", "finance": "Business/Finance", "office": "Business/Finance", "financial": "Business/Finance", "money": "Business/Finance", "commerce": "Business/Finance", "corporate": "Business/Finance", "investment": "Business/Finance", "banking": "Business/Finance", "economy": "Business/Finance", "currency": "Business/Finance", "marketing": "Business/Finance", "workplace": "Business/Finance", "career": "Business/Finance", "professional": "Business/Finance", "company": "Business/Finance",
  // Celebrities
  "celebrities": "Celebrities", "celebrity": "Celebrities", "famous": "Celebrities", "star": "Celebrities", "vip": "Celebrities", "actor": "Celebrities", "actress": "Celebrities",
  // Education
  "education": "Education", "educational": "Education", "school": "Education", "college": "Education", "university": "Education", "study": "Education", "studying": "Education", "student": "Education", "students": "Education", "learning": "Education", "classroom": "Education", "teacher": "Education", "academic": "Education", "knowledge": "Education", "book": "Education", "books": "Education", "library": "Education", "graduation": "Education",
  // Food and Drink
  "food and drink": "Food and Drink", "food": "Food and Drink", "foods": "Food and Drink", "drink": "Food and Drink", "drinks": "Food and Drink", "beverage": "Food and Drink", "beverages": "Food and Drink", "culinary": "Food and Drink", "meal": "Food and Drink", "cooking": "Food and Drink", "kitchen": "Food and Drink", "restaurant": "Food and Drink", "dish": "Food and Drink", "recipe": "Food and Drink", "fruit": "Food and Drink", "fruits": "Food and Drink", "vegetable": "Food and Drink", "vegetables": "Food and Drink", "meat": "Food and Drink", "bakery": "Food and Drink", "bread": "Food and Drink", "dessert": "Food and Drink", "sweet": "Food and Drink", "sweets": "Food and Drink", "coffee": "Food and Drink", "tea": "Food and Drink", "cocktail": "Food and Drink", "alcohol": "Food and Drink", "wine": "Food and Drink", "beer": "Food and Drink", "snack": "Food and Drink", "breakfast": "Food and Drink", "lunch": "Food and Drink", "dinner": "Food and Drink",
  // Healthcare/Medical
  "healthcare/medical": "Healthcare/Medical", "healthcare": "Healthcare/Medical", "medical": "Healthcare/Medical", "health": "Healthcare/Medical", "medicine": "Healthcare/Medical", "doctor": "Healthcare/Medical", "hospital": "Healthcare/Medical", "clinic": "Healthcare/Medical", "patient": "Healthcare/Medical", "nurse": "Healthcare/Medical", "pharmacy": "Healthcare/Medical", "care": "Healthcare/Medical", "wellness": "Healthcare/Medical", "dental": "Healthcare/Medical", "dentist": "Healthcare/Medical", "treatment": "Healthcare/Medical", "therapy": "Healthcare/Medical", "physician": "Healthcare/Medical", "vaccine": "Healthcare/Medical", "surgery": "Healthcare/Medical",
  // Holidays
  "holidays": "Holidays", "holiday": "Holidays", "christmas": "Holidays", "xmas": "Holidays", "halloween": "Holidays", "easter": "Holidays", "new year": "Holidays", "thanksgiving": "Holidays", "valentines": "Holidays", "celebration": "Holidays", "festive": "Holidays", "festival": "Holidays", "carnival": "Holidays", "birthday": "Holidays", "party": "Holidays", "anniversary": "Holidays", "santa": "Holidays",
  // Industrial
  "industrial": "Industrial", "industry": "Industrial", "factory": "Industrial", "manufacturing": "Industrial", "machine": "Industrial", "machinery": "Industrial", "engineering": "Industrial", "warehouse": "Industrial", "production": "Industrial", "worker": "Industrial", "mechanic": "Industrial", "automation": "Industrial", "plant": "Industrial", "heavy industry": "Industrial", "equipment": "Industrial",
  // Interiors
  "interiors": "Interiors", "interior": "Interiors", "interior design": "Interiors", "room": "Interiors", "living room": "Interiors", "bedroom": "Interiors", "bathroom": "Interiors", "decor": "Interiors", "home decor": "Interiors", "furniture": "Interiors", "sofa": "Interiors", "indoor": "Interiors", "indoors": "Interiors", "apartment": "Interiors",
  // Miscellaneous
  "miscellaneous": "Miscellaneous", "misc": "Miscellaneous", "general": "Miscellaneous",
  // Nature
  "nature": "Nature", "natural": "Nature", "landscape": "Nature", "landscapes": "Nature", "scenery": "Nature", "scenic": "Nature", "forest": "Nature", "mountain": "Nature", "mountains": "Nature", "tree": "Nature", "trees": "Nature", "sea": "Nature", "ocean": "Nature", "beach": "Nature", "river": "Nature", "lake": "Nature", "sky": "Nature", "sunset": "Nature", "sunrise": "Nature", "flora": "Nature", "plant": "Nature", "plants": "Nature", "plants and flowers": "Nature", "flower": "Nature", "flowers": "Nature", "botanical": "Nature", "leaf": "Nature", "leaves": "Nature", "environment": "Nature", "the environment": "Nature", "garden": "Nature",
  // Objects
  "objects": "Objects", "object": "Objects", "item": "Objects", "items": "Objects", "still life": "Objects", "tool": "Objects", "tools": "Objects", "product": "Objects", "gadget": "Objects", "isolated": "Objects",
  // Parks/Outdoor
  "parks/outdoor": "Parks/Outdoor", "parks": "Parks/Outdoor", "park": "Parks/Outdoor", "outdoor": "Parks/Outdoor", "outdoors": "Parks/Outdoor", "playground": "Parks/Outdoor", "camping": "Parks/Outdoor", "hiking": "Parks/Outdoor", "picnic": "Parks/Outdoor", "national park": "Parks/Outdoor", "trail": "Parks/Outdoor", "field": "Parks/Outdoor",
  // People
  "people": "People", "person": "People", "human": "People", "humans": "People", "men": "People", "women": "People", "man": "People", "woman": "People", "child": "People", "children": "People", "kid": "People", "kids": "People", "girl": "People", "girls": "People", "boy": "People", "boys": "People", "family": "People", "group": "People", "crowd": "People", "portrait": "People", "face": "People", "lifestyle": "People", "couple": "People", "friends": "People", "adult": "People",
  // Religion
  "religion": "Religion", "culture and religion": "Religion", "religious": "Religion", "spiritual": "Religion", "faith": "Religion", "church": "Religion", "temple": "Religion", "mosque": "Religion", "cross": "Religion", "pray": "Religion", "prayer": "Religion", "god": "Religion", "worship": "Religion", "christianity": "Religion", "islam": "Religion", "holy": "Religion",
  // Science
  "science": "Science", "scientific": "Science", "laboratory": "Science", "lab": "Science", "research": "Science", "experiment": "Science", "chemistry": "Science", "biology": "Science", "physics": "Science", "genetics": "Science", "microscope": "Science", "dna": "Science", "space": "Science", "galaxy": "Science", "astronomy": "Science",
  // Signs/Symbols
  "signs/symbols": "Signs/Symbols", "signs": "Signs/Symbols", "symbols": "Signs/Symbols", "symbol": "Signs/Symbols", "sign": "Signs/Symbols", "icon": "Signs/Symbols", "icons": "Signs/Symbols", "badge": "Signs/Symbols", "badges": "Signs/Symbols", "emblem": "Signs/Symbols", "logo": "Signs/Symbols", "arrow": "Signs/Symbols", "signal": "Signs/Symbols", "infographic": "Signs/Symbols", "button": "Signs/Symbols",
  // Sports/Recreation
  "sports/recreation": "Sports/Recreation", "sports": "Sports/Recreation", "sport": "Sports/Recreation", "fitness": "Sports/Recreation", "exercise": "Sports/Recreation", "workout": "Sports/Recreation", "gym": "Sports/Recreation", "athlete": "Sports/Recreation", "athletic": "Sports/Recreation", "football": "Sports/Recreation", "soccer": "Sports/Recreation", "basketball": "Sports/Recreation", "tennis": "Sports/Recreation", "running": "Sports/Recreation", "runner": "Sports/Recreation", "yoga": "Sports/Recreation", "swimming": "Sports/Recreation", "cycling": "Sports/Recreation", "bike": "Sports/Recreation",
  // Technology
  "technology": "Technology", "tech": "Technology", "computer": "Technology", "digital": "Technology", "ai": "Technology", "cyber": "Technology", "internet": "Technology", "software": "Technology", "hardware": "Technology", "smartphone": "Technology", "electronics": "Technology", "robot": "Technology", "robotics": "Technology", "network": "Technology", "data": "Technology", "laptop": "Technology",
  // Transportation
  "transportation": "Transportation", "transport": "Transportation", "vehicle": "Transportation", "vehicles": "Transportation", "car": "Transportation", "cars": "Transportation", "automobile": "Transportation", "traffic": "Transportation", "truck": "Transportation", "train": "Transportation", "trains": "Transportation", "airplane": "Transportation", "aviation": "Transportation", "ship": "Transportation", "boat": "Transportation", "drive": "Transportation", "highway": "Transportation", "flight": "Transportation",
  // Vintage
  "vintage": "Vintage", "retro": "Vintage", "antique": "Vintage", "classic": "Vintage", "nostalgia": "Vintage", "nostalgic": "Vintage", "old fashioned": "Vintage", "historical": "Vintage", "history": "Vintage", "rustic": "Vintage", "victorian": "Vintage", "heritage": "Vintage"
};

const getShutterstockCategories = (categories: any, textContext?: string, keywords?: string): string => {
  const matched: string[] = [];

  const addCategory = (cat: string) => {
    if (cat && SHUTTERSTOCK_CATEGORIES.includes(cat) && !matched.includes(cat)) {
      matched.push(cat);
    }
  };

  // 1. Check raw categories from AI
  if (categories) {
    const cats = Array.isArray(categories) ? categories : [categories];
    for (const rawCat of cats) {
      const lower = String(rawCat || '').trim().toLowerCase();
      // Direct exact match
      for (const official of SHUTTERSTOCK_CATEGORIES) {
        if (lower === official.toLowerCase()) {
          addCategory(official);
          break;
        }
      }
      // Direct map lookup
      if (shutterstockCategoryMap[lower]) {
        addCategory(shutterstockCategoryMap[lower]);
      } else {
        for (const [key, official] of Object.entries(shutterstockCategoryMap)) {
          if (lower === key || lower.includes(key)) {
            addCategory(official);
            break;
          }
        }
      }
      if (matched.length >= 2) break;
    }
  }

  // 2. If fewer than 2 categories matched, check Description/Title & Keywords
  if (matched.length < 2) {
    const text = `${textContext || ''} ${keywords || ''}`.toLowerCase();
    for (const [key, official] of Object.entries(shutterstockCategoryMap)) {
      if (key.length >= 4 && new RegExp(`\\b${key}\\b`, 'i').test(text)) {
        addCategory(official);
        if (matched.length >= 2) break;
      }
    }
  }

  return matched.slice(0, 2).join(', ');
};

export const downloadCSV = (targetPlatform: string, images: any[], promptSettings: any) => {
  const doneImages = images.filter((img) => img.status === "done");
  if (doneImages.length === 0) return;

  const platform = targetPlatform || promptSettings?.exportPlatform || 'General';
  const delimiter = platform === 'FreePik' ? ';' : ',';
  const safe = (s: any) => {
    const str = String(s ?? '');
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  let headers: string[] = [];
  let rows: string[] = [];

  doneImages.forEach((img) => {
    const { title = "", description = "", keywords = "" } = img.result || {};
    const categoriesStr = Array.isArray(img.result?.categories) ? img.result.categories.join(', ') : (img.result?.categories || "");
    const filename = img.renamedName || img.file?.name || "";

    // Detect if file is an Illustration/Vector vs Photo
    const isIllustration = Boolean(
      img.isEps || 
      img.isPlaceholder ||
      promptSettings?.mediaTypeHint === 'Illustration / Vector' ||
      (img.result?.categories && Array.isArray(img.result.categories) && img.result.categories.some(c => /illustration|clip-art|graphic|abstract/i.test(c))) ||
      (filename && /vector|illustration|flat|clipart|draw|graphic|render|3d/i.test(filename)) ||
      (title && /illustration|vector|flat design|3d render|drawing|cartoon|clipart/i.test(title))
    );

    const illustrationYesNo = isIllustration ? "Yes" : "No";
    const mediaTypeStr = isIllustration ? "Illustration" : "Photo";

    let row: string[] = [];
    if (platform === 'Adobe Stock' || platform === 'General') {
      headers = ["Filename", "Title", "Keywords", "Category"];
      const categoryCode = getCategoryCode(img.result?.categories, title, keywords);
      row = [filename, title, keywords, categoryCode];
    } else if (platform === 'Shutterstock') {
      headers = ["Filename", "Description", "Keywords", "Categories", "Illustration"];
      // Shutterstock strictly allows a maximum of 2 categories from the official 26 category list (exact text & spelling)
      const cleanCats = getShutterstockCategories(img.result?.categories, description || title, keywords);
      row = [filename, description, keywords, cleanCats, illustrationYesNo];
    } else if (platform === 'FreePik') {
      headers = ["File name", "Title", "Keywords"];
      row = [filename, title, keywords];
    } else if (platform === 'Vecteezy') {
      headers = ["Filename", "Title", "Description", "Keywords", "License"];
      row = [filename, title, description, keywords, "Standard"];
    } else if (platform === 'Dreamstime') {
      headers = ["Filename", "Title", "Description", "Keywords", "Category 1"];
      row = [filename, title, description, keywords, categoriesStr.split(',')[0] || ""];
    } else if (platform === 'Pond5') {
      headers = ["originalfilename", "title", "description", "keywords", "city", "region", "country", "location", "specifysource", "modelreleased", "propertyreleased", "release"];
      row = [filename, title, description, keywords, "", "", "", "", "", "", "", ""];
    } else if (platform === 'Getty') {
      headers = ["file name", "created date", "description", "country", "brief code", "title", "keywords"];
      row = [filename, new Date().toISOString().split('T')[0], description, "", "", title, keywords];
    } else if (platform === 'Depositphotos') {
      headers = ["Filename", "description", "Keywords", "Nudity", "Editorial"];
      row = [filename, description, keywords, "No", "No"];
    } else if (platform === 'Extended metadata') {
      headers = ["Filename", "Title", "Description", "Keywords", "Categories", "MediaType", "Releases"];
      row = [filename, title, description, keywords, categoriesStr, mediaTypeStr, ""];
    } else {
      // General fallback - identical to Adobe Stock
      headers = ["Filename", "Title", "Keywords", "Category"];
      const categoryCode = getCategoryCode(img.result?.categories, title, keywords);
      row = [filename, title, keywords, categoryCode];
    }
    rows.push(row.map(safe).join(delimiter));
  });

  const bom = (platform === 'Adobe Stock' || platform === 'General') ? "" : "\uFEFF";
  const content = bom + headers.map(safe).join(delimiter) + "\r\n" + rows.join("\r\n");
  const blob = new Blob([content], { type: `text/csv;charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const fileName = platform === 'Adobe Stock'
    ? 'adobe_stock_metadata.csv'
    : `${platform.replace(/\s+/g, '_').toLowerCase()}_metadata.csv`;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
