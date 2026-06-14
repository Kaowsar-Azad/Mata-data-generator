import React from "react";
import { Download, X } from "lucide-react";

export function ExportFormatModal({ isOpen, onClose, onSelect, activePlatform }) {
  if (!isOpen) return null;

  const allPlatforms = [
    { id: 'General', icon: '✦', label: 'General Format', desc: 'Standard CSV with Filename, Title, Description, Keywords' },
    { id: 'Adobe Stock', icon: 'St', label: 'Adobe Stock', desc: 'Category codes mapping and official column order' },
    { id: 'Shutterstock', icon: '📷', label: 'Shutterstock', desc: 'Includes Categories mapping column' },
    { id: 'Freepik', icon: '🎨', label: 'Freepik', desc: 'Semicolon delimiter and exact required headers' },
    { id: 'Vecteezy', icon: '🖌', label: 'Vecteezy', desc: 'Official Vecteezy formatting requirements' },
    { id: 'Dreamstime', icon: '💭', label: 'Dreamstime', desc: 'Includes Category 1 setting' },
    { id: 'Pond5', icon: '🎬', label: 'Pond5', desc: 'Includes city, region, country, and releases details' },
    { id: 'Getty', icon: '🖼', label: 'Getty Images', desc: 'Brief codes, dates, and Getty specification' },
    { id: 'Depositphotos', icon: '📸', label: 'Depositphotos', desc: 'Includes nudity and editorial settings' },
    { id: 'Extended metadata', icon: '📋', label: 'Extended CSV', desc: 'Full categories list and releases' },
  ];

  const getAvailableExportFormats = () => {
    const active = activePlatform || 'General';
    if (active === 'General') {
      return allPlatforms;
    } else {
      return allPlatforms.filter(p => p.id === active || p.id === 'General');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(10, 13, 20, 0.45)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999
    }}>
      <div className="glass card" style={{
        width: '450px',
        maxWidth: '90%',
        padding: 0,
        background: 'var(--surface-1)',
        borderRadius: '1rem',
        boxShadow: '0 25px 60px rgba(0,0,0,0.25), 0 0 0 1px var(--glass-border)',
        animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden'
      }}>
        <div style={{
          height: '4px',
          background: 'linear-gradient(90deg, var(--primary), var(--accent))',
          width: '100%'
        }} />
        
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                width: '36px', 
                height: '36px', 
                borderRadius: '0.5rem', 
                background: 'rgba(37, 99, 235, 0.1)', 
                color: 'var(--primary)',
                flexShrink: 0
              }}>
                <Download className="w-5 h-5" />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>
                Select CSV Export Format
              </h3>
            </div>
            <button 
              onClick={onClose}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: 'var(--text-3)', 
                cursor: 'pointer', 
                padding: '6px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: 1.45 }}>
            অনুগ্রহ করে যে এজেন্সির জন্য সিএসভি ফাইলটি ডাউনলোড করতে চান তা নির্বাচন করুন। প্রতিটি ফরম্যাট তাদের নিজস্ব গাইডলাইন অনুযায়ী সাজানো হয়েছে।
          </p>

          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.55rem', 
            maxHeight: '320px', 
            overflowY: 'auto', 
            paddingRight: '6px' 
          }}>
            {getAvailableExportFormats().map((fmt) => (
              <button
                key={fmt.id}
                onClick={() => {
                  onSelect(fmt.id);
                  onClose();
                }}
                className="export-format-btn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '0.8rem 1rem',
                  borderRadius: '0.65rem',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--glass-border)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
                onMouseEnter={(e) => { 
                  e.currentTarget.style.background = 'var(--surface-3)'; 
                  e.currentTarget.style.borderColor = 'var(--primary)'; 
                  e.currentTarget.style.transform = 'translateX(3px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.05)';
                }}
                onMouseLeave={(e) => { 
                  e.currentTarget.style.background = 'var(--surface-2)'; 
                  e.currentTarget.style.borderColor = 'var(--glass-border)'; 
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <span style={{ 
                    fontSize: '1.25rem', 
                    minWidth: '32px', 
                    height: '32px',
                    borderRadius: '0.4rem',
                    background: 'var(--surface-1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}>{fmt.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-1)' }}>{fmt.label}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '2px' }}>{fmt.desc}</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-primary" style={{ opacity: 0.8 }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
