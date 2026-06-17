import React, { memo } from "react";
import { Video, Loader2, FileCode2, Image as ImageIcon, AlertTriangle, CheckCircle2, X, Upload, ShieldAlert } from "lucide-react";
import { StatusBadge, getScoreMeta } from "./workflowHelpers";
import { MetaField } from "./MetaField";

const MetadataCard = memo(({ 
  img, hasDuplicateBadge, removeImage, handleMetaChange, activeProviderName, upscaleScale, ftpConfigs
}) => {
  return (
    <div className="glass card animate-fade-in file-row">
      {/* Preview thumbnail */}
      <div className="thumb-wrap">
        {img.preview ? (
          <img src={img.preview} className="thumb-img" alt="preview" />
        ) : img.isVideo ? (
          <div className="thumb-loading" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(168,85,247,0.08))' }}>
            <Video className="w-7 h-7" style={{ color: '#a855f7' }} />
          </div>
        ) : (
          <div className="thumb-loading">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        {img.isEps && !img.isPaired && (
          <div className="eps-indicator" title="EPS Vector File">
            <FileCode2 className="w-2.5 h-2.5" /> EPS
          </div>
        )}

        {img.isPaired && (
          <div className="eps-indicator" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }} title="EPS + JPG Paired!">
            <ImageIcon className="w-2.5 h-2.5" /> EPS+JPG
          </div>
        )}

        {img.isVideo && (
          <div className="eps-indicator" style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }} title="Video File">
            <Video className="w-2.5 h-2.5" /> Video
          </div>
        )}

        {/* Duplicate badge on thumbnail */}
        {hasDuplicateBadge && (
          <div
            title="Near-duplicate detected!"
            style={{
              position: 'absolute', bottom: '22px', left: '4px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff',
              borderRadius: '4px', padding: '1px 5px', fontSize: '0.6rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', gap: '2px', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              zIndex: 3, letterSpacing: '0.03em',
            }}
          >
            <AlertTriangle style={{ width: '0.55rem', height: '0.55rem' }} /> DUP
          </div>
        )}

        {img.status === "done" && (
          <div className="done-badge">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
        )}

        <button className="remove-btn" onClick={() => removeImage(img.id)} title="Remove file">
          <X className="w-3 h-3 text-white" />
        </button>
      </div>

      {/* File info + metadata */}
      <div className="flex-grow space-y-2 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <h3 className="font-mono text-sm text-muted truncate">{img.file.name}</h3>
          <StatusBadge status={img.status} progress={img.upscaleProgress} upscaleModel={img.upscaleModel} />
        </div>

        {img.status === "done" && img.result && (
          <div className="space-y-2 mt-3">
            <MetaField 
              label="Title" 
              value={img.result.title} 
              onChange={(val) => handleMetaChange(img.id, "title", val)}
            />
            <MetaField 
              label="Description" 
              value={img.result.description} 
              onChange={(val) => handleMetaChange(img.id, "description", val)}
              isTextArea
            />
            <MetaField
              label="Keywords"
              value={img.result.keywords}
              onChange={(val) => handleMetaChange(img.id, "keywords", val)}
              isTextArea isKeywords img={img}
            />
            {img.result.categories && img.result.categories.length > 0 && (
              <div className="flex gap-2 items-center mt-2">
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

            {/* SELLING SCORE GAUGE */}
            {img.result.sellingScore !== undefined && img.result.sellingScore !== null && (() => {
              const sc = Math.max(0, Math.min(100, Number(img.result.sellingScore)));
              const meta = getScoreMeta(sc);
              const R = 22; const cx = 28; const cy = 28; const circ = 2 * Math.PI * R;
              const offset = circ - (sc / 100) * circ;
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.65rem', padding: '0.55rem 0.8rem',
                  background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: '0.6rem',
                }}>
                  <svg width="56" height="56" style={{ flexShrink: 0, filter: `drop-shadow(0 0 5px ${meta.trackColor}66)` }}>
                    <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
                    <circle cx={cx} cy={cy} r={R} fill="none" stroke={meta.trackColor} strokeWidth="5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)' }} />
                    <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="800" fill={meta.trackColor}>{sc}</text>
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{meta.emoji} {meta.label} Score</span>
                      <span style={{ fontSize: '0.63rem', color: 'var(--text-3)', fontWeight: 500 }}>/ 100</span>
                    </div>
                    {img.result.scoreReason && <p style={{ fontSize: '0.72rem', color: 'var(--text-2)', margin: '0.18rem 0 0', lineHeight: 1.4, fontStyle: 'italic' }}>{img.result.scoreReason}</p>}
                  </div>
                </div>
              );
            })()}

            {/* IP / POLICY WARNING BANNER */}
            {img.result.policyWarning && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem',
                marginTop: '0.75rem',
                padding: '0.65rem 0.85rem',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '0.6rem',
                borderLeft: '3px solid #ef4444',
              }}>
                <ShieldAlert style={{ color: '#ef4444', width: '1rem', height: '1rem', flexShrink: 0, marginTop: '0.1rem' }} />
                <div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.2rem' }}>⚠ Stock Site Policy Violation Detected</span>
                  <p style={{ fontSize: '0.73rem', color: 'var(--text-1)', margin: 0, lineHeight: 1.5 }}>{img.result.policyWarning}</p>
                </div>
              </div>
            )}
          </div>
        )}


        {img.status === "error" && <p className="text-xs text-red-400 bg-red-400/10 p-2 rounded mt-2">⚠ {img.error}</p>}
        {img.status === "pending" && <p className="text-xs italic text-muted mt-2">{img.isVideo ? "🎬 Ready — Frame will be extracted for AI analysis" : img.isPaired ? "✨ Ready (Using JPG for AI)" : (img.isEps && !img.epsData) ? "⚙ Extracting EPS preview..." : "Awaiting analysis..."}</p>}
        {img.status === "upscaling" && <p className="text-xs text-indigo-400 animate-pulse mt-2">✨ Auto-Upscaling image to {upscaleScale}x{img.upscaleModel ? ` using [${img.upscaleModel}]` : ''}...{img.upscaleProgress !== undefined && img.upscaleProgress > 0 ? ` ${Math.round(img.upscaleProgress)}%` : ''}</p>}
        {img.status === "scanning" && <p className="text-xs text-amber-500 animate-pulse mt-2">🛡️ Scanning for Policy Violations...</p>}
        {img.status === "extracting" && <p className="text-xs text-violet-400 animate-pulse mt-2">🎬 Extracting video frame for AI analysis...</p>}
        {img.status === "processing" && <p className="text-xs text-primary animate-pulse mt-2">🤖 Generating metadata with {activeProviderName} AI...</p>}
        
        {img.embeddingStatus && img.embeddingStatus !== 'none' && (
          <div className={`mt-3 p-2 rounded text-xs flex items-center gap-2 ${img.embeddingStatus === 'embedding' ? 'bg-indigo-500/10 text-indigo-400 animate-pulse' : img.embeddingStatus === 'uploading' ? 'bg-amber-500/10 text-amber-500 w-full' : img.embeddingStatus === 'success' ? 'bg-green-500/10 text-green-400 font-medium' : 'bg-red-500/10 text-red-400'}`} style={{ width: '100%' }}>
            {img.embeddingStatus === 'embedding' && <><Loader2 className="w-3 h-3 animate-spin" /><span>Embedding metadata into file...</span></>}
            {img.embeddingStatus === 'uploading' && (() => {
              const singleProgress = (() => {
                if (typeof img.uploadProgress === 'number') return img.uploadProgress;
                if (typeof img.uploadProgress === 'object' && img.uploadProgress !== null) {
                  const activeConfigs = ftpConfigs.filter(c => c.enabled);
                  if (activeConfigs.length === 0) return 0;
                  const sum = activeConfigs.reduce((s, conf) => s + (img.uploadProgress[conf.host] || 0), 0);
                  return Math.round(sum / activeConfigs.length);
                }
                return 0;
              })();
              return (
                <div className="w-full" style={{ width: '100%' }}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="flex items-center gap-2"><Upload className="w-3 h-3 animate-bounce" /> Uploading to FTP server...</span>
                    <span className="font-bold">{singleProgress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'rgba(245,158,11,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${singleProgress}%`, height: '100%', background: '#f59e0b', transition: 'width 0.1s' }} />
                  </div>
                </div>
              );
            })()}
            {img.embeddingStatus === 'success' && <><CheckCircle2 className="w-3 h-3" /><span>Metadata embedded & processed!</span></>}
            {img.embeddingStatus === 'error' && <><X className="w-3 h-3" /><span>Failed: {img.embeddingError}</span></>}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.img === nextProps.img && 
         prevProps.hasDuplicateBadge === nextProps.hasDuplicateBadge &&
         prevProps.activeProviderName === nextProps.activeProviderName &&
         prevProps.upscaleScale === nextProps.upscaleScale &&
         prevProps.ftpConfigs === nextProps.ftpConfigs;
});

export function MetadataCardList({ images, duplicatePairs, removeImage, handleMetaChange, activeProviderName, upscaleScale, ftpConfigs }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {images.map((img) => {
        const hasDuplicateBadge = duplicatePairs.some((p) => p.id1 === img.id || p.id2 === img.id);
        return (
          <MetadataCard 
            key={img.id}
            img={img}
            hasDuplicateBadge={hasDuplicateBadge}
            removeImage={removeImage}
            handleMetaChange={handleMetaChange}
            activeProviderName={activeProviderName}
            upscaleScale={upscaleScale}
            ftpConfigs={ftpConfigs}
          />
        );
      })}
    </div>
  );
}
