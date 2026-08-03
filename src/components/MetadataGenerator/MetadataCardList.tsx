import React, { memo } from "react";
import { Video, Loader2, FileCode2, Image as ImageIcon, AlertTriangle, CheckCircle2, X, Upload, ShieldAlert, Sparkles, Bot, Maximize2 } from "lucide-react";
import { MdCloudUpload } from "react-icons/md";
import { StatusBadge, getScoreMeta } from "./workflowHelpers";
import { MetaField } from "./MetaField";

const MetadataCard = memo(({ 
  img, hasDuplicateBadge, removeImage, handleMetaChange, activeProviderName, upscaleScale, ftpConfigs
}: any) => {
  return (
    <div className="glass card animate-fade-in file-row">
      {/* Preview thumbnail */}
      <div className="thumb-wrap">
        {img.preview ? (
          <img src={img.preview} className="thumb-img" alt={img.file?.name || "Uploaded media preview"} />
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
            <AlertTriangle style={{ width: '0.55rem', height: '0.55rem', stroke: '#fbbf24' }} /> DUP
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
                <ShieldAlert style={{ stroke: '#ef4444', width: '1rem', height: '1rem', flexShrink: 0, marginTop: '0.1rem' }} />
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
        {img.status === "upscaling" && (
          <div className="premium-indicator-badge premium-indicator-blue">
            <div className="premium-indicator-wrapper">
              <div className="premium-indicator-spinner" />
              <Maximize2 className="w-2.5 h-2.5 premium-indicator-inner" />
            </div>
            <span>Auto-Upscaling image to {upscaleScale}x{img.upscaleModel ? ` [${img.upscaleModel}]` : ''}...{img.upscaleProgress !== undefined && img.upscaleProgress > 0 ? ` ${Math.round(img.upscaleProgress)}%` : ''}</span>
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
            <span>Generating metadata with {activeProviderName} AI...</span>
          </div>
        )}
        
        {img.embeddingStatus && img.embeddingStatus !== 'none' && (
          <div className={`mt-3 p-2 rounded text-xs flex items-center gap-2 ${img.embeddingStatus === 'embedding' ? 'bg-indigo-500/10 text-indigo-400' : img.embeddingStatus === 'uploading' ? 'bg-amber-500/10 text-amber-500 w-full' : img.embeddingStatus === 'success' ? 'bg-green-500/10 text-green-400 font-medium' : 'bg-red-500/10 text-red-400'}`} style={{ width: '100%' }}>
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
                    <span className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '1.25rem',
                        height: '1.25rem',
                        borderRadius: '0.35rem',
                        background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                        marginRight: '0.1rem'
                      }} className="animate-bounce">
                        <MdCloudUpload style={{ width: '0.85rem', height: '0.85rem', color: '#ffffff' }} />
                      </div>
                      Uploading to FTP server...
                    </span>
                    <span className="font-bold">{singleProgress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'rgba(245,158,11,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${singleProgress}%`, height: '100%', background: '#f59e0b', transition: 'width 0.1s' }} />
                  </div>
                </div>
              );
            })()}
            {img.embeddingStatus === 'success' && <><CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /><span>Metadata embedded & processed!</span></>}
            {img.embeddingStatus === 'error' && <><X style={{ width: '0.8rem', height: '0.8rem', stroke: '#ef4444' }} /><span>Failed: {img.embeddingError}</span></>}
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

export function MetadataCardList({ images, duplicatePairs, removeImage, handleMetaChange, activeProviderName, upscaleScale, ftpConfigs }: any) {
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
