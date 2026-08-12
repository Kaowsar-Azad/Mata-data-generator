// @ts-nocheck
import React, { useState, useRef, useEffect } from "react";
import { CheckCircle2, Copy } from "lucide-react";

export function MetaField({ label, value, onChange, isTextArea, isKeywords, img, onApplyToSelected }: any) {
  const [copied, setCopied] = useState(false);
  const [isTextMode, setIsTextMode] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value, isTextMode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getKeywordScore = (keyword: string, img: any) => {
    const kl = keyword.toLowerCase().trim();
    
    // Check if AI provided a real SEO score
    if (img && img.result && img.result.keywordScores) {
        let scoresObj = img.result.keywordScores;
        
        if (typeof scoresObj === 'string') {
           const kwArray = (img.result.keywords || '').split(',').map((k: string) => k.trim());
           const scArray = scoresObj.split(',').map((s: string) => Number(s.trim()));
           const tempObj: any = {};
           kwArray.forEach((k: string, i: number) => {
               if (k) tempObj[k] = !isNaN(scArray[i]) ? scArray[i] : 50;
           });
           scoresObj = tempObj;
        }

        if (Array.isArray(scoresObj)) {
          scoresObj = scoresObj.reduce((acc: any, curr: any) => {
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
          (k: string) => k.toLowerCase().trim() === kl
        );
        
        if (!scoreKey) {
           scoreKey = Object.keys(scoresObj).find(
             (k: string) => k.toLowerCase().split(/[\s,]+/).includes(kl)
           );
        }

        if (scoreKey !== undefined) {
          const exactScore = scoresObj[scoreKey];
          if (exactScore !== undefined && exactScore !== null) {
             const numScore = typeof exactScore === 'object' && exactScore.score !== undefined ? Number(exactScore.score) : Number(exactScore);
             if (!isNaN(numScore)) {
                 return Math.min(100, Math.max(1, numScore));
             }
          }
        }
    }

    // Fallback heuristic based on specific image content relevance
    const isEpsAsset = Boolean(img?.isEps || (img?.file?.name && /\.(eps|epsf|epsi)$/i.test(img.file.name)));
    const junk = new Set(isEpsAsset
      ? ["image", "photo", "picture", "file", "thing", "item", "nice", "great", "good", "look", "use", "fun", "enjoyment", "reality", "pastime", "recreation", "interests", "relaxation", "simulate"]
      : ["design", "image", "photo", "picture", "file", "graphic", "visual", "element", "object", "thing", "item", "nice", "great", "good", "look", "use", "fun", "enjoyment", "reality", "pastime", "recreation", "interests", "relaxation", "simulate"]
    );
    if (junk.has(kl) || kl.length < 3) return -1; 
    
    // Natural fallback based on keyword position if present in keywords string
    if (img && img.result && img.result.keywords) {
      const allKws = img.result.keywords.split(',').map((k: string) => k.toLowerCase().trim());
      const kwIdx = allKws.indexOf(kl);
      if (kwIdx !== -1) {
        if (kwIdx < 15) return Math.max(70, Math.round(95 - (kwIdx * 1.6)));
        if (kwIdx < 35) return Math.max(30, Math.round(68 - ((kwIdx - 15) * 1.8)));
        return Math.max(5, Math.round(28 - ((kwIdx - 35) * 1.5)));
      }
    }
    
    return -1; // Missing score
  };

  const removeKeyword = (idxToRemove: number) => {
    const keywords = (value || '').split(',').map(k => k.trim()).filter(Boolean);
    const newKws = keywords.filter((_, idx) => idx !== idxToRemove);
    onChange(newKws.join(', '));
  };

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const trimmed = newKeyword.trim();
      if (trimmed) {
        const keywords = (value || '').split(',').map(k => k.trim()).filter(Boolean);
        if (!keywords.includes(trimmed)) {
          keywords.push(trimmed);
          onChange(keywords.join(', '));
        }
        setNewKeyword("");
      }
    }
  };

  return (
    <div style={{ marginBottom: '0.65rem' }}>
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-3">
          <span className="meta-label" style={{ marginBottom: 0 }}>{label}</span>
          {isKeywords && !isTextMode && (
            <div className="flex items-center gap-4 text-xs text-muted font-medium ml-3">
              <span className="flex items-center gap-2"><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></div> High</span>
              <span className="flex items-center gap-2"><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></div> Medium</span>
              <span className="flex items-center gap-2"><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></div> Low</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {onApplyToSelected && (
            <button 
              onClick={onApplyToSelected}
              title={`Apply this ${label} to all selected files`}
              style={{
                background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.35)', padding: '0.2rem 0.5rem', borderRadius: '4px',
                color: '#22c55e', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
                e.currentTarget.style.borderColor = '#22c55e';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.35)';
              }}
            >
              ✓ Apply to All
            </button>
          )}
          {isKeywords && (
            <button 
              onClick={() => setIsTextMode(!isTextMode)}
              title={isTextMode ? "Switch to colored tags" : "Edit as plain text"}
              style={{
                background: 'var(--surface-3)', border: '1px solid var(--glass-border)', padding: '0.2rem 0.5rem', borderRadius: '4px',
                color: 'var(--accent)', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              {isTextMode ? '🎨 Visual Tags' : '📝 Edit Text'}
            </button>
          )}
          <button 
            onClick={handleCopy} 
            title={`Copy ${label}`}
            style={{ 
              background: 'transparent', border: 'none', padding: '0.2rem', 
              color: copied ? 'var(--success)' : 'var(--text-3)', 
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem'
            }}
          >
            {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      </div>
      
      {isKeywords && !isTextMode ? (
        <div 
          className="flex flex-wrap p-2.5 rounded-lg"
          style={{ 
            gap: '6px 8px',
            background: 'rgba(255, 255, 255, 0.02)', 
            border: '1px solid var(--glass-border)', 
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.05)',
            backdropFilter: 'blur(10px)',
            minHeight: '55px', 
            alignContent: 'flex-start' 
          }}
          onClick={(e) => {
             if (e.target === e.currentTarget) {
                 const input = e.currentTarget.querySelector('input[type="text"]');
                 if (input) input.focus();
             }
          }}
        >
          {(value || '').split(',').map((k: string) => k.trim()).filter(Boolean).map((kw: string, idx: number) => {
            const cleanedKw = kw.replace(/\s+\d+$/, '');
            const score = getKeywordScore(cleanedKw, img);
            let isGreen = false;
            let isYellow = false;
            let isRed = false;

            if (score === -1) {
              isRed = true;
            } else {
              if (img?.result?.provider === 'mistral') {
                isGreen = score >= 60;
                isYellow = score >= 30 && score < 60;
                isRed = score < 30;
              } else {
                isGreen = score >= 70;
                isYellow = score >= 30 && score < 70;
                isRed = score < 30;
              }
            }
            
            let colorStr = isGreen ? '#10b981' : isYellow ? '#f59e0b' : '#ef4444';
            let bgStr = isGreen ? 'rgba(16, 185, 129, 0.1)' : isYellow ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)';
            
            return (
              <div 
                key={idx} 
                className="group flex items-center transition-all"
                style={{ 
                  background: bgStr, 
                  color: 'var(--text-1)', 
                  border: `1px solid ${colorStr}40`,
                  boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  borderRadius: '100px',
                  padding: '3px 10px 3px 10px',
                  gap: '5px',
                  height: '25px',
                  boxSizing: 'border-box',
                  transform: 'scale(1)',
                  cursor: 'default'
                }}
                onMouseOver={(e: any) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                  e.currentTarget.style.boxShadow = `0 4px 10px ${colorStr}30`;
                  e.currentTarget.style.borderColor = colorStr;
                }}
                onMouseOut={(e: any) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
                  e.currentTarget.style.borderColor = `${colorStr}40`;
                }}
              >
                <span 
                  style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: colorStr,
                    display: 'inline-block',
                    flexShrink: 0,
                    boxShadow: `0 0 5px ${colorStr}`
                  }} 
                />
                <span className="select-none" style={{ letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{cleanedKw}</span>
                <span 
                  role="button"
                  onClick={(e: any) => { e.stopPropagation(); removeKeyword(idx); }}
                  className="flex items-center justify-center rounded-full transition-all"
                  style={{ 
                    cursor: 'pointer',
                    color: colorStr,
                    padding: '2px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.7,
                    width: '16px',
                    height: '16px',
                    flexShrink: 0,
                    marginLeft: '2px'
                  }}
                  onMouseOver={(e: any) => { 
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.background = colorStr;
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseOut={(e: any) => { 
                    e.currentTarget.style.color = colorStr;
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.opacity = '0.7';
                  }}
                >
                  &times;
                </span>
              </div>
            );
          })}
          
          <input
            type="text"
            value={newKeyword}
            onChange={(e: any) => setNewKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="+ Add keyword..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-1)',
              fontSize: '0.75rem',
              fontWeight: 500,
              minWidth: '100px',
              flex: '1 1 auto',
              padding: '2px 4px',
              height: '24px'
            }}
          />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value || ''}
          onChange={(e: any) => {
            onChange(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          className={isTextArea ? "meta-textarea" : "meta-input"}
          style={{ 
            width: '100%', 
            resize: 'none', 
            overflow: 'hidden', 
            minHeight: isTextArea ? (label === 'Description' ? '45px' : '90px') : '36px' 
          }}
          rows={1}
        />
      )}
    </div>
  );
}
