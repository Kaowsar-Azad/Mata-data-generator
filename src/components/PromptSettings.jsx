import { useState, useEffect } from "react";
import { SlidersHorizontal, ChevronDown, ChevronUp, Type, AlignLeft, Hash, Plus, Ban, Sparkles, Server, ShieldCheck, Loader2, CheckCircle2, AlertCircle, ExternalLink, Settings, Target } from "lucide-react";

/* ── Platform Data ── */
const PLATFORMS = [
  { id: 'General',          icon: '✦',  label: 'General' },
  { id: 'Adobe Stock',      icon: 'St', label: 'Adobe Stock' },
  { id: 'Shutterstock',     icon: '📷', label: 'Shutterstock' },
  { id: 'Getty',            icon: '🖼', label: 'Getty' },
  { id: 'Depositphotos',    icon: '📸', label: 'Depositphotos' },
  { id: 'FreePik',          icon: '🎨', label: 'FreePik' },
  { id: 'Vecteezy',         icon: '🖌', label: 'Vecteezy' },
  { id: 'Dreamstime',       icon: '💭', label: 'Dreamstime' },
  { id: 'Pond5',            icon: '🎬', label: 'Pond5' },
  { id: 'Extended metadata', icon: '📋', label: 'Extended' },
];

/* ── Range Slider Component ── */
function RangeSlider({ label, icon: Icon, value, min, max, step, unit, onChange, color }) {
  return (
    <div className="ps-range-control">
      <div className="ps-range-header">
        <div className="ps-range-label">
          <Icon style={{ width: "0.85rem", height: "0.85rem", opacity: 0.5 }} />
          <span>{label}</span>
        </div>
        <div className="ps-range-value" style={{ color }}>
          {value} <span className="ps-range-unit">{unit}</span>
        </div>
      </div>
      <div className="ps-range-track-wrapper">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="ps-range-slider"
          style={{ "--track-color": color, "--fill-pct": `${((value - min) / (max - min)) * 100}%` }}
        />
      </div>
    </div>
  );
}

/* ── Toggle Switch Component ── */
function ToggleSwitch({ label, checked, onChange }) {
  return (
    <label className="ps-toggle-row">
      <span className="ps-toggle-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`ps-toggle-switch ${checked ? "ps-toggle-on" : ""}`}
      >
        <span className="ps-toggle-knob" />
      </button>
    </label>
  );
}

