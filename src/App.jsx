import { useState, useEffect } from 'react'
import { ApiKeyManager } from './components/ApiKeyManager'
import { ImageWorkflow } from './components/MetadataGenerator'
import { PromptSettings } from './components/PromptSettings'
import { ImageToPrompt } from './components/ImageToPrompt'
import { BackgroundRemover } from './components/BackgroundRemover'
import { VectorMagic } from './components/VectorMagic'
import { FtpUploader } from './components/FtpUploader'
import { FtpConfigManager } from './components/FtpConfigManager'
import { EpsPreviewGenerator } from './components/EpsPreviewGenerator'
import { ImageUpscaler } from './components/ImageUpscaler'
import { AiImageGenerator } from './components/AiImageGenerator'
import { PromptEnginePage } from './components/PromptEngine/PromptEnginePage'
import { Sparkles, Zap, Image as ImageIcon, Eraser, Box, ChevronLeft, ChevronRight, Server, Key, Camera, Maximize, Cpu, Wand2 } from 'lucide-react'
import { motion } from 'framer-motion'

const tabVariants = {
  active: (isFlexColumn) => ({
    opacity: 1, 
    pointerEvents: 'auto', 
    display: isFlexColumn ? 'flex' : 'block'
  }),
  inactive: { 
    opacity: 0, 
    pointerEvents: 'none', 
    transitionEnd: { display: 'none' } 
  }
};

const TabWrapper = ({ active, children, isFlexColumn, padding }) => (
  <motion.div
    custom={isFlexColumn}
    variants={tabVariants}
    initial={active ? "active" : "inactive"}
    animate={active ? "active" : "inactive"}
    transition={{ duration: 0.15, ease: 'linear' }}
    style={{
      gridArea: '1 / 1 / 2 / 2',
      flexDirection: isFlexColumn ? 'column' : undefined,
      width: '100%',
      height: '100%',
      padding: padding || 0,
      overflow: active ? 'auto' : 'hidden'
    }}
  >
    {children}
  </motion.div>
);

