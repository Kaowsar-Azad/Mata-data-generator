import { useState } from 'react'
import { ApiKeyManager } from './components/ApiKeyManager'
import { ImageWorkflow } from './components/ImageWorkflow'
import { PromptSettings } from './components/PromptSettings'
import { Sparkles, Zap } from 'lucide-react'

function App() {
  const [apiKeys, setApiKeys] = useState([])
  const [promptSettings, setPromptSettings] = useState({
    titleMaxChars: 70,
    descMaxChars: 150,
    keywordCount: 48,
    prefixEnabled: false,
    prefixText: '',
    suffixEnabled: false,
    suffixText: '',
    negTitleEnabled: false,
    negTitleWords: '',
    negKeywordsEnabled: false,
    negKeywords: ''
  })

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* ─── HERO HEADER ─── */}
      <header className="text-center animate-fade-in" style={{ paddingBottom: '3.5rem', paddingTop: '1.5rem' }}>

        <div className="hero-badge">
          <Sparkles style={{ width: '0.7rem', height: '0.7rem' }} />
          AI-Powered · Adobe Stock · Shutterstock · Microstock
        </div>

        <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          Image Metadata&nbsp;
          <span style={{
            background: 'linear-gradient(135deg, #00f2fe, #4facfe, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Create
          </span>
        </h1>

        <p className="text-muted" style={{
          maxWidth: '540px',
          margin: '1rem auto 0',
          fontSize: '1.05rem',
          lineHeight: 1.7,
          color: 'rgba(166,164,194,0.9)'
        }}>
          Generate SEO-optimized titles, descriptions & keywords for your
          vector illustrations and stock photos — in seconds.
        </p>

        {/* feature pills */}
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
          {['EPS Support', 'Batch Processing', 'CSV Export', '45-50 Keywords'].map(f => (
            <span key={f} style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.3rem 0.8rem',
              borderRadius: '999px',
              background: 'rgba(124,111,247,0.1)',
              border: '1px solid rgba(124,111,247,0.2)',
              color: 'rgba(167,139,250,0.9)',
              letterSpacing: '0.03em'
            }}>
              {f}
            </span>
          ))}
        </div>

        {/* animated gradient line under heading */}
        <div style={{
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(124,111,247,0.4), rgba(244,114,182,0.3), transparent)',
          marginTop: '2.5rem',
          maxWidth: '600px',
          margin: '2.5rem auto 0'
        }} />
      </header>

      {/* ─── MAIN CONTENT ─── */}
      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* API Keys */}
        <ApiKeyManager onKeysChange={setApiKeys} />

        {/* Metadata Settings */}
        <PromptSettings settings={promptSettings} setSettings={setPromptSettings} />

        {/* Workspace */}
        <section>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            marginBottom: '1rem'
          }}>
            <Zap style={{ width: '1.1rem', height: '1.1rem', color: 'var(--secondary)' }} />
            <h2 style={{ margin: 0 }}>Image Workspace</h2>
          </div>
          <ImageWorkflow apiKeys={apiKeys} promptSettings={promptSettings} />
        </section>

      </main>

      {/* ─── FOOTER ─── */}
      <footer className="site-footer">
        <p>
          © 2026 &nbsp;
          <span style={{ color: 'var(--primary-light)', fontWeight: 600 }}>
            Image Metadata Create
          </span>
          &nbsp;·&nbsp; Specifically designed for Adobe Stock Contributors
        </p>
        <p style={{ marginTop: '0.4rem', opacity: 0.55 }}>
          Powered by Google Gemini Vision AI
        </p>
      </footer>
    </div>
  )
}

export default App
