import React, { useState, useRef, useEffect, useCallback } from 'react';

// ============================================================
// Types
// ============================================================
type LayoutId = 'single' | 'split-v' | 'split-h' | 'triple-col' | 'triple-row' | 'featured';
type ContentType = 'video' | 'image' | 'text' | 'carousel' | 'livestream';

interface SlotDefinition {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface LayoutPreset {
  id: LayoutId;
  label: string;
  icon: React.ReactNode;
  getSlots: (width: number, height: number) => SlotDefinition[];
}

interface SlotContentMap {
  [slotId: number]: ContentType;
}

interface OverlayConfig {
  // Screen
  width: number;
  height: number;
  // Layout
  layoutId: LayoutId;
  slotContents: SlotContentMap;
  // Header / Channel
  channelName: string;
  showLogo: boolean;
  logoText: string;
  logoImage: string | null;
  // Headline bar
  headline: string;
  badgeText: string;
  badgeColor: string;
  // Lower highlight
  showHighlight: boolean;
  highlightText: string;
  highlightBgColor: string;
  highlightTextColor: string;
  // Ticker
  showTicker: boolean;
  tickerText: string;
  tickerColor: string;
  tickerBgColor: string;
  tickerSpeed: number;
  // Style
  topBarColor: string;
  headlineBarColor: string;
  showBorder: boolean;
  borderColor: string;
}

// ============================================================
// Layout Presets (6 options)
// ============================================================
const LAYOUTS: LayoutPreset[] = [
  {
    id: 'single',
    label: 'Single',
    icon: <svg viewBox="0 0 56 36" width="48" height="32"><rect x="2" y="2" width="52" height="32" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/></svg>,
    getSlots: (w, h) => [{ id: 0, x: 0, y: 0, width: w, height: h, label: 'MAIN' }],
  },
  {
    id: 'split-v',
    label: '2-Column',
    icon: <svg viewBox="0 0 56 36" width="48" height="32"><rect x="2" y="2" width="24" height="32" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/><rect x="30" y="2" width="24" height="32" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/></svg>,
    getSlots: (w, h) => [
      { id: 0, x: 0, y: 0, width: w / 2, height: h, label: 'LEFT' },
      { id: 1, x: w / 2, y: 0, width: w / 2, height: h, label: 'RIGHT' },
    ],
  },
  {
    id: 'split-h',
    label: '2-Row',
    icon: <svg viewBox="0 0 56 36" width="48" height="32"><rect x="2" y="2" width="52" height="14" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="20" width="52" height="14" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/></svg>,
    getSlots: (w, h) => [
      { id: 0, x: 0, y: 0, width: w, height: h / 2, label: 'TOP' },
      { id: 1, x: 0, y: h / 2, width: w, height: h / 2, label: 'BOTTOM' },
    ],
  },
  {
    id: 'triple-col',
    label: '3-Column',
    icon: <svg viewBox="0 0 56 36" width="48" height="32"><rect x="2" y="2" width="16" height="32" rx="2" fill="currentColor" opacity="0.15"/><rect x="20" y="2" width="16" height="32" rx="2" fill="currentColor" opacity="0.15"/><rect x="38" y="2" width="16" height="32" rx="2" fill="currentColor" opacity="0.15"/></svg>,
    getSlots: (w, h) => [
      { id: 0, x: 0, y: 0, width: w / 3, height: h, label: 'COL 1' },
      { id: 1, x: w / 3, y: 0, width: w / 3, height: h, label: 'COL 2' },
      { id: 2, x: (2 * w) / 3, y: 0, width: w / 3, height: h, label: 'COL 3' },
    ],
  },
  {
    id: 'triple-row',
    label: '3-Row',
    icon: <svg viewBox="0 0 56 36" width="48" height="32"><rect x="2" y="2" width="52" height="9" rx="2" fill="currentColor" opacity="0.15"/><rect x="2" y="13" width="52" height="9" rx="2" fill="currentColor" opacity="0.15"/><rect x="2" y="24" width="52" height="9" rx="2" fill="currentColor" opacity="0.15"/></svg>,
    getSlots: (w, h) => [
      { id: 0, x: 0, y: 0, width: w, height: h / 3, label: 'ROW 1' },
      { id: 1, x: 0, y: h / 3, width: w, height: h / 3, label: 'ROW 2' },
      { id: 2, x: 0, y: (2 * h) / 3, width: w, height: h / 3, label: 'ROW 3' },
    ],
  },
  {
    id: 'featured',
    label: 'Featured',
    icon: <svg viewBox="0 0 56 36" width="48" height="32"><rect x="2" y="2" width="52" height="20" rx="2" fill="currentColor" opacity="0.15"/><rect x="2" y="24" width="24" height="10" rx="2" fill="currentColor" opacity="0.15"/><rect x="30" y="24" width="24" height="10" rx="2" fill="currentColor" opacity="0.15"/></svg>,
    getSlots: (w, h) => [
      { id: 0, x: 0, y: 0, width: w, height: h * 0.6, label: 'FEATURED' },
      { id: 1, x: 0, y: h * 0.6, width: w / 2, height: h * 0.4, label: 'SIDE A' },
      { id: 2, x: w / 2, y: h * 0.6, width: w / 2, height: h * 0.4, label: 'SIDE B' },
    ],
  },
];

// Content type definitions
const CONTENT_TYPES: { id: ContentType; label: string; icon: string; color: string }[] = [
  { id: 'video', label: 'Video', icon: '▶', color: '#3b82f6' },
  { id: 'image', label: 'Image', icon: '⬜', color: '#10b981' },
  { id: 'text', label: 'Text', icon: 'T', color: '#f59e0b' },
  { id: 'carousel', label: 'Carousel', icon: '⊞', color: '#8b5cf6' },
  { id: 'livestream', label: 'Livestream', icon: '◉', color: '#ef4444' },
];

const BADGE_PRESETS = ['BREAKING', 'LIVE', 'EXCLUSIVE', 'ALERT', 'UPDATE', 'SPECIAL REPORT'];
const SCREEN_PRESETS = [
  { label: 'HD Ready', w: 1280, h: 720 },
  { label: 'Full HD', w: 1920, h: 1080 },
  { label: 'Square', w: 1080, h: 1080 },
  { label: 'Vertical', w: 1080, h: 1920 },
  { label: 'SD', w: 854, h: 480 },
  { label: 'Preview', w: 640, h: 360 },
];

const DEFAULT_CONFIG: OverlayConfig = {
  width: 1280,
  height: 720,
  layoutId: 'single',
  slotContents: { 0: 'video' },
  channelName: 'NEWS 24',
  showLogo: false,
  logoText: '',
  logoImage: null,
  headline: 'BREAKING: Major earthquake strikes Pacific coast',
  badgeText: 'BREAKING',
  badgeColor: '#e74c3c',
  showHighlight: true,
  highlightText: '🌐 Special coverage: Live updates from the scene',
  highlightBgColor: '#2c3e50',
  highlightTextColor: '#ffffff',
  showTicker: true,
  tickerText: 'Markets fall 3% • Tech stocks lead decline • Oil prices surge • More updates coming',
  tickerColor: '#f1c40f',
  tickerBgColor: '#1a1a2e',
  tickerSpeed: 80,
  topBarColor: '#1a1a2e',
  headlineBarColor: '#c0392b',
  showBorder: true,
  borderColor: '#c0392b',
};

// ============================================================
// Ticker Component
// ============================================================
const TickerPreview: React.FC<{ text: string; color: string; bgColor: string; speed: number; containerWidth?: number }> = ({ 
  text, color, bgColor, speed, containerWidth = 1280 
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState(containerWidth);
  const animRef = useRef<number>();
  const prevTimeRef = useRef<number>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const textWidth = el.scrollWidth;
    
    const animate = (timestamp: number) => {
      if (!prevTimeRef.current) {
        prevTimeRef.current = timestamp;
        animRef.current = requestAnimationFrame(animate);
        return;
      }
      const delta = Math.min(0.033, (timestamp - prevTimeRef.current) / 1000);
      prevTimeRef.current = timestamp;
      
      setPosition(prev => {
        let next = prev - speed * delta;
        if (next < -textWidth) {
          return containerWidth;
        }
        return next;
      });
      animRef.current = requestAnimationFrame(animate);
    };
    
    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [text, speed, containerWidth]);

  return (
    <div style={{ background: bgColor, overflow: 'hidden', height: 32, width: '100%', position: 'relative' }}>
      <span
        ref={ref}
        style={{
          position: 'absolute',
          left: position,
          whiteSpace: 'nowrap',
          fontSize: 13,
          fontWeight: 600,
          color,
          letterSpacing: '0.03em',
          fontFamily: 'monospace',
          paddingRight: 40,
        }}
      >
        {text} &nbsp;&nbsp;•&nbsp;&nbsp; {text}
      </span>
    </div>
  );
};

// ============================================================
// Editable Slot Component (with clickable type buttons)
// ============================================================
interface EditableSlotProps {
  slot: SlotDefinition;
  contentType: ContentType;
  onTypeChange: (slotId: number, type: ContentType) => void;
}

const EditableSlot: React.FC<EditableSlotProps> = ({ slot, contentType, onTypeChange }) => {
  const [isHovered, setIsHovered] = useState(false);
  const typeInfo = CONTENT_TYPES.find(t => t.id === contentType) || CONTENT_TYPES[0];
  const isLivestream = contentType === 'livestream';

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        top: slot.y,
        left: slot.x,
        width: slot.width,
        height: slot.height,
        background: 'linear-gradient(135deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.5) 100%)',
        backdropFilter: 'blur(3px)',
        borderRadius: '6px',
        border: isHovered ? `2px solid ${typeInfo.color}` : '1px solid rgba(255,255,255,0.2)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {isLivestream && (
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#ef4444', borderRadius: '50%', animation: 'pulse 1.2s infinite' }} />
        )}
        <span style={{ fontSize: 28, fontWeight: 500, color: '#fff', textShadow: '0 0 6px rgba(0,0,0,0.5)' }}>{typeInfo.icon}</span>
      </div>
      <span style={{ fontSize: 10, background: 'rgba(0,0,0,0.7)', padding: '2px 10px', borderRadius: 20, color: '#ddd', fontWeight: 500 }}>{typeInfo.label}</span>
      
      {isHovered && (
        <div style={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 4,
          background: 'rgba(0,0,0,0.85)',
          padding: '4px 8px',
          borderRadius: 24,
          backdropFilter: 'blur(8px)',
          whiteSpace: 'nowrap',
        }}>
          {CONTENT_TYPES.map(type => (
            <button
              key={type.id}
              onClick={(e) => { e.stopPropagation(); onTypeChange(slot.id, type.id); }}
              style={{
                background: contentType === type.id ? type.color : '#2a2e3f',
                border: 'none',
                borderRadius: 20,
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: '#fff',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.1s',
              }}
            >
              <span>{type.icon}</span>
              <span style={{ fontSize: 9 }}>{type.label}</span>
            </button>
          ))}
        </div>
      )}
      
      <span style={{ position: 'absolute', bottom: 4, left: 8, fontSize: 8, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>{slot.label}</span>
    </div>
  );
};

