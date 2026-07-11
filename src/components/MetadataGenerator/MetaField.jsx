import React, { useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";

export function MetaField({ label, value, onChange, isTextArea, isKeywords, img, onApplyToSelected }) {
  const [copied, setCopied] = useState(false);
  const [isTextMode, setIsTextMode] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");

  const handleCopy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getKeywordScore = (keyword, img) => {
    const kl = keyword.toLowerCase().trim();
    
    // Check if AI provided a real SEO score
    if (img && img.result && img.result.keywordScores) {
        const scoreKey = Object.keys(img.result.keywordScores).find(
          k => k.toLowerCase().trim() === kl
        );
        if (scoreKey !== undefined) {
          const exactScore = img.result.keywordScores[scoreKey];
          if (exactScore !== undefined) {
             const numScore = Number(exactScore);
             if (!isNaN(numScore)) {
                 return Math.min(100, Math.max(1, numScore));
             }
          }
        }
    }

    // Fallback heuristic based on specific image content relevance
    const junk = new Set(["design", "image", "photo", "picture", "file", "graphic", "visual", "element", "object", "thing", "item", "nice", "great", "good", "look", "use", "fun", "enjoyment", "reality", "pastime", "recreation", "interests", "relaxation", "simulate"]);
    if (junk.has(kl) || kl.length < 3) return 10; 
    
    return 50; // default exact middle score (Yellow)
  };

  const removeKeyword = (idxToRemove) => {
    const keywords = (value || '').split(',').map(k => k.trim()).filter(Boolean);
    const newKws = keywords.filter((_, idx) => idx !== idxToRemove);
    onChange(newKws.join(', '));
  };

  const handleKeyDown = (e) => {
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
            <div className="flex items-center gap-3 text-xs text-muted font-medium ml-3">
              <span className="flex items-center gap-1.5"><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></div> High</span>
              <span className="flex items-center gap-1.5"><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></div> Medium</span>
              <span className="flex items-center gap-1.5"><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></div> Low</span>
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
          className="flex flex-wrap gap-2 p-3 rounded-lg"
          style={{ 
            background: 'rgba(255, 255, 255, 0.02)', 
            border: '1px solid var(--glass-border)', 
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.05)',
            backdropFilter: 'blur(10px)',
            minHeight: '90px', 
            alignContent: 'flex-start' 
          }}
          onClick={(e) => {
             if (e.target === e.currentTarget) {
                 const input = e.currentTarget.querySelector('input[type="text"]');
                 if (input) input.focus();
             }
          }}
        >
          {(value || '').split(',').map(k => k.trim()).filter(Boolean).map((kw, idx) => {
            const cleanedKw = kw.replace(/\s+\d+$/, '');
            const score = getKeywordScore(cleanedKw, img);
            let colorStr = score >= 70 ? '#10b981' : score >= 30 ? '#f59e0b' : '#ef4444';
            let bgStr = score >= 70 ? 'rgba(16, 185, 129, 0.1)' : score >= 30 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)';
            
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
                  padding: '3px 8px 3px 10px',
                  gap: '6px',
                  height: '26px',
                  boxSizing: 'border-box',
                  transform: 'scale(1)',
                  cursor: 'default'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                  e.currentTarget.style.boxShadow = `0 4px 10px ${colorStr}30`;
                  e.currentTarget.style.borderColor = colorStr;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
                  e.currentTarget.style.borderColor = `${colorStr}40`;
                }}
                title={`Relevance: ${score >= 75 ? 'High' : score >= 40 ? 'Medium' : 'Low'} (${score}/100)`}
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
                  onClick={(e) => { e.stopPropagation(); removeKeyword(idx); }}
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
                  onMouseOver={(e) => { 
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.background = colorStr;
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseOut={(e) => { 
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
            onChange={(e) => setNewKeyword(e.target.value)}
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
      ) : isTextArea ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="meta-textarea"
          style={{ width: '100%', minHeight: '90px' }}
        />
      ) : (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="meta-input"
          style={{ width: '100%' }}
        />
      )}
    </div>
  );
}
