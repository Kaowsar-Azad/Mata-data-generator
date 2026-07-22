import { useState, useEffect } from "react";
import { Server, ChevronDown, ChevronRight, Plus, Trash2, ExternalLink, Zap, CheckCircle2 } from "lucide-react";

const ADOBE_HOSTS = ['adobe', 'adobestock', 'contributor.stock'];

function isAdobeConfig(config) {
  const h = (config?.host || '').toLowerCase();
  return ADOBE_HOSTS.some(k => h.includes(k));
}

const getAgencyIcon = (name) => {
  const domains = {
    "Adobe Stock": "adobe.com",
    "Shutterstock": "shutterstock.com",
    "Freepik": "freepik.com",
    "Vecteezy": "vecteezy.com",
    "Dreamstime": "dreamstime.com"
  };
  const domain = domains[name];
  if (domain) {
    return (
      <img 
        src={`https://logo.clearbit.com/${domain}`} 
        alt={name} 
        style={{ width: '1.45rem', height: '1.45rem', borderRadius: '4px', objectFit: 'contain' }} 
        onError={(e) => { 
          if (!e.target.dataset.fallback) {
            e.target.dataset.fallback = 'true';
            e.target.src = `https://icon.horse/icon/${domain}`;
          } else {
            e.target.style.display = 'none';
          }
        }}
      />
    );
  }
  return <span style={{ fontSize: '1.2rem' }}>🔘</span>;
};

