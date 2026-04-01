import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const DEFAULT_API = "http://localhost:8000";
const NGINX_API = "http://localhost:8080";

// ─── STYLES ───────────────────────────────────────────────────────────────────
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@300;400;500;600&family=Share+Tech+Mono&display=swap');`;

const CSS = `
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
    background: repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,255,255,0.01) 3px,rgba(0,255,255,0.01) 4px);
  }
  ::-webkit-scrollbar { width:5px; } ::-webkit-scrollbar-track { background:var(--bg2); }
  ::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }
  button { cursor:pointer; border:none; background:none; font-family:inherit; }
  video { display:block; }

  @keyframes pulse-dot   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.6)} }
  @keyframes spin        { to{transform:rotate(360deg)} }
  @keyframes slide-up    { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fade-in     { from{opacity:0} to{opacity:1} }
  @keyframes blink       { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes scan-line   { 0%{top:-4px} 100%{top:100%} }
  @keyframes ticker      { 0%{transform:translateX(100%)} 100%{transform:translateX(-100%)} }
  @keyframes ctrl-reveal { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

  .player-wrapper:hover .ctrl-bar    { opacity: 1 !important; transform: translateY(0) !important; }
  .player-wrapper:hover .top-bar     { opacity: 1 !important; }
  .player-wrapper.paused .ctrl-bar   { opacity: 1 !important; transform: translateY(0) !important; }
  .player-wrapper.paused .top-bar    { opacity: 1 !important; }

  .seek-bar {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    transition: height .15s;
  }
  .seek-bar:hover { height: 6px; }
  .seek-bar::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    box-shadow: 0 0 8px rgba(0,212,255,.5);
  }
  .seek-bar::-moz-range-thumb {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    border: none;
  }

  .vol-bar {
    -webkit-appearance: none;
    appearance: none;
    width: 72px;
    height: 3px;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }
  .vol-bar::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 11px; height: 11px;
    border-radius: 50%;
    background: var(--white);
    cursor: pointer;
  }

  .ctrl-btn {
    display: flex; align-items: center; justify-content: center;
    width: 36px; height: 36px;
    border-radius: 2px;
    color: var(--white);
    transition: background .15s, color .15s, transform .1s;
  }
  .ctrl-btn:hover { background: rgba(255,255,255,.08); transform: scale(1.08); }
  .ctrl-btn:active { transform: scale(.95); }

  .skip-flash {
    position: absolute; top: 50%; transform: translateY(-50%);
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 1.1rem; font-weight: 700; letter-spacing: 2px;
    color: #fff; pointer-events: none;
    text-shadow: 0 2px 10px rgba(0,0,0,.8);
    animation: fade-in .1s ease, skip-out .6s .1s ease forwards;
  }
  @keyframes skip-out { 0%{opacity:1} 100%{opacity:0;transform:translateY(-60%) scale(1.15)} }
`;

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function fmtTime(s) {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${m}:${String(sec).padStart(2,"0")}`;
}

// ─── ICONS ───────────────────────────────────────────────────────────────────
const IC = {
  Play:     () => <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>,
  Pause:    () => <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  Back10:   () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" d="M12 5V3L8 6l4 3V7a6 6 0 110 12 6 6 0 01-6-5.5"/>
      <text x="8.5" y="15" fontSize="6" fill="currentColor" stroke="none" fontFamily="sans-serif" fontWeight="bold">10</text>
    </svg>
  ),
  Fwd10:    () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" d="M12 5V3l4 3-4 3V7a6 6 0 100 12 6 6 0 006-5.5"/>
      <text x="8.5" y="15" fontSize="6" fill="currentColor" stroke="none" fontFamily="sans-serif" fontWeight="bold">10</text>
    </svg>
  ),
  VolOn:    () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M11 5L6 9H2v6h4l5 4V5z"/><path strokeLinecap="round" d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>,
  VolOff:   () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>,
  Fullscr:  () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>,
  ExitFull: () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>,
  Live:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/><path fill="none" stroke="currentColor" strokeWidth="1.5" d="M4.93 4.93a10 10 0 000 14.14M19.07 4.93a10 10 0 010 14.14M7.76 7.76a6 6 0 000 8.49M16.24 7.76a6 6 0 010 8.49"/></svg>,
  Pip:      () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>,
  Err:      () => <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.3}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r=".5" fill="currentColor"/></svg>,
  Loading:  () => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{animation:"spin 1s linear infinite"}}><circle cx="12" cy="12" r="10" strokeOpacity=".2"/><path d="M22 12a10 10 0 00-10-10"/></svg>,
};

// ─── LIVE DOT ─────────────────────────────────────────────────────────────────
function LiveDot({ color = "#ff3c5f", size = 7 }) {
  return <span style={{ width:size, height:size, borderRadius:"50%", background:color, display:"inline-block", animation:"pulse-dot 1.2s ease infinite", flexShrink:0 }}/>;
}

// ─── SKIP FLASH ───────────────────────────────────────────────────────────────
function SkipFlash({ dir, trigger }) {
  const [show, setShow] = useState(false);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (trigger > 0) { setShow(true); setKey(k => k+1); const t = setTimeout(() => setShow(false), 700); return () => clearTimeout(t); }
  }, [trigger]);
  if (!show) return null;
  return (
    <div key={key} className="skip-flash" style={{ [dir === "back" ? "left" : "right"]: "18%" }}>
      {dir === "back" ? "◀ 10s" : "10s ▶"}
    </div>
  );
}

// ─── MAIN HLS PLAYER ─────────────────────────────────────────────────────────
export default function HLSPlayer() {
  const [searchParams] = useSearchParams();
  const videoId   = searchParams.get("video_id");
  const streamKey = searchParams.get("stream_key");
  const apiBase   = (searchParams.get("api") || DEFAULT_API).replace(/\/+$/, "");

  const isLive    = !!streamKey;
  const isVod     = !!videoId && !isLive;

  // player state
  const videoRef      = useRef(null);
  const wrapperRef    = useRef(null);
  const hlsRef        = useRef(null);
  const progressTimer = useRef(null);

  const [vodMeta,    setVodMeta]    = useState(null);   // fetched from /video/:id
  const [srcUrl,     setSrcUrl]     = useState(null);
  const [playerErr,  setPlayerErr]  = useState(null);
  const [loading,    setLoading]    = useState(true);

  const [playing,    setPlaying]    = useState(false);
  const [currentT,   setCurrentT]   = useState(0);
  const [duration,   setDuration]   = useState(0);
  const [buffered,   setBuffered]   = useState(0);
  const [volume,     setVolume]     = useState(1);
  const [muted,      setMuted]      = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [quality,    setQuality]    = useState("Auto");
  const [qualities,  setQualities]  = useState([]);
  const [liveEdge,   setLiveEdge]   = useState(false);   // are we at live edge?

  const [backFlash,  setBackFlash]  = useState(0);
  const [fwdFlash,   setFwdFlash]   = useState(0);

  // ── 1. Resolve source URL ──────────────────────────────────────────────────
  useEffect(() => {
    if (!videoId && !streamKey) { setPlayerErr("No video_id or stream_key provided in URL params."); setLoading(false); return; }

    if (isLive) {
      // live HLS: /live/<stream_key>/index.m3u8
      setSrcUrl(`${NGINX_API}/hls/${streamKey}.m3u8`);
      setLoading(false);
    } else {
      // VOD: fetch metadata from API
      (async () => {
        try {
          const r = await fetch(`${apiBase}/video/${videoId}`);
          if (!r.ok) throw new Error(`${r.status} — Video not found`);
          const d = await r.json();
          setVodMeta(d);
          if (d.status !== "ready") { setPlayerErr(`Video is not ready — status: ${d.status}`); setLoading(false); return; }
          // prefer HLS, fall back to MP4
          const url = d.paths?.hls
            ? `${apiBase}/${d.paths.hls}`
            : d.paths?.mp4
            ? `${apiBase}/${d.paths.mp4}`
            : null;
          if (!url) throw new Error("No playable URL found for this video.");
          setSrcUrl(url);
        } catch(e) { setPlayerErr(e.message); }
        setLoading(false);
      })();
    }
  }, [videoId, streamKey, apiBase, isLive]);

  // ── 2. Mount HLS.js or native ──────────────────────────────────────────────
  useEffect(() => {
    if (!srcUrl || !videoRef.current) return;
    const vid = videoRef.current;

    const tryPlay = () => { vid.play().catch(() => {}); };

    const isM3U8 = srcUrl.endsWith(".m3u8");

    if (isM3U8) {
      if (window.Hls && window.Hls.isSupported()) {
        if (hlsRef.current) hlsRef.current.destroy();
        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: isLive,
          backBufferLength: isLive ? 10 : 90,
        });
        hlsRef.current = hls;
        hls.loadSource(srcUrl);
        hls.attachMedia(vid);
        hls.on(window.Hls.Events.MANIFEST_PARSED, (_, data) => {
          const lvls = data.levels.map((l, i) => ({ index:i, label: l.height ? `${l.height}p` : `Level ${i}` }));
          setQualities(["Auto", ...lvls.map(l => l.label)]);
          if (isLive) tryPlay();
        });
        hls.on(window.Hls.Events.ERROR, (_, d) => {
          if (d.fatal) setPlayerErr(`HLS error: ${d.details}`);
        });
      } else if (vid.canPlayType("application/vnd.apple.mpegurl")) {
        vid.src = srcUrl;
        if (isLive) tryPlay();
      } else {
        setPlayerErr("HLS is not supported in this browser. Please use Chrome or Firefox.");
        return;
      }
    } else {
      vid.src = srcUrl;
    }

    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [srcUrl, isLive]);

  // ── 3. Video event listeners ───────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onPlay      = () => setPlaying(true);
    const onPause     = () => setPlaying(false);
    const onDuration  = () => setDuration(vid.duration);
    const onTime      = () => {
      setCurrentT(vid.currentTime);
      if (vid.buffered.length) setBuffered(vid.buffered.end(vid.buffered.length - 1));
      if (isLive && isFinite(vid.duration)) {
        setLiveEdge(vid.duration - vid.currentTime < 8);
      }
    };
    const onVolume    = () => { setVolume(vid.volume); setMuted(vid.muted); };
    const onWaiting   = () => setLoading(true);
    const onCanPlay   = () => setLoading(false);
    const onError     = () => setPlayerErr("Media error — stream may be offline.");

    vid.addEventListener("play",         onPlay);
    vid.addEventListener("pause",        onPause);
    vid.addEventListener("durationchange", onDuration);
    vid.addEventListener("timeupdate",   onTime);
    vid.addEventListener("volumechange", onVolume);
    vid.addEventListener("waiting",      onWaiting);
    vid.addEventListener("canplay",      onCanPlay);
    vid.addEventListener("error",        onError);

    return () => {
      vid.removeEventListener("play",           onPlay);
      vid.removeEventListener("pause",          onPause);
      vid.removeEventListener("durationchange", onDuration);
      vid.removeEventListener("timeupdate",     onTime);
      vid.removeEventListener("volumechange",   onVolume);
      vid.removeEventListener("waiting",        onWaiting);
      vid.removeEventListener("canplay",        onCanPlay);
      vid.removeEventListener("error",          onError);
    };
  }, [isLive]);

  // ── 4. Fullscreen listener ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── 5. Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT") return;
      const vid = videoRef.current;
      if (!vid) return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      if (e.code === "ArrowLeft"  && isVod) { e.preventDefault(); skip(-10); }
      if (e.code === "ArrowRight" && isVod) { e.preventDefault(); skip(10); }
      if (e.code === "KeyM") { vid.muted = !vid.muted; }
      if (e.code === "KeyF") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isVod]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) vid.play().catch(()=>{});
    else vid.pause();
  }, []);

  const skip = useCallback((secs) => {
    const vid = videoRef.current;
    if (!vid || isLive) return;
    vid.currentTime = Math.max(0, Math.min(vid.duration, vid.currentTime + secs));
    if (secs < 0) setBackFlash(n => n+1);
    else          setFwdFlash(n => n+1);
  }, [isLive]);

  const seekTo = useCallback((pct) => {
    const vid = videoRef.current;
    if (!vid || isLive) return;
    vid.currentTime = pct * vid.duration;
  }, [isLive]);

  const setVol = useCallback((v) => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.volume = v;
    vid.muted  = v === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!fullscreen) wrapperRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }, [fullscreen]);

  const goLiveEdge = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !isLive) return;
    vid.currentTime = vid.duration;
    vid.play().catch(()=>{});
  }, [isLive]);

  const pip = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    else vid.requestPictureInPicture?.().catch(()=>{});
  }, []);

  const changeQuality = useCallback((label) => {
    setQuality(label);
    if (!hlsRef.current) return;
    if (label === "Auto") { hlsRef.current.currentLevel = -1; return; }
    const idx = qualities.findIndex(q => q === label) - 1; // offset by "Auto"
    hlsRef.current.currentLevel = idx;
  }, [qualities]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const seekPct     = duration > 0 ? (currentT / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const title       = isLive ? `LIVE · ${streamKey}` : (vodMeta?.title || vodMeta?.filename || videoId || "Video");

  // ── Error / loading screens ────────────────────────────────────────────────
  if (!videoId && !streamKey) {
    return (
      <>
        <style>{FONTS}{CSS}</style>
        <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)" }}>
          <div style={{ textAlign:"center", animation:"slide-up .4s ease" }}>
            <div style={{ color:"var(--red)", marginBottom:16 }}><IC.Err/></div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:"1.4rem", letterSpacing:3, color:"var(--white)", marginBottom:8 }}>NO SOURCE</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".8rem", color:"var(--muted)" }}>
              Provide <span style={{ color:"var(--accent)" }}>?video_id=</span> or <span style={{ color:"var(--amber)" }}>?stream_key=</span> in URL
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{FONTS}{CSS}</style>
      {/* HLS.js CDN */}
      <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js" />

      <div style={{
        minHeight:"100vh", background:"var(--bg)",
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        padding:"24px 16px",
      }}>

        {/* Title bar */}
        <div style={{
          width:"100%", maxWidth:960,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          marginBottom:14, animation:"slide-up .3s ease",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {isLive && <LiveDot color="var(--red)" size={9}/>}
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"1.5rem", letterSpacing:4, color:"var(--white)", lineHeight:1 }}>
              {title}
            </div>
            {isLive && (
              <span style={{
                background:"var(--red)", color:"#fff",
                fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700,
                fontSize:".72rem", letterSpacing:3, padding:"2px 9px",
                clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)"
              }}>LIVE</span>
            )}
            {isVod && (
              <span style={{
                background:"rgba(0,212,255,.12)", border:"1px solid rgba(0,212,255,.3)", color:"var(--accent)",
                fontFamily:"'Share Tech Mono',monospace", fontSize:".68rem", letterSpacing:2, padding:"2px 10px",
              }}>VOD</span>
            )}
          </div>
          {isVod && vodMeta && (
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".68rem", color:"var(--muted)", letterSpacing:1 }}>
              ID: <span style={{ color:"var(--text)" }}>{videoId}</span>
            </div>
          )}
        </div>

        {/* Player */}
        <div
          ref={wrapperRef}
          className={`player-wrapper${!playing ? " paused" : ""}`}
          style={{
            position:"relative", width:"100%", maxWidth:960,
            background:"#000", aspectRatio:"16/9",
            border:"1px solid var(--border)",
            boxShadow:"0 0 60px rgba(0,0,0,.7), 0 0 1px var(--border)",
            overflow:"hidden",
            animation:"slide-up .4s .05s ease both",
          }}
        >
          {/* CRT scanline overlay */}
          <div style={{
            position:"absolute", inset:0, pointerEvents:"none", zIndex:5,
            background:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.06) 3px,rgba(0,0,0,.06) 4px)"
          }}/>

          {/* Scan sweep (live only) */}
          {isLive && (
            <div style={{
              position:"absolute", left:0, right:0, height:2, zIndex:6,
              background:"linear-gradient(90deg,transparent,rgba(0,212,255,.15),transparent)",
              animation:"scan-line 5s linear infinite", pointerEvents:"none"
            }}/>
          )}

          {/* Video element */}
          <video
            ref={videoRef}
            style={{ width:"100%", height:"100%", objectFit:"contain" }}
            playsInline
            onClick={togglePlay}
          />

          {/* Loading overlay */}
          {loading && (
            <div style={{
              position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
              background:"rgba(0,0,0,.6)", zIndex:10, flexDirection:"column", gap:16
            }}>
              <div style={{ color:"var(--accent)" }}><IC.Loading/></div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".72rem", color:"var(--muted)", letterSpacing:2 }}>
                {isLive ? "CONNECTING TO STREAM…" : "LOADING…"}
              </div>
            </div>
          )}

          {/* Error overlay */}
          {playerErr && (
            <div style={{
              position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
              background:"rgba(0,0,0,.85)", zIndex:10, flexDirection:"column", gap:12
            }}>
              <div style={{ color:"var(--red)" }}><IC.Err/></div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:"1.1rem", letterSpacing:2, color:"var(--red)" }}>STREAM ERROR</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".75rem", color:"var(--muted)", maxWidth:380, textAlign:"center", lineHeight:1.6 }}>{playerErr}</div>
            </div>
          )}

          {/* Skip flash */}
          <SkipFlash dir="back" trigger={backFlash}/>
          <SkipFlash dir="fwd"  trigger={fwdFlash}/>

          {/* Top bar (meta + live badge) */}
          <div style={{
            position:"absolute", top:0, left:0, right:0, zIndex:8,
            background:"linear-gradient(to bottom, rgba(0,0,0,.75) 0%, transparent 100%)",
            padding:"12px 16px",
            display:"flex", alignItems:"center", gap:10,
            opacity:0, transition:"opacity .25s",
          }} className="top-bar">
            {isLive && <LiveDot color="var(--red)"/>}
            <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:600, fontSize:".9rem", letterSpacing:2, color:"#fff" }}>
              {title}
            </span>
            {isLive && !liveEdge && (
              <button onClick={goLiveEdge} style={{
                marginLeft:"auto", display:"flex", alignItems:"center", gap:5,
                background:"var(--red)", color:"#fff",
                fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:".7rem", letterSpacing:2,
                padding:"3px 10px",
                clipPath:"polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)"
              }}>
                <IC.Live/> GO LIVE
              </button>
            )}
          </div>

          {/* Bottom control bar */}
          <div
            className="ctrl-bar"
            style={{
              position:"absolute", bottom:0, left:0, right:0, zIndex:9,
              background:"linear-gradient(to top, rgba(0,0,0,.9) 0%, transparent 100%)",
              padding:"32px 16px 12px",
              opacity:0, transform:"translateY(6px)", transition:"opacity .25s, transform .25s",
            }}
          >
            {/* Seek bar (VOD only) */}
            {isVod && (
              <div style={{ position:"relative", marginBottom:10 }}>
                {/* Buffered track */}
                <div style={{
                  position:"absolute", left:0, top:"50%", transform:"translateY(-50%)",
                  height:4, width:`${bufferedPct}%`, background:"rgba(255,255,255,.15)",
                  borderRadius:2, pointerEvents:"none", zIndex:1
                }}/>
                <input
                  type="range" className="seek-bar"
                  min={0} max={100} step={0.05}
                  value={seekPct}
                  onChange={e => seekTo(Number(e.target.value) / 100)}
                  style={{
                    background:`linear-gradient(to right, var(--accent) 0%, var(--accent) ${seekPct}%, rgba(255,255,255,.12) ${seekPct}%, rgba(255,255,255,.12) 100%)`,
                    position:"relative", zIndex:2,
                  }}
                />
              </div>
            )}

            {/* Live seek bar (DVR — show if live + duration > 60s) */}
            {isLive && duration > 60 && (
              <div style={{ position:"relative", marginBottom:10 }}>
                <input
                  type="range" className="seek-bar"
                  min={0} max={100} step={0.05}
                  value={seekPct}
                  onChange={e => seekTo(Number(e.target.value) / 100)}
                  style={{
                    background:`linear-gradient(to right, var(--red) 0%, var(--red) ${seekPct}%, rgba(255,255,255,.12) ${seekPct}%, rgba(255,255,255,.12) 100%)`,
                  }}
                />
                <div style={{ display:"flex", justifyContent:"flex-end", marginTop:2 }}>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".62rem", color:"var(--red)", letterSpacing:1 }}>
                    {liveEdge ? "● LIVE" : `DVR · -${fmtTime(duration - currentT)}`}
                  </span>
                </div>
              </div>
            )}

            {/* Controls row */}
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>

              {/* Play/Pause */}
              <button className="ctrl-btn" onClick={togglePlay}>
                {playing ? <IC.Pause/> : <IC.Play/>}
              </button>

              {/* Skip back (VOD only) */}
              {isVod && (
                <button className="ctrl-btn" onClick={() => skip(-10)} title="Back 10s (←)">
                  <IC.Back10/>
                </button>
              )}

              {/* Skip forward (VOD only) */}
              {isVod && (
                <button className="ctrl-btn" onClick={() => skip(10)} title="Forward 10s (→)">
                  <IC.Fwd10/>
                </button>
              )}

              {/* Time display */}
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".75rem", color:"var(--muted)", minWidth:90, marginLeft:4 }}>
                {isLive ? (
                  <span style={{ color: liveEdge ? "var(--red)" : "var(--amber)", letterSpacing:1 }}>
                    {liveEdge ? "● LIVE" : `DVR`}
                  </span>
                ) : (
                  <span>{fmtTime(currentT)} <span style={{ opacity:.4 }}>/</span> {fmtTime(duration)}</span>
                )}
              </div>

              {/* Spacer */}
              <div style={{ flex:1 }}/>

              {/* Volume */}
              <button className="ctrl-btn" onClick={toggleMute}>
                {muted || volume === 0 ? <IC.VolOff/> : <IC.VolOn/>}
              </button>
              <input
                type="range" className="vol-bar"
                min={0} max={1} step={0.01}
                value={muted ? 0 : volume}
                onChange={e => setVol(Number(e.target.value))}
                style={{
                  background:`linear-gradient(to right,rgba(255,255,255,.8) 0%,rgba(255,255,255,.8) ${(muted?0:volume)*100}%,rgba(255,255,255,.15) ${(muted?0:volume)*100}%,rgba(255,255,255,.15) 100%)`,
                }}
              />

              {/* Quality selector */}
              {qualities.length > 0 && (
                <select
                  value={quality}
                  onChange={e => changeQuality(e.target.value)}
                  style={{
                    background:"var(--bg3)", border:"1px solid var(--border)",
                    color:"var(--text)", padding:"3px 8px",
                    fontFamily:"'Share Tech Mono',monospace", fontSize:".68rem",
                    letterSpacing:1, cursor:"pointer",
                  }}
                >
                  {qualities.map(q => <option key={q}>{q}</option>)}
                </select>
              )}

              {/* PiP */}
              {document.pictureInPictureEnabled && (
                <button className="ctrl-btn" onClick={pip} title="Picture-in-Picture" style={{ width:28, height:28 }}>
                  <IC.Pip/>
                </button>
              )}

              {/* Fullscreen */}
              <button className="ctrl-btn" onClick={toggleFullscreen} title="Fullscreen (F)" style={{ width:28, height:28 }}>
                {fullscreen ? <IC.ExitFull/> : <IC.Fullscr/>}
              </button>
            </div>
          </div>
        </div>

        {/* VOD metadata strip */}
        {isVod && vodMeta && (
          <div style={{
            width:"100%", maxWidth:960, marginTop:16,
            display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10,
            animation:"slide-up .4s .15s ease both",
          }}>
            {[
              { label:"STATUS",   val: vodMeta.status?.toUpperCase() || "—",                        col: vodMeta.status === "ready" ? "var(--green)" : "var(--amber)" },
              { label:"DURATION", val: fmtTime(duration),                                            col: "var(--text)" },
              { label:"CHANNEL",  val: vodMeta.overlay?.channel_name || "—",                        col: "var(--text)" },
              { label:"HEADLINE", val: vodMeta.overlay?.headline     || "—",                        col: "var(--accent)" },
              { label:"CREATED",  val: vodMeta.created_at ? new Date(vodMeta.created_at).toLocaleDateString() : "—", col:"var(--muted)" },
            ].map(c => (
              <div key={c.label} style={{
                background:"var(--bg2)", border:"1px solid var(--border)",
                borderTop:`2px solid ${c.col}22`, padding:"10px 14px"
              }}>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".62rem", color:"var(--muted)", letterSpacing:2, textTransform:"uppercase", marginBottom:4 }}>{c.label}</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:600, fontSize:"1rem", color:c.col, letterSpacing:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Keyboard shortcut hint */}
        <div style={{
          marginTop:12,
          fontFamily:"'Share Tech Mono',monospace", fontSize:".65rem", color:"var(--border)",
          letterSpacing:1, textAlign:"center",
          animation:"slide-up .4s .25s ease both",
        }}>
          {isVod
            ? "SPACE · play/pause   ←/→ · skip 10s   M · mute   F · fullscreen"
            : "SPACE · play/pause   M · mute   F · fullscreen"}
        </div>
      </div>
    </>
  );
}