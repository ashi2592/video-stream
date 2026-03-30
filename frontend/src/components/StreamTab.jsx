import { useState, useRef, useEffect, useCallback } from "react";

// ─── SHARED PRIMITIVES (inline, matching App.jsx palette) ─────────────────────
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

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),1800); }}
      style={{ color: copied ? "var(--green)" : "var(--muted)", padding:"3px 8px", transition:"color .2s",
        display:"flex",alignItems:"center",gap:4,fontSize:".7rem",fontFamily:"'Share Tech Mono',monospace",
        background:"var(--bg3)",border:"1px solid var(--border)" }}
    >
      {copied ? "✓ Copied" : "⧉ Copy"}
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

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

function fmt(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}

// ─── VU METER ─────────────────────────────────────────────────────────────────
function VuMeter({ stream }) {
  const canvasRef = useRef();
  const rafRef    = useRef();
  const analyserRef = useRef();

  useEffect(() => {
    if (!stream) { cancelAnimationFrame(rafRef.current); return; }
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const draw = () => {
        rafRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(data);
        const c = canvas.getContext("2d");
        c.clearRect(0,0,canvas.width,canvas.height);
        const bars = 16;
        const slice = Math.floor(data.length / bars);
        for (let i = 0; i < bars; i++) {
          const avg = data.slice(i*slice,(i+1)*slice).reduce((a,b)=>a+b,0) / slice;
          const h = (avg / 255) * canvas.height;
          const hue = avg > 180 ? "#ff3c5f" : avg > 100 ? "#ffb400" : "#00ff9d";
          c.fillStyle = hue;
          c.fillRect(i * (canvas.width/bars) + 1, canvas.height - h, (canvas.width/bars) - 2, h);
        }
      };
      draw();
      return () => { cancelAnimationFrame(rafRef.current); ctx.close(); };
    } catch {}
  }, [stream]);

  return (
    <canvas ref={canvasRef} width={200} height={28}
      style={{ width:"100%", height:28, display:"block", background:"var(--bg3)", borderRadius:1 }}/>
  );
}

// ─── STREAM KEY ROW ───────────────────────────────────────────────────────────
function KeyRow({ label, value, mono = true }) {
  return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",background:"var(--bg3)",border:"1px solid var(--border)",marginBottom:6 }}>
      <Tag label={label}/>
      <div style={{ display:"flex",alignItems:"center",gap:8,minWidth:0 }}>
        <span style={{
          fontFamily: mono ? "'Share Tech Mono',monospace" : "'Barlow',sans-serif",
          fontSize:".72rem",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200
        }}>{value}</span>
        <CopyButton text={value}/>
      </div>
    </div>
  );
}

