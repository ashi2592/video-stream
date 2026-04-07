import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ContentType, MediaSourceType, SlotDefinition, SlotMediaManagerProps, SlotMediaSource, StreamSession } from '../types';

// ============================================================
// Types
// ============================================================

// ============================================================
// Constants
// ============================================================
const MEDIA_SOURCE_TYPES: { id: MediaSourceType; label: string; icon: string; hint: string }[] = [
  { id: 'none',   label: 'None',     icon: '○',  hint: 'No source assigned' },
  { id: 'file',   label: 'Upload',   icon: '⬆',  hint: 'Upload a local video or image file' },
  { id: 'path',   label: 'Path',     icon: '📂', hint: 'Server-side file path' },
  { id: 'rtmp',   label: 'RTMP',     icon: '📡', hint: 'rtmp://host/app/key' },
  { id: 'hls',    label: 'HLS',      icon: '📺', hint: 'http://…/index.m3u8' },
  { id: 'webcam', label: 'Webcam',   icon: '🎥', hint: '/dev/video0 or device index' },
];

const inputCss: React.CSSProperties = {
  width: '100%', background: '#141520', border: '1px solid #2a2d3e',
  borderRadius: 6, padding: '7px 10px', color: '#e2e6f3', fontSize: 12,
  boxSizing: 'border-box',
};

const btnCss = (active?: boolean, danger?: boolean): React.CSSProperties => ({
  background: danger ? '#7f1d1d' : active ? '#e74c3c' : '#1e2030',
  border: `1px solid ${danger ? '#ef4444' : active ? '#e74c3c' : '#2a2d3e'}`,
  borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 600,
  color: danger ? '#fca5a5' : active ? '#fff' : '#9aa3be',
  cursor: 'pointer', transition: 'all 0.15s',
});

// ============================================================
// Mini video preview (uses browser MediaSource or img tag)
// ============================================================
const SlotPreviewThumb: React.FC<{ source: SlotMediaSource }> = ({ source }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    const el = videoRef.current;
    if (source.fileUrl && source.contentType === 'video') {
      el.src = source.fileUrl;
      el.load();
    } else if (source.streamUrl && (source.sourceType === 'hls')) {
      // Basic HLS preview — requires hls.js in production; here just set src
      el.src = source.streamUrl;
    }
  }, [source.fileUrl, source.streamUrl, source.contentType, source.sourceType]);

  const thumb: React.CSSProperties = {
    width: 80, height: 50, borderRadius: 4, objectFit: 'cover',
    background: '#0a0c15', border: '1px solid #2a2d3e', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  if (source.contentType === 'image' && source.fileUrl) {
    return <img src={source.fileUrl} style={thumb} alt="slot" />;
  }
  if ((source.contentType === 'video' && source.fileUrl) || source.streamUrl) {
    return (
      <video
        ref={videoRef}
        style={thumb}
        muted autoPlay loop playsInline
      />
    );
  }
  const icons: Record<ContentType, string> = {
    video: '▶', image: '⬜', text: 'T', carousel: '⊞', livestream: '◉',
  };
  return (
    <div style={{ ...thumb, fontSize: 20, color: '#3a3f58' }}>
      {icons[source.contentType] ?? '○'}
    </div>
  );
};

