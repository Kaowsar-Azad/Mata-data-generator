import React, { memo } from "react";
import { Video, Loader2, Trash2 } from "lucide-react";
import { StatusBadge, getScoreMeta } from "./workflowHelpers";

const GRID_FIELDS = ['title', 'description', 'keywords'];

const MetadataGridRow = memo(({
  img,
  isSelected,
  toggleRowSelect,
  activeCellField,
  setActiveCell,
  cellRefs,
  handleMetaChange,
  handleCellKeyDown,
  getTitleCounterClass,
  getDescriptionCounterClass,
  getKeywordsCounterClass,
  removeImage
}) => {
  return (
    <tr className={isSelected ? 'row-selected' : ''}>
      {/* Row checkbox */}
      <td className="grid-td-check">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleRowSelect(img.id)}
          className="grid-checkbox"
        />
      </td>

      {/* Thumbnail Preview */}
      <td className="grid-td-preview">
        <div className="grid-thumb-wrap">
          {img.preview ? (
            <img src={img.preview} alt={img.file?.name || "Uploaded media preview"} />
          ) : img.isVideo ? (
            <Video className="w-6 h-6 text-purple-500" />
          ) : (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          )}
        </div>
      </td>

      {/* Filename & Type/Size badges */}
      <td className="grid-td-filename">
        <span className="grid-filename-name" title={img.file?.name || img.renamedName}>
          {img.file?.name || img.renamedName}
        </span>
        <div className="grid-filename-badges">
          {img.isEps && <span className="eps-badge" style={{ fontSize: '0.55rem', padding: '1px 4px' }}>EPS</span>}
          {img.isVideo && <span className="eps-indicator" style={{ position: 'static', transform: 'none', fontSize: '0.55rem', padding: '1px 4px', background: 'rgba(124,58,237,0.15)', color: '#a855f7' }}>Video</span>}
          {!img.isEps && !img.isVideo && <span className="img-badge" style={{ fontSize: '0.55rem', padding: '1px 4px' }}>IMG</span>}
          {img.file?.size && (
            <span className="grid-filesize-badge">
              {(img.file.size / (1024 * 1024)).toFixed(2)} MB
            </span>
          )}
        </div>
      </td>

      {/* Title editor */}
      <td className="grid-td-editor">
        <div className={`grid-cell-editor ${activeCellField === 'title' ? 'focused' : ''}`}>
          <textarea
            ref={el => { cellRefs.current[`${img.id}_title`] = el; }}
            className="bulk-edit-input"
            value={img.result?.title || ''}
            onChange={(e) => handleMetaChange(img.id, 'title', e.target.value)}
            onFocus={() => setActiveCell({ id: img.id, field: 'title' })}
            onBlur={() => setActiveCell(null)}
            onKeyDown={(e) => handleCellKeyDown(e, img.id, 'title')}
            disabled={!img.result}
            placeholder={img.status === 'done' ? 'Enter title…' : '—'}
          />
          {img.result && (
            <span className={`grid-cell-counter ${getTitleCounterClass(img.result.title)}`}>
              {img.result.title?.length || 0} / 150
            </span>
          )}
        </div>
      </td>

      {/* Description editor */}
      <td className="grid-td-editor">
        <div className={`grid-cell-editor ${activeCellField === 'description' ? 'focused' : ''}`}>
          <textarea
            ref={el => { cellRefs.current[`${img.id}_description`] = el; }}
            className="bulk-edit-input"
            value={img.result?.description || ''}
            onChange={(e) => handleMetaChange(img.id, 'description', e.target.value)}
            onFocus={() => setActiveCell({ id: img.id, field: 'description' })}
            onBlur={() => setActiveCell(null)}
            onKeyDown={(e) => handleCellKeyDown(e, img.id, 'description')}
            disabled={!img.result}
            placeholder={img.status === 'done' ? 'Enter description…' : '—'}
          />
          {img.result && (
            <span className={`grid-cell-counter ${getDescriptionCounterClass(img.result.description)}`}>
              {img.result.description?.length || 0} / 250
            </span>
          )}
        </div>
      </td>

      {/* Keywords editor */}
      <td className="grid-td-editor">
        <div className={`grid-cell-editor ${activeCellField === 'keywords' ? 'focused' : ''}`}>
          <textarea
            ref={el => { cellRefs.current[`${img.id}_keywords`] = el; }}
            className="bulk-edit-input"
            value={img.result?.keywords || ''}
            onChange={(e) => handleMetaChange(img.id, 'keywords', e.target.value)}
            onFocus={() => setActiveCell({ id: img.id, field: 'keywords' })}
            onBlur={() => setActiveCell(null)}
            onKeyDown={(e) => handleCellKeyDown(e, img.id, 'keywords')}
            disabled={!img.result}
            placeholder={img.status === 'done' ? 'Enter keywords…' : '—'}
          />
          {img.result && (
            <span className={`grid-cell-counter ${getKeywordsCounterClass(img.result.keywords)}`}>
              {(img.result.keywords || '').split(',').map(k => k.trim()).filter(Boolean).length} / 50 kws
            </span>
          )}
        </div>
      </td>

      {/* Status & Row Action */}
      <td className="grid-td-status">
        <div className="grid-status-stack">
          <StatusBadge status={img.status} progress={img.upscaleProgress} upscaleModel={img.upscaleModel} />

          {/* Selling Score */}
          {img.result?.sellingScore !== undefined && img.result?.sellingScore !== null && (() => {
            const sc = Number(img.result.sellingScore);
            const meta = getScoreMeta(sc);
            return (
              <div
                title={img.result.scoreReason || `Selling Score: ${sc}/100`}
                style={{
                  background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color,
                  borderRadius: '999px', padding: '1px 6px', fontSize: '0.65rem',
                  fontWeight: 800, cursor: 'default',
                }}
              >
                {meta.emoji} {sc}
              </div>
            );
          })()}

          {/* Embedding Status */}
          {img.embeddingStatus && img.embeddingStatus !== 'none' && (
            <div
              className={`grid-embed-chip ${
                img.embeddingStatus === 'embedding' ? 'bg-indigo-500/10 text-indigo-500 animate-pulse' :
                img.embeddingStatus === 'uploading' ? 'bg-amber-500/10 text-amber-500' :
                img.embeddingStatus === 'success' ? 'bg-green-500/10 text-green-500' :
                'bg-red-500/10 text-red-500'
              }`}
              title={img.embeddingStatus === 'error' ? img.embeddingError : ''}
            >
              {img.embeddingStatus === 'embedding' && 'Embedding'}
              {img.embeddingStatus === 'uploading' && 'FTP'}
              {img.embeddingStatus === 'success' && 'Embedded'}
              {img.embeddingStatus === 'error' && 'Failed'}
            </div>
          )}

          <button onClick={() => removeImage(img.id)} className="grid-row-remove-btn" title="Delete Row">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  return prevProps.img === nextProps.img &&
         prevProps.isSelected === nextProps.isSelected &&
         prevProps.activeCellField === nextProps.activeCellField;
});

