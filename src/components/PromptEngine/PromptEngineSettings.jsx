import React, { useState } from 'react';
import { SlidersHorizontal, ChevronUp, ChevronDown, Zap, Cpu } from 'lucide-react';

export function PromptEngineSettings({ activeMode, onModeChange }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="ps-wrapper" style={{ marginTop: '0.5rem' }}>
      {/* Header Toggle */}
      <button 
        type="button"
        aria-label={isOpen ? "Collapse settings" : "Expand settings"}
        className="ps-header" 
        onClick={() => setIsOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.7rem 1.0rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-1)',
          transition: 'background 0.2s',
          outline: 'none'
        }}
      >
        <div className="ps-header-left" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.88rem' }}>
          <SlidersHorizontal style={{ width: "0.95rem", height: "0.95rem" }} />
          <span>AI Prompt Settings</span>
        </div>
        {isOpen ? <ChevronUp style={{ width: "0.85rem", height: "0.85rem" }} /> : <ChevronDown style={{ width: "0.85rem", height: "0.85rem" }} />}
      </button>

      {/* Body */}
      {isOpen && (
        <div className="ps-body" style={{ padding: '0.6rem 0.85rem 1rem', borderTop: '1px solid var(--glass-border)' }}>
          {/* ── Mode Selection (Similar to Similarity Mode) ── */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div className="ps-section-label" style={{ 
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-3)',
              marginBottom: '0.4rem'
            }}>
              Generation Mode
            </div>
            <div style={{
              display: 'flex',
              background: 'var(--surface-2)',
              border: '1px solid var(--glass-border)',
              borderRadius: '0.5rem',
              padding: '2px',
              gap: '2px'
            }}>
              <button
                type="button"
                aria-label="Select Standard Mode"
                onClick={() => onModeChange('local')}
                style={{
                  flex: 1,
                  background: activeMode === 'local' ? 'var(--primary)' : 'transparent',
                  color: activeMode === 'local' ? '#fff' : 'var(--text-2)',
                  border: 'none',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '0.4rem',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'all 0.2s',
                  boxShadow: activeMode === 'local' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none',
                  outline: 'none'
                }}
              >
                <Zap style={{ width: '0.85rem', height: '0.85rem' }} />
                Standard Mode
              </button>
              <button
                type="button"
                aria-label="Select AI Mode"
                onClick={() => onModeChange('ai')}
                style={{
                  flex: 1,
                  background: activeMode === 'ai' ? 'var(--primary)' : 'transparent',
                  color: activeMode === 'ai' ? '#fff' : 'var(--text-2)',
                  border: 'none',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '0.4rem',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'all 0.2s',
                  boxShadow: activeMode === 'ai' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none',
                  outline: 'none'
                }}
              >
                <Cpu style={{ width: '0.85rem', height: '0.85rem' }} />
                AI Mode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
