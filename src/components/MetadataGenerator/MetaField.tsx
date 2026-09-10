// @ts-nocheck
import React, { useState, useRef, useEffect } from "react";
import { CheckCircle2, Copy, Loader2, FileCheck2, Plus, UploadCloud } from "lucide-react";

export function MetaField({ 
  label, 
  value, 
  onChange, 
  isTextArea, 
  isKeywords, 
  img, 
  onApplyToSelected, 
  enableKeywordRanking, 
  onEmbedSingle, 
  autoEmbed, 
  onUploadSingleFtp,
  selectedCount = 0,
  onAddKeywordToSelected,
  onEmbedSelected
}: any) {
  const [copied, setCopied] = useState(false);
  const [isTextMode, setIsTextMode] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [justEmbedded, setJustEmbedded] = useState(false);
  const [isUploadingFtp, setIsUploadingFtp] = useState(false);
  const [justUploadedFtp, setJustUploadedFtp] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialKeywordsRef = useRef(img?.lastEmbeddedKeywords || img?.initialKeywords || value);

  useEffect(() => {
    initialKeywordsRef.current = img?.lastEmbeddedKeywords || img?.initialKeywords || value;
  }, [img?.id, img?.lastEmbeddedKeywords]);

  // Per-file ranking status:
  // If generated with ranking ON, the file permanently keeps its colors even if global button is toggled OFF.
  // If generated with ranking OFF, the file never shows colors even if global button is toggled ON.
  const hasRanking = img?.result?.hasKeywordRanking !== undefined
    ? img.result.hasKeywordRanking === true
    : Boolean(img?.result?.keywordScores && typeof img.result.keywordScores === 'object' && Object.keys(img.result.keywordScores).length > 0);

  const showRanking = Boolean(
    hasRanking &&
    img?.result?.keywordScores && 
    typeof img.result.keywordScores === 'object' &&
    Object.keys(img.result.keywordScores).length > 0
  );

  const baselineKeywords = img?.lastEmbeddedKeywords || initialKeywordsRef.current || '';
  const currentKeywordsStr = (value || '').trim();
  const hasKeywordChanges = Boolean(
    isKeywords &&
    currentKeywordsStr !== baselineKeywords.trim()
  );

  const showEmbedButton = Boolean(
    isKeywords &&
    (hasKeywordChanges || justEmbedded || isEmbedding) &&
    (typeof onEmbedSingle === 'function' || typeof onEmbedSelected === 'function')
  );

  const handleEmbedClick = async () => {
    if ((!onEmbedSingle && !onEmbedSelected) || isEmbedding) return;
    setIsEmbedding(true);
    try {
      if (selectedCount > 1 && typeof onEmbedSelected === 'function') {
        await onEmbedSelected();
      } else if (typeof onEmbedSingle === 'function') {
        await onEmbedSingle(img?.id, value);
      }
      initialKeywordsRef.current = value;
      setJustEmbedded(true);
      setTimeout(() => {
        setJustEmbedded(false);
      }, 3500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsEmbedding(false);
    }
  };

  const handleFtpUploadClick = async () => {
    if (!onUploadSingleFtp || isUploadingFtp) return;
    setIsUploadingFtp(true);
    try {
      await onUploadSingleFtp(img?.id, value);
      initialKeywordsRef.current = value;
      setJustUploadedFtp(true);
      setTimeout(() => {
        setJustUploadedFtp(false);
      }, 3500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploadingFtp(false);
    }
  };

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

    return -1; // Missing score
  };

  const removeKeyword = (idxToRemove: number) => {
    const keywords = (value || '').split(',').map(k => k.trim()).filter(Boolean);
    const newKws = keywords.filter((_, idx) => idx !== idxToRemove);
    onChange(newKws.join(', '));
  };

  const addKeywordDirectly = (kwToAdd: string) => {
    const trimmed = (kwToAdd || '').trim();
    if (!trimmed) return;

    if (selectedCount > 1 && typeof onAddKeywordToSelected === 'function') {
      onAddKeywordToSelected(trimmed);
    } else {
      const keywords = (value || '').split(',').map(k => k.trim()).filter(Boolean);
      const alreadyHas = keywords.some(k => k.toLowerCase() === trimmed.toLowerCase());
      if (!alreadyHas) {
        keywords.push(trimmed);
        onChange(keywords.join(', '));
      }
    }
    setNewKeyword("");
  };

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeywordDirectly(newKeyword);
    }
  };

  return (
    <div style={{ marginBottom: '0.65rem' }}>
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-3">
          <span className="meta-label" style={{ marginBottom: 0 }}>{label}</span>
          {isKeywords && !isTextMode && showRanking && (
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
            let colorStr = 'var(--text-2, #475569)';
            let bgStr = 'var(--surface-2, #f0f2f5)';
            let borderStr = '1px solid var(--surface-3, #e2e8f0)';
            let hasRank = false;

            if (showRanking) {
              const score = getKeywordScore(cleanedKw, img);

              if (score !== -1) {
                hasRank = true;
                let isGreen = false;
                let isYellow = false;
                let isRed = false;

                if (img?.result?.provider === 'mistral') {
                  isGreen = score >= 60;
                  isYellow = score >= 30 && score < 60;
                  isRed = score < 30;
                } else {
                  isGreen = score >= 70;
                  isYellow = score >= 30 && score < 70;
                  isRed = score < 30;
                }
                colorStr = isGreen ? '#10b981' : isYellow ? '#f59e0b' : '#ef4444';
                bgStr = isGreen ? 'rgba(16, 185, 129, 0.1)' : isYellow ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                borderStr = `1px solid ${colorStr}40`;
              }
            }
            
            return (
              <div 
                key={idx} 
                className="group flex items-center transition-all"
                style={{ 
                  background: bgStr, 
                  color: 'var(--text-1)', 
                  border: borderStr,
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
                  if (showRanking && hasRank) {
                    e.currentTarget.style.boxShadow = `0 4px 10px ${colorStr}30`;
                    e.currentTarget.style.borderColor = colorStr;
                  } else {
                    e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.12)';
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }
                }}
                onMouseOut={(e: any) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
                  e.currentTarget.style.border = borderStr;
                }}
              >
                {showRanking && hasRank && (
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
                )}
                <span className="select-none" style={{ letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{cleanedKw}</span>
                <span 
                  role="button"
                  onClick={(e: any) => { e.stopPropagation(); removeKeyword(idx); }}
                  className="flex items-center justify-center rounded-full transition-all"
                  style={{ 
                    cursor: 'pointer',
                    color: (showRanking && hasRank) ? colorStr : 'var(--text-3)',
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
                    e.currentTarget.style.background = (showRanking && hasRank) ? colorStr : '#ef4444';
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseOut={(e: any) => { 
                    e.currentTarget.style.color = (showRanking && hasRank) ? colorStr : 'var(--text-3)';
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.opacity = '0.7';
                  }}
                >
                  &times;
                </span>
              </div>
            );
          })}
          
          {/* ── Slim Inline Action Row ── */}
          <div 
            className="w-full flex items-center mt-2.5 pt-2.5"
            style={{ 
              borderTop: '1px solid var(--glass-border, rgba(0, 0, 0, 0.06))',
              boxSizing: 'border-box',
              gap: '8px'
            }}
          >
            {/* Minimal underline-style input */}
            <div 
              className="flex items-center flex-1 transition-all"
              style={{
                background: 'transparent',
                borderBottom: isInputFocused 
                  ? '1.5px solid var(--accent, #3b82f6)' 
                  : '1px solid var(--glass-border, rgba(148, 163, 184, 0.3))',
                padding: '0 2px 4px 0',
                gap: '6px',
                minWidth: 0
              }}
            >
              <Plus 
                className="w-3.5 h-3.5 flex-shrink-0 transition-colors" 
                style={{ 
                  color: isInputFocused ? 'var(--accent, #3b82f6)' : 'var(--text-3, #94a3b8)',
                  strokeWidth: 2.2 
                }} 
              />
              <input
                type="text"
                value={newKeyword}
                onChange={(e: any) => setNewKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder="Add keyword..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-1)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  width: '100%',
                  padding: 0,
                  height: '22px',
                  lineHeight: '22px'
                }}
              />
              {/* Sleek inline Add button — visible only when typing */}
              {newKeyword.trim() && (
                <button
                  type="button"
                  onClick={() => addKeywordDirectly(newKeyword)}
                  className="flex items-center justify-center gap-1 rounded-full transition-all flex-shrink-0"
                  style={{
                    height: '22px',
                    padding: '0 8px',
                    background: 'var(--accent, #3b82f6)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    boxShadow: '0 1px 4px rgba(59, 130, 246, 0.25)',
                    marginLeft: '4px'
                  }}
                  onMouseEnter={(e: any) => {
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.4)';
                    e.currentTarget.style.transform = 'scale(1.04)';
                  }}
                  onMouseLeave={(e: any) => {
                    e.currentTarget.style.boxShadow = '0 1px 4px rgba(59, 130, 246, 0.25)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <Plus className="w-2.5 h-2.5" style={{ strokeWidth: 3 }} />
                  <span>Add</span>
                </button>
              )}
            </div>

            {/* Compact action buttons — right-aligned */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {showEmbedButton && (
                <button
                  type="button"
                  onClick={handleEmbedClick}
                  disabled={isEmbedding || isUploadingFtp}
                  title={selectedCount > 1 ? `Embed metadata into all ${selectedCount} selected files & sync CSV` : "Embed changes into file & sync CSV"}
                  className="flex items-center justify-center gap-1 rounded-full transition-all animate-fade-in"
                  style={{
                    height: '26px',
                    padding: '0 10px',
                    background: justEmbedded
                      ? 'rgba(16, 185, 129, 0.12)'
                      : isEmbedding
                        ? 'rgba(16, 185, 129, 0.08)'
                        : 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    border: `1px solid ${justEmbedded ? '#10b981' : 'rgba(16, 185, 129, 0.3)'}`,
                    cursor: isEmbedding ? 'wait' : 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.01em',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e: any) => {
                    if (!isEmbedding && !justEmbedded) {
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.18)';
                      e.currentTarget.style.borderColor = '#10b981';
                    }
                  }}
                  onMouseLeave={(e: any) => {
                    if (!justEmbedded) {
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                    }
                  }}
                >
                  {isEmbedding ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : justEmbedded ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <FileCheck2 className="w-3 h-3" style={{ strokeWidth: 2.2 }} />
                  )}
                  <span>{isEmbedding ? 'Saving...' : justEmbedded ? 'Done' : (selectedCount > 1 ? `Embed (${selectedCount})` : 'Embed')}</span>
                </button>
              )}

              {showEmbedButton && autoEmbed && typeof onUploadSingleFtp === 'function' && (
                <button
                  type="button"
                  onClick={handleFtpUploadClick}
                  disabled={isUploadingFtp || isEmbedding}
                  title="Embed & send only this file to FTP server"
                  className="flex items-center justify-center gap-1 rounded-full transition-all animate-fade-in"
                  style={{
                    height: '26px',
                    padding: '0 10px',
                    background: justUploadedFtp
                      ? 'rgba(139, 92, 246, 0.12)'
                      : isUploadingFtp
                        ? 'rgba(139, 92, 246, 0.08)'
                        : 'rgba(139, 92, 246, 0.1)',
                    color: '#8b5cf6',
                    border: `1px solid ${justUploadedFtp ? '#8b5cf6' : 'rgba(139, 92, 246, 0.3)'}`,
                    cursor: isUploadingFtp ? 'wait' : 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.01em',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e: any) => {
                    if (!isUploadingFtp && !justUploadedFtp) {
                      e.currentTarget.style.background = 'rgba(139, 92, 246, 0.18)';
                      e.currentTarget.style.borderColor = '#8b5cf6';
                    }
                  }}
                  onMouseLeave={(e: any) => {
                    if (!justUploadedFtp) {
                      e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                    }
                  }}
                >
                  {isUploadingFtp ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : justUploadedFtp ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <UploadCloud className="w-3 h-3" style={{ strokeWidth: 2.2 }} />
                  )}
                  <span>{isUploadingFtp ? 'Sending...' : justUploadedFtp ? 'Sent!' : 'Send File to Microstock site'}</span>
                </button>
              )}
            </div>
          </div>
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
