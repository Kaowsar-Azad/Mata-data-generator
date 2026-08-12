import { fetchGemini, buildGeminiPrompt } from "./apis/gemini.js";
import { fetchMistral, buildMistralPrompt } from "./apis/mistral.js";

import { fetchOpenAI, buildOpenAIPrompt } from "./apis/openai.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { recordApiUsage } from "./apiUsageTracker.js";
/**
 * Super Robust Gemini Service with Multi-Version and Multi-Model fallbacks
 * Supports both raster images and EPS files (via extracted/placeholder previews)
 */


import trademarkData from "./trademarks.json";

const BRAND_REPLACEMENTS = trademarkData.brandReplacements;
const FORBIDDEN_BRANDS = trademarkData.forbiddenBrands;

const COMMON_SPELLING_CORRECTIONS = {
  "autum": "autumn",
  "beautifull": "beautiful",
  "bussiness": "business",
  "busines": "business",
  "comming": "coming",
  "exoticue": "exotic",
  "flawles": "flawless",
  "happines": "happiness",
  "traveling": "travelling",
  "restuarant": "restaurant",
  "restrant": "restaurant",
  "accomodation": "accommodation",
  "calender": "calendar",
  "goverment": "government",
  "enviornment": "environment",
  "photograpy": "photography",
  "photograper": "photographer",
  "vecter": "vector",
  "ilustration": "illustration",
  "backgrounds": "background"
};

function sanitizeText(text) {
  if (!text) return text;
  let sanitized = text;
  
  // Replace specific product names with generic terms (handles singular and plural)
  for (const [brand, replacement] of Object.entries(BRAND_REPLACEMENTS)) {
    // Replace singular
    let regex = new RegExp(`\\b${brand}\\b`, 'gi');
    sanitized = sanitized.replace(regex, replacement);
    
    // Replace plural (e.g. iphones, nikes, etc.)
    let pluralBrand = brand;
    let pluralReplacement = replacement;
    
    if (brand.endsWith('y')) {
      pluralBrand = brand.slice(0, -1) + 'ies';
    } else if (brand.endsWith('s') || brand.endsWith('x') || brand.endsWith('ch') || brand.endsWith('sh')) {
      pluralBrand = brand + 'es';
    } else {
      pluralBrand = brand + 's';
    }
    
    if (replacement.endsWith('y')) {
      pluralReplacement = replacement.slice(0, -1) + 'ies';
    } else if (replacement.endsWith('s') || replacement.endsWith('x') || replacement.endsWith('ch') || replacement.endsWith('sh')) {
      pluralReplacement = replacement + 'es';
    } else {
      pluralReplacement = replacement + 's';
    }
    
    regex = new RegExp(`\\b${pluralBrand}\\b`, 'gi');
    sanitized = sanitized.replace(regex, pluralReplacement);
  }

  // Remove other forbidden brands entirely (handles singular and plural)
  for (const brand of FORBIDDEN_BRANDS) {
    // Remove singular
    let regex = new RegExp(`\\b${brand}\\b`, 'gi');
    sanitized = sanitized.replace(regex, '');
    
    // Remove plural
    let pluralBrand = brand;
    if (brand.endsWith('y')) {
      pluralBrand = brand.slice(0, -1) + 'ies';
    } else if (brand.endsWith('s') || brand.endsWith('x') || brand.endsWith('ch') || brand.endsWith('sh')) {
      pluralBrand = brand + 'es';
    } else {
      pluralBrand = brand + 's';
    }
    regex = new RegExp(`\\b${pluralBrand}\\b`, 'gi');
    sanitized = sanitized.replace(regex, '');
  }

  // Clean up double spaces and isolated punctuation
  sanitized = sanitized.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!])/g, '$1').trim();
  return sanitized;
}

function cleanAndCorrectKeywords(keywordsStr, title, description) {
  if (!keywordsStr) return keywordsStr;
  
  const textContext = ((title || "") + " " + (description || "")).toLowerCase();
  
  // Detect singular vs plural context for humans
  const isSingularHuman = /\b(a|an|one|single|individual)\s+(person|man|woman|child|kid|boy|girl|model|worker|businessman|businesswoman|photographer|artist|teacher|student|doctor|nurse|player|gamer)\b/i.test(textContext) 
    || /\b(portrait of a|photo of a|close up of a)\b/i.test(textContext);
    
  const isPluralHuman = /\b(people|women|men|children|kids|boys|girls|group|couple|family|friends|team|workers|businessmen|businesswomen|students|doctors|nurses|players|gamers)\b/i.test(textContext)
    || /\b(two|three|four|five|several|many|group of|crowd of)\b/i.test(textContext);

  let kws = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
  let cleanedKws = [];

  for (let kw of kws) {
    let kwLower = kw.toLowerCase();
    
    // 1. Spell Correction
    if (COMMON_SPELLING_CORRECTIONS[kwLower]) {
      kw = COMMON_SPELLING_CORRECTIONS[kwLower];
      kwLower = kw.toLowerCase();
    }
    
    // 2. Singular/Plural human correction
    if (isSingularHuman && !isPluralHuman) {
      if (kwLower === "women") kw = "woman";
      else if (kwLower === "men") kw = "man";
      else if (kwLower === "children" || kwLower === "kids") kw = "child";
      else if (kwLower === "people") kw = "person";
    } else if (isPluralHuman && !isSingularHuman) {
      if (kwLower === "woman") kw = "women";
      else if (kwLower === "man") kw = "men";
      else if (kwLower === "child") kw = "children";
      else if (kwLower === "person") kw = "people";
    }
    
    cleanedKws.push(kw);
  }

  // Deduplicate case-insensitively
  const seen = new Set();
  const deduped = [];
  for (const kw of cleanedKws) {
    const key = kw.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(kw);
    }
  }

  return deduped.join(', ');
}

function extractJson(str) {
  const firstBrace = str.indexOf('{');
  if (firstBrace === -1) return null;
  
  let braceCount = 0;
  let inString = false;
  let escape = false;
  
  for (let i = firstBrace; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return str.substring(firstBrace, i + 1);
        }
      }
    }
  }
  return null;
}

/**
 * Normalize and unwrap metadata object regardless of AI model key casing, structure, or array formats.
 */
