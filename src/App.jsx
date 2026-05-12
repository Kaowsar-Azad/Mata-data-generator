import { useState } from 'react'
import { ApiKeyManager } from './components/ApiKeyManager'
import { ImageWorkflow } from './components/ImageWorkflow'
import { PromptSettings } from './components/PromptSettings'
import { ImageToPrompt } from './components/ImageToPrompt'
import { Sparkles, Zap, Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react'

function App() {
  const [apiKeys, setApiKeys] = useState([])
  const [apiProvider, setApiProvider] = useState('gemini')
  const [promptSettings, setPromptSettings] = useState({
    exportPlatform: 'General',
    titleMaxChars: 80,
    descMaxChars: 120,
    keywordCount: 48,
    singleWordKeywords: true,
    mediaTypeHint: 'None / Auto-detect',
    prefixEnabled: false,
    prefixText: '',
    suffixEnabled: false,
    suffixText: '',
    negTitleEnabled: false,
    negTitleWords: '',
    negKeywordsEnabled: false,
    negKeywords: '',
    customInstruction: ''
  })
  const [activeTab, setActiveTab] = useState('metadata')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="dashboard-layout">
      {/* ─── LEFT SIDEBAR ─── */}
      <aside className="dashboard-sidebar" style={{
        width: sidebarOpen ? undefined : '56px',
        minWidth: sidebarOpen ? undefined : '56px',
        transition: 'width 0.25s ease, min-width 0.25s ease'
      }}>
        
        {/* BRANDING */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', justifyContent: sidebarOpen ? 'flex-start' : 'center' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
            color: '#fff',
            padding: '0.4rem',
            borderRadius: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(37,99,235,0.3)'
          }}>
            <Sparkles style={{ width: '0.95rem', height: '0.95rem' }} />
          </div>
          {sidebarOpen && (
            <div style={{ overflow: 'hidden' }}>
              <h1 style={{ fontSize: '1rem', margin: 0, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Metadata<span style={{ color: 'var(--primary)' }}>Pro</span>
              </h1>
              <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', margin: 0, fontWeight: 500 }}>AI Vision Engine</p>
            </div>
          )}
        </div>

        {/* NAVIGATION */}
        <div style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--glass-border)',
          borderRadius: '0.65rem',
          padding: '0.3rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.15rem',
        }}>
          {[
            { id: 'metadata', icon: Zap, label: 'Metadata Generator' },
            { id: 'prompt', icon: ImageIcon, label: 'Image to Prompt' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: activeTab === tab.id ? 'var(--primary)' : 'transparent',
                color: activeTab === tab.id ? '#fff' : 'var(--text-2)',
                border: 'none',
                padding: sidebarOpen ? '0.45rem 0.65rem' : '0.45rem',
                borderRadius: '0.45rem',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
                gap: '0.45rem',
                transition: 'all 0.15s',
                ...(activeTab === tab.id ? { boxShadow: '0 1px 4px rgba(37,99,235,0.25)' } : {})
              }}
            >
              <tab.icon style={{ width: '0.85rem', height: '0.85rem', flexShrink: 0 }} />
              {sidebarOpen && tab.label}
            </button>
          ))}
        </div>

        {/* API KEYS */}
        {sidebarOpen && (
          <ApiKeyManager 
            onKeysChange={setApiKeys} 
            provider={apiProvider} 
            onProviderChange={setApiProvider} 
          />
        )}

        {/* METADATA SETTINGS */}
        {sidebarOpen && activeTab === 'metadata' && (
          <PromptSettings settings={promptSettings} setSettings={setPromptSettings} />
        )}

        {/* Collapse Button */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          style={{
            marginTop: 'auto',
            background: 'var(--surface-2)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-3)',
            padding: '0.35rem',
            borderRadius: '0.4rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            fontSize: '0.7rem',
            gap: '0.3rem',
            transition: 'all 0.15s'
          }}
        >
          {sidebarOpen ? <><ChevronLeft style={{ width: '0.75rem', height: '0.75rem' }} /> Collapse</> : <ChevronRight style={{ width: '0.75rem', height: '0.75rem' }} />}
        </button>

        {sidebarOpen && (
          <footer style={{ fontSize: '0.55rem', color: 'var(--text-3)', textAlign: 'center', padding: '0.25rem' }}>
            © 2026 MetadataPro · AI Vision
          </footer>
        )}
      </aside>

      {/* ─── MAIN WORKSPACE ─── */}
      <main className="dashboard-main">
        {activeTab === 'metadata' ? (
          <ImageWorkflow apiKeys={apiKeys} apiProvider={apiProvider} promptSettings={promptSettings} />
        ) : (
          <ImageToPrompt apiKeys={apiKeys} apiProvider={apiProvider} />
        )}
      </main>
    </div>
  )
}

export default App
