import fs from 'fs';
import path from 'path';

async function testGenerateContent() {
  try {
    const keysPath = "C:\\Users\\user\\AppData\\Roaming\\matadata\\secure-keys.json";
    const content = fs.readFileSync(keysPath, 'utf8');
    const keys = JSON.parse(content);
    const geminiKeys = keys.gemini || [];
    
    const apiKey = geminiKeys[0];
    if (!apiKey) {
      console.log("No key found");
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;
    
    const requestBody = {
      contents: [
        {
          parts: [
            { text: "A cute baby dinosaur drinking coffee" }
          ]
        }
      ]
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    console.log('Status:', res.status);
    const data = await res.text();
    console.log('Response:', data.substring(0, 500));
  } catch (err) {
    console.error('Error:', err);
  }
}

testGenerateContent();
