import React, { useState, useRef, useEffect, FormEvent, ChangeEvent } from 'react';
import { Search, TrendingUp, Camera, Box, Sparkles, MonitorSmartphone, Loader2, AlertCircle, Briefcase, ImageIcon, CheckSquare, Copy, X, BarChart2 } from 'lucide-react';
import { AdobeSearchOption } from './AdobeSearchOption';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--surface-1)', padding: '1.5rem', borderRadius: '16px', width: '90%', maxWidth: '700px', maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-1)' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-2)' }}><X size={20} /></button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};

interface ImageItem {
  src: string;
  alt: string;
  detailUrl?: string;
}

interface ExtractedData {
  keywords: string[];
  titles: string[];
}

export const TopSellers: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isVisualLoading, setIsVisualLoading] = useState<boolean>(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<number>(0);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);

  const [sortBy, setSortBy] = useState<string>('nb_downloads');
  const [contentType, setContentType] = useState<string>('all');
  const [platform, setPlatform] = useState<string>('adobe-stock');
  const [page, setPage] = useState<number>(1);
  const [isSortOpen, setIsSortOpen] = useState<boolean>(false);
  const [isContentOpen, setIsContentOpen] = useState<boolean>(false);
  const [isPlatformOpen, setIsPlatformOpen] = useState<boolean>(false);

  const trendingNiches = [
    { title: 'Business & Finance', icon: Briefcase, query: 'business finance' },
    { title: 'Technology & AI', icon: MonitorSmartphone, query: 'technology AI' },
    { title: 'Nature & Landscapes', icon: Camera, query: 'nature landscape' },
    { title: '3D Backgrounds', icon: Box, query: '3d background' },
    { title: 'Abstract Elements', icon: Sparkles, query: 'abstract background' },
    { title: 'Lifestyle & People', icon: ImageIcon, query: 'lifestyle people' },
  ];

  const fetchTopSellers = async (queryOverride?: string) => {
    const activeQuery = typeof queryOverride === 'string' ? queryOverride : searchQuery;
    if (!activeQuery.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setImages([]);
    setSelectedIndices(new Set());
    
    try {
      const api = (window as any).electronAPI;
      if (api && api.scrapeTopSellers) {
        const result = await api.scrapeTopSellers({
          platform,
          query: activeQuery,
          order: sortBy,
          contentType: contentType,
          page: page
        });
        if (result.success && result.images) {
          setImages(result.images);
        } else {
          setError(result.error || 'Failed to fetch top sellers.');
        }
      } else {
        setError('electronAPI not available. Please run in Electron.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (searchQuery.trim()) {
      fetchTopSellers();
    }
  }, [sortBy, contentType, page]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTopSellers(searchQuery);
  };

  const handleImageSearch = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict Security Validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setError('Security Alert: Only JPG, PNG, WEBP, and GIF images are allowed. Malicious files are blocked.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const fileName = file.name.toLowerCase();
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
    if (!hasValidExtension) {
      setError('Security Alert: Invalid file extension detected. Only image files are allowed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const maxSize = 15 * 1024 * 1024; // 15MB strict limit
    if (file.size > maxSize) {
      setError('Security Alert: File is too large! Maximum allowed image size is 15MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    
    setIsLoading(true);
    setIsVisualLoading(true);
    setError(null);
    setImages([]);
    setSelectedIndices(new Set());
    setSearchQuery("");
    setPage(1);
    
    try {
      if (platform !== 'adobe-stock') {
         setError(`Visual search for ${platform} is coming soon!`);
         setIsLoading(false);
         setIsVisualLoading(false);
         if (fileInputRef.current) fileInputRef.current.value = '';
         return;
      }

      const filePath = (file as any).path;
      if (!filePath) {
         setError('Real file path not available. Please run the app in Electron.');
         setIsLoading(false);
         setIsVisualLoading(false);
         if (fileInputRef.current) fileInputRef.current.value = '';
         return;
      }

      const api = (window as any).electronAPI;
      if (api && api.scrapeAdobeStockByImage) {
         const result = await api.scrapeAdobeStockByImage(filePath);
         if (result.success && result.images) {
            setImages(result.images);
         } else {
            setError(result.error || 'Failed to fetch top sellers by image.');
         }
      } else {
         setError('electronAPI not available. Please run in Electron.');
      }

    } catch (err: any) {
      setError(err.message || 'An error occurred during visual search.');
    } finally {
      setIsLoading(false);
      setIsVisualLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSelection = (idx: number) => {
    const newSelection = new Set(selectedIndices);
    if (newSelection.has(idx)) {
      newSelection.delete(idx);
    } else {
      newSelection.add(idx);
    }
    setSelectedIndices(newSelection);
  };

  const selectAll = () => {
    if (selectedIndices.size === images.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(images.map((_, i) => i)));
    }
  };

  const extractMetadata = async () => {
    if (selectedIndices.size === 0) return;
    setIsExtracting(true);
    setExtractionProgress(0);
    
    const selectedImages = Array.from(selectedIndices).map(idx => images[idx]);
    const allKeywords: string[] = [];
    const titles: string[] = [];

    for (let i = 0; i < selectedImages.length; i++) {
      const img = selectedImages[i];
      const api = (window as any).electronAPI;
      if (img.detailUrl && api && api.getAdobeStockDetails) {
        try {
          const res = await api.getAdobeStockDetails(img.detailUrl);
          if (res.success && res.data) {
             if (res.data.keywords) allKeywords.push(...res.data.keywords);
             if (res.data.title) titles.push(res.data.title);
          }
        } catch(e) {
          console.error("Extraction error for", img.detailUrl, e);
        }
      }
      setExtractionProgress(Math.round(((i + 1) / selectedImages.length) * 100));
    }

    const keywordCounts: Record<string, number> = {};
    allKeywords.forEach(k => {
      const lower = k.toLowerCase();
      keywordCounts[lower] = (keywordCounts[lower] || 0) + 1;
    });

    const sortedKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    setExtractedData({
      keywords: sortedKeywords.slice(0, 50),
      titles: titles
    });
    
    setIsExtracting(false);
    setShowModal(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '2rem',
      boxSizing: 'border-box',
      overflowY: 'auto',
      position: 'relative'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem', marginTop: '0.5rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-1)', margin: '0 0 0.25rem 0', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          Discover Top <span style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Selling Concepts</span>
        </h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', maxWidth: '550px', margin: '0 auto', lineHeight: 1.4 }}>
          Explore trending concepts for any niche. Click on images to instantly extract high-ranking titles and keywords.
        </p>
      </div>

      {/* Search Area */}
      <AdobeSearchOption
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isLoading={isLoading}
        isVisualLoading={isVisualLoading}
        handleSearch={handleSearch}
        handleImageSearch={handleImageSearch}
        fileInputRef={fileInputRef}
        platform={platform}
      />
  
      {/* Filters Bar - Premium Sleek Style */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        padding: '0.4rem 1.25rem',
        background: 'var(--surface-1)',
        border: '1px solid var(--border-color)',
        borderRadius: '100px',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.03)',
        width: 'fit-content',
        margin: '0 auto 2.5rem auto'
      }}>
        {/* Platform Custom Dropdown */}
        <div 
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 0.25rem' }}
          onMouseLeave={() => setIsPlatformOpen(false)}
        >
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform:</span>
          <div 
            onClick={() => !isLoading && setIsPlatformOpen(!isPlatformOpen)}
            style={{
              position: 'relative',
              background: 'transparent',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              height: '32px',
              padding: '0 0.25rem'
            }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>
              {platform === 'adobe-stock' ? 'Adobe Stock' : 
               platform === 'shutterstock' ? 'Shutterstock' : 
               platform === 'freepik' ? 'Freepik' : 
               platform === 'getty' ? 'Getty Images' : 'Adobe Stock'}
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.85rem', height: '0.85rem', color: 'var(--text-2)', marginLeft: '0.35rem', transform: isPlatformOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
              <path d="m6 9 6 6 6-6"/>
            </svg>

            {/* Custom Premium Dropdown Menu */}
            {isPlatformOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                paddingTop: '12px',
                zIndex: 50,
              }}>
                <div style={{
                  width: '200px',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '16px',
                  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.08)',
                  padding: '0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}>
                  {[
                    { value: 'adobe-stock', label: 'Adobe Stock' },
                    { value: 'shutterstock', label: 'Shutterstock' },
                    { value: 'freepik', label: 'Freepik' },
                    { value: 'getty', label: 'Getty Images' }
                  ].map((option) => (
                    <div
                      key={option.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlatform(option.value);
                        setIsPlatformOpen(false);
                        setPage(1); // Reset page on platform change
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: platform === option.value ? 700 : 500,
                        color: platform === option.value ? 'var(--primary)' : 'var(--text-1)',
                        background: 'transparent',
                        transition: 'background 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      {option.label}
                      {platform === option.value && (
                        <CheckSquare size={16} color="var(--primary)" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 0.25rem' }}></div>

        {/* Sort By Custom Dropdown */}
        <div 
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 0.25rem' }}
          onMouseLeave={() => setIsSortOpen(false)}
        >
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort By:</span>
          <div 
            onClick={() => !isLoading && setIsSortOpen(!isSortOpen)}
            style={{
              position: 'relative',
              background: 'transparent',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              height: '32px',
              padding: '0 0.25rem'
            }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>
              {sortBy === 'relevance' ? 'Relevance' : 
               sortBy === 'creation' ? 'Newest' : 
               sortBy === 'featured' ? 'Featured' : 
               sortBy === 'nb_downloads' ? 'Most Downloaded' : 'Undiscovered'}
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.85rem', height: '0.85rem', color: 'var(--text-2)', marginLeft: '0.35rem', transform: isSortOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
              <path d="m6 9 6 6 6-6"/>
            </svg>

            {/* Custom Premium Dropdown Menu */}
            {isSortOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                paddingTop: '12px',
                zIndex: 50,
              }}>
                <div style={{
                  width: '200px',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '16px',
                  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.08)',
                  padding: '0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}>
                  {[
                    { value: 'relevance', label: 'Relevance' },
                    { value: 'creation', label: 'Newest' },
                    { value: 'featured', label: 'Featured' },
                    { value: 'nb_downloads', label: 'Most Downloaded' },
                    { value: 'undiscovered', label: 'Undiscovered' },
                  ].map((option) => (
                    <div
                      key={option.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSortBy(option.value);
                        setIsSortOpen(false);
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: sortBy === option.value ? 700 : 500,
                        color: sortBy === option.value ? 'var(--primary)' : 'var(--text-1)',
                        background: 'transparent',
                        transition: 'background 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      {option.label}
                      {sortBy === option.value && (
                        <CheckSquare size={16} color="var(--primary)" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 0.25rem' }}></div>

        {/* Content Type Custom Dropdown */}
        <div 
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 0.25rem' }}
          onMouseLeave={() => setIsContentOpen(false)}
        >
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Content Type:</span>
          <div 
            onClick={() => !isLoading && setIsContentOpen(!isContentOpen)}
            style={{
              position: 'relative',
              background: 'transparent',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              height: '32px',
              padding: '0 0.25rem'
            }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>
              {contentType === 'all' ? 'All Types' : 
               contentType === 'photo' ? 'Photo' : 
               contentType === 'illustration' ? 'Illustration' : 
               contentType === 'vector' ? 'Vector' : 
               contentType === 'video' ? 'Video' : 
               contentType === 'template' ? 'Template' : '3D'}
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.85rem', height: '0.85rem', color: 'var(--text-2)', marginLeft: '0.35rem', transform: isContentOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
              <path d="m6 9 6 6 6-6"/>
            </svg>

            {/* Custom Premium Dropdown Menu */}
            {isContentOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                paddingTop: '12px',
                zIndex: 50,
              }}>
                <div style={{
                  width: '200px',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '16px',
                  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.08)',
                  padding: '0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}>
                  {[
                    { value: 'all', label: 'All Types' },
                    { value: 'photo', label: 'Photo' },
                    { value: 'illustration', label: 'Illustration' },
                    { value: 'vector', label: 'Vector' },
                    { value: 'video', label: 'Video' },
                    { value: 'template', label: 'Template' },
                    { value: '3d', label: '3D' },
                  ].map((option) => (
                    <div
                      key={option.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        setContentType(option.value);
                        setIsContentOpen(false);
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: contentType === option.value ? 700 : 500,
                        color: contentType === option.value ? 'var(--primary)' : 'var(--text-1)',
                        background: 'transparent',
                        transition: 'background 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      {option.label}
                      {contentType === option.value && (
                        <CheckSquare size={16} color="var(--primary)" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* Dynamic Content Area */}
      <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', flex: 1, paddingBottom: selectedIndices.size > 0 ? '5rem' : '0' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', maxWidth: '1000px', margin: '0 auto' }}>
              {trendingNiches.map((niche, index) => (
                <button
                  key={index}
                  onClick={() => { setSearchQuery(niche.query); fetchTopSellers(niche.query); }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.65)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(0, 0, 0, 0.05)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.25s'
                  }}
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(139, 92, 246, 0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                    <niche.icon style={{ width: '1.25rem', height: '1.25rem' }} />
                  </div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-1)' }}>{niche.title}</h4>
                </button>
              ))}
            </div>
          </>
        )}

        {!isLoading && images.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-2)', fontWeight: 600 }}>
                Showing Top {images.length} Results
              </span>
              <button 
                onClick={selectAll}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  color: 'var(--text-2)'
                }}
              >
                <CheckSquare size={14} />
                {selectedIndices.size === images.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.25rem' }}>
              {images.map((img, idx) => {
                const isSelected = selectedIndices.has(idx);
                return (
                  <div key={idx} 
                    onClick={() => toggleSelection(idx)}
                    style={{
                      background: '#fff',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: isSelected ? '2px solid var(--primary)' : '1px solid rgba(0,0,0,0.06)',
                      boxShadow: isSelected ? '0 8px 24px rgba(37, 99, 235, 0.2)' : '0 4px 12px rgba(0,0,0,0.04)',
                      transition: 'all 0.2s',
                      position: 'relative',
                      cursor: 'pointer'
                    }}>
                    <div style={{ width: '100%', paddingBottom: '75%', position: 'relative', background: 'var(--surface-2)' }}>
                      <img src={img.src} alt={img.alt} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                      {isSelected && (
                        <div style={{
                          position: 'absolute', top: '0.5rem', right: '0.5rem',
                          background: 'var(--primary)', color: '#fff', borderRadius: '50%',
                          width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <CheckSquare size={14} />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '0.75rem' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                        {img.alt || 'No description available'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '2rem', gap: '1rem' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
                style={{
                  padding: '0.6rem 1.2rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: page === 1 ? 'rgba(0,0,0,0.05)' : 'var(--surface-1)',
                  color: page === 1 ? 'var(--text-3)' : 'var(--text-1)',
                  cursor: page === 1 || isLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
              >
                Previous Page
              </button>
              
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-2)' }}>
                Page {page}
              </span>
              
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={isLoading || images.length < 30}
                style={{
                  padding: '0.6rem 1.2rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--surface-1)',
                  color: 'var(--text-1)',
                  cursor: isLoading || images.length < 30 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
              >
                Next Page
              </button>
            </div>
          </>
        )}
      </div>

      {selectedIndices.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--surface-1)',
          padding: '1rem 2rem',
          borderRadius: '999px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3), 0 0 0 1px var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '2rem',
          zIndex: 100
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'var(--primary)', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
              {selectedIndices.size}
            </div>
            <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>Images Selected</span>
          </div>
          
          <button 
            onClick={extractMetadata}
            disabled={isExtracting}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              border: 'none',
              borderRadius: '999px',
              padding: '0.6rem 1.5rem',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: isExtracting ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: isExtracting ? 0.8 : 1,
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}
          >
            {isExtracting ? (
              <><Loader2 size={16} className="animate-spin" /> {extractionProgress}%</>
            ) : (
              <><BarChart2 size={16} /> Extract Metadata</>
            )}
          </button>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Aggregated Top Seller Metadata">
        {extractedData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={16} color="var(--primary)" /> Top 50 Keywords
                </h3>
                <button 
                  onClick={() => copyToClipboard(extractedData.keywords.join(', '))}
                  style={{ background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary)', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Copy size={14} /> Copy All
                </button>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-2)' }}>
                {extractedData.keywords.join(', ')}
              </div>
            </div>
            <div>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Briefcase size={16} color="var(--primary)" /> Winning Titles
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {extractedData.titles.map((title, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-1)', fontWeight: 500, paddingRight: '1rem' }}>{title}</span>
                    <button onClick={() => copyToClipboard(title)} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0.25rem' }}><Copy size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
