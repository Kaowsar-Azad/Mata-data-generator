import React, { useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";

export function MetaField({ label, value, onChange, isTextArea, isKeywords, img }) {
  const [copied, setCopied] = useState(false);
  const [isTextMode, setIsTextMode] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getKeywordScore = (keyword, img) => {
    const kl = keyword.toLowerCase().trim();
    
    // Check if AI provided a real SEO score
    if (img && img.result && img.result.keywordScores) {
        const exactScore = img.result.keywordScores[kl] || img.result.keywordScores[keyword.trim()];
        if (exactScore !== undefined && typeof exactScore === 'number') {
           return Math.min(100, Math.max(1, exactScore));
        }
    }

    // Fallback heuristic based on specific image content relevance
    const junk = new Set(["design", "image", "photo", "picture", "file", "graphic", "visual", "element", "object", "thing", "item", "nice", "great", "good", "look", "use", "fun", "enjoyment", "reality", "pastime", "recreation", "interests", "relaxation", "simulate"]);
    if (junk.has(kl) || kl.length < 3) return 10; 
    
    let score = 50; // default medium score
    const title = (img?.result?.title || '').toLowerCase();
    const desc = (img?.result?.description || '').toLowerCase();
    
    // High relevance if present in title, good relevance if in description
    if (title.includes(kl)) score += 30;
    else if (desc.includes(kl)) score += 15;
    
    const wordCount = kl.split(' ').length;
    if (wordCount > 1) score += 10; 
    if (kl.length >= 4 && kl.length <= 25) score += 5; 
    
    return Math.min(99, score);
  };

  const removeKeyword = (idxToRemove) => {
    const keywords = (value || '').split(',').map(k => k.trim()).filter(Boolean);
    const newKws = keywords.filter((_, idx) => idx !== idxToRemove);
    onChange(newKws.join(', '));
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
          style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', minHeight: '90px', alignContent: 'flex-start' }}
        >
          {(value || '').split(',').map(k => k.trim()).filter(Boolean).map((kw, idx) => {
            const cleanedKw = kw.replace(/\s+\d+$/, '');
            const score = getKeywordScore(cleanedKw, img);
            let colorStr = score >= 75 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
            
            return (
              <div 
                key={idx} 
                className="group flex items-center transition-all"
                style={{ 
                  background: 'var(--surface-1)', 
                  color: 'var(--text-1)', 
                  border: '1px solid var(--glass-border)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  fontSize: '0.72rem',
                  fontWeight: '500',
                  borderRadius: '100px',
                  padding: '2px 6px 2px 8px',
                  gap: '5px',
                  height: '24px',
                  boxSizing: 'border-box'
                }}
                title={`Relevance: ${score >= 75 ? 'High' : score >= 40 ? 'Medium' : 'Low'} (${score}/100)`}
              >
                <span 
                  style={{ 
                    width: '5px', 
                    height: '5px', 
                    borderRadius: '50%', 
                    backgroundColor: colorStr,
                    display: 'inline-block',
                    flexShrink: 0
                  }} 
                />
                <span className="select-none" style={{ letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{cleanedKw}</span>
                <span 
                  role="button"
                  onClick={() => removeKeyword(idx)}
                  className="flex items-center justify-center rounded-full transition-all"
                  style={{ 
                    cursor: 'pointer',
                    color: 'var(--text-3)',
                    padding: '2px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.6,
                    width: '14px',
                    height: '14px',
                    flexShrink: 0
                  }}
                  onMouseOver={(e) => { 
                    e.currentTarget.style.color = 'var(--text-1)';
                    e.currentTarget.style.background = 'rgba(156, 163, 175, 0.15)';
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseOut={(e) => { 
                    e.currentTarget.style.color = 'var(--text-3)';
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.opacity = '0.6';
                  }}
                >
                  &times;
                </span>
              </div>
            );
          })}
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
