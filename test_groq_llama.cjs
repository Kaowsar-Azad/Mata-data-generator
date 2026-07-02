const fs = require('fs');
const { fetchGroq } = require('./src/services/apis/groq.js');

async function test() {
  const backendConfig = JSON.parse(fs.readFileSync('./backend_url.json', 'utf8'));
  const apiKey = backendConfig.GROQ_API_KEY;
  if (!apiKey) {
    console.error("No Groq API key found.");
    return;
  }
  
  const dummyPrompt = "Generate exactly 50 keywords for a beige marble stone wall texture.";
  const dummyBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; 
  const mimeType = "image/png";

  console.log("Fetching Groq...");
  try {
    const res = await fetchGroq(apiKey, dummyPrompt, dummyBase64, mimeType, true, { smartMode: false, singleWordKeywords: true });
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error("Error:", e);
  }
}
test();
