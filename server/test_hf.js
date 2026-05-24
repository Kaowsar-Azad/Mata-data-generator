import fetch from 'node-fetch';

async function test() {
  try {
    const res = await fetch('https://api-inference.huggingface.co/models/briaai/RMBG-1.4', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer hf_test' },
      body: 'dummy'
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch(e) {
    console.log('Error:', e);
  }
}

test();
