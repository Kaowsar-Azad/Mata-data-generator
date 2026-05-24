export async function vectorizeImage(file, options = {}) {
  const formData = new FormData();
  formData.append('file', file);
  
  // Decide which endpoint to use
  const endpoint = options.useCloud ? '/api/vectorize-hf' : '/api/vectorize';
  
  if (options) {
    formData.append('options', JSON.stringify(options));
  }

  const response = await fetch(`http://127.0.0.1:3002${endpoint}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Vectorization failed' }));
    throw new Error(err.error || 'Vectorization failed');
  }

  return await response.blob();
}