function normalizeMetadataObject(raw) {
  if (!raw || typeof raw !== 'object') return {};

  let data = raw;
  if (data.metadata && typeof data.metadata === 'object') data = data.metadata;
  else if (data.data && typeof data.data === 'object') data = data.data;
  else if (data.result && typeof data.result === 'object') data = data.result;
  else if (data.response && typeof data.response === 'object') data = data.response;
  else if (data.output && typeof data.output === 'object') data = data.output;

  const getField = (...keys) => {
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null) return data[k];
      const matchKey = Object.keys(data).find(dk => dk.toLowerCase() === k.toLowerCase());
      if (matchKey && data[matchKey] !== undefined && data[matchKey] !== null) return data[matchKey];
    }
    return undefined;
  };

  let title = getField('title', 'headline', 'caption', 'name', 'image_title', 'prompt') || '';
  let description = getField('description', 'desc', 'summary', 'details', 'visual_description') || '';
  let keywordsRaw = getField('keywords', 'tags', 'keyword_list', 'key_words', 'tag_list') || '';
  let categories = getField('categories', 'category') || [];
  let keywordScores = getField('keywordScores', 'keyword_scores', 'scores', 'keywords_scores') || {};
  let policyWarning = getField('policyWarning', 'policy_warning', 'warning', 'violation') || null;

  if (Array.isArray(keywordsRaw)) {
    keywordsRaw = keywordsRaw.filter(Boolean).map(k => String(k).trim()).join(', ');
  } else {
    keywordsRaw = String(keywordsRaw || '').trim();
  }

  if (typeof categories === 'string') {
    categories = categories.split(',').map(c => c.trim()).filter(Boolean);
  } else if (!Array.isArray(categories)) {
    categories = categories ? [String(categories)] : [];
  }

  return {
    ...data,
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    keywords: keywordsRaw,
    categories,
    keywordScores: typeof keywordScores === 'object' && keywordScores !== null ? keywordScores : {},
    policyWarning: policyWarning ? String(policyWarning) : null,
    commercialConcept: getField('commercialConcept', 'commercial_concept') || data.commercialConcept,
    subjectClarity: getField('subjectClarity', 'subject_clarity') || data.subjectClarity,
    technicalQuality: getField('technicalQuality', 'technical_quality') || data.technicalQuality,
    marketDemand: getField('marketDemand', 'market_demand') || data.marketDemand,
    scoreReason: getField('scoreReason', 'score_reason') || data.scoreReason,
  };
}

/**
 * Post-process metadata result by applying user settings (prefix, suffix, negative words).
 */
