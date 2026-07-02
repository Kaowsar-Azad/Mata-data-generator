import React, { useState, useEffect } from "react";
import { Plus, Trash2, Key, CheckCircle, X, Shield, ExternalLink, Sparkles, Wind, Zap, Cpu, Network } from "lucide-react";

const PROVIDERS = [
  { id: "gemini",     label: "Google Gemini", icon: Sparkles, iconColor: "#6366f1", desc: "Google's most capable multimodal AI models", url: "https://aistudio.google.com/app/apikey" },
  { id: "mistral",    label: "Mistral AI",    icon: Wind,     iconColor: "#f97316", desc: "High performance open models", url: "https://console.mistral.ai/api-keys/" },
  { id: "groq",       label: "Groq",          icon: Zap,      iconColor: "#f59e0b", desc: "Fast LLM inference with OpenAI-compatible API", url: "https://console.groq.com/keys" },
  { id: "openai",     label: "OpenAI",        icon: Cpu,      iconColor: "#10b981", desc: "Powerful language models and vision capabilities", url: "https://platform.openai.com/api-keys" },
  { id: "openrouter", label: "OpenRouter",    icon: Network,  iconColor: "#3b82f6", desc: "Unified API to access multiple LLMs", url: "https://openrouter.ai/keys" },
];

