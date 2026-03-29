import { useState, useRef, useEffect, useCallback } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DEFAULT_API = "http://localhost:8000";

// ─── STYLES ──────────────────────────────────────────────────────────────────
const G = {
  fonts: `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@300;400;500;600&family=Share+Tech+Mono&display=swap');`,
  css: `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg:      #080c10;
      --bg2:     #0d1117;
      --bg3:     #141b22;
      --bg4:     #1c2330;
      --border:  #21293a;
      --accent:  #00d4ff;
      --red:     #ff3c5f;
      --green:   #00ff9d;
      --amber:   #ffb400;
      --text:    #cdd9e5;
      --muted:   #546073;
      --white:   #f0f6fc;
    }
    body { background: var(--bg); color: var(--text); font-family: 'Barlow', sans-serif; min-height: 100vh; }
    body::after {
      content:''; position:fixed; inset:0; pointer-events:none; z-index:9998;
      background: repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,255,255,0.012) 3px,rgba(0,255,255,0.012) 4px);
    }
    ::-webkit-scrollbar { width:5px; } ::-webkit-scrollbar-track { background:var(--bg2); }
    ::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }
    input,select,textarea { outline:none; }
    button { cursor:pointer; border:none; background:none; font-family:inherit; }
    video { display:block; }
    @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.6)} }
    @keyframes spin { to{transform:rotate(360deg)} }
    @keyframes slide-up { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes bar-grow { from{transform:scaleY(0)} to{transform:scaleY(1)} }
    @keyframes ticker { 0%{transform:translateX(100%)} 100%{transform:translateX(-100%)} }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  `,
};

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function fmt(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}
function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

// ─── ICONS ───────────────────────────────────────────────────────────────────
const Icon = {
  Upload: () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 4v12m-4-4l4-4 4 4"/>
    </svg>
  ),
  Stream: () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
    </svg>
  ),
  Record: () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="4" fill="currentColor"/>
      <circle cx="12" cy="12" r="9" strokeDasharray="2 2"/>
    </svg>
  ),
  Play: () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <polygon points="5,3 19,12 5,21" fill="currentColor" stroke="none"/>
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
    </svg>
  ),
  Copy: () => (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  ),
  Screen: () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
    </svg>
  ),
  Cam: () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  ),
  Stop: () => (
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
    </svg>
  ),
  Download: () => (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m-4-4l4 4 4-4"/>
    </svg>
  ),
};

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function Pill({ color = "#00d4ff", children }) {
  return (
    <span style={{
      display:"inline-flex",alignItems:"center",gap:5,
      background:`${color}18`,border:`1px solid ${color}40`,
      color,padding:"2px 10px",fontSize:".68rem",fontFamily:"'Share Tech Mono',monospace",
      letterSpacing:1,textTransform:"uppercase",clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)"
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

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),1800); }}
      style={{ color: copied ? "var(--green)" : "var(--muted)", padding:"3px 6px", transition:"color .2s", display:"flex",alignItems:"center",gap:4,fontSize:".7rem" }}
    >
      {copied ? <Icon.Check/> : <Icon.Copy/>}
      {copied ? "Copied" : "Copy"}
    </button>
  );
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

function StatusChip({ status }) {
  const map = {
    queued:     { color:"var(--amber)",   label:"QUEUED"     },
    processing: { color:"var(--accent)",  label:"PROCESSING" },
    ready:      { color:"var(--green)",   label:"READY"      },
    failed:     { color:"var(--red)",     label:"FAILED"     },
  };
  const s = map[status] || { color:"var(--muted)", label: status?.toUpperCase() || "—" };
  return <Pill color={s.color}><LiveDot color={s.color}/>{s.label}</Pill>;
}

