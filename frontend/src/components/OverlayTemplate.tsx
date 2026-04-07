import React, { useState, useRef, useEffect } from 'react';
import SlotMediaManager from './SlotMediaManager';
import type { SlotMediaSource, StreamSession } from '../types';

type LayoutId = 'single' | 'split-v' | 'split-h' | 'triple-col' | 'triple-row' | 'featured';
type ContentType = 'video' | 'image' | 'text' | 'carousel' | 'livestream';
type AudioSourceType = 'upload' | 'text-to-speech' | 'none';

interface SlotDefinition { id: number; x: number; y: number; width: number; height: number; label: string; }
interface LayoutPreset { id: LayoutId; label: string; icon: React.ReactNode; getSlots: (w: number, h: number) => SlotDefinition[]; }
interface SlotContentMap { [slotId: number]: ContentType; }

interface VoiceOverConfig {
  enabled: boolean; sourceType: AudioSourceType; audioUrl: string | null; audioFileName: string | null;
  ttsText: string; ttsVoice: string; ttsSpeed: number; ttsPitch: number; volume: number;
}

interface BackgroundMusicConfig {
  enabled: boolean; audioUrl: string | null; audioFileName: string | null;
  volume: number; loop: boolean; startOffset: number;
}

interface OverlayConfig {
  _id?: string; name: string; createdAt: string; updatedAt: string;
  width: number; height: number; layoutId: LayoutId; slotContents: SlotContentMap;
  channelName: string; showLogo: boolean; logoText: string; logoImage: string | null;
  headline: string; badgeText: string; badgeColor: string;
  showHighlight: boolean; highlightText: string; highlightBgColor: string; highlightTextColor: string;
  showTicker: boolean; tickerText: string; tickerColor: string; tickerBgColor: string; tickerSpeed: number;
  topBarColor: string; headlineBarColor: string; showBorder: boolean; borderColor: string;
  voiceOver: VoiceOverConfig; backgroundMusic: BackgroundMusicConfig;
}

