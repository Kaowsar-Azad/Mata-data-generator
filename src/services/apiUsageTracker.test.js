import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fingerprintApiKey,
  localDayKey,
  recordApiUsage,
  getUsageForKey,
  getRemainingRequestsEstimate,
  getDailyBudget,
  setDailyBudget,
  clearAllUsageStats,
  DEFAULT_DAILY_BUDGETS,
  API_USAGE_UPDATED_EVENT,
} from './apiUsageTracker.js';

// Ensure localStorage is fully mocked if not available or broken in the test environment
if (typeof localStorage === 'undefined' || !localStorage.clear) {
  let store = {};
  const mockLocalStorage = {
    clear: vi.fn(() => { store = {}; }),
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value ? value.toString() : ''; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
  };
  global.localStorage = mockLocalStorage;
  if (typeof window !== 'undefined') {
    window.localStorage = mockLocalStorage;
  }
}

describe('apiUsageTracker', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('fingerprintApiKey is stable for same input', () => {
    expect(fingerprintApiKey('abc')).toBe(fingerprintApiKey('abc'));
    expect(fingerprintApiKey('abc')).not.toBe(fingerprintApiKey('abd'));
  });

  it('recordApiUsage increments requests and tokens per day', () => {
    const key = 'test-key-xyz';
    recordApiUsage('gemini', key, { requests: 1, totalTokens: 100 });
    recordApiUsage('gemini', key, { requests: 1, totalTokens: 50 });
    const u = getUsageForKey('gemini', key);
    expect(u.requests).toBe(2);
    expect(u.tokens).toBe(150);
    expect(u.day).toBe(localDayKey());
  });

  it('getRemainingRequestsEstimate uses daily budget', () => {
    setDailyBudget('gemini', 5);
    const key = 'k1';
    recordApiUsage('gemini', key, { requests: 3, totalTokens: 0 });
    expect(getRemainingRequestsEstimate('gemini', key)).toBe(2);
    recordApiUsage('gemini', key, { requests: 2, totalTokens: 0 });
    expect(getRemainingRequestsEstimate('gemini', key)).toBe(0);
  });

  it('getDailyBudget falls back to defaults', () => {
    expect(getDailyBudget('gemini')).toBe(DEFAULT_DAILY_BUDGETS.gemini);
    setDailyBudget('groq', 1234);
    expect(getDailyBudget('groq')).toBe(1234);
  });

  it('clears usage but keeps budgets', () => {
    setDailyBudget('gemini', 99);
    recordApiUsage('gemini', 'key-a', { requests: 5, totalTokens: 10 });
    clearAllUsageStats();
    expect(getUsageForKey('gemini', 'key-a').requests).toBe(0);
    expect(getDailyBudget('gemini')).toBe(99);
  });

  it('dispatches API_USAGE_UPDATED_EVENT on record', () => {
    const spy = vi.fn();
    window.addEventListener(API_USAGE_UPDATED_EVENT, spy);
    recordApiUsage('gemini', 'k', { requests: 1, totalTokens: 1 });
    expect(spy).toHaveBeenCalled();
    window.removeEventListener(API_USAGE_UPDATED_EVENT, spy);
  });
});