export function FtpConfigManager({ ftpConfigs, setFtpConfigs, editingConfig, setEditingConfig, onStartEdit, isCollapsed, setIsCollapsed }) {
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
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between',
          padding: '0.6rem 0.75rem', background: 'var(--surface-2)',
          border: 'none', cursor: 'pointer', color: 'var(--text-1)', fontSize: '0.8rem', fontWeight: 700,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: isCollapsed ? 'center' : 'flex-start', width: '100%' }}>
          <Server style={{ width: '0.85rem', height: '0.85rem', color: 'var(--accent)', flexShrink: 0 }} />
          
          {!isCollapsed && (
            <>
              <span style={{ whiteSpace: 'nowrap' }}>FTP Servers</span>
              {ftpConfigs.length > 0 && (
                <span style={{ background: activeCount > 0 ? 'var(--accent)' : 'var(--surface-3)', color: activeCount > 0 ? 'white' : 'var(--text-3)', borderRadius: '1rem', padding: '0.05rem 0.4rem', fontSize: '0.6rem', fontWeight: 700, flexShrink: 0 }}>
                  {activeCount}/{ftpConfigs.length}
                </span>
              )}
            </>
          )}
        </div>
        {!isCollapsed && (
          isCollapsed 
            ? <ChevronRight style={{ width: '0.9rem', height: '0.9rem', color: 'var(--text-3)' }} />
            : <ChevronRight style={{ width: '0.9rem', height: '0.9rem', color: 'var(--text-3)', transform: 'rotate(180deg)' }} />
        )}
      </button>

      <div style={{ padding: isCollapsed ? '0.65rem 0.3rem' : '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflow: 'hidden' }}>
        {/* Add Generic Button (Prominent) */}
        <button
          onClick={handleAddNew}
          title="Add New FTP/SFTP Server"
          style={{
            width: '100%', padding: '0.65rem',
            background: 'linear-gradient(135deg, var(--accent), var(--primary))',
            border: 'none', borderRadius: '0.5rem',
            color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            boxShadow: '0 4px 12px rgba(6,182,212,0.25)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            whiteSpace: 'nowrap'
          }}
          onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(6,182,212,0.35)'; }}
          onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(6,182,212,0.25)'; }}
        >
          <Plus style={{ width: '0.9rem', height: '0.9rem', flexShrink: 0 }} /> 
          {!isCollapsed && <span>Add New FTP/SFTP Server</span>}
        </button>

        {/* Adobe Stock Quick Setup Banner (only if not already added) */}
        {!hasAdobe && (
          <button
            onClick={handleAddAdobe}
            title="Add Adobe Stock SFTP"
            style={{
              width: '100%', padding: isCollapsed ? '0.55rem 0' : '0.55rem 0.65rem',
              background: 'linear-gradient(135deg, rgba(232,65,66,0.12) 0%, rgba(255,100,50,0.07) 100%)',
              border: '1px dashed rgba(232,65,66,0.4)',
              borderRadius: '0.45rem', color: '#ff8a8a', fontSize: '0.73rem', fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(232,65,66,0.2) 0%, rgba(255,100,50,0.12) 100%)'}
            onMouseOut={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(232,65,66,0.12) 0%, rgba(255,100,50,0.07) 100%)'}
          >
            <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>🔴</span>
            {!isCollapsed && (
              <>
                <span>Add Adobe Stock SFTP</span>
                <Zap style={{ width: '0.7rem', height: '0.7rem', marginLeft: 'auto' }} />
              </>
            )}
          </button>
        )}

          {/* Config List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {ftpConfigs.map(config => {
              const isBeingEdited = editingConfig && editingConfig.id === config.id;
              const isAdobe = isAdobeConfig(config);
              const icon = getAgencyIcon(config.websiteName);
              const protocol = parseInt(config.port) === 22 ? 'SFTP' : (config.secure ? 'FTPS' : 'FTP');

              return (
                <div
                  key={config.id}
                  style={{
                    display: 'flex', flexDirection: 'column',
                    border: isBeingEdited
                      ? `1px solid ${isAdobe ? 'rgba(232,65,66,0.6)' : 'var(--accent)'}`
                      : `1px solid ${isAdobe ? 'rgba(232,65,66,0.2)' : 'var(--glass-border)'}`,
                    borderLeft: isCollapsed
                      ? (config.enabled ? `4px solid ${isAdobe ? '#e84142' : 'var(--accent)'}` : '4px solid transparent')
                      : (isBeingEdited ? `4px solid ${isAdobe ? '#e84142' : 'var(--accent)'}` : '1px solid transparent'),
                    borderRadius: '0.5rem', overflow: 'hidden',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    background: isCollapsed
                      ? (config.enabled ? (isAdobe ? 'rgba(232,65,66,0.08)' : 'rgba(6,182,212,0.08)') : 'var(--surface-1)')
                      : (isBeingEdited 
                          ? (isAdobe ? 'rgba(232,65,66,0.05)' : 'rgba(6,182,212,0.05)') 
                          : (isAdobe ? 'rgba(232,65,66,0.02)' : 'var(--surface-1)')),
                    boxShadow: isBeingEdited ? '0 4px 15px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
                    transform: isBeingEdited ? 'translateY(-2px)' : 'translateY(0)'
                  }}
                  onMouseOver={e => {
                    if (!isBeingEdited) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                    }
                  }}
                  onMouseOut={e => {
                    if (!isBeingEdited) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                    }
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between',
                    padding: isCollapsed ? '0.15rem 0' : '0.4rem 0.5rem',
                    gap: isCollapsed ? '0.25rem' : '0',
                    background: isBeingEdited
                      ? (isAdobe ? 'rgba(232,65,66,0.1)' : 'rgba(6,182,212,0.12)')
                      : (config.enabled && isAdobe ? 'rgba(232,65,66,0.05)' : config.enabled ? 'rgba(6,182,212,0.04)' : 'var(--surface-1)'),
                  }}>
                    {/* Enable Toggle */}
                    {!isCollapsed && (
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        title={config.enabled ? "Disable" : "Enable"}
                        onChange={e => toggleConfigEnable(config.id, e.target.checked)}
                        style={{ 
                          cursor: 'pointer', accentColor: isAdobe ? '#e84142' : 'var(--accent)', 
                          marginRight: '0.45rem', width: '0.9rem', height: '0.9rem', flexShrink: 0 
                        }}
                      />
                    )}

                    {isCollapsed && (
                      <div style={{ position: 'relative', display: 'flex' }}>
                        <span 
                          onClick={() => toggleConfigEnable(config.id, !config.enabled)}
                          title={`Click to ${config.enabled ? 'disable' : 'enable'} ${config.websiteName || config.host || "Unnamed"}`}
                          style={{ 
                            fontSize: '1.25rem', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            flexShrink: 0,
                            opacity: 1,
                            transition: 'all 0.2s ease',
                            padding: '0.1rem',
                            borderRadius: '0.25rem'
                          }}
                          onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.25)'; }}
                          onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                          {icon}
                        </span>
                        {config.enabled && (
                          <div style={{ position: 'absolute', bottom: '-3px', right: '-5px', background: 'var(--surface-1)', borderRadius: '50%', padding: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle2 style={{ width: '12px', height: '12px', color: 'rgba(16, 185, 129, 0.75)' }} />
                          </div>
                        )}
                      </div>
                    )}

                    {!isCollapsed && (
                      <>
                        <div
                          onClick={() => handleEdit(config)}
                          style={{ flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.05rem', minWidth: 0 }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {icon}
                            </div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: config.enabled ? (isAdobe ? '#dc2626' : 'var(--text-1)') : 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {config.websiteName || config.host || "Unnamed"}
                            </span>
                            <span style={{
                              fontSize: '0.55rem', padding: '0.05rem 0.35rem', borderRadius: '99px', fontWeight: 700, flexShrink: 0,
                              background: protocol === 'SFTP' ? 'rgba(245,158,11,0.1)' : 'rgba(79,70,229,0.1)',
                              color: protocol === 'SFTP' ? '#d97706' : '#4f46e5',
                              border: `1px solid ${protocol === 'SFTP' ? 'rgba(245,158,11,0.2)' : 'rgba(79,70,229,0.2)'}`
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

                        {isAdobe && (
                          <button
                            title="Open Portal"
                            onClick={() => openPortal("https://contributor.stock.adobe.com/uploads")}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: '#e84142', display: 'flex' }}
                          >
                            <ExternalLink style={{ width: '0.8rem', height: '0.8rem' }} />
                          </button>
                        )}

                        <button
                          title="Delete Server"
                          onClick={() => handleDelete(config.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'rgba(239,68,68,0.7)', display: 'flex', marginLeft: isAdobe ? '0' : 'auto' }}
                          onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                          onMouseOut={e => e.currentTarget.style.color = 'rgba(239,68,68,0.7)'}
                        >
                          <Trash2 style={{ width: '0.85rem', height: '0.85rem' }} />
                        </button>
                        
                        <ChevronRight style={{ width: '1rem', height: '1rem', color: 'var(--glass-border)', marginLeft: '0.2rem', flexShrink: 0 }} />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
    </div>
  );
}
