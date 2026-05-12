import { useState, useEffect } from "react";
import { Plus, Trash2, Key, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";

const PROVIDERS = [
  { id: "gemini",     label: "Gemini",     icon: "✦" },
  { id: "groq",       label: "Groq",       icon: "⚡" },
  { id: "openrouter", label: "OpenRouter", icon: "🌐" },
  { id: "openai",     label: "OpenAI",     icon: "🧠" },
  { id: "mistral",    label: "Mistral",    icon: "🌪" },
];

export function ApiKeyManager({ onKeysChange, provider, onProviderChange }) {
  const [allKeys, setAllKeys] = useState(() => {
    const saved = localStorage.getItem("all_api_keys");
    if (saved) return JSON.parse(saved);
    const oldGemini = localStorage.getItem("gemini_keys");
    return {
      gemini: oldGemini ? JSON.parse(oldGemini) : [],
      groq: [], openrouter: [], openai: [], mistral: []
    };
  });

  const [newKey, setNewKey]       = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const activeKeys = allKeys[provider] || [];
  const totalKeys  = Object.values(allKeys).reduce((a, b) => a + b.length, 0);

  useEffect(() => {
    localStorage.setItem("all_api_keys", JSON.stringify(allKeys));
    onKeysChange(activeKeys);
  }, [allKeys, provider]);

  const addKey = () => {
    const trimmed = newKey.trim();
    if (trimmed && !activeKeys.includes(trimmed)) {
      setAllKeys(prev => ({ ...prev, [provider]: [...(prev[provider] || []), trimmed] }));
      setNewKey("");
    }
  };

  const removeKey = (index) =>
    setAllKeys(prev => ({ ...prev, [provider]: prev[provider].filter((_, i) => i !== index) }));

  const currentProvider = PROVIDERS.find(p => p.id === provider);

  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--glass-border)',
      borderRadius: '0.75rem',
      overflow: 'hidden',
      boxShadow: 'var(--glass-shadow)'
    }}>
      {/* ── Header (always visible) ── */}
      <button
        onClick={() => setIsExpanded(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '0.75rem 1rem',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-1)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Key style={{ width: '0.95rem', height: '0.95rem', color: 'var(--primary)' }} />
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>API Keys</span>
          {/* Current provider badge */}
          <span style={{
            fontSize: '0.68rem', fontWeight: 600, padding: '0.1rem 0.45rem',
            borderRadius: '999px', background: 'var(--primary)', color: '#fff',
            marginLeft: '0.25rem'
          }}>
            {currentProvider?.icon} {currentProvider?.label}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
            {activeKeys.length > 0 ? `(${activeKeys.length})` : ''}
          </span>
        </div>
        {isExpanded
          ? <ChevronUp style={{ width: '0.9rem', height: '0.9rem', color: 'var(--text-3)' }} />
          : <ChevronDown style={{ width: '0.9rem', height: '0.9rem', color: 'var(--text-3)' }} />
        }
      </button>

      {/* ── Expanded body ── */}
      {isExpanded && (
        <div style={{ padding: '0 0.9rem 0.9rem', borderTop: '1px solid var(--glass-border)' }}>

          {/* Provider pill selector */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => onProviderChange(p.id)}
                style={{
                  fontSize: '0.7rem', fontWeight: 600,
                  padding: '0.25rem 0.6rem', borderRadius: '999px',
                  border: '1px solid',
                  borderColor: provider === p.id ? 'var(--primary)' : 'var(--glass-border)',
                  background: provider === p.id ? 'var(--primary)' : 'transparent',
                  color: provider === p.id ? '#fff' : 'var(--text-2)',
                  cursor: 'pointer', transition: 'all 0.15s'
                }}
              >
                {p.icon} {p.label}
              </button>
            ))}
          </div>

          {/* Add key input */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <input
              type="password"
              placeholder={`${currentProvider?.label} API key...`}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addKey()}
              style={{
                flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.78rem',
                background: 'var(--surface-2)', border: '1px solid var(--glass-border)',
                borderRadius: '0.4rem', color: 'var(--text-1)', outline: 'none'
              }}
            />
            <button
              onClick={addKey}
              style={{
                padding: '0.4rem 0.7rem', borderRadius: '0.4rem',
                background: 'var(--primary)', border: 'none',
                color: '#fff', cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', fontWeight: 600
              }}
            >
              <Plus style={{ width: '0.8rem', height: '0.8rem' }} /> Add
            </button>
          </div>

          {/* Saved keys – tiny chips */}
          {activeKeys.length === 0 ? (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', margin: 0 }}>
              No {currentProvider?.label} keys saved yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '100px', overflowY: 'auto' }}>
              {activeKeys.map((key, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.3rem 0.5rem', borderRadius: '0.4rem',
                  background: 'var(--surface-2)', border: '1px solid var(--glass-border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflow: 'hidden' }}>
                    <CheckCircle style={{ width: '0.75rem', height: '0.75rem', color: '#22c55e', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-2)' }}>
                      {key.substring(0, 6)}••••{key.slice(-3)}
                    </span>
                  </div>
                  <button onClick={() => removeKey(i)} style={{
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', color: 'var(--text-3)', padding: '0.1rem',
                    display: 'flex', alignItems: 'center'
                  }}>
                    <Trash2 style={{ width: '0.75rem', height: '0.75rem' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
