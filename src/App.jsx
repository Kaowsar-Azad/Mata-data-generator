import { useState, useEffect } from 'react'
import { ApiKeyManager } from './components/ApiKeyManager'
import { ImageWorkflow } from './components/ImageWorkflow'
import { PromptSettings } from './components/PromptSettings'
import { ImageToPrompt } from './components/ImageToPrompt'
import { BackgroundRemover } from './components/BackgroundRemover'
import { VectorMagic } from './components/VectorMagic'
import { FtpUploader } from './components/FtpUploader'
import { FtpConfigManager } from './components/FtpConfigManager'
import { EpsPreviewGenerator } from './components/EpsPreviewGenerator'
import { ImageUpscaler } from './components/ImageUpscaler'
import { AiImageGenerator } from './components/AiImageGenerator'
import { Sparkles, Zap, Image as ImageIcon, Eraser, Box, ChevronLeft, ChevronRight, Server, Key, Camera, Maximize, Cpu } from 'lucide-react'

function App() {
  const [apiKeys, setApiKeys] = useState(() => {
    try {
      const saved = localStorage.getItem("all_api_keys");
      const providerSaved = localStorage.getItem("selected_api_providers");
      if (saved) {
        const allKeys = JSON.parse(saved);
        const activeProviders = providerSaved ? JSON.parse(providerSaved) : ['gemini'];
        const combinedKeys = [];
        activeProviders.forEach(p => {
          (allKeys[p] || []).forEach(k => {
            combinedKeys.push({ provider: p, key: k });
          });
        });
        if (combinedKeys.length > 0) return combinedKeys;
        
        const firstProviderWithKeys = Object.keys(allKeys).find(p => allKeys[p] && allKeys[p].length > 0);
        if (firstProviderWithKeys) {
          return allKeys[firstProviderWithKeys].map(k => ({ provider: firstProviderWithKeys, key: k }));
        }
      }
    } catch (e) {
      console.error("Failed to load apiKeys from localStorage:", e);
    }
    return [];
  });
  const [apiProvider, setApiProvider] = useState(() => {
    try {
      const saved = localStorage.getItem("selected_api_providers");
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return ['gemini'];
  });
  const [ftpConfigs, setFtpConfigs] = useState([])
  const [promptSettings, setPromptSettings] = useState({
    smartMode: false,
    exportPlatform: 'General',
    titleMaxChars: 80,
    descMaxChars: 120,
    keywordCount: 48,
    singleWordKeywords: true,
    concurrentLimit: 2,
    mediaTypeHint: 'None / Auto-detect',
    prefixEnabled: false,
    prefixText: '',
    suffixEnabled: false,
    suffixText: '',
    negTitleEnabled: false,
    negTitleWords: '',
    negKeywordsEnabled: false,
    negKeywords: '',
    customInstruction: '',
    titleMinChars: 70, // New minimum title length
    descMinChars: 110, // New minimum description length
    securityScanEnabled: false,
    promptSimilarityMode: 'Exact Match',
  })
  const [activeTab, setActiveTab] = useState('metadata')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [editingFtpConfig, setEditingFtpConfig] = useState(null)
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false)

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getFtpConfig().then(savedConfigs => {
        if (savedConfigs && Array.isArray(savedConfigs)) {
          setFtpConfigs(savedConfigs);
        } else if (savedConfigs && savedConfigs.host) {
          setFtpConfigs([{ ...savedConfigs, id: 'legacy_1' }]);
        }
      });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("selected_api_providers", JSON.stringify(apiProvider));
  }, [apiProvider]);

  return (
    <div className="dashboard-layout">
      {/* ─── LEFT SIDEBAR ─── */}
      <aside className="dashboard-sidebar" style={{
        width: sidebarOpen ? undefined : '56px',
        minWidth: sidebarOpen ? undefined : '56px',
        transition: 'width 0.25s ease, min-width 0.25s ease'
      }}>
        
        {/* TOP SECTION (Fixed/Static) */}
        <div className="sidebar-top-section">
          {/* BRANDING */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', justifyContent: sidebarOpen ? 'space-between' : 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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

            {sidebarOpen && (
              <button 
                onClick={() => setIsApiKeyModalOpen(true)}
                title="API Keys"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  flexShrink: 0
                }}
                onMouseOver={(e) => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
              >
                <Key style={{ width: '0.9rem', height: '0.9rem' }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>API Keys</span>
              </button>
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
              { id: 'epspreview', icon: Camera, label: 'Auto EPS Preview' },
              { id: 'removebg', icon: Eraser, label: 'Background Remover' },
              { id: 'vector', icon: Box, label: 'Vector Magic' },
              { id: 'upscale', icon: Maximize, label: 'AI Image Upscaler' },
              { id: 'aiimage', icon: Cpu, label: 'Cloud GPU Image Gen' },
              { id: 'ftp', icon: Server, label: 'FTP Upload System' },
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
        </div>



        {/* FTP CONFIGURATIONS */}
        {sidebarOpen && activeTab === 'ftp' && (
          <FtpConfigManager 
            ftpConfigs={ftpConfigs}
            setFtpConfigs={setFtpConfigs}
            editingConfig={editingFtpConfig}
            setEditingConfig={setEditingFtpConfig}
            onStartEdit={(config) => {
              setActiveTab('ftp');
              setEditingFtpConfig(config);
            }}
          />
        )}

        {/* METADATA SETTINGS */}
        {sidebarOpen && (activeTab === 'metadata' || activeTab === 'prompt') && (
          <PromptSettings 
            settings={promptSettings} 
            setSettings={setPromptSettings} 
            activeTab={activeTab} 
            ftpConfigs={ftpConfigs}
            setEditingFtpConfig={setEditingFtpConfig}
            setActiveTab={setActiveTab}
          />
        )}

        {/* AI IMAGE SETTINGS PORTAL */}
        {sidebarOpen && activeTab === 'aiimage' && (
          <div id="ai-image-settings-portal" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}></div>
        )}

        {/* BOTTOM SECTION (Fixed/Static) */}
        <div className="sidebar-bottom-section">
          {/* Collapse Button */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{
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
              © 2026 MetadataPro v1.1.0 · AI Vision
            </footer>
          )}
        </div>
      </aside>

      {/* ─── MAIN WORKSPACE ─── */}
      <main className="dashboard-main">
        <div style={{ display: activeTab === 'metadata' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <ImageWorkflow 
            apiKeys={apiKeys} 
            apiProvider={apiProvider} 
            promptSettings={promptSettings} 
            setPromptSettings={setPromptSettings} 
            ftpConfigs={ftpConfigs} 
          />
        </div>
        <div style={{ display: activeTab === 'prompt' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <ImageToPrompt apiKeys={apiKeys} apiProvider={apiProvider} promptSettings={promptSettings} setPromptSettings={setPromptSettings} />
        </div>
        <div style={{ display: activeTab === 'removebg' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <BackgroundRemover />
        </div>
        <div style={{ display: activeTab === 'ftp' ? 'flex' : 'none', flexDirection: 'column', width: '100%', height: '100%', overflowY: 'auto', padding: '1rem' }}>
          <FtpUploader 
            ftpConfigs={ftpConfigs} 
            setFtpConfigs={setFtpConfigs}
            editingConfig={editingFtpConfig}
            setEditingConfig={setEditingFtpConfig}
          />
        </div>

        <div style={{ display: activeTab === 'vector' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <VectorMagic />
        </div>
        <div style={{ display: activeTab === 'upscale' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <ImageUpscaler />
        </div>
        <div style={{ display: activeTab === 'aiimage' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <AiImageGenerator apiKeys={apiKeys} apiProvider={apiProvider} />
        </div>
        <div style={{ display: activeTab === 'epspreview' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <EpsPreviewGenerator />
        </div>
      </main>

      {/* ─── MODALS ─── */}
      <ApiKeyManager 
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onKeysChange={setApiKeys} 
        provider={apiProvider} 
        onProviderChange={setApiProvider} 
      />
    </div>
  )
}

export default App
// Refresh UI bundle cache trigger