function postProcessMetadata(metadata, promptSettings, fileInfo = {}) {
  const s = promptSettings || {};
  let result = normalizeMetadataObject(metadata);
  let remainingNeeds;

  // Title fallback if completely empty
  if (!result.title || !result.title.trim()) {
    let cleanName = (fileInfo.fileName || "digital asset").replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
    if (/^[a-f0-9]{20,}$/i.test(cleanName) || cleanName.length < 3) cleanName = "abstract creative 3D render";
    result.title = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  }

  // Description fallback if completely empty
  if (!result.description || !result.description.trim()) {
    result.description = `${result.title}. High quality creative digital asset designed for commercial stock media projects.`;
  }

  // --- Deterministic Selling Score Calculation ---
  let sellingScore = 0;
  if (result.commercialConcept || result.subjectClarity || result.technicalQuality || result.marketDemand) {
    const conceptMap = { evergreen: 32, popular: 25, niche: 15, none: 5 };
    const clarityMap = { perfect: 23, clear: 18, cluttered: 10, confusing: 3 };
    const qualityMap = { professional: 23, good: 18, acceptable: 10, poor: 3 };
    const demandMap = { high: 14, evergreen: 9, low: 4, none: 1 };

    const conceptVal = String(result.commercialConcept || '').toLowerCase().trim();
    const clarityVal = String(result.subjectClarity || '').toLowerCase().trim();
    const qualityVal = String(result.technicalQuality || '').toLowerCase().trim();
    const demandVal = String(result.marketDemand || '').toLowerCase().trim();

    sellingScore += conceptMap[conceptVal] || conceptMap.popular;
    sellingScore += clarityMap[clarityVal] || clarityMap.clear;
    sellingScore += qualityMap[qualityVal] || qualityMap.good;
    sellingScore += demandMap[demandVal] || demandMap.evergreen;

    result.sellingScore = sellingScore;
  } else if (result.sellingScore !== undefined) {
    result.sellingScore = Number(result.sellingScore) || 60;
  } else {
    result.sellingScore = 60;
  }

  // --- BRAND & TRADEMARK SAFETY SCANNER ---
  if (result.title) result.title = sanitizeText(result.title);
  if (result.description) result.description = sanitizeText(result.description);
  if (result.keywords) {
    let rawKws = "";
    if (Array.isArray(result.keywords)) {
      rawKws = result.keywords.join(', ');
    } else if (typeof result.keywords === 'string') {
      rawKws = result.keywords;
    } else {
      rawKws = String(result.keywords);
    }
    let sanitizedKws = rawKws.split(',')
      .map(k => sanitizeText(k.trim()))
      .filter(k => k.length > 0)
      .join(', ');
      
    // Apply spelling correction and singular-plural corrections
    result.keywords = cleanAndCorrectKeywords(sanitizedKws, result.title, result.description);
  }
  
  // Map scores to keywords if AI returned a flat array or a comma-separated string (e.g., Groq token optimization)
  if (result.keywords && result.keywordScores) {
    let scoreNumbers = [];
    if (typeof result.keywordScores === 'string') {
      const matches = result.keywordScores.match(/\b\d+\b/g);
      if (matches) {
        scoreNumbers = matches.map(n => Math.min(100, Math.max(1, parseInt(n, 10))));
      }
    } else if (Array.isArray(result.keywordScores)) {
      scoreNumbers = result.keywordScores
        .map(s => {
          if (typeof s === 'number') return s;
          if (typeof s === 'string') {
            const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
            return isNaN(n) ? null : n;
          }
          return null;
        })
        .filter(n => n !== null);
    }

    if (scoreNumbers.length > 0) {
      const mappedScores = {};
      const keys = result.keywords.split(',').map(k => k.trim()).filter(Boolean);
      keys.forEach((key, index) => {
        if (scoreNumbers[index] !== undefined) {
          mappedScores[key] = scoreNumbers[index];
        }
      });
      if (Object.keys(mappedScores).length > 0) {
        result.keywordScores = mappedScores;
      }
    }
  }
  // ----------------------------------------

  // Enforce title max chars and words based on Xpiks/Adobe Stock best practices
  let title = result.title || "";
  let maxTitle = s.titleMaxChars || 150;
  if (maxTitle > 150) maxTitle = 150;
  
  // Truncate the AI generated title FIRST so we leave room for prefix/suffix
  if (title.length > maxTitle) {
    title = title.substring(0, maxTitle).replace(/\s+\S*$/, "");
  }
  
  // Enforce max 25 words to prevent "Title has too many words" warning
  const words = title.split(/\s+/);
  if (words.length > 25) {
    title = words.slice(0, 25).join(' ');
  }

  // Apply prefix/suffix AFTER truncation so they don't get chopped off
  if (s.prefixEnabled && s.prefixText && s.prefixText.trim()) {
    title = `${s.prefixText.trim()} ${title}`;
  }
  if (s.suffixEnabled && s.suffixText && s.suffixText.trim()) {
    title = `${title} ${s.suffixText.trim()}`;
  }
  
  // Enforce minimum title length (apply to the fully constructed title)
  if (s.titleMinChars && title.length < s.titleMinChars) {
    title = title.padEnd(s.titleMinChars, ' ');
  }
  result.title = title;

  // Enforce description max chars
  if (s.descMaxChars && result.description && result.description.length > s.descMaxChars) {
    result.description = result.description.substring(0, s.descMaxChars).replace(/\s+\S*$/, "").replace(/[\s.,;:!]+$/, "") + ".";
  }
  // Enforce minimum description length
  if (s.descMinChars && result.description && result.description.length < s.descMinChars) {
    result.description = result.description.padEnd(s.descMinChars, ' ');
  }

  // Remove negative keywords and STRICTLY enforce count
  if (result.keywords) {
    const rawKws = result.keywords.split(",").map(k => k.trim()).filter(Boolean);
    const banned = s.negKeywordsEnabled && s.negKeywords && s.negKeywords.trim()
      ? s.negKeywords.split(",").map(w => w.trim().toLowerCase()).filter(Boolean)
      : [];

    const hasHumanSubject = /\b(person|people|man|woman|child|kid|boy|girl|group|family|couple|model|friend|friends|worker|businessman|businesswoman|photographer|artist|teacher|student|doctor|nurse|player|gamer)\b/i.test((result.title || "") + " " + (result.description || ""));
    const abstractJunk = new Set(["fun", "leisure", "recreation", "hobby", "relaxation", "enjoyment", "lifestyle", "play", "interests", "pastime", "pleasure", "activity", "activities"]);

    const seenRoots = new Set();
    const rootCounts = {};
    
    let kws = [];
    let safeFallbackKws = [];
    let multiWordKwsToSplit = [];

    for (const kw of rawKws) {
      const kl = kw.toLowerCase().trim();

      // 1. Hard rejection: empty, length < 2, banned, or generic junk words
      const isEpsAsset = Boolean(fileInfo?.isEps || (fileInfo?.fileName && /\.(eps|epsf|epsi)$/i.test(fileInfo.fileName)));
      const hardJunk = new Set(isEpsAsset
        ? ["image", "photo", "picture", "file", "thing", "item", "nice", "great", "good", "look", "use"]
        : ["image", "photo", "picture", "file", "graphic", "visual", "element", "object", "thing", "item", "nice", "great", "good", "look", "use"]
      );
      if (kl.length < 2 || banned.includes(kl) || hardJunk.has(kl) || /^(a|an|the|and|or|of|in|on|at|to|for|with|by)$/i.test(kl)) {
        continue;
      }

      // 1b. Hard rejection: pure numbers, timestamps, or hash-like strings (e.g. 202606082234, c35f75d7)
      if (/^\d+$/.test(kl)) continue;                        // purely numeric (timestamps, IDs)
      if (/^[a-f0-9]{8,}$/i.test(kl)) continue;              // hex hash strings
      if (/^\d{4,}\w*$/.test(kl) && kl.length >= 8) continue;// date-prefixed strings like 20260608abcd

      // 2. Camera specs / technical spam: hard rejection
      if (/\b(dslr|4k|8k|camera|megapixels|mp|resolution|fps|lens|shutter|iso|aperture|slr|sensor|photographs|photographed|shoot|shooting|frame)\b/i.test(kl)) {
        continue;
      }

      // 3. Word count filtering: check if user requested single-word keywords only
      const wordCount = kl.split(/\s+/).length;
      if (s.singleWordKeywords && wordCount > 1) {
        multiWordKwsToSplit.push(kw);
        continue; // STRICT: Single-word only, reject phrases
      }
      if (wordCount >= 3) {
        continue; // Max 2 words (no spammy long phrases)
      }

      // Check abstract junk filter
      const isAbstractJunk = !hasHumanSubject && abstractJunk.has(kl);
      
      // Check root duplicate filter
      const root = kl.replace(/s$/, '').replace(/ing$/, '').replace(/ed$/, '');
      const isRootDuplicate = seenRoots.has(root);
      
      // Check anti-stuffing filter
      let isStuffed = false;
      const wordsInKw = kl.split(/\s+/);
      for (const w of wordsInKw) {
        if (w.length < 3) continue;
        const r = w.replace(/s$/, '').replace(/ing$/, '').replace(/ed$/, '');
        if ((rootCounts[r] || 0) >= 3) {
          isStuffed = true;
          break;
        }
      }

      if (isAbstractJunk || isRootDuplicate || isStuffed) {
        // Safe fallback keyword
        safeFallbackKws.push(kw);
      } else {
        // Accepted keyword
        kws.push(kw);
        seenRoots.add(root);
        for (const w of wordsInKw) {
          if (w.length < 3) continue;
          const r = w.replace(/s$/, '').replace(/ing$/, '').replace(/ed$/, '');
          rootCounts[r] = (rootCounts[r] || 0) + 1;
        }
      }
    }

    // Quality scoring
    const getKeywordScore = (keyword) => {
      const kl = keyword.toLowerCase().trim();
      
      if (result.keywordScores) {
        let scoresObj = result.keywordScores;
        if (Array.isArray(scoresObj)) {
          scoresObj = scoresObj.reduce((acc, curr) => {
             if (typeof curr === 'object' && curr !== null) {
                if (curr.keyword && curr.score !== undefined) {
                   acc[curr.keyword] = curr.score;
                } else {
                   Object.assign(acc, curr);
                }
             }
             return acc;
          }, {});
        }

        let scoreKey = Object.keys(scoresObj).find(
          k => k.toLowerCase().trim() === kl
        );
        
        // Substring match for single-word splits (e.g. finding "gas" in "gas giant")
        if (!scoreKey) {
           scoreKey = Object.keys(scoresObj).find(
             k => k.toLowerCase().split(/[\s,]+/).includes(kl)
           );
        }

        if (scoreKey !== undefined) {
          const exactScore = scoresObj[scoreKey];
          if (exactScore !== undefined && exactScore !== null) {
            const numScore = typeof exactScore === 'object' && exactScore.score !== undefined ? Number(exactScore.score) : Number(exactScore);
            if (!isNaN(numScore)) return numScore;
          }
        }
      }

      // Fallback if AI didn't score it (e.g., padded keywords from title/desc)
      const junk = new Set(isEpsAsset
        ? ["image", "photo", "picture", "file", "thing", "item", "nice", "great", "good", "look", "use"]
        : ["design", "image", "photo", "picture", "file", "graphic", "visual", "element", "object", "thing", "item", "nice", "great", "good", "look", "use"]
      );
      if (junk.has(kl) || kl.length < 3) return -1;
      
      return -1; // Missing score
    };

    // Sort both arrays by score (descending)
    kws.sort((a, b) => getKeywordScore(b) - getKeywordScore(a));
    safeFallbackKws.sort((a, b) => getKeywordScore(b) - getKeywordScore(a));

    // Keep all valid keywords across all relevance tiers (1-100)
    let finalKws = kws.filter(k => getKeywordScore(k) >= 1);
    
    // If some keywords had missing score (-1) but are valid non-junk keywords, keep them too
    if (finalKws.length < kws.length) {
      const unscored = kws.filter(k => getKeywordScore(k) < 1);
      finalKws.push(...unscored);
    }
    
    if (s.keywordCount) {
      // Fallback 1: If singleWordKeywords is active, split multi-word keywords into individual words
      remainingNeeds = s.keywordCount - finalKws.length;
      if (remainingNeeds > 0 && s.singleWordKeywords && multiWordKwsToSplit.length > 0) {
        const hardJunk = new Set(isEpsAsset
          ? ["image", "photo", "picture", "file", "thing", "item", "nice", "great", "good", "look", "use"]
          : ["image", "photo", "picture", "file", "graphic", "visual", "element", "object", "thing", "item", "nice", "great", "good", "look", "use"]
        );
        let splitWords = [];
        for (const phrase of multiWordKwsToSplit) {
          const words = phrase.split(/\s+/);
          for (const w of words) {
            const wl = w.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
            if (wl.length >= 2 && !banned.includes(wl) && !hardJunk.has(wl) && !/^(the|and|for|with|this|that|from|have|has|are|was|were|you|your)$/.test(wl)) {
              splitWords.push(w);
            }
          }
        }
        const uniqueSplitWords = [...new Set(splitWords)].filter(w => !finalKws.includes(w));
        uniqueSplitWords.sort((a, b) => getKeywordScore(b) - getKeywordScore(a));
        finalKws.push(...uniqueSplitWords.slice(0, remainingNeeds));
      }

      // Fallback 2: Use safeFallbackKws
      remainingNeeds = s.keywordCount - finalKws.length;
      if (remainingNeeds > 0 && safeFallbackKws.length > 0) {
        const uniqueSafeFallback = safeFallbackKws.filter(w => !finalKws.includes(w));
        finalKws.push(...uniqueSafeFallback.slice(0, remainingNeeds));
      }

      // Fallback 3: Extract words from title and description
      remainingNeeds = s.keywordCount - finalKws.length;
      if (remainingNeeds > 0) {
        const titleDescWords = ((result.title || "") + " " + (result.description || ""))
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter(w => w.length >= 3 && !/^(the|and|for|with|this|that|from|have|has|are|was|were|you|your)$/.test(w));
        
        const uniqueExtra = [...new Set(titleDescWords)]
          .filter(w => !finalKws.includes(w));
        finalKws.push(...uniqueExtra.slice(0, remainingNeeds));
      }

      kws = finalKws.slice(0, s.keywordCount);
    } else {
      kws = finalKws;
    }

    // Safety guard: If for any reason kws is empty, fallback to rawKws
    if (kws.length === 0 && rawKws.length > 0) {
      kws = rawKws.slice(0, s.keywordCount || 49);
    }

    // Final strict sort by score (descending) to ensure Green >= 70 comes before Yellow >= 30, then Red < 30
    kws.sort((a, b) => getKeywordScore(b) - getKeywordScore(a));
    result.keywords = kws.join(", ");
  }

  // Final validation guard: Ensure keywords is never undefined or empty
  if (!result.keywords || !result.keywords.trim()) {
    const fallbackWords = ((result.title || "") + " " + (result.description || ""))
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !/^(the|and|for|with|this|that|from|have|has|are|was|were|you|your)$/.test(w));
    result.keywords = [...new Set(fallbackWords)].slice(0, s.keywordCount || 49).join(", ");
  }

  // Ensure all final keywords have defined valid scores in keywordScores
  if (result.keywords) {
    if (!result.keywordScores || typeof result.keywordScores !== 'object' || Array.isArray(result.keywordScores)) {
      result.keywordScores = {};
    }
    const finalKeyList = result.keywords.split(',').map(k => k.trim()).filter(Boolean);
    finalKeyList.forEach((k, idx) => {
      if (result.keywordScores[k] === undefined || result.keywordScores[k] === null || isNaN(Number(result.keywordScores[k]))) {
        // Natural distribution based on keyword ranking order (Top = Green, Mid = Yellow, Lower = Red)
        if (idx < 15) {
          result.keywordScores[k] = Math.max(70, Math.round(95 - (idx * 1.6)));
        } else if (idx < 35) {
          result.keywordScores[k] = Math.max(30, Math.round(68 - ((idx - 15) * 1.8)));
        } else {
          result.keywordScores[k] = Math.max(5, Math.round(28 - ((idx - 35) * 1.5)));
        }
      }
    });
  }

  return result;
}

