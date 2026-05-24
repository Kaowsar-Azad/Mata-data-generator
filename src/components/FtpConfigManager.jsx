import { useState, useEffect } from "react";
import { Server, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

export function FtpConfigManager({ ftpConfigs, setFtpConfigs, editingConfig, setEditingConfig, onStartEdit }) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getFtpConfig().then(savedConfigs => {
        if (savedConfigs && Array.isArray(savedConfigs)) {
          setFtpConfigs(savedConfigs);
        } else if (savedConfigs && savedConfigs.host) {
          // Fallback if legacy object comes through
          setFtpConfigs([{ ...savedConfigs, id: 'legacy_1' }]);
        } else {
          setFtpConfigs([]);
        }
      });
    }
  }, [setFtpConfigs]);

  const saveToBackend = async (newConfigs) => {
    if (window.electronAPI) {
      await window.electronAPI.saveFtpConfig(newConfigs);
    }
  };

  const handleAddNew = () => {
    const newConfig = {
      id: Math.random().toString(36).substr(2, 9),
      websiteName: "",
      host: "",
      port: 21,
      user: "",
      password: "",
      enabled: true // default new configs to enabled
    };
    if (onStartEdit) {
      onStartEdit(newConfig);
    }
  };

  const handleEdit = (config) => {
    if (onStartEdit) {
      onStartEdit({ ...config });
    }
    setExpandedId(config.id);
  };

  const handleDelete = async (id) => {
    const updatedConfigs = ftpConfigs.filter(c => c.id !== id);
    setFtpConfigs(updatedConfigs);
    await saveToBackend(updatedConfigs);
    if (editingConfig && editingConfig.id === id) {
      setEditingConfig(null);
    }
  };

  const toggleConfigEnable = async (id, enabled) => {
    const updatedConfigs = ftpConfigs.map(c => c.id === id ? { ...c, enabled } : c);
    setFtpConfigs(updatedConfigs);
    await saveToBackend(updatedConfigs);
  };

  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: '0.6rem', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.6rem 0.75rem',
          background: 'var(--surface-2)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-1)',
          fontSize: '0.8rem',
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Server style={{ width: '0.85rem', height: '0.85rem', color: 'var(--accent)' }} />
          FTP Configurations
          {ftpConfigs.length > 0 && (
            <span style={{ background: 'var(--accent)', color: 'white', borderRadius: '1rem', padding: '0.1rem 0.4rem', fontSize: '0.6rem' }}>
              {ftpConfigs.filter(c => c.enabled).length}/{ftpConfigs.length} Active
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown style={{ width: '1rem', height: '1rem', color: 'var(--text-3)' }} /> : <ChevronRight style={{ width: '1rem', height: '1rem', color: 'var(--text-3)' }} />}
      </button>

      {isOpen && (
        <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          
          {/* List of Configs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {ftpConfigs.map(config => {
              const isBeingEdited = editingConfig && editingConfig.id === config.id;
              return (
                <div 
                  key={config.id} 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    border: isBeingEdited ? '1px solid var(--accent)' : '1px solid var(--glass-border)', 
                    borderRadius: '0.5rem', 
                    overflow: 'hidden',
                    transition: 'border-color 0.2s ease'
                  }}
                >
                  
                  {/* Header Row */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '0.4rem 0.5rem', 
                    background: isBeingEdited ? 'rgba(6, 182, 212, 0.12)' : (config.enabled ? 'rgba(6, 182, 212, 0.05)' : 'var(--surface-1)'), 
                    borderBottom: expandedId === config.id ? '1px solid var(--glass-border)' : 'none' 
                  }}>
                    <input 
                      type="checkbox" 
                      checked={config.enabled} 
                      onChange={(e) => toggleConfigEnable(config.id, e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: 'var(--accent)', marginRight: '0.5rem', width: '1rem', height: '1rem' }}
                    />
                    <div 
                      onClick={() => handleEdit(config)}
                      style={{ flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                    >
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: config.enabled ? 'var(--text-1)' : 'var(--text-3)' }}>
                        {config.websiteName || config.host || "Unnamed FTP"}
                      </span>
                    </div>
                    <button onClick={() => handleDelete(config.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--danger)', opacity: 0.7 }}>
                      <Trash2 style={{ width: '0.8rem', height: '0.8rem' }} />
                    </button>
                    <button onClick={() => handleEdit(config)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--text-2)' }}>
                      {expandedId === config.id ? <ChevronDown style={{ width: '1rem', height: '1rem' }} /> : <ChevronRight style={{ width: '1rem', height: '1rem' }} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add New Form */}
          <button
            onClick={handleAddNew}
            style={{
              width: '100%', padding: '0.5rem', background: 'var(--surface-2)', border: '1px dashed var(--glass-border)',
              borderRadius: '0.4rem', color: 'var(--text-2)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', transition: 'all 0.2s', marginTop: '0.5rem'
            }}
            onMouseOver={e => e.target.style.color = 'var(--text-1)'}
            onMouseOut={e => e.target.style.color = 'var(--text-2)'}
          >
            <Plus style={{ width: '0.8rem', height: '0.8rem' }} /> Add FTP Service
          </button>
        </div>
      )}
    </div>
  );
}