// ─── MAIN STREAM TAB ──────────────────────────────────────────────────────────
export function StreamTab({ apiBase }) {
  // ── RTMP state ──
  const [streamInfo,   setStreamInfo]   = useState(null);   // { stream_key, rtmp_url, hls_url }
  const [keyLoading,   setKeyLoading]   = useState(false);
  const [activeStreams, setActiveStreams] = useState([]);
  const [pollActive,   setPollActive]   = useState(false);
  const activeRef = useRef();

  // ── Local preview / record state ──
  const [mediaMode,   setMediaMode]   = useState("webcam"); // "webcam" | "screen"
  const [stream,      setStream]      = useState(null);
  const [recording,   setRecording]   = useState(false);
  const [recElapsed,  setRecElapsed]  = useState(0);
  const [blobUrl,     setBlobUrl]     = useState(null);
  const [recChunks,   setRecChunks]   = useState([]);
  const [uploading,   setUploading]   = useState(false);
  const [uploadRes,   setUploadRes]   = useState(null);
  const [recSize,     setRecSize]     = useState(0);

  // ── Simultaneous push state ──
  const [pushing,     setPushing]     = useState(false);   // "pushing to RTMP via fetch"
  const [pushStatus,  setPushStatus]  = useState(null);    // info string

  // ── Overlay meta ──
  const [meta, setMeta] = useState({
    channel_name:"NEWS 24", headline:"BREAKING NEWS", ticker:"Live broadcast in progress", badge_text:"LIVE"
  });

  const videoRef   = useRef();
  const mrRef      = useRef();
  const timerRef   = useRef();
  const chunksRef  = useRef([]);
  const sizeRef    = useRef(0);

  // ── Fetch RTMP key ──────────────────────────────────────────────────────────
  const fetchKey = async () => {
    setKeyLoading(true);
    try {
      const r = await fetch(`${apiBase}/stream/key`);
      const d = await r.json();
      setStreamInfo(d);
    } catch(e) { alert("Could not reach API: " + e.message); }
    setKeyLoading(false);
  };

  // ── Poll active streams ─────────────────────────────────────────────────────
  const startActivePoll = () => {
    setPollActive(true);
    const poll = async () => {
      try {
        const r = await fetch(`${apiBase}/stream/active`);
        const d = await r.json();
        setActiveStreams(d.active || []);
      } catch {}
    };
    poll();
    activeRef.current = setInterval(poll, 4000);
  };

  const stopActivePoll = () => {
    clearInterval(activeRef.current);
    setPollActive(false);
  };

  // ── Media capture ───────────────────────────────────────────────────────────
  const startPreview = async () => {
    try {
      const s = mediaMode === "webcam"
        ? await navigator.mediaDevices.getUserMedia({ video:true, audio:true })
        : await navigator.mediaDevices.getDisplayMedia({ video:true, audio:true });
      setStream(s);
      setBlobUrl(null);
      setUploadRes(null);
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
    } catch(e) { alert("Could not access media: " + e.message); }
  };

  const stopPreview = () => {
    stopRecording();
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setPushStatus(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // ── Recording ───────────────────────────────────────────────────────────────
  const startRecording = () => {
    if (!stream) return;
    chunksRef.current = [];
    sizeRef.current = 0;
    setBlobUrl(null);
    setUploadRes(null);
    setRecSize(0);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9" : "video/webm";
    const mr = new MediaRecorder(stream, { mimeType: mime });
    mr.ondataavailable = e => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
        sizeRef.current += e.data.size;
        setRecSize(sizeRef.current);
      }
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type:"video/webm" });
      setBlobUrl(URL.createObjectURL(blob));
      setRecChunks([...chunksRef.current]);
    };
    mr.start(500);
    mrRef.current = mr;
    setRecording(true);
    setRecElapsed(0);
    timerRef.current = setInterval(() => setRecElapsed(p => p + 1), 1000);
    setPushStatus("⏺ Recording locally…");
  };

  const stopRecording = () => {
    if (mrRef.current?.state !== "inactive") mrRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
    setPushing(false);
    setPushStatus(null);
  };

  // ── Simulate RTMP push status (real push happens via OBS / ffmpeg CLI) ──────
  const startRtmpPush = () => {
    if (!streamInfo) return;
    setPushing(true);
    setPushStatus(`🔴 Pushing to RTMP — use OBS or FFmpeg CLI with key below`);
  };

  const stopRtmpPush = () => {
    setPushing(false);
    setPushStatus(null);
  };

  // ── Start both simultaneously ────────────────────────────────────────────────
  const startLiveSession = async () => {
    if (!streamInfo) await fetchKey();
    await startPreview();
  };

  // ── Upload recorded clip ────────────────────────────────────────────────────
  const uploadRecording = async () => {
    if (!recChunks.length) return;
    setUploading(true);
    const blob = new Blob(recChunks, { type:"video/webm" });
    const fd = new FormData();
    fd.append("file", blob, "live-session.webm");
    Object.entries(meta).forEach(([k,v]) => fd.append(k,v));
    fd.append("enabled","true");
    try {
      const r = await fetch(`${apiBase}/video/upload-full`, { method:"POST", body:fd });
      const d = await r.json();
      setUploadRes(d);
    } catch(e) { setUploadRes({ error: e.message }); }
    setUploading(false);
  };

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearInterval(activeRef.current);
    stream?.getTracks().forEach(t => t.stop());
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const isLive = stream && (recording || pushing);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:16 }}>

      {/* ── LEFT COLUMN ─────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

        {/* Live Preview Panel */}
        <Panel
          title="Live Session"
          accent={isLive ? "var(--red)" : "var(--accent)"}
          badge={
            isLive
              ? <Pill color="var(--red)"><LiveDot/>ON AIR · {fmtTime(recElapsed)}{recSize > 0 ? ` · ${fmt(recSize)}` : ""}</Pill>
              : <Pill color="var(--muted)">STANDBY</Pill>
          }
        >
          {/* Source selector */}
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            {["webcam","screen"].map(m => (
              <button key={m} onClick={() => { if(!stream) setMediaMode(m); }}
                style={{
                  flex:1,padding:"7px 0",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,
                  fontSize:".9rem",letterSpacing:2,textTransform:"uppercase",
                  background: mediaMode===m ? (m==="webcam" ? "var(--green)" : "var(--accent)") : "var(--bg3)",
                  color: mediaMode===m ? "#000" : "var(--muted)",
                  border:`1px solid ${mediaMode===m ? (m==="webcam"?"var(--green)":"var(--accent)") : "var(--border)"}`,
                  cursor: stream ? "not-allowed":"pointer",transition:"all .2s"
                }}>
                {m === "webcam" ? "🎥 Webcam" : "🖥 Screen"}
              </button>
            ))}
          </div>

          {/* Video canvas */}
          <div style={{
            position:"relative", background:"#000", aspectRatio:"16/9",
            marginBottom:12, border:`1px solid ${isLive ? "rgba(255,60,95,.4)" : "var(--border)"}`,
            boxShadow: isLive ? "0 0 0 1px rgba(255,60,95,.2), 0 0 24px rgba(255,60,95,.08)" : "none",
            transition:"all .3s"
          }}>
            <video ref={videoRef} muted style={{ width:"100%",height:"100%",objectFit:"contain" }}/>

            {/* Overlay preview on video */}
            {isLive && (
              <>
                <div style={{ position:"absolute",top:10,left:10,background:"var(--red)",color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:".65rem",padding:"2px 8px",letterSpacing:2 }}>
                  {meta.badge_text || "LIVE"}
                </div>
                <div style={{ position:"absolute",top:10,right:10,color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".7rem",letterSpacing:2,textShadow:"0 1px 4px rgba(0,0,0,.8)" }}>
                  {meta.channel_name}
                </div>
                <div style={{ position:"absolute",bottom:20,left:0,right:0,background:"rgba(0,0,0,.82)",padding:"4px 10px" }}>
                  <div style={{ color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".85rem",letterSpacing:1 }}>{meta.headline}</div>
                </div>
                <div style={{ position:"absolute",bottom:0,left:0,right:0,background:"var(--red)",overflow:"hidden",height:20 }}>
                  <div style={{ height:"100%",display:"flex",alignItems:"center",animation:"ticker 12s linear infinite",whiteSpace:"nowrap" }}>
                    <span style={{ color:"#fff",fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",paddingLeft:"100%" }}>{meta.ticker}</span>
                  </div>
                </div>
              </>
            )}

            {!stream && (
              <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8 }}>
                <div style={{ fontSize:"3rem" }}>{mediaMode==="webcam"?"📷":"🖥"}</div>
                <span style={{ color:"var(--muted)",fontSize:".78rem",fontFamily:"'Share Tech Mono',monospace" }}>No preview — start session below</span>
              </div>
            )}

            {/* REC indicator */}
            {recording && (
              <div style={{ position:"absolute",bottom:46,right:10,display:"flex",alignItems:"center",gap:5,background:"rgba(0,0,0,.75)",padding:"3px 8px",borderRadius:2 }}>
                <LiveDot color="var(--red)"/>
                <span style={{ color:"#fff",fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem" }}>REC {fmtTime(recElapsed)}</span>
              </div>
            )}
          </div>

          {/* VU Meter */}
          {stream && (
            <div style={{ marginBottom:12 }}>
              <Tag label="AUDIO LEVELS"/>
              <div style={{ marginTop:4 }}><VuMeter stream={stream}/></div>
            </div>
          )}

          {/* Push status bar */}
          {pushStatus && (
            <div style={{ marginBottom:12,padding:"8px 12px",background:"rgba(255,60,95,.07)",border:"1px solid rgba(255,60,95,.25)",display:"flex",alignItems:"center",gap:10,fontSize:".78rem",color:"var(--red)",fontFamily:"'Share Tech Mono',monospace" }}>
              {(recording || pushing) && <Spinner size={14} color="var(--red)"/>}
              {pushStatus}
            </div>
          )}

          {/* Control buttons */}
          <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
            {!stream ? (
              /* ── Not started ── */
              <button onClick={startPreview}
                style={{ flex:1,padding:"10px 0",background:"var(--accent)",color:"#000",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:3,textTransform:"uppercase",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",transition:"all .2s" }}>
                ▶ Start Preview
              </button>
            ) : !recording ? (
              /* ── Preview active, not recording ── */
              <>
                <button onClick={() => { startRecording(); startRtmpPush(); }}
                  style={{ flex:2,padding:"10px 0",background:"var(--red)",color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:3,textTransform:"uppercase",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)" }}>
                  🔴 Go Live + Record
                </button>
                <button onClick={startRecording}
                  style={{ flex:1,padding:"10px 0",background:"var(--bg3)",color:"var(--green)",border:"1px solid var(--green)",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".85rem",letterSpacing:2,textTransform:"uppercase" }}>
                  ⏺ Record Only
                </button>
                <button onClick={stopPreview}
                  style={{ padding:"10px 14px",border:"1px solid var(--border)",color:"var(--muted)",fontSize:".8rem",letterSpacing:1 }}>
                  ✕ Stop
                </button>
              </>
            ) : (
              /* ── Recording in progress ── */
              <>
                <button onClick={stopRecording}
                  style={{ flex:1,padding:"10px 0",background:"var(--bg4)",color:"var(--red)",border:"1px solid var(--red)",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:3,textTransform:"uppercase" }}>
                  ⬛ Stop Recording
                </button>
                <button onClick={stopPreview}
                  style={{ padding:"10px 14px",border:"1px solid var(--border)",color:"var(--muted)",fontSize:".8rem",letterSpacing:1 }}>
                  End Session
                </button>
              </>
            )}
          </div>
        </Panel>

        {/* Recorded clip playback + upload */}
        {blobUrl && (
          <Panel title="Recorded Clip" accent="var(--green)"
            badge={<Pill color="var(--green)">READY · {fmt(recSize)}</Pill>}>
            <video controls src={blobUrl} style={{ width:"100%",background:"#000",maxHeight:260,display:"block",marginBottom:12 }}/>
            <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
              <a href={blobUrl} download="live-session.webm"
                style={{ display:"flex",alignItems:"center",gap:6,color:"var(--accent)",fontSize:".8rem",textDecoration:"none",fontFamily:"'Share Tech Mono',monospace" }}>
                ↓ Save WebM
              </a>
              <button onClick={uploadRecording} disabled={uploading}
                style={{ marginLeft:"auto",padding:"7px 20px",background: uploading?"var(--bg4)":"var(--accent)",color: uploading?"var(--muted)":"#000",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".9rem",letterSpacing:2,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)" }}>
                {uploading ? <Spinner size={14} color="var(--muted)"/> : "⬆ Upload & Process with Overlay"}
              </button>
            </div>
            {uploadRes && (
              <div style={{ marginTop:10,padding:"8px 12px",background:"var(--bg3)",border:"1px solid var(--border)",fontSize:".75rem",fontFamily:"'Share Tech Mono',monospace",color: uploadRes.error ? "var(--red)" : "var(--green)" }}>
                {uploadRes.error ? "✗ " + uploadRes.error : `✓ Queued · video_id: ${uploadRes.video_id} · task_id: ${uploadRes.task_id}`}
              </div>
            )}
          </Panel>
        )}

        {/* Active Streams Monitor */}
        <Panel title="Active RTMP Streams" accent="var(--amber)"
          badge={
            pollActive
              ? <Pill color="var(--green)"><LiveDot color="var(--green)"/>POLLING</Pill>
              : <Pill color="var(--muted)">IDLE</Pill>
          }>
          <div style={{ display:"flex",gap:8,marginBottom:12 }}>
            <button onClick={pollActive ? stopActivePoll : startActivePoll}
              style={{ padding:"6px 18px",background: pollActive?"var(--bg4)":"var(--amber)",color: pollActive?"var(--amber)":"#000",border:`1px solid ${pollActive?"var(--amber)":"transparent"}`,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".85rem",letterSpacing:2,textTransform:"uppercase" }}>
              {pollActive ? "⬛ Stop Polling" : "▶ Poll nginx-rtmp"}
            </button>
          </div>
          {activeStreams.length === 0 ? (
            <div style={{ padding:"14px 0",textAlign:"center",color:"var(--muted)",fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem" }}>
              {pollActive ? "No active streams detected…" : "Start polling to monitor live streams"}
            </div>
          ) : activeStreams.map(s => (
            <div key={s.stream_key} style={{ padding:"10px 12px",background:"var(--bg3)",border:"1px solid var(--border)",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <LiveDot color="var(--red)"/>
                <span style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"var(--accent)" }}>{s.stream_key.slice(0,12)}…</span>
              </div>
              <div style={{ display:"flex",gap:12 }}>
                <span style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"var(--muted)" }}>👁 {s.viewers}</span>
                <span style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"var(--muted)" }}>📡 {s.bw_kbps} kbps</span>
                <CopyButton text={s.hls_url}/>
              </div>
            </div>
          ))}
        </Panel>
      </div>

      {/* ── RIGHT COLUMN ────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

        {/* RTMP Connection Info */}
        <Panel title="RTMP Stream Key" accent="var(--accent)"
          badge={streamInfo ? <Pill color="var(--green)">KEY READY</Pill> : null}>
          {!streamInfo ? (
            <button onClick={fetchKey} disabled={keyLoading}
              style={{ width:"100%",padding:"9px 0",background:"var(--accent)",color:"#000",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:3,textTransform:"uppercase",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)" }}>
              {keyLoading ? <Spinner size={16} color="#000"/> : "Generate Stream Key"}
            </button>
          ) : (
            <div>
              <KeyRow label="STREAM KEY" value={streamInfo.stream_key}/>
              <KeyRow label="RTMP URL"   value={streamInfo.rtmp_url}/>
              <KeyRow label="HLS URL"    value={streamInfo.hls_url}/>

              <div style={{ marginTop:10,padding:"8px 10px",background:"var(--bg3)",border:"1px solid var(--border)",borderLeft:"2px solid var(--accent)" }}>
                <Tag label="OBS Settings"/>
                <div style={{ marginTop:6,fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"var(--muted)",lineHeight:1.8 }}>
                  Service: Custom<br/>
                  Server: <span style={{ color:"var(--accent)" }}>rtmp://localhost:1935/live</span><br/>
                  Stream Key: <span style={{ color:"var(--amber)" }}>{streamInfo.stream_key.slice(0,14)}…</span>
                </div>
              </div>

              <div style={{ marginTop:8,padding:"8px 10px",background:"var(--bg3)",border:"1px solid var(--border)",borderLeft:"2px solid var(--amber)" }}>
                <Tag label="FFmpeg CLI"/>
                <div style={{ marginTop:6,fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",color:"var(--muted)",lineHeight:1.8,wordBreak:"break-all" }}>
                  ffmpeg -re -i input.mp4 -c copy -f flv<br/>
                  <span style={{ color:"var(--amber)" }}>rtmp://localhost:1935/live/{streamInfo.stream_key}</span>
                </div>
              </div>

              <button onClick={fetchKey} style={{ marginTop:10,width:"100%",padding:"6px 0",background:"var(--bg3)",color:"var(--muted)",border:"1px solid var(--border)",fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",letterSpacing:1 }}>
                ↺ Regenerate Key
              </button>
            </div>
          )}
        </Panel>

        {/* HLS Player */}
        {streamInfo && (
          <Panel title="HLS Preview" accent="var(--red)"
            badge={<Pill color="var(--red)">LIVE PLAYBACK</Pill>}>
            <p style={{ fontSize:".72rem",color:"var(--muted)",marginBottom:10,lineHeight:1.6 }}>
              Paste your HLS URL into a player like VLC or hls.js to preview the live stream output from nginx-rtmp.
            </p>
            <div style={{ padding:"8px 10px",background:"var(--bg3)",border:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:6 }}>
              <Tag label="M3U8 Endpoint"/>
              <span style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"var(--accent)",wordBreak:"break-all" }}>{streamInfo.hls_url}</span>
              <CopyButton text={streamInfo.hls_url}/>
            </div>
            <div style={{ marginTop:10,padding:"8px 10px",background:"rgba(255,60,95,.06)",border:"1px solid rgba(255,60,95,.2)" }}>
              <Tag label="Tip" color="var(--red)"/>
              <p style={{ fontSize:".7rem",color:"var(--muted)",marginTop:4,lineHeight:1.6 }}>
                Stream must be live on nginx-rtmp before HLS segments are available. 15–20s latency is normal for HLS.
              </p>
            </div>
          </Panel>
        )}

        {/* Overlay Config */}
        <Panel title="Overlay Config" accent="var(--amber)"
          badge={<Pill color="var(--amber)">APPLIED ON UPLOAD</Pill>}>
          <p style={{ fontSize:".72rem",color:"var(--muted)",marginBottom:12,lineHeight:1.6 }}>
            Applied to the recorded clip when uploaded for FFmpeg processing.
          </p>
          {[
            { key:"channel_name", label:"Channel",  ph:"NEWS 24"              },
            { key:"headline",     label:"Headline", ph:"BREAKING NEWS"         },
            { key:"badge_text",   label:"Badge",    ph:"LIVE"                  },
            { key:"ticker",       label:"Ticker",   ph:"Live broadcast in progress…" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:10 }}>
              <label style={{ display:"block",fontSize:".65rem",fontFamily:"'Share Tech Mono',monospace",color:"var(--muted)",letterSpacing:1,marginBottom:4,textTransform:"uppercase" }}>{f.label}</label>
              <input value={meta[f.key]||""} onChange={e=>setMeta(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
                style={{ width:"100%",background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text)",padding:"6px 10px",fontSize:".8rem",fontFamily:"'Barlow',sans-serif",transition:"border-color .2s" }}
                onFocus={e=>e.target.style.borderColor="var(--amber)"}
                onBlur={e=>e.target.style.borderColor="var(--border)"}
              />
            </div>
          ))}

          {/* Mini overlay preview */}
          <div style={{ position:"relative",background:"#111",aspectRatio:"16/9",overflow:"hidden",border:"1px solid var(--border)",marginTop:4 }}>
            <div style={{ position:"absolute",top:6,left:6,background:"var(--red)",color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:".58rem",padding:"1px 6px",letterSpacing:2 }}>
              {meta.badge_text||"LIVE"}
            </div>
            <div style={{ position:"absolute",top:6,right:6,color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".6rem",letterSpacing:2 }}>
              {meta.channel_name||"NEWS 24"}
            </div>
            <div style={{ position:"absolute",bottom:16,left:0,right:0,background:"rgba(0,0,0,.85)",padding:"3px 8px" }}>
              <span style={{ color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".7rem",letterSpacing:1 }}>{meta.headline||"HEADLINE"}</span>
            </div>
            <div style={{ position:"absolute",bottom:0,left:0,right:0,background:"var(--red)",height:16,overflow:"hidden" }}>
              <div style={{ animation:"ticker 10s linear infinite",whiteSpace:"nowrap",display:"flex",alignItems:"center",height:"100%" }}>
                <span style={{ color:"#fff",fontFamily:"'Share Tech Mono',monospace",fontSize:".55rem",paddingLeft:"100%" }}>{meta.ticker||"Ticker…"}</span>
              </div>
            </div>
            <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center" }}>
              <span style={{ color:"var(--muted)",fontSize:".6rem",fontFamily:"'Share Tech Mono',monospace" }}>PREVIEW</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}