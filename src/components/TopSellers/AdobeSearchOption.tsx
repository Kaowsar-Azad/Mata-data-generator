import React, { useState } from 'react';
import { Search, Camera, Loader2 } from 'lucide-react';

interface AdobeSearchOptionProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isLoading: boolean;
  isVisualLoading: boolean;
  handleSearch: (e: React.FormEvent) => void;
  handleImageSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  platform: string;
}

export const AdobeSearchOption: React.FC<AdobeSearchOptionProps> = ({
  searchQuery,
  setSearchQuery,
  isLoading,
  isVisualLoading,
  handleSearch,
  handleImageSearch,
  fileInputRef,
  platform
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'stretch', gap: '0.75rem', maxWidth: '850px', margin: '0 auto 2rem auto', width: '100%' }}>
      {/* Search Bar */}
      <form onSubmit={handleSearch} style={{ 
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        background: 'var(--surface-1)',
        border: `2px solid ${isFocused ? 'var(--primary)' : 'rgba(0,0,0,0.08)'}`,
        borderRadius: '999px',
        padding: '0.25rem',
        boxShadow: isFocused ? '0 8px 24px rgba(37, 99, 235, 0.15)' : '0 4px 12px rgba(0,0,0,0.05)',
        transition: 'all 0.2s',
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '1rem' }}>
          <Search style={{ width: '1.25rem', height: '1.25rem', color: isFocused ? 'var(--primary)' : 'var(--text-3)' }} />
        </div>
        <input
          type="text"
          placeholder={isVisualLoading ? `Uploading & searching image on ${platform === 'shutterstock' ? 'Shutterstock' : platform === 'vecteezy' ? 'Vecteezy' : 'Adobe Stock'}...` : (isLoading ? "Searching..." : "Search keywords, niches, or styles...")}
          value={searchQuery}
          disabled={isLoading}
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
          {isLoading && !isVisualLoading ? (
            <><Loader2 className="animate-spin" size={16} /> Fetching...</>
          ) : (
            <><Search size={16} /> Search</>
          )}
        </button>
      </form>

      {/* Search by Image Button - FOR ADOBE STOCK, SHUTTERSTOCK AND VECTEEZY */}
      {(platform === 'adobe-stock' || platform === 'shutterstock' || platform === 'vecteezy') && (
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <input 
            type="file" 
            accept="image/jpeg, image/png, image/webp, image/gif" 
            ref={fileInputRef} 
            onChange={handleImageSearch} 
            style={{ display: 'none' }} 
          />
          <button 
            type="button"
            disabled={isLoading}
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: 'var(--surface-1)',
              color: 'var(--text-1)',
              border: '2px solid rgba(0,0,0,0.08)',
              borderRadius: '999px',
              padding: '0 1.5rem',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
              opacity: isLoading ? 0.7 : 1,
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
              whiteSpace: 'nowrap'
            }}
            onMouseOver={(e) => {
              if(!isLoading) {
                e.currentTarget.style.border = '2px solid var(--primary)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(37, 99, 235, 0.15)';
              }
            }}
            onMouseOut={(e) => {
              if(!isLoading) {
                e.currentTarget.style.border = '2px solid rgba(0,0,0,0.08)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
              }
            }}
          >
            {isVisualLoading ? (
              <>
                <Loader2 className="animate-spin" size={18} color="var(--primary)" />
                Analyzing...
              </>
            ) : (
              <>
                <Camera size={18} color="var(--primary)" /> Search by Image
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
