// StreamTab.jsx — HLS Streaming feature for LIVEWIRE Video Platform
// Drop-in replacement for the missing StreamTab component
// Matches the existing design system: Barlow Condensed / Share Tech Mono, CSS vars

import { useState, useRef, useEffect, useCallback } from "react";

// ─── RE-EXPORT SHARED PRIMITIVES (copy from App.jsx if needed) ───────────────
// If these are already exported from App.jsx, import them instead.

function Pill({ color = "#00d4ff", children }) {
  return (
    <span style={{
      display:"inline-flex",alignItems:"center",gap:5,
      background:`${color}18`,border:`1px solid ${color}40`,
      color,padding:"2px 10px",fontSize:".68rem",fontFamily:"'Share Tech Mono',monospace",
      letterSpacing:1,textTransform:"uppercase",
      clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)"
    }}>{children}</span>
  );
}

function LiveDot({ color = "#ff3c5f" }) {
  return <span style={{
    width:7,height:7,borderRadius:"50%",background:color,
    display:"inline-block",animation:"pulse-dot 1.2s ease infinite",flexShrink:0
  }}/>;
}

function Spinner({ size = 18, color = "var(--accent)" }) {
  return <span style={{
    width:size,height:size,border:`2px solid ${color}30`,
    borderTop:`2px solid ${color}`,borderRadius:"50%",
    display:"inline-block",animation:"spin .8s linear infinite",flexShrink:0
  }}/>;
}

function Tag({ label, color = "var(--muted)" }) {
  return <span style={{ fontSize:".65rem",fontFamily:"'Share Tech Mono',monospace",color,letterSpacing:1,textTransform:"uppercase" }}>{label}</span>;
}

function Panel({ title, badge, children, accent = "var(--accent)", style={} }) {
  return (
    <div style={{
      background:"var(--bg2)",border:"1px solid var(--border)",
      borderTop:`2px solid ${accent}`,display:"flex",flexDirection:"column",
      animation:"slide-up .35s ease both", ...style
    }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderBottom:"1px solid var(--border)" }}>
        <span style={{ fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:2,textTransform:"uppercase",color:"var(--white)" }}>{title}</span>
        {badge}
      </div>
      <div style={{ padding:16,flex:1 }}>{children}</div>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),1800); }}
      style={{ color: copied ? "var(--green)" : "var(--muted)", padding:"3px 8px", transition:"color .2s",
        display:"flex",alignItems:"center",gap:4,fontSize:".7rem",fontFamily:"'Share Tech Mono',monospace",
        border:"1px solid var(--border)",background:"var(--bg3)" }}
    >
      {copied ? "✓ Copied" : "⧉ Copy"}
    </button>
  );
}

