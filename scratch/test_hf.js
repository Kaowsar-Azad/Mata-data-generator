import { Client, handle_file } from '@gradio/client';
import fs from 'fs';

async function run() {
  try {
    console.log('Connecting to finegrain/finegrain-image-enhancer...');
    const client = await Client.connect("finegrain/finegrain-image-enhancer");
    console.log('Connected! Calling /process...');
    const result = await client.predict("/process", [
      handle_file('test1.jpg'), // input_image
      "highly detailed, sharp focus, clean, 4k", // prompt
      "blurry, low quality, noise, grain, text", // negative_prompt
      42, // seed
      2, // upscale_factor
      0.6, // controlnet_scale
      1.0, // controlnet_decay
      6.0, // condition_scale
      112, // tile_width
      144, // tile_height
      0.35, // denoise_strength
      18, // num_inference_steps
      "DDIM" // solver
    ]);
    console.log('Result:', JSON.stringify(result.data, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
