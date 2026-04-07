// StreamTab.tsx — HLS Streaming feature for LIVEWIRE Video Platform
// Integrated with nginx-rtmp API endpoints (RTMP:1935, HLS:8080)

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { VideoGallery } from './VideoGallery';
import {
  Panel,
  Tag,
  Pill,
  LiveDot,
  Spinner,
  CopyButton,
  MetricTile,
  StreamStatusBadge
} from './SharedComponent';

// ─── TYPE DEFINITIONS ─────────────────────────────────────────────────────────

interface Stream {
  stream_key: string;
  status: 'live' | 'active' | 'idle' | 'error';
  title?: string;
  viewers?: number;
  name?: string;
  nclients?: number;
  [key: string]: any;
}

interface StreamInfo {
  stream_key: string;
  hls_url: string;
  rtmp_url: string;
}

interface Metrics {
  viewers: number;
  uptime: number;
  segments: number;
  errors: number;
}

interface OverlayConfig {
  channel_name: string;
  headline: string;
  ticker: string;
  badge_text: string;
}

interface LogEntry {
  ts: string;
  msg: string;
  type: 'info' | 'error' | 'success' | 'warn';
}

interface StreamTabProps {
  apiBase?: string;
  liveBase?: string;
  rtmpPort?: number;
  hlsPort?: number;
}

