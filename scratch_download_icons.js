import fs from "fs";
import path from "path";

const icons = {
  upload: "https://cdn.lordicon.com/vduvxnvd.json",
  trash: "https://cdn.lordicon.com/gsqwyisp.json",
  check: "https://cdn.lordicon.com/yqzmzior.json",
  download: "https://cdn.lordicon.com/rnbrkypq.json"
};

async function downloadIcons() {
  const targetDir = path.join(process.cwd(), "src", "assets", "icons");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  for (const [name, url] of Object.entries(icons)) {
    try {
      console.log(`Downloading ${name} icon from ${url}...`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
      const data = await res.json();
      fs.writeFileSync(path.join(targetDir, `${name}.json`), JSON.stringify(data));
      console.log(`Saved ${name}.json successfully.`);
    } catch (err) {
      console.error(`Error downloading ${name}:`, err.message);
    }
  }
}

downloadIcons();
