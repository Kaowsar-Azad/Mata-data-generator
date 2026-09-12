/**
 * Forward image to local Express proxy for background removal.
 * Uses Vite proxy in development (proxies /api to http://127.0.0.1:3001).
 * Set VITE_REMOVE_BG_PROXY in .env to override base URL.
 */
function getRemoveBgProxyBase() {
  const fromEnv = import.meta.env?.VITE_REMOVE_BG_PROXY;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).replace(/\/$/, '');
  // Directly communicate with active backend server to bypass internal Vite dev server proxy routing table anomalies on Windows
  // Use relative path to rely on Vite proxy to handle CORS
  return '';
}

/**
 * Local removal via Node server (no browser WASM — avoids Vite/ONNX issues).
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export async function removeBackgroundViaLocalServer(file) {
  // Bypass Electron IPC for local removal because ONNX runtime crashes Electron Main Process.
  // We will let it fallback to the external Node.js Express server running on port 3001.
  
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
      throw new Error("Unable to connect to the server (Failed to fetch). Please ensure that the backend server (node server/index.js) is running on port 3001 on your PC.");
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