// ─── HLS PLAYER ──────────────────────────────────────────────────────────────
// Lightweight HLS player using hls.js (loaded via CDN script tag)
function HLSPlayer({ src, style = {} }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);
  const [hlsReady, setHlsReady] = useState(false);
  const [error,    setError]    = useState(null);
  const [stats,    setStats]    = useState({ level: -1, levels: [], latency: null, bitrate: 0 });

  // Load hls.js from CDN if not already present
  useEffect(() => {
    if (window.Hls) { setHlsReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js";
    script.onload = () => setHlsReady(true);
    script.onerror = () => setError("Failed to load HLS library");
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!hlsReady || !src || !videoRef.current) return;
    setError(null);

    // Native HLS support (Safari)
    if (!window.Hls.isSupported() && videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      videoRef.current.src = src;
      return;
    }

    if (!window.Hls.isSupported()) {
      setError("HLS is not supported in this browser.");
      return;
    }

    const hls = new window.Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
    });
    hlsRef.current = hls;

    hls.loadSource(src);
    hls.attachMedia(videoRef.current);

    hls.on(window.Hls.Events.MANIFEST_PARSED, (_, data) => {
      setStats(s => ({ ...s, levels: data.levels, level: hls.currentLevel }));
      videoRef.current?.play().catch(() => {});
    });

    hls.on(window.Hls.Events.LEVEL_SWITCHED, (_, data) => {
      const bw = hls.levels[data.level]?.bitrate || 0;
      setStats(s => ({ ...s, level: data.level, bitrate: bw }));
    });

    hls.on(window.Hls.Events.FRAG_LOADED, (_, data) => {
      setStats(s => ({ ...s, latency: Math.round(data.frag.stats.loading.end - data.frag.stats.loading.start) }));
    });

    hls.on(window.Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          setError(`HLS fatal error: ${data.details}`);
          hls.destroy();
        }
      }
    });

    return () => { hls.destroy(); hlsRef.current = null; };
  }, [hlsReady, src]);

  const setLevel = (lvl) => {
    if (hlsRef.current) { hlsRef.current.currentLevel = lvl; setStats(s => ({...s, level: lvl})); }
  };

  return (
    <div style={{ position:"relative", background:"#000", ...style }}>
      <video ref={videoRef} controls muted playsInline
        style={{ width:"100%", height:"100%", objectFit:"contain", display:"block" }}/>

      {/* HLS Quality overlay */}
      {stats.levels.length > 1 && (
        <div style={{ position:"absolute", top:8, right:8, display:"flex", gap:4, flexWrap:"wrap", justifyContent:"flex-end" }}>
          <button onClick={() => setLevel(-1)}
            style={{ padding:"2px 8px", fontFamily:"'Share Tech Mono',monospace", fontSize:".62rem",
              background: stats.level === -1 ? "var(--accent)" : "rgba(0,0,0,.7)",
              color: stats.level === -1 ? "#000" : "var(--accent)",
              border:"1px solid var(--accent)", cursor:"pointer" }}>AUTO
          </button>
          {stats.levels.map((l, i) => (
            <button key={i} onClick={() => setLevel(i)}
              style={{ padding:"2px 8px", fontFamily:"'Share Tech Mono',monospace", fontSize:".62rem",
                background: stats.level === i ? "var(--accent)" : "rgba(0,0,0,.7)",
                color: stats.level === i ? "#000" : "var(--muted)",
                border:"1px solid var(--border)", cursor:"pointer" }}>
              {l.height ? `${l.height}p` : `L${i}`}
            </button>
          ))}
        </div>
      )}

      {/* Stats bar */}
      {(stats.bitrate > 0 || stats.latency !== null) && (
        <div style={{ position:"absolute", bottom:0, left:0, right:0,
          background:"linear-gradient(transparent,rgba(0,0,0,.8))", padding:"16px 10px 6px",
          display:"flex", gap:16, pointerEvents:"none" }}>
          {stats.bitrate > 0 && (
            <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".62rem", color:"var(--accent)" }}>
              ↑ {(stats.bitrate / 1000).toFixed(0)} kbps
            </span>
          )}
          {stats.latency !== null && (
            <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".62rem", color:"var(--green)" }}>
              ⏱ {stats.latency}ms
            </span>
          )}
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
          background:"rgba(0,0,0,.85)", flexDirection:"column", gap:8 }}>
          <span style={{ fontSize:"1.5rem" }}>⚠</span>
          <span style={{ color:"var(--red)", fontFamily:"'Share Tech Mono',monospace", fontSize:".75rem", textAlign:"center", padding:"0 16px" }}>{error}</span>
        </div>
      )}
    </div>
  );
}

// ─── STREAM STATUS BADGE ─────────────────────────────────────────────────────
function StreamStatusBadge({ status }) {
  const cfg = {
    idle:       { color:"var(--muted)",   label:"OFFLINE"  },
    connecting: { color:"var(--amber)",   label:"CONNECTING" },
    live:       { color:"var(--red)",     label:"LIVE"     },
    ended:      { color:"var(--muted)",   label:"ENDED"    },
    error:      { color:"var(--red)",     label:"ERROR"    },
  }[status] || { color:"var(--muted)", label:"—" };
  return (
    <Pill color={cfg.color}>
      {status === "live" && <LiveDot color={cfg.color}/>}
      {cfg.label}
    </Pill>
  );
}

// ─── METRIC TILE ─────────────────────────────────────────────────────────────
function MetricTile({ label, value, unit, accent = "var(--accent)" }) {
  return (
    <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", padding:"10px 14px", flex:1 }}>
      <Tag label={label}/>
      <div style={{ marginTop:4, display:"flex", alignItems:"baseline", gap:4 }}>
        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:"1.5rem", color: accent }}>{value}</span>
        {unit && <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".65rem", color:"var(--muted)" }}>{unit}</span>}
      </div>
    </div>
  );
}

