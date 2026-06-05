import { Client } from '@gradio/client';

async function run() {
  try {
    const client = await Client.connect("finegrain/finegrain-image-enhancer");
    const api = await client.view_api();
    console.log(JSON.stringify(api, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