let globalKeyIndex = 0;
const modelsToTry = ["gemini-1.5-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"];

/**
 * Helper to run content generation with a strict timeout (default 45 seconds).
 */
async function generateContentWithTimeout(model, contentParts, timeoutMs = 90000) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    const sec = Math.round(timeoutMs / 1000);
    timeoutId = setTimeout(() => reject(new Error(`Model request timed out (${sec}s). Google API is taking too long.`)), timeoutMs);
  });

  const executeRequest = async () => {
    // NOTE: Do NOT pass {timeout} as a second argument – it is not supported by
    // the @google/generative-ai SDK and causes the request to silently hang.
    const res = await model.generateContent(contentParts);
    // res.response is a plain property (not a Promise); access it directly.
    return res.response;
  };

  try {
    const response = await Promise.race([
      executeRequest(),
      timeoutPromise
    ]);
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate metadata for an image or EPS file.
 *
 * @param {string}  imageBuffer  - Base64-encoded image data (PNG/JPEG preview)
 * @param {string}  mimeType     - MIME type of the image buffer (always image/png or image/jpeg)
 * @param {string[]} apiKeys     - Array of Gemini API keys to try
 * @param {object}  [fileInfo]   - Extra context about the original file
 * @param {boolean} [fileInfo.isEps]         - Source was EPS
 * @param {boolean} [fileInfo.isPlaceholder] - Preview is a generated placeholder
 * @param {string}  [fileInfo.fileName]      - Original file name

/**
 * Main function to orchestrate Gemini or OpenAI-compatible generation.
 *
 * @param {string} imageBuffer           - Base64 string of the image
 * @param {string} mimeType              - Mime type of the image
 * @param {Array<string>} apiKeys        - Array of API keys
 * @param {string} apiProvider           - ID of the AI provider
 * @param {object} fileInfo              - Context info
 */
export async function generateMetadata(imageBuffer, mimeType, apiKeys, apiProvider = "gemini", fileInfo = {}) {
  const { isEps = false, isPlaceholder = false, isVideo = false, fileName = "file", extractedTextContext = null, promptSettings = {} } = fileInfo;

  let lastError = null;
  let globalKeyHitRateLimit = false;

  if (!apiKeys || apiKeys.length === 0) {
    const pName = Array.isArray(apiProvider) ? apiProvider.join(", ") : apiProvider;
    throw new Error(`No API keys found for provider "${pName}". Please add a key in Settings.`);
  }

  
  // Atomically claim the current key index and immediately advance globalKeyIndex
  // so concurrent calls receive distinct API keys!
  const startKeyIndex = globalKeyIndex;
  if (apiKeys && apiKeys.length > 0) {
    globalKeyIndex = (globalKeyIndex + 1) % apiKeys.length;
  }

  // Try each API key precisely once for this specific file request if needed
  for (let k = 0; k < apiKeys.length; k++) {
    const currentKeyIndex = (startKeyIndex + k) % apiKeys.length;
    const keyItem = apiKeys[currentKeyIndex];
    
    // Support both new {provider, key} object format and legacy string format
    let currentProvider = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
    if (Array.isArray(currentProvider)) currentProvider = currentProvider[0] || 'gemini';
    const apiKey = typeof keyItem === 'object' ? keyItem.key : keyItem;

    // Branch to OpenAI compatible providers if not Gemini
    if (currentProvider !== "gemini") {
      try {
        console.log(`[Attempt] Provider: ${currentProvider} using key index ${currentKeyIndex}`);
        let parsed;
        if (currentProvider === "openai") {
          const prompt = buildOpenAIPrompt(fileInfo);
          parsed = await fetchOpenAI(apiKey, prompt, imageBuffer, mimeType, true, promptSettings);
        } else if (currentProvider === "mistral") {
          const prompt = buildMistralPrompt(fileInfo);
          parsed = await fetchMistral(apiKey, prompt, imageBuffer, mimeType, true, promptSettings);
        } else {
          throw new Error("Unknown provider: " + currentProvider);
        }
        
        console.log(`[Success] Metadata generated using ${currentProvider}!`);
        const processed = postProcessMetadata(parsed, promptSettings, fileInfo);
        processed.provider = currentProvider;
        return processed;
      } catch (error) {
        console.warn(`[Fail] ${currentProvider} (key ${currentKeyIndex}): ${error.message}`);
        lastError = error;
        if (
          error.message.includes("429") || 
          error.message.toLowerCase().includes("quota") || 
          error.message.toLowerCase().includes("rate limit") ||
          error.message.toLowerCase().includes("exhausted")
        ) {
          globalKeyHitRateLimit = true;
        }
        continue; // Seamlessly rotate to next key
      }
    }

    // Gemini branch
    try {
      const prompt = buildGeminiPrompt(fileInfo);
      const parsed = await fetchGemini(apiKey, currentKeyIndex, prompt, imageBuffer, mimeType, true, promptSettings);
      const processed = postProcessMetadata(parsed, promptSettings, fileInfo);
      processed.provider = "gemini";
      return processed;
    } catch (error) {
      console.warn(`[Key Fail] Key index ${currentKeyIndex} failed: ${error.message} (keyHitRateLimit: ${error.keyHitRateLimit || false})`);
      lastError = error;
      const isRateLimit = error.keyHitRateLimit || 
        error.message.includes("429") || 
        error.message.toLowerCase().includes("quota") || 
        error.message.toLowerCase().includes("rate limit") || 
        error.message.toLowerCase().includes("resource_exhausted") ||
        error.message.toLowerCase().includes("exhausted");

      if (isRateLimit) {
        globalKeyHitRateLimit = true;
      }
      continue; // Seamlessly rotate to next key
    }
  }

  if (globalKeyHitRateLimit || (lastError && (lastError.message.includes("429") || lastError.message.includes("quota")))) {
    throw new Error(`API Rate Limit Reached on all ${apiKeys.length} keys. Please wait 30 seconds before generating again.`);
  }

  if (lastError) {
    let msg = lastError.message || String(lastError);
    if (msg.length > 250) {
      msg = msg.substring(0, 250) + "... (truncated)";
    }
    throw new Error(`Critical API Error: ${msg}`);
  }

  throw new Error("Critical: Could not connect to any Gemini model. Please check your API keys.");
}

/**
 * Generate a detailed prompt from an image.
 */
export async function generatePromptFromImage(imageBuffer, mimeType, apiKeys, apiProvider = "gemini", promptSettings = {}) {
  // Build formatting rules
  if (!apiKeys || apiKeys.length === 0) {
    const pName = Array.isArray(apiProvider) ? apiProvider.join(", ") : apiProvider;
    throw new Error(`No API keys found for provider "${pName}". Please add a key in Settings.`);
  }

  const mode = promptSettings.promptSimilarityMode || 'Exact Match';
  const targetModel = promptSettings.targetModel || 'ChatGPT';
  
  // Model-specific formatting instructions
  let modelFormattingRule = "";
  switch (targetModel) {
    case 'ChatGPT':
      modelFormattingRule = `\n\nCRITICAL CHATGPT/DALL-E 3 FORMAT: Write the prompt as a highly descriptive, natural language paragraph. Focus on rich details, sensory descriptions, and cohesive composition. Do not use bullet points or parameters.`;
      break;
    case 'Midjourney':
      modelFormattingRule = `\n\nCRITICAL MIDJOURNEY FORMAT: Write the prompt as a comma-separated list of descriptive keywords and phrases. Start with the main subject, followed by visual medium, stylistic details, lighting, camera settings, and append '--ar 16:9 --style raw --v 6.0' at the end. DO NOT write full conversational sentences.`;
      break;
    case 'Flux':
      modelFormattingRule = `\n\nCRITICAL FLUX FORMAT: Write a highly detailed natural language description, focusing heavily on realistic textures, lighting details, camera lens info, and crisp composition without using generic buzzwords.`;
      break;
    case 'Nano Banana':
      modelFormattingRule = `\n\nCRITICAL NANO BANANA FORMAT: You MUST output the ENTIRE PROMPT as a SINGLE, CONTINUOUS BLOCK OF TEXT. DO NOT use bullet points (- or *). DO NOT use bold headings (e.g., **Subject:**). DO NOT use line breaks or new paragraphs. Just one massively detailed, flowing paragraph.`;
      break;
    case 'Ideogram':
      modelFormattingRule = `\n\nCRITICAL IDEOGRAM FORMAT: Write a highly precise, natural language description. Ideogram strictly follows the prompt, so specify the exact positioning of subjects, lighting, and camera angles. If there is typography in the image, quote it exactly and describe its layout. Otherwise, focus on flawless descriptive detail without hallucinating text.`;
      break;
    case 'Recraft':
      modelFormattingRule = `\n\nCRITICAL RECRAFT FORMAT: Write a concise, structured prompt. Break down the description logically: start with the main subject, then environment, then stylistic attributes, lighting, and camera. Use clear, definitive terms rather than long flowing narratives.`;
      break;
    default:
      modelFormattingRule = `\n\nFormat the prompt as a clean, highly descriptive block of text optimized for image generation.`;
  }

  if (mode === "Unique Variation") {
    // Variation mode: creative narrative paragraph
    console.log(`[geminiService.js - Unique Variation] targetModel passed to prompt generator: "${targetModel}"`);
    const dynamicInstruction = `[CRITICAL INSTRUCTION: I am generating an image using ${targetModel}. Please format your final output strictly for ${targetModel}. DO NOT output conversational text, greetings, bullet points, or explanations.]\n\n`;

    const variationPrompt = dynamicInstruction + `UNIQUE VARIATION MODE: Your goal is to create a visually distinct but thematically related variation of this image. Retain only the core concept (about 40-50% conceptual similarity), but COMPLETELY CHANGE the visual presentation to avoid duplicate stock content flags.

CRITICAL CHANGES TO MAKE BASED ON IMAGE TYPE:

IF THE IMAGE IS A PHOTOGRAPH OR FEATURES PEOPLE:
1. Subject(s): STRICTLY MAINTAIN the exact demographics, gender, age, and number of people. ONLY change their clothing colors, minor pose adjustments, and positioning.
2. Environment/Setting: Change the background, time of day, or specific location while keeping the same general vibe.
3. Lighting & Mood: Alter the lighting setup and camera angle.

IF THE IMAGE IS AN ICON SET, UI GRAPHIC, OR VECTOR ART:
1. Grid Layout: Count the exact number of horizontal rows and vertical columns (e.g., "A 4x8 grid layout"). STRICTLY MAINTAIN this exact grid structure. Analyze the original image's background (e.g., solid color, white, transparent, or gradient) and retain the exact same background type. Do not hallucinate a gradient if the original is solid.
2. Limit Descriptions to Prevent Duplicates: DO NOT list every single icon. For large grids, ONLY describe the first 4-5 representative icons to keep the prompt concise. Do not hallucinate or repeat icons.
3. Intelligent Icon Variation: Keep 70-80% of the icons exactly the same. For the remaining 20-30%, replace them with different symbols that belong to the EXACT SAME CATEGORY (e.g., swap a 'gear' for a 'wrench').
4. Exact Icon Type & Stylistic Variation: Analyze the specific type of icons in the original image (e.g., 3D, isometric, hand-drawn, flat UI, line-art) and STRICTLY MAINTAIN this exact icon type. Do not force them to become "UI icons" if they are not. You may change the color palette or specific rendering technique to create a distinct variation, but the overall type and vibe MUST perfectly match the original image. DO NOT turn abstract icons into realistic scenes or photographs.

Use a flowing description blending these elements. Output ONLY the final prompt text. Do not output conversational text or explanations.` + modelFormattingRule;

    // Store variation prompt and fall through to the API call logic
    const promptToUse = variationPrompt;
    
    // Prioritize keys that match the selected provider
    const preferredKeys = [];
    const otherKeys = [];
    (apiKeys || []).forEach(keyItem => {
      let p = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
      if (Array.isArray(p)) p = p[0] || 'gemini';
      if (p === apiProvider) preferredKeys.push(keyItem);
      else otherKeys.push(keyItem);
    });
    const orderedKeys = [...preferredKeys, ...otherKeys];

    let lastError = null;
    const startKeyIndex = globalKeyIndex;
    if (orderedKeys.length > 0) globalKeyIndex = (globalKeyIndex + 1) % orderedKeys.length;

    for (let k = 0; k < orderedKeys.length; k++) {
      const currentKeyIndex = (startKeyIndex + k) % orderedKeys.length;
      const keyItem = orderedKeys[currentKeyIndex];
      let currentProvider = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
      if (Array.isArray(currentProvider)) currentProvider = currentProvider[0] || 'gemini';
      const apiKey = typeof keyItem === 'object' ? keyItem.key : keyItem;

      if (currentProvider !== "gemini") {
        try {
          let text;
          if (currentProvider === "groq") text = await fetchGroq(apiKey, promptToUse, imageBuffer, mimeType, false, promptSettings);
          else if (currentProvider === "openai") text = await fetchOpenAI(apiKey, promptToUse, imageBuffer, mimeType, false, promptSettings);
          else if (currentProvider === "mistral") text = await fetchMistral(apiKey, promptToUse, imageBuffer, mimeType, false, promptSettings);
          else throw new Error("Unsupported provider for generation");
          const finalPrompt = typeof text === 'string' ? text.trim() : (text?.title || JSON.stringify(text));
          return { prompt: finalPrompt, provider: currentProvider };
        } catch (error) {
          lastError = error;
          if (error.message.includes("401") || error.message.includes("403") || error.message.includes("429")) continue;
          throw error;
        }
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      let modelsToAttempt = [...modelsToTry];
      for (let i = 0; i < modelsToAttempt.length; i++) {
        const modelName = modelsToAttempt[i];
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const response = await generateContentWithTimeout(model, [{ inlineData: { data: imageBuffer, mimeType } }, { text: promptToUse }]);
          const out = response.text().trim();
          let totalTokens = 0;
          try { const um = response.usageMetadata; if (um && typeof um.totalTokenCount === "number") totalTokens = um.totalTokenCount; } catch { /* ignore */ }
          recordApiUsage("gemini", apiKey, { totalTokens, requests: 1 });
          return { prompt: out, provider: "gemini" };
        } catch (error) {
          lastError = error;
          if (error.message.includes("API_KEY_INVALID") || error.message.toLowerCase().includes("key not valid") || error.message.includes("403") || error.message.includes("429") || error.message.toLowerCase().includes("quota")) break;
          if (error.message.includes("400") || error.message.includes("404")) continue;
        }
      }
    }
    throw new Error(`Could not connect to any ${apiProvider} model.`);
  }

  console.log(`[geminiService.js] targetModel passed to prompt generator: "${targetModel}"`);
  const dynamicInstruction = `[CRITICAL INSTRUCTION: I am generating an image using ${targetModel}. Please format your final output strictly for ${targetModel}. DO NOT output conversational text, greetings, bullet points, or explanations.]\n\n`;

  const exactMatchPrompt = dynamicInstruction + `You are an elite AI Visual Analyst and Reverse Prompt Engineer. Your only objective is to analyze the provided image with microscopic precision and reverse-engineer a highly detailed text-to-image prompt. The ultimate goal is to generate a new image that is a flawless, exact visual replica of the provided image using advanced AI image generators (such as Midjourney v8, Flux 1.1 Pro, or Stable Diffusion).

You must analyze the image across the following dimensions and combine them into a single, cohesive prompt:

Subject & Action: Identify the main subject, exact physical characteristics, clothing, age, micro-details, and precise interactions.

Style & Medium: Determine the exact visual medium (e.g., 35mm macro photograph, hyper-realistic 3D render, oil painting) and specific artistic movements.

Lighting & Mood: Analyze the light sources (e.g., volumetric god rays, Rembrandt lighting, softbox, neon reflection) and the emotional atmosphere.

Composition & Camera Angle: Identify the framing (e.g., extreme close-up, wide shot), focal length, depth of field, and camera positioning.

Color Palette: Extract the exact color grading, dominant hues, and contrasting tones.

UI/Iconography & Layout (If Applicable): If the image is an icon set, UI design, or grid layout, describe the exact grid structure (e.g., "A 5x5 grid"). You MUST describe EVERY single visible icon specifically to ensure exact replication. CRITICAL ANTI-DUPLICATION RULE: You must describe the icons sequentially (e.g., from top-left to bottom-right, row by row) to avoid losing track. DO NOT repeat the exact same description twice. Ensure every icon described is unique and distinct as they appear in the original image. Describe the line weight (e.g., 2px uniform stroke), exact colors used for strokes vs fills, corner roundness, and spacing.

Quality Modifiers: Append high-end professional modifiers to ensure maximum fidelity (e.g., 8k resolution, cinematic, masterpiece, ultra-detailed).

CRITICAL CONSTRAINTS:
Compose the final prompt as a single flowing description without using bullet points or lists.
Do NOT output conversational text, greetings, or explanations.
Your output must ONLY be the final prompt text ready to be copy-pasted into an image generator.
` + modelFormattingRule;



  // Prioritize keys that match the selected provider, fallback to others if limit is reached
  const preferredKeys = [];
  const otherKeys = [];
  (apiKeys || []).forEach(keyItem => {
    let p = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
    if (Array.isArray(p)) p = p[0] || 'gemini';
    if (p === apiProvider) preferredKeys.push(keyItem);
    else otherKeys.push(keyItem);
  });
  const orderedKeys = [...preferredKeys, ...otherKeys];

  let lastError = null;
  const startKeyIndex = globalKeyIndex;
  if (orderedKeys.length > 0) {
    globalKeyIndex = (globalKeyIndex + 1) % orderedKeys.length;
  }

  for (let k = 0; k < orderedKeys.length; k++) {
    const currentKeyIndex = (startKeyIndex + k) % orderedKeys.length;
    const keyItem = orderedKeys[currentKeyIndex];
    
    // Support both new {provider, key} object format and legacy string format
    let currentProvider = typeof keyItem === 'object' ? keyItem.provider : apiProvider;
    if (Array.isArray(currentProvider)) currentProvider = currentProvider[0] || 'gemini';
    const apiKey = typeof keyItem === 'object' ? keyItem.key : keyItem;

    // OpenAI Compatible Route (Groq, etc.)
    if (currentProvider !== "gemini") {
      try {
        console.log(`[Attempt] Provider: ${currentProvider} (Image to Prompt) using key index ${currentKeyIndex}`);
        let text;
        if (currentProvider === "openai") text = await fetchOpenAI(apiKey, exactMatchPrompt, imageBuffer, mimeType, false, promptSettings);
        else if (currentProvider === "mistral") text = await fetchMistral(apiKey, exactMatchPrompt, imageBuffer, mimeType, false, promptSettings);
        else throw new Error("Unsupported provider for exact match mode");
        const rawText = typeof text === 'string' ? text.trim() : (text?.title || JSON.stringify(text));
        return {
          prompt: parseExactMatchOutput(rawText),
          provider: currentProvider
        };
      } catch (error) {
        lastError = error;
        if (
          error.message.includes("401") ||
          error.message.includes("403") ||
          error.message.includes("429") ||
          error.message.includes("413") ||
          error.message.toLowerCase().includes("too large") ||
          error.message.toLowerCase().includes("quota") ||
          error.message.toLowerCase().includes("rate limit")
        ) {
          continue; // Try next key smoothly
        }
        throw error;
      }
    }

    // Gemini Route
    const genAI = new GoogleGenerativeAI(apiKey);
    let modelsToAttempt = [...modelsToTry];

    for (let i = 0; i < modelsToAttempt.length; i++) {
      const modelName = modelsToAttempt[i];
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const response = await generateContentWithTimeout(model, [
          {
            inlineData: {
              data: imageBuffer,
              mimeType: mimeType,
            },
          },
          { text: exactMatchPrompt },
        ]);
        const out = response.text().trim();

        let totalTokens = 0;
        try {
          const um = response.usageMetadata;
          if (um && typeof um.totalTokenCount === "number") totalTokens = um.totalTokenCount;
        } catch {
          /* ignore */
        }
        recordApiUsage("gemini", apiKey, { totalTokens, requests: 1 });

        return {
          prompt: parseExactMatchOutput(out),
          provider: "gemini"
        };
      } catch (error) {
        console.warn(`[Fail] ${modelName} on key ${currentKeyIndex} (ImageToPrompt): ${error.message}`);
        lastError = error;

        if (
          error.message.includes("API_KEY_INVALID") ||
          error.message.toLowerCase().includes("key not valid") ||
          error.message.toLowerCase().includes("invalid key") ||
          error.message.includes("403") ||
          error.message.includes("429") ||
          error.message.toLowerCase().includes("quota") ||
          error.message.toLowerCase().includes("limit")
        ) {
          console.warn(`[Key Exhausted] Key index ${currentKeyIndex} is invalid or exhausted. Proceeding to next key.`);
          break; // Break inner model loop to smoothly test the NEXT API key in the outer loop
        }

        if (error.message.includes("400")) {
          throw new Error(`Invalid Image or Prompt (400 Bad Request): ${error.message}`);
        }
        if (error.message.includes("404")) continue;
      }
    }
  }

  if (lastError && (lastError.message.includes("429") || lastError.message.includes("quota") || lastError.message.toLowerCase().includes("rate limit"))) {
    throw new Error(`API Rate Limit Reached on all ${apiKeys.length} keys. Provider (${apiProvider}) says: "${lastError.message.substring(0, 150)}...". Please check your API quota or wait before retrying.`);
  }

  throw (
    lastError ||
    new Error(`Critical: Could not connect to any ${apiProvider} model. Please check your API keys.`)
  );
}

