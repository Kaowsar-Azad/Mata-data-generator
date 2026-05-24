/**
 * Secure Storage Service for Electron
 * Communicates with main process via IPC to safely store API keys
 */

const SERVICE_NAME = 'ImageMetadataPro';

// Check if we're in Electron environment dynamically to support unit test mocking
const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI;

/**
 * Save API key securely via IPC
 * @param {string} provider - Provider name (e.g., 'gemini', 'openai')
 * @param {string} key - API key to save
 * @param {number} index - Index of the key in the list
 */
export const saveKeySecurely = async (provider, key, index = 0) => {
  if (!isElectron()) {
    console.warn('Electron IPC not available, skipping secure storage');
    return;
  }

  try {
    await window.electronAPI.saveKey(provider, key, index);
    console.log(`✓ API key saved securely for ${provider}`);
  } catch (err) {
    console.error('Failed to save key securely:', err);
  }
};

/**
 * Retrieve API key securely via IPC
 * @param {string} provider - Provider name
 * @param {number} index - Index of the key
 */
export const getKeySecurely = async (provider, index = 0) => {
  if (!isElectron()) {
    console.warn('Electron IPC not available');
    return null;
  }

  try {
    const password = await window.electronAPI.getKey(provider, index);
    return password;
  } catch (err) {
    console.error('Failed to retrieve key:', err);
    return null;
  }
};

/**
 * Delete API key securely via IPC
 * @param {string} provider - Provider name
 * @param {number} index - Index of the key
 */
export const deleteKeySecurely = async (provider, index = 0) => {
  if (!isElectron()) {
    console.warn('Electron IPC not available');
    return false;
  }

  try {
    const deleted = await window.electronAPI.deleteKey(provider, index);
    if (deleted) {
      console.log(`✓ API key deleted securely for ${provider}`);
    }
    return deleted;
  } catch (err) {
    console.error('Failed to delete key:', err);
    return false;
  }
};

/**
 * Save all API keys securely via IPC
 * @param {object} allKeys - Object with keys by provider
 */
export const saveAllKeysSecurely = async (allKeys) => {
  if (!isElectron()) {
    console.warn('Electron IPC not available');
    return;
  }

  try {
    await window.electronAPI.saveAllKeys(allKeys);
  } catch (err) {
    console.error('Error saving all keys:', err);
  }
};

/**
 * Load all API keys from secure storage via IPC
 * @returns {object} All keys by provider
 */
export const loadAllKeysSecurely = async () => {
  if (!isElectron()) {
    console.warn('Electron IPC not available, returning empty keys');
    return {};
  }

  try {
    const allKeys = await window.electronAPI.loadAllKeys();
    return allKeys;
  } catch (err) {
    console.error('Error loading keys from secure storage:', err);
    return {};
  }
};


