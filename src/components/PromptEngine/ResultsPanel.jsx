import React from 'react';
import { Copy, Download, FileText, Sparkles, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── Light Glassmorphism Tokens ──────────────────────────── */
const GLASS_BG     = 'rgba(255, 255, 255, 0.58)';
const GLASS_BORDER = 'rgba(0, 0, 0, 0.06)';
const CARD_BG      = 'rgba(255, 255, 255, 0.55)';
const CARD_BORDER  = 'rgba(0, 0, 0, 0.06)';
const CARD_HOVER   = 'rgba(0, 0, 0, 0.09)';

export const ResultsPanel = ({ prompts, onClear, isGenerating, statusText }) => {
  const [copiedId, setCopiedId] = React.useState(null);
  const [copiedAll, setCopiedAll] = React.useState(false);

  const handleCopySingle = (prompt) => {
    navigator.clipboard.writeText(prompt.text).catch(() => {});
    setCopiedId(prompt.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = () => {
    if (!prompts.length) return;
    navigator.clipboard.writeText(prompts.map(p => p.text).join('\n\n')).catch(() => {});
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleExportCSV = () => {
    if (!prompts.length) return;
    const csv = "Prompt\n" + prompts.map(p => `"${p.text.replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "generated_prompts.csv";
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleExportTXT = () => {
    if (!prompts.length) return;
    const blob = new Blob([prompts.map(p => p.text).join('\n\n')], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "generated_prompts.txt";
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  /* ─── Small action button ─── */
  const ActionBtn = ({ onClick, disabled, icon: Icon, label, accentColor }) => {
    const [hov, setHov] = React.useState(false);
    return (
      <button
        onClick={onClick} disabled={disabled}
        onMouseOver={() => setHov(true)} onMouseOut={() => setHov(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          padding: '5px 9px', borderRadius: '8px',
          border: `1px solid ${hov && !disabled ? accentColor + '40' : 'rgba(0,0,0,0.06)'}`,
          background: hov && !disabled ? accentColor + '0a' : 'rgba(255,255,255,0.5)',
          color: hov && !disabled ? accentColor : '#6b7280',
          fontSize: '0.68rem', fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          transition: 'all .18s', fontFamily: 'inherit', whiteSpace: 'nowrap',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <Icon style={{ width: '11px', height: '11px' }} />
        {label}
      </button>
    );
  };

  return (
    <div style={{
      flex: 1,
      height: '100%',
      minHeight: 0,
      background: GLASS_BG,
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      border: `1px solid ${GLASS_BORDER}`,
      borderRadius: '16px',
      padding: '14px 14px 10px',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 24px rgba(0,0,0,0.03)',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '10px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            Generated Prompts
          </h2>
          {prompts.length > 0 && (
            <span style={{
              background: 'var(--primary-glow)',
              color: 'var(--primary)',
              border: '1px solid rgba(37,99,235,0.15)',
              fontSize: '0.64rem', fontWeight: 700,
              padding: '1px 8px', borderRadius: '999px',
            }}>
              {prompts.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {prompts.length > 0 && (
            <ActionBtn onClick={onClear} disabled={isGenerating} icon={X} label="Clear" accentColor="#ef4444" />
          )}
          <ActionBtn onClick={handleCopyAll} disabled={!prompts.length || isGenerating} icon={copiedAll ? Check : Copy} label={copiedAll ? "Copied!" : "Copy All"} accentColor="#8b5cf6" />
          <ActionBtn onClick={handleExportCSV} disabled={!prompts.length || isGenerating} icon={FileText} label="CSV" accentColor="#10b981" />
          <ActionBtn onClick={handleExportTXT} disabled={!prompts.length || isGenerating} icon={Download} label="TXT" accentColor="#3b82f6" />
        </div>
      </div>

      {/* Separator */}
      <div style={{ height: '1px', background: 'rgba(0,0,0,0.05)', marginBottom: '10px', flexShrink: 0 }} />

      {/* ── Content Area ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column' }}>
        {isGenerating ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '14px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              border: '3px solid rgba(37,99,235,0.12)',
              borderTopColor: 'var(--primary)',
              animation: 'spin 1s linear infinite',
            }} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text-1)', fontWeight: 700, fontSize: '0.88rem', marginBottom: '4px' }}>Building Variations</p>
              <p style={{ color: 'var(--primary)', fontSize: '0.72rem', animation: 'pulse 1.5s ease-in-out infinite' }}>{statusText}</p>
            </div>
          </div>
        ) : prompts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '6px' }}>
            <AnimatePresence>
              {prompts.map((prompt, index) => (
                <motion.div
                  key={prompt.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: index * 0.04, duration: 0.3, ease: 'easeOut' }}
                  style={{
                    background: CARD_BG,
                    border: `1px solid ${CARD_BORDER}`,
                    borderRadius: '12px',
                    padding: '12px 14px',
                    position: 'relative',
                    transition: 'border-color .2s, box-shadow .2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = CARD_HOVER;
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = CARD_BORDER;
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
                  }}
                >
                  {/* Number badge */}
                  <div style={{
                    position: 'absolute', top: '11px', left: '12px',
                    width: '20px', height: '20px', borderRadius: '6px',
                    background: 'var(--primary-glow)',
                    border: '1px solid rgba(37,99,235,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.58rem', fontWeight: 800, color: 'var(--primary)',
                  }}>
                    {index + 1}
                  </div>

                  <p style={{
                    fontSize: '0.78rem', color: 'var(--text-2)',
                    lineHeight: 1.7, margin: 0,
                    paddingLeft: '28px', paddingRight: '30px',
                    userSelect: 'text',
                  }}>
                    {prompt.text}
                  </p>

                  {/* Copy button */}
                  <button
                    onClick={() => handleCopySingle(prompt)}
                    title="Copy prompt"
                    style={{
                      position: 'absolute', top: '10px', right: '10px',
                      padding: '4px', borderRadius: '6px',
                      border: '1px solid rgba(0,0,0,0.06)',
                      background: 'rgba(255,255,255,0.7)',
                      color: copiedId === prompt.id ? '#10b981' : '#9ca3af',
                      cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      transition: 'all .15s', fontFamily: 'inherit',
                    }}
                  >
                    {copiedId === prompt.id
                      ? <Check style={{ width: '12px', height: '12px' }} />
                      : <Copy style={{ width: '12px', height: '12px' }} />
                    }
                  </button>


                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: '100%',
              maxWidth: '440px',
              background: 'rgba(255, 255, 255, 0.45)',
              border: '1px solid rgba(0, 0, 0, 0.05)',
              borderRadius: '16px',
              padding: '40px 20px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              textAlign: 'center',
            }}>
              <div style={{
                width: '46px', height: '46px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.75)',
                border: '1px solid rgba(0,0,0,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '12px',
              }}>
                <Sparkles style={{ width: '18px', height: '18px', color: 'var(--text-3)' }} />
              </div>
              <div>
                <p style={{ color: 'var(--text-2)', fontWeight: 600, fontSize: '0.8rem', marginBottom: '4px' }}>No prompts yet</p>
                <p style={{ color: 'var(--text-3)', fontSize: '0.7rem', margin: 0 }}>Configure settings on the left and click Generate.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
