import React, { useState } from 'react';
import { Search, TrendingUp, ExternalLink, Image as ImageIcon, Briefcase, Camera, Box, Sparkles, MonitorSmartphone, Loader2, AlertCircle } from 'lucide-react';

export const TopSellers = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [images, setImages] = useState([]);
  const [error, setError] = useState(null);

  const trendingNiches = [
    { title: 'Business & Finance', icon: Briefcase, query: 'business finance' },
    { title: 'Technology & AI', icon: MonitorSmartphone, query: 'technology AI' },
    { title: 'Nature & Landscapes', icon: Camera, query: 'nature landscape' },
    { title: '3D Backgrounds', icon: Box, query: '3d background' },
    { title: 'Abstract Elements', icon: Sparkles, query: 'abstract background' },
    { title: 'Lifestyle & People', icon: ImageIcon, query: 'lifestyle people' },
  ];

  const fetchTopSellers = async (query) => {
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);
    setImages([]);
    
    try {
      if (window.electronAPI && window.electronAPI.scrapeAdobeStock) {
        const result = await window.electronAPI.scrapeAdobeStock(query);
        if (result.success && result.images) {
          setImages(result.images);
        } else {
          setError(result.error || 'Failed to fetch top sellers.');
        }
      } else {
        setError('electronAPI not available. Please run in Electron.');
      }
    } catch (err) {
      setError(err.message || 'An error occurred while fetching.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchTopSellers(searchQuery);
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '2rem',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem', marginTop: '1rem' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 1rem',
          background: 'rgba(37, 99, 235, 0.08)',
          borderRadius: '999px',
          border: '1px solid rgba(37, 99, 235, 0.15)',
          marginBottom: '1.25rem'
        }}>
          <TrendingUp style={{ width: '1rem', height: '1rem', color: 'var(--primary)' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Top Sellers
          </span>
        </div>
        
        <h1 style={{ 
          fontSize: '2.5rem', 
          fontWeight: 800, 
          color: 'var(--text-1)', 
          margin: '0 0 0.5rem 0',
          letterSpacing: '-0.02em',
          lineHeight: 1.2
        }}>
          Discover Top <span style={{ 
            background: 'linear-gradient(135deg, var(--primary), var(--secondary))', 
            WebkitBackgroundClip: 'text', 
            WebkitTextFillColor: 'transparent' 
          }}>Selling Concepts</span>
        </h1>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-2)', maxWidth: '500px', margin: '0 auto', lineHeight: 1.6 }}>
          Instantly find the most downloaded and highest-grossing assets for any keyword natively inside the app.
        </p>
      </div>

      {/* ── Search Bar ── */}
      <form onSubmit={handleSearch} style={{ 
        maxWidth: '700px', 
        width: '100%', 
        margin: '0 auto 2rem auto',
        position: 'relative'
      }}>
        <div style={{
          position: 'absolute',
          top: '-15%', left: '-10%', right: '-10%', bottom: '-15%',
          background: 'linear-gradient(90deg, var(--primary), var(--secondary), var(--accent))',
          filter: 'blur(30px)',
          opacity: isFocused ? 0.15 : 0.05,
          transition: 'opacity 0.4s ease',
          borderRadius: '999px',
          zIndex: 0,
          pointerEvents: 'none'
        }} />
        
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: `1.5px solid ${isFocused ? 'var(--primary)' : 'rgba(0, 0, 0, 0.08)'}`,
          borderRadius: '999px',
          padding: '0.5rem',
          boxShadow: isFocused ? '0 8px 32px rgba(37, 99, 235, 0.12)' : '0 4px 12px rgba(0,0,0,0.03)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          zIndex: 1
        }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '1rem' }}>
            <Search style={{ width: '1.25rem', height: '1.25rem', color: isFocused ? 'var(--primary)' : 'var(--text-3)' }} />
          </div>
          <input
            type="text"
            placeholder="Search keywords, niches, or styles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: '0.75rem 1rem',
              fontSize: '1rem',
              color: 'var(--text-1)',
              fontWeight: 500
            }}
          />
          <button 
            type="submit"
            disabled={isLoading}
            style={{
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              color: '#fff',
              border: 'none',
              borderRadius: '999px',
              padding: '0.75rem 1.75rem',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              opacity: isLoading ? 0.7 : 1,
              transition: 'transform 0.15s, box-shadow 0.15s'
            }}
          >
            {isLoading ? (
              <><Loader2 className="animate-spin" size={16} /> Fetching...</>
            ) : (
              <><Search size={16} /> Search</>
            )}
          </button>
        </div>
      </form>

      {/* ── Dynamic Content Area ── */}
      <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', flex: 1 }}>
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: '1rem' }}>
            <Loader2 className="animate-spin" size={40} color="var(--primary)" />
            <p style={{ color: 'var(--text-2)', fontSize: '1rem', fontWeight: 500 }}>Fetching live top-selling images...</p>
          </div>
        )}

        {!isLoading && error && (
          <div style={{ padding: '2rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem', color: '#ef4444' }}>
            <AlertCircle size={24} />
            <div>
              <h4 style={{ margin: '0 0 0.25rem 0', fontWeight: 700 }}>Error Fetching Data</h4>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>{error}</p>
            </div>
          </div>
        )}

        {!isLoading && !error && images.length === 0 && (
          <>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '1.25rem', paddingLeft: '0.25rem', textAlign: 'center' }}>
              Or Try a Trending Niche
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem',
              maxWidth: '1000px',
              margin: '0 auto'
            }}>
              {trendingNiches.map((niche, index) => (
                <button
                  key={index}
                  onClick={() => { setSearchQuery(niche.query); fetchTopSellers(niche.query); }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.65)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    border: '1px solid rgba(0, 0, 0, 0.05)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
                    e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.15)';
                    e.currentTarget.style.boxShadow = '0 12px 24px rgba(37, 99, 235, 0.08)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.65)';
                    e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.05)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(139, 92, 246, 0.1))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: 'var(--primary)'
                  }}>
                    <niche.icon style={{ width: '1.25rem', height: '1.25rem' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: '0 0 0.15rem 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-1)' }}>
                      {niche.title}
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-3)' }}>
                      Click to fetch top sellers
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {!isLoading && images.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.25rem' }}>
            {images.map((img, idx) => (
              <div key={idx} style={{
                background: '#fff',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid rgba(0,0,0,0.06)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                transition: 'all 0.2s',
                position: 'relative'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(37, 99, 235, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.3)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.04)';
                e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)';
              }}>
                <div style={{ width: '100%', paddingBottom: '75%', position: 'relative', background: 'var(--surface-2)' }}>
                  <img src={img.src} alt={img.alt} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  <div style={{
                    position: 'absolute', top: '0.5rem', left: '0.5rem',
                    background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: '4px',
                    fontSize: '0.65rem', fontWeight: 700, backdropFilter: 'blur(4px)'
                  }}>
                    #{idx + 1}
                  </div>
                </div>
                <div style={{ padding: '0.75rem' }}>
                  <p style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--text-2)', 
                    margin: 0, 
                    display: '-webkit-box', 
                    WebkitLineClamp: 3, 
                    WebkitBoxOrient: 'vertical', 
                    overflow: 'hidden',
                    lineHeight: 1.4
                  }}>
                    {img.alt || 'No description available'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
