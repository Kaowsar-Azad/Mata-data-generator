const fs = require('fs');
const path = 'e:/matadata/src/services/apis/groq.js';
let content = fs.readFileSync(path, 'utf-8');

const target1 = `== KEYWORD SCORES ==
Assign a relevance score (1-100) to EVERY keyword you generated.
- 80-100: Highly relevant, literal subject/action.
- 40-79: Moderately relevant, background details or commercial concepts.
- 1-39: Low relevance (Do not generate these).
CRITICAL: The number of items in "keywordScores" MUST EXACTLY MATCH the number of keywords in "keywords".

Output ONLY valid JSON, no markdown formatting:
{"title":"A complete and grammatically correct sentence describing the image.","description":"A detailed visual description explaining the layout, colors, and specific commercial uses.","keywords":"word1, word2, word3, word4, word5, word6, word7, word8, word9, word10, word11, word12, word13, word14, word15, word16, word17, word18, word19, word20, word21, word22, word23, word24, word25, word26, word27, word28, word29, word30, word31, word32, word33, word34, word35, word36, word37, word38, word39, word40, word41, word42, word43, word44, word45, word46, word47, word48, word49, word50","keywordScores":{"word1":95,"word2":92,"word3":90,"word4":88,"word5":85,"word6":82,"word7":80,"word8":78,"word9":75,"word10":72,"word11":70,"word12":68,"word13":65,"word14":62,"word15":60,"word16":58,"word17":55,"word18":52,"word19":50,"word20":48,"word21":45,"word22":42,"word23":40,"word24":95,"word25":90,"word26":85,"word27":80,"word28":75,"word29":70,"word30":65,"word31":60,"word32":55,"word33":50,"word34":45,"word35":40,"word36":95,"word37":90,"word38":85,"word39":80,"word40":75,"word41":70,"word42":65,"word43":60,"word44":55,"word45":50,"word46":45,"word47":40,"word48":90,"word49":80,"word50":70},"categories":"Selected Category","commercialConcept":"popular","subjectClarity":"clear","technicalQuality":"good","marketDemand":"evergreen","scoreReason":"...","policyWarning":null}\`;`;

const replacement1 = `== KEYWORD SCORES ==
You MUST evaluate EVERY SINGLE keyword you generate and assign it a "Commercial Relevance Score" from 1 to 100 based strictly on how accurately and importantly it describes THIS SPECIFIC image.
CRITICAL RULE: The number of items in your "keywordScores" object MUST EXACTLY MATCH the number of keywords in your "keywords" string. Do NOT skip scoring ANY keyword.
- 80-100 (Green): Highly relevant SEO terms. The keyword perfectly describes the primary subjects, main actions, or core themes physically visible in this specific image.
- 40-79 (Yellow): Moderately relevant. The keyword describes background details, secondary elements, or broader related commercial concepts.
- 1-39 (Red): Low relevance or generic. DO NOT GENERATE THESE.
Evaluate each keyword with brutal honesty based on the image content. Do not artificially inflate scores.

Output ONLY valid JSON, no markdown formatting:
{"title":"A complete and grammatically correct sentence describing the image.","description":"A detailed visual description explaining the layout, colors, and specific commercial uses.","keywords":"apple, technology, screen, ... (requested total)","keywordScores":{"apple":95,"technology":80,"screen":45},"categories":"Selected Category","commercialConcept":"popular","subjectClarity":"clear","technicalQuality":"good","marketDemand":"evergreen","scoreReason":"...","policyWarning":null}\`;`;

const target2 = `    : \`KEYWORDS: Generate AT LEAST 50 highly relevant keywords. Use primary subjects, colors, materials, actions, and commercial themes. NO generic filler: "thing", "item", "nice", "great", "image", "photo", "picture", "graphic", "visual", "file", "element", "object". Separate keywords by commas.\`;`;

const replacement2 = `    : \`KEYWORDS: Generate AT LEAST 50 highly relevant keywords. Use primary subjects, colors, materials, actions, and commercial themes. NO generic filler. If the image is simple, use synonyms, specific textures, and abstract concepts related to the image instead of inventing physical objects. Separate keywords by commas.\`;`;


if (content.includes(target1)) {
    content = content.replace(target1, replacement1);
    console.log("Replaced target1");
} else {
    console.error("Target1 not found");
}

if (content.includes(target2)) {
    content = content.replace(target2, replacement2);
    console.log("Replaced target2");
} else {
    console.error("Target2 not found");
}

fs.writeFileSync(path, content, 'utf-8');
console.log('Update complete.');
