/**
 * Tracks successful API calls and token usage per key (fingerprinted).
 * Google does not expose exact remaining quota on API keys; we show usage
 * against a user-editable daily request budget plus token totals from responses.
 */

const STORAGE_USAGE = 'metadatapro_api_usage_v1';
const STORAGE_BUDGETS = 'metadatapro_api_daily_budget_v1';

export const API_USAGE_UPDATED_EVENT = 'metadatapro-api-usage';

/** Default daily request budgets (editable in UI). Not official Google caps. */
export const DEFAULT_DAILY_BUDGETS = {
  gemini: 1500,
  groq: 5000,
  openrouter: 500,
  openai: 500,
  mistral: 500,
};

function emitUsageUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(API_USAGE_UPDATED_EVENT));
  }
}

export function localDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Stable id for an API key without storing the raw key in the usage blob. */
export function fingerprintApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return 'fp_empty';
  let h = 5381;
  for (let i = 0; i < apiKey.length; i++) {
    h = ((h << 5) + h) ^ apiKey.charCodeAt(i);
  }
  return `fp_${(h >>> 0).toString(16)}`;
}

function loadRawUsage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_USAGE) || '{}');
  } catch {
    return {};
  }
}

function saveRawUsage(data) {
  localStorage.setItem(STORAGE_USAGE, JSON.stringify(data));
}

function loadBudgets() {
  try {
    return { ...DEFAULT_DAILY_BUDGETS, ...JSON.parse(localStorage.getItem(STORAGE_BUDGETS) || '{}') };
  } catch {
    return { ...DEFAULT_DAILY_BUDGETS };
  }
}

export function getDailyBudget(provider) {
  const b = loadBudgets();
  const n = Number(b[provider]);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAILY_BUDGETS[provider] ?? 500;
  return Math.floor(n);
}

export function setDailyBudget(provider, value) {
  const budgets = loadBudgets();
  const n = Math.max(1, Math.floor(Number(value) || 0));
  budgets[provider] = n;
  localStorage.setItem(STORAGE_BUDGETS, JSON.stringify(budgets));
  emitUsageUpdated();
}

/**
 * @param {string} provider
 * @param {string} apiKey
 * @param {{ totalTokens?: number, requests?: number }} [extra]
 */
export function recordApiUsage(provider, apiKey, extra = {}) {
  if (!apiKey || typeof apiKey !== 'string') return;
  const fp = fingerprintApiKey(apiKey);
  const day = localDayKey();
  const requests = Math.max(0, Math.floor(extra.requests ?? 1));
  const totalTokens = Math.max(0, Math.floor(extra.totalTokens ?? 0));

  const all = loadRawUsage();
  if (!all[provider]) all[provider] = {};

  let cur = all[provider][fp];
  if (!cur || cur.day !== day) {
    cur = { day, requests: 0, tokens: 0 };
  }
  cur.requests += requests;
  cur.tokens += totalTokens;
  all[provider][fp] = cur;
  saveRawUsage(all);
  emitUsageUpdated();
}

export function getUsageForKey(provider, apiKey) {
  const fp = fingerprintApiKey(apiKey);
  const day = localDayKey();
  const cur = loadRawUsage()[provider]?.[fp];
  if (!cur || cur.day !== day) {
    return { requests: 0, tokens: 0, day };
  }
  return { requests: cur.requests, tokens: cur.tokens, day };
}

export function getRemainingRequestsEstimate(provider, apiKey) {
  const budget = getDailyBudget(provider);
  const { requests } = getUsageForKey(provider, apiKey);
  return Math.max(0, budget - requests);
}

/** Dev / support: clear all stored usage (not budgets). */
export function clearAllUsageStats() {
  localStorage.removeItem(STORAGE_USAGE);
  emitUsageUpdated();
}
