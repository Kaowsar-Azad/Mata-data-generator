import React, { memo } from "react";
import { Video, Loader2, FileCode2, Image as ImageIcon, X, CheckCircle2, Check } from "lucide-react";
import { StatusBadge } from "./workflowHelpers";

const ThumbnailCard = memo(({
  img,
  isSelected,
  isActive,
  isEditing,
  onSelectToggle,
  onActiveToggle,
  removeImage,
}) => {
  return (
    <div 
      className="glass card animate-fade-in"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: '0.5rem',
        borderRadius: '0.75rem',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        background: 'var(--surface-2)', 
        border: isEditing
          ? '1.5px solid #3b82f6'
          : isSelected
            ? '1.5px solid #06b6d4'
            : '1.5px solid rgba(255, 255, 255, 0.1)',
        boxShadow: isEditing
          ? '0 0 15px rgba(59, 130, 246, 0.5)'
          : isSelected
            ? '0 0 15px rgba(6, 182, 212, 0.3)'
            : 'none',
      }}
      onClick={() => {
        onActiveToggle(img.id);
        onSelectToggle(img.id);
      }}
    >
      {/* Thumbnail Wrap */}
      <div className="thumbnail-card-img-wrap" style={{ position: 'relative', width: '100%', aspectRatio: '1/1', overflow: 'hidden', borderRadius: '0.5rem', background: 'rgba(0,0,0,0.1)' }}>
        {img.preview ? (
          <img src={img.preview} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s' }} alt={img.file?.name || "Uploaded media preview"} />
        ) : img.isVideo ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(168,85,247,0.1)' }}>
            <Video style={{ width: '32px', height: '32px', color: '#a855f7' }} />
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 style={{ width: '24px', height: '24px', color: 'var(--accent)' }} className="animate-spin" />
          </div>
        )}

        {/* Selection Checkbox (Absolute Top-Left) */}
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onSelectToggle(img.id);
          }}
          style={{ 
            position: 'absolute',
            top: '8px',
            left: '8px',
            zIndex: 10,
            width: '18px',
            height: '18px',
            background: isSelected ? '#06b6d4' : 'rgba(0, 0, 0, 0.4)', 
            color: '#ffffff',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            border: isSelected ? '1px solid rgba(255,255,255,0.2)' : '1.5px solid rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.currentTarget.style.borderColor = '#06b6d4';
              e.currentTarget.style.background = 'rgba(6, 182, 212, 0.15)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.4)';
            }
          }}
        >
          {isSelected && <Check style={{ width: '11px', height: '11px', strokeWidth: 4 }} />}
        </div>

        {/* Delete Button (Absolute Top-Right) */}
        <button
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            zIndex: 10,
            padding: '4px',
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.5)',
            color: 'rgba(255, 255, 255, 0.8)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.5)'}
          onClick={(e) => {
            e.stopPropagation();
            removeImage(img.id);
          }}
          title="Remove file"
        >
          <X style={{ width: '12px', height: '12px' }} />
        </button>

        {/* Badges (Absolute Bottom-Left) */}
        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          {img.isEps && !img.isPaired && (
            <span style={{
              background: '#f59e0b',
              color: '#1c1917',
              fontSize: '8px',
              fontWeight: 800,
              padding: '2px 5px',
              borderRadius: '3px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              <FileCode2 style={{ width: '10px', height: '10px' }} /> EPS
            </span>
          )}
          {img.isPaired && (
            <span style={{
              background: '#10b981',
              color: '#ffffff',
              fontSize: '8px',
              fontWeight: 800,
              padding: '2px 5px',
              borderRadius: '3px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              <ImageIcon style={{ width: '10px', height: '10px' }} /> EPS+JPG
            </span>
          )}
          {img.isVideo && (
            <span style={{
              background: '#6366f1',
              color: '#ffffff',
              fontSize: '8px',
              fontWeight: 800,
              padding: '2px 5px',
              borderRadius: '3px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              <Video style={{ width: '10px', height: '10px' }} /> VIDEO
            </span>
          )}
        </div>

        {/* Done badge (Absolute Bottom-Right) */}
        {img.status === "done" && (
          <div style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            zIndex: 10,
            background: '#10b981',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            <CheckCircle2 style={{ width: '12px', height: '12px', color: '#ffffff' }} />
          </div>
        )}
      </div>

      {/* Filename and Status */}
      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
        <span 
          style={{ fontSize: '11px', fontFamily: 'monospace', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#d1d5db' }}
          title={img.file?.name || img.renamedName}
        >
          {img.file?.name || img.renamedName}
        </span>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <StatusBadge status={img.status} progress={img.upscaleProgress} upscaleModel={img.upscaleModel} />
        </div>
      </div>
    </div>
  );
});

export function MetadataThumbnailGrid({
  images,
  selectedRows,
  setSelectedRows,
  activeCell,
  setActiveCell,
  removeImage,
  editingImageId,
}) {
  const handleSelectToggle = (id) => {
    const next = new Set(selectedRows);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedRows(next);
  };

  const handleActiveToggle = (id) => {
    setActiveCell({ id, field: 'title' });
    if (!selectedRows.has(id)) {
      const next = new Set(selectedRows);
      next.add(id);
      setSelectedRows(next);
    }
  };

  return (
    <div className="thumbnail-grid max-h-[70vh] overflow-y-auto p-1 pr-2">
      {images.map((img) => (
        <ThumbnailCard
          key={img.id}
          img={img}
          isSelected={selectedRows.has(img.id)}
          isActive={activeCell?.id === img.id}
          isEditing={editingImageId === img.id}
          onSelectToggle={handleSelectToggle}
          onActiveToggle={handleActiveToggle}
          removeImage={removeImage}
        />
      ))}
    </div>
  );
}
