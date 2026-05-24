const fetch = require('node-fetch');

async function test() {
  const token = 'hf_YOUR_DUMMY_TOKEN_HERE';
  try {
    const res = await fetch('https://api-inference.huggingface.co/models/briaai/RMBG-1.4', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: 'dummy'
    });
    
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch(e) {
    console.log('Error:', e.message);
  }
}

test();
