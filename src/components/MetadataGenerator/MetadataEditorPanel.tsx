import React from "react";
import { StatusBadge, getScoreMeta } from "./workflowHelpers";
import { MetaField } from "./MetaField";
import { Video, Loader2, Image as ImageIcon, Sparkles, Bot, Maximize2, ShieldAlert } from "lucide-react";

export function MetadataEditorPanel({
  img,
  handleMetaChange,
  activeCell,
  setActiveCell,
  selectedCount = 0,
  applyToSelected,
  onAddKeywordToSelected,
  onEmbedSelected,
  enableKeywordRanking,
  onEmbedSingle,
  autoEmbed,
  onUploadSingleFtp,
}: any) {
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
        gap: '0.75rem'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'var(--surface-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed var(--glass-border)'
        }}>
          <Sparkles className="w-5 h-5 text-muted" />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-2)' }}>No Item Selected</div>
          <div style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>Click any row in the table to inspect and edit details</div>
        </div>
      </div>
    );
  }

  return (
    <div className="metadata-editor-panel glass animate-fade-in" style={{
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius-lg)',
      padding: '1.25rem',
      background: 'var(--surface-1)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      height: '100%',
      overflowY: 'auto'
    }}>
      {/* Header with image preview */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, position: 'relative', background: 'var(--surface-2)' }}>
          {img.preview ? (
            <img src={img.preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : img.isVideo ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Video className="w-5 h-5 text-muted" />
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }} className="truncate">
            {img.file?.name}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem', alignItems: 'center' }}>
            <StatusBadge status={img.status} progress={img.upscaleProgress} upscaleModel={img.upscaleModel} />
            {img.embeddingStatus && img.embeddingStatus !== 'none' && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: img.embeddingStatus === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: img.embeddingStatus === 'success' ? '#22c55e' : '#ef4444' }}>
                {img.embeddingStatus === 'success' ? 'Embedded' : img.embeddingStatus}
              </span>
            )}
          </div>
        </div>
      </div>

      {img.status === "done" && img.result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <MetaField 
            label="Title" 
            value={img.result.title} 
            onChange={(val: any) => handleMetaChange(img.id, "title", val)}
            onApplyToSelected={selectedCount > 1 && typeof applyToSelected === 'function' ? () => applyToSelected(img.id, "title", img.result.title) : null}
          />
          <MetaField 
            label="Description" 
            value={img.result.description} 
            onChange={(val: any) => handleMetaChange(img.id, "description", val)}
            isTextArea
            onApplyToSelected={selectedCount > 1 && typeof applyToSelected === 'function' ? () => applyToSelected(img.id, "description", img.result.description) : null}
          />
          <MetaField
            label="Keywords"
            value={img.result.keywords}
            onChange={(val: any) => handleMetaChange(img.id, "keywords", val)}
            isTextArea
            isKeywords
            img={img}
            selectedCount={selectedCount}
            onAddKeywordToSelected={onAddKeywordToSelected}
            onEmbedSelected={onEmbedSelected}
            enableKeywordRanking={enableKeywordRanking}
            onEmbedSingle={onEmbedSingle}
            autoEmbed={autoEmbed}
            onUploadSingleFtp={onUploadSingleFtp}
            onApplyToSelected={selectedCount > 1 && typeof applyToSelected === 'function' ? () => applyToSelected(img.id, "keywords", img.result.keywords) : null}
          />



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
        <div className="premium-indicator-badge premium-indicator-blue">
          <div className="premium-indicator-wrapper">
            <div className="premium-indicator-spinner" />
            <Maximize2 className="w-2.5 h-2.5 premium-indicator-inner" />
          </div>
          <span>Auto-Upscaling image...{img.upscaleProgress !== undefined && img.upscaleProgress > 0 ? ` ${Math.round(img.upscaleProgress)}%` : ''}</span>
        </div>
      )}

      {img.status === "scanning" && (
        <div className="premium-indicator-badge premium-indicator-amber">
          <div className="premium-indicator-wrapper">
            <div className="premium-indicator-spinner" />
            <ShieldAlert className="w-2.5 h-2.5 premium-indicator-inner" />
          </div>
          <span>Scanning for Policy Violations...</span>
        </div>
      )}

      {img.status === "extracting" && (
        <div className="premium-indicator-badge premium-indicator-violet">
          <div className="premium-indicator-wrapper">
            <div className="premium-indicator-spinner" />
            <Video className="w-2.5 h-2.5 premium-indicator-inner" />
          </div>
          <span>Extracting video frame for AI analysis...</span>
        </div>
      )}

      {img.status === "processing" && (
        <div className="premium-indicator-badge premium-indicator-indigo">
          <div className="premium-indicator-wrapper">
            <div className="premium-indicator-spinner" />
            <Sparkles className="w-2.5 h-2.5 premium-indicator-inner" />
          </div>
          <span>Generating metadata with AI...</span>
        </div>
      )}
    </div>
  );
}