// ─── UPLOAD TAB ───────────────────────────────────────────────────────────────
function UploadTab({ apiBase }) {
  const [file,    setFile]    = useState(null);
  const [meta,    setMeta]    = useState({ title:"", channel_name:"NEWS 24", headline:"BREAKING NEWS", ticker:"Stay tuned for updates", badge_text:"BREAKING" });
  const [prog,    setProg]    = useState(0);
  const [status,  setStatus]  = useState(null); // null | "uploading" | "queued" | "processing" | "ready" | "failed"
  const [result,  setResult]  = useState(null);
  const [drag,    setDrag]    = useState(false);
  const inputRef  = useRef();
  const pollRef   = useRef();

  const pickFile = (f) => { if (f && f.type.startsWith("video/")) setFile(f); };

  const startUpload = async () => {
    if (!file) return;
    setStatus("uploading"); setProg(0); setResult(null);

    const fd = new FormData();
    fd.append("file", file);
    Object.entries(meta).forEach(([k,v]) => v && fd.append(k, v));
    fd.append("enabled", "true");

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${apiBase}/video/upload-full`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProg(Math.round(e.loaded/e.total*100)); };
      xhr.onload = () => {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) { setStatus("failed"); setResult({ error: data.detail || "Upload failed" }); return; }
        setResult(data);
        setStatus("queued");
        pollStatus(data.video_id);
      };
      xhr.onerror = () => { setStatus("failed"); setResult({ error: "Network error" }); };
      xhr.send(fd);
    } catch(e) { setStatus("failed"); setResult({ error: e.message }); }
  };

  const pollStatus = (vid) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${apiBase}/video/${vid}`);
        const d = await r.json();
        setStatus(d.status);
        if (d.status === "ready" || d.status === "failed") {
          clearInterval(pollRef.current);
          setResult(prev => ({ ...prev, ...d }));
        }
      } catch {}
    }, 2500);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const reset = () => { setFile(null); setStatus(null); setResult(null); setProg(0); };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 360px", gap:16 }}>
      {/* Left: drop zone + progress */}
      <Panel title="Upload Video" accent="var(--accent)" badge={<Pill color="var(--accent)">MULTIPART</Pill>}>
        {/* Drop zone */}
        <div
          onClick={() => !file && inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files[0]); }}
          style={{
            border:`1.5px dashed ${drag ? "var(--accent)" : file ? "var(--green)" : "var(--border)"}`,
            borderRadius:2, padding:"28px 20px", textAlign:"center", cursor: file ? "default" : "pointer",
            background: drag ? "rgba(0,212,255,.05)" : "var(--bg3)",
            transition:"all .2s", marginBottom:16,
          }}
        >
          <input ref={inputRef} type="file" accept="video/*" style={{display:"none"}} onChange={e => pickFile(e.target.files[0])}/>
          {file ? (
            <div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", color:"var(--green)", fontSize:".85rem", marginBottom:4 }}>{file.name}</div>
              <div style={{ color:"var(--muted)", fontSize:".75rem" }}>{fmt(file.size)} · {file.type}</div>
              {status === null && <button onClick={e=>{e.stopPropagation();reset();}} style={{ marginTop:10, color:"var(--red)", fontSize:".72rem", fontFamily:"'Share Tech Mono',monospace" }}>✕ Remove</button>}
            </div>
          ) : (
            <div>
              <div style={{ fontSize:"2rem", marginBottom:8 }}>⬆</div>
              <div style={{ color:"var(--white)", fontWeight:600, marginBottom:4 }}>Drop video file here</div>
              <div style={{ color:"var(--muted)", fontSize:".8rem" }}>or click to browse · MP4, MOV, AVI, WebM · max 500 MB</div>
            </div>
          )}
        </div>

        {/* Progress */}
        {status === "uploading" && (
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:".75rem",color:"var(--muted)" }}>
              <span>UPLOADING</span><span style={{ color:"var(--accent)",fontFamily:"'Share Tech Mono',monospace" }}>{prog}%</span>
            </div>
            <div style={{ height:4, background:"var(--bg4)", borderRadius:2 }}>
              <div style={{ height:"100%", width:`${prog}%`, background:"linear-gradient(90deg,var(--accent),#00ffa3)", borderRadius:2, transition:"width .3s" }}/>
            </div>
          </div>
        )}

        {/* Status messages */}
        {status && status !== "uploading" && (
          <div style={{ marginBottom:16, padding:"10px 14px", background:"var(--bg3)", border:"1px solid var(--border)", display:"flex",alignItems:"center",gap:10 }}>
            {(status === "queued" || status === "processing") && <Spinner/>}
            <div>
              <StatusChip status={status}/>
              <div style={{ marginTop:4, fontSize:".75rem", color:"var(--muted)" }}>
                {status === "queued" && "Waiting for worker…"}
                {status === "processing" && "FFmpeg is applying your overlay…"}
                {status === "ready" && "✓ Your video is ready to play"}
                {status === "failed" && (result?.error || "Processing failed")}
              </div>
            </div>
          </div>
        )}

        {/* Action button */}
        <div style={{ display:"flex",gap:10 }}>
          <button
            onClick={startUpload}
            disabled={!file || !!status}
            style={{
              flex:1, padding:"10px 0",background:(!file||!!status)?"var(--bg4)":"var(--accent)",
              color:(!file||!!status)?"var(--muted)":"#000",fontFamily:"'Barlow Condensed',sans-serif",
              fontWeight:700,fontSize:"1rem",letterSpacing:3,textTransform:"uppercase",
              transition:"all .2s",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)"
            }}
          >
            {status === "uploading" ? "Uploading…" : "Upload & Process"}
          </button>
          {(status === "ready" || status === "failed") && (
            <button onClick={reset} style={{ padding:"10px 18px",border:"1px solid var(--border)",color:"var(--muted)",fontSize:".85rem",letterSpacing:1 }}>
              Reset
            </button>
          )}
        </div>

        {/* Playback */}
        {status === "ready" && result?.paths?.mp4 && (
          <div style={{ marginTop:16 }}>
            <Tag label="OUTPUT · MP4"/>
            <video controls style={{ width:"100%",marginTop:8,background:"#000",maxHeight:320 }}
              src={`${apiBase}/${result.paths.mp4}`}/>
            <div style={{ marginTop:8,display:"flex",alignItems:"center",gap:8 }}>
              <a href={`${apiBase}/${result.paths.mp4}`} download style={{ display:"flex",alignItems:"center",gap:6,color:"var(--accent)",fontSize:".8rem",textDecoration:"none" }}>
                <Icon.Download/> Download MP4
              </a>
            </div>
          </div>
        )}
      </Panel>

      {/* Right: overlay metadata form */}
      <Panel title="Overlay Config" accent="var(--amber)" badge={<Pill color="var(--amber)">NEWS LOWER THIRD</Pill>}>
        {[
          { key:"title",        label:"Video Title",    ph:"My Broadcast" },
          { key:"channel_name", label:"Channel Name",   ph:"NEWS 24"       },
          { key:"headline",     label:"Headline",       ph:"BREAKING NEWS" },
          { key:"badge_text",   label:"Badge Text",     ph:"BREAKING"      },
          { key:"ticker",       label:"Ticker Text",    ph:"Stay tuned for updates…" },
        ].map(f => (
          <div key={f.key} style={{ marginBottom:12 }}>
            <label style={{ display:"block",fontSize:".65rem",fontFamily:"'Share Tech Mono',monospace",color:"var(--muted)",letterSpacing:1,marginBottom:4,textTransform:"uppercase" }}>{f.label}</label>
            <input
              value={meta[f.key] || ""}
              onChange={e => setMeta(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.ph}
              disabled={!!status && status !== null}
              style={{
                width:"100%",background:"var(--bg3)",border:"1px solid var(--border)",
                color:"var(--text)",padding:"7px 10px",fontSize:".82rem",fontFamily:"'Barlow',sans-serif",
                transition:"border-color .2s"
              }}
              onFocus={e=>e.target.style.borderColor="var(--accent)"}
              onBlur={e=>e.target.style.borderColor="var(--border)"}
            />
          </div>
        ))}

        {/* Live overlay preview */}
        <div style={{ marginTop:8, position:"relative", background:"#000", aspectRatio:"16/9", overflow:"hidden", border:"1px solid var(--border)" }}>
          <div style={{ position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent 50%,rgba(0,0,0,.7))",pointerEvents:"none"}}/>
          {/* Channel badge */}
          <div style={{ position:"absolute",top:10,left:10,background:"var(--red)",color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:".7rem",padding:"2px 8px",letterSpacing:2 }}>
            {meta.badge_text || "BREAKING"}
          </div>
          {/* Channel name */}
          <div style={{ position:"absolute",top:10,right:10,color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".75rem",letterSpacing:2 }}>
            {meta.channel_name || "NEWS 24"}
          </div>
          {/* Headline bar */}
          <div style={{ position:"absolute",bottom:22,left:0,right:0,background:"rgba(0,0,0,.85)",padding:"5px 10px" }}>
            <div style={{ color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".9rem",letterSpacing:1 }}>
              {meta.headline || "HEADLINE"}
            </div>
          </div>
          {/* Ticker */}
          <div style={{ position:"absolute",bottom:0,left:0,right:0,background:"var(--red)",overflow:"hidden",height:22 }}>
            <div style={{ display:"flex",alignItems:"center",height:"100%",animation:"ticker 14s linear infinite",whiteSpace:"nowrap" }}>
              <span style={{ color:"#fff",fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",paddingLeft:"100%" }}>
                {meta.ticker || "Ticker text…"}
              </span>
            </div>
          </div>
          <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center" }}>
            <span style={{ color:"var(--muted)",fontSize:".7rem",fontFamily:"'Share Tech Mono',monospace" }}>PREVIEW</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ─── RTMP STREAM TAB ──────────────────────────────────────────────────────────
function StreamTab({ apiBase }) {
  const [streamKey, setStreamKey] = useState(null);
  const [rtmpUrl,   setRtmpUrl]   = useState("");
  const [hlsUrl,    setHlsUrl]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [playing,   setPlaying]   = useState(false);
  const videoRef = useRef();
  const hlsRef   = useRef();

  const genKey = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/stream/key`);
      const d = await r.json();
      setStreamKey(d.stream_key);
      setRtmpUrl(d.rtmp_url);
      // Conventional HLS endpoint — adjust to your nginx-rtmp / SRS setup
      const base = apiBase.replace(/^http/, "http");
      setHlsUrl(`${base}/live/${d.stream_key}/index.m3u8`);
    } catch(e) { alert("Failed to fetch stream key: " + e.message); }
    setLoading(false);
  };

  const startWatch = () => {
    if (!hlsUrl) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({ liveSyncDurationCount:3, liveMaxLatencyDurationCount:6 });
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => { videoRef.current.play(); setPlaying(true); });
      hlsRef.current = hls;
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      videoRef.current.src = hlsUrl;
      videoRef.current.play();
      setPlaying(true);
    }
  };

  const stopWatch = () => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
    setPlaying(false);
  };

  useEffect(() => () => { if(hlsRef.current) hlsRef.current.destroy(); }, []);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:16 }}>
      {/* Stream viewer */}
      <Panel title="Live Stream Viewer" accent="var(--red)" badge={playing ? <Pill color="var(--red)"><LiveDot/>ON AIR</Pill> : null}>
        <div style={{ position:"relative", background:"#000", aspectRatio:"16/9", marginBottom:14, border:"1px solid var(--border)" }}>
          <video ref={videoRef} controls style={{ width:"100%",height:"100%",objectFit:"contain" }}/>
          {!playing && (
            <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12 }}>
              <div style={{ width:60,height:60,borderRadius:"50%",border:"2px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--muted)" }}>
                <Icon.Stream/>
              </div>
              <span style={{ color:"var(--muted)",fontSize:".8rem",fontFamily:"'Share Tech Mono',monospace" }}>NO SIGNAL</span>
            </div>
          )}
        </div>

        {/* HLS URL input */}
        <div style={{ marginBottom:12 }}>
          <label style={{ display:"block",fontSize:".65rem",fontFamily:"'Share Tech Mono',monospace",color:"var(--muted)",letterSpacing:1,marginBottom:5,textTransform:"uppercase" }}>HLS Playback URL (.m3u8)</label>
          <div style={{ display:"flex",gap:8 }}>
            <input
              value={hlsUrl}
              onChange={e => setHlsUrl(e.target.value)}
              placeholder="http://server/live/stream-key/index.m3u8"
              style={{ flex:1,background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text)",padding:"7px 10px",fontSize:".8rem",fontFamily:"'Share Tech Mono',monospace" }}
              onFocus={e=>e.target.style.borderColor="var(--red)"}
              onBlur={e=>e.target.style.borderColor="var(--border)"}
            />
          </div>
        </div>

        <div style={{ display:"flex",gap:10 }}>
          <button onClick={playing ? stopWatch : startWatch}
            style={{
              flex:1,padding:"9px 0",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1rem",
              letterSpacing:3,textTransform:"uppercase",
              background: playing ? "var(--bg4)" : "var(--red)",
              color: playing ? "var(--red)" : "#fff",
              border: playing ? "1px solid var(--red)" : "none",
              clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)"
            }}>
            {playing ? "⬛ Stop" : "▶ Watch Live"}
          </button>
        </div>
      </Panel>

      {/* Stream key panel */}
      <Panel title="Stream Key" accent="var(--amber)">
        <p style={{ fontSize:".8rem", color:"var(--muted)", marginBottom:16, lineHeight:1.6 }}>
          Generate an RTMP stream key, then point your broadcast software (OBS, FFmpeg) at the RTMP URL below.
        </p>
        <button onClick={genKey} disabled={loading}
          style={{
            width:"100%",padding:"9px 0",background: loading ? "var(--bg4)" : "var(--amber)",
            color: loading ? "var(--muted)" : "#000",fontFamily:"'Barlow Condensed',sans-serif",
            fontWeight:700,fontSize:".95rem",letterSpacing:3,marginBottom:16,
            clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)"
          }}>
          {loading ? "Generating…" : "Generate Stream Key"}
        </button>

        {streamKey && (
          <div style={{ animation:"slide-up .25s ease" }}>
            {[
              { label:"STREAM KEY", val: streamKey },
              { label:"RTMP URL",   val: rtmpUrl   },
            ].map(row => (
              <div key={row.label} style={{ marginBottom:12 }}>
                <Tag label={row.label}/>
                <div style={{ display:"flex",alignItems:"center",gap:6,marginTop:5,
                  background:"var(--bg3)",border:"1px solid var(--border)",padding:"6px 10px" }}>
                  <code style={{ flex:1,fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"var(--green)",wordBreak:"break-all" }}>{row.val}</code>
                  <CopyButton text={row.val}/>
                </div>
              </div>
            ))}

            <div style={{ marginTop:16, padding:"10px 12px", background:"rgba(255,180,0,.06)", border:"1px solid rgba(255,180,0,.2)", fontSize:".75rem", color:"var(--amber)", lineHeight:1.7 }}>
              <strong>OBS Setup:</strong><br/>
              Settings → Stream → Service: Custom<br/>
              Server: <code style={{fontFamily:"'Share Tech Mono',monospace"}}>{rtmpUrl.split("/").slice(0,-1).join("/")}</code><br/>
              Stream Key: <code style={{fontFamily:"'Share Tech Mono',monospace"}}>{streamKey}</code>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ─── RECORD TAB ───────────────────────────────────────────────────────────────
function RecordTab({ apiBase }) {
  const [mode,      setMode]      = useState("webcam"); // "webcam" | "screen"
  const [recording, setRecording] = useState(false);
  const [stream,    setStream]    = useState(null);
  const [chunks,    setChunks]    = useState([]);
  const [blobUrl,   setBlobUrl]   = useState(null);
  const [elapsed,   setElapsed]   = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadRes, setUploadRes] = useState(null);
  const [meta,      setMeta]      = useState({ channel_name:"NEWS 24", headline:"BREAKING NEWS", ticker:"Live recording", badge_text:"LIVE" });

  const videoRef  = useRef();
  const mrRef     = useRef();
  const timerRef  = useRef();
  const chunksRef = useRef([]);

  const startPreview = async () => {
    try {
      const s = mode === "webcam"
        ? await navigator.mediaDevices.getUserMedia({ video:true, audio:true })
        : await navigator.mediaDevices.getDisplayMedia({ video:true, audio:true });
      setStream(s);
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
    } catch(e) { alert("Could not access media: " + e.message); }
  };

  const stopPreview = () => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startRecording = () => {
    if (!stream) return;
    chunksRef.current = [];
    setBlobUrl(null);
    setUploadRes(null);
    const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type:"video/webm" });
      setBlobUrl(URL.createObjectURL(blob));
      setChunks(chunksRef.current);
    };
    mr.start(500);
    mrRef.current = mr;
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(p => p+1), 1000);
  };

  const stopRecording = () => {
    mrRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const uploadRecording = async () => {
    if (!chunks.length) return;
    setUploading(true);
    const blob = new Blob(chunks, { type:"video/webm" });
    const fd = new FormData();
    fd.append("file", blob, "recording.webm");
    Object.entries(meta).forEach(([k,v]) => fd.append(k, v));
    fd.append("enabled","true");
    try {
      const r = await fetch(`${apiBase}/video/upload-full`, { method:"POST", body:fd });
      const d = await r.json();
      setUploadRes(d);
    } catch(e) { setUploadRes({ error: e.message }); }
    setUploading(false);
  };

  useEffect(() => () => { clearInterval(timerRef.current); stream?.getTracks().forEach(t=>t.stop()); }, []);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:16 }}>
      <Panel title="In-Browser Recording" accent="var(--green)"
        badge={recording ? <Pill color="var(--red)"><LiveDot/>REC {fmtTime(elapsed)}</Pill> : null}>

        {/* Source toggle */}
        <div style={{ display:"flex",gap:8,marginBottom:14 }}>
          {["webcam","screen"].map(m => (
            <button key={m} onClick={()=>{if(!stream)setMode(m);}}
              style={{ flex:1,padding:"7px 0",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".9rem",letterSpacing:2,textTransform:"uppercase",
                background: mode===m ? (m==="webcam"?"var(--green)":"var(--accent)") : "var(--bg3)",
                color: mode===m ? "#000" : "var(--muted)",border:`1px solid ${mode===m?(m==="webcam"?"var(--green)":"var(--accent)"):"var(--border)"}`,
                cursor: stream ? "not-allowed" : "pointer", transition:"all .2s"
              }}>
              {m === "webcam" ? "🎥 Webcam" : "🖥 Screen"}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div style={{ position:"relative", background:"#000", aspectRatio:"16/9", marginBottom:14, border:"1px solid var(--border)" }}>
          <video ref={videoRef} muted style={{ width:"100%",height:"100%",objectFit:"contain" }}/>
          {!stream && (
            <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10 }}>
              <div style={{ color:"var(--muted)", fontSize:"2.5rem" }}>{mode==="webcam"?"📷":"🖥"}</div>
              <span style={{ color:"var(--muted)",fontSize:".8rem",fontFamily:"'Share Tech Mono',monospace" }}>No preview — click Start</span>
            </div>
          )}
          {recording && (
            <div style={{ position:"absolute",top:10,left:10,display:"flex",alignItems:"center",gap:6,background:"rgba(0,0,0,.7)",padding:"3px 10px",borderRadius:2 }}>
              <LiveDot color="var(--red)"/>
              <span style={{ color:"#fff",fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem" }}>REC {fmtTime(elapsed)}</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display:"flex",gap:8 }}>
          {!stream ? (
            <button onClick={startPreview}
              style={{ flex:1,padding:"9px 0",background:"var(--green)",color:"#000",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:3,textTransform:"uppercase",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)" }}>
              Start Preview
            </button>
          ) : !recording ? (
            <>
              <button onClick={startRecording}
                style={{ flex:1,padding:"9px 0",background:"var(--red)",color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:3,textTransform:"uppercase",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)" }}>
                ⏺ Record
              </button>
              <button onClick={stopPreview}
                style={{ padding:"9px 16px",border:"1px solid var(--border)",color:"var(--muted)",fontSize:".85rem",letterSpacing:1 }}>
                Stop Preview
              </button>
            </>
          ) : (
            <button onClick={stopRecording}
              style={{ flex:1,padding:"9px 0",background:"var(--bg4)",color:"var(--red)",border:"1px solid var(--red)",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:3,textTransform:"uppercase" }}>
              ⬛ Stop Recording
            </button>
          )}
        </div>

        {/* Playback + upload */}
        {blobUrl && (
          <div style={{ marginTop:16,animation:"slide-up .3s ease" }}>
            <Tag label="RECORDED CLIP"/>
            <video controls src={blobUrl} style={{ width:"100%",marginTop:8,background:"#000",maxHeight:200 }}/>
            <div style={{ display:"flex",gap:10,marginTop:10 }}>
              <a href={blobUrl} download="recording.webm"
                style={{ display:"flex",alignItems:"center",gap:6,color:"var(--accent)",fontSize:".8rem",textDecoration:"none" }}>
                <Icon.Download/> Save WebM
              </a>
              <button onClick={uploadRecording} disabled={uploading}
                style={{ marginLeft:"auto",padding:"6px 18px",background: uploading ? "var(--bg4)" : "var(--accent)",color: uploading ? "var(--muted)" : "#000",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".85rem",letterSpacing:2 }}>
                {uploading ? "Uploading…" : "⬆ Upload & Process"}
              </button>
            </div>
            {uploadRes && (
              <div style={{ marginTop:10,padding:"8px 12px",background:"var(--bg3)",border:"1px solid var(--border)",fontSize:".75rem",fontFamily:"'Share Tech Mono',monospace",color: uploadRes.error ? "var(--red)" : "var(--green)" }}>
                {uploadRes.error ? "✗ " + uploadRes.error : `✓ Queued · video_id: ${uploadRes.video_id}`}
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Overlay config for recording */}
      <Panel title="Recording Overlay" accent="var(--green)">
        <p style={{ fontSize:".75rem", color:"var(--muted)", marginBottom:14, lineHeight:1.6 }}>
          Applied when the recording is uploaded for processing.
        </p>
        {[
          { key:"channel_name", label:"Channel",  ph:"NEWS 24"   },
          { key:"headline",     label:"Headline", ph:"LIVE NOW"   },
          { key:"badge_text",   label:"Badge",    ph:"LIVE"       },
          { key:"ticker",       label:"Ticker",   ph:"Live recording…" },
        ].map(f => (
          <div key={f.key} style={{ marginBottom:10 }}>
            <label style={{ display:"block",fontSize:".65rem",fontFamily:"'Share Tech Mono',monospace",color:"var(--muted)",letterSpacing:1,marginBottom:4,textTransform:"uppercase" }}>{f.label}</label>
            <input value={meta[f.key]||""} onChange={e=>setMeta(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
              style={{ width:"100%",background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text)",padding:"6px 10px",fontSize:".8rem" }}
              onFocus={e=>e.target.style.borderColor="var(--green)"}
              onBlur={e=>e.target.style.borderColor="var(--border)"}
            />
          </div>
        ))}
      </Panel>
    </div>
  );
}

// ─── STATUS / PLAYBACK TAB ────────────────────────────────────────────────────
function StatusTab({ apiBase }) {
  const [videoId,  setVideoId]  = useState("");
  const [doc,      setDoc]      = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [watching, setWatching] = useState(false);
  const pollRef = useRef();

  const lookup = async (id) => {
    const vid = id || videoId;
    if (!vid.trim()) return;
    setLoading(true); setError(null); setDoc(null); setWatching(false);
    clearInterval(pollRef.current);
    try {
      const r = await fetch(`${apiBase}/video/${vid.trim()}`);
      if (!r.ok) throw new Error(`${r.status} — Video not found`);
      const d = await r.json();
      setDoc(d);
      if (d.status !== "ready" && d.status !== "failed") {
        pollRef.current = setInterval(async () => {
          const r2 = await fetch(`${apiBase}/video/${vid.trim()}`);
          const d2 = await r2.json();
          setDoc(d2);
          if (d2.status === "ready" || d2.status === "failed") clearInterval(pollRef.current);
        }, 2500);
      }
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  return (
    <div style={{ maxWidth:800 }}>
      <Panel title="Video Status & Playback" accent="var(--accent)">
        <div style={{ display:"flex",gap:10,marginBottom:18 }}>
          <input value={videoId} onChange={e=>setVideoId(e.target.value)} placeholder="Enter video_id…"
            onKeyDown={e=>e.key==="Enter"&&lookup()}
            style={{ flex:1,background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text)",padding:"8px 12px",fontSize:".85rem",fontFamily:"'Share Tech Mono',monospace" }}
            onFocus={e=>e.target.style.borderColor="var(--accent)"}
            onBlur={e=>e.target.style.borderColor="var(--border)"}
          />
          <button onClick={()=>lookup()} disabled={loading}
            style={{ padding:"8px 24px",background: loading ? "var(--bg4)" : "var(--accent)",color: loading ? "var(--muted)" : "#000",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:3,textTransform:"uppercase",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)" }}>
            {loading ? <Spinner size={16} color="#000"/> : "Lookup"}
          </button>
        </div>

        {error && <div style={{ padding:"10px 14px",background:"rgba(255,60,95,.08)",border:"1px solid rgba(255,60,95,.25)",color:"var(--red)",fontSize:".82rem",marginBottom:12 }}>{error}</div>}

        {doc && (
          <div style={{ animation:"slide-up .25s ease" }}>
            {/* Header row */}
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
              <div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1.2rem",color:"var(--white)" }}>{doc.title || doc.filename || doc.id}</div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"var(--muted)",marginTop:2 }}>{doc.id}</div>
              </div>
              <StatusChip status={doc.status}/>
            </div>

            {/* Info grid */}
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16 }}>
              {[
                { label:"SIZE",    val: doc.size_bytes ? fmt(doc.size_bytes) : "—" },
                { label:"CREATED", val: doc.created_at ? new Date(doc.created_at).toLocaleString() : "—" },
                { label:"TASK ID", val: doc.task_id ? doc.task_id.slice(0,10)+"…" : "—" },
              ].map(c => (
                <div key={c.label} style={{ background:"var(--bg3)",border:"1px solid var(--border)",padding:"8px 12px" }}>
                  <Tag label={c.label}/>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"var(--text)",marginTop:3 }}>{c.val}</div>
                </div>
              ))}
            </div>

            {/* Overlay info */}
            {doc.overlay && (
              <div style={{ marginBottom:14,padding:"10px 14px",background:"var(--bg3)",border:"1px solid var(--border)" }}>
                <Tag label="OVERLAY CONFIG"/>
                <div style={{ display:"flex",flexWrap:"wrap",gap:10,marginTop:8 }}>
                  {Object.entries(doc.overlay).map(([k,v]) => v !== undefined && (
                    <span key={k} style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"var(--muted)" }}>
                      <span style={{ color:"var(--accent)" }}>{k}</span>: {String(v)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Processing animation */}
            {(doc.status === "queued" || doc.status === "processing") && (
              <div style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"rgba(0,212,255,.05)",border:"1px solid rgba(0,212,255,.2)",marginBottom:14 }}>
                <Spinner/>
                <span style={{ fontSize:".82rem", color:"var(--accent)" }}>
                  {doc.status === "queued" ? "Waiting for FFmpeg worker…" : "Applying news overlay — this may take a moment…"}
                </span>
              </div>
            )}

            {/* Video player */}
            {doc.status === "ready" && doc.paths?.mp4 && (
              <div>
                <Tag label="OUTPUT VIDEO"/>
                <video controls style={{ width:"100%",marginTop:8,background:"#000",maxHeight:360 }}
                  src={`${apiBase}/${doc.paths.mp4}`}/>
                <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:12 }}>
                  <a href={`${apiBase}/${doc.paths.mp4}`} download
                    style={{ display:"flex",alignItems:"center",gap:6,color:"var(--accent)",fontSize:".8rem",textDecoration:"none" }}>
                    <Icon.Download/> Download MP4
                  </a>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"var(--muted)",marginLeft:"auto" }}>
                    {doc.paths.mp4}
                  </span>
                </div>
              </div>
            )}

            {doc.status === "failed" && (
              <div style={{ padding:"12px 14px",background:"rgba(255,60,95,.07)",border:"1px solid rgba(255,60,95,.2)",color:"var(--red)",fontSize:".82rem" }}>
                ✗ Processing failed — {doc.error || "check worker logs"}
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const TABS = [
  { id:"upload", label:"Upload",        Icon: Icon.Upload },
  { id:"stream", label:"Live Stream",   Icon: Icon.Stream },
  { id:"record", label:"Record",        Icon: Icon.Record },
  { id:"status", label:"Status / Play", Icon: Icon.Play   },
];

export default function App() {
  const [tab,     setTab]     = useState("upload");
  const [apiBase, setApiBase] = useState(DEFAULT_API);

  return (
    <>
      <style>{G.fonts}{G.css}</style>

      {/* Header */}
      <header style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:54,borderBottom:"1px solid var(--border)",background:"rgba(8,12,16,.96)",backdropFilter:"blur(12px)",position:"sticky",top:0,zIndex:100 }}>
        <div style={{ display:"flex",alignItems:"center",gap:14 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.6rem",letterSpacing:5,color:"var(--accent)",textShadow:"0 0 20px rgba(0,212,255,.4)" }}>
            LIVEWIRE
          </div>
          <div style={{ width:1,height:24,background:"var(--border)" }}/>
          <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"var(--muted)",letterSpacing:1 }}>VIDEO PLATFORM</div>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <span style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"var(--muted)" }}>API</span>
          <input value={apiBase} onChange={e=>setApiBase(e.target.value.replace(/\/+$/,""))}
            style={{ background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--accent)",padding:"4px 10px",fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",width:220 }}
            onFocus={e=>e.target.style.borderColor="var(--accent)"}
            onBlur={e=>e.target.style.borderColor="var(--border)"}
          />
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display:"flex",borderBottom:"1px solid var(--border)",background:"var(--bg2)",padding:"0 24px" }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                display:"flex",alignItems:"center",gap:7,padding:"12px 18px",
                fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".95rem",letterSpacing:2,textTransform:"uppercase",
                color: active ? "var(--accent)" : "var(--muted)",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom:-1,transition:"all .2s"
              }}>
              <t.Icon/>{t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ padding:24, animation:"slide-up .3s ease" }} key={tab}>
        {tab === "upload" && <UploadTab apiBase={apiBase}/>}
        {tab === "stream" && <StreamTab apiBase={apiBase}/>}
        {tab === "record" && <RecordTab apiBase={apiBase}/>}
        {tab === "status" && <StatusTab apiBase={apiBase}/>}
      </div>
    </>
  );
}