// ============================================================
// Main Live Preview Component
// ============================================================
interface LivePreviewProps {
  config: OverlayConfig;
  onSlotTypeChange: (slotId: number, type: ContentType) => void;
}

const LivePreview: React.FC<LivePreviewProps> = ({ config, onSlotTypeChange }) => {
  const { width, height, layoutId, slotContents, channelName, showLogo, logoText, logoImage,
    headline, badgeText, badgeColor, showHighlight, highlightText, highlightBgColor, highlightTextColor,
    showTicker, tickerText, tickerColor, tickerBgColor, tickerSpeed,
    topBarColor, headlineBarColor, showBorder, borderColor } = config;

  const TOP_BAR_H = 56;
  const HEADLINE_H = 52;
  const HIGHLIGHT_H = showHighlight ? 34 : 0;
  const TICKER_H = showTicker ? 32 : 0;
  const VIDEO_AREA_H = height - TOP_BAR_H - HEADLINE_H - HIGHLIGHT_H - TICKER_H;

  const layout = LAYOUTS.find(l => l.id === layoutId) || LAYOUTS[0];
  const slots = layout.getSlots(width, VIDEO_AREA_H);
  
  // Offset slots vertically by top bar height
  const slotsWithOffset = slots.map(slot => ({
    ...slot,
    y: TOP_BAR_H + slot.y,
  }));

  return (
    <div style={{
      width,
      height,
      position: 'relative',
      background: '#0a0c15',
      overflow: 'hidden',
      border: showBorder ? `3px solid ${borderColor}` : 'none',
      boxSizing: 'border-box',
      boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Video Slots */}
      {slotsWithOffset.map(slot => (
        <EditableSlot
          key={slot.id}
          slot={slot}
          contentType={slotContents[slot.id] || 'video'}
          onTypeChange={onSlotTypeChange}
        />
      ))}

      {/* Top Bar / Logo Zone */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: TOP_BAR_H,
        background: topBarColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      }}>
        {showLogo && logoImage ? (
          <img src={logoImage} style={{ height: 36, objectFit: 'contain' }} alt="logo" />
        ) : showLogo && logoText ? (
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 20, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{logoText}</span>
        ) : (
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '0.12em' }}>{channelName || 'CHANNEL'}</span>
        )}
      </div>

      {/* Headline Bar */}
      <div style={{
        position: 'absolute',
        bottom: HIGHLIGHT_H + TICKER_H,
        left: 0,
        right: 0,
        height: HEADLINE_H,
        background: headlineBarColor,
        display: 'flex',
        alignItems: 'center',
        zIndex: 20,
        paddingLeft: 16,
        gap: 14,
      }}>
        {badgeText && (
          <div style={{
            background: badgeColor,
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            padding: '4px 14px',
            borderRadius: 4,
            letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
          }}>{badgeText}</div>
        )}
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginRight: 16 }}>
          {headline}
        </span>
      </div>

      {/* Lower Highlight Section */}
      {showHighlight && (
        <div style={{
          position: 'absolute',
          bottom: TICKER_H,
          left: 0,
          right: 0,
          height: HIGHLIGHT_H,
          background: highlightBgColor,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 16,
          zIndex: 19,
        }}>
          <span style={{ color: highlightTextColor, fontSize: 12, fontWeight: 500 }}>{highlightText}</span>
        </div>
      )}

      {/* Ticker */}
      {showTicker && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: TICKER_H, zIndex: 21 }}>
          <TickerPreview text={tickerText} color={tickerColor} bgColor={tickerBgColor} speed={tickerSpeed} containerWidth={width} />
        </div>
      )}
    </div>
  );
};

