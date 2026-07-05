const fs = require('fs');
const path = require('path');
const { fetchGroq } = require('./src/services/apis/groq.js');

async function test() {
  const keysPath = path.join(process.env.APPDATA, 'matadata', 'secure-keys.json');
  if (!fs.existsSync(keysPath)) {
    console.error("Keys file does not exist at:", keysPath);
    return;
  }
  const secureKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  const apiKey = secureKeys.groq && secureKeys.groq[0];
  if (!apiKey) {
    console.error("No Groq API key found in secure storage.");
    return;
  }
  
  const dummyPrompt = "Generate exactly 50 keywords for this 3d check icon.";
  const imagePath = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\c4d092ca-5db6-4e68-aafa-5144d6715277\\3d_check_icon_1782816108199.png';
  if (!fs.existsSync(imagePath)) {
    console.error("Image file does not exist at:", imagePath);
    return;
  }
  const dummyBase64 = fs.readFileSync(imagePath).toString('base64');
  const mimeType = "image/png";

  const payload = {
    model: "qwen/qwen3.6-27b",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: dummyPrompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${dummyBase64}` } }
        ]
      }
    ],
    max_tokens: 4096
  };

  console.log("Calling Groq directly...");
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      console.error("Status:", res.status, await res.text());
      return;
    }
    
    const data = await res.json();
    console.log("Response usage:", JSON.stringify(data.usage, null, 2));
    console.log("Response content preview:", data.choices[0].message.content.substring(0, 100));
  } catch (e) {
    console.error("Error:", e.stack || e);
  }
}
test();
