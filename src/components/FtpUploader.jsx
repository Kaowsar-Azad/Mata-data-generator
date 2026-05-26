import { useState, useRef, useEffect, useCallback } from "react";
import {
  Server, ShieldCheck, Loader2, Save, Upload, Trash2, CheckCircle2, X,
  ExternalLink, Info, RefreshCw, Zap, AlertCircle, CloudUpload, Link,
  ChevronDown, ChevronUp, Key, Globe
} from "lucide-react";

const POPULAR_AGENCIES = [
  {
    name: "Adobe Stock",
    host: "sftp.contributor.adobestock.com",
    port: 22,
    url: "https://contributor.stock.adobe.com/uploads",
    helpText: "Adobe Stock SFTP (Port 22). Contributor Portal → Upload → 'Learn more' → Generate Password. Username = your Contributor ID. ✅ Max 3 simultaneous connections per account.",
    secure: false,
    isAdobe: true,
    color: "#e84142",
    icon: "🔴",
    badge: "SFTP"
  },
  {
    name: "Shutterstock",
    host: "ftps.shutterstock.com",
    port: 21,
    url: "https://support.submit.shutterstock.com/s/article/How-do-I-upload-content-to-Shutterstock-via-FTP",
    helpText: "Shutterstock uses FTPS (Port 21, Secure). Use your Contributor email and account password directly.",
    secure: true,
    isAdobe: false,
    color: "#e8441c",
    icon: "🔶",
    badge: "FTPS"
  },
  {
    name: "Freepik",
    host: "ftp.freepik.com",
    port: 21,
    url: "https://contributor.freepik.com/dashboard",
    helpText: "Find your FTP credentials in the Freepik dashboard under the 'FTP Upload' section.",
    secure: false,
    isAdobe: false,
    color: "#1ab2a4",
    icon: "🟢",
    badge: "FTP"
  },
  {
    name: "Vecteezy",
    host: "ftp.vecteezy.com",
    port: 21,
    url: "https://contributors.vecteezy.com/dashboard",
    helpText: "Find your FTP credentials in your Vecteezy contributor dashboard.",
    secure: false,
    isAdobe: false,
    color: "#4263f5",
    icon: "🔵",
    badge: "FTP"
  },
  {
    name: "Dreamstime",
    host: "ftp.dreamstime.com",
    port: 21,
    url: "https://www.dreamstime.com/upload/help-ftp-upload",
    helpText: "Use your Dreamstime account credentials. Max 4 connections recommended.",
    secure: false,
    isAdobe: false,
    color: "#aa44cc",
    icon: "🟣",
    badge: "FTP"
  }
];

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}



