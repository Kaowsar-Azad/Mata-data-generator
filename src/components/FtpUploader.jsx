import { useState, useRef, useEffect } from "react";
import { Server, ShieldCheck, Loader2, Save, Upload, Trash2, CheckCircle2, X, ExternalLink, Info, RefreshCw } from "lucide-react";

const POPULAR_AGENCIES = [
  { 
    name: "Adobe Stock", 
    host: "sftp.stock.adobe.com", 
    port: 22, 
    url: "https://contributor.stock.adobe.com/uploads",
    helpText: "Adobe Stock uses SFTP. Go to the Uploads page and click 'SFTP' to generate your password.",
    secure: false
  },
  { 
    name: "Shutterstock", 
    host: "ftps.shutterstock.com", 
    port: 21, 
    url: "https://support.submit.shutterstock.com/s/article/How-do-I-upload-content-to-Shutterstock-via-FTP",
    helpText: "Shutterstock does not have a separate FTP password. Use your Contributor email and account password.",
    secure: true
  },
  { 
    name: "Freepik", 
    host: "ftp.freepik.com", 
    port: 21, 
    url: "https://contributor.freepik.com/dashboard",
    helpText: "Find your FTP credentials in the Freepik dashboard under the 'FTP Upload' section.",
    secure: false
  },
  { 
    name: "Vecteezy", 
    host: "ftp.vecteezy.com", 
    port: 21, 
    url: "https://contributors.vecteezy.com/dashboard",
    helpText: "Find your FTP credentials in your Vecteezy contributor dashboard.",
    secure: false
  },
  { 
    name: "Dreamstime", 
    host: "ftp.dreamstime.com", 
    port: 21, 
    url: "https://www.dreamstime.com/upload/help-ftp-upload",
    helpText: "",
    secure: false
  }
];
export function FtpUploader({ ftpConfigs = [], setFtpConfigs, editingConfig, setEditingConfig }) {
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setTestResult(null);
  }, [editingConfig?.id]);

  const activeConfigs = ftpConfigs.filter(c => c.enabled);

  const handleCancel = () => {
    setEditingConfig(null);
  };

  const handleTest = async () => {
    if (!editingConfig) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.testFtp(editingConfig);
        if (res.success) {
          setTestResult({ success: true, msg: "Success!" });
        } else {
          setTestResult({ success: false, msg: res.error || "Failed" });
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
    }
  };

  const activeAgencyHelp = POPULAR_AGENCIES.find(
    a => a.name.toLowerCase() === editingConfig?.websiteName?.trim().toLowerCase()
  )?.helpText;

  const onFilesSelected = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (!selectedFiles.length) return;
    
    const newFiles = selectedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      path: file.path,
      name: file.name,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      status: 'pending', // pending, uploading, success, error
      error: null
    }));
    
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id) => {
    const fileToRemove = files.find(f => f.id === id);
    if (fileToRemove?.previewUrl) URL.revokeObjectURL(fileToRemove.previewUrl);
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    files.forEach(f => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setFiles([]);
  };

  const uploadFiles = async () => {
    if (!window.electronAPI || files.length === 0 || activeConfigs.length === 0) return;
    
    setIsUploading(true);
    
    const pendingFiles = files.filter(f => f.status !== 'success');
    const filePaths = pendingFiles.map(f => f.path).filter(Boolean);
    
    if (filePaths.length === 0) {
      setIsUploading(false);
      return;
    }
    
    // Set all pending files status to uploading
    setFiles(prev => prev.map(item => 
      pendingFiles.some(pf => pf.id === item.id) 
        ? { ...item, status: 'uploading', error: null } 
        : item
    ));
    
    try {
      // Upload to all servers concurrently
      const uploadPromises = activeConfigs.map(async (conf) => {
        const res = await window.electronAPI.uploadFtp(conf, filePaths);
        if (!res.success) {
          throw new Error(`Failed on ${conf.websiteName || conf.host}: ${res.error}`);
        }
      });
      
      await Promise.all(uploadPromises);
      
      // Success for all
      setFiles(prev => prev.map(item => 
        pendingFiles.some(pf => pf.id === item.id) 
          ? { ...item, status: 'success' } 
          : item
      ));
    } catch (uploadErr) {
      // Set all to error
      setFiles(prev => prev.map(item => 
        pendingFiles.some(pf => pf.id === item.id) 
          ? { ...item, status: 'error', error: uploadErr.message } 
          : item
      ));
    }
    
    setIsUploading(false);
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', height: '100%' }}>
      
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        
        {/* --- Left Pane: Config Form --- */}
        {editingConfig && (
          <div className="card glass animate-fade-in" style={{ width: '380px', flexShrink: 0, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', marginBottom: '0.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Server style={{ width: '1.1rem', height: '1.1rem', color: 'var(--accent)' }} />
                {ftpConfigs.some(c => c.id === editingConfig.id) ? 'Edit FTP Connection' : 'New FTP Connection'}
              </h3>
              <button 
                onClick={handleCancel}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X style={{ width: '1.1rem', height: '1.1rem' }} />
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.4rem' }}>Quick Setup & Agency Links</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.85rem' }}>
                {POPULAR_AGENCIES.map(agency => {
                  return (
                    <button
                      key={agency.name}
                      type="button"
                      onClick={() => handleSelectAgency(agency)}
                      title={`Autofill details and open ${agency.name} FTP page`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.35rem 0.65rem',
                        fontSize: '0.75rem',
                        borderRadius: '0.35rem',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        transition: 'all 0.15s'
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-1)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-2)'; }}
                    >
                      {agency.name}
                    </button>
                  );
                })}
              </div>

              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Website / Platform Name</label>
              <input 
                type="text" placeholder="e.g. Dreamstime"
                value={editingConfig.websiteName || ''} 
                onChange={e => setEditingConfig({...editingConfig, websiteName: e.target.value})}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>FTP Host</label>
                <input 
                  type="text" placeholder="ftp.example.com"
                  value={editingConfig.host || ''} 
                  onChange={e => setEditingConfig({...editingConfig, host: e.target.value})}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Port</label>
                <input 
                  type="number" 
                  value={editingConfig.port || 21} 
                  onChange={e => setEditingConfig({...editingConfig, port: parseInt(e.target.value) || 21})}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Username</label>
              <input 
                type="text" 
                value={editingConfig.user || ''} 
                onChange={e => setEditingConfig({...editingConfig, user: e.target.value})}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>Password</label>
              <input 
                type="password" 
                value={editingConfig.password || ''} 
                onChange={e => setEditingConfig({...editingConfig, password: e.target.value})}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input 
                type="checkbox" 
                id="ftp-secure-checkbox"
                checked={editingConfig.secure || false}
                onChange={e => setEditingConfig({...editingConfig, secure: e.target.checked})}
                style={{ cursor: 'pointer', width: '1rem', height: '1rem', accentColor: 'var(--accent)' }}
              />
              <label htmlFor="ftp-secure-checkbox" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer', userSelect: 'none' }}>
                Use Secure Connection (FTPS)
              </label>
            </div>

            {activeAgencyHelp && (
              <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.65rem', borderRadius: '0.35rem' }}>
                <Info style={{ width: '1rem', height: '1rem', color: 'var(--accent)', flexShrink: 0, marginTop: '0.1rem' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: 1.4 }}>{activeAgencyHelp}</span>
              </div>
            )}

            {testResult && (
              <div style={{ 
                padding: '0.75rem', 
                borderRadius: '0.5rem', 
                fontSize: '0.8rem', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                color: testResult.success ? 'var(--success)' : 'var(--danger)', 
                border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}` 
              }}>
                {testResult.success ? <CheckCircle2 style={{ width: '1rem', height: '1rem' }} /> : <ShieldCheck style={{ width: '1rem', height: '1rem' }} />}
                <span>{testResult.msg}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button 
                onClick={handleTest} 
                disabled={isTesting || !editingConfig.host || !editingConfig.user}
                className="btn-outline"
                style={{ flex: 1, padding: '0.55rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                {isTesting ? <Loader2 className="animate-spin" style={{ width: '0.95rem', height: '0.95rem' }} /> : <Server style={{ width: '0.95rem', height: '0.95rem' }} />}
                Test Connection
              </button>
              <button 
                onClick={handleSave} 
                disabled={isSaving || !editingConfig.host}
                className="btn-primary"
                style={{ flex: 1, padding: '0.55rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                {isSaving ? <Loader2 className="animate-spin" style={{ width: '0.95rem', height: '0.95rem' }} /> : <Save style={{ width: '0.95rem', height: '0.95rem' }} />}
                Save Config
              </button>
            </div>
          </div>
        )}
        
        {/* --- Manual Upload Section --- */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div 
            className="drop-zone"
            onClick={() => fileInputRef.current?.click()}
            style={{ 
              background: 'var(--surface-1)', 
              border: '2px dashed var(--glass-border)', 
              borderRadius: '1rem', 
              padding: '2rem', 
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              transition: 'all 0.2s ease',
              minHeight: '200px',
              justifyContent: 'center'
            }}
          >
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={onFilesSelected}
              style={{ display: "none" }}
            />
            <div style={{
              width: '3.5rem', height: '3.5rem', 
              borderRadius: '50%', 
              background: 'var(--primary-glow)', 
              color: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Upload style={{ width: '1.5rem', height: '1.5rem' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-1)', margin: '0 0 0.25rem 0' }}>
                Manual Upload to {activeConfigs.length > 0 ? <span style={{ color: 'var(--primary)' }}>{activeConfigs.map(c => c.websiteName || c.host).join(', ')}</span> : 'FTP'}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', margin: 0 }}>
                {activeConfigs.length > 0 
                  ? `Files will be uploaded to ${activeConfigs.length} selected server(s)` 
                  : 'Please add and select an FTP connection in the left sidebar first'}
              </p>
            </div>
          </div>
          
          {/* Action Bar */}
          <div className="card glass" style={{ padding: '1rem', background: 'var(--surface-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-1)', fontSize: '1rem' }}>
                {files.length} Files
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>
                ✓ {files.filter(f => f.status === 'success').length} Uploaded
              </span>
              {files.some(f => f.status === 'error') && (
                <span style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 600 }}>
                  ✖ {files.filter(f => f.status === 'error').length} Failed
                </span>
              )}
              <button 
                onClick={clearAll} 
                className="btn-outline"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <Trash2 style={{ width: '0.8rem', height: '0.8rem' }} /> Clear All
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {files.some(f => f.status === 'error') && (
                <button 
                  className="btn-outline" 
                  onClick={uploadFiles} 
                  disabled={isUploading || activeConfigs.length === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--danger)', padding: '0.5rem 1.25rem', background: 'rgba(239, 68, 68, 0.05)' }}
                >
                  {isUploading ? (
                    <><Loader2 style={{ width: '1rem', height: '1rem', animation: 'spin 1s linear infinite' }} /> Retrying...</>
                  ) : (
                    <><RefreshCw style={{ width: '1rem', height: '1rem' }} /> Retry Failed</>
                  )}
                </button>
              )}
              <button 
                className="btn-primary" 
                onClick={uploadFiles} 
                disabled={isUploading || files.length === 0 || activeConfigs.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, var(--accent), var(--primary))', padding: '0.5rem 1.25rem' }}
              >
                {isUploading ? (
                  <><Loader2 style={{ width: '1rem', height: '1rem', animation: 'spin 1s linear infinite' }} /> Uploading...</>
                ) : (
                  <><Upload style={{ width: '1rem', height: '1rem' }} /> Start Upload</>
                )}
              </button>
            </div>
          </div>

          {/* Files List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto' }}>
            {files.map(file => (
              <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-1)', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                  
                  <div style={{ 
                    width: '2.5rem', height: '2.5rem', flexShrink: 0,
                    borderRadius: '0.5rem', overflow: 'hidden',
                    background: 'var(--surface-2)', border: '1px solid var(--glass-border)',
                  }}>
                    {file.previewUrl ? (
                      <img src={file.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                        <Upload style={{ width: '1rem', height: '1rem' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ 
                    padding: '0.4rem', borderRadius: '0.5rem', 
                    background: file.status === 'success' ? 'rgba(16, 185, 129, 0.1)' : 
                                file.status === 'error' ? 'rgba(239, 68, 68, 0.1)' : 
                                file.status === 'uploading' ? 'var(--primary-glow)' : 'var(--surface-2)',
                    color: file.status === 'success' ? 'var(--success)' : 
                           file.status === 'error' ? 'var(--danger)' : 
                           file.status === 'uploading' ? 'var(--primary)' : 'var(--text-3)'
                  }}>
                    {file.status === 'success' ? <CheckCircle2 style={{ width: '1rem', height: '1rem' }} /> :
                     file.status === 'error' ? <X style={{ width: '1rem', height: '1rem' }} /> :
                     file.status === 'uploading' ? <Loader2 style={{ width: '1rem', height: '1rem', animation: 'spin 1s linear infinite' }} /> :
                     <Upload style={{ width: '1rem', height: '1rem' }} />}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {file.name}
                    </h4>
                    {file.error && (
                      <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.7rem', color: 'var(--danger)' }}>{file.error}</p>
                    )}
                  </div>
                </div>
                
                <button 
                  onClick={() => removeFile(file.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0.25rem' }}
                  title="Remove"
                >
                  <X style={{ width: '1rem', height: '1rem' }} />
                </button>
              </div>
            ))}
            
            {files.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-3)' }}>
                <p style={{ fontSize: '0.85rem', margin: 0 }}>No files selected. Drag & drop files above.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
