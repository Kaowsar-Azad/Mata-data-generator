import React, { useState } from 'react';
import { 
  mainCategories, 
  categories, 
  mediaTypes, 
  styles, 
  lighting, 
  cameraAngles,
  addCustomMainCategory,
  addCustomSubCategory,
  addCustomStyle,
  addCustomLighting,
  addCustomCameraAngle
} from '../../services/promptEngine/dataset';
import { Sparkles, ChevronDown } from 'lucide-react';

/* ─── Light Glassmorphism Tokens ──────────────────────────── */
const GLASS_BG      = 'rgba(255, 255, 255, 0.62)';
const GLASS_BORDER  = 'rgba(0, 0, 0, 0.06)';
const FIELD_BG      = 'rgba(255, 255, 255, 0.55)';
const FIELD_BORDER  = 'rgba(0, 0, 0, 0.08)';
const FOCUS_BORDER  = 'rgba(37, 99, 235, 0.45)';
const FOCUS_RING    = 'rgba(37, 99, 235, 0.08)';
const FOCUS_BG      = 'rgba(37, 99, 235, 0.04)';
const LABEL_COLOR   = '#6b7280';
const TEXT_COLOR     = '#1e293b';
const TEAL          = '#14b8a6';

/* ─── Tiny label ─────────────────────────────────────────── */
const Label = ({ children, style }) => (
  <span style={{
    display: 'block',
    fontSize: '0.62rem',
    fontWeight: 700,
    color: LABEL_COLOR,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    ...style
  }}>
    {children}
  </span>
);

