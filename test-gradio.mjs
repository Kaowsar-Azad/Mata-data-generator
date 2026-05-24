import { Client } from '@gradio/client';

async function test() {
  try {
    console.log("Connecting...");
    const app = await Client.connect("briaai/BRIA-RMBG-1.4");
    console.log("Connected!");
  } catch (e) {
    console.error("Error:", e);
  }
}
test();