// ── Serializers ──────────────────────────────────────────────────────────────
function toApiPayload(cfg: OverlayConfig): Record<string, unknown> {
  return {
    name: cfg.name, tags: [],
    config: {
      width: cfg.width, height: cfg.height, layout_id: cfg.layoutId,
      slot_contents: cfg.slotContents, channel_name: cfg.channelName, show_logo: cfg.showLogo,
      logo_text: cfg.logoText, logo_image: cfg.logoImage, headline: cfg.headline,
      badge_text: cfg.badgeText, badge_color: cfg.badgeColor, show_highlight: cfg.showHighlight,
      highlight_text: cfg.highlightText, highlight_bg_color: cfg.highlightBgColor,
      highlight_text_color: cfg.highlightTextColor, show_ticker: cfg.showTicker,
      ticker_text: cfg.tickerText, ticker_color: cfg.tickerColor, ticker_bg_color: cfg.tickerBgColor,
      ticker_speed: cfg.tickerSpeed, top_bar_color: cfg.topBarColor,
      headline_bar_color: cfg.headlineBarColor, show_border: cfg.showBorder, border_color: cfg.borderColor,
      voice_over: { enabled: cfg.voiceOver.enabled, source_type: cfg.voiceOver.sourceType,
        audio_url: cfg.voiceOver.audioUrl, audio_file_name: cfg.voiceOver.audioFileName,
        tts_text: cfg.voiceOver.ttsText, tts_voice: cfg.voiceOver.ttsVoice,
        tts_speed: cfg.voiceOver.ttsSpeed, tts_pitch: cfg.voiceOver.ttsPitch, volume: cfg.voiceOver.volume },
      background_music: { enabled: cfg.backgroundMusic.enabled, audio_url: cfg.backgroundMusic.audioUrl,
        audio_file_name: cfg.backgroundMusic.audioFileName, volume: cfg.backgroundMusic.volume,
        loop: cfg.backgroundMusic.loop, start_offset: cfg.backgroundMusic.startOffset },
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromApiResponse(doc: any): OverlayConfig {
  const c = doc.config ?? {}, vo = c.voice_over ?? {}, bm = c.background_music ?? {};
  return {
    _id: doc.id ?? doc._id, name: doc.name ?? 'Untitled',
    createdAt: doc.created_at ?? new Date().toISOString(),
    updatedAt: doc.updated_at ?? new Date().toISOString(),
    width: c.width ?? 1280, height: c.height ?? 720,
    layoutId: (c.layout_id ?? 'single') as LayoutId,
    slotContents: c.slot_contents ?? { 0: 'video' },
    channelName: c.channel_name ?? 'NEWS 24', showLogo: c.show_logo ?? false,
    logoText: c.logo_text ?? '', logoImage: c.logo_image ?? null,
    headline: c.headline ?? '', badgeText: c.badge_text ?? 'BREAKING',
    badgeColor: c.badge_color ?? '#e74c3c', showHighlight: c.show_highlight ?? true,
    highlightText: c.highlight_text ?? '', highlightBgColor: c.highlight_bg_color ?? '#2c3e50',
    highlightTextColor: c.highlight_text_color ?? '#ffffff', showTicker: c.show_ticker ?? true,
    tickerText: c.ticker_text ?? '', tickerColor: c.ticker_color ?? '#f1c40f',
    tickerBgColor: c.ticker_bg_color ?? '#1a1a2e', tickerSpeed: c.ticker_speed ?? 80,
    topBarColor: c.top_bar_color ?? '#1a1a2e', headlineBarColor: c.headline_bar_color ?? '#c0392b',
    showBorder: c.show_border ?? true, borderColor: c.border_color ?? '#c0392b',
    voiceOver: { enabled: vo.enabled ?? false, sourceType: (vo.source_type ?? 'none') as AudioSourceType,
      audioUrl: vo.audio_url ?? null, audioFileName: vo.audio_file_name ?? null,
      ttsText: vo.tts_text ?? '', ttsVoice: vo.tts_voice ?? 'en-US-JennyNeural',
      ttsSpeed: vo.tts_speed ?? 1.0, ttsPitch: vo.tts_pitch ?? 1.0, volume: vo.volume ?? 0.8 },
    backgroundMusic: { enabled: bm.enabled ?? false, audioUrl: bm.audio_url ?? null,
      audioFileName: bm.audio_file_name ?? null, volume: bm.volume ?? 0.3,
      loop: bm.loop ?? true, startOffset: bm.start_offset ?? 0 },
  };
}

// ── API ───────────────────────────────────────────────────────────────────────
const API_BASE_URL = (import.meta as any).env?.VITE_DEFAULT_API ?? 'http://localhost:8000';

const apiService = {
  async getTemplates() {
    try {
      const r = await fetch(`${API_BASE_URL}/templates`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      return { success: true, data: (d.items ?? d).map(fromApiResponse) as OverlayConfig[] };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
  async createTemplate(t: OverlayConfig) {
    try {
      const r = await fetch(`${API_BASE_URL}/templates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toApiPayload(t)) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { success: true, data: fromApiResponse(await r.json()) };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
  async updateTemplate(id: string, t: OverlayConfig) {
    try {
      const r = await fetch(`${API_BASE_URL}/templates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toApiPayload(t)) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { success: true, data: fromApiResponse(await r.json()) };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
  async deleteTemplate(id: string) {
    try {
      const r = await fetch(`${API_BASE_URL}/templates/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
  async uploadAudio(file: File, type: 'voiceover' | 'bgmusic') {
    const fd = new FormData(); fd.append('audio', file); fd.append('type', type);
    try {
      const r = await fetch(`${API_BASE_URL}/upload/audio`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { success: true, data: await r.json() as { url: string; filename: string } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
  async generateTTS(text: string, voice: string, speed: number, pitch: number) {
    try {
      const r = await fetch(`${API_BASE_URL}/tts/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice, speed, pitch }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { success: true, data: await r.json() as { url: string } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};

// ── Layout presets ────────────────────────────────────────────────────────────
const LAYOUTS: LayoutPreset[] = [
  { id: 'single', label: 'Single', icon: <svg viewBox="0 0 56 36" width="48" height="32"><rect x="2" y="2" width="52" height="32" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/></svg>, getSlots: (w, h) => [{ id: 0, x: 0, y: 0, width: w, height: h, label: 'MAIN' }] },
  { id: 'split-v', label: '2-Column', icon: <svg viewBox="0 0 56 36" width="48" height="32"><rect x="2" y="2" width="24" height="32" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/><rect x="30" y="2" width="24" height="32" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/></svg>, getSlots: (w, h) => [{ id: 0, x: 0, y: 0, width: w/2, height: h, label: 'LEFT' }, { id: 1, x: w/2, y: 0, width: w/2, height: h, label: 'RIGHT' }] },
  { id: 'split-h', label: '2-Row', icon: <svg viewBox="0 0 56 36" width="48" height="32"><rect x="2" y="2" width="52" height="14" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="20" width="52" height="14" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/></svg>, getSlots: (w, h) => [{ id: 0, x: 0, y: 0, width: w, height: h/2, label: 'TOP' }, { id: 1, x: 0, y: h/2, width: w, height: h/2, label: 'BOTTOM' }] },
  { id: 'triple-col', label: '3-Column', icon: <svg viewBox="0 0 56 36" width="48" height="32"><rect x="2" y="2" width="16" height="32" rx="2" fill="currentColor" opacity="0.15"/><rect x="20" y="2" width="16" height="32" rx="2" fill="currentColor" opacity="0.15"/><rect x="38" y="2" width="16" height="32" rx="2" fill="currentColor" opacity="0.15"/></svg>, getSlots: (w, h) => [{ id: 0, x: 0, y: 0, width: w/3, height: h, label: 'COL 1' }, { id: 1, x: w/3, y: 0, width: w/3, height: h, label: 'COL 2' }, { id: 2, x: (2*w)/3, y: 0, width: w/3, height: h, label: 'COL 3' }] },
  { id: 'triple-row', label: '3-Row', icon: <svg viewBox="0 0 56 36" width="48" height="32"><rect x="2" y="2" width="52" height="9" rx="2" fill="currentColor" opacity="0.15"/><rect x="2" y="13" width="52" height="9" rx="2" fill="currentColor" opacity="0.15"/><rect x="2" y="24" width="52" height="9" rx="2" fill="currentColor" opacity="0.15"/></svg>, getSlots: (w, h) => [{ id: 0, x: 0, y: 0, width: w, height: h/3, label: 'ROW 1' }, { id: 1, x: 0, y: h/3, width: w, height: h/3, label: 'ROW 2' }, { id: 2, x: 0, y: (2*h)/3, width: w, height: h/3, label: 'ROW 3' }] },
  { id: 'featured', label: 'Featured', icon: <svg viewBox="0 0 56 36" width="48" height="32"><rect x="2" y="2" width="52" height="20" rx="2" fill="currentColor" opacity="0.15"/><rect x="2" y="24" width="24" height="10" rx="2" fill="currentColor" opacity="0.15"/><rect x="30" y="24" width="24" height="10" rx="2" fill="currentColor" opacity="0.15"/></svg>, getSlots: (w, h) => [{ id: 0, x: 0, y: 0, width: w, height: h*0.6, label: 'FEATURED' }, { id: 1, x: 0, y: h*0.6, width: w/2, height: h*0.4, label: 'SIDE A' }, { id: 2, x: w/2, y: h*0.6, width: w/2, height: h*0.4, label: 'SIDE B' }] },
];

const CONTENT_TYPES = [
  { id: 'video' as ContentType, label: 'Video', icon: '▶', color: '#3b82f6' },
  { id: 'image' as ContentType, label: 'Image', icon: '⬜', color: '#10b981' },
  { id: 'text' as ContentType, label: 'Text', icon: 'T', color: '#f59e0b' },
  { id: 'carousel' as ContentType, label: 'Carousel', icon: '⊞', color: '#8b5cf6' },
  { id: 'livestream' as ContentType, label: 'Livestream', icon: '◉', color: '#ef4444' },
];

const BADGE_PRESETS = ['BREAKING', 'LIVE', 'EXCLUSIVE', 'ALERT', 'UPDATE', 'SPECIAL REPORT'];
const SCREEN_PRESETS = [{ label: 'HD Ready', w: 1280, h: 720 }, { label: 'Full HD', w: 1920, h: 1080 }, { label: 'Square', w: 1080, h: 1080 }, { label: 'Vertical', w: 1080, h: 1920 }, { label: 'SD', w: 854, h: 480 }, { label: 'Preview', w: 640, h: 360 }];
const TTS_VOICES = [
  { id: 'en-US-JennyNeural', name: 'Jenny (Female)', locale: 'en-US' }, { id: 'en-US-GuyNeural', name: 'Guy (Male)', locale: 'en-US' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia (British F)', locale: 'en-GB' }, { id: 'en-GB-RyanNeural', name: 'Ryan (British M)', locale: 'en-GB' },
  { id: 'en-AU-NatashaNeural', name: 'Natasha (AU)', locale: 'en-AU' }, { id: 'hi-IN-SwaraNeural', name: 'Swara (Hindi)', locale: 'hi-IN' },
];

const DEFAULT_VO: VoiceOverConfig = { enabled: false, sourceType: 'none', audioUrl: null, audioFileName: null, ttsText: 'Welcome to our broadcast.', ttsVoice: 'en-US-JennyNeural', ttsSpeed: 1, ttsPitch: 1, volume: 0.8 };
const DEFAULT_BGM: BackgroundMusicConfig = { enabled: false, audioUrl: null, audioFileName: null, volume: 0.3, loop: true, startOffset: 0 };
const DEFAULT_CONFIG: OverlayConfig = {
  name: 'New Template', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  width: 1280, height: 720, layoutId: 'single', slotContents: { 0: 'video' },
  channelName: 'NEWS 24', showLogo: false, logoText: '', logoImage: null,
  headline: 'BREAKING: Major earthquake strikes Pacific coast', badgeText: 'BREAKING', badgeColor: '#e74c3c',
  showHighlight: true, highlightText: '🌐 Special coverage: Live updates from the scene',
  highlightBgColor: '#2c3e50', highlightTextColor: '#ffffff', showTicker: true,
  tickerText: 'Markets fall 3% • Tech stocks lead decline • Oil prices surge',
  tickerColor: '#f1c40f', tickerBgColor: '#1a1a2e', tickerSpeed: 80,
  topBarColor: '#1a1a2e', headlineBarColor: '#c0392b', showBorder: true, borderColor: '#c0392b',
  voiceOver: DEFAULT_VO, backgroundMusic: DEFAULT_BGM,
};

// ── Slot sources helpers ──────────────────────────────────────────────────────
function makeDefaultSource(slot: { id: number; label: string }, ct: ContentType): SlotMediaSource {
  return { slotId: slot.id, contentType: ct, sourceType: 'none', fileUrl: null, fileName: null, filePath: null, streamUrl: null, streamKey: null, label: slot.label };
}
function syncSlotSources(cur: Record<number, SlotMediaSource>, slots: { id: number; label: string }[], cts: SlotContentMap): Record<number, SlotMediaSource> {
  const next: Record<number, SlotMediaSource> = {};
  for (const s of slots) next[s.id] = cur[s.id] ? { ...cur[s.id], label: s.label, contentType: cts[s.id] ?? cur[s.id].contentType } : makeDefaultSource(s, cts[s.id] ?? 'video');
  return next;
}

// ── AudioPreview ─────────────────────────────────────────────────────────────
const AudioPreview: React.FC<{ url: string | null; volume?: number }> = ({ url, volume = 0.8 }) => {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { if (ref.current) ref.current.volume = volume; }, [volume]);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const on = () => setPlaying(true), off = () => setPlaying(false);
    el.addEventListener('play', on); el.addEventListener('pause', off); el.addEventListener('ended', off);
    return () => { el.removeEventListener('play', on); el.removeEventListener('pause', off); el.removeEventListener('ended', off); };
  }, []);
  const toggle = () => { const el = ref.current; if (!el || !url) return; playing ? el.pause() : el.play(); };
  if (!url) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e1f2c', padding: '6px 12px', borderRadius: 20 }}>
      <button onClick={toggle} style={{ background: '#e74c3c', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>{playing ? '⏸' : '▶'}</button>
      <audio ref={ref} src={url} />
      <span style={{ fontSize: 11, color: '#8f99b0' }}>Preview</span>
    </div>
  );
};

// ── Ticker ────────────────────────────────────────────────────────────────────
const TickerPreview: React.FC<{ text: string; color: string; bgColor: string; speed: number; containerWidth?: number }> = ({ text, color, bgColor, speed, containerWidth = 1280 }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState(containerWidth);
  const animRef = useRef<number>(); const prevRef = useRef<number>();
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const tw = el.scrollWidth;
    const animate = (ts: number) => {
      if (!prevRef.current) { prevRef.current = ts; animRef.current = requestAnimationFrame(animate); return; }
      const d = Math.min(0.033, (ts - prevRef.current) / 1000); prevRef.current = ts;
      setPos(p => { const n = p - speed * d; return n < -tw ? containerWidth : n; });
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [text, speed, containerWidth]);
  return (
    <div style={{ background: bgColor, overflow: 'hidden', height: 32, width: '100%', position: 'relative' }}>
      <span ref={ref} style={{ position: 'absolute', left: pos, whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color, letterSpacing: '0.03em', fontFamily: 'monospace', paddingRight: 40 }}>
        {text} &nbsp;&nbsp;•&nbsp;&nbsp; {text}
      </span>
    </div>
  );
};

// ── Editable Slot ─────────────────────────────────────────────────────────────
interface EditableSlotProps {
  slot: SlotDefinition; contentType: ContentType; source: SlotMediaSource | null;
  onTypeChange: (id: number, t: ContentType) => void; onEditSource: (id: number) => void;
}
const EditableSlot: React.FC<EditableSlotProps> = ({ slot, contentType, source, onTypeChange, onEditSource }) => {
  const [hov, setHov] = useState(false);
  const ti = CONTENT_TYPES.find(t => t.id === contentType) || CONTENT_TYPES[0];
  const hasSrc = source && source.sourceType !== 'none';
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
      position: 'absolute', top: slot.y, left: slot.x, width: slot.width, height: slot.height,
      background: 'linear-gradient(135deg,rgba(0,0,0,.65),rgba(0,0,0,.5))', backdropFilter: 'blur(3px)',
      borderRadius: 6, overflow: 'hidden', cursor: 'pointer', transition: 'border 0.15s',
      border: hov ? `2px solid ${ti.color}` : hasSrc ? '2px solid rgba(39,174,96,.6)' : '1px solid rgba(255,255,255,.2)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      {hasSrc && source.fileUrl && contentType === 'image' && <img src={source.fileUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }} />}
      {hasSrc && source.fileUrl && contentType === 'video' && <video src={source.fileUrl} muted autoPlay loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }} />}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {contentType === 'livestream' && <span style={{ width: 10, height: 10, background: '#ef4444', borderRadius: '50%', animation: 'pulse 1.2s infinite', display: 'inline-block' }} />}
        <span style={{ fontSize: 28, color: '#fff', textShadow: '0 0 6px rgba(0,0,0,.5)' }}>{ti.icon}</span>
      </div>
      <span style={{ position: 'relative', fontSize: 10, background: 'rgba(0,0,0,.7)', padding: '2px 10px', borderRadius: 20, color: '#ddd', fontWeight: 500 }}>{ti.label}</span>
      {hasSrc && (
        <span style={{ position: 'relative', marginTop: 4, fontSize: 9, fontWeight: 700, background: 'rgba(39,174,96,.85)', color: '#fff', padding: '1px 7px', borderRadius: 10 }}>
          {source.fileName ?? source.streamUrl?.slice(0, 22) ?? source.filePath?.split('/').pop() ?? 'source set'}
        </span>
      )}
      {hov && (
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4, background: 'rgba(0,0,0,.9)', padding: '4px 8px', borderRadius: 24, whiteSpace: 'nowrap', zIndex: 30 }}>
          {CONTENT_TYPES.map(type => (
            <button key={type.id} onClick={e => { e.stopPropagation(); onTypeChange(slot.id, type.id); }}
              style={{ background: contentType === type.id ? type.color : '#2a2e3f', border: 'none', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
              {type.icon} <span style={{ fontSize: 9 }}>{type.label}</span>
            </button>
          ))}
          <button onClick={e => { e.stopPropagation(); onEditSource(slot.id); }}
            style={{ background: '#27ae60', border: 'none', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
            📂 Source
          </button>
        </div>
      )}
      <span style={{ position: 'absolute', bottom: 4, left: 8, fontSize: 8, color: 'rgba(255,255,255,.5)', fontWeight: 500 }}>{slot.label}</span>
    </div>
  );
};

// ── Live Preview ──────────────────────────────────────────────────────────────
const LivePreview: React.FC<{ config: OverlayConfig; slotSources: Record<number, SlotMediaSource>; onSlotTypeChange: (id: number, t: ContentType) => void; onEditSource: (id: number) => void }> = ({ config, slotSources, onSlotTypeChange, onEditSource }) => {
  const { width, height, layoutId, slotContents, channelName, showLogo, logoText, logoImage, headline, badgeText, badgeColor, showHighlight, highlightText, highlightBgColor, highlightTextColor, showTicker, tickerText, tickerColor, tickerBgColor, tickerSpeed, topBarColor, headlineBarColor, showBorder, borderColor } = config;
  const TOP = 56, HL = 52, HH = showHighlight ? 34 : 0, TH = showTicker ? 32 : 0;
  const layout = LAYOUTS.find(l => l.id === layoutId) || LAYOUTS[0];
  const slots = layout.getSlots(width, height - TOP - HL - HH - TH).map(s => ({ ...s, y: TOP + s.y }));
  return (
    <div style={{ width, height, position: 'relative', background: '#0a0c15', overflow: 'hidden', border: showBorder ? `3px solid ${borderColor}` : 'none', boxSizing: 'border-box', fontFamily: "'Inter',system-ui,sans-serif" }}>
      {slots.map(s => <EditableSlot key={s.id} slot={s} contentType={slotContents[s.id] || 'video'} source={slotSources[s.id] ?? null} onTypeChange={onSlotTypeChange} onEditSource={onEditSource} />)}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TOP, background: topBarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
        {showLogo && logoImage ? <img src={logoImage} style={{ height: 36, objectFit: 'contain' }} alt="logo" />
          : showLogo && logoText ? <span style={{ color: '#fff', fontWeight: 800, fontSize: 20, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{logoText}</span>
            : <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '0.12em' }}>{channelName || 'CHANNEL'}</span>}
      </div>
      <div style={{ position: 'absolute', bottom: HH + TH, left: 0, right: 0, height: HL, background: headlineBarColor, display: 'flex', alignItems: 'center', zIndex: 20, paddingLeft: 16, gap: 14 }}>
        {badgeText && <div style={{ background: badgeColor, color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 14px', borderRadius: 4, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{badgeText}</div>}
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginRight: 16 }}>{headline}</span>
      </div>
      {showHighlight && <div style={{ position: 'absolute', bottom: TH, left: 0, right: 0, height: HH, background: highlightBgColor, display: 'flex', alignItems: 'center', paddingLeft: 16, zIndex: 19 }}><span style={{ color: highlightTextColor, fontSize: 12, fontWeight: 500 }}>{highlightText}</span></div>}
      {showTicker && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: TH, zIndex: 21 }}><TickerPreview text={tickerText} color={tickerColor} bgColor={tickerBgColor} speed={tickerSpeed} containerWidth={width} /></div>}
    </div>
  );
};

// ── UI helpers ────────────────────────────────────────────────────────────────
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ fontSize: 10, fontWeight: 600, color: '#8f99b0', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>{title}</div>
    {children}
  </div>
);
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={{ fontSize: 12, color: '#9aa2b8', display: 'block', marginBottom: 4 }}>{label}</label>
    {children}
  </div>
);
const ColorPicker: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width: 36, height: 36, borderRadius: 8, cursor: 'pointer', border: '1px solid #2e3440', background: '#1e1f2c' }} />
    <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#8f99b0' }}>{value.toUpperCase()}</span>
  </div>
);
const Toggle: React.FC<{ on: boolean; onToggle: () => void }> = ({ on, onToggle }) => (
  <button onClick={onToggle} style={{ width: 40, height: 22, borderRadius: 11, background: on ? '#e74c3c' : '#2e3440', border: 'none', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
    <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
  </button>
);
const inp: React.CSSProperties = { width: '100%', background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 6, padding: '8px 10px', color: '#fff', boxSizing: 'border-box' };

// ── Main ──────────────────────────────────────────────────────────────────────
const OverlayTemplate: React.FC = () => {
  const [config, setConfig] = useState<OverlayConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<'screen'|'layout'|'content'|'sources'|'audio'|'style'>('screen');
  const [savedTemplates, setSavedTemplates] = useState<OverlayConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [errMsg, setErrMsg] = useState<string|null>(null);
  const [slotSources, setSlotSources] = useState<Record<number, SlotMediaSource>>({});
  const [session, setSession] = useState<StreamSession|null>(null);
  const voiceRef = useRef<HTMLInputElement>(null);
  const bgmRef = useRef<HTMLInputElement>(null);
  const [genTTS, setGenTTS] = useState(false);

  const layout = LAYOUTS.find(l => l.id === config.layoutId) || LAYOUTS[0];
  const slotDefs = layout.getSlots(config.width, config.height);
  const slotDefsSimple = slotDefs.map(s => ({ id: s.id, label: s.label }));

  useEffect(() => { setSlotSources(p => syncSlotSources(p, slotDefsSimple, config.slotContents)); }, [config.layoutId, JSON.stringify(config.slotContents)]);
  useEffect(() => { (async () => { setLoading(true); const r = await apiService.getTemplates(); if (r.success && r.data) setSavedTemplates(r.data); setLoading(false); })(); }, []);

  const err = (msg: string, ms = 3000) => { setErrMsg(msg); setTimeout(() => setErrMsg(null), ms); };
  const upd = <K extends keyof OverlayConfig>(k: K, v: OverlayConfig[K]) => setConfig(p => ({ ...p, [k]: v, updatedAt: new Date().toISOString() }));
  const updVO = <K extends keyof VoiceOverConfig>(k: K, v: VoiceOverConfig[K]) => setConfig(p => ({ ...p, voiceOver: { ...p.voiceOver, [k]: v }, updatedAt: new Date().toISOString() }));
  const updBGM = <K extends keyof BackgroundMusicConfig>(k: K, v: BackgroundMusicConfig[K]) => setConfig(p => ({ ...p, backgroundMusic: { ...p.backgroundMusic, [k]: v }, updatedAt: new Date().toISOString() }));
  const handleSlotType = (id: number, t: ContentType) => setConfig(p => ({ ...p, slotContents: { ...p.slotContents, [id]: t }, updatedAt: new Date().toISOString() }));
  const handleSrcChange = (id: number, patch: Partial<SlotMediaSource>) => {
    setSlotSources(p => ({ ...p, [id]: { ...p[id], ...patch } }));
    if (patch.contentType) handleSlotType(id, patch.contentType);
  };
  const handleEditSource = (id: number) => { setActiveTab('sources'); };
  const handleLayoutChange = (lid: LayoutId) => {
    const l = LAYOUTS.find(x => x.id === lid); if (!l) return;
    const sc: SlotContentMap = {}; l.getSlots(100, 100).forEach(s => { sc[s.id] = config.slotContents[s.id] || 'video'; });
    setConfig(p => ({ ...p, layoutId: lid, slotContents: sc, updatedAt: new Date().toISOString() }));
  };
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => upd('logoImage', ev.target?.result as string); r.readAsDataURL(f);
  };
  const handleVOUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return; setLoading(true);
    const r = await apiService.uploadAudio(f, 'voiceover');
    if (r.success && r.data) { updVO('audioUrl', r.data.url); updVO('audioFileName', r.data.filename); updVO('sourceType', 'upload'); updVO('enabled', true); } else err(r.error || 'Upload failed');
    setLoading(false);
  };
  const handleBGMUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return; setLoading(true);
    const r = await apiService.uploadAudio(f, 'bgmusic');
    if (r.success && r.data) { updBGM('audioUrl', r.data.url); updBGM('audioFileName', r.data.filename); updBGM('enabled', true); } else err(r.error || 'Upload failed');
    setLoading(false);
  };
  const handleTTS = async () => {
    const { ttsText, ttsVoice, ttsSpeed, ttsPitch } = config.voiceOver;
    if (!ttsText.trim()) { err('Enter TTS text'); return; } setGenTTS(true);
    const r = await apiService.generateTTS(ttsText, ttsVoice, ttsSpeed, ttsPitch);
    if (r.success && r.data) { updVO('audioUrl', r.data.url); updVO('sourceType', 'text-to-speech'); updVO('enabled', true); } else err(r.error || 'TTS failed');
    setGenTTS(false);
  };
  const handleSave = async () => {
    setSaveStatus('saving');
    const toSave = { ...config, name: config.name || 'Untitled', updatedAt: new Date().toISOString() };
    const r = config._id ? await apiService.updateTemplate(config._id, toSave) : await apiService.createTemplate(toSave);
    if (r.success) { setSaveStatus('saved'); if (r.data) setConfig(r.data as OverlayConfig); const res = await apiService.getTemplates(); if (res.success && res.data) setSavedTemplates(res.data); setTimeout(() => setSaveStatus('idle'), 2000); }
    else { setSaveStatus('error'); err(r.error || 'Save failed'); setTimeout(() => setSaveStatus('idle'), 3000); }
  };
  const handleNew = () => {
    const { _id: _, ...f } = DEFAULT_CONFIG as any;
    setConfig({ ...f, name: `Template ${savedTemplates.length + 1}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    setSlotSources({});
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Delete?')) return;
    const r = await apiService.deleteTemplate(id);
    if (r.success) { const res = await apiService.getTemplates(); if (res.success && res.data) setSavedTemplates(res.data); if (config._id === id) setConfig(DEFAULT_CONFIG); }
    else err(r.error || 'Delete failed');
  };

  const tabs = [
    { id: 'screen' as const, label: 'Screen' }, { id: 'layout' as const, label: 'Layout' },
    { id: 'content' as const, label: 'Content' },
    { id: 'sources' as const, label: 'Sources', dot: Object.values(slotSources).some(s => s.sourceType !== 'none') },
    { id: 'audio' as const, label: 'Audio' }, { id: 'style' as const, label: 'Style' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0c0c14', color: '#eef2ff' }}>
      {/* Toolbar */}
      <div style={{ background: '#11131e', borderBottom: '1px solid #262c38', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e74c3c', animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Overlay Studio Pro</span>
          {session?.status === 'live' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'rgba(231,76,60,.15)', color: '#e74c3c', border: '1px solid #e74c3c' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e74c3c', animation: 'pulse 1s infinite' }} /> STREAMING LIVE
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleNew} style={{ background: '#2a2e3f', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 500, color: '#eef2ff', cursor: 'pointer' }}>+ New</button>
          <select value={config._id || ''} onChange={e => { const t = savedTemplates.find(x => x._id === e.target.value); if (t) { setConfig(t); setActiveTab('screen'); } }} style={{ background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#eef2ff' }}>
            <option value="">{loading ? 'Loading…' : 'Load template…'}</option>
            {savedTemplates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
          <input value={config.name} onChange={e => upd('name', e.target.value)} style={{ background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#eef2ff', width: 180 }} placeholder="Template name" />
          <button onClick={handleSave} disabled={saveStatus === 'saving'} style={{ background: saveStatus === 'saved' ? '#27ae60' : saveStatus === 'error' ? '#c0392b' : '#e74c3c', border: 'none', borderRadius: 8, padding: '6px 18px', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: saveStatus === 'saving' ? 0.7 : 1 }}>
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Failed' : 'Save'}
          </button>
        </div>
      </div>
      {errMsg && <div style={{ background: '#c0392b', color: '#fff', padding: '7px 16px', fontSize: 12, textAlign: 'center' }}>{errMsg}</div>}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: 325, borderRight: '1px solid #262c38', background: '#0f111a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #262c38', flexShrink: 0 }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '9px 0', fontSize: 10, fontWeight: activeTab === tab.id ? 700 : 400, background: 'none', border: 'none', color: activeTab === tab.id ? '#e74c3c' : '#8f99b0', borderBottom: activeTab === tab.id ? '2px solid #e74c3c' : '2px solid transparent', cursor: 'pointer', position: 'relative' }}>
                {tab.label}
                {(tab as any).dot && <span style={{ position: 'absolute', top: 5, right: 3, width: 5, height: 5, borderRadius: '50%', background: '#27ae60' }} />}
              </button>
            ))}
          </div>
          <div style={{ padding: 14, overflow: 'auto', flex: 1 }}>

            {activeTab === 'screen' && (
              <>
                <Section title="Canvas Size">
                  <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                    <Field label="Width"><input type="number" value={config.width} onChange={e => upd('width', +e.target.value)} style={inp} /></Field>
                    <Field label="Height"><input type="number" value={config.height} onChange={e => upd('height', +e.target.value)} style={inp} /></Field>
                  </div>
                  <div style={{ background: '#1a1c28', borderRadius: 7, padding: 8, textAlign: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 11 }}>{(config.width/config.height).toFixed(3)} — {config.width}×{config.height}</span>
                  </div>
                </Section>
                <Section title="Quick Presets">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {SCREEN_PRESETS.map(p => <button key={p.label} onClick={() => { upd('width', p.w); upd('height', p.h); }} style={{ background: '#1e1f2c', border: '1px solid #2e3440', borderRadius: 6, padding: 7, fontSize: 10, cursor: 'pointer', color: '#eef2ff' }}>{p.label}<br/>{p.w}×{p.h}</button>)}
                  </div>
                </Section>
                {savedTemplates.length > 0 && (
                  <Section title="Saved Templates">
                    {savedTemplates.map(t => (
                      <div key={t._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1a1c28', borderRadius: 6, padding: '5px 8px', marginBottom: 5 }}>
                        <button onClick={() => { setConfig(t); setActiveTab('screen'); }} style={{ background: 'none', border: 'none', color: '#c8cfe8', fontSize: 11, cursor: 'pointer', flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</button>
                        <button onClick={() => t._id && handleDelete(t._id)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 13 }}>✕</button>
                      </div>
                    ))}
                  </Section>
                )}
              </>
            )}

            {activeTab === 'layout' && (
              <Section title="Layout Presets">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {LAYOUTS.map(l => (
                    <button key={l.id} onClick={() => handleLayoutChange(l.id)} style={{ padding: '10px 4px', border: config.layoutId === l.id ? '2px solid #e74c3c' : '1px solid #2e3440', borderRadius: 10, background: config.layoutId === l.id ? 'rgba(231,76,60,.1)' : '#1a1c28', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: config.layoutId === l.id ? '#e74c3c' : '#b9c3db' }}>
                      {l.icon}<span style={{ fontSize: 10, fontWeight: 500 }}>{l.label}</span>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {activeTab === 'content' && (
              <>
                <Section title="Header Zone">
                  <Field label="Channel Name"><input value={config.channelName} onChange={e => upd('channelName', e.target.value)} style={inp} /></Field>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <button onClick={() => upd('showLogo', false)} style={{ flex: 1, padding: 5, background: !config.showLogo ? '#e74c3c' : '#1e1f2c', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, cursor: 'pointer' }}>None</button>
                    <button onClick={() => { upd('showLogo', true); upd('logoImage', null); }} style={{ flex: 1, padding: 5, background: config.showLogo && !config.logoImage ? '#e74c3c' : '#1e1f2c', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, cursor: 'pointer' }}>Text</button>
                    <button onClick={() => { upd('showLogo', true); document.getElementById('logoU')?.click(); }} style={{ flex: 1, padding: 5, background: config.showLogo && !!config.logoImage ? '#e74c3c' : '#1e1f2c', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, cursor: 'pointer' }}>Image</button>
                  </div>
                  <input id="logoU" type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                  {config.showLogo && !config.logoImage && <Field label="Logo Text"><input value={config.logoText} onChange={e => upd('logoText', e.target.value)} style={inp} /></Field>}
                  {config.logoImage && <div style={{ display: 'flex', gap: 8, background: '#1e1f2c', padding: 7, borderRadius: 7, alignItems: 'center' }}><img src={config.logoImage} style={{ height: 30 }} alt="logo" /><button onClick={() => upd('logoImage', null)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer' }}>Remove</button></div>}
                </Section>
                <Section title="Headline Bar">
                  <Field label="Headline"><textarea value={config.headline} onChange={e => upd('headline', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} /></Field>
                  <Field label="Badge"><input value={config.badgeText} onChange={e => upd('badgeText', e.target.value)} style={inp} /></Field>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>{BADGE_PRESETS.map(b => <button key={b} onClick={() => upd('badgeText', b)} style={{ padding: '2px 8px', fontSize: 9, background: config.badgeText === b ? '#e74c3c' : '#2a2e3f', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }}>{b}</button>)}</div>
                </Section>
                <Section title="Highlight Bar">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={{ fontSize: 12 }}>Show</span><Toggle on={config.showHighlight} onToggle={() => upd('showHighlight', !config.showHighlight)} /></div>
                  {config.showHighlight && <Field label="Text"><input value={config.highlightText} onChange={e => upd('highlightText', e.target.value)} style={inp} /></Field>}
                </Section>
                <Section title="Ticker">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={{ fontSize: 12 }}>Show</span><Toggle on={config.showTicker} onToggle={() => upd('showTicker', !config.showTicker)} /></div>
                  {config.showTicker && <>
                    <Field label="Text"><textarea value={config.tickerText} onChange={e => upd('tickerText', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} /></Field>
                    <Field label={`Speed: ${config.tickerSpeed} px/s`}><input type="range" min="30" max="200" step="10" value={config.tickerSpeed} onChange={e => upd('tickerSpeed', +e.target.value)} style={{ width: '100%' }} /></Field>
                  </>}
                </Section>
              </>
            )}

            {/* ── SOURCES TAB ── */}
            {activeTab === 'sources' && (
              <SlotMediaManager
                slots={slotDefsSimple}
                slotSources={slotSources}
                onSourceChange={handleSrcChange}
                session={session}
                templateId={config._id ?? null}
                apiBase={API_BASE_URL}
                onSessionChange={setSession}
              />
            )}

            {activeTab === 'audio' && (
              <>
                <Section title="Voice Over">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><span style={{ fontSize: 12 }}>Enable</span><Toggle on={config.voiceOver.enabled} onToggle={() => updVO('enabled', !config.voiceOver.enabled)} /></div>
                  {config.voiceOver.enabled && <>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                      <button onClick={() => updVO('sourceType', 'upload')} style={{ flex: 1, padding: 7, background: config.voiceOver.sourceType === 'upload' ? '#e74c3c' : '#1e1f2c', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer' }}>Upload</button>
                      <button onClick={() => updVO('sourceType', 'text-to-speech')} style={{ flex: 1, padding: 7, background: config.voiceOver.sourceType === 'text-to-speech' ? '#e74c3c' : '#1e1f2c', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer' }}>TTS</button>
                    </div>
                    {config.voiceOver.sourceType === 'upload' && <>
                      <button onClick={() => voiceRef.current?.click()} style={{ width: '100%', padding: 9, background: '#2a2e3f', border: '1px dashed #e74c3c', borderRadius: 7, color: '#eef2ff', fontSize: 11, cursor: 'pointer', marginBottom: 10 }}>📁 Upload MP3/WAV</button>
                      <input ref={voiceRef} type="file" accept="audio/*" onChange={handleVOUpload} style={{ display: 'none' }} />
                      {config.voiceOver.audioFileName && <div style={{ background: '#1e1f2c', padding: 7, borderRadius: 6, marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ fontSize: 11 }}>🎵 {config.voiceOver.audioFileName}</span><button onClick={() => { updVO('audioUrl', null); updVO('audioFileName', null); }} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer' }}>✕</button></div>
                        <AudioPreview url={config.voiceOver.audioUrl} volume={config.voiceOver.volume} />
                      </div>}
                    </>}
                    {config.voiceOver.sourceType === 'text-to-speech' && <>
                      <Field label="TTS Text"><textarea value={config.voiceOver.ttsText} onChange={e => updVO('ttsText', e.target.value)} rows={3} style={{ ...inp, resize: 'vertical', fontSize: 11 }} /></Field>
                      <Field label="Voice"><select value={config.voiceOver.ttsVoice} onChange={e => updVO('ttsVoice', e.target.value)} style={inp}>{TTS_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
                      <Field label={`Speed ${config.voiceOver.ttsSpeed}x`}><input type="range" min="0.5" max="2" step="0.1" value={config.voiceOver.ttsSpeed} onChange={e => updVO('ttsSpeed', +e.target.value)} style={{ width: '100%' }} /></Field>
                      <button onClick={handleTTS} disabled={genTTS} style={{ width: '100%', padding: 9, background: '#e74c3c', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 500, cursor: 'pointer', marginBottom: 10 }}>{genTTS ? 'Generating…' : '🎤 Generate'}</button>
                      {config.voiceOver.audioUrl && <div style={{ background: '#1e1f2c', padding: 7, borderRadius: 6 }}><AudioPreview url={config.voiceOver.audioUrl} volume={config.voiceOver.volume} /></div>}
                    </>}
                    <Field label={`Volume ${Math.round(config.voiceOver.volume * 100)}%`}><input type="range" min="0" max="1" step="0.05" value={config.voiceOver.volume} onChange={e => updVO('volume', +e.target.value)} style={{ width: '100%' }} /></Field>
                  </>}
                </Section>
                <Section title="Background Music">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><span style={{ fontSize: 12 }}>Enable</span><Toggle on={config.backgroundMusic.enabled} onToggle={() => updBGM('enabled', !config.backgroundMusic.enabled)} /></div>
                  {config.backgroundMusic.enabled && <>
                    <button onClick={() => bgmRef.current?.click()} style={{ width: '100%', padding: 9, background: '#2a2e3f', border: '1px dashed #e74c3c', borderRadius: 7, color: '#eef2ff', fontSize: 11, cursor: 'pointer', marginBottom: 10 }}>🎵 Upload Music</button>
                    <input ref={bgmRef} type="file" accept="audio/*" onChange={handleBGMUpload} style={{ display: 'none' }} />
                    {config.backgroundMusic.audioFileName && <div style={{ background: '#1e1f2c', padding: 7, borderRadius: 6, marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ fontSize: 11 }}>🎵 {config.backgroundMusic.audioFileName}</span><button onClick={() => { updBGM('audioUrl', null); updBGM('audioFileName', null); }} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer' }}>✕</button></div>
                      <AudioPreview url={config.backgroundMusic.audioUrl} volume={config.backgroundMusic.volume} />
                    </div>}
                    <Field label={`Volume ${Math.round(config.backgroundMusic.volume * 100)}%`}><input type="range" min="0" max="1" step="0.05" value={config.backgroundMusic.volume} onChange={e => updBGM('volume', +e.target.value)} style={{ width: '100%' }} /></Field>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 12 }}>Loop</span><Toggle on={config.backgroundMusic.loop} onToggle={() => updBGM('loop', !config.backgroundMusic.loop)} /></div>
                  </>}
                </Section>
              </>
            )}

            {activeTab === 'style' && (
              <>
                <Section title="Top Bar"><Field label="Background"><ColorPicker value={config.topBarColor} onChange={v => upd('topBarColor', v)} /></Field></Section>
                <Section title="Headline Bar"><Field label="Background"><ColorPicker value={config.headlineBarColor} onChange={v => upd('headlineBarColor', v)} /></Field><Field label="Badge"><ColorPicker value={config.badgeColor} onChange={v => upd('badgeColor', v)} /></Field></Section>
                <Section title="Highlight"><Field label="Background"><ColorPicker value={config.highlightBgColor} onChange={v => upd('highlightBgColor', v)} /></Field><Field label="Text"><ColorPicker value={config.highlightTextColor} onChange={v => upd('highlightTextColor', v)} /></Field></Section>
                <Section title="Ticker"><Field label="Background"><ColorPicker value={config.tickerBgColor} onChange={v => upd('tickerBgColor', v)} /></Field><Field label="Text"><ColorPicker value={config.tickerColor} onChange={v => upd('tickerColor', v)} /></Field></Section>
                <Section title="Border">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={{ fontSize: 12 }}>Show</span><Toggle on={config.showBorder} onToggle={() => upd('showBorder', !config.showBorder)} /></div>
                  {config.showBorder && <Field label="Color"><ColorPicker value={config.borderColor} onChange={v => upd('borderColor', v)} /></Field>}
                </Section>
              </>
            )}

          </div>
        </div>

        {/* Preview */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', padding: 20, overflow: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 9, color: '#5a627a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>LIVE PREVIEW — {config.width}×{config.height}</div>
            <div style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 130px)', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,.5)', borderRadius: 4 }}>
              <LivePreview config={config} slotSources={slotSources} onSlotTypeChange={handleSlotType} onEditSource={handleEditSource} />
            </div>
            <div style={{ fontSize: 9, color: '#5a627a' }}>Hover a slot → click type or 📂 Source</div>
            {session?.status === 'live' && session.hlsUrl && (
              <div style={{ fontSize: 10, color: '#e74c3c', background: 'rgba(231,76,60,.08)', border: '1px solid #e74c3c33', padding: '4px 12px', borderRadius: 20 }}>
                🔴 {session.hlsUrl}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.2)} }
        input,textarea,select { outline:none; box-sizing:border-box; }
        input:focus,textarea:focus,select:focus { border-color:#e74c3c !important; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#1a1d2a; }
        ::-webkit-scrollbar-thumb { background:#3f4658; border-radius:4px; }
      `}</style>
    </div>
  );
};

export default OverlayTemplate;