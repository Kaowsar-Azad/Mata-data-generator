export const DUPLICATE_THRESHOLD = 5;

export const computePHash = (src, shouldRevoke = true) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (shouldRevoke && src && src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
      try {
        // 1. Difference Hash (dHash) - 9x8 grid, yields 64 bits
        const canvasD = document.createElement("canvas");
        canvasD.width = 9;
        canvasD.height = 8;
        const ctxD = canvasD.getContext("2d");
        ctxD.drawImage(img, 0, 0, 9, 8);
        const imgDataD = ctxD.getImageData(0, 0, 9, 8).data;

        const grays = [];
        for (let i = 0; i < imgDataD.length; i += 4) {
          grays.push(0.299 * imgDataD[i] + 0.587 * imgDataD[i + 1] + 0.114 * imgDataD[i + 2]);
        }

        let dHashStr = "";
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const left = grays[y * 9 + x];
            const right = grays[y * 9 + x + 1];
            dHashStr += left > right ? "1" : "0";
          }
        }

        // 2. Color Hash - 4x4 grid, extracts RGB averages, yields 48 bits (16 pixels * 3 channels)
        const canvasC = document.createElement("canvas");
        canvasC.width = 4;
        canvasC.height = 4;
        const ctxC = canvasC.getContext("2d");
        ctxC.drawImage(img, 0, 0, 4, 4);
        const imgDataC = ctxC.getImageData(0, 0, 4, 4).data;

        const rs = [], gs = [], bs = [];
        for (let i = 0; i < imgDataC.length; i += 4) {
          rs.push(imgDataC[i]);
          gs.push(imgDataC[i + 1]);
          bs.push(imgDataC[i + 2]);
        }

        const avgR = rs.reduce((a, b) => a + b, 0) / 16;
        const avgG = gs.reduce((a, b) => a + b, 0) / 16;
        const avgB = bs.reduce((a, b) => a + b, 0) / 16;

        let colorHashStr = "";
        for (let i = 0; i < 16; i++) {
          colorHashStr += rs[i] >= avgR ? "1" : "0";
          colorHashStr += gs[i] >= avgG ? "1" : "0";
          colorHashStr += bs[i] >= avgB ? "1" : "0";
        }

        // Combine both (112 bits)
        resolve(dHashStr + colorHashStr);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      if (shouldRevoke && src && src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
      resolve(null);
    };
    img.src = src;
  });

export const hammingDistance = (a, b) => {
  if (!a || !b || a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) dist++;
  return dist;
};

export const computeHashForEntry = async (entry) => {
  try {
    let src = null;
    let shouldRevoke = false;
    if (entry.preview && !entry.preview.includes('placeholder')) {
      src = entry.preview;
      shouldRevoke = false;
    } else if (entry.visualFile) {
      src = URL.createObjectURL(entry.visualFile);
      shouldRevoke = true;
    } else if (entry.file && !entry.isEps && !entry.isVideo) {
      src = URL.createObjectURL(entry.file);
      shouldRevoke = true;
    }
    if (!src) return null;
    return await computePHash(src, shouldRevoke);
  } catch {
    return null;
  }
};

export const detectDuplicates = (existingImages, newEntries, hashMap) => {
  const allEntries = [...existingImages, ...newEntries];
  const pairs = [];
  const seenPairs = new Set();
  for (let i = 0; i < allEntries.length; i++) {
    const hashA = hashMap[allEntries[i].id];
    if (!hashA) continue;
    for (let j = i + 1; j < allEntries.length; j++) {
      const hashB = hashMap[allEntries[j].id];
      if (!hashB) continue;
      const dist = hammingDistance(hashA, hashB);
      if (dist <= DUPLICATE_THRESHOLD) {
        const key = [allEntries[i].id, allEntries[j].id].sort().join('|');
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          pairs.push({
            id1: allEntries[i].id,
            name1: allEntries[i].file?.name || allEntries[i].renamedName || 'File 1',
            id2: allEntries[j].id,
            name2: allEntries[j].file?.name || allEntries[j].renamedName || 'File 2',
            similarity: Math.round((1 - dist / 112) * 100),
          });
        }
      }
    }
  }
  return pairs;
};