export function MetadataGrid({ 
  images, gridImages, selectedRows, setSelectedRows, gridSort, toggleSort,
  activeCell, setActiveCell, cellRefs, handleMetaChange, applyToSelected,
  removeImage, getTitleCounterClass, getDescriptionCounterClass, getKeywordsCounterClass
}) {
  const allSelected = gridImages.length > 0 && selectedRows.size === gridImages.length;
  
  const SortIcon = ({ field }) => {
    if (gridSort.field !== field) return <span className="grid-sort-arrow idle">⇅</span>;
    return <span className="grid-sort-arrow active">{gridSort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  const toggleRowSelect = React.useCallback((id) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [setSelectedRows]);

  const toggleSelectAll = () => {
    setSelectedRows(prev => {
      if (prev.size === gridImages.length) return new Set();
      return new Set(gridImages.map(i => i.id));
    });
  };

  const handleCellKeyDown = React.useCallback((e, imgId, field) => {
    const rowIndex = gridImages.findIndex(i => i.id === imgId);
    const fieldIndex = GRID_FIELDS.indexOf(field);
    if (rowIndex === -1 || fieldIndex === -1) return;

    let nextId = imgId;
    let nextField = field;

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      if (fieldIndex < GRID_FIELDS.length - 1) {
        nextField = GRID_FIELDS[fieldIndex + 1];
      } else if (rowIndex < gridImages.length - 1) {
        nextField = GRID_FIELDS[0];
        nextId = gridImages[rowIndex + 1].id;
      }
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      if (fieldIndex > 0) {
        nextField = GRID_FIELDS[fieldIndex - 1];
      } else if (rowIndex > 0) {
        nextField = GRID_FIELDS[GRID_FIELDS.length - 1];
        nextId = gridImages[rowIndex - 1].id;
      }
    } else if (e.key === 'ArrowDown' && e.ctrlKey) {
      e.preventDefault();
      if (rowIndex < gridImages.length - 1) nextId = gridImages[rowIndex + 1].id;
    } else if (e.key === 'ArrowUp' && e.ctrlKey) {
      e.preventDefault();
      if (rowIndex > 0) nextId = gridImages[rowIndex - 1].id;
    } else if (e.key === 'Enter' && e.ctrlKey) {
      // Ctrl+Enter: apply this cell's value to all selected rows
      const curImg = images.find(i => i.id === imgId);
      if (curImg?.result) applyToSelected(imgId, field, curImg.result[field] || '');
      return;
    } else {
      return; // normal typing
    }

    if (nextId !== imgId || nextField !== field) {
      setActiveCell({ id: nextId, field: nextField });
      const key = `${nextId}_${nextField}`;
      setTimeout(() => cellRefs.current[key]?.focus(), 10);
    }
  }, [gridImages, images, applyToSelected, setActiveCell, cellRefs]);

  return (
    <div className="grid-view-container">
      {/* Bulk action bar */}
      {selectedRows.size > 0 && (
        <div className="grid-bulk-bar">
          <span className="grid-bulk-bar-count">
            ✓ {selectedRows.size} row{selectedRows.size > 1 ? 's' : ''} selected
          </span>
          <span className="grid-bulk-bar-hint">— Ctrl+Enter in any cell to copy that value to all selected rows</span>
          <button onClick={() => setSelectedRows(new Set())} className="grid-bulk-bar-clear">Clear</button>
        </div>
      )}
      <table className="bulk-edit-table">
        <thead>
          <tr>
            {/* Select-all checkbox */}
            <th style={{ width: 40, textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                title="Select / Deselect all"
                className="grid-checkbox"
              />
            </th>
            <th className="col-width-preview">Preview</th>
            <th className="col-width-filename sortable" onClick={() => toggleSort('filename')}>
              Filename <SortIcon field="filename" />
            </th>
            <th className="col-width-title sortable" onClick={() => toggleSort('title')}>
              Title <SortIcon field="title" />
            </th>
            <th className="col-width-description">Description</th>
            <th className="col-width-keywords">Keywords</th>
            <th className="col-width-status sortable" onClick={() => toggleSort('status')}>
              Status <SortIcon field="status" />
            </th>
          </tr>
        </thead>
        <tbody>
          {gridImages.map(img => (
            <MetadataGridRow
              key={img.id}
              img={img}
              isSelected={selectedRows.has(img.id)}
              toggleRowSelect={toggleRowSelect}
              activeCellField={activeCell?.id === img.id ? activeCell.field : null}
              setActiveCell={setActiveCell}
              cellRefs={cellRefs}
              handleMetaChange={handleMetaChange}
              handleCellKeyDown={handleCellKeyDown}
              getTitleCounterClass={getTitleCounterClass}
              getDescriptionCounterClass={getDescriptionCounterClass}
              getKeywordsCounterClass={getKeywordsCounterClass}
              removeImage={removeImage}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
