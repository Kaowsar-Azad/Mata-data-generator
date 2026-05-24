import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveKeySecurely,
  getKeySecurely,
  deleteKeySecurely,
  saveAllKeysSecurely,
  loadAllKeysSecurely
} from './secureStorage';

describe('Secure Storage Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Spy on console methods to avoid cluttering test output and verify warnings/errors
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up mock window.electronAPI if added
    if (typeof window !== 'undefined') {
      delete window.electronAPI;
    }
  });

  describe('Non-Electron Environment (Fallback)', () => {
    it('exports all required functions', () => {
      expect(typeof saveKeySecurely).toBe('function');
      expect(typeof getKeySecurely).toBe('function');
      expect(typeof deleteKeySecurely).toBe('function');
      expect(typeof saveAllKeysSecurely).toBe('function');
      expect(typeof loadAllKeysSecurely).toBe('function');
    });

    it('skips saveKeySecurely and logs warning gracefully', async () => {
      const result = await saveKeySecurely('gemini', 'test-key', 0);
      expect(result).toBeUndefined();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Electron IPC not available'));
    });

    it('returns null from getKeySecurely without throwing', async () => {
      const result = await getKeySecurely('gemini', 0);
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Electron IPC not available'));
    });

    it('returns false from deleteKeySecurely without throwing', async () => {
      const result = await deleteKeySecurely('gemini', 0);
      expect(result).toBe(false);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Electron IPC not available'));
    });

    it('skips saveAllKeysSecurely gracefully', async () => {
      const result = await saveAllKeysSecurely({ gemini: ['key1'] });
      expect(result).toBeUndefined();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Electron IPC not available'));
    });

    it('returns empty object from loadAllKeysSecurely gracefully', async () => {
      const result = await loadAllKeysSecurely();
      expect(result).toEqual({});
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Electron IPC not available'));
    });
  });

  describe('Electron Environment (Active IPC)', () => {
    let mockElectronAPI;

    beforeEach(() => {
      // Setup mock window.electronAPI
      mockElectronAPI = {
        saveKey: vi.fn().mockResolvedValue(true),
        getKey: vi.fn().mockResolvedValue('mock-secret-key'),
        deleteKey: vi.fn().mockResolvedValue(true),
        saveAllKeys: vi.fn().mockResolvedValue(true),
        loadAllKeys: vi.fn().mockResolvedValue({
          gemini: ['key1', 'key2'],
          groq: ['key3'],
          openrouter: [],
          openai: [],
          mistral: []
        })
      };
      window.electronAPI = mockElectronAPI;
    });

    it('invokes saveKey via IPC successfully', async () => {
      await saveKeySecurely('gemini', 'secret-key-123', 1);
      expect(mockElectronAPI.saveKey).toHaveBeenCalledWith('gemini', 'secret-key-123', 1);
      expect(console.log).toHaveBeenCalledWith('✓ API key saved securely for gemini');
    });

    it('handles saveKey IPC errors safely', async () => {
      mockElectronAPI.saveKey.mockRejectedValueOnce(new Error('IPC Error'));
      await saveKeySecurely('gemini', 'secret-key-123', 0);
      expect(console.error).toHaveBeenCalledWith('Failed to save key securely:', expect.any(Error));
    });

    it('retrieves key via IPC successfully', async () => {
      const key = await getKeySecurely('groq', 0);
      expect(mockElectronAPI.getKey).toHaveBeenCalledWith('groq', 0);
      expect(key).toBe('mock-secret-key');
    });

    it('returns null if getKey IPC throws an error', async () => {
      mockElectronAPI.getKey.mockRejectedValueOnce(new Error('Key not found'));
      const key = await getKeySecurely('groq', 0);
      expect(console.error).toHaveBeenCalledWith('Failed to retrieve key:', expect.any(Error));
      expect(key).toBeNull();
    });

    it('deletes key via IPC successfully', async () => {
      const result = await deleteKeySecurely('openai', 2);
      expect(mockElectronAPI.deleteKey).toHaveBeenCalledWith('openai', 2);
      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith('✓ API key deleted securely for openai');
    });

    it('returns false if deleteKey IPC fails or returns false', async () => {
      mockElectronAPI.deleteKey.mockResolvedValueOnce(false);
      const result = await deleteKeySecurely('openai', 0);
      expect(result).toBe(false);
    });

    it('returns false if deleteKey IPC throws an error', async () => {
      mockElectronAPI.deleteKey.mockRejectedValueOnce(new Error('Delete error'));
      const result = await deleteKeySecurely('openai', 0);
      expect(console.error).toHaveBeenCalledWith('Failed to delete key:', expect.any(Error));
      expect(result).toBe(false);
    });

    it('saves all keys via IPC successfully', async () => {
      const allKeys = { gemini: ['k1'], groq: ['k2'] };
      await saveAllKeysSecurely(allKeys);
      expect(mockElectronAPI.saveAllKeys).toHaveBeenCalledWith(allKeys);
    });

    it('handles saveAllKeys IPC error safely', async () => {
      mockElectronAPI.saveAllKeys.mockRejectedValueOnce(new Error('SaveAll error'));
      await saveAllKeysSecurely({});
      expect(console.error).toHaveBeenCalledWith('Error saving all keys:', expect.any(Error));
    });

    it('loads all keys via IPC successfully with expected structure', async () => {
      const result = await loadAllKeysSecurely();
      expect(mockElectronAPI.loadAllKeys).toHaveBeenCalled();
      expect(result).toHaveProperty('gemini', ['key1', 'key2']);
      expect(result).toHaveProperty('groq', ['key3']);
      expect(result).toHaveProperty('openrouter', []);
      expect(result).toHaveProperty('openai', []);
      expect(result).toHaveProperty('mistral', []);
    });

    it('returns empty object if loadAllKeys IPC throws an error', async () => {
      mockElectronAPI.loadAllKeys.mockRejectedValueOnce(new Error('LoadAll error'));
      const result = await loadAllKeysSecurely();
      expect(console.error).toHaveBeenCalledWith('Error loading keys from secure storage:', expect.any(Error));
      expect(result).toEqual({});
    });
  });
});