export function ApiKeyManager({ isOpen, onClose, onKeysChange, provider, onProviderChange }) {
  const activeProviders = Array.isArray(provider) ? provider : [provider].filter(Boolean);
  const [viewedProvider, setViewedProvider] = useState(activeProviders[0] || 'gemini');

  const [allKeys, setAllKeys] = useState(() => {
    const saved = localStorage.getItem("all_api_keys");
    if (saved) return JSON.parse(saved);
    const oldGemini = localStorage.getItem("gemini_keys");
    return {
      gemini: oldGemini ? JSON.parse(oldGemini) : [],
      groq: [], openrouter: [], openai: [], mistral: []
    };
  });

  const [newKey, setNewKey] = useState("");

  const activeKeys = allKeys[viewedProvider] || [];

  useEffect(() => {
    localStorage.setItem("all_api_keys", JSON.stringify(allKeys));
    
    const combinedKeys = [];
    activeProviders.forEach(p => {
      (allKeys[p] || []).forEach(k => {
        combinedKeys.push({ provider: p, key: k });
      });
    });
    
    if (combinedKeys.length === 0 && viewedProvider) {
      (allKeys[viewedProvider] || []).forEach(k => {
        combinedKeys.push({ provider: viewedProvider, key: k });
      });
    }
    
    onKeysChange(combinedKeys);
  }, [allKeys, activeProviders, viewedProvider]);

  if (!isOpen) return null;

  const addKey = () => {
    const trimmed = newKey.trim();
    if (trimmed && !activeKeys.includes(trimmed)) {
      setAllKeys(prev => ({ ...prev, [viewedProvider]: [...(prev[viewedProvider] || []), trimmed] }));
      setNewKey("");
    }
  };

  const removeKey = (index) =>
    setAllKeys(prev => ({ ...prev, [viewedProvider]: prev[viewedProvider].filter((_, i) => i !== index) }));

  const currentProvider = PROVIDERS.find(p => p.id === viewedProvider);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--glass-border)',
        borderRadius: '1.25rem',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.1)',
        width: '100%',
        maxWidth: '780px',
        height: '520px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--glass-border)',
          background: 'var(--surface-2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Key style={{ width: '1.2rem', height: '1.2rem', color: 'var(--primary)' }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-1)' }}>
              API Settings
            </h2>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-3)',
              display: 'flex',
              padding: '0.4rem',
              borderRadius: '0.4rem',
              transition: 'all 0.15s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-1)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; }}
          >
            <X style={{ width: '1.1rem', height: '1.1rem' }} />
          </button>
        </div>

        {/* Body (Sidebar + Content) */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Left Sidebar (Providers) */}
          <div style={{
            width: '220px',
            borderRight: '1px solid var(--glass-border)',
            background: 'var(--surface-2)',
            padding: '1rem 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem',
            overflowY: 'auto'
          }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)', padding: '0 1.25rem', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
              PROVIDERS
            </div>
            {PROVIDERS.map(p => {
              const isViewed = viewedProvider === p.id;
              const isActive = activeProviders.includes(p.id);
              const IconComponent = p.icon;
              
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.75rem 1.25rem',
                    background: isViewed ? 'var(--primary-glow)' : 'transparent',
                    borderLeft: `3px solid ${isViewed ? 'var(--primary)' : 'transparent'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    opacity: isActive ? 1 : 0.45
                  }}
                  onClick={() => setViewedProvider(p.id)}
                  onMouseOver={(e) => {
                    if (!isViewed) e.currentTarget.style.background = 'var(--surface-3)';
                    if (!isActive) e.currentTarget.style.opacity = '0.75';
                  }}
                  onMouseOut={(e) => {
                    if (!isViewed) e.currentTarget.style.background = 'transparent';
                    if (!isActive) e.currentTarget.style.opacity = '0.45';
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (e.target.checked) {
                        onProviderChange([...activeProviders, p.id]);
                      } else {
                        onProviderChange(activeProviders.filter(id => id !== p.id));
                      }
                    }}
                    style={{
                      width: '1.1rem',
                      height: '1.1rem',
                      cursor: 'pointer',
                      accentColor: 'var(--primary)',
                      flexShrink: 0
                    }}
                    title="Enable this provider for metadata generation"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <IconComponent style={{ width: '1rem', height: '1rem', color: p.iconColor, flexShrink: 0 }} />
                    <span style={{
                      color: isViewed ? 'var(--text-1)' : 'var(--text-2)',
                      fontWeight: isViewed ? 700 : 500,
                      fontSize: '0.85rem'
                    }}>{p.label}</span>
                  </div>
                </div>
              )
            })}

            <div style={{ marginTop: 'auto', padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', color: 'var(--text-3)', fontSize: '0.7rem', lineHeight: 1.45 }}>
                <Shield style={{ width: '1.1rem', height: '1.1rem', color: '#10b981', flexShrink: 0, marginTop: '0.1rem' }} />
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.2rem', fontSize: '0.75rem' }}>Key & Security</div>
                  <span>Your API keys are stored securely in local browser storage. Requests are sent directly to AI providers, never through our servers.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Content */}
          <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
                  {currentProvider?.label}
                </h3>
                {activeProviders.includes(currentProvider?.id) ? (
                  <span style={{
                    background: 'rgba(16,185,129,0.1)',
                    color: 'var(--success)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    border: '1px solid rgba(16,185,129,0.2)'
                  }}>Active</span>
                ) : (
                  <span style={{
                    background: 'rgba(107, 114, 128, 0.1)',
                    color: 'var(--text-3)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    border: '1px solid rgba(107, 114, 128, 0.2)'
                  }}>Inactive</span>
                )}
              </div>
              
              <button
                onClick={() => {
                  if (window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(currentProvider?.url);
                  } else {
                    window.open(currentProvider?.url, '_blank');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--glass-border)',
                  background: 'transparent',
                  color: 'var(--text-2)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.borderColor = 'var(--text-3)'; }}
                onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
              >
                <ExternalLink style={{ width: '0.8rem', height: '0.8rem' }} /> Get API Key
              </button>
            </div>
            
            <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginBottom: '2rem' }}>
              {currentProvider?.desc}
            </p>

            {/* Input Row */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Key style={{ width: '0.8rem', height: '0.8rem' }} />
                API KEY
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="password"
                  placeholder={`Enter ${currentProvider?.label} API key...`}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addKey()}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1rem',
                    fontSize: '0.9rem',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '0.5rem',
                    color: 'var(--text-1)',
                    outline: 'none',
                    transition: 'all 0.2s',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
                />
                <button
                  onClick={addKey}
                  disabled={!newKey.trim()}
                  style={{
                    padding: '0 1.25rem',
                    borderRadius: '0.5rem',
                    background: newKey.trim() ? 'var(--primary)' : 'var(--surface-3)',
                    border: 'none',
                    color: newKey.trim() ? '#fff' : 'var(--text-3)',
                    cursor: newKey.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    transition: 'all 0.2s'
                  }}
                >
                  <Plus style={{ width: '1rem', height: '1rem' }} /> Add Key
                </button>
              </div>
            </div>

            {/* Stored Keys */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                Stored Keys ({activeKeys.length})
              </div>
              
              <div style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--glass-border)',
                borderRadius: '0.75rem',
                minHeight: '160px',
                padding: activeKeys.length === 0 ? '0' : '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                {activeKeys.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                    <Key style={{ width: '2rem', height: '2rem', marginBottom: '0.5rem', opacity: 0.5 }} />
                    <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>No keys stored yet</span>
                    <span style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>Add your {currentProvider?.label} API key above</span>
                  </div>
                ) : (
                  activeKeys.map((key, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.6rem 0.85rem', borderRadius: '0.5rem',
                      background: 'var(--surface-1)', border: '1px solid var(--glass-border)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <CheckCircle style={{ width: '1rem', height: '1rem', color: '#22c55e' }} />
                        <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--text-1)', letterSpacing: '0.05em' }}>
                          {key.substring(0, 8)}••••••••{key.slice(-4)}
                        </span>
                      </div>
                      <button 
                        onClick={() => removeKey(i)} 
                        style={{
                          background: 'transparent', border: 'none',
                          cursor: 'pointer', color: 'var(--text-3)', padding: '0.25rem',
                          display: 'flex', alignItems: 'center', borderRadius: '0.3rem',
                          transition: 'all 0.15s'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Trash2 style={{ width: '0.9rem', height: '0.9rem' }} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '0.6rem 1.5rem',
                  borderRadius: '0.5rem',
                  background: 'var(--text-1)',
                  color: 'var(--surface-1)',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'none'}
              >
                Done
              </button>
            </div>
            
          </div>
        </div>

        <style>{`
          @keyframes modalFadeIn {
            from { opacity: 0; transform: scale(0.97) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}
