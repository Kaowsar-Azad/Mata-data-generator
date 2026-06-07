export const parseCSV = (text) => {
  let lines = [];
  let row = [""];
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

const adobeCategoryMap = {
  "Animals": 1, "Buildings": 2, "Architecture": 2, "Business": 3, "Drinks": 4,
  "Environment": 5, "Nature": 5, "Mind": 6, "Mood": 6, "Food": 7,
  "Graphic": 8, "Illustration": 8, "Hobbies": 9, "Leisure": 9,
  "Industry": 10, "Landscape": 11, "Lifestyle": 12, "People": 13,
  "Plants": 14, "Flowers": 14, "Culture": 15, "Religion": 15,
  "Science": 16, "Social": 17, "Sports": 18, "Technology": 19,
  "Transport": 20, "Travel": 21
};

const getCategoryCode = (categories) => {
  if (!categories) return "11"; // default Landscape
  const cats = Array.isArray(categories) ? categories : [categories];
  for (const cat of cats) {
    for (const [key, code] of Object.entries(adobeCategoryMap)) {
      if (cat.toLowerCase().includes(key.toLowerCase())) return String(code);
    }
  }
  return "11";
};

export const downloadCSV = (targetPlatform, images, promptSettings) => {
  const doneImages = images.filter((img) => img.status === "done");
  if (doneImages.length === 0) return;

  const platform = targetPlatform || promptSettings?.exportPlatform || 'General';
  const safe = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
  const delimiter = platform === 'FreePik' ? ';' : ',';

  let headers = [];
  let rows = [];

  doneImages.forEach((img) => {
    const { title = "", description = "", keywords = "" } = img.result || {};
    const filename = img.renamedName || img.file?.name || "";
    const categoriesStr = Array.isArray(img.result?.categories) ? img.result.categories.join(", ") : (img.result?.categories || "");

    let row = [];
    if (platform === 'Adobe Stock') {
      headers = ["filename", "title", "keywords", "category", "releases"];
      const categoryCode = getCategoryCode(img.result?.categories);
      row = [filename, title, keywords, categoryCode, ""];
    } else if (platform === 'Shutterstock') {
      headers = ["Filename", "Description", "Keywords", "Categories"];
      row = [filename, description, keywords, categoriesStr];
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
      headers = ["Filename", "Title", "Description", "Keywords", "Categories", "Releases"];
      row = [filename, title, description, keywords, categoriesStr, ""];
    } else {
      // General
      headers = ["Filename", "Title", "Description", "Keywords"];
      row = [filename, title, description, keywords];
    }
    rows.push(row.map(safe).join(delimiter));
  });

  const bom = "\uFEFF";
  const content = bom + headers.join(delimiter) + "\n" + rows.join("\n");

  const blob = new Blob([content], { type: `text/csv;charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${platform.replace(/\s+/g, '_').toLowerCase()}_metadata_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
