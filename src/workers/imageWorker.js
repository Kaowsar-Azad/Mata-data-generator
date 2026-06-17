self.onmessage = async (e) => {
  const { file, maxSize, id } = e.data;
  
  try {
    const bitmap = await createImageBitmap(file);
    let width = bitmap.width;
    let height = bitmap.height;
    
    if (width > height) {
      if (width > maxSize) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      }
    } else {
      if (height > maxSize) {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
    }
    
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);
    
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    
    const reader = new FileReader();
    reader.onload = () => {
      self.postMessage({ id, success: true, dataUrl: reader.result });
    };
    reader.onerror = (err) => {
      self.postMessage({ id, success: false, error: "Failed to read blob" });
    };
    reader.readAsDataURL(blob);
  } catch (error) {
    self.postMessage({ id, success: false, error: error.message || String(error) });
  }
};
