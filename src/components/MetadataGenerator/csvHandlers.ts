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
  "animals": 1, "animal": 1, "wildlife": 1, "pet": 1, "pets": 1,
  // 2. Buildings and Architecture
  "buildings and architecture": 2, "buildings": 2, "architecture": 2, "building": 2, "landmark": 2, "landmarks": 2,
  // 3. Business
  "business": 3, "finance": 3, "office": 3, "commerce": 3,
  // 4. Drinks
  "drinks": 4, "drink": 4, "beverage": 4, "beverages": 4,
  // 5. The Environment
  "the environment": 5, "environment": 5, "nature": 5, "eco": 5, "ecological": 5,
  // 6. States of Mind
  "states of mind": 6, "mind": 6, "mood": 6, "emotion": 6, "emotions": 6, "feeling": 6,
  // 7. Food
  "food": 7, "culinary": 7, "dish": 7, "meal": 7, "cooking": 7,
  // 8. Graphic Resources
  "graphic resources": 8, "graphic": 8, "graphics": 8, "illustration": 8, "illustrations": 8, "clipart": 8, "clip-art": 8, "vector": 8, "backgrounds": 8, "textures": 8, "abstract": 8, "pattern": 8,
  // 9. Hobbies and Leisure
  "hobbies and leisure": 9, "hobbies": 9, "hobby": 9, "leisure": 9, "craft": 9, "pastime": 9,
  // 10. Industry
  "industry": 10, "industrial": 10, "factory": 10, "manufacturing": 10, "warehouse": 10,
  // 11. Landscapes
  "landscapes": 11, "landscape": 11, "scenery": 11, "outdoor": 11, "outdoors": 11,
  // 12. Lifestyle
  "lifestyle": 12, "life": 12, "living": 12, "wellness": 12, "family": 12,
  // 13. People
  "people": 13, "person": 13, "human": 13, "portrait": 13, "men": 13, "women": 13, "children": 13,
  // 14. Plants and Flowers
  "plants and flowers": 14, "plants": 14, "plant": 14, "flowers": 14, "flower": 14, "botanical": 14, "flora": 14, "tree": 14, "trees": 14, "leaf": 14, "leaves": 14,
  // 15. Culture and Religion
  "culture and religion": 15, "culture": 15, "cultural": 15, "religion": 15, "religious": 15, "tradition": 15, "faith": 15,
  // 16. Science
  "science": 16, "scientific": 16, "medical": 16, "medicine": 16, "healthcare": 16, "research": 16, "laboratory": 16,
  // 17. Social Issues
  "social issues": 17, "social": 17, "society": 17, "community": 17, "protest": 17, "politics": 17,
  // 18. Sports
  "sports": 18, "sport": 18, "fitness": 18, "athlete": 18, "athletic": 18, "exercise": 18, "game": 18,
  // 19. Technology
  "technology": 19, "tech": 19, "computer": 19, "digital": 19, "ai": 19, "cyber": 19, "electronics": 19, "robot": 19,
  // 20. Transport
  "transport": 20, "transportation": 20, "vehicle": 20, "vehicles": 20, "car": 20, "truck": 20, "train": 20, "aviation": 20, "airplane": 20, "ship": 20,
  // 21. Travel
  "travel": 21, "tourism": 21, "tourist": 21, "vacation": 21, "trip": 21, "destination": 21
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

  return "11";
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
    if (platform === 'Adobe Stock') {
      headers = ["Filename", "Title", "Keywords", "Category"];
      const categoryCode = getCategoryCode(img.result?.categories, title, keywords);
      row = [filename, title, keywords, categoryCode];
    } else if (platform === 'Shutterstock') {
      headers = ["Filename", "Description", "Keywords", "Categories", "Illustration"];
      let catList: string[] = [];
      if (Array.isArray(img.result?.categories)) {
        catList = img.result.categories;
      } else if (typeof img.result?.categories === 'string') {
        catList = img.result.categories.split(',').map((c: string) => c.trim()).filter(Boolean);
      }
      // Shutterstock strictly allows a maximum of 2 categories
      const cleanCats = catList.slice(0, 2).join(', ');
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
      // General
      headers = ["Filename", "Title", "Description", "Keywords", "Categories", "MediaType"];
      row = [filename, title, description, keywords, categoriesStr, mediaTypeStr];
    }
    rows.push(row.map(safe).join(delimiter));
  });

  const bom = platform === 'Adobe Stock' ? "" : "\uFEFF";
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
