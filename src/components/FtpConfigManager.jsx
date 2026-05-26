import { useState, useEffect } from "react";
import { Server, ChevronDown, ChevronRight, Plus, Trash2, ExternalLink, Zap } from "lucide-react";

const ADOBE_HOSTS = ['adobe', 'adobestock', 'contributor.stock'];

function isAdobeConfig(config) {
  const h = (config?.host || '').toLowerCase();
  return ADOBE_HOSTS.some(k => h.includes(k));
}

const AGENCY_ICONS = {
  "Adobe Stock": "🔴",
  "Shutterstock": "🔶",
  "Freepik": "🟢",
  "Vecteezy": "🔵",
  "Dreamstime": "🟣",
};

export function FtpConfigManager({ ftpConfigs, setFtpConfigs, editingConfig, setEditingConfig, onStartEdit }) {
  const [isOpen, setIsOpen] = useState(true); // default open for FTP tab
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getFtpConfig().then(savedConfigs => {
        if (savedConfigs && Array.isArray(savedConfigs)) {
          setFtpConfigs(savedConfigs);
        } else if (savedConfigs && savedConfigs.host) {
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
      enabled: true
    };
    if (onStartEdit) onStartEdit(newConfig);
  };

  const handleAddAdobe = () => {
    const newConfig = {
      id: Math.random().toString(36).substr(2, 9),
      websiteName: "Adobe Stock",
      host: "sftp.contributor.adobestock.com",
      port: 22,
      user: "",
      password: "",
      secure: false,
      enabled: true
    };
    if (onStartEdit) onStartEdit(newConfig);
  };

  const handleEdit = (config) => {
    if (onStartEdit) onStartEdit({ ...config });
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

  const activeCount = ftpConfigs.filter(c => c.enabled).length;
  const hasAdobe = ftpConfigs.some(isAdobeConfig);

  const openPortal = (url) => {
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank');
  };

  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: '0.65rem', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>

      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.6rem 0.75rem', background: 'var(--surface-2)',
          border: 'none', cursor: 'pointer', color: 'var(--text-1)', fontSize: '0.8rem', fontWeight: 700,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Server style={{ width: '0.85rem', height: '0.85rem', color: 'var(--accent)' }} />
          FTP Servers
          {ftpConfigs.length > 0 && (
            <span style={{ background: activeCount > 0 ? 'var(--accent)' : 'var(--surface-3)', color: activeCount > 0 ? 'white' : 'var(--text-3)', borderRadius: '1rem', padding: '0.05rem 0.4rem', fontSize: '0.6rem', fontWeight: 700 }}>
              {activeCount}/{ftpConfigs.length}
            </span>
          )}
          {hasAdobe && (
            <span style={{ fontSize: '0.65rem', background: 'rgba(232,65,66,0.15)', color: '#ff8a8a', padding: '0.05rem 0.3rem', borderRadius: '0.25rem', border: '1px solid rgba(232,65,66,0.25)', fontWeight: 600 }}>
              🔴 Adobe
            </span>
          )}
        </div>
        {isOpen
          ? <ChevronDown style={{ width: '0.9rem', height: '0.9rem', color: 'var(--text-3)' }} />
          : <ChevronRight style={{ width: '0.9rem', height: '0.9rem', color: 'var(--text-3)' }} />}
      </button>

      {isOpen && (
        <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

          {/* Adobe Stock Quick Setup Banner (only if not already added) */}
          {!hasAdobe && (
            <button
              onClick={handleAddAdobe}
              style={{
                width: '100%', padding: '0.55rem 0.65rem',
                background: 'linear-gradient(135deg, rgba(232,65,66,0.12) 0%, rgba(255,100,50,0.07) 100%)',
                border: '1px dashed rgba(232,65,66,0.4)',
                borderRadius: '0.45rem', color: '#ff8a8a', fontSize: '0.73rem', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                transition: 'all 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(232,65,66,0.2) 0%, rgba(255,100,50,0.12) 100%)'}
              onMouseOut={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(232,65,66,0.12) 0%, rgba(255,100,50,0.07) 100%)'}
            >
              <span style={{ fontSize: '0.9rem' }}>🔴</span>
              <span>Adobe Stock SFTP যোগ করুন</span>
              <Zap style={{ width: '0.7rem', height: '0.7rem', marginLeft: 'auto' }} />
            </button>
          )}

          {/* Config List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {ftpConfigs.map(config => {
              const isBeingEdited = editingConfig && editingConfig.id === config.id;
              const isAdobe = isAdobeConfig(config);
              const icon = AGENCY_ICONS[config.websiteName] || '🔘';
              const protocol = parseInt(config.port) === 22 ? 'SFTP' : (config.secure ? 'FTPS' : 'FTP');

              return (
                <div
                  key={config.id}
                  style={{
                    display: 'flex', flexDirection: 'column',
                    border: isBeingEdited
                      ? `1px solid ${isAdobe ? 'rgba(232,65,66,0.6)' : 'var(--accent)'}`
                      : `1px solid ${isAdobe ? 'rgba(232,65,66,0.2)' : 'var(--glass-border)'}`,
                    borderRadius: '0.45rem', overflow: 'hidden',
                    transition: 'border-color 0.2s ease',
                    background: isAdobe ? 'rgba(232,65,66,0.03)' : 'transparent'
                  }}
                >
                  {/* Row */}
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    padding: '0.4rem 0.5rem',
                    background: isBeingEdited
                      ? (isAdobe ? 'rgba(232,65,66,0.1)' : 'rgba(6,182,212,0.12)')
                      : (config.enabled && isAdobe ? 'rgba(232,65,66,0.05)' : config.enabled ? 'rgba(6,182,212,0.04)' : 'var(--surface-1)'),
                  }}>
                    {/* Enable Toggle */}
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={e => toggleConfigEnable(config.id, e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: isAdobe ? '#e84142' : 'var(--accent)', marginRight: '0.45rem', width: '0.9rem', height: '0.9rem', flexShrink: 0 }}
                    />

                    {/* Name + Info */}
                    <div
                      onClick={() => handleEdit(config)}
                      style={{ flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.05rem', minWidth: 0 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: config.enabled ? (isAdobe ? '#ff8a8a' : 'var(--text-1)') : 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {icon} {config.websiteName || config.host || "Unnamed"}
                        </span>
                        <span style={{
                          fontSize: '0.55rem', padding: '0.05rem 0.28rem', borderRadius: '99px', fontWeight: 700, flexShrink: 0,
                          background: protocol === 'SFTP' ? 'rgba(251,191,36,0.15)' : 'rgba(99,102,241,0.12)',
                          color: protocol === 'SFTP' ? '#fbbf24' : '#818cf8',
                          border: `1px solid ${protocol === 'SFTP' ? 'rgba(251,191,36,0.25)' : 'rgba(99,102,241,0.2)'}`
                        }}>
                          {protocol}
                        </span>
                      </div>
                      {config.user && (
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {config.host ? `${config.host}:${config.port}` : ''}
                        </span>
                      )}
                    </div>

                    {/* Adobe Portal Link (inline) */}
                    {isAdobe && (
                      <button
                        onClick={e => { e.stopPropagation(); openPortal('https://contributor.stock.adobe.com/uploads'); }}
                        title="Adobe Uploads Portal"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'rgba(232,65,66,0.6)', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
                        onMouseOver={e => e.currentTarget.style.color = '#e84142'}
                        onMouseOut={e => e.currentTarget.style.color = 'rgba(232,65,66,0.6)'}
                      >
                        <ExternalLink style={{ width: '0.7rem', height: '0.7rem' }} />
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(config.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--danger)', opacity: 0.55, display: 'flex', alignItems: 'center', transition: 'opacity 0.15s' }}
                      onMouseOver={e => e.currentTarget.style.opacity = '1'}
                      onMouseOut={e => e.currentTarget.style.opacity = '0.55'}
                    >
                      <Trash2 style={{ width: '0.75rem', height: '0.75rem' }} />
                    </button>

                    {/* Expand Arrow */}
                    <button
                      onClick={() => handleEdit(config)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}
                    >
                      {expandedId === config.id
                        ? <ChevronDown style={{ width: '0.85rem', height: '0.85rem' }} />
                        : <ChevronRight style={{ width: '0.85rem', height: '0.85rem' }} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Divider */}
          {ftpConfigs.length > 0 && (
            <div style={{ height: '1px', background: 'var(--glass-border)', margin: '0.1rem 0' }} />
          )}

          {/* Add Generic */}
          <button
            onClick={handleAddNew}
            style={{
              width: '100%', padding: '0.45rem', background: 'var(--surface-2)',
              border: '1px dashed var(--glass-border)', borderRadius: '0.4rem',
              color: 'var(--text-2)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
              transition: 'all 0.15s'
            }}
            onMouseOver={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.borderColor = 'var(--text-3)'; }}
            onMouseOut={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
          >
            <Plus style={{ width: '0.75rem', height: '0.75rem' }} /> Add FTP/SFTP Server
          </button>
        </div>
      )}
    </div>
  );
}
