import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { Upload, Download, Trash2, Loader2, Sparkles, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { removeBackgroundViaLocalServer } from '../../services/removeBgProxy.js';

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
  const [processingStage, setProcessingStage] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const fileInputRef = useRef(null);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (processedUrl) URL.revokeObjectURL(processedUrl);
    };
  }, [originalUrl, processedUrl]);

  const schemaMarkup = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'MetadataPro AI Background Remover',
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web',
    description: 'Premium offline background remover.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setOriginalFile(file);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(URL.createObjectURL(file));
    if (processedUrl) URL.revokeObjectURL(processedUrl);
    setProcessedUrl(null);
    setElapsedSeconds(0);
    setProcessingStage('');
  };

  const handleRemoveBackground = async () => {
    if (!originalFile) return;
    setIsProcessing(true);
    setElapsedSeconds(0);
    setProcessingStage('Initializing AI Neural Network...');
    setProcessedUrl(null);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
      if (elapsed >= 10) {
        setProcessingStage('Finalizing transparent PNG...');
      } else if (elapsed >= 5) {
        setProcessingStage('Refining edges & eliminating background halos...');
      } else if (elapsed >= 2) {
        setProcessingStage('Computing high-precision boundary segmentation...');
      }
    }, 1000);

    try {
      const resultBlob = await removeBackgroundViaLocalServer(originalFile, 'birefnet');
      
      clearInterval(interval);
      setProcessingStage('Complete!');
      if (processedUrl) URL.revokeObjectURL(processedUrl);
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
        
        <h2 style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }}>
          MetadataPro AI Background Remover
        </h2>

        {/* Engine Header Row */}
        <div style={{
          display: 'flex', gap: '16px', alignItems: 'center',
          background: GLASS_BG, border: `1px solid ${GLASS_BORDER}`,
          borderRadius: '12px', padding: '10px 20px', flexWrap: 'wrap',
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)' }}>Engine:</span>
            <div
              style={{
                padding: '4px 12px', borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(139, 92, 246, 0.15))',
                color: 'var(--primary)',
                fontWeight: 700, fontSize: '0.8rem',
                display: 'flex', alignItems: 'center', gap: '6px',
                border: '1px solid rgba(37, 99, 235, 0.25)'
              }}
            >
              <Sparkles size={14} /> BiRefNet Ultra HD (Offline AI)
            </div>
          </div>

          <div style={{ height: '18px', width: '1px', background: 'var(--glass-border)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
              High-precision deep neural segmentation with automatic anti-halo defringing
            </span>
          </div>
        </div>

        {!originalUrl ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (isProcessing) return;
              const file = e.dataTransfer.files[0];
              if (file) {
                setOriginalFile(file);
                if (originalUrl) URL.revokeObjectURL(originalUrl);
                setOriginalUrl(URL.createObjectURL(file));
                if (processedUrl) URL.revokeObjectURL(processedUrl);
                setProcessedUrl(null);
                setProgress(0);
              }
            }}
            className="upload-zone"
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.7 : 1 }}
          >
            <div className="flex flex-col items-center">
              <div className="upload-icon-wrap" style={{ background: 'rgba(37,99,235,0.1)' }}>
                <Upload style={{ width: "2rem", height: "2rem", color: "var(--primary)" }} />
              </div>
              <h3 style={{ margin: "0.4rem 0", fontSize: "1.05rem", fontWeight: 700, color: "var(--text-1)" }}>Drop Image here</h3>
              <p className="text-muted" style={{ fontSize: "0.85rem" }}>
                Or click to browse. Supported formats: JPG, PNG, WebP
              </p>
            </div>
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'flex', gap: '12px', minHeight: 0,
            background: GLASS_BG,
            backdropFilter: 'blur(20px)',
            border: `1px solid ${GLASS_BORDER}`,
            borderRadius: '16px',
            padding: '24px',
          }}>
            {/* Main workspace */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '0 20px', textAlign: 'center' }}>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                        >
                          <Loader2 size={36} color="var(--primary)" />
                        </motion.div>
                        <div>
                          <p style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-1)' }}>
                            BiRefNet Ultra HD Segmentation
                          </p>
                          <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>
                            {processingStage || 'Processing AI model...'} ({elapsedSeconds}s)
                          </p>
                          <div style={{
                            width: '200px', height: '4px', background: 'rgba(37, 99, 235, 0.15)',
                            borderRadius: '4px', overflow: 'hidden', margin: '0 auto', position: 'relative'
                          }}>
                            <motion.div
                              animate={{ x: ['-100%', '100%'] }}
                              transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
                              style={{
                                width: '50%', height: '100%',
                                background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
                                borderRadius: '4px'
                              }}
                            />
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'block', marginTop: '6px' }}>
                            BiRefNet Ultra HD deep neural network running... (~25-45s on CPU)
                          </span>
                        </div>
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

              {/* Actions */}
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
                  <>
                    <button
                      aria-label="Re-process"
                      onClick={handleRemoveBackground}
                      disabled={isProcessing}
                      style={{
                        padding: '10px 20px', borderRadius: '10px',
                        border: 'none', background: 'var(--primary)',
                        color: 'white', fontWeight: 600, cursor: isProcessing ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        opacity: isProcessing ? 0.7 : 1
                      }}
                    >
                      <RefreshCw size={16} /> {isProcessing ? 'Removing...' : 'Remove Background Again'}
                    </button>
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
                  </>
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
      </div>
    </HelmetProvider>
  );
};