/* ─── Select wrapper with arrow ─────────────────────────── */
const Sel = ({ value, onChange, children, focused, onFocus, onBlur }) => (
  <div style={{ position: 'relative' }}>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      style={{
        width: '100%',
        padding: '6px 24px 6px 8px',
        background: focused ? FOCUS_BG : FIELD_BG,
        border: `1.5px solid ${focused ? FOCUS_BORDER : FIELD_BORDER}`,
        borderRadius: '8px',
        color: TEXT_COLOR,
        fontSize: '0.78rem',
        fontWeight: 500,
        outline: 'none',
        cursor: 'pointer',
        appearance: 'none',
        WebkitAppearance: 'none',
        transition: 'border-color .2s, background .2s, box-shadow .2s',
        boxShadow: focused
          ? `0 0 0 3px ${FOCUS_RING}, 0 1px 3px rgba(0,0,0,0.04)`
          : '0 1px 3px rgba(0,0,0,0.04)',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </select>
    <ChevronDown style={{
      position: 'absolute', right: '8px', top: '50%',
      transform: 'translateY(-50%)',
      width: '12px', height: '12px',
      color: focused ? 'var(--primary)' : '#9ca3af',
      pointerEvents: 'none', transition: 'color .2s',
    }} />
  </div>
);

/* ─── Main Component ─────────────────────────────────────── */
export const ControlPanel = ({ onGenerate, isGenerating }) => {
  const [config, setConfig] = useState({
    mainCategory: 'auto',
    categoryName: 'auto',
    mediaType: 'photo',
    promptLength: 'detailed',
    count: 6,
    styleChoice: 'auto',
    lightingChoice: 'auto',
    cameraAngleChoice: 'auto',
    customInstruction: '',
  });
  const [focus, setFocus] = useState(null);

  const [showAddMain, setShowAddMain] = useState(false);
  const [newMainName, setNewMainName] = useState('');
  const [showAddSub, setShowAddSub] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [showAddStyle, setShowAddStyle] = useState(false);
  const [newStyleName, setNewStyleName] = useState('');
  const [showAddLighting, setShowAddLighting] = useState(false);
  const [newLightingName, setNewLightingName] = useState('');
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [newCameraName, setNewCameraName] = useState('');

  const set  = (k, v) => setConfig(p => ({ ...p, [k]: v }));
  const foc  = name => () => setFocus(name);
  const blur = () => setFocus(null);

  return (
    <form
      onSubmit={e => { e.preventDefault(); onGenerate(config); }}
      style={{
        width: '280px',
        minWidth: '280px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        /* Light Glass Card */
        background: GLASS_BG,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: `1px solid ${GLASS_BORDER}`,
        borderRadius: '16px',
        padding: '14px 14px 12px',
        boxSizing: 'border-box',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 24px rgba(0,0,0,0.03)',
        overflow: 'hidden',
      }}
    >
      {/* ── Panel heading ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginBottom: '2px' }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '6px',
          background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 3px 10px rgba(37,99,235,0.25)', flexShrink: 0,
        }}>
          <Sparkles style={{ width: '12px', height: '12px', color: '#fff' }} />
        </div>
        <div>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }}>Configuration</span>
          <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', margin: 0, lineHeight: 1.2 }}>Set parameters & generate</p>
        </div>
      </div>

      {/* thin divider */}
      <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', flexShrink: 0 }} />

      {/* Fields Container */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        paddingRight: '4px',
        margin: '2px 0',
        scrollbarWidth: 'none',
      }}>

      {/* ── Main Category ── */}
      <div style={{ flexShrink: 0 }}>
        {showAddMain ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <Label>New Main Category ADD</Label>
              <button 
                type="button" 
                onClick={() => { setShowAddMain(false); setNewMainName(''); }} 
                style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}
              >
                Cancel
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input 
                type="text" 
                value={newMainName} 
                onChange={e => setNewMainName(e.target.value)}
                placeholder="Name..."
                style={{
                  flex: 1, padding: '6px 8px', background: FIELD_BG, border: `1.5px solid ${FIELD_BORDER}`,
                  borderRadius: '8px', color: TEXT_COLOR, fontSize: '0.78rem', outline: 'none'
                }}
              />
              <button 
                type="button"
                onClick={() => {
                  if (newMainName.trim()) {
                    addCustomMainCategory(newMainName.trim());
                    set('mainCategory', newMainName.trim());
                    set('categoryName', '');
                    setShowAddMain(false);
                    setNewMainName('');
                  }
                }}
                style={{
                  padding: '6px 12px', border: 'none', borderRadius: '8px',
                  background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                  color: '#fff', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <Label>Main Category</Label>
              <button 
                type="button" 
                onClick={() => setShowAddMain(true)} 
                style={{ border: 'none', background: 'rgba(37,99,235,0.1)', color: 'var(--primary)', fontSize: '0.55rem', fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', padding: '3px 6px', borderRadius: '4px' }}
              >
                + Add New
              </button>
            </div>
            <Sel 
              value={config.mainCategory} 
              onChange={v => {
                set('mainCategory', v);
                set('categoryName', v === 'auto' ? 'auto' : (mainCategories[v]?.[0] || ''));
              }} 
              focused={focus==='maincat'} onFocus={foc('maincat')} onBlur={blur}
            >
              <option value="auto">✦  Auto (Random)</option>
              {Object.keys(mainCategories).map(mc => <option key={mc} value={mc}>{mc}</option>)}
            </Sel>
          </>
        )}
      </div>

      {/* ── Sub-Category ── */}
      <div style={{ flexShrink: 0 }}>
        {showAddSub ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <Label>New Sub-Category ADD</Label>
              <button 
                type="button" 
                onClick={() => { setShowAddSub(false); setNewSubName(''); }} 
                style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}
              >
                Cancel
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input 
                type="text" 
                value={newSubName} 
                onChange={e => setNewSubName(e.target.value)}
                placeholder="Name..."
                style={{
                  flex: 1, padding: '6px 8px', background: FIELD_BG, border: `1.5px solid ${FIELD_BORDER}`,
                  borderRadius: '8px', color: TEXT_COLOR, fontSize: '0.78rem', outline: 'none'
                }}
              />
              <button 
                type="button"
                onClick={() => {
                  if (newSubName.trim()) {
                    addCustomSubCategory(config.mainCategory, newSubName.trim());
                    set('categoryName', newSubName.trim());
                    setShowAddSub(false);
                    setNewSubName('');
                  }
                }}
                style={{
                  padding: '6px 12px', border: 'none', borderRadius: '8px',
                  background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                  color: '#fff', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <Label>Sub-Category</Label>
              <button 
                type="button" 
                onClick={() => setShowAddSub(true)} 
                style={{ border: 'none', background: 'rgba(37,99,235,0.1)', color: 'var(--primary)', fontSize: '0.55rem', fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', padding: '3px 6px', borderRadius: '4px' }}
              >
                + Add New
              </button>
            </div>
            <Sel value={config.categoryName} onChange={v => set('categoryName', v)} focused={focus==='cat'} onFocus={foc('cat')} onBlur={blur}>
              <option value="auto">✦  Auto (Random)</option>
              {(!mainCategories[config.mainCategory] || mainCategories[config.mainCategory].length === 0) && config.mainCategory !== 'auto' && (
                <option value="">No subcategories (Click + Add New)</option>
              )}
              {mainCategories[config.mainCategory]?.map(c => <option key={c} value={c}>{c}</option>)}
            </Sel>
          </>
        )}
      </div>

      {/* ── Type ── */}
      <div style={{ flexShrink: 0 }}>
        <Label>Type</Label>
        <Sel value={config.mediaType} onChange={v => set('mediaType', v)} focused={focus==='type'} onFocus={foc('type')} onBlur={blur}>
          {mediaTypes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </Sel>
      </div>

      {/* ── Length + Count ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '8px', flexShrink: 0 }}>
        <div>
          <Label>Length</Label>
          <Sel value={config.promptLength} onChange={v => set('promptLength', v)} focused={focus==='len'} onFocus={foc('len')} onBlur={blur}>
            <option value="detailed">Detailed</option>
            <option value="short">Short</option>
          </Sel>
        </div>
        <div>
          <Label>Count</Label>
          <input
            type="number" min="1" max="50"
            value={config.count}
            onChange={e => set('count', parseInt(e.target.value) || 6)}
            onFocus={foc('count')} onBlur={blur}
            style={{
              width: '100%', padding: '6px 8px', boxSizing: 'border-box',
              background: focus==='count' ? FOCUS_BG : FIELD_BG,
              border: `1.5px solid ${focus==='count' ? FOCUS_BORDER : FIELD_BORDER}`,
              borderRadius: '8px', color: TEXT_COLOR, fontSize: '0.78rem', fontWeight: 500,
              outline: 'none',
              boxShadow: focus==='count' ? `0 0 0 3px ${FOCUS_RING}` : '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'all .2s', fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* thin divider */}
      <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', flexShrink: 0 }} />

      {/* ── Style ── */}
      <div style={{ flexShrink: 0 }}>
        {showAddStyle ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <Label>New Style ADD</Label>
              <button 
                type="button" 
                onClick={() => { setShowAddStyle(false); setNewStyleName(''); }} 
                style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}
              >
                Cancel
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input 
                type="text" 
                value={newStyleName} 
                onChange={e => setNewStyleName(e.target.value)}
                placeholder="Style..."
                style={{
                  flex: 1, padding: '6px 8px', background: FIELD_BG, border: `1.5px solid ${FIELD_BORDER}`,
                  borderRadius: '8px', color: TEXT_COLOR, fontSize: '0.78rem', outline: 'none', width: '0'
                }}
              />
              <button 
                type="button"
                onClick={() => {
                  if (newStyleName.trim()) {
                    addCustomStyle(newStyleName.trim());
                    set('styleChoice', newStyleName.trim());
                    setShowAddStyle(false);
                    setNewStyleName('');
                  }
                }}
                style={{
                  padding: '6px 10px', border: 'none', borderRadius: '8px',
                  background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                  color: '#fff', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0
                }}
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', minHeight: '14.5px' }}>
              <Label style={{ marginBottom: 0 }}>Style</Label>
              <button 
                type="button" 
                onClick={() => setShowAddStyle(true)} 
                style={{ border: 'none', background: 'rgba(37,99,235,0.1)', color: 'var(--primary)', fontSize: '0.55rem', fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', padding: '3px 6px', borderRadius: '4px' }}
              >
                + Add
              </button>
            </div>
            <Sel value={config.styleChoice} onChange={v => set('styleChoice', v)} focused={focus==='style'} onFocus={foc('style')} onBlur={blur}>
              <option value="auto">✦ Auto</option>
              {styles.map(s => <option key={s} value={s}>{s}</option>)}
            </Sel>
          </>
        )}
      </div>

      {/* thin divider */}
      <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', flexShrink: 0 }} />

      {/* ── Lighting ── */}
      <div style={{ flexShrink: 0 }}>
        {showAddLighting ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <Label>New Light ADD</Label>
              <button 
                type="button" 
                onClick={() => { setShowAddLighting(false); setNewLightingName(''); }} 
                style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}
              >
                Cancel
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input 
                type="text" 
                value={newLightingName} 
                onChange={e => setNewLightingName(e.target.value)}
                placeholder="Light..."
                style={{
                  flex: 1, padding: '6px 8px', background: FIELD_BG, border: `1.5px solid ${FIELD_BORDER}`,
                  borderRadius: '8px', color: TEXT_COLOR, fontSize: '0.78rem', outline: 'none', width: '0'
                }}
              />
              <button 
                type="button"
                onClick={() => {
                  if (newLightingName.trim()) {
                    addCustomLighting(newLightingName.trim());
                    set('lightingChoice', newLightingName.trim());
                    setShowAddLighting(false);
                    setNewLightingName('');
                  }
                }}
                style={{
                  padding: '6px 10px', border: 'none', borderRadius: '8px',
                  background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                  color: '#fff', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0
                }}
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', minHeight: '14.5px' }}>
              <Label style={{ marginBottom: 0 }}>Lighting</Label>
              <button 
                type="button" 
                onClick={() => setShowAddLighting(true)} 
                style={{ border: 'none', background: 'rgba(37,99,235,0.1)', color: 'var(--primary)', fontSize: '0.55rem', fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', padding: '3px 6px', borderRadius: '4px' }}
              >
                + Add
              </button>
            </div>
            <Sel value={config.lightingChoice} onChange={v => set('lightingChoice', v)} focused={focus==='light'} onFocus={foc('light')} onBlur={blur}>
              <option value="auto">✦ Auto</option>
              {lighting.map(l => <option key={l} value={l}>{l}</option>)}
            </Sel>
          </>
        )}
      </div>

      {/* thin divider */}
      <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', flexShrink: 0 }} />

      {/* ── Camera Angle ── */}
      <div style={{ flexShrink: 0 }}>
        {showAddCamera ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <Label>New Angle ADD</Label>
              <button 
                type="button" 
                onClick={() => { setShowAddCamera(false); setNewCameraName(''); }} 
                style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}
              >
                Cancel
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input 
                type="text" 
                value={newCameraName} 
                onChange={e => setNewCameraName(e.target.value)}
                placeholder="Angle..."
                style={{
                  flex: 1, padding: '6px 8px', background: FIELD_BG, border: `1.5px solid ${FIELD_BORDER}`,
                  borderRadius: '8px', color: TEXT_COLOR, fontSize: '0.78rem', outline: 'none', width: '0'
                }}
              />
              <button 
                type="button"
                onClick={() => {
                  if (newCameraName.trim()) {
                    addCustomCameraAngle(newCameraName.trim());
                    set('cameraAngleChoice', newCameraName.trim());
                    setShowAddCamera(false);
                    setNewCameraName('');
                  }
                }}
                style={{
                  padding: '6px 10px', border: 'none', borderRadius: '8px',
                  background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                  color: '#fff', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0
                }}
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', minHeight: '14.5px' }}>
              <Label style={{ marginBottom: 0 }}>Camera</Label>
              <button 
                type="button" 
                onClick={() => setShowAddCamera(true)} 
                style={{ border: 'none', background: 'rgba(37,99,235,0.1)', color: 'var(--primary)', fontSize: '0.55rem', fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', padding: '3px 6px', borderRadius: '4px' }}
              >
                + Add
              </button>
            </div>
            <Sel value={config.cameraAngleChoice} onChange={v => set('cameraAngleChoice', v)} focused={focus==='cam'} onFocus={foc('cam')} onBlur={blur}>
              <option value="auto">✦ Auto</option>
              {cameraAngles.map(c => <option key={c} value={c}>{c}</option>)}
            </Sel>
          </>
        )}
      </div>

      {/* ── Additional Direction ── */}
      <div style={{ flexShrink: 0 }}>
        <Label>Additional Direction</Label>
        <textarea
          value={config.customInstruction}
          onChange={e => set('customInstruction', e.target.value)}
          onFocus={foc('custom')} onBlur={blur}
          rows={2}
          placeholder="e.g. luxury styling, no people…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '7px 10px',
            background: focus==='custom' ? FOCUS_BG : FIELD_BG,
            border: `1.5px solid ${focus==='custom' ? FOCUS_BORDER : FIELD_BORDER}`,
            borderRadius: '10px', color: TEXT_COLOR, fontSize: '0.76rem',
            outline: 'none', resize: 'none', lineHeight: 1.45,
            boxShadow: focus==='custom' ? `0 0 0 3px ${FOCUS_RING}` : '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'all .2s', fontFamily: 'inherit',
          }}
        />
      </div>
      </div>

      {/* ── Generate button ── */}
      <button
        type="submit"
        disabled={isGenerating}
        style={{
          marginTop: 'auto',
          width: '100%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
          padding: '10px 14px',
          borderRadius: '12px',
          border: 'none',
          background: isGenerating
            ? 'linear-gradient(135deg, rgba(37,99,235,0.5), rgba(139,92,246,0.4))'
            : 'linear-gradient(135deg, var(--primary), var(--secondary))',
          color: '#ffffff',
          fontSize: '0.76rem', fontWeight: 800,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          cursor: isGenerating ? 'not-allowed' : 'pointer',
          boxShadow: isGenerating ? 'none' : '0 4px 14px rgba(37,99,235,0.3)',
          transition: 'all .2s', fontFamily: 'inherit',
        }}
        onMouseOver={e => {
          if (!isGenerating) {
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,0.4)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }
        }}
        onMouseOut={e => {
          if (!isGenerating) {
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(37,99,235,0.3)';
            e.currentTarget.style.transform = 'translateY(0)';
          }
        }}
      >
        <Sparkles style={{ width: '13px', height: '13px', animation: isGenerating ? 'spin 1s linear infinite' : 'none' }} />
        {isGenerating ? 'Generating…' : 'Generate Prompts'}
      </button>
    </form>
  );
};
