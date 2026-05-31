import { Client } from '@gradio/client';
import fs from 'fs';

async function testGradio() {
  try {
    console.log('Connecting to space...');
    const client = await Client.connect("black-forest-labs/FLUX.1-schnell");
    console.log('Predicting...');
    const result = await client.predict("/infer", [
      "A beautiful cat in a futuristic city, cyberpunk style, highly detailed", 
      0, 
      true, 
      1024, 
      1024, 
      4
    ]);
    console.log('Result:', result.data);
  } catch (error) {
    console.error('Error:', error);
  }
}

testGradio();