// ============================================================
// UI Helpers
// ============================================================
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 28 }}>
    <div style={{ fontSize: 10, fontWeight: 600, color: '#8f99b0', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>{title}</div>
    {children}
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ fontSize: 12, color: '#9aa2b8', display: 'block', marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);

const ColorPicker: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width: 36, height: 36, borderRadius: 8, cursor: 'pointer', border: '1px solid #2e3440', background: '#1e1f2c' }} />
    <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#8f99b0' }}>{value.toUpperCase()}</span>
  </div>
);

// ============================================================
// Main Overlay Template Component
// ============================================================
const OverlayTemplate: React.FC = () => {
  const [config, setConfig] = useState<OverlayConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<'screen' | 'layout' | 'content' | 'style'>('screen');
  const [templateName, setTemplateName] = useState('My Broadcast Template');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateConfig = <K extends keyof OverlayConfig>(key: K, value: OverlayConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSlotTypeChange = (slotId: number, type: ContentType) => {
    setConfig(prev => ({
      ...prev,
      slotContents: { ...prev.slotContents, [slotId]: type },
    }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => updateConfig('logoImage', ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // Update slot contents when layout changes
  const handleLayoutChange = (layoutId: LayoutId) => {
    const layout = LAYOUTS.find(l => l.id === layoutId);
    if (layout) {
      const newSlotContents: SlotContentMap = {};
      const tempSlots = layout.getSlots(100, 100);
      tempSlots.forEach(slot => {
        newSlotContents[slot.id] = config.slotContents[slot.id] || 'video';
      });
      setConfig(prev => ({ ...prev, layoutId, slotContents: newSlotContents }));
    }
  };

  const tabs = [
    { id: 'screen' as const, label: 'Screen' },
    { id: 'layout' as const, label: 'Layout' },
    { id: 'content' as const, label: 'Content' },
    { id: 'style' as const, label: 'Style' },
  ];

  const aspectRatio = (config.width / config.height).toFixed(3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0c0c14', color: '#eef2ff' }}>
      {/* Top Toolbar */}
      <div style={{ background: '#11131e', borderBottom: '1px solid #262c38', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e74c3c', animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Overlay Studio Pro</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            style={{ background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 8, padding: '6px 14px', fontSize: 13, color: '#eef2ff', width: 200 }}
            placeholder="Template name"
          />
          <button style={{ background: '#e74c3c', border: 'none', borderRadius: 8, padding: '6px 20px', fontSize: 13, fontWeight: 500, color: '#fff', cursor: 'pointer' }}>
            Save Template
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: 300, borderRight: '1px solid #262c38', background: '#0f111a', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #262c38' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  fontSize: 12,
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  background: 'none',
                  border: 'none',
                  color: activeTab === tab.id ? '#e74c3c' : '#8f99b0',
                  borderBottom: activeTab === tab.id ? '2px solid #e74c3c' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>
            {/* SCREEN TAB */}
            {activeTab === 'screen' && (
              <>
                <Section title="Canvas Size">
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <Field label="Width (px)">
                      <input type="number" value={config.width} onChange={e => updateConfig('width', Number(e.target.value))} style={{ width: '100%', background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 6, padding: '8px 10px', color: '#fff' }} />
                    </Field>
                    <Field label="Height (px)">
                      <input type="number" value={config.height} onChange={e => updateConfig('height', Number(e.target.value))} style={{ width: '100%', background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 6, padding: '8px 10px', color: '#fff' }} />
                    </Field>
                  </div>
                  <div style={{ background: '#1a1c28', borderRadius: 8, padding: 10, marginBottom: 16, textAlign: 'center' }}>
                    <span style={{ fontSize: 12 }}>Aspect Ratio: {aspectRatio} ({config.width}×{config.height})</span>
                  </div>
                </Section>
                <Section title="Quick Presets">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {SCREEN_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        onClick={() => { updateConfig('width', preset.w); updateConfig('height', preset.h); }}
                        style={{ background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 6, padding: '8px', fontSize: 11, cursor: 'pointer', color: '#eef2ff' }}
                      >
                        {preset.label}<br/>{preset.w}×{preset.h}
                      </button>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {/* LAYOUT TAB */}
            {activeTab === 'layout' && (
              <Section title="Layout Presets">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {LAYOUTS.map(layout => (
                    <button
                      key={layout.id}
                      onClick={() => handleLayoutChange(layout.id)}
                      style={{
                        padding: '12px 6px',
                        border: config.layoutId === layout.id ? '2px solid #e74c3c' : '1px solid #2e3440',
                        borderRadius: 10,
                        background: config.layoutId === layout.id ? 'rgba(231,76,60,0.1)' : '#1a1c28',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        color: config.layoutId === layout.id ? '#e74c3c' : '#b9c3db',
                      }}
                    >
                      {layout.icon}
                      <span style={{ fontSize: 11, fontWeight: 500 }}>{layout.label}</span>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* CONTENT TAB */}
            {activeTab === 'content' && (
              <>
                <Section title="Header Zone">
                  <Field label="Channel Name">
                    <input value={config.channelName} onChange={e => updateConfig('channelName', e.target.value)} style={{ width: '100%', background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 6, padding: '8px 10px', color: '#fff' }} />
                  </Field>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <button onClick={() => updateConfig('showLogo', false)} style={{ flex: 1, padding: '6px', background: !config.showLogo ? '#e74c3c' : '#1e1f2c', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer' }}>None</button>
                    <button onClick={() => { updateConfig('showLogo', true); updateConfig('logoImage', null); }} style={{ flex: 1, padding: '6px', background: config.showLogo && !config.logoImage ? '#e74c3c' : '#1e1f2c', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer' }}>Text</button>
                    <button onClick={() => { updateConfig('showLogo', true); fileInputRef.current?.click(); }} style={{ flex: 1, padding: '6px', background: config.showLogo && config.logoImage ? '#e74c3c' : '#1e1f2c', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer' }}>Image/GIF</button>
                  </div>
                  {config.showLogo && !config.logoImage && <Field label="Logo Text"><input value={config.logoText} onChange={e => updateConfig('logoText', e.target.value)} placeholder="NEWS 24" style={{ width: '100%', background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 6, padding: '8px 10px', color: '#fff' }} /></Field>}
                  {config.logoImage && <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e1f2c', padding: 8, borderRadius: 8 }}><img src={config.logoImage} style={{ height: 32 }} alt="logo" /><button onClick={() => updateConfig('logoImage', null)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer' }}>Remove</button></div>}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                </Section>

                <Section title="Headline Bar">
                  <Field label="Headline Text"><textarea value={config.headline} onChange={e => updateConfig('headline', e.target.value)} rows={2} style={{ width: '100%', background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 6, padding: '8px 10px', color: '#fff', resize: 'vertical' }} /></Field>
                  <Field label="Badge Text"><input value={config.badgeText} onChange={e => updateConfig('badgeText', e.target.value)} style={{ width: '100%', background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 6, padding: '8px 10px', color: '#fff' }} /></Field>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {BADGE_PRESETS.map(b => <button key={b} onClick={() => updateConfig('badgeText', b)} style={{ padding: '3px 10px', fontSize: 10, background: config.badgeText === b ? '#e74c3c' : '#2a2e3f', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }}>{b}</button>)}
                  </div>
                </Section>

                <Section title="Lower Highlight">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12 }}>Show Highlight Bar</span>
                    <button onClick={() => updateConfig('showHighlight', !config.showHighlight)} style={{ width: 40, height: 22, borderRadius: 11, background: config.showHighlight ? '#e74c3c' : '#2e3440', border: 'none', position: 'relative', cursor: 'pointer' }}><span style={{ position: 'absolute', top: 2, left: config.showHighlight ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff' }} /></button>
                  </div>
                  {config.showHighlight && <Field label="Highlight Text"><input value={config.highlightText} onChange={e => updateConfig('highlightText', e.target.value)} style={{ width: '100%', background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 6, padding: '8px 10px', color: '#fff' }} /></Field>}
                </Section>

                <Section title="Ticker">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12 }}>Show Ticker</span>
                    <button onClick={() => updateConfig('showTicker', !config.showTicker)} style={{ width: 40, height: 22, borderRadius: 11, background: config.showTicker ? '#e74c3c' : '#2e3440', border: 'none', position: 'relative', cursor: 'pointer' }}><span style={{ position: 'absolute', top: 2, left: config.showTicker ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff' }} /></button>
                  </div>
                  {config.showTicker && (
                    <>
                      <Field label="Ticker Text"><textarea value={config.tickerText} onChange={e => updateConfig('tickerText', e.target.value)} rows={2} style={{ width: '100%', background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 6, padding: '8px 10px', color: '#fff' }} /></Field>
                      <Field label={`Speed: ${config.tickerSpeed} px/s`}><input type="range" min="30" max="200" step="10" value={config.tickerSpeed} onChange={e => updateConfig('tickerSpeed', Number(e.target.value))} style={{ width: '100%' }} /></Field>
                    </>
                  )}
                </Section>
              </>
            )}

            {/* STYLE TAB */}
            {activeTab === 'style' && (
              <>
                <Section title="Top Bar"><Field label="Background"><ColorPicker value={config.topBarColor} onChange={v => updateConfig('topBarColor', v)} /></Field></Section>
                <Section title="Headline Bar"><Field label="Background"><ColorPicker value={config.headlineBarColor} onChange={v => updateConfig('headlineBarColor', v)} /></Field><Field label="Badge Color"><ColorPicker value={config.badgeColor} onChange={v => updateConfig('badgeColor', v)} /></Field></Section>
                <Section title="Lower Highlight"><Field label="Background"><ColorPicker value={config.highlightBgColor} onChange={v => updateConfig('highlightBgColor', v)} /></Field><Field label="Text Color"><ColorPicker value={config.highlightTextColor} onChange={v => updateConfig('highlightTextColor', v)} /></Field></Section>
                <Section title="Ticker"><Field label="Background"><ColorPicker value={config.tickerBgColor} onChange={v => updateConfig('tickerBgColor', v)} /></Field><Field label="Text Color"><ColorPicker value={config.tickerColor} onChange={v => updateConfig('tickerColor', v)} /></Field></Section>
                <Section title="Border">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><span style={{ fontSize: 12 }}>Show Border</span><button onClick={() => updateConfig('showBorder', !config.showBorder)} style={{ width: 40, height: 22, borderRadius: 11, background: config.showBorder ? '#e74c3c' : '#2e3440', border: 'none', position: 'relative', cursor: 'pointer' }}><span style={{ position: 'absolute', top: 2, left: config.showBorder ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff' }} /></button></div>
                  {config.showBorder && <Field label="Border Color"><ColorPicker value={config.borderColor} onChange={v => updateConfig('borderColor', v)} /></Field>}
                </Section>
              </>
            )}
          </div>
        </div>

        {/* Preview Area */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', padding: 24, overflow: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 10, color: '#5a627a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>LIVE PREVIEW — {config.width}×{config.height}</div>
            <div style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 140px)', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', borderRadius: 4 }}>
              <LivePreview config={config} onSlotTypeChange={handleSlotTypeChange} />
            </div>
            <div style={{ fontSize: 10, color: '#5a627a' }}>↓ Click any slot to change content type (Video/Image/Text/Carousel/Livestream)</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.2); }
        }
        input, textarea { outline: none; }
        input:focus, textarea:focus { border-color: #e74c3c; }
      `}</style>
    </div>
  );
};

export default OverlayTemplate;