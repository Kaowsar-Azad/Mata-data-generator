import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { Upload, Download, Trash2, Loader2, Sparkles, Image as ImageIcon, KeyRound } from 'lucide-react';
import { removeBackgroundViaRemoveBgProxy, removeBackgroundViaLocalServer } from '../../services/removeBgProxy.js';
import { saveKeySecurely, getKeySecurely } from '../../services/secureStorage.js';

/* ─── Light Glassmorphism Tokens ──────────────────────────── */
const GLASS_BG      = 'rgba(255, 255, 255, 0.62)';
const GLASS_BORDER  = 'rgba(0, 0, 0, 0.06)';
const FIELD_BG      = 'rgba(255, 255, 255, 0.55)';
const FIELD_BORDER  = 'rgba(0, 0, 0, 0.08)';

export const BackgroundRemover = () => {
  const [originalFile, setOriginalFile] = useState(null);
  const [originalUrl, setOriginalUrl] = useState(null);
  const [processedUrl, setProcessedUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState('local'); // 'local' | 'api'
  const [apiKey, setApiKey] = useState('');
  const fileInputRef = useRef(null);

  // Load keys on mount
  useEffect(() => {
    const loadKeys = async () => {
        const secureApi = await getKeySecurely('removebg');
      if (secureApi) {
        setApiKey(secureApi);
      } else {
        const storedApi = localStorage.getItem('removebg_api_key');
        if (storedApi) setApiKey(storedApi);
      }
    };
    loadKeys();
  }, []);

  const persistApiKey = async (val) => {
    setApiKey(val);
    localStorage.setItem('removebg_api_key', val);
    await saveKeySecurely('removebg', val);
  };

  const schemaMarkup = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'MetadataPro AI Background Remover',
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web',
    description: 'Premium online and offline background remover.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setOriginalFile(file);
    setOriginalUrl(URL.createObjectURL(file));
    setProcessedUrl(null);
    setProgress(0);
  };

  const handleRemoveBackground = async () => {
    if (!originalFile) return;
    setIsProcessing(true);
    setProgress(0);
    
    // Fake progress interval
    const interval = setInterval(() => {
      setProgress((prev) => (prev < 0.9 ? prev + 0.1 : prev));
    }, 800);

    try {
      let resultBlob;
      if (mode === 'local') {
        resultBlob = await removeBackgroundViaLocalServer(originalFile);
      } else {
        const trimmed = apiKey.trim();
        if (!trimmed) {
          throw new Error("দয়া করে remove.bg API key প্রবেশ করান।");
        }
        resultBlob = await removeBackgroundViaRemoveBgProxy(originalFile, trimmed);
      }
      
      clearInterval(interval);
      setProgress(1.0);
      setProcessedUrl(URL.createObjectURL(resultBlob));
    } catch (err) {
      clearInterval(interval);
      alert(err.message || "Failed to remove background. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedUrl) return;
    const link = document.createElement('a');
    link.href = processedUrl;
    link.download = `removed-bg-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <HelmetProvider>
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        padding: '12px 14px 10px',
        boxSizing: 'border-box', gap: '10px',
        overflow: 'hidden',
      }}>
        <Helmet>
          <title>AI Background Remover | MetadataPro</title>
          <meta name="description" content="Free offline AI background remover for photos and images." />
          <script type="application/ld+json">{JSON.stringify(schemaMarkup)}</script>
        </Helmet>
        
        <h1 style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }}>
          MetadataPro AI Background Remover
        </h1>

        {/* Mode Selector Row */}
        <div style={{
          display: 'flex', gap: '16px', alignItems: 'center',
          background: GLASS_BG, border: `1px solid ${GLASS_BORDER}`,
          borderRadius: '12px', padding: '12px 24px', flexWrap: 'wrap',
          backdropFilter: 'blur(20px)',
        }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-1)' }}>মোড:</span>
          
          <button
            onClick={() => setMode('local')}
            style={{
              padding: '6px 14px', borderRadius: '8px',
              border: mode === 'local' ? '1px solid var(--primary)' : `1px solid ${FIELD_BORDER}`,
              background: mode === 'local' ? 'var(--primary)' : FIELD_BG,
              color: mode === 'local' ? 'white' : 'var(--text-1)',
              fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
              display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <Sparkles size={14} /> লোকাল প্রিমিয়াম ইঞ্জিন (Recraft Quality - অফলাইন)
          </button>
          
          <button
            onClick={() => setMode('api')}
            style={{
              padding: '6px 14px', borderRadius: '8px',
              border: mode === 'api' ? '1px solid var(--primary)' : `1px solid ${FIELD_BORDER}`,
              background: mode === 'api' ? 'var(--primary)' : FIELD_BG,
              color: mode === 'api' ? 'white' : 'var(--text-1)',
              fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
              display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <Sparkles size={14} /> remove.bg API (প্রিমিয়াম)
          </button>

          {/* Dynamic Settings Inputs */}
          {mode === 'api' && (
            <input
              type="password"
              placeholder="remove.bg API Key"
              value={apiKey}
              onChange={(e) => persistApiKey(e.target.value)}
              style={{
                padding: '6px 12px', borderRadius: '8px',
                border: `1px solid ${FIELD_BORDER}`, background: FIELD_BG,
                color: 'var(--text-1)',
                fontSize: '0.8rem', minWidth: '220px', outline: 'none'
              }}
            />
          )}
        </div>

        <div style={{
          flex: 1, display: 'flex', gap: '12px', minHeight: 0,
          background: GLASS_BG,
          backdropFilter: 'blur(20px)',
          border: `1px solid ${GLASS_BORDER}`,
          borderRadius: '16px',
          padding: '24px',
        }}>
          {/* Main workspace */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {!originalUrl ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%', maxWidth: '500px', height: '300px',
                  border: `2px dashed ${FIELD_BORDER}`,
                  borderRadius: '16px',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', background: FIELD_BG,
                  gap: '16px', transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.background = 'rgba(37,99,235,0.05)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = FIELD_BORDER;
                  e.currentTarget.style.background = FIELD_BG;
                }}
              >
                <Upload size={48} color="var(--primary)" />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-1)' }}>Click or Drag to Upload</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-2)' }}>JPEG, PNG, WebP supported</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', width: '100%', gap: '20px', height: '100%', minHeight: 0 }}>
                {/* Original */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-1)' }}>Original</h3>
                  <div style={{
                    flex: 1, border: `1px solid ${GLASS_BORDER}`, borderRadius: '12px',
                    overflow: 'hidden', background: '#f8fafc',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0
                  }}>
                    <img src={originalUrl} alt="Original uploaded image" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  </div>
                </div>

                {/* Processed */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-1)' }}>Result</h3>
                  <div style={{
                    flex: 1, border: `1px solid ${GLASS_BORDER}`, borderRadius: '12px',
                    overflow: 'hidden',
                    backgroundImage: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZvQA2QAjGzRw4ADZgMMQMBqGw9BAwBjw9QEx/EEDA2QAfG0MEOh0UxEAAAAASUVORK5CYII=")',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative', minHeight: 0
                  }}>
                    {isProcessing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        >
                          <Loader2 size={32} color="var(--primary)" />
                        </motion.div>
                        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>
                          {progress > 0 ? `Processing AI Model... ${Math.round(progress * 100)}%` : 'Initializing AI...'}
                        </p>
                      </div>
                    ) : processedUrl ? (
                      <img src={processedUrl} alt="Background removed result" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    ) : (
                      <div style={{ color: 'var(--text-3)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ImageIcon size={20} />
                        Ready to process
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <input 
              type="file" 
              accept="image/png, image/jpeg, image/webp" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileSelect} 
            />

            {/* Actions */}
            {originalUrl && (
              <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
                <button
                  aria-label="Clear image"
                  onClick={() => { setOriginalFile(null); setOriginalUrl(null); setProcessedUrl(null); }}
                  style={{
                    padding: '10px 20px', borderRadius: '10px',
                    border: '1px solid #ef4444', background: 'transparent',
                    color: '#ef4444', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}
                >
                  <Trash2 size={16} /> Clear
                </button>

                {!processedUrl && (
                  <button
                    aria-label="Remove Background"
                    onClick={handleRemoveBackground}
                    disabled={isProcessing}
                    style={{
                      padding: '10px 24px', borderRadius: '10px',
                      border: 'none', background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                      color: 'white', fontWeight: 600, cursor: isProcessing ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: '8px',
                      opacity: isProcessing ? 0.7 : 1
                    }}
                  >
                    <Sparkles size={16} /> {isProcessing ? 'Removing...' : 'Remove Background'}
                  </button>
                )}

                {processedUrl && (
                  <button
                    aria-label="Download PNG"
                    onClick={handleDownload}
                    style={{
                      padding: '10px 24px', borderRadius: '10px',
                      border: 'none', background: '#10b981',
                      color: 'white', fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                  >
                    <Download size={16} /> Download PNG
                  </button>
                )}
              </div>
            )}
            
            {originalUrl && (
              <p style={{
                marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-3)', textAlign: 'center', width: '100%'
              }}>
                টিপস: জলছাপ আঁকা বা ফিতার মতো ছবির নিখুঁত ব্যাকগ্রাউন্ড রিমুভালের জন্য উপরে <strong>Recraft AI (প্রিমিয়াম ও নিখুঁত)</strong> মোডটি সিলেক্ট করুন।
              </p>
            )}
          </div>
        </div>
      </div>
    </HelmetProvider>
  );
};
