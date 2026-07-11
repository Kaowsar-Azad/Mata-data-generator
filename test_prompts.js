import { generatePrompts } from './src/services/promptEngine/generator.js';

console.log("=== DEFAULT ===");
console.log(generatePrompts({ targetModel: 'default', count: 1 })[0].text);

console.log("=== MIDJOURNEY ===");
console.log(generatePrompts({ targetModel: 'midjourney', count: 1 })[0].text);

console.log("=== DALL-E 3 ===");
console.log(generatePrompts({ targetModel: 'dalle3', count: 1 })[0].text);

console.log("=== SDXL ===");
console.log(generatePrompts({ targetModel: 'sdxl', count: 1 })[0].text);
