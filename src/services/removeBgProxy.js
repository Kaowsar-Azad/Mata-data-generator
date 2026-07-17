/**
 * Forward image to local Express proxy, which calls remove.bg (no browser CORS).
 * Uses Vite proxy in development (proxies /api to http://127.0.0.1:3001).
 * Set VITE_REMOVE_BG_PROXY in .env to override base URL.
 */
export function getRemoveBgProxyBase() {
  const fromEnv = import.meta.env?.VITE_REMOVE_BG_PROXY;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).replace(/\/$/, '');
  // Directly communicate with active backend server to bypass internal Vite dev server proxy routing table anomalies on Windows
  // Use relative path to rely on Vite proxy to handle CORS
  return '';
}

/**
 * @param {File} file
 * @param {string} apiKey remove.bg API key
 * @returns {Promise<Blob>} PNG with transparency
 */
export async function removeBackgroundViaRemoveBgProxy(file, apiKey) {
  if (window.electronAPI && window.electronAPI.removeBgApi) {
    console.log('[removeBg] Running in Electron. Using Native IPC removeBgApi...');
    if (!file.path) {
      throw new Error("File path is missing. Drag and drop the file directly.");
    }
    const res = await window.electronAPI.removeBgApi(file.path, apiKey);
    if (!res.success) {
      throw new Error(res.error || "API background removal failed in Electron");
    }
    const byteString = atob(res.base64);
    const ab = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      ab[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: res.mimeType || 'image/png' });
  }

  const base = getRemoveBgProxyBase();
  const fd = new FormData();
  fd.append('file', file, file.name || 'upload.png');

  let res;
  try {
    res = await fetch(`${base}/api/removebg`, {
      method: 'POST',
      headers: { 'X-Removebg-Key': apiKey },
      body: fd,
    });
  } catch (err) {
    if (err?.message?.includes('Failed to fetch')) {
      throw new Error("সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না (Failed to fetch)। অনুগ্রহ করে নিশ্চিত করুন যে আপনার PC-তে ব্যাকএন্ড সার্ভারটি (node server/index.js) পোর্ট 3001-এ চালু আছে।");
    }
    throw err;
  }

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch {
      try {
        msg = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }

  return res.blob();
}

/**
 * Local removal via Node server (no browser WASM — avoids Vite/ONNX issues).
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export async function removeBackgroundViaLocalServer(file) {
  // Bypass Electron IPC for local removal because ONNX runtime crashes Electron Main Process.
  // We will let it fallback to the external Node.js Express server running on port 3001.
  /*
  if (window.electronAPI && window.electronAPI.removeBgLocal) {
    console.log('[removeBg] Running in Electron. Using Native IPC removeBgLocal...');
    if (!file.path) {
      throw new Error("File path is missing. Drag and drop the file directly.");
    }
    const res = await window.electronAPI.removeBgLocal(file.path);
    if (!res.success) {
      throw new Error(res.error || "Local background removal failed in Electron");
    }
    const byteString = atob(res.base64);
    const ab = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      ab[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: res.mimeType || 'image/png' });
  }
  */


  const base = getRemoveBgProxyBase();
  const fd = new FormData();
  fd.append('file', file, file.name || 'upload.png');

  let res;
  try {
    res = await fetch(`${base}/api/remove-bg-local`, {
      method: 'POST',
      body: fd,
    });
  } catch (err) {
    if (err?.message?.includes('Failed to fetch')) {
      throw new Error("সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না (Failed to fetch)। অনুগ্রহ করে নিশ্চিত করুন যে আপনার PC-তে ব্যাকএন্ড সার্ভারটি (node server/index.js) পোর্ট 3001-এ চালু আছে।");
    }
    throw err;
  }

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch {
      try {
        msg = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }

  return res.blob();
}