export function FtpUploader({ ftpConfigs = [], setFtpConfigs, editingConfig, setEditingConfig }) {
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSpeed, setUploadSpeed] = useState(null); // bytes/sec
  const [uploadStart, setUploadStart] = useState(null);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [currentJobId, setCurrentJobId] = useState(null);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [testingStatus, setTestingStatus] = useState({});
  const isAdobeConfig = (config) => {
    const h = (config?.host || '').toLowerCase();
    return h.includes('adobe') || h.includes('adobestock') || h.includes('contributor.stock');
  };

  const activeConfigs = ftpConfigs.filter(c => c.enabled);
  const adobeActive = activeConfigs.some(isAdobeConfig);

  useEffect(() => {
    setTestResult(null);
  }, [editingConfig?.id]);

  useEffect(() => {
    return () => {
      if (currentJobId && window.electronAPI?.cancelFtp) {
        window.electronAPI.cancelFtp(currentJobId);
      }
    };
  }, [currentJobId]);

  useEffect(() => {
    if (window.electronAPI?.onFtpProgress) {
      const unsubscribe = window.electronAPI.onFtpProgress(({ filePath, progress, host }) => {
        setFiles(prev => prev.map(f => {
          // Normalize paths for windows
          const fPath = f.path.replace(/\\/g, '/');
          const pPath = filePath.replace(/\\/g, '/');
          if (fPath === pPath) {
            const currentProgressMap = typeof f.progress === 'object' && f.progress !== null
              ? { ...f.progress }
              : {};
            currentProgressMap[host] = progress;
            
            let isAll100 = activeConfigs.length > 0;
            for (const conf of activeConfigs) {
              if (currentProgressMap[conf.host] !== 100) {
                isAll100 = false;
                break;
              }
            }
            
            return { ...f, progress: currentProgressMap, status: isAll100 ? 'success' : f.status };
          }
          return f;
        }));
      });
      return unsubscribe;
    }
  }, [activeConfigs]);

  const handleTestSpecificConfig = async (config) => {
    setTestingStatus(prev => ({ ...prev, [config.id]: { isTesting: true, result: null } }));
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.testFtp(config);
        if (res.success) {
          setTestingStatus(prev => ({ ...prev, [config.id]: { isTesting: false, result: { success: true, msg: "✅ Connected successfully!" } } }));
        } else {
          setTestingStatus(prev => ({ ...prev, [config.id]: { isTesting: false, result: { success: false, msg: res.error || "Connection failed" } } }));
        }
      }
    } catch (err) {
      setTestingStatus(prev => ({ ...prev, [config.id]: { isTesting: false, result: { success: false, msg: err.message } } }));
    }
  };

  const handleCancel = () => setEditingConfig(null);

  const handleTest = async () => {
    if (!editingConfig) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.testFtp(editingConfig);
        if (res.success) {
          setTestResult({ success: true, msg: "✅ Connection successful!" });
        } else {
          setTestResult({ success: false, msg: res.error || "Connection failed" });
        }
      }
    } catch (err) {
      setTestResult({ success: false, msg: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!editingConfig) return;
    setIsSaving(true);
    let updatedConfigs;
    if (ftpConfigs.find(c => c.id === editingConfig.id)) {
      updatedConfigs = ftpConfigs.map(c => c.id === editingConfig.id ? editingConfig : c);
    } else {
      updatedConfigs = [...ftpConfigs, editingConfig];
    }
    setFtpConfigs(updatedConfigs);
    if (window.electronAPI) {
      await window.electronAPI.saveFtpConfig(updatedConfigs);
    }
    setIsSaving(false);
    setEditingConfig(null);
  };

  const handleSelectAgency = (agency) => {
    setEditingConfig({
      ...editingConfig,
      websiteName: agency.name,
      host: agency.host,
      port: agency.port,
      secure: agency.secure
    });
  };

  const handleOpenHelpUrl = (url) => {
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const activeAgencyInfo = POPULAR_AGENCIES.find(
    a => a.name.toLowerCase() === editingConfig?.websiteName?.trim().toLowerCase()
  );

  // Drag & Drop
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addNewFiles(droppedFiles);
  }, []);

  const addNewFiles = (selectedFiles) => {
    if (!selectedFiles.length) return;
    const newFiles = selectedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      path: file.path,
      name: file.name,
      size: file.size,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      status: 'pending',
      error: null
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const onFilesSelected = (e) => {
    addNewFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const removeFile = (id) => {
    const fileToRemove = files.find(f => f.id === id);
    if (fileToRemove?.previewUrl) URL.revokeObjectURL(fileToRemove.previewUrl);
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    if (currentJobId && window.electronAPI?.cancelFtp) {
      window.electronAPI.cancelFtp(currentJobId);
    }
    files.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    setFiles([]);
    setUploadSpeed(null);
    setUploadedBytes(0);
    setCurrentJobId(null);
    setIsUploading(false);
  };

  const uploadFiles = async () => {
    if (!window.electronAPI || files.length === 0 || activeConfigs.length === 0) return;
    setIsUploading(true);
    setUploadSpeed(null);
    setUploadedBytes(0);

    const t0 = Date.now();
    setUploadStart(t0);

    const pendingFiles = files.filter(f => f.status !== 'success');
    const filePaths = pendingFiles.map(f => f.path).filter(Boolean);

    if (filePaths.length === 0) {
      setIsUploading(false);
      return;
    }

    // Calculate total size for speed estimation
    const totalSize = pendingFiles.reduce((acc, f) => acc + (f.size || 0), 0);

    setFiles(prev => prev.map(item =>
      pendingFiles.some(pf => pf.id === item.id)
        ? { ...item, status: 'uploading', progress: {}, error: null }
        : item
    ));

    const newJobId = Math.random().toString(36).substr(2, 9);
    setCurrentJobId(newJobId);

    try {
      const uploadPromises = activeConfigs.map(async (conf) => {
        const res = await window.electronAPI.uploadFtp(conf, filePaths, newJobId);
        if (!res.success) {
          throw new Error(`Failed on ${conf.websiteName || conf.host}: ${res.error}`);
        }
      });

      await Promise.all(uploadPromises);

      const elapsed = (Date.now() - t0) / 1000;
      if (totalSize > 0 && elapsed > 0) {
        setUploadSpeed(totalSize / elapsed);
        setUploadedBytes(totalSize);
      }

      setFiles(prev => prev.map(item =>
        pendingFiles.some(pf => pf.id === item.id) && item.status !== 'success'
          ? { ...item, status: 'success' }
          : item
      ));

      // Automatically open/refresh contributor portals for active configurations
      if (window.electronAPI?.openExternal) {
        activeConfigs.forEach(conf => {
          const host = (conf.host || '').toLowerCase();
          let portalUrl = null;
          if (host.includes('adobestock') || host.includes('adobe') || host.includes('contributor.stock')) {
            portalUrl = "https://contributor.stock.adobe.com/uploads";
          } else if (host.includes('shutterstock')) {
            portalUrl = "https://submit.shutterstock.com/";
          } else if (host.includes('freepik')) {
            portalUrl = "https://contributor.freepik.com/dashboard";
          } else if (host.includes('vecteezy')) {
            portalUrl = "https://contributors.vecteezy.com/dashboard";
          } else if (host.includes('dreamstime')) {
            portalUrl = "https://www.dreamstime.com/uploadfiles.php";
          }
          if (portalUrl) {
            window.electronAPI.openExternal(portalUrl);
          }
        });
      }
    } catch (uploadErr) {
      setFiles(prev => prev.map(item =>
        pendingFiles.some(pf => pf.id === item.id) && item.status !== 'success'
          ? { ...item, status: 'error', error: uploadErr.message }
          : item
      ));
    }

    setIsUploading(false);
    setCurrentJobId(null);
  };

  const successCount = files.filter(f => f.status === 'success').length;
  const failedCount = files.filter(f => f.status === 'error').length;
  const totalSize = files.reduce((a, f) => a + (f.size || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', height: '100%' }}>

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>

        {/* ─── Left Pane: Config Form ─── */}
        {editingConfig && (
          <div className="card glass animate-fade-in" style={{ width: '380px', flexShrink: 0, padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.65rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Server style={{ width: '1rem', height: '1rem', color: 'var(--accent)' }} />
                {ftpConfigs.some(c => c.id === editingConfig.id) ? 'Edit FTP Connection' : 'New FTP Connection'}
              </h3>
              <button onClick={handleCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--text-3)', display: 'flex' }}>
                <X style={{ width: '1rem', height: '1rem' }} />
              </button>
            </div>

            {/* Quick Setup Buttons */}
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Setup — Agency</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
                {POPULAR_AGENCIES.map(agency => (
                  <button
                    key={agency.name}
                    type="button"
                    onClick={() => handleSelectAgency(agency)}
                    title={`Set up ${agency.name} credentials`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.3rem 0.6rem', fontSize: '0.72rem', borderRadius: '0.35rem',
                      background: editingConfig.websiteName === agency.name ? `rgba(${agency.color === '#e84142' ? '232,65,66' : '99,102,241'},0.15)` : 'var(--surface-2)',
                      border: `1px solid ${editingConfig.websiteName === agency.name ? agency.color + '55' : 'var(--glass-border)'}`,
                      color: editingConfig.websiteName === agency.name ? agency.color : 'var(--text-2)',
                      cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s'
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-1)'; }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = editingConfig.websiteName === agency.name ? `rgba(99,102,241,0.15)` : 'var(--surface-2)';
                      e.currentTarget.style.color = editingConfig.websiteName === agency.name ? agency.color : 'var(--text-2)';
                    }}
                  >
                    <span style={{ fontSize: '0.75rem' }}>{agency.icon}</span>
                    {agency.name}
                    <span style={{ fontSize: '0.58rem', padding: '0.05rem 0.3rem', borderRadius: '99px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-3)' }}>{agency.badge}</span>
                  </button>
                ))}
              </div>

              {/* Agency Help Info */}
              {activeAgencyInfo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.35rem' }}>
                  <div style={{ display: 'flex', gap: '0.45rem', background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)', padding: '0.55rem 0.7rem', borderRadius: '0.4rem' }}>
                    <Info style={{ width: '0.85rem', height: '0.85rem', color: 'var(--accent)', flexShrink: 0, marginTop: '0.05rem' }} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-2)', lineHeight: 1.5 }}>{activeAgencyInfo.helpText}</span>
                  </div>
                  {activeAgencyInfo.url && (
                    <button
                      onClick={() => handleOpenHelpUrl(activeAgencyInfo.url)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.6rem', borderRadius: '0.35rem', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', width: '100%', justifyContent: 'center', transition: 'all 0.15s' }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(6,182,212,0.15)'}
                      onMouseOut={e => e.currentTarget.style.background = 'rgba(6,182,212,0.08)'}
                    >
                      <ExternalLink style={{ width: '0.75rem', height: '0.75rem' }} />
                      {activeAgencyInfo.name} Portal খুলুন
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Platform Name</label>
              <input
                type="text" placeholder="e.g. Adobe Stock"
                value={editingConfig.websiteName || ''}
                onChange={e => setEditingConfig({ ...editingConfig, websiteName: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Host / Server</label>
                <input
                  type="text" placeholder="sftp.contributor.adobestock.com"
                  value={editingConfig.host || ''}
                  onChange={e => setEditingConfig({ ...editingConfig, host: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Port</label>
                <input
                  type="number"
                  value={editingConfig.port || 21}
                  onChange={e => setEditingConfig({ ...editingConfig, port: parseInt(e.target.value) || 21 })}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Username / Contributor ID</label>
              <input
                type="text"
                placeholder="Your contributor ID"
                value={editingConfig.user || ''}
                onChange={e => setEditingConfig({ ...editingConfig, user: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Password (SFTP-generated)</label>
              <input
                type="password"
                placeholder="Generate from Contributor Portal"
                value={editingConfig.password || ''}
                onChange={e => setEditingConfig({ ...editingConfig, password: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="ftp-secure-checkbox"
                checked={editingConfig.secure || false}
                onChange={e => setEditingConfig({ ...editingConfig, secure: e.target.checked })}
                style={{ cursor: 'pointer', width: '1rem', height: '1rem', accentColor: 'var(--accent)' }}
              />
              <label htmlFor="ftp-secure-checkbox" style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer', userSelect: 'none' }}>
                Use Secure Connection (FTPS) — Shutterstock only
              </label>
            </div>

            {testResult && (
              <div style={{
                padding: '0.65rem', borderRadius: '0.45rem', fontSize: '0.8rem',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: testResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: testResult.success ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${testResult.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
              }}>
                {testResult.success ? <CheckCircle2 style={{ width: '0.95rem', height: '0.95rem' }} /> : <AlertCircle style={{ width: '0.95rem', height: '0.95rem' }} />}
                <span>{testResult.msg}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button
                onClick={handleTest}
                disabled={isTesting || !editingConfig.host || !editingConfig.user}
                className="btn-outline"
                style={{ flex: 1, padding: '0.5rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                {isTesting ? <Loader2 className="animate-spin" style={{ width: '0.9rem', height: '0.9rem' }} /> : <ShieldCheck style={{ width: '0.9rem', height: '0.9rem' }} />}
                Test Connection
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !editingConfig.host}
                className="btn-primary"
                style={{ flex: 1, padding: '0.5rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                {isSaving ? <Loader2 className="animate-spin" style={{ width: '0.9rem', height: '0.9rem' }} /> : <Save style={{ width: '0.9rem', height: '0.9rem' }} />}
                Save Config
              </button>
            </div>
          </div>
        )}

        {/* ─── Right Pane: Upload Area ─── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Active Server Cards */}
          {activeConfigs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {activeConfigs.map(c => {
                const status = testingStatus[c.id];
                const isAdobe = isAdobeConfig(c);
                
                const agencyInfo = POPULAR_AGENCIES.find(
                  a => a.name.toLowerCase() === c.websiteName?.trim().toLowerCase() ||
                       c.host.toLowerCase().includes(a.name.toLowerCase().replace(' ', ''))
                );
                const color = agencyInfo?.color || 'var(--primary)';
                const icon = agencyInfo?.icon || '🌐';

                return (
                  <div
                    key={c.id}
                    style={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--glass-border)',
                      borderLeft: `3px solid ${color}`,
                      padding: '0.8rem 1rem',
                      borderRadius: '0.65rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      minWidth: '220px',
                      maxWidth: '260px',
                      boxShadow: 'var(--glass-shadow)',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.9rem' }}>{icon}</span>
                        {c.websiteName || 'FTP Server'}
                      </span>
                      <span style={{
                        fontSize: '0.58rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '99px',
                        background: 'rgba(16,185,129,0.08)',
                        color: 'var(--success)',
                        border: '1px solid rgba(16,185,129,0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}>
                        <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
                        Active
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.72rem', margin: '0.2rem 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        <Globe className="w-3.5 h-3.5" style={{ opacity: 0.6, color }} />
                        <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>Host:</span>
                        <strong style={{ fontFamily: 'monospace', color: 'var(--text-1)' }}>{c.host}:{c.port}</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        <Key className="w-3.5 h-3.5" style={{ opacity: 0.6, color }} />
                        <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>User:</span>
                        <strong style={{ color: 'var(--text-1)' }}>{c.user || '—'}</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Server className="w-3.5 h-3.5" style={{ opacity: 0.6, color }} />
                        <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>Protocol:</span>
                        <strong style={{ color: 'var(--text-1)' }}>{parseInt(c.port) === 22 ? 'SFTP' : (c.secure ? 'FTPS' : 'FTP')}</strong>
                      </div>
                    </div>

                    {status?.result && (
                      <div style={{
                        fontSize: '0.68rem', padding: '0.3rem 0.5rem', borderRadius: '0.4rem',
                        background: status.result.success ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                        color: status.result.success ? 'var(--success)' : 'var(--danger)',
                        border: `1px solid ${status.result.success ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`,
                        lineHeight: 1.3
                      }}>
                        {status.result.msg}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.2rem' }}>
                      <button
                        type="button"
                        onClick={() => handleTestSpecificConfig(c)}
                        disabled={status?.isTesting}
                        style={{
                          flex: 1, background: 'var(--surface-2)', border: '1px solid var(--glass-border)',
                          borderRadius: '0.4rem', padding: '0.35rem 0.5rem', fontSize: '0.68rem',
                          color: 'var(--text-2)', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                          fontWeight: 700, transition: 'all 0.15s'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                        onMouseOut={e => e.currentTarget.style.background = 'var(--surface-2)'}
                      >
                        {status?.isTesting ? <Loader2 className="animate-spin" style={{ width: '0.75rem', height: '0.75rem' }} /> : <RefreshCw style={{ width: '0.75rem', height: '0.75rem' }} />}
                        Test Connection
                      </button>

                      {isAdobe && (
                        <button
                          type="button"
                          onClick={() => handleOpenHelpUrl("https://contributor.stock.adobe.com/uploads")}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                            padding: '0.35rem 0.5rem', borderRadius: '0.4rem',
                            background: 'rgba(232,65,66,0.1)', border: '1px solid rgba(232,65,66,0.2)',
                            color: '#e84142', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                          onMouseOver={e => e.currentTarget.style.background = 'rgba(232,65,66,0.2)'}
                          onMouseOut={e => e.currentTarget.style.background = 'rgba(232,65,66,0.1)'}
                        >
                          <ExternalLink style={{ width: '0.65rem', height: '0.65rem' }} />
                          Portal
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Drop Zone */}
          <div
            ref={dropZoneRef}
            className="drop-zone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              background: isDragging ? 'rgba(37,99,235,0.08)' : 'var(--surface-1)',
              border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--glass-border)'}`,
              borderRadius: '1rem', padding: '2rem', textAlign: 'center', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
              transition: 'all 0.2s ease', minHeight: '160px', justifyContent: 'center',
              transform: isDragging ? 'scale(1.01)' : 'scale(1)'
            }}
          >
            <input type="file" multiple ref={fileInputRef} onChange={onFilesSelected} style={{ display: "none" }} accept="image/*,.eps,.ai,.svg,.pdf" />
            <div style={{ width: '3rem', height: '3rem', borderRadius: '50%', background: 'var(--primary-glow)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CloudUpload style={{ width: '1.4rem', height: '1.4rem' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-1)', margin: '0 0 0.25rem 0' }}>
                {activeConfigs.length > 0
                  ? <>Upload to <span style={{ color: 'var(--primary)' }}>{activeConfigs.map(c => c.websiteName || c.host).join(', ')}</span></>
                  : 'Drop Files to Upload via FTP/SFTP'}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: 0 }}>
                {activeConfigs.length > 0
                  ? `${activeConfigs.length} server(s) — JPG, EPS, AI, SVG, PNG`
                  : 'Sidebar থেকে একটি FTP connection activate করুন'}
              </p>
            </div>
          </div>

          {/* Action & Stats Bar */}
          <div className="card glass" style={{ padding: '0.85rem 1rem', background: 'var(--surface-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, color: 'var(--text-1)', fontSize: '0.95rem' }}>
                {files.length} {files.length === 1 ? 'File' : 'Files'}
              </span>
              {totalSize > 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 500 }}>
                  {formatBytes(totalSize)}
                </span>
              )}
              {files.length > 0 && (
                <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 700 }}>
                  ✓ {successCount} / {files.length} ({Math.round((successCount / files.length) * 100)}%) Uploaded
                </span>
              )}
              {failedCount > 0 && (
                <span style={{ fontSize: '0.78rem', color: 'var(--danger)', fontWeight: 700 }}>
                  ✖ {failedCount} Failed
                </span>
              )}
              {uploadSpeed && (
                <span style={{ fontSize: '0.72rem', color: '#7dd3fc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Zap style={{ width: '0.7rem', height: '0.7rem' }} />
                  {formatBytes(uploadSpeed)}/s
                </span>
              )}
              {files.length > 0 && (
                <button
                  onClick={clearAll}
                  className="btn-outline"
                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <Trash2 style={{ width: '0.75rem', height: '0.75rem' }} /> Clear
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.65rem' }}>
              {failedCount > 0 && (
                <button
                  className="btn-outline"
                  onClick={uploadFiles}
                  disabled={isUploading || activeConfigs.length === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'rgba(239,68,68,0.4)', color: 'var(--danger)', padding: '0.45rem 1rem', background: 'rgba(239,68,68,0.05)', fontSize: '0.8rem' }}
                >
                  {isUploading ? <Loader2 style={{ width: '0.9rem', height: '0.9rem', animation: 'spin 1s linear infinite' }} /> : <RefreshCw style={{ width: '0.9rem', height: '0.9rem' }} />}
                  Retry Failed
                </button>
              )}
              <button
                className="btn-primary"
                onClick={uploadFiles}
                disabled={isUploading || files.length === 0 || activeConfigs.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: 'linear-gradient(135deg, var(--accent), var(--primary))', padding: '0.45rem 1.25rem', fontSize: '0.82rem', fontWeight: 700 }}
              >
                {isUploading
                  ? <><Loader2 style={{ width: '0.9rem', height: '0.9rem', animation: 'spin 1s linear infinite' }} /> Uploading...</>
                  : <><Upload style={{ width: '0.9rem', height: '0.9rem' }} /> Start Upload</>}
              </button>

              {/* After upload: show Adobe portal link */}
              {adobeActive && successCount > 0 && !isUploading && (
                <button
                  onClick={() => handleOpenHelpUrl("https://contributor.stock.adobe.com/uploads")}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.45rem 1rem', borderRadius: '0.55rem',
                    background: 'linear-gradient(135deg, rgba(232,65,66,0.8), rgba(255,100,50,0.8))',
                    border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 2px 10px rgba(232,65,66,0.3)'
                  }}
                  onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                  onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <ExternalLink style={{ width: '0.85rem', height: '0.85rem' }} />
                  Submit on Adobe →
                </button>
              )}
            </div>
          </div>

          {/* Upload success reminder for Adobe */}
          {adobeActive && successCount > 0 && !isUploading && (
            <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', padding: '0.65rem 0.85rem', borderRadius: '0.55rem', alignItems: 'flex-start' }}>
              <CheckCircle2 style={{ width: '0.9rem', height: '0.9rem', color: 'var(--success)', flexShrink: 0, marginTop: '0.05rem' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--success)' }}>{successCount} file(s) Adobe Stock-এ পাঠানো হয়েছে!</strong> এখন Contributor Portal-এ গিয়ে Uploads ট্যাবে metadata (title, keywords, category) যোগ করুন এবং Submit করুন।
              </span>
            </div>
          )}

          {/* Files List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, overflowY: 'auto' }}>
            {[...files].sort((a, b) => {
              const getScore = (f) => {
                if (f.status === 'uploading') return 0;
                if (f.status === 'pending') return 1;
                if (f.status === 'error') return 2;
                if (f.status === 'success') return 3;
                return 4;
              };
              return getScore(a) - getScore(b);
            }).map(file => (
              <div key={file.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: file.status === 'success' ? 'rgba(16,185,129,0.04)' : file.status === 'error' ? 'rgba(239,68,68,0.04)' : 'var(--surface-1)',
                padding: '0.65rem 0.9rem', borderRadius: '0.65rem',
                border: `1px solid ${file.status === 'success' ? 'rgba(16,185,129,0.2)' : file.status === 'error' ? 'rgba(239,68,68,0.2)' : 'var(--glass-border)'}`,
                transition: 'all 0.2s'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden' }}>
                  {/* Thumbnail */}
                  <div style={{ width: '2.25rem', height: '2.25rem', flexShrink: 0, borderRadius: '0.4rem', overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                    {file.previewUrl
                      ? <img src={file.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: '0.65rem', fontWeight: 700 }}>EPS</div>
                    }
                  </div>

                  {/* Status Icon */}
                  <div style={{
                    padding: '0.35rem', borderRadius: '0.4rem',
                    background: file.status === 'success' ? 'rgba(16,185,129,0.1)' : file.status === 'error' ? 'rgba(239,68,68,0.1)' : file.status === 'uploading' ? 'var(--primary-glow)' : 'var(--surface-2)',
                    color: file.status === 'success' ? 'var(--success)' : file.status === 'error' ? 'var(--danger)' : file.status === 'uploading' ? 'var(--primary)' : 'var(--text-3)'
                  }}>
                    {file.status === 'success' ? <CheckCircle2 style={{ width: '0.9rem', height: '0.9rem' }} /> :
                      file.status === 'error' ? <X style={{ width: '0.9rem', height: '0.9rem' }} /> :
                        file.status === 'uploading' ? <Loader2 style={{ width: '0.9rem', height: '0.9rem', animation: 'spin 1s linear infinite' }} /> :
                          <Upload style={{ width: '0.9rem', height: '0.9rem' }} />}
                  </div>

                  {/* File Info */}
                  <div style={{ overflow: 'hidden' }}>
                    <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {file.name}
                    </h4>
                    
                    {/* Progress Bar for Uploading Status */}
                    {file.status === 'uploading' && file.progress !== undefined && (() => {
                      const displayProgress = (() => {
                        if (typeof file.progress === 'number') return file.progress;
                        if (typeof file.progress === 'object' && file.progress !== null) {
                          if (activeConfigs.length === 0) return 0;
                          const sum = activeConfigs.reduce((s, conf) => s + (file.progress[conf.host] || 0), 0);
                          return Math.round(sum / activeConfigs.length);
                        }
                        return 0;
                      })();
                      return (
                        <div style={{ marginTop: '0.35rem', marginBottom: '0.2rem', width: '100%', height: '4px', background: 'var(--surface-2)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${displayProgress}%`, background: 'var(--primary)', transition: 'width 0.2s ease' }} />
                        </div>
                      );
                    })()}

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.1rem' }}>
                      {file.size > 0 && <span style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>{formatBytes(file.size)}</span>}
                      {file.status === 'uploading' && (() => {
                        const displayProgress = (() => {
                          if (typeof file.progress === 'number') return file.progress;
                          if (typeof file.progress === 'object' && file.progress !== null) {
                            if (activeConfigs.length === 0) return 0;
                            const sum = activeConfigs.reduce((s, conf) => s + (file.progress[conf.host] || 0), 0);
                            return Math.round(sum / activeConfigs.length);
                          }
                          return 0;
                        })();
                        return (
                          <span style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 600 }}>
                            Uploading... {displayProgress}%
                          </span>
                        );
                      })()}
                      {file.status === 'success' && <span style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 600 }}>✓ Uploaded</span>}
                      {file.error && <span style={{ fontSize: '0.65rem', color: 'var(--danger)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.error}</span>}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => removeFile(file.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0.2rem', flexShrink: 0 }}
                  title="Remove"
                >
                  <X style={{ width: '0.9rem', height: '0.9rem' }} />
                </button>
              </div>
            ))}

            {files.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-3)' }}>
                <Upload style={{ width: '2rem', height: '2rem', margin: '0 auto 0.75rem', opacity: 0.3 }} />
                <p style={{ fontSize: '0.85rem', margin: 0 }}>ছবি নির্বাচন করুন বা drop zone-এ ছেড়ে দিন</p>
                <p style={{ fontSize: '0.72rem', margin: '0.25rem 0 0', color: 'var(--text-3)', opacity: 0.7 }}>JPG, EPS, AI, SVG, PNG সব ধরণের ফাইল সাপোর্ট করে</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
