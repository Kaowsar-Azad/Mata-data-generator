const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");

async function testAllKeys() {
  const keysFile = fs.readFileSync("C:\\Users\\user\\AppData\\Roaming\\matadata\\secure-keys.json", "utf8");
  const keys = JSON.parse(keysFile).gemini;
  
  const uniqueKeys = Array.from(new Set(keys));
  console.log(`Found ${uniqueKeys.length} unique keys. Testing them on gemini-3.5-flash...`);
  
  const imageBuffer = fs.readFileSync("e:\\matadata\\test1_mata_test.jpg");
  const base64 = imageBuffer.toString('base64');
  const contentParts = [
    { inlineData: { data: base64, mimeType: "image/jpeg" } },
    { text: "Hello" }
  ];

  for (let i = 0; i < uniqueKeys.length; i++) {
    const key = uniqueKeys[i];
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    try {
      const result = await model.generateContent(contentParts);
      await result.response;
      console.log(`Key ${i} (${key.substring(0,8)}...): SUCCESS`);
    } catch (err) {
      const msg = err.message.split('\n')[0];
      console.log(`Key ${i} (${key.substring(0,8)}...): FAILED - ${msg}`);
    }
    // Small delay to avoid hammering the API
    await new Promise(r => setTimeout(r, 1000));
  }
}

testAllKeys();
