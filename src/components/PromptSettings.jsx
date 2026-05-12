import { useState } from "react";
import { SlidersHorizontal, ChevronDown, ChevronUp, Type, AlignLeft, Hash, Plus, Ban, Sparkles } from "lucide-react";

/* ── Platform Data ── */
const PLATFORMS = [
  { id: 'General',          icon: '✦', label: 'General' },
  { id: 'Adobe Stock',      icon: 'St', label: 'Adobe Stock' },
  { id: 'Shutterstock',     icon: '📷', label: 'Shutterstock' },
  { id: 'Getty',            icon: '🖼', label: 'Getty' },
  { id: 'Depositphotos',    icon: '📸', label: 'Depositphotos' },
  { id: 'FreePik',          icon: '🎨', label: 'FreePik' },
  { id: 'Vecteezy',         icon: '🖌', label: 'Vecteezy' },
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

/* ── Main Component ── */
export function PromptSettings({ settings, setSettings }) {
  const [isOpen, setIsOpen] = useState(true);

  const update = (key, val) => setSettings((p) => ({ ...p, [key]: val }));

  return (
    <div className="ps-wrapper">
      {/* Header Toggle */}
      <button className="ps-header" onClick={() => setIsOpen((o) => !o)}>
        <div className="ps-header-left">
          <SlidersHorizontal style={{ width: "0.95rem", height: "0.95rem" }} />
          <span>Metadata Settings</span>
        </div>
        {isOpen ? <ChevronUp style={{ width: "0.85rem", height: "0.85rem" }} /> : <ChevronDown style={{ width: "0.85rem", height: "0.85rem" }} />}
      </button>

      {/* Body */}
      {isOpen && (
        <div className="ps-body">

          {/* ── Export Platform ── */}
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

          {/* ── Sliders ── */}
          <div className="ps-controls">
            <RangeSlider
              label="TITLE LENGTH"
              icon={Type}
              value={settings.titleMaxChars}
              min={20}
              max={200}
              step={5}
              unit="chars"
              color="var(--text-1)"
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
              color="var(--text-1)"
              onChange={(v) => update("descMaxChars", v)}
            />

            <RangeSlider
              label="KEYWORDS COUNT"
              icon={Hash}
              value={settings.keywordCount}
              min={5}
              max={50}
              step={1}
              unit="keywords"
              color="var(--text-1)"
              onChange={(v) => update("keywordCount", v)}
            />
          </div>

          {/* ── Toggles ── */}
          <div className="ps-section-label" style={{ marginTop: '0.75rem' }}>OPTIONS</div>
          <div className="ps-toggles">
            <ToggleSwitch
              label="Single-word keywords"
              checked={settings.singleWordKeywords ?? true}
              onChange={(v) => update("singleWordKeywords", v)}
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

        </div>
      )}

      <style>{`
        .ps-wrapper {
          border-radius: 0.75rem;
          overflow: hidden;
          background: var(--surface-1);
          border: 1px solid var(--glass-border);
          box-shadow: var(--glass-shadow);
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
          padding: 0.6rem 0.85rem 0.85rem;
          border-top: 1px solid var(--glass-border);
          max-height: calc(100vh - 22rem);
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--glass-border) transparent;
        }
        .ps-body::-webkit-scrollbar { width: 3px; }
        .ps-body::-webkit-scrollbar-thumb {
          background: var(--glass-border);
          border-radius: 3px;
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
        .ps-range-track-wrapper {
          position: relative;
          height: 6px;
        }
        .ps-range-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 999px;
          outline: none;
          cursor: pointer;
          background: linear-gradient(
            to right,
            var(--track-color) 0%,
            var(--track-color) var(--fill-pct),
            var(--glass-border) var(--fill-pct),
            var(--glass-border) 100%
          );
          transition: background 0.1s;
        }
        .ps-range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          border: 2px solid var(--text-3);
          box-shadow: 0 1px 4px rgba(0,0,0,0.12);
          cursor: grab;
          transition: transform 0.15s;
        }
        .ps-range-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          border-color: var(--primary);
        }
        .ps-range-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          border: 2px solid var(--text-3);
          box-shadow: 0 1px 4px rgba(0,0,0,0.12);
          cursor: grab;
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
      `}</style>
    </div>
  );
}