function PlatformFtpCard({ platform, ftpConfigs = [], setEditingFtpConfig, setActiveTab }) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Define FTP presets for popular platforms
  const PLATFORM_FTP_PRESETS = {
    'Adobe Stock': {
      name: 'Adobe Stock',
      host: 'sftp.contributor.adobestock.com',
      port: 22,
      secure: false,
      helpText: "Adobe Stock uses SFTP (Port 22). Portal → Upload → 'Learn more' → Generate Password. Username = your unique Contributor ID. SFTP available for qualified accounts only.",
    },
    'Shutterstock': {
      name: 'Shutterstock',
      host: 'ftps.shutterstock.com',
      port: 21,
      secure: true,
      helpText: "Shutterstock does not have a separate FTP password. Use your Contributor email and account password.",
    },
    'FreePik': {
      name: 'Freepik',
      host: 'ftp.freepik.com',
      port: 21,
      secure: false,
      helpText: "Find your FTP credentials in the Freepik dashboard under the 'FTP Upload' section.",
    },
    'Vecteezy': {
      name: 'Vecteezy',
      host: 'ftp.vecteezy.com',
      port: 21,
      secure: false,
      helpText: "Find your FTP credentials in your Vecteezy contributor dashboard.",
    },
    'Dreamstime': {
      name: 'Dreamstime',
      host: 'ftp.dreamstime.com',
      port: 21,
      secure: false,
      helpText: "",
    }
  };

  const preset = PLATFORM_FTP_PRESETS[platform];

  // Helper to find configuration matching the platform name
  const findMatchingConfig = () => {
    const pLower = platform.toLowerCase();
    return ftpConfigs.find(c => {
      const name = (c.websiteName || '').toLowerCase();
      const host = (c.host || '').toLowerCase();
      
      if (pLower.includes('adobe')) {
        return name.includes('adobe') || host.includes('adobe') || host.includes('adobestock') || host.includes('contributor.stock');
      }
      if (pLower.includes('shutterstock')) {
        return name.includes('shutterstock') || host.includes('shutterstock');
      }
      if (pLower.includes('freepik') || pLower.includes('free pik')) {
        return name.includes('freepik') || host.includes('freepik');
      }
      if (pLower.includes('vecteezy')) {
        return name.includes('vecteezy') || host.includes('vecteezy');
      }
      if (pLower.includes('dreamstime')) {
        return name.includes('dreamstime') || host.includes('dreamstime');
      }
      return name.includes(pLower) || host.includes(pLower);
    });
  };

  const config = findMatchingConfig();

  const handleTestConnection = async () => {
    if (!config || !window.electronAPI) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await window.electronAPI.testFtp(config);
      if (res.success) {
        setTestResult({ success: true, msg: "Connected!" });
      } else {
        setTestResult({ success: false, msg: res.error || "Connection failed" });
      }
    } catch (err) {
      setTestResult({ success: false, msg: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleQuickSetup = () => {
    if (!setEditingFtpConfig || !setActiveTab) return;
    const newConfig = {
      id: Math.random().toString(36).substr(2, 9),
      websiteName: preset?.name || platform,
      host: preset?.host || '',
      port: preset?.port || 21,
      user: '',
      password: '',
      secure: preset?.secure || false,
      enabled: true
    };
    setEditingFtpConfig(newConfig);
    setActiveTab('ftp');
  };

  const handleEditConfig = () => {
    if (!config || !setEditingFtpConfig || !setActiveTab) return;
    setEditingFtpConfig({ ...config });
    setActiveTab('ftp');
  };

  return (
    <div className="ps-ftp-card glass">
      <div className="ps-ftp-header">
        <Server className="ps-ftp-icon" style={{ color: config?.enabled ? 'var(--success)' : 'var(--text-3)' }} />
        <span className="ps-ftp-title">{platform} Server</span>
        
        {config ? (
          <span className={`ps-ftp-badge ${config.enabled ? 'active' : 'disabled'}`}>
            {config.enabled ? 'Active' : 'Disabled'}
          </span>
        ) : (
          <span className="ps-ftp-badge unconfigured">Not Configured</span>
        )}
      </div>

      <div className="ps-ftp-details">
        {config ? (
          <>
            <div className="ps-ftp-detail-row">
              <span className="ps-ftp-detail-label">Host:</span>
              <span className="ps-ftp-detail-value">{config.host}:{config.port}</span>
            </div>
            <div className="ps-ftp-detail-row">
              <span className="ps-ftp-detail-label">User:</span>
              <span className="ps-ftp-detail-value">{config.user || 'Not set'}</span>
            </div>
          </>
        ) : (
          <div className="ps-ftp-warning">
            {preset ? (
              <span>No credentials set for {platform}. Host: <code>{preset.host}:{preset.port}</code>.</span>
            ) : (
              <span>No FTP server configured matching "{platform}".</span>
            )}
          </div>
        )}
      </div>

      {testResult && (
        <div className={`ps-ftp-test-result ${testResult.success ? 'success' : 'error'}`}>
          {testResult.success ? (
            <CheckCircle2 style={{ width: '0.85rem', height: '0.85rem' }} />
          ) : (
            <AlertCircle style={{ width: '0.85rem', height: '0.85rem' }} />
          )}
          <span>{testResult.msg}</span>
        </div>
      )}

      <div className="ps-ftp-actions">
        {config ? (
          <>
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !config.host || !config.user}
              className="btn-outline ps-ftp-btn-small"
              style={{ padding: '0.35rem 0.5rem', cursor: 'pointer' }}
            >
              {isTesting ? <Loader2 className="animate-spin" style={{ width: '0.75rem', height: '0.75rem' }} /> : 'Test'}
            </button>
            <button
              onClick={handleEditConfig}
              className="btn-primary ps-ftp-btn-small"
              style={{ padding: '0.35rem 0.5rem', cursor: 'pointer' }}
            >
              <Settings style={{ width: '0.75rem', height: '0.75rem' }} /> Configure
            </button>
          </>
        ) : (
          <button
            onClick={handleQuickSetup}
            className="btn-primary ps-ftp-btn-small-full"
            style={{ padding: '0.35rem 0.5rem', cursor: 'pointer' }}
          >
            <Settings style={{ width: '0.75rem', height: '0.75rem' }} /> Set up Connection
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export function PromptSettings({ settings, setSettings, activeTab, ftpConfigs = [], setEditingFtpConfig, setActiveTab }) {
  const [isOpen, setIsOpen] = useState(true);

  const update = (key, val) => setSettings((p) => ({ ...p, [key]: val }));

  useEffect(() => {
    if (settings.smartMode) {
      update('smartMode', false);
    }
  }, [settings.smartMode]);

  useEffect(() => {
    if (settings.concurrentLimit > 3) {
      update('concurrentLimit', 3);
    }
  }, [settings.concurrentLimit]);

  return (
    <div className="ps-wrapper">
      {/* Header Toggle */}
      <button className="ps-header" onClick={() => setIsOpen((o) => !o)}>
        <div className="ps-header-left">
          <SlidersHorizontal style={{ width: "0.95rem", height: "0.95rem" }} />
          <span>{activeTab === 'prompt' ? 'AI Prompt Settings' : 'Metadata Settings'}</span>
        </div>
        {isOpen ? <ChevronUp style={{ width: "0.85rem", height: "0.85rem" }} /> : <ChevronDown style={{ width: "0.85rem", height: "0.85rem" }} />}
      </button>

      {/* Body */}
      {isOpen && (
        <div className="ps-body">

          {/* ── Prompt Similarity Mode ── */}
          {activeTab === 'prompt' && (
            <div style={{ marginBottom: '1rem' }}>
              <div className="ps-section-label" style={{ marginBottom: '0.4rem' }}>Similarity Mode</div>
              <div style={{
                display: 'flex',
                background: 'var(--surface-2)',
                border: '1px solid var(--glass-border)',
                borderRadius: '0.5rem',
                padding: '2px',
                gap: '2px'
              }}>
                <button
                  type="button"
                  onClick={() => update('promptSimilarityMode', 'Exact Match')}
                  style={{
                    flex: 1,
                    background: settings.promptSimilarityMode === 'Exact Match' ? 'var(--primary)' : 'transparent',
                    color: settings.promptSimilarityMode === 'Exact Match' ? '#fff' : 'var(--text-2)',
                    border: 'none',
                    padding: '0.35rem 0.5rem',
                    borderRadius: '0.4rem',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.2s',
                    boxShadow: settings.promptSimilarityMode === 'Exact Match' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none'
                  }}
                >
                  <Target className="w-3.5 h-3.5" />
                  Exact Match
                </button>
                <button
                  type="button"
                  onClick={() => update('promptSimilarityMode', 'Unique Variation')}
                  style={{
                    flex: 1,
                    background: settings.promptSimilarityMode === 'Unique Variation' ? 'var(--primary)' : 'transparent',
                    color: settings.promptSimilarityMode === 'Unique Variation' ? '#fff' : 'var(--text-2)',
                    border: 'none',
                    padding: '0.35rem 0.5rem',
                    borderRadius: '0.4rem',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.2s',
                    boxShadow: settings.promptSimilarityMode === 'Unique Variation' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none'
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Variation
                </button>
              </div>
              <p style={{ fontSize: '0.65rem', color: 'var(--text-3)', marginTop: '0.35rem', lineHeight: '1.3' }}>
                {settings.promptSimilarityMode === 'Unique Variation' 
                  ? '💡 Alter details so the resulting image is unique but thematically similar to prevent duplication flags.' 
                  : '🎯 Generate a prompt to recreate this exact image as closely and accurately as possible.'}
              </p>
            </div>
          )}

          {/* ── Export Platform ── */}
          {activeTab !== 'prompt' && (
            <>
              <div className="ps-section-label">EXPORT PLATFORM</div>
              <div className="ps-platform-grid">
                {PLATFORMS.map((p) => {
                  const isActive = settings.exportPlatform === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => update('exportPlatform', p.id)}
                      className={`ps-platform-btn ${isActive ? 'active' : ''}`}
                    >
                      <span className="ps-platform-icon">{p.icon}</span>
                      <span>{p.label}</span>
                      {isActive && <span className="ps-platform-dot" />}
                    </button>
                  );
                })}
              </div>

              {/* ── Platform FTP Status Card ── */}
              {settings.exportPlatform && settings.exportPlatform !== 'General' && (
                <PlatformFtpCard 
                  platform={settings.exportPlatform}
                  ftpConfigs={ftpConfigs}
                  setEditingFtpConfig={setEditingFtpConfig}
                  setActiveTab={setActiveTab}
                />
              )}
            </>
          )}

          {/* ── Sliders ── */}
          <div className="ps-controls">
            <RangeSlider
              label="PARALLEL PROCESS"
              icon={Sparkles}
              value={settings.concurrentLimit || 2}
              min={1}
              max={3}
              step={1}
              unit="images"
              color="var(--primary)"
              onChange={(v) => update("concurrentLimit", v)}
            />

            {activeTab !== 'prompt' && !settings.smartMode && (
              <>
                <RangeSlider
                  label="TITLE LENGTH"
                  icon={Type}
                  value={settings.titleMaxChars}
                  min={20}
                  max={200}
                  step={5}
                  unit="chars"
                  color="var(--primary)"
                  onChange={(v) => update("titleMaxChars", v)}
                />

                <RangeSlider
                  label="DESCRIPTION"
                  icon={AlignLeft}
                  value={settings.descMaxChars}
                  min={50}
                  max={500}
                  step={10}
                  unit="chars"
                  color="var(--primary)"
                  onChange={(v) => update("descMaxChars", v)}
                />

                {!settings.smartMode && (
                  <RangeSlider
                    label="KEYWORDS COUNT"
                    icon={Hash}
                    value={settings.keywordCount}
                    min={5}
                    max={50}
                    step={1}
                    unit="keywords"
                    color="var(--primary)"
                    onChange={(v) => update("keywordCount", v)}
                  />
                )}
              </>
            )}
          </div>

          {activeTab !== 'prompt' && !settings.smartMode && (
            <>
              {/* ── Toggles ── */}
              <div className="ps-section-label" style={{ marginTop: '0.75rem' }}>OPTIONS</div>
              <div className="ps-toggles">
                <ToggleSwitch
                  label="Single-word keywords"
                  checked={settings.singleWordKeywords ?? true}
                  onChange={(v) => update("singleWordKeywords", v)}
                />

                <ToggleSwitch
                  label="Policy & Copyright Scan"
                  checked={settings.securityScanEnabled ?? false}
                  onChange={(v) => update("securityScanEnabled", v)}
                />

                <ToggleSwitch
                  label="Prefix"
                  checked={settings.prefixEnabled}
                  onChange={(v) => update("prefixEnabled", v)}
                />
                {settings.prefixEnabled && (
                  <input
                    type="text"
                    placeholder="Text to prepend to title..."
                    value={settings.prefixText}
                    onChange={(e) => update("prefixText", e.target.value)}
                    className="ps-text-input"
                  />
                )}

                <ToggleSwitch
                  label="Suffix"
                  checked={settings.suffixEnabled}
                  onChange={(v) => update("suffixEnabled", v)}
                />
                {settings.suffixEnabled && (
                  <input
                    type="text"
                    placeholder="Text to append to title..."
                    value={settings.suffixText}
                    onChange={(e) => update("suffixText", e.target.value)}
                    className="ps-text-input"
                  />
                )}

                <ToggleSwitch
                  label="Negative Words for Title"
                  checked={settings.negTitleEnabled}
                  onChange={(v) => update("negTitleEnabled", v)}
                />
                {settings.negTitleEnabled && (
                  <input
                    type="text"
                    placeholder="Words to exclude (comma separated)"
                    value={settings.negTitleWords}
                    onChange={(e) => update("negTitleWords", e.target.value)}
                    className="ps-text-input"
                  />
                )}

                <ToggleSwitch
                  label="Negative Keywords"
                  checked={settings.negKeywordsEnabled}
                  onChange={(v) => update("negKeywordsEnabled", v)}
                />
                {settings.negKeywordsEnabled && (
                  <input
                    type="text"
                    placeholder="Keywords to never include"
                    value={settings.negKeywords}
                    onChange={(e) => update("negKeywords", e.target.value)}
                    className="ps-text-input"
                  />
                )}
              </div>
            </>
          )}

          {activeTab !== 'prompt' && (
            <>
              {/* ── Media Type Hint ── */}
              <div className="ps-section-label" style={{ marginTop: '0.75rem' }}>MEDIA TYPE</div>
              <select
                value={settings.mediaTypeHint || 'None / Auto-detect'}
                onChange={(e) => update("mediaTypeHint", e.target.value)}
                className="ps-text-input"
                style={{ cursor: 'pointer' }}
              >
                <option value="None / Auto-detect">None / Auto-detect</option>
                <option value="Photo">Photo / Realistic Photography</option>
                <option value="Illustration">Illustration / Vector Graphic</option>
                <option value="3D Render">3D Render / CGI</option>
              </select>
            </>
          )}

          {activeTab !== 'prompt' && !settings.smartMode && (
            <>

              {/* ── Custom Instruction ── */}
              <div className="ps-section-label" style={{ marginTop: '0.75rem' }}>CUSTOM INSTRUCTION</div>
              <textarea
                placeholder="e.g. Titles must start with 'AI Generated', use short SEO titles, avoid technical words..."
                value={settings.customInstruction || ''}
                onChange={(e) => update("customInstruction", e.target.value)}
                className="ps-text-input"
                rows={2}
                style={{ resize: 'vertical', lineHeight: '1.4' }}
              />
            </>
          )}

          {/* Spacer to prevent elements from sitting flush at the bottom */}
          <div style={{ height: '1.5rem', flexShrink: 0 }} />
        </div>
      )}

      <style>{`
        .ps-wrapper {
          border-radius: 0.75rem;
          overflow: hidden;
          background: var(--surface-1);
          border: 1px solid var(--glass-border);
          box-shadow: var(--glass-shadow);
          flex-shrink: 0;
        }

        /* Header */
        .ps-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.7rem 1rem;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-1);
          transition: background 0.2s;
        }
        .ps-header:hover { background: var(--surface-2); }
        .ps-header-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 700;
          font-size: 0.88rem;
        }

        /* Body */
        .ps-body {
          padding: 0.6rem 0.85rem 2rem;
          border-top: 1px solid var(--glass-border);
          max-height: calc(100vh - 14rem);
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--glass-border) transparent;
        }
        .ps-body::-webkit-scrollbar { width: 5px; }
        .ps-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .ps-body::-webkit-scrollbar-thumb {
          background: var(--glass-border);
          border-radius: 5px;
        }
        .ps-body::-webkit-scrollbar-thumb:hover {
          background: var(--text-3);
        }

        /* Section Labels */
        .ps-section-label {
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-3);
          margin-bottom: 0.5rem;
        }

        /* Platform Grid — 2 columns */
        .ps-platform-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.35rem;
          margin-bottom: 0.85rem;
        }
        .ps-platform-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.6rem;
          border-radius: 0.5rem;
          border: 1px solid var(--glass-border);
          background: var(--surface-2);
          color: var(--text-2);
          font-size: 0.72rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          position: relative;
        }
        .ps-platform-btn:hover {
          border-color: var(--primary);
          color: var(--text-1);
        }
        .ps-platform-btn.active {
          background: var(--text-1);
          color: var(--surface-1);
          border-color: var(--text-1);
        }
        .ps-platform-icon {
          font-size: 0.8rem;
          width: 1.1rem;
          text-align: center;
          flex-shrink: 0;
        }
        .ps-platform-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--primary);
          margin-left: auto;
        }

        /* Controls (Sliders) */
        .ps-controls {
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }
        .ps-range-control {}
        .ps-range-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.35rem;
        }
        .ps-range-label {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-3);
        }
        .ps-range-value {
          font-size: 0.78rem;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .ps-range-unit {
          font-weight: 500;
          font-size: 0.65rem;
          opacity: 0.7;
        }
        .ps-range-control {
          margin-bottom: 0.25rem;
        }
        .ps-range-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.45rem;
        }
        .ps-range-label {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: var(--text-2);
        }
        .ps-range-value {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-1) !important;
          font-variant-numeric: tabular-nums;
        }
        .ps-range-unit {
          font-weight: 500;
          font-size: 0.65rem;
          color: var(--text-3);
        }
        .ps-range-track-wrapper {
          position: relative;
          height: 12px;
          display: flex;
          align-items: center;
        }
        .ps-range-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 3px;
          border-radius: 999px;
          outline: none;
          cursor: pointer;
          background: linear-gradient(
            to right,
            var(--track-color) 0%,
            var(--track-color) var(--fill-pct),
            rgba(0, 0, 0, 0.06) var(--fill-pct),
            rgba(0, 0, 0, 0.06) 100%
          );
          transition: background 0.1s;
        }
        .ps-range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.12);
          box-shadow: 0 1.5px 3px rgba(0, 0, 0, 0.1), 0 1px 1px rgba(0, 0, 0, 0.06);
          cursor: grab;
          transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
          margin-top: -1px;
        }
        .ps-range-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          border-color: var(--primary);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15), 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
        .ps-range-slider::-webkit-slider-thumb:active {
          cursor: grabbing;
          transform: scale(1.05);
        }
        .ps-range-slider::-moz-range-thumb {
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.12);
          box-shadow: 0 1.5px 3px rgba(0, 0, 0, 0.1), 0 1px 1px rgba(0, 0, 0, 0.06);
          cursor: grab;
          transition: transform 0.15s, border-color 0.15s;
        }
        .ps-range-slider::-moz-range-thumb:hover {
          transform: scale(1.2);
          border-color: var(--primary);
        }

        /* Toggles */
        .ps-toggles {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .ps-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.3rem 0;
          cursor: pointer;
        }
        .ps-toggle-label {
          font-size: 0.78rem;
          color: var(--text-2);
          font-weight: 500;
        }
        .ps-toggle-switch {
          position: relative;
          width: 36px;
          height: 20px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          background: var(--surface-3);
          padding: 0;
          transition: background 0.25s;
          flex-shrink: 0;
        }
        .ps-toggle-switch.ps-toggle-on {
          background: var(--primary);
        }
        .ps-toggle-knob {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
          transition: transform 0.25s;
        }
        .ps-toggle-switch.ps-toggle-on .ps-toggle-knob {
          transform: translateX(16px);
        }

        /* Text Input */
        .ps-text-input {
          width: 100%;
          padding: 0.4rem 0.6rem;
          border-radius: 0.4rem;
          border: 1px solid var(--glass-border);
          background: var(--surface-2);
          color: var(--text-1);
          font-size: 0.75rem;
          outline: none;
          transition: border-color 0.2s;
          margin-bottom: 0.15rem;
        }
        .ps-text-input:focus {
          border-color: var(--primary);
        }
        .ps-text-input::placeholder {
          color: var(--text-3);
        }

        /* Platform FTP Card styling */
        .ps-ftp-card {
          margin-top: 0.25rem;
          margin-bottom: 0.85rem;
          padding: 0.75rem;
          border-radius: 0.6rem;
          border: 1px solid var(--glass-border);
          background: rgba(255, 255, 255, 0.02);
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .ps-ftp-header {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .ps-ftp-icon {
          width: 0.9rem;
          height: 0.9rem;
        }
        .ps-ftp-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-1);
        }
        .ps-ftp-badge {
          font-size: 0.6rem;
          font-weight: 700;
          padding: 0.05rem 0.35rem;
          border-radius: 99px;
          margin-left: auto;
          text-transform: uppercase;
        }
        .ps-ftp-badge.active {
          background: rgba(16, 185, 129, 0.15);
          color: var(--success);
          border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .ps-ftp-badge.disabled {
          background: rgba(239, 68, 68, 0.1);
          color: var(--text-3);
          border: 1px solid var(--glass-border);
        }
        .ps-ftp-badge.unconfigured {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.2);
        }
        .ps-ftp-details {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.7rem;
        }
        .ps-ftp-detail-row {
          display: flex;
          justify-content: space-between;
        }
        .ps-ftp-detail-label {
          color: var(--text-3);
        }
        .ps-ftp-detail-value {
          color: var(--text-2);
          font-weight: 500;
        }
        .ps-ftp-warning {
          color: var(--text-3);
          line-height: 1.3;
        }
        .ps-ftp-warning code {
          background: var(--surface-2);
          padding: 0.05rem 0.2rem;
          border-radius: 0.2rem;
          font-family: monospace;
        }
        .ps-ftp-actions {
          display: flex;
          gap: 0.4rem;
          margin-top: 0.25rem;
        }
        .ps-ftp-btn-small {
          flex: 1;
          padding: 0.35rem 0.5rem !important;
          font-size: 0.7rem !important;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          border-radius: 0.35rem !important;
        }
        .ps-ftp-btn-small-full {
          width: 100%;
          padding: 0.35rem 0.5rem !important;
          font-size: 0.7rem !important;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          border-radius: 0.35rem !important;
        }
        .ps-ftp-test-result {
          font-size: 0.7rem;
          padding: 0.35rem 0.5rem;
          border-radius: 0.35rem;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          word-break: break-all;
          line-height: 1.3;
        }
        .ps-ftp-test-result.success {
          background: rgba(16, 185, 129, 0.08);
          color: var(--success);
          border: 1px solid rgba(16, 185, 129, 0.15);
        }
        .ps-ftp-test-result.error {
          background: rgba(239, 68, 68, 0.08);
          color: var(--danger);
          border: 1px solid rgba(239, 68, 68, 0.15);
        }
      `}</style>
    </div>
  );
}