// ============================================================
// Single slot source editor
// ============================================================
const SlotSourceEditor: React.FC<{
  source: SlotMediaSource;
  onChange: (patch: Partial<SlotMediaSource>) => void;
  apiBase: string;
}> = ({ source, onChange, apiBase }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    // Prefer XHR for progress tracking
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append('file', file);
    fd.append('slot_id', String(source.slotId));
    fd.append('media_type', isVideo ? 'video' : isImage ? 'image' : 'other');

    xhr.upload.onprogress = e => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        onChange({
          sourceType: 'file',
          fileUrl: res.url ?? URL.createObjectURL(file),
          fileName: file.name,
          filePath: res.path ?? null,
          contentType: isVideo ? 'video' : isImage ? 'image' : source.contentType,
        });
      }
    };
    xhr.onerror = () => { setUploading(false); };

    xhr.open('POST', `${apiBase}/upload/media`);
    xhr.send(fd);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [source.slotId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Source type selector */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {MEDIA_SOURCE_TYPES.map(t => (
          <button
            key={t.id}
            title={t.hint}
            onClick={() => onChange({ sourceType: t.id })}
            style={{
              ...btnCss(source.sourceType === t.id),
              padding: '4px 10px', fontSize: 10,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ fontSize: 11 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── File upload ── */}
      {source.sourceType === 'file' && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => !uploading && fileRef.current?.click()}
          style={{
            border: '1px dashed #e74c3c', borderRadius: 8, padding: 16,
            textAlign: 'center', cursor: 'pointer', position: 'relative',
            background: uploading ? 'rgba(231,76,60,0.05)' : '#0e1020',
            transition: 'background 0.2s',
          }}
        >
          {uploading ? (
            <>
              <div style={{ fontSize: 11, color: '#8f99b0', marginBottom: 6 }}>Uploading… {uploadProgress}%</div>
              <div style={{ height: 4, background: '#1e2030', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#e74c3c', transition: 'width 0.2s' }} />
              </div>
            </>
          ) : source.fileName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SlotPreviewThumb source={source} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 11, color: '#c8cfe8', fontWeight: 500 }}>{source.fileName}</div>
                <div style={{ fontSize: 10, color: '#5a627a', marginTop: 2 }}>Click to replace</div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onChange({ fileUrl: null, fileName: null, filePath: null }); }}
                style={{ ...btnCss(false, true), padding: '3px 8px' }}
              >✕</button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 22, marginBottom: 6 }}>⬆</div>
              <div style={{ fontSize: 11, color: '#8f99b0' }}>Drop video / image or click to browse</div>
              <div style={{ fontSize: 10, color: '#3a3f58', marginTop: 4 }}>MP4 • MOV • MKV • WEBM • JPG • PNG • GIF</div>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="video/*,image/*"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
          />
        </div>
      )}

      {/* ── Server path ── */}
      {source.sourceType === 'path' && (
        <div>
          <div style={{ fontSize: 10, color: '#5a627a', marginBottom: 4 }}>Absolute server path</div>
          <input
            style={inputCss}
            placeholder="/media/videos/clip.mp4  or  /dev/video0"
            value={source.filePath ?? ''}
            onChange={e => onChange({ filePath: e.target.value, fileName: e.target.value.split('/').pop() ?? null })}
          />
          <div style={{ fontSize: 10, color: '#3a3f58', marginTop: 4 }}>
            Use /dev/video0 for a local webcam via path mode
          </div>
        </div>
      )}

      {/* ── RTMP URL ── */}
      {source.sourceType === 'rtmp' && (
        <div>
          <div style={{ fontSize: 10, color: '#5a627a', marginBottom: 4 }}>RTMP stream URL</div>
          <input
            style={inputCss}
            placeholder="rtmp://localhost:1935/live/stream_key"
            value={source.streamUrl ?? ''}
            onChange={e => onChange({ streamUrl: e.target.value })}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#5a627a', marginBottom: 4 }}>Stream key (optional shorthand)</div>
              <input
                style={inputCss}
                placeholder="my_stream_key"
                value={source.streamKey ?? ''}
                onChange={e => onChange({ streamKey: e.target.value, streamUrl: `rtmp://localhost:1935/live/${e.target.value}` })}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── HLS URL ── */}
      {source.sourceType === 'hls' && (
        <div>
          <div style={{ fontSize: 10, color: '#5a627a', marginBottom: 4 }}>HLS playlist URL</div>
          <input
            style={inputCss}
            placeholder="http://localhost:8080/live/stream_key/index.m3u8"
            value={source.streamUrl ?? ''}
            onChange={e => onChange({ streamUrl: e.target.value })}
          />
        </div>
      )}

      {/* ── Webcam ── */}
      {source.sourceType === 'webcam' && (
        <div>
          <div style={{ fontSize: 10, color: '#5a627a', marginBottom: 4 }}>Device path or index</div>
          <input
            style={inputCss}
            placeholder="/dev/video0  or  0  (for device index)"
            value={source.filePath ?? ''}
            onChange={e => onChange({ filePath: e.target.value })}
          />
          <div style={{ fontSize: 10, color: '#3a3f58', marginTop: 4 }}>
            Linux: /dev/video0 • macOS: default • Windows: 0
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Stream control panel
// ============================================================
const StreamControlPanel: React.FC<{
  session: StreamSession | null;
  templateId: string | null;
  slotSources: Record<number, SlotMediaSource>;
  slots: SlotDefinition[];
  apiBase: string;
  onSessionChange: (s: StreamSession | null) => void;
}> = ({ session, templateId, slotSources, slots, apiBase, onSessionChange }) => {
  const [customKey, setCustomKey] = useState('');
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyInfo, setKeyInfo] = useState<any>(null);

  const generateKey = async () => {
    try {
      const res = await fetch(`${apiBase}/stream/key`);
      const data = await res.json();
      setGeneratedKey(data.stream_key);
      setKeyInfo(data);
      setCustomKey(data.stream_key);
    } catch {
      // silently fail
    }
  };

  const startStream = async () => {
    const key = customKey.trim();
    if (!key) return;
    setStarting(true);

    // Build slot sources payload
    const sources = Object.fromEntries(
      Object.entries(slotSources).map(([slotId, src]) => [slotId, {
        slot_id: Number(slotId),
        content_type: src.contentType,
        source_type: src.sourceType,
        file_path: src.filePath,
        stream_url: src.streamUrl,
        stream_key: src.streamKey,
      }])
    );

    try {
      const res = await fetch(`${apiBase}/stream/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream_key: key,
          template_id: templateId,
          slot_sources: sources,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onSessionChange({
          streamKey: key,
          status: 'live',
          hlsUrl: data.hls_url,
          templateId,
          templateName: data.template,
          startedAt: new Date().toISOString(),
          pid: data.pid,
          error: null,
        });
      } else {
        const err = await res.json().catch(() => ({}));
        onSessionChange({
          streamKey: key, status: 'error', hlsUrl: null,
          templateId, templateName: null, startedAt: null, pid: null,
          error: err.detail ?? 'Failed to start stream',
        });
      }
    } catch (e: any) {
      onSessionChange({
        streamKey: key, status: 'error', hlsUrl: null,
        templateId, templateName: null, startedAt: null, pid: null,
        error: e.message,
      });
    }
    setStarting(false);
  };

  const stopStream = async () => {
    if (!session?.streamKey) return;
    setStopping(true);
    try {
      await fetch(`${apiBase}/stream/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_key: session.streamKey }),
      });
    } catch { /* ignore */ }
    onSessionChange(null);
    setStopping(false);
  };

  const isLive = session?.status === 'live';

  return (
    <div style={{ padding: '14px 16px', background: '#0b0d18', borderRadius: 10, border: '1px solid #1e2030' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#5a627a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        Stream Control
      </div>

      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
          background: isLive ? 'rgba(231,76,60,0.15)' : session?.status === 'error' ? 'rgba(239,68,68,0.1)' : '#141520',
          color: isLive ? '#e74c3c' : session?.status === 'error' ? '#ef4444' : '#5a627a',
          border: `1px solid ${isLive ? '#e74c3c' : session?.status === 'error' ? '#ef4444' : '#2a2d3e'}`,
        }}>
          {isLive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e74c3c', animation: 'pulse 1s infinite' }} />}
          {isLive ? 'LIVE' : session?.status === 'error' ? 'ERROR' : session?.status === 'connecting' ? 'CONNECTING…' : 'IDLE'}
        </span>
        {isLive && session?.startedAt && (
          <span style={{ fontSize: 10, color: '#5a627a' }}>
            since {new Date(session.startedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {session?.error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid #7f1d1d', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#fca5a5', marginBottom: 12 }}>
          {session.error}
        </div>
      )}

      {/* Key row */}
      {!isLive && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#5a627a', marginBottom: 4 }}>Stream key</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              style={{ ...inputCss, flex: 1, fontFamily: 'monospace' }}
              placeholder="Enter or generate a key…"
              value={customKey}
              onChange={e => setCustomKey(e.target.value)}
            />
            <button onClick={generateKey} style={{ ...btnCss(), padding: '6px 10px', fontSize: 10, whiteSpace: 'nowrap' }}>
              Generate
            </button>
          </div>
        </div>
      )}

      {isLive && session?.streamKey && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#5a627a', marginBottom: 3 }}>Stream key</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#c8cfe8', background: '#141520', padding: '5px 8px', borderRadius: 5, userSelect: 'all' }}>
            {session.streamKey}
          </div>
          {session.hlsUrl && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10, color: '#5a627a', marginBottom: 3 }}>HLS Playback URL</div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#8f99b0', background: '#141520', padding: '5px 8px', borderRadius: 5, wordBreak: 'break-all', userSelect: 'all' }}>
                {session.hlsUrl}
              </div>
            </div>
          )}
        </div>
      )}

      {/* OBS hint */}
      {keyInfo && !isLive && (
        <div style={{ background: '#0e1020', borderRadius: 6, padding: '8px 10px', marginBottom: 10, fontSize: 10, color: '#5a627a' }}>
          <div style={{ color: '#8f99b0', marginBottom: 3, fontWeight: 600 }}>OBS Settings</div>
          <div>Server: <span style={{ color: '#c8cfe8', fontFamily: 'monospace' }}>rtmp://localhost:1935/live</span></div>
          <div style={{ marginTop: 2 }}>Key: <span style={{ color: '#c8cfe8', fontFamily: 'monospace' }}>{keyInfo.stream_key}</span></div>
        </div>
      )}

      {/* Start / Stop */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!isLive ? (
          <button
            onClick={startStream}
            disabled={starting || !customKey.trim()}
            style={{
              flex: 1, padding: '9px', border: 'none', borderRadius: 7,
              background: starting || !customKey.trim() ? '#2a2d3e' : 'linear-gradient(135deg, #e74c3c, #c0392b)',
              color: starting || !customKey.trim() ? '#5a627a' : '#fff',
              fontWeight: 700, fontSize: 12, cursor: starting || !customKey.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {starting ? 'Starting…' : '▶ Go Live'}
          </button>
        ) : (
          <button
            onClick={stopStream}
            disabled={stopping}
            style={{
              flex: 1, padding: '9px', border: '1px solid #7f1d1d', borderRadius: 7,
              background: '#1a0a0a', color: '#fca5a5',
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}
          >
            {stopping ? 'Stopping…' : '⏹ Stop Stream'}
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Main SlotMediaManager
// ============================================================
const SlotMediaManager: React.FC<SlotMediaManagerProps> = ({
  slots,
  slotSources,
  onSourceChange,
  session,
  templateId,
  apiBase,
  onSessionChange,
}) => {
  const [activeSlot, setActiveSlot] = useState<number>(slots[0]?.id ?? 0);
  const activeSource = slotSources[activeSlot];

  // Auto-switch to new slot if layout changes
  useEffect(() => {
    if (!slots.find(s => s.id === activeSlot) && slots.length > 0) {
      setActiveSlot(slots[0].id);
    }
  }, [slots, activeSlot]);

  if (slots.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Slot tabs */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#5a627a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          Slot Sources
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {slots.map(slot => {
            const src = slotSources[slot.id];
            const hasSource = src && src.sourceType !== 'none';
            return (
              <button
                key={slot.id}
                onClick={() => setActiveSlot(slot.id)}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${activeSlot === slot.id ? '#e74c3c' : '#2a2d3e'}`,
                  background: activeSlot === slot.id ? 'rgba(231,76,60,0.12)' : '#141520',
                  color: activeSlot === slot.id ? '#e74c3c' : '#9aa3be',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {hasSource && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#27ae60' }} />
                )}
                {slot.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active slot editor */}
      {activeSource && (
        <div style={{ background: '#0e1020', borderRadius: 10, padding: '12px 14px', border: '1px solid #1e2030' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#c8cfe8' }}>
              Slot {activeSource.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SlotPreviewThumb source={activeSource} />
            </div>
          </div>
          <SlotSourceEditor
            source={activeSource}
            onChange={patch => onSourceChange(activeSlot, patch)}
            apiBase={apiBase}
          />
        </div>
      )}

      {/* Summary of all slots */}
      {slots.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, color: '#5a627a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>All Slots</div>
          {slots.map(slot => {
            const src = slotSources[slot.id];
            const hasSource = src && src.sourceType !== 'none';
            const typeIcon = MEDIA_SOURCE_TYPES.find(t => t.id === src?.sourceType)?.icon ?? '○';
            return (
              <div
                key={slot.id}
                onClick={() => setActiveSlot(slot.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#0b0d18', borderRadius: 6, padding: '6px 10px',
                  border: `1px solid ${activeSlot === slot.id ? '#e74c3c33' : '#1e2030'}`,
                  cursor: 'pointer',
                }}
              >
                <SlotPreviewThumb source={src} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#c8cfe8' }}>{slot.label}</div>
                  <div style={{ fontSize: 10, color: '#5a627a', marginTop: 1 }}>
                    {hasSource
                      ? `${typeIcon} ${src.fileName ?? src.streamUrl ?? src.filePath ?? src.sourceType}`
                      : 'No source'}
                  </div>
                </div>
                {hasSource && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#27ae60', background: 'rgba(39,174,96,0.12)', padding: '2px 6px', borderRadius: 4 }}>
                    READY
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: '#1e2030' }} />

      {/* Stream control */}
      <StreamControlPanel
        session={session}
        templateId={templateId}
        slotSources={slotSources}
        slots={slots}
        apiBase={apiBase}
        onSessionChange={onSessionChange}
      />
    </div>
  );
};

export default SlotMediaManager;