// ─── MAIN STREAM TAB ─────────────────────────────────────────────────────────
export const StreamTab = ({ 
  apiBase = "http://localhost:8000", 
  liveBase = "http://localhost:8080", 
  rtmpPort = 1935, 
  hlsPort = 8080 
}: StreamTabProps) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"watch" | "push">("watch");
  const [streamStatus, setStreamStatus] = useState<"idle" | "connecting" | "live" | "ended" | "error">("idle");
  const [hlsUrl, setHlsUrl] = useState<string>("");
  const [activeHls, setActiveHls] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState<string>("");
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ viewers: 0, uptime: 0, segments: 0, errors: 0 });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [activeStreams, setActiveStreams] = useState<Stream[]>([]);
  const [loadingStreams, setLoadingStreams] = useState<boolean>(false);
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const uptimeRef = useRef<NodeJS.Timeout | null>(null);
  const uptimeSec = useRef<number>(0);

  // Helper: Build HLS URL from stream key
  const getHlsUrl = useCallback((key: string): string => {
    return `${liveBase}/hls/${key}.m3u8`;
  }, [liveBase]);

  // Helper: Build RTMP URL from stream key
  const getRtmpUrl = useCallback((key: string): string => {
    const host = window.location.hostname;
    return `rtmp://${host}:${rtmpPort}/live/${key}`;
  }, [rtmpPort]);

  const addLog = useCallback((msg: string, type: LogEntry['type'] = "info"): void => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLog(prev => [...prev.slice(-59), { ts, msg, type }]);
  }, []);

  // Fetch active streams from nginx-rtmp
  const fetchActiveStreams = useCallback(async (): Promise<void> => {
    setLoadingStreams(true);
    try {
      const response = await fetch(`${apiBase}/stream/active`);
      if (response.ok) {
        const data = await response.json();
        const streams = data.active || data.streams || [];
        const formattedStreams: Stream[] = streams.map((stream: any) => ({
          stream_key: stream.stream_key,
          status: 'live' as const,
          title: stream.title || `Live Stream: ${(stream.stream_key).slice(0, 8)}...`,
          viewers: stream.viewers || stream.nclients || 0,
          ...stream
        }));
        setActiveStreams(formattedStreams);
        addLog(`Found ${formattedStreams.length} active stream(s)`, "success");
      } else {
        addLog(`Failed to fetch active streams: ${response.status}`, "error");
      }
    } catch (error) {
      addLog(`Error fetching streams: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
      setActiveStreams([]);
    }
    setLoadingStreams(false);
  }, [apiBase, addLog]);

  // Generate new stream key
  const generateStreamKey = useCallback(async (): Promise<void> => {
    setIsStarting(true);
    setStreamStatus("connecting");
    try {
      const response = await fetch(`${apiBase}/stream/key`);
      if (response.ok) {
        const data = await response.json();
        const key = data.stream_key || data.key;
        setStreamKey(key);
        
        // Start the stream
        const startResponse = await fetch(`${apiBase}/stream/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            stream_key: key,
            channel_name: "NEWS 24",
            headline: "BREAKING NEWS",
            ticker: "Live stream in progress",
            badge_text: "LIVE"
          })
        });
        
        if (startResponse.ok) {
          setStreamStatus("live");
          const hlsUrl = getHlsUrl(key);
          setActiveHls(hlsUrl);
          setHlsUrl(hlsUrl);
          addLog(`Stream started with key: ${key}`, "success");
          addLog(`HLS URL: ${hlsUrl}`, "success");
          
          // Start uptime counter
          if (uptimeRef.current) clearInterval(uptimeRef.current);
          uptimeSec.current = 0;
          uptimeRef.current = setInterval(() => {
            uptimeSec.current += 1;
            setMetrics(m => ({ ...m, uptime: uptimeSec.current }));
          }, 1000);
          
          // Store stream info
          setStreamInfo({
            stream_key: key,
            hls_url: hlsUrl,
            rtmp_url: getRtmpUrl(key)
          });
          
          // Start polling for stream stats
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = setInterval(async () => {
            try {
              const response = await fetch(`${apiBase}/stream/active`);
              if (response.ok) {
                const data = await response.json();
                const streams = data.streams || data.active_streams || data.active || [];
                const currentStream = streams.find((s: any) => (s.name || s.stream_key) === key);
                if (currentStream) {
                  setMetrics(m => ({
                    ...m,
                    viewers: currentStream.nclients || currentStream.viewers || m.viewers,
                    segments: m.segments + 1,
                  }));
                }
              }
            } catch (error) {
              // Silent fail for polling
            }
          }, 5000);
          
          // Refresh active streams list
          setTimeout(() => fetchActiveStreams(), 1000);
        } else {
          throw new Error(`Failed to start stream: ${startResponse.status}`);
        }
      } else {
        throw new Error(`Failed to generate stream key: ${response.status}`);
      }
    } catch (error) {
      setStreamStatus("error");
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsStarting(false);
    }
  }, [apiBase, addLog, getHlsUrl, getRtmpUrl, fetchActiveStreams]);

  // End current stream
  const endStream = useCallback(async (): Promise<void> => {
    try {
      const streamId = streamInfo?.stream_key;
      if (streamId) {
        const response = await fetch(`${apiBase}/stream/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stream_key: streamId })
        });
        
        if (response.ok) {
          addLog(`Stream ended successfully`, "success");
        } else {
          addLog(`Failed to end stream: ${response.status}`, "error");
        }
      }
    } catch (error) {
      addLog(`Error ending stream: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    }
    
    setStreamStatus("ended");
    setActiveHls(null);
    setStreamKey("");
    setStreamInfo(null);
    
    // Stop uptime counter
    if (uptimeRef.current) {
      clearInterval(uptimeRef.current);
      uptimeRef.current = null;
    }
    
    // Stop polling
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    
    addLog("Stream ended");
    
    // Refresh active streams
    setTimeout(() => fetchActiveStreams(), 500);
  }, [apiBase, streamInfo, addLog, fetchActiveStreams]);

  // Watch stream - Navigate to player page
  const watchStream = useCallback((stream: Stream): void => {
    addLog(`Now playing: ${stream.title || stream.stream_key}`, "success");
    // Navigate to player page with stream_key parameter
    navigate(`/player?stream_key=${stream.stream_key}`);
  }, [navigate, addLog]);

  // Auto-refresh active streams every 10 seconds
  useEffect(() => {
    fetchActiveStreams();
    const interval = setInterval(() => {
      if (streamStatus === "live") {
        fetchActiveStreams();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchActiveStreams, streamStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (uptimeRef.current) clearInterval(uptimeRef.current);
    };
  }, []);

  const isLive = streamStatus === "live";
  const fmtUptime = (s: number): string => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // Add keyframe animations
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse-dot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.2); }
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes slide-up {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>

      {/* ── LEFT COLUMN ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Mode Switcher */}
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", overflow: "hidden" }}>
          {[
            { id: "watch" as const, icon: "📺", label: "Watch Streams" },
            { id: "push" as const, icon: "📡", label: "Go Live (RTMP)" },
          ].map(m => (
            <button 
              key={m.id} 
              onClick={() => !isLive && setMode(m.id)}
              style={{
                flex: 1, 
                padding: "10px 0", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                gap: 8,
                fontFamily: "'Barlow Condensed',sans-serif", 
                fontWeight: 700, 
                fontSize: ".9rem", 
                letterSpacing: 2, 
                textTransform: "uppercase",
                background: mode === m.id ? "var(--accent)" : "var(--bg3)",
                color: mode === m.id ? "#000" : "var(--muted)",
                borderRight: m.id === "watch" ? "1px solid var(--border)" : "none",
                cursor: isLive ? "not-allowed" : "pointer", 
                transition: "all .2s"
              }}
            >
              <span>{m.icon}</span>{m.label}
            </button>
          ))}
        </div>

        {/* WATCH MODE */}
        {mode === "watch" && (
          <Panel 
            title="Live Streams" 
            accent="var(--accent)"
            badge={<Pill color="var(--accent)">{activeStreams.length} active</Pill>}
          >
            <VideoGallery 
              streams={activeStreams}
              onSelectStream={watchStream}
              selectedStream={selectedStream}
              getHlsUrl={getHlsUrl}
            />
            <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
              <button 
                onClick={() => fetchActiveStreams()} 
                disabled={loadingStreams}
                style={{ 
                  flex: 1, 
                  padding: "6px 12px", 
                  background: "var(--bg3)", 
                  color: "var(--accent)",
                  border: "1px solid var(--border)", 
                  borderRadius: "3px", 
                  fontSize: ".7rem",
                  fontFamily: "'Share Tech Mono',monospace", 
                  cursor: "pointer",
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  gap: "5px" 
                }}
              >
                {loadingStreams ? <Spinner size={12} /> : "⟳"} Refresh
              </button>
            </div>
            {activeStreams.length === 0 && !loadingStreams && (
              <div style={{ 
                marginTop: 12, 
                padding: "12px", 
                background: "var(--bg3)", 
                border: "1px solid var(--border)", 
                borderRadius: "3px", 
                textAlign: "center" 
              }}>
                <span style={{ fontSize: ".75rem", color: "var(--muted)" }}>
                  No active streams. Go to "Go Live" tab to start streaming.
                </span>
              </div>
            )}
          </Panel>
        )}

        {/* PUSH MODE - Go Live */}
        {mode === "push" && (
          <Panel 
            title="Go Live (RTMP)" 
            accent="var(--red)"
            badge={<StreamStatusBadge status={streamStatus} />}
          >
            <div style={{ 
              padding: "10px 14px", 
              background: "rgba(255,180,0,.06)", 
              border: "1px solid rgba(255,180,0,.2)", 
              marginBottom: 14 
            }}>
              <p style={{ fontSize: ".75rem", color: "var(--amber)", lineHeight: 1.6 }}>
                Start a live stream using your encoder (OBS, FFmpeg, etc.). 
                Push to the RTMP URL below, and your stream will be available via HLS.
              </p>
            </div>

            {/* Stream Info Display */}
            {!streamKey ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button 
                  onClick={generateStreamKey} 
                  disabled={isStarting}
                  style={{
                    padding: "12px 24px",
                    background: isStarting ? "var(--bg4)" : "var(--red)",
                    color: "#fff",
                    fontFamily: "'Barlow Condensed',sans-serif",
                    fontWeight: 700,
                    fontSize: "1.1rem",
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    border: "none",
                    cursor: isStarting ? "not-allowed" : "pointer",
                    clipPath: "polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)"
                  }}
                >
                  {isStarting ? <><Spinner size={18} color="#fff" /> Generating...</> : "🎥 Generate Stream Key"}
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginTop: 8 }}>
                  <Tag label="STREAM KEY — keep secret" />
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: 8, 
                    marginTop: 6,
                    background: "var(--bg3)", 
                    border: "1px solid var(--amber)", 
                    padding: "8px 12px" 
                  }}>
                    <span style={{ 
                      flex: 1, 
                      fontFamily: "'Share Tech Mono',monospace", 
                      fontSize: ".8rem",
                      color: "var(--amber)", 
                      letterSpacing: 2, 
                      wordBreak: "break-all" 
                    }}>
                      {streamKey}
                    </span>
                    <CopyButton text={streamKey} />
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <Tag label="RTMP Ingest URL" />
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: 8, 
                    marginTop: 6,
                    background: "var(--bg3)", 
                    border: "1px solid var(--border)", 
                    padding: "8px 12px" 
                  }}>
                    <span style={{ 
                      flex: 1, 
                      fontFamily: "'Share Tech Mono',monospace", 
                      fontSize: ".75rem",
                      color: "var(--text)", 
                      wordBreak: "break-all" 
                    }}>
                      {getRtmpUrl(streamKey)}
                    </span>
                    <CopyButton text={getRtmpUrl(streamKey)} />
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <Tag label="HLS Playback URL" />
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: 8, 
                    marginTop: 6,
                    background: "var(--bg3)", 
                    border: "1px solid var(--green)", 
                    padding: "8px 12px" 
                  }}>
                    <span style={{ 
                      flex: 1, 
                      fontFamily: "'Share Tech Mono',monospace", 
                      fontSize: ".75rem",
                      color: "var(--green)", 
                      wordBreak: "break-all" 
                    }}>
                      {getHlsUrl(streamKey)}
                    </span>
                    <CopyButton text={getHlsUrl(streamKey)} />
                  </div>
                </div>

                {/* OBS Setup Instructions */}
                <div style={{ 
                  marginTop: 16, 
                  padding: "12px", 
                  background: "rgba(0,212,255,.04)",
                  border: "1px solid rgba(0,212,255,.15)", 
                  borderRadius: "4px", 
                  fontSize: ".72rem", 
                  color: "var(--muted)", 
                  lineHeight: 1.7 
                }}>
                  <strong style={{ color: "var(--accent)" }}>📺 OBS Studio Setup:</strong><br />
                  1. Settings → Stream<br />
                  2. Service: <strong style={{ color: "var(--text)" }}>Custom...</strong><br />
                  3. Server: <strong style={{ color: "var(--text)", fontFamily: "monospace" }}>{getRtmpUrl(streamKey)}</strong><br />
                  4. Stream Key: <strong style={{ color: "var(--amber)", fontFamily: "monospace" }}>{streamKey}</strong><br />
                  5. Click "Start Streaming"
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button 
                    onClick={endStream}
                    style={{ 
                      flex: 1, 
                      padding: "10px 0", 
                      background: "var(--bg4)", 
                      color: "var(--red)",
                      border: "1px solid var(--red)", 
                      fontFamily: "'Barlow Condensed',sans-serif",
                      fontWeight: 700, 
                      fontSize: "1rem", 
                      letterSpacing: 3, 
                      textTransform: "uppercase",
                      cursor: "pointer" 
                    }}
                  >
                    ⬛ End Stream
                  </button>
                </div>
              </>
            )}
          </Panel>
        )}
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Metrics Panel */}
        <Panel 
          title="Stream Metrics" 
          accent="var(--green)"
          badge={isLive ? <Pill color="var(--red)"><LiveDot />LIVE</Pill> : null}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <MetricTile label="UPTIME" value={fmtUptime(metrics.uptime)} accent="var(--green)" />
            <MetricTile label="VIEWERS" value={metrics.viewers} accent="var(--accent)" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <MetricTile label="ACTIVE" value={activeStreams.length} accent="var(--amber)" />
            <MetricTile 
              label="ERRORS" 
              value={metrics.errors} 
              accent={metrics.errors > 0 ? "var(--red)" : "var(--muted)"}
            />
          </div>
        </Panel>

        {/* Server Info Panel */}
        <Panel title="Server Info" accent="var(--amber)">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <Tag label="RTMP Port" />
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".85rem", color: "var(--accent)", marginTop: 4 }}>
                :{rtmpPort}
              </div>
            </div>
            <div>
              <Tag label="HLS Port" />
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".85rem", color: "var(--accent)", marginTop: 4 }}>
                :{hlsPort}
              </div>
            </div>
            <div>
              <Tag label="API Base" />
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem", color: "var(--muted)", marginTop: 4, wordBreak: "break-all" }}>
                {apiBase}
              </div>
            </div>
          </div>
        </Panel>

        {/* Event Log */}
        <Panel 
          title="Event Log" 
          accent="var(--muted)"
          badge={<span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".65rem", color: "var(--muted)" }}>{log.length} events</span>}
        >
          <div style={{ height: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
            {log.length === 0 ? (
              <span style={{ color: "var(--muted)", fontSize: ".72rem", fontFamily: "'Share Tech Mono',monospace" }}>
                No events yet…
              </span>
            ) : (
              [...log].reverse().map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".63rem", color: "var(--muted)", flexShrink: 0 }}>
                    {entry.ts}
                  </span>
                  <span style={{ 
                    fontFamily: "'Share Tech Mono',monospace", 
                    fontSize: ".7rem",
                    color: entry.type === "error" ? "var(--red)" : 
                           entry.type === "success" ? "var(--green)" : 
                           entry.type === "warn" ? "var(--amber)" : "var(--text)",
                    lineHeight: 1.4 
                  }}>
                    {entry.type === "error" ? "✗ " : 
                     entry.type === "success" ? "✓ " : 
                     entry.type === "warn" ? "⚠ " : "· "}
                    {entry.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default StreamTab;