function parseExactMatchOutput(raw) {
  if (!raw) return '';
  let clean = raw.trim();
  
  // Remove markdown code blocks if any (e.g. ```markdown ... ```)
  clean = clean.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, '$1').trim();
  
  // Remove common prefixes
  clean = clean.replace(/^(here is the prompt:|prompt:|\*\*prompt:\*\*|>|interactive prompt:)/i, '').trim();
  
  // Strip leading/trailing double quotes or single quotes
  clean = clean.replace(/^["']|["']$/g, '').trim();
  
  // Strip common tips/notes sections at the end
  const splitKeywords = [
    /\n\s*Tips for/i,
    /\n\s*Note:/i,
    /\n\s*\*\*Tips/i,
    /\n\s*\*\*Note/i,
    /\n\s*### Tips/i,
    /\n\s*### Note/i,
    /\n\s*Aspect Ratio/i
  ];
  for (const rx of splitKeywords) {
    const index = clean.search(rx);
    if (index !== -1) {
      clean = clean.substring(0, index).trim();
    }
  }

  // Remove markdown bold asterisks (e.g., **word** -> word)
  clean = clean.replace(/\*\*/g, '');
  
  return clean;
}

/**
 * Scans an image for policy violations (copyright, watermarks, explicit content, spam)
 * Returns { isSafe: boolean, reason: string }
 */
export async function analyzeImageSecurity(imageBuffer, mimeType, apiKeys, apiProvider = "gemini") {
  const prompt = `Analyze this image strictly for stock photography marketplace policy violations.
Check for the following issues:
1. Watermarks, signatures, or dates indicating ownership by a specific photographer/agency (e.g., "© 2024 John Doe", "Shutterstock", "Getty Images"). Note: General typography, event titles, or template text (like "2026 Soccer Tournament") are perfectly FINE and should NOT be flagged.
2. Explicit, visible brand logos, trademarks, or copyrighted icons (e.g., Apple logo, Nike swoosh, corporate brand names, social media logos like Facebook). 
   CRITICAL: ONLY flag it if the actual brand logo, icon, or trademark name is directly visible and printed on the image/object. Do NOT flag objects that merely resemble branded products but have NO visible logo or text (e.g., do NOT flag a generic cylindrical smart speaker just because it looks like an Amazon Echo, and do NOT flag a smartphone if there is no Apple/Samsung logo visible).
3. Recognizable celebrities, public figures, or famous sports teams/athletes (e.g., Mark Zuckerberg, Elon Musk, Messi). These require editorial licenses and are banned for commercial stock.
4. Explicit, offensive, excessively violent, or NSFW content.

If ANY of these policy violations are found, mark it as unsafe and provide a short, specific reason.
If the image is clean (even if it contains event posters, template text, generic unbranded products resembling branded items, or typography), mark it as safe.

Return ONLY a valid JSON object matching this schema:
{
  "isSafe": boolean,
  "reason": "Specific reason if not safe, otherwise empty string"
}`;

  let lastError = null;

  if (!apiKeys || apiKeys.length === 0) {
    const pName = Array.isArray(apiProvider) ? apiProvider.join(", ") : apiProvider;
    throw new Error(`No API keys found for provider "${pName}". Please add a key in Settings.`);
  }

  let activeProvider = Array.isArray(apiProvider) ? apiProvider[0] : apiProvider;
  
  let providerKeys = apiKeys.filter(k => 
    (typeof k === 'object' && k.provider === activeProvider) ||
    (typeof k === 'string' && activeProvider === 'gemini')
  );

  if (providerKeys.length === 0) {
    activeProvider = typeof apiKeys[0] === 'object' ? apiKeys[0].provider : 'gemini';
    providerKeys = apiKeys.filter(k => 
      (typeof k === 'object' && k.provider === activeProvider) ||
      (typeof k === 'string' && activeProvider === 'gemini')
    );
  }

    if (activeProvider !== "gemini") {
      const startKeyIndex = globalKeyIndex;
      if (providerKeys.length > 0) {
        globalKeyIndex = (globalKeyIndex + 1) % providerKeys.length;
      }

      for (let k = 0; k < providerKeys.length; k++) {
        const currentKeyIndex = (startKeyIndex + k) % providerKeys.length;
        const keyItem = providerKeys[currentKeyIndex];
        const apiKey = typeof keyItem === 'object' ? keyItem.key : keyItem;

        try {
          let parsed;
          if (activeProvider === "openai") {
            parsed = await fetchOpenAI(apiKey, prompt, imageBuffer, mimeType, true);
          } else if (activeProvider === "mistral") {
            parsed = await fetchMistral(apiKey, prompt, imageBuffer, mimeType, true);
          } else {
            throw new Error(`Unsupported provider: ${activeProvider}`);
          }
          return parsed;
        } catch (error) {
          console.warn(`[Fail] ${activeProvider} on key ${currentKeyIndex} (SecurityScan): ${error.message}`);
          lastError = error;
          if (
            error.message.includes("401") ||
            error.message.includes("403") ||
            error.message.includes("429") ||
            error.message.toLowerCase().includes("quota") ||
            error.message.toLowerCase().includes("rate limit")
          ) {
            continue; // Try next key smoothly
          }
          throw error;
        }
      }

      if (lastError) {
        let msg = lastError.message || String(lastError);
        if (msg.length > 250) msg = msg.substring(0, 250) + "... (truncated)";
        throw new Error(`API Error: ${msg}`);
      }

      throw new Error(`Could not connect to any model for security scan.`);
    }

  const geminiKeys = apiKeys ? apiKeys.filter(k => 
    (typeof k === 'object' && k.provider === 'gemini') || 
    (typeof k === 'string' && k.startsWith('AIza'))
  ) : [];

  if (geminiKeys.length === 0) {
    throw new Error("No Gemini API keys found. Please add at least one Gemini key in Settings for Policy & Copyright Scan.");
  }

  const startKeyIndex = globalKeyIndex;
  if (geminiKeys.length > 0) {
    globalKeyIndex = (globalKeyIndex + 1) % geminiKeys.length;
  }

  for (let k = 0; k < geminiKeys.length; k++) {
    const currentKeyIndex = (startKeyIndex + k) % geminiKeys.length;
    const keyItem = geminiKeys[currentKeyIndex];
    const apiKey = typeof keyItem === 'object' ? keyItem.key : keyItem;

    const genAI = new GoogleGenerativeAI(apiKey);
    let modelsToAttempt = ["gemini-2.5-flash"];

    for (let i = 0; i < modelsToAttempt.length; i++) {
      const modelName = modelsToAttempt[i];
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const response = await generateContentWithTimeout(model, [
          {
            inlineData: {
              data: imageBuffer,
              mimeType: mimeType,
            },
          },
          { text: prompt },
        ], 60000); // 60s (1 min) timeout to prevent premature aborts on large images
        const out = response.text().trim();
        const cleaned = out.replace(/```json/g, "").replace(/```/g, "").trim();
        
        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch (e) {
          const extracted = extractJson(cleaned);
          if (extracted) {
            parsed = JSON.parse(extracted);
          } else {
            const match = cleaned.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
            else throw new Error("JSON parse error: " + e.message);
          }
        }

        let totalTokens = 0;
        try {
          const um = response.usageMetadata;
          if (um && typeof um.totalTokenCount === "number") totalTokens = um.totalTokenCount;
        } catch { /* ignore */ }
        recordApiUsage("gemini", apiKey, { totalTokens, requests: 1 });

        return parsed;
      } catch (error) {
        console.warn(`[Fail] ${modelName} on key ${currentKeyIndex} (SecurityScan): ${error.message}`);
        lastError = error;
        const isQuotaExceeded =
          (error.message.toLowerCase().includes("quota") ||
           error.message.toLowerCase().includes("exceeded") ||
           error.message.toLowerCase().includes("billing")) &&
          !error.message.toLowerCase().includes("perminute") &&
          !error.message.toLowerCase().includes("rate limit");

        if (isQuotaExceeded) {
          console.warn(`[Quota Exceeded] Key index ${currentKeyIndex}: Model ${modelName} has no daily quota left for security scan. Falling back to next model...`);
          continue; 
        }

        const isRateLimit =
          error.message.includes("429") ||
          error.message.toLowerCase().includes("limit") ||
          error.message.toLowerCase().includes("perminute");
        const isHighDemand = error.message.includes("503") || error.message.toLowerCase().includes("high demand");
        
        if (isRateLimit || isHighDemand) {
          // Retry current model 1 time before moving to the next model
          let retried = false;
          const maxRetries = 1;
          for (let retry = 0; retry < maxRetries; retry++) {
            const waitMs = isRateLimit ? (retry + 1) * 4500 : (retry + 1) * 2000;
            const errorType = isRateLimit ? "429 Rate Limit" : "503 High Demand";
            console.warn(`[SecurityScan ${errorType}] Waiting ${waitMs / 1000}s before retry ${retry + 1}/${maxRetries}...`);
            await new Promise(r => setTimeout(r, waitMs));
            try {
              const model2 = genAI.getGenerativeModel({ model: modelName });
              const response2 = await generateContentWithTimeout(model2, [
                { inlineData: { data: imageBuffer, mimeType: mimeType } },
                { text: prompt },
              ], 15000); // Added strict 15s timeout to prevent 90s default hang
              const text2 = response2.text();
              const cleaned2 = text2.replace(/```json/g, "").replace(/```/g, "").trim();
              let parsed2;
              try { parsed2 = JSON.parse(cleaned2); }
              catch (e2) {
                const extracted2 = extractJson(cleaned2);
                if (extracted2) {
                  parsed2 = JSON.parse(extracted2);
                } else {
                  const match2 = cleaned2.match(/\{[\s\S]*\}/);
                  if (match2) parsed2 = JSON.parse(match2[0]);
                  else throw new Error("JSON parse error: " + e2.message);
                }
              }
              retried = true;
              return parsed2;
            } catch (retryErr) {
              lastError = retryErr;
              const isStillRateOrDemand = retryErr.message.includes("503") || retryErr.message.includes("429") || retryErr.message.toLowerCase().includes("rate limit") || retryErr.message.toLowerCase().includes("high demand");
              if (!isStillRateOrDemand) break;
            }
          }
          if (!retried) {
            continue; // ALWAYS Try next model (e.g. gemini-2.5-flash) instead of breaking the loop
          }
          break;
        }

        if (
          error.message.includes("API_KEY_INVALID") ||
          error.message.toLowerCase().includes("key not valid") ||
          error.message.toLowerCase().includes("invalid key") ||
          error.message.includes("403")
        ) {
          console.warn(`[Key Exhausted] Key index ${currentKeyIndex} is invalid or exhausted. Proceeding to next key.`);
          break; // Break inner loop, go to next key
        }
        if (error.message.includes("400")) {
          throw new Error(`Invalid Image or Prompt (400 Bad Request): ${error.message}`);
        }
        if (error.message.includes("404")) continue;
      }
    }
  }

  if (lastError && (lastError.message.includes("429") || lastError.message.includes("quota"))) {
    throw new Error(`API Rate Limit Reached. Please wait 30 seconds.`);
  }

  if (lastError) {
    let msg = lastError.message || String(lastError);
    if (msg.length > 250) msg = msg.substring(0, 250) + "... (truncated)";
    throw new Error(`API Error: ${msg}`);
  }

  throw new Error(`Could not connect to any model for security scan.`);
}

