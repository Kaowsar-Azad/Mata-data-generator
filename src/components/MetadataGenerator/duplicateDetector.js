export const DUPLICATE_THRESHOLD = 10;

export const computePHash = (src) =>
  new Promise((resolve) => {
    const SIZE = 8;
    const img = new Image();
    img.onload = () => {
      if (src && src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
        const grays = [];
        for (let i = 0; i < data.length; i += 4) {
          grays.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }
        const avg = grays.reduce((a, b) => a + b, 0) / grays.length;
        resolve(grays.map((g) => (g >= avg ? "1" : "0")).join(""));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      if (src && src.startsWith('blob:')) {
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
    if (entry.preview && !entry.preview.includes('placeholder')) {
      src = entry.preview;
    } else if (entry.visualFile) {
      src = URL.createObjectURL(entry.visualFile);
    } else if (entry.file && !entry.isEps && !entry.isVideo) {
      src = URL.createObjectURL(entry.file);
    }
    if (!src) return null;
    return await computePHash(src);
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
            similarity: Math.round((1 - dist / 64) * 100),
          });
        }
      }
    }
  }
  return pairs;
};
