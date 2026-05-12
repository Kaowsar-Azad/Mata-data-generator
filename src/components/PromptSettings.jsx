import { useState } from "react";
import { SlidersHorizontal, ChevronDown, ChevronUp, Type, AlignLeft, Hash, Plus, Minus, Ban } from "lucide-react";

function RangeSlider({ label, icon: Icon, value, min, max, step, unit, onChange, color }) {
  return (
    <div className="range-control">
      <div className="range-header">
        <div className="range-label">
          <Icon style={{ width: "0.9rem", height: "0.9rem", color }} />
          <span>{label}</span>
        </div>
        <div className="range-value" style={{ color }}>
          {value} <span className="range-unit">{unit}</span>
        </div>
      </div>
      <div className="range-track-wrapper">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="range-slider"
          style={{ "--track-color": color, "--fill-pct": `${((value - min) / (max - min)) * 100}%` }}
        />
      </div>
    </div>
  );
}

function ToggleSwitch({ label, icon: Icon, checked, onChange }) {
  return (
    <label className="toggle-row">
      <div className="toggle-label">
        {Icon && <Icon style={{ width: "0.85rem", height: "0.85rem", opacity: 0.6 }} />}
        <span>{label}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`toggle-switch ${checked ? "toggle-on" : ""}`}
      >
        <span className="toggle-knob" />
      </button>
    </label>
  );
}

export function PromptSettings({ settings, setSettings }) {
  const [isOpen, setIsOpen] = useState(false);

  const update = (key, val) => setSettings((p) => ({ ...p, [key]: val }));

  return (
    <div className="prompt-settings-wrapper">
      {/* Header Toggle */}
      <button className="prompt-settings-toggle" onClick={() => setIsOpen((o) => !o)}>
        <div className="prompt-settings-toggle-left">
          <SlidersHorizontal style={{ width: "1rem", height: "1rem" }} />
          <span>Metadata Settings</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Body */}
      {isOpen && (
        <div className="prompt-settings-body">
          {/* Sliders */}
          <div className="settings-grid">
            <RangeSlider
              label="TITLE LENGTH"
              icon={Type}
              value={settings.titleMaxChars}
              min={20}
              max={200}
              step={5}
              unit="chars"
              color="#6366f1"
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
              color="#a855f7"
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
              color="#ec4899"
              onChange={(v) => update("keywordCount", v)}
            />
          </div>

          {/* Divider */}
          <div className="settings-divider">
            <span>OPTIONS</span>
          </div>

          {/* Toggles */}
          <div className="toggle-group">
            <ToggleSwitch
              label="Prefix (add text before title)"
              icon={Plus}
              checked={settings.prefixEnabled}
              onChange={(v) => update("prefixEnabled", v)}
            />
            {settings.prefixEnabled && (
              <input
                type="text"
                placeholder="e.g. Stock Vector -"
                value={settings.prefixText}
                onChange={(e) => update("prefixText", e.target.value)}
                className="option-text-input"
              />
            )}

            <ToggleSwitch
              label="Suffix (add text after title)"
              icon={Plus}
              checked={settings.suffixEnabled}
              onChange={(v) => update("suffixEnabled", v)}
            />
            {settings.suffixEnabled && (
              <input
                type="text"
                placeholder="e.g. - Illustration"
                value={settings.suffixText}
                onChange={(e) => update("suffixText", e.target.value)}
                className="option-text-input"
              />
            )}

            <ToggleSwitch
              label="Negative Title Words"
              icon={Ban}
              checked={settings.negTitleEnabled}
              onChange={(v) => update("negTitleEnabled", v)}
            />
            {settings.negTitleEnabled && (
              <input
                type="text"
                placeholder="Words to exclude from title (comma separated)"
                value={settings.negTitleWords}
                onChange={(e) => update("negTitleWords", e.target.value)}
                className="option-text-input"
              />
            )}

            <ToggleSwitch
              label="Negative Keywords"
              icon={Ban}
              checked={settings.negKeywordsEnabled}
              onChange={(v) => update("negKeywordsEnabled", v)}
            />
            {settings.negKeywordsEnabled && (
              <input
                type="text"
                placeholder="Keywords to never include (comma separated)"
                value={settings.negKeywords}
                onChange={(e) => update("negKeywords", e.target.value)}
                className="option-text-input"
              />
            )}
          </div>
        </div>
      )}

      <style>{`
        .prompt-settings-wrapper {
          margin-top: 1.5rem;
          border-radius: 1rem;
          overflow: hidden;
          background: rgba(15, 15, 25, 0.6);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(99, 102, 241, 0.15);
        }
        .prompt-settings-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.9rem 1.25rem;
          background: transparent;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.85);
          transition: background 0.2s;
        }
        .prompt-settings-toggle:hover {
          background: rgba(99, 102, 241, 0.06);
        }
        .prompt-settings-toggle-left {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          font-weight: 700;
          font-size: 0.9rem;
        }
        .prompt-settings-body {
          padding: 1.25rem 1.5rem 1.5rem;
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        /* Range Sliders */
        .settings-grid {
          display: flex;
          flex-direction: column;
          gap: 1.4rem;
        }
        .range-control { }
        .range-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }
        .range-label {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.55);
        }
        .range-value {
          font-size: 0.85rem;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .range-unit {
          font-weight: 500;
          font-size: 0.7rem;
          opacity: 0.6;
        }
        .range-track-wrapper {
          position: relative;
          height: 6px;
        }
        .range-slider {
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
            rgba(255,255,255,0.08) var(--fill-pct),
            rgba(255,255,255,0.08) 100%
          );
          transition: background 0.1s;
        }
        .range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 1px 6px rgba(0,0,0,0.35);
          cursor: grab;
          transition: transform 0.15s;
        }
        .range-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        .range-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          border: none;
          box-shadow: 0 1px 6px rgba(0,0,0,0.35);
          cursor: grab;
        }

        /* Divider */
        .settings-divider {
          margin: 1.5rem 0 1rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .settings-divider::before,
        .settings-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.08);
        }
        .settings-divider span {
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
        }

        /* Toggle */
        .toggle-group {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.4rem 0;
          cursor: pointer;
        }
        .toggle-label {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.82rem;
          color: rgba(255,255,255,0.7);
        }
        .toggle-switch {
          position: relative;
          width: 40px;
          height: 22px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          background: rgba(255,255,255,0.12);
          padding: 0;
          transition: background 0.25s;
        }
        .toggle-switch.toggle-on {
          background: #6366f1;
        }
        .toggle-knob {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          transition: transform 0.25s;
        }
        .toggle-switch.toggle-on .toggle-knob {
          transform: translateX(18px);
        }
        .option-text-input {
          width: 100%;
          padding: 0.55rem 0.8rem;
          border-radius: 0.5rem;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(0,0,0,0.25);
          color: rgba(255,255,255,0.9);
          font-size: 0.8rem;
          outline: none;
          transition: border-color 0.2s;
          margin-bottom: 0.25rem;
        }
        .option-text-input:focus {
          border-color: #6366f1;
        }
        .option-text-input::placeholder {
          color: rgba(255,255,255,0.25);
        }
      `}</style>
    </div>
  );
}