const SidebarIcon = ({ icon: Icon, color, active }) => {
  return (
    <div style={{
      width: '24px',
      height: '24px',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: active ? color : `${color}22`,
      boxShadow: active ? `0 2px 6px ${color}40` : 'none',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      flexShrink: 0,
      position: 'relative',
      zIndex: 1,
    }}
    className="sidebar-icon-badge"
    >
      <Icon style={{ width: '13px', height: '13px', color: active ? '#ffffff' : color }} />
    </div>
  )
}

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
    titleMaxChars: 70,
    descMaxChars: 100,
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
    titleMinChars: 25, 
    descMinChars: 50, 
    securityScanEnabled: true,
    promptSimilarityMode: 'Exact Match',
    targetModel: 'ChatGPT',
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
                    <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0 }}> - Batch Image and Video Metadata Editor</span>
                  </h1>
                  <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', margin: 0, fontWeight: 500 }}>AI Vision Engine</p>
                </div>
              )}
            </div>

            {sidebarOpen && (
              <button 
                id="api-keys-btn"
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
        </div>
        
        {/* MIDDLE SCROLLABLE SECTION */}
        <div style={{
          flex: 1,
          height: 'calc(100vh - 12.5rem)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          overflowY: 'auto',
          paddingRight: '4px',
        }} className="sidebar-middle-scroll scrollbar-thin">
          {/* NAVIGATION — outer wrapper clips blobs, inner nav is transparent so backdrop-filter works */}
          <div style={{
            position: 'relative',
            borderRadius: '0.65rem',
            overflow: 'hidden',   /* ← clips blobs, prevents leaking */
            border: '1px solid var(--glass-border)',
            flexShrink: 0, // CRITICAL: prevent flex engine from shrinking the nav buttons
          }}>
            {/* Ambient glow blobs — inside the overflow:hidden wrapper so they never leak */}
            <div aria-hidden="true" style={{
              position: 'absolute', top: '-25%', left: '-15%',
              width: '75%', height: '50%',
              borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.35)',
              filter: 'blur(36px)',
              pointerEvents: 'none', zIndex: 0,
            }} />
            <div aria-hidden="true" style={{
              position: 'absolute', bottom: '-15%', right: '-15%',
              width: '65%', height: '50%',
              borderRadius: '50%',
              background: 'rgba(236, 72, 153, 0.30)',
              filter: 'blur(36px)',
              pointerEvents: 'none', zIndex: 0,
            }} />
            <div aria-hidden="true" style={{
              position: 'absolute', top: '40%', left: '15%',
              width: '55%', height: '35%',
              borderRadius: '50%',
              background: 'rgba(6, 182, 212, 0.20)',
              filter: 'blur(30px)',
              pointerEvents: 'none', zIndex: 0,
            }} />

            {/* Nav container — transparent bg so blobs show through for backdrop-filter */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.55)',   /* semi-transparent so blobs are visible */
              borderRadius: '0.65rem',
              padding: '0.2rem 0.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.08rem',
              position: 'relative',
              zIndex: 1,
            }}>
              {[
                { id: 'metadata', icon: Zap, label: 'Metadata Generator', color: '#8b5cf6' },
                { id: 'promptengine', icon: Wand2, label: 'Prompt Generator', color: '#14b8a6' },
                { id: 'prompt', icon: ImageIcon, label: 'Image to Prompt', color: '#ec4899' },
                { id: 'epspreview', icon: Camera, label: 'Auto EPS Preview', color: '#10b981' },
                { id: 'removebg', icon: Eraser, label: 'Background Remover', color: '#ef4444' },
                { id: 'vector', icon: Box, label: 'Vector Magic', color: '#f59e0b' },
                { id: 'upscale', icon: Maximize, label: 'AI Image Upscaler', color: '#3b82f6' },
                { id: 'aiimage', icon: Cpu, label: 'Cloud GPU Image Gen', color: '#06b6d4' },
                { id: 'ftp', icon: Server, label: 'FTP Upload System', color: '#6366f1' },
              ].map(tab => {
                const isActive = activeTab === tab.id;
                return (
                <button
                  key={tab.id}
                  className="sidebar-nav-btn"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    /* backdrop-filter blurs the blobs visible through the semi-transparent nav bg */
                    background: isActive ? 'rgba(255, 255, 255, 0.30)' : 'transparent',
                    backdropFilter: isActive ? 'blur(20px) saturate(180%)' : 'none',
                    WebkitBackdropFilter: isActive ? 'blur(20px) saturate(180%)' : 'none',
                    color: isActive ? '#1a1a2e' : 'var(--text-2)',
                    border: isActive ? '1px solid rgba(255, 255, 255, 0.6)' : '1px solid transparent',
                    padding: sidebarOpen ? '0.35rem 0.5rem' : '0.35rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.73rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarOpen ? 'flex-start' : 'center',
                    gap: '0.4rem',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: isActive
                      ? `0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8), 0 0 0 0.5px ${tab.color}25`
                      : 'none',
                  }}
                >
                  <SidebarIcon icon={tab.icon} color={tab.color} active={isActive} />
                  {sidebarOpen && <span style={{ position: 'relative', zIndex: 1 }}>{tab.label}</span>}
                </button>
              )})}
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
        </div>

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
      <main className="dashboard-main" style={{ position: 'relative', overflow: 'hidden' }}>
        <TabWrapper active={activeTab === 'metadata'}>
          <ImageWorkflow 
            apiKeys={apiKeys} 
            apiProvider={apiProvider} 
            promptSettings={promptSettings} 
            setPromptSettings={setPromptSettings} 
            ftpConfigs={ftpConfigs} 
          />
        </TabWrapper>
        
        <TabWrapper active={activeTab === 'promptengine'}>
          <PromptEnginePage apiKeys={apiKeys} apiProvider={apiProvider} />
        </TabWrapper>
        
        <TabWrapper active={activeTab === 'prompt'}>
          <ImageToPrompt apiKeys={apiKeys} apiProvider={apiProvider} promptSettings={promptSettings} setPromptSettings={setPromptSettings} />
        </TabWrapper>
        
        <TabWrapper active={activeTab === 'removebg'}>
          <BackgroundRemover />
        </TabWrapper>
        
        <TabWrapper active={activeTab === 'ftp'} isFlexColumn={true} padding="1rem">
          <FtpUploader 
            ftpConfigs={ftpConfigs} 
            setFtpConfigs={setFtpConfigs}
            editingConfig={editingFtpConfig}
            setEditingConfig={setEditingFtpConfig}
          />
        </TabWrapper>

        <TabWrapper active={activeTab === 'vector'}>
          <VectorMagic />
        </TabWrapper>
        
        <TabWrapper active={activeTab === 'upscale'}>
          <ImageUpscaler />
        </TabWrapper>
        
        <TabWrapper active={activeTab === 'aiimage'}>
          <AiImageGenerator apiKeys={apiKeys} apiProvider={apiProvider} />
        </TabWrapper>
        
        <TabWrapper active={activeTab === 'epspreview'}>
          <EpsPreviewGenerator />
        </TabWrapper>
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
