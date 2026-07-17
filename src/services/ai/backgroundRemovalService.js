import { removeBackgroundViaLocalServer } from '../removeBgProxy.js';

/**
 * Removes the background from an image file/blob.
 * @param {Blob | File | HTMLImageElement} imageSource 
 * @param {function} onProgress - Callback for progress (0 to 1)
 * @returns {Promise<Blob>} Transparent PNG blob
 */
export async function removeImageBackground(imageSource, onProgress = null) {
  try {
    // Avoid running @imgly/background-removal inside Electron Renderer because
    // it detects Node.js and tries to load onnxruntime-node, which crashes (ABI mismatch).
    // Instead, delegate to the Node.js Express server running on port 3001.
    
    // Since the API doesn't support streaming progress yet, we'll fake it
    if (onProgress) onProgress(0.2);
    
    const imageBlob = await removeBackgroundViaLocalServer(imageSource);
    
    if (onProgress) onProgress(1.0);
    return imageBlob;
  } catch (error) {
    console.error('Failed to remove background:', error);
    throw error;
  }
}