// ─── MAIN STREAM TAB ─────────────────────────────────────────────────────────
export function StreamTab({ apiBase }) {
  // ── State ────────────────────────────────────────────────────────────────
  const [mode,         setMode]         = useState("watch");   // "watch" | "push"
  const [streamStatus, setStreamStatus] = useState("idle");    // idle | connecting | live | ended | error
  const [hlsUrl,       setHlsUrl]       = useState("");
  const [activeHls,    setActiveHls]    = useState(null);      // confirmed playing URL
  const [streamKey,    setStreamKey]    = useState("");
  const [serverUrl,    setServerUrl]    = useState("rtmp://your-server/live");
  const [streamInfo,   setStreamInfo]   = useState(null);
  const [metrics,      setMetrics]      = useState({ viewers: 0, uptime: 0, segments: 0, errors: 0 });
  const [log,          setLog]          = useState([]);
  const [overlay,      setOverlay]      = useState({ channel_name:"NEWS 24", headline:"BREAKING NEWS", ticker:"Live stream in progress", badge_text:"LIVE" });
  const [pushActive,   setPushActive]   = useState(false);
  const [apiStreams,   setApiStreams]    = useState([]);
  const [loadingStreams, setLoadingStreams] = useState(false);

  const pollRef   = useRef(null);
  const uptimeRef = useRef(null);
  const uptimeSec = useRef(0);

  // ── Logging ──────────────────────────────────────────────────────────────
  const addLog = useCallback((msg, type = "info") => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12:false });
    setLog(prev => [...prev.slice(-59), { ts, msg, type }]);
  }, []);

  // ── Load streams from API ─────────────────────────────────────────────────
  const fetchStreams = useCallback(async () => {
    setLoadingStreams(true);
    try {
      const r = await fetch(`${apiBase}/streams`);
      if (r.ok) {
        const d = await r.json();
        setApiStreams(Array.isArray(d) ? d : d.streams || []);
        addLog(`Fetched ${(Array.isArray(d) ? d : d.streams || []).length} stream(s) from API`);
      }
    } catch(e) {
      addLog(`Could not load streams: ${e.message}`, "error");
    }
    setLoadingStreams(false);
  }, [apiBase, addLog]);

  // ── Create HLS stream via API ─────────────────────────────────────────────
  const createStream = useCallback(async () => {
    setStreamStatus("connecting");
    addLog("Creating HLS stream via API…");
    try {
      const r = await fetch(`${apiBase}/streams/create`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ ...overlay, enabled: true }),
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const d = await r.json();
      setStreamInfo(d);
      const hls = d.hls_url || d.playback_url || d.url;
      if (hls) {
        setActiveHls(hls);
        setHlsUrl(hls);
      }
      setStreamStatus("live");
      addLog(`Stream created · ID: ${d.stream_id || d.id}`, "success");
      addLog(`HLS endpoint: ${hls || "—"}`, "success");
      startUptime();
      startPoll(d.stream_id || d.id);
    } catch(e) {
      setStreamStatus("error");
      addLog(`Failed to create stream: ${e.message}`, "error");
    }
  }, [apiBase, overlay, addLog]);

  // ── Watch a manual HLS URL ────────────────────────────────────────────────
  const watchUrl = () => {
    if (!hlsUrl.trim()) return;
    setActiveHls(hlsUrl.trim());
    setStreamStatus("live");
    addLog(`Watching HLS stream: ${hlsUrl.trim()}`, "success");
    startUptime();
  };

  const stopWatching = () => {
    setActiveHls(null);
    setStreamStatus("idle");
    stopUptime();
    addLog("Stream stopped");
  };

  // ── Create RTMP push stream ───────────────────────────────────────────────
  const createPushStream = useCallback(async () => {
    setPushActive(true);
    addLog("Registering RTMP push endpoint…");
    try {
      const r = await fetch(`${apiBase}/streams/push`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ ...overlay, server_url: serverUrl }),
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const d = await r.json();
      setStreamInfo(d);
      const key = d.stream_key || d.key || d.push_key || crypto.randomUUID().slice(0,16);
      setStreamKey(key);
      const hls = d.hls_url || d.playback_url;
      if (hls) { setActiveHls(hls); setHlsUrl(hls); }
      setStreamStatus("live");
      addLog(`RTMP endpoint ready · key: ${key}`, "success");
      startUptime();
    } catch(e) {
      addLog(`Push setup failed: ${e.message}`, "error");
      // Demo mode — generate a key locally for UI preview
      const demoKey = `livewire-${Math.random().toString(36).slice(2,10)}`;
      setStreamKey(demoKey);
      addLog(`Demo mode — stream key generated: ${demoKey}`, "warn");
    }
    setPushActive(false);
  }, [apiBase, overlay, serverUrl, addLog]);

  // ── Polling for stream stats ──────────────────────────────────────────────
  const startPoll = (id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${apiBase}/streams/${id}`);
        if (!r.ok) return;
        const d = await r.json();
        setMetrics(m => ({
          viewers:  d.viewer_count  ?? m.viewers,
          segments: d.segment_count ?? m.segments + 1,
          errors:   d.error_count   ?? m.errors,
          uptime:   m.uptime,
        }));
        if (d.status === "ended" || d.status === "stopped") {
          setStreamStatus("ended");
          stopUptime();
          clearInterval(pollRef.current);
          addLog("Stream ended by server");
        }
      } catch {}
    }, 4000);
  };

  const startUptime = () => {
    clearInterval(uptimeRef.current);
    uptimeSec.current = 0;
    uptimeRef.current = setInterval(() => {
      uptimeSec.current += 1;
      setMetrics(m => ({ ...m, uptime: uptimeSec.current }));
    }, 1000);
  };

  const stopUptime = () => clearInterval(uptimeRef.current);

  const fmtUptime = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2,"0")}m` : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  const endStream = async () => {
    if (streamInfo?.stream_id || streamInfo?.id) {
      try {
        await fetch(`${apiBase}/streams/${streamInfo.stream_id || streamInfo.id}/stop`, { method:"POST" });
      } catch {}
    }
    setStreamStatus("ended");
    setActiveHls(null);
    stopUptime();
    clearInterval(pollRef.current);
    addLog("Stream ended");
  };

  useEffect(() => () => {
    clearInterval(pollRef.current);
    clearInterval(uptimeRef.current);
  }, []);

  // ── UI ───────────────────────────────────────────────────────────────────
  const isLive = streamStatus === "live";
  const isConnecting = streamStatus === "connecting";

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:16 }}>

      {/* ── LEFT COLUMN ── */}
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

        {/* Mode Switcher */}
        <div style={{ display:"flex", gap:0, border:"1px solid var(--border)", overflow:"hidden" }}>
          {[
            { id:"watch", icon:"📺", label:"Watch HLS Stream" },
            { id:"push",  icon:"📡", label:"Push / RTMP Out"  },
          ].map(m => (
            <button key={m.id} onClick={() => !isLive && setMode(m.id)}
              style={{
                flex:1, padding:"10px 0", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:".9rem", letterSpacing:2, textTransform:"uppercase",
                background: mode === m.id ? "var(--accent)" : "var(--bg3)",
                color: mode === m.id ? "#000" : "var(--muted)",
                borderRight: m.id === "watch" ? "1px solid var(--border)" : "none",
                cursor: isLive ? "not-allowed" : "pointer", transition:"all .2s"
              }}>
              <span>{m.icon}</span>{m.label}
            </button>
          ))}
        </div>

        {/* WATCH MODE */}
        {mode === "watch" && (
          <Panel title="HLS Stream Viewer" accent="var(--accent)"
            badge={<StreamStatusBadge status={streamStatus}/>}>

            {/* URL Input */}
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <input
                value={hlsUrl}
                onChange={e => setHlsUrl(e.target.value)}
                placeholder="https://example.com/stream/playlist.m3u8"
                disabled={isLive}
                style={{ flex:1, background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--text)",
                  padding:"8px 12px", fontSize:".8rem", fontFamily:"'Share Tech Mono',monospace",
                  opacity: isLive ? .5 : 1 }}
                onFocus={e => e.target.style.borderColor = "var(--accent)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
                onKeyDown={e => e.key === "Enter" && !isLive && watchUrl()}
              />
              {!isLive ? (
                <button onClick={watchUrl} disabled={!hlsUrl.trim() || isConnecting}
                  style={{ padding:"8px 20px", background: hlsUrl.trim() ? "var(--accent)" : "var(--bg4)",
                    color: hlsUrl.trim() ? "#000" : "var(--muted)",
                    fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:".95rem", letterSpacing:3,
                    textTransform:"uppercase", clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)" }}>
                  Play
                </button>
              ) : (
                <button onClick={stopWatching}
                  style={{ padding:"8px 20px", background:"var(--bg4)", color:"var(--red)",
                    border:"1px solid var(--red)", fontFamily:"'Barlow Condensed',sans-serif",
                    fontWeight:700, fontSize:".95rem", letterSpacing:3, textTransform:"uppercase" }}>
                  ⬛ Stop
                </button>
              )}
            </div>

            {/* API Streams list */}
            <div style={{ marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <Tag label="Available Streams"/>
                <button onClick={fetchStreams} disabled={loadingStreams}
                  style={{ display:"flex", alignItems:"center", gap:5, color:"var(--accent)", fontSize:".7rem",
                    fontFamily:"'Share Tech Mono',monospace", background:"none", border:"1px solid var(--border)", padding:"2px 8px" }}>
                  {loadingStreams ? <Spinner size={12}/> : "⟳"} Refresh
                </button>
              </div>
              {apiStreams.length === 0 ? (
                <div style={{ padding:"10px 12px", background:"var(--bg3)", border:"1px solid var(--border)",
                  color:"var(--muted)", fontSize:".75rem", fontFamily:"'Share Tech Mono',monospace", textAlign:"center" }}>
                  No active streams found · Enter a URL above or refresh
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {apiStreams.map((s, i) => (
                    <div key={i} onClick={() => { setHlsUrl(s.hls_url || s.url || ""); }}
                      style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        padding:"8px 12px", background:"var(--bg3)", border:"1px solid var(--border)",
                        cursor:"pointer", transition:"border-color .15s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
                    >
                      <div>
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:600, color:"var(--white)", fontSize:".9rem" }}>
                          {s.title || s.name || s.stream_id || `Stream ${i+1}`}
                        </div>
                        <div style={{ fontFamily:"'Share Tech Mono',monospace", color:"var(--muted)", fontSize:".68rem", marginTop:2 }}>
                          {s.hls_url || s.url || "—"}
                        </div>
                      </div>
                      <Pill color={s.status === "live" ? "var(--red)" : "var(--muted)"}>{s.status || "—"}</Pill>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Video Player */}
            <div style={{ position:"relative" }}>
              {activeHls ? (
                <>
                  <Tag label="HLS Playback"/>
                  <HLSPlayer src={activeHls} style={{ marginTop:8, aspectRatio:"16/9", border:"1px solid var(--border)" }}/>
                </>
              ) : (
                <div style={{ aspectRatio:"16/9", background:"var(--bg3)", border:"1px solid var(--border)",
                  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10 }}>
                  <div style={{ fontSize:"2.5rem", opacity:.4 }}>📺</div>
                  <span style={{ color:"var(--muted)", fontSize:".8rem", fontFamily:"'Share Tech Mono',monospace" }}>
                    Enter an HLS URL to start playback
                  </span>
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* PUSH MODE */}
        {mode === "push" && (
          <Panel title="RTMP Push / HLS Output" accent="var(--red)"
            badge={<StreamStatusBadge status={streamStatus}/>}>

            <div style={{ padding:"10px 14px", background:"rgba(255,180,0,.06)", border:"1px solid rgba(255,180,0,.2)", marginBottom:14 }}>
              <p style={{ fontSize:".75rem", color:"var(--amber)", lineHeight:1.6 }}>
                Register an RTMP push endpoint. Your encoder (OBS, FFmpeg, etc.) pushes to the RTMP URL. The server transcodes to HLS for viewers.
              </p>
            </div>

            {/* RTMP Server URL */}
            <div style={{ marginBottom:12 }}>
              <label style={{ display:"block", fontSize:".65rem", fontFamily:"'Share Tech Mono',monospace",
                color:"var(--muted)", letterSpacing:1, marginBottom:4, textTransform:"uppercase" }}>RTMP Server URL</label>
              <input value={serverUrl} onChange={e => setServerUrl(e.target.value)} disabled={isLive}
                style={{ width:"100%", background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--text)",
                  padding:"7px 10px", fontSize:".8rem", fontFamily:"'Share Tech Mono',monospace" }}
                onFocus={e => e.target.style.borderColor = "var(--red)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>

            {/* Overlay fields */}
            {[
              { key:"channel_name", label:"Channel Name", ph:"NEWS 24" },
              { key:"headline",     label:"Headline",     ph:"BREAKING NEWS" },
              { key:"badge_text",   label:"Badge",        ph:"LIVE" },
              { key:"ticker",       label:"Ticker",       ph:"Live stream…" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:10 }}>
                <label style={{ display:"block", fontSize:".65rem", fontFamily:"'Share Tech Mono',monospace",
                  color:"var(--muted)", letterSpacing:1, marginBottom:4, textTransform:"uppercase" }}>{f.label}</label>
                <input value={overlay[f.key]||""} onChange={e => setOverlay(p=>({...p,[f.key]:e.target.value}))}
                  placeholder={f.ph} disabled={isLive}
                  style={{ width:"100%", background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--text)",
                    padding:"6px 10px", fontSize:".8rem" }}
                  onFocus={e => e.target.style.borderColor = "var(--red)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>
            ))}

            {/* Action */}
            <div style={{ display:"flex", gap:8, marginTop:4 }}>
              {!streamKey ? (
                <button onClick={createPushStream} disabled={pushActive}
                  style={{ flex:1, padding:"10px 0", background: pushActive ? "var(--bg4)" : "var(--red)",
                    color: pushActive ? "var(--muted)" : "#fff",
                    fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:"1rem", letterSpacing:3,
                    textTransform:"uppercase", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)" }}>
                  {pushActive ? <><Spinner size={16} color="#fff"/> Registering…</> : "📡 Create Push Stream"}
                </button>
              ) : (
                <button onClick={endStream}
                  style={{ flex:1, padding:"10px 0", background:"var(--bg4)", color:"var(--red)",
                    border:"1px solid var(--red)", fontFamily:"'Barlow Condensed',sans-serif",
                    fontWeight:700, fontSize:"1rem", letterSpacing:3, textTransform:"uppercase" }}>
                  ⬛ End Stream
                </button>
              )}
            </div>

            {/* Stream key display */}
            {streamKey && (
              <div style={{ marginTop:14, animation:"slide-up .25s ease" }}>
                <Tag label="STREAM KEY — keep secret"/>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6,
                  background:"var(--bg3)", border:"1px solid var(--amber)", padding:"8px 12px" }}>
                  <span style={{ flex:1, fontFamily:"'Share Tech Mono',monospace", fontSize:".8rem",
                    color:"var(--amber)", letterSpacing:2, wordBreak:"break-all" }}>{streamKey}</span>
                  <CopyButton text={streamKey}/>
                </div>
                <div style={{ marginTop:8 }}>
                  <Tag label="RTMP Ingest URL"/>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6,
                    background:"var(--bg3)", border:"1px solid var(--border)", padding:"8px 12px" }}>
                    <span style={{ flex:1, fontFamily:"'Share Tech Mono',monospace", fontSize:".75rem",
                      color:"var(--text)", wordBreak:"break-all" }}>{serverUrl}/{streamKey}</span>
                    <CopyButton text={`${serverUrl}/${streamKey}`}/>
                  </div>
                </div>
                {/* OBS setup hint */}
                <div style={{ marginTop:10, padding:"8px 12px", background:"rgba(0,212,255,.04)",
                  border:"1px solid rgba(0,212,255,.15)", fontSize:".72rem", color:"var(--muted)", lineHeight:1.7 }}>
                  <span style={{ color:"var(--accent)", fontFamily:"'Share Tech Mono',monospace" }}>OBS SETUP</span><br/>
                  Settings → Stream → Service: Custom · Server: <span style={{ color:"var(--text)" }}>{serverUrl}</span> · Stream Key: <span style={{ color:"var(--amber)" }}>{streamKey}</span>
                </div>
              </div>
            )}

            {/* HLS playback for push stream */}
            {activeHls && (
              <div style={{ marginTop:14 }}>
                <Tag label="HLS PLAYBACK PREVIEW"/>
                <HLSPlayer src={activeHls} style={{ marginTop:8, aspectRatio:"16/9", border:"1px solid var(--border)" }}/>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6 }}>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".7rem", color:"var(--muted)", flex:1, wordBreak:"break-all" }}>{activeHls}</span>
                  <CopyButton text={activeHls}/>
                </div>
              </div>
            )}
          </Panel>
        )}
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

        {/* Metrics */}
        <Panel title="Stream Metrics" accent="var(--green)"
          badge={isLive ? <Pill color="var(--red)"><LiveDot/>LIVE</Pill> : null}>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
            <MetricTile label="UPTIME"   value={fmtUptime(metrics.uptime)} accent="var(--green)"/>
            <MetricTile label="VIEWERS"  value={metrics.viewers}           accent="var(--accent)"/>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <MetricTile label="SEGMENTS" value={metrics.segments} accent="var(--amber)"/>
            <MetricTile label="ERRORS"   value={metrics.errors}  accent={metrics.errors > 0 ? "var(--red)" : "var(--muted)"}/>
          </div>
        </Panel>

        {/* Quick-create via API */}
        <Panel title="Create Stream (API)" accent="var(--amber)"
          badge={<Pill color="var(--amber)">POST /streams/create</Pill>}>
          <p style={{ fontSize:".72rem", color:"var(--muted)", marginBottom:12, lineHeight:1.6 }}>
            Creates a managed HLS stream on the backend with your news overlay baked in.
          </p>
          {[
            { key:"channel_name", label:"Channel",  ph:"NEWS 24"        },
            { key:"headline",     label:"Headline", ph:"BREAKING NEWS"  },
            { key:"badge_text",   label:"Badge",    ph:"LIVE"           },
            { key:"ticker",       label:"Ticker",   ph:"Live now…"      },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:8 }}>
              <label style={{ display:"block", fontSize:".62rem", fontFamily:"'Share Tech Mono',monospace",
                color:"var(--muted)", letterSpacing:1, marginBottom:3, textTransform:"uppercase" }}>{f.label}</label>
              <input value={overlay[f.key]||""} onChange={e => setOverlay(p=>({...p,[f.key]:e.target.value}))}
                placeholder={f.ph} disabled={isLive}
                style={{ width:"100%", background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--text)",
                  padding:"5px 8px", fontSize:".78rem" }}
                onFocus={e => e.target.style.borderColor = "var(--amber)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            {!isLive && !isConnecting ? (
              <button onClick={createStream}
                style={{ flex:1, padding:"9px 0", background:"var(--amber)", color:"#000",
                  fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:".9rem",
                  letterSpacing:3, textTransform:"uppercase",
                  clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)" }}>
                ▶ Start Stream
              </button>
            ) : isConnecting ? (
              <button disabled style={{ flex:1, padding:"9px 0", background:"var(--bg4)", color:"var(--muted)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:".9rem", letterSpacing:3 }}>
                <Spinner size={15} color="var(--amber)"/> Connecting…
              </button>
            ) : (
              <button onClick={endStream}
                style={{ flex:1, padding:"9px 0", background:"var(--bg4)", color:"var(--red)",
                  border:"1px solid var(--red)", fontFamily:"'Barlow Condensed',sans-serif",
                  fontWeight:700, fontSize:".9rem", letterSpacing:3, textTransform:"uppercase" }}>
                ⬛ End Stream
              </button>
            )}
          </div>

          {/* HLS URL output */}
          {streamInfo && (streamInfo.hls_url || streamInfo.playback_url) && (
            <div style={{ marginTop:12, animation:"slide-up .2s ease" }}>
              <Tag label="HLS PLAYBACK URL"/>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5,
                background:"var(--bg3)", border:"1px solid var(--green)", padding:"7px 10px" }}>
                <span style={{ flex:1, fontFamily:"'Share Tech Mono',monospace", fontSize:".72rem",
                  color:"var(--green)", wordBreak:"break-all" }}>
                  {streamInfo.hls_url || streamInfo.playback_url}
                </span>
                <CopyButton text={streamInfo.hls_url || streamInfo.playback_url}/>
              </div>
            </div>
          )}
        </Panel>

        {/* Event Log */}
        <Panel title="Event Log" accent="var(--muted)"
          badge={<span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".65rem", color:"var(--muted)" }}>{log.length} events</span>}>
          <div style={{ height:180, overflowY:"auto", display:"flex", flexDirection:"column", gap:3 }}>
            {log.length === 0 ? (
              <span style={{ color:"var(--muted)", fontSize:".72rem", fontFamily:"'Share Tech Mono',monospace" }}>No events yet…</span>
            ) : (
              [...log].reverse().map((entry, i) => (
                <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".63rem", color:"var(--muted)", flexShrink:0 }}>{entry.ts}</span>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".7rem",
                    color: entry.type === "error" ? "var(--red)" : entry.type === "success" ? "var(--green)" : entry.type === "warn" ? "var(--amber)" : "var(--text)",
                    lineHeight:1.4 }}>
                    {entry.type === "error" ? "✗ " : entry.type === "success" ? "✓ " : entry.type === "warn" ? "⚠ " : "· "}
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