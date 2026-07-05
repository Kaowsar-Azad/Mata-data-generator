import React from "react";
import { StatusBadge, getScoreMeta } from "./workflowHelpers";
import { MetaField } from "./MetaField";
import { Video, Loader2, Image as ImageIcon } from "lucide-react";

export function MetadataEditorPanel({
  img,
  handleMetaChange,
  activeCell,
  setActiveCell,
  selectedCount = 0,
  applyToSelected,
}) {
  if (!img) {
    return (
      <div className="metadata-editor-panel empty" style={{
        padding: '2rem',
        textAlign: 'center',
        color: 'var(--text-3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: 'var(--surface-1)',
        borderLeft: '1px solid var(--glass-border)',
        borderRadius: '0.75rem',
      }}>
        <ImageIcon className="w-10 h-10 mb-2 opacity-40" />
        <p style={{ fontSize: '0.85rem' }}>Select a file to edit.</p>
      </div>
    );
  }

  const { title = "", description = "", keywords = "" } = img.result || {};
  const score = img.result?.sellingScore !== undefined && img.result?.sellingScore !== null
    ? Math.max(0, Math.min(100, Number(img.result.sellingScore)))
    : null;
  const meta = score !== null ? getScoreMeta(score) : null;

  return (
    <div className="metadata-editor-panel glass" style={{
      padding: '1.25rem',
      background: 'var(--surface-1)',
      borderLeft: '1px solid var(--glass-border)',
      borderRadius: '0.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
      height: '100%',
      overflowY: 'auto',
      boxSizing: 'border-box'
    }}>
      {/* Header with image preview */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <div className="thumb-wrap" style={{ width: '64px', height: '64px', flexShrink: 0, position: 'relative' }}>
          {img.preview ? (
            <img src={img.preview} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '0.4rem' }} alt="preview" />
          ) : img.isVideo ? (
            <div className="thumb-loading" style={{ width: '100%', height: '100%', borderRadius: '0.4rem', background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(168,85,247,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Video className="w-6 h-6 text-purple-500" />
            </div>
          ) : (
            <div className="thumb-loading" style={{ width: '100%', height: '100%', borderRadius: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h4 className="font-mono text-sm text-muted truncate" style={{ margin: 0 }} title={img.file?.name || img.renamedName}>
            {img.file?.name || img.renamedName}
          </h4>
          <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={img.status} progress={img.upscaleProgress} />
            {img.isEps && <span className="eps-badge" style={{ fontSize: '0.55rem', padding: '1px 4px' }}>EPS</span>}
            {selectedCount > 1 && (
              <span style={{
                fontSize: '0.55rem',
                fontWeight: 700,
                color: '#22c55e',
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                padding: '1.5px 5px',
                borderRadius: '99px'
              }}>
                Editing 1 of {selectedCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {img.status === "done" && img.result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <MetaField 
            label="Title" 
            value={img.result.title} 
            onChange={(val) => handleMetaChange(img.id, "title", val)}
            onApplyToSelected={selectedCount > 1 && typeof applyToSelected === 'function' ? () => applyToSelected(img.id, "title", img.result.title) : null}
          />
          <MetaField 
            label="Description" 
            value={img.result.description} 
            onChange={(val) => handleMetaChange(img.id, "description", val)}
            isTextArea
            onApplyToSelected={selectedCount > 1 && typeof applyToSelected === 'function' ? () => applyToSelected(img.id, "description", img.result.description) : null}
          />
          <MetaField
            label="Keywords"
            value={img.result.keywords}
            onChange={(val) => handleMetaChange(img.id, "keywords", val)}
            isTextArea
            isKeywords
            img={img}
            onApplyToSelected={selectedCount > 1 && typeof applyToSelected === 'function' ? () => applyToSelected(img.id, "keywords", img.result.keywords) : null}
          />

          {img.result.categories && img.result.categories.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Categories:</span>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {img.result.categories.map((cat, idx) => (
                  <span key={idx} className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-semibold border border-primary/20">
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ─── SELLING SCORE GAUGE ─── */}
          {score !== null && meta && (() => {
            const R = 22; const cx = 28; const cy = 28;
            const circ = 2 * Math.PI * R;
            const offset = circ - (score / 100) * circ;
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                marginTop: '0.25rem', padding: '0.55rem 0.8rem',
                background: meta.bg, border: `1px solid ${meta.border}`,
                borderRadius: '0.6rem',
              }}>
                <svg width="56" height="56" style={{ flexShrink: 0, filter: `drop-shadow(0 0 5px ${meta.trackColor}66)` }}>
                  <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
                  <circle
                    cx={cx} cy={cy} r={R} fill="none"
                    stroke={meta.trackColor} strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    transform={`rotate(-90 ${cx} ${cy})`}
                    style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)' }}
                  />
                  <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize="11" fontWeight="800" fill={meta.trackColor}>{score}</text>
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {meta.emoji} {meta.label} Score
                    </span>
                    <span style={{ fontSize: '0.63rem', color: 'var(--text-3)', fontWeight: 500 }}>/ 100</span>
                  </div>
                  {img.result.scoreReason && (
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-2)', margin: '0.18rem 0 0', lineHeight: 1.4, fontStyle: 'italic' }}>
                      {img.result.scoreReason}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {img.status === "error" && (
        <p className="text-xs text-red-400 bg-red-400/10 p-2 rounded mt-2">
          ⚠ {img.error}
        </p>
      )}

      {img.status === "pending" && (
        <p className="text-xs italic text-muted mt-2">
          {img.isVideo
            ? "🎬 Ready — Frame will be extracted for AI analysis"
            : img.isPaired 
              ? "✨ Ready (Using JPG for AI)" 
              : (img.isEps && !img.epsData)
                ? "⚙ Extracting EPS preview..."
                : "Awaiting analysis..."}
        </p>
      )}

      {img.status === "upscaling" && (
        <p className="text-xs text-indigo-400 animate-pulse mt-2">
          ✨ Auto-Upscaling image...{img.upscaleProgress !== undefined && img.upscaleProgress > 0 ? ` ${Math.round(img.upscaleProgress)}%` : ''}
        </p>
      )}

      {img.status === "scanning" && (
        <p className="text-xs text-amber-500 animate-pulse mt-2">
          🛡️ Scanning for Policy Violations...
        </p>
      )}

      {img.status === "extracting" && (
        <p className="text-xs text-violet-400 animate-pulse mt-2">
          🎬 Extracting video frame for AI analysis...
        </p>
      )}

      {img.status === "processing" && (
        <p className="text-xs text-primary animate-pulse mt-2">
          🤖 Generating metadata with AI...
        </p>
      )}
    </div>
  );
}
