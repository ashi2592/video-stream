// ─── UPDATED StreamTab ────────────────────────────────────────────────────────
// Drop this in place of the StreamTab function in VideoPlatform.jsx
//
// Changes vs original:
//  • GET /stream/key now returns hls_url — no manual URL entry needed
//  • Polls GET /stream/active every 5 s to show ON AIR / OFFLINE badge
//  • Loads hls.js from CDN if not already on window (works with plain Vite/CRA)
//  • Shows OBS + FFmpeg copy-paste instructions
//  • Clear error state when nginx-rtmp has no segments yet

import { useState, useRef, useEffect } from "react";

// ── hls.js loader (CDN fallback so you don't need npm install hls.js) ─────────
function useHlsJs() {
  const [ready, setReady] = useState(!!window.Hls);
  useEffect(() => {
    if (window.Hls) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js";
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

export function StreamTab({ apiBase }) {
  const [streamInfo, setStreamInfo] = useState(null);   // /stream/key response
  const [loading,    setLoading]    = useState(false);
  const [playing,    setPlaying]    = useState(false);
  const [liveStatus, setLiveStatus] = useState("unknown"); // "live" | "offline" | "unknown"
  const [hlsError,   setHlsError]   = useState(null);
  const [copied,     setCopied]     = useState("");

  const videoRef   = useRef();
  const hlsRef     = useRef();
  const pollRef    = useRef();
  const hlsJsReady = useHlsJs();

  // ── Generate stream key ──────────────────────────────────────────────────
  const genKey = async () => {
    setLoading(true);
    setStreamInfo(null);
    setPlaying(false);
    setLiveStatus("unknown");
    setHlsError(null);
    try {
      const r = await fetch(`${apiBase}/stream/key`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setStreamInfo(d);
    } catch (e) {
      alert("Could not reach API: " + e.message);
    }
    setLoading(false);
  };

  // ── Poll /stream/active every 5 s once we have a key ─────────────────────
  useEffect(() => {
    if (!streamInfo?.stream_key) return;
    const check = async () => {
      try {
        const r = await fetch(`${apiBase}/stream/active`);
        const d = await r.json();
        const isLive = d.active?.some(s => s.stream_key === streamInfo.stream_key);
        setLiveStatus(isLive ? "live" : "offline");
      } catch {
        setLiveStatus("unknown");
      }
    };
    check();
    pollRef.current = setInterval(check, 5000);
    return () => clearInterval(pollRef.current);
  }, [streamInfo?.stream_key, apiBase]);

  // ── Start HLS playback ────────────────────────────────────────────────────
  const startWatch = () => {
    if (!streamInfo?.hls_url || !hlsJsReady) return;
    setHlsError(null);

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    if (window.Hls.isSupported()) {
      const hls = new window.Hls({
        liveSyncDurationCount:    3,
        liveMaxLatencyDurationCount: 6,
        manifestLoadingMaxRetry: 20,       // keep retrying until stream appears
        manifestLoadingRetryDelay: 2000,   // wait 2 s between retries
      });
      hls.loadSource(streamInfo.hls_url);
      hls.attachMedia(videoRef.current);

      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current.play();
        setPlaying(true);
      });

      hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case window.Hls.ErrorTypes.NETWORK_ERROR:
              // Stream not started yet — keep retrying silently
              hls.startLoad();
              break;
            case window.Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setHlsError("Stream error — is the broadcaster live?");
              setPlaying(false);
          }
        }
      });

      hlsRef.current = hls;
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      videoRef.current.src = streamInfo.hls_url;
      videoRef.current.play().then(() => setPlaying(true)).catch(e => setHlsError(e.message));
    } else {
      setHlsError("HLS not supported in this browser.");
    }
  };

  const stopWatch = () => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
    setPlaying(false);
    setHlsError(null);
  };

  useEffect(() => () => { if (hlsRef.current) hlsRef.current.destroy(); }, []);

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1800);
  };

  // ── Live badge ────────────────────────────────────────────────────────────
  const badgeColor = liveStatus === "live" ? "#ff3c5f" : liveStatus === "offline" ? "#546073" : "#ffb400";
  const badgeLabel = liveStatus === "live" ? "ON AIR" : liveStatus === "offline" ? "OFFLINE" : "CHECKING…";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>

      {/* ── Left: stream viewer ─────────────────────────────────────────── */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderTop: "2px solid var(--red)", display: "flex", flexDirection: "column",
        animation: "slide-up .35s ease both",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "1rem", letterSpacing: 2, textTransform: "uppercase", color: "var(--white)" }}>
            Live Stream Viewer
          </span>
          {streamInfo && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: `${badgeColor}18`, border: `1px solid ${badgeColor}40`,
              color: badgeColor, padding: "2px 10px", fontSize: ".68rem",
              fontFamily: "'Share Tech Mono',monospace", letterSpacing: 1, textTransform: "uppercase",
              clipPath: "polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: badgeColor, display: "inline-block", animation: liveStatus === "live" ? "pulse-dot 1.2s ease infinite" : "none" }}/>
              {badgeLabel}
            </span>
          )}
        </div>

        <div style={{ padding: 16, flex: 1 }}>
          {/* Video player */}
          <div style={{ position: "relative", background: "#000", aspectRatio: "16/9", marginBottom: 14, border: "1px solid var(--border)" }}>
            <video ref={videoRef} controls style={{ width: "100%", height: "100%", objectFit: "contain" }}/>
            {!playing && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, pointerEvents: "none" }}>
                <div style={{ fontSize: "2.5rem" }}>📡</div>
                <span style={{ color: "var(--muted)", fontSize: ".8rem", fontFamily: "'Share Tech Mono',monospace" }}>
                  {streamInfo ? (liveStatus === "live" ? "CLICK WATCH LIVE" : "WAITING FOR BROADCAST…") : "GENERATE A STREAM KEY FIRST"}
                </span>
              </div>
            )}
          </div>

          {/* HLS URL (read-only, for reference) */}
          {streamInfo && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: ".65rem", fontFamily: "'Share Tech Mono',monospace", color: "var(--muted)", letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" }}>
                HLS Playback URL
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg3)", border: "1px solid var(--border)", padding: "7px 10px" }}>
                <code style={{ flex: 1, fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "var(--green)", wordBreak: "break-all" }}>
                  {streamInfo.hls_url}
                </code>
                <button onClick={() => copy(streamInfo.hls_url, "hls")}
                  style={{ color: copied === "hls" ? "var(--green)" : "var(--muted)", fontSize: ".7rem", display: "flex", alignItems: "center", gap: 4, padding: "3px 6px" }}>
                  {copied === "hls" ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {hlsError && (
            <div style={{ marginBottom: 12, padding: "8px 12px", background: "rgba(255,60,95,.08)", border: "1px solid rgba(255,60,95,.25)", color: "var(--red)", fontSize: ".8rem" }}>
              ⚠ {hlsError}
            </div>
          )}

          {/* Offline warning */}
          {streamInfo && liveStatus === "offline" && !playing && (
            <div style={{ marginBottom: 12, padding: "8px 12px", background: "rgba(255,180,0,.06)", border: "1px solid rgba(255,180,0,.2)", color: "var(--amber)", fontSize: ".78rem", lineHeight: 1.6 }}>
              No broadcaster detected on this key yet.<br/>
              Start OBS or run the FFmpeg command below, then click Watch Live.
            </div>
          )}

          {/* Control button */}
          {streamInfo && (
            <button
              onClick={playing ? stopWatch : startWatch}
              disabled={!hlsJsReady}
              style={{
                width: "100%", padding: "10px 0",
                fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "1rem", letterSpacing: 3, textTransform: "uppercase",
                background: playing ? "var(--bg4)" : "var(--red)",
                color: playing ? "var(--red)" : "#fff",
                border: playing ? "1px solid var(--red)" : "none",
                clipPath: "polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",
              }}>
              {playing ? "⬛ Stop Watching" : "▶ Watch Live"}
            </button>
          )}
        </div>
      </div>

      {/* ── Right: stream key + instructions ────────────────────────────── */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderTop: "2px solid var(--amber)", display: "flex", flexDirection: "column",
        animation: "slide-up .35s ease both",
      }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "1rem", letterSpacing: 2, textTransform: "uppercase", color: "var(--white)" }}>
            Stream Key
          </span>
        </div>
        <div style={{ padding: 16, flex: 1 }}>
          <p style={{ fontSize: ".8rem", color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
            Generate a key, push RTMP from OBS or FFmpeg, then watch the live HLS stream in the player.
          </p>

          <button onClick={genKey} disabled={loading} style={{
            width: "100%", padding: "9px 0",
            background: loading ? "var(--bg4)" : "var(--amber)",
            color: loading ? "var(--muted)" : "#000",
            fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: ".95rem", letterSpacing: 3, marginBottom: 16,
            clipPath: "polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",
          }}>
            {loading ? "Generating…" : streamInfo ? "↻ New Key" : "Generate Stream Key"}
          </button>

          {streamInfo && (
            <div style={{ animation: "slide-up .25s ease" }}>
              {/* Stream key */}
              {[
                { label: "STREAM KEY", val: streamInfo.stream_key },
                { label: "RTMP PUSH URL", val: streamInfo.rtmp_url },
              ].map(row => (
                <div key={row.label} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: ".65rem", fontFamily: "'Share Tech Mono',monospace", color: "var(--muted)", letterSpacing: 1, marginBottom: 4, textTransform: "uppercase" }}>{row.label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg3)", border: "1px solid var(--border)", padding: "6px 10px" }}>
                    <code style={{ flex: 1, fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem", color: "var(--green)", wordBreak: "break-all" }}>{row.val}</code>
                    <button onClick={() => copy(row.val, row.label)}
                      style={{ color: copied === row.label ? "var(--green)" : "var(--muted)", fontSize: ".7rem", padding: "3px 6px", display: "flex", alignItems: "center", gap: 4 }}>
                      {copied === row.label ? "✓" : "Copy"}
                    </button>
                  </div>
                </div>
              ))}

              {/* OBS instructions */}
              <div style={{ marginTop: 8, padding: "10px 12px", background: "rgba(255,180,0,.05)", border: "1px solid rgba(255,180,0,.15)", fontSize: ".73rem", color: "var(--amber)", lineHeight: 1.8 }}>
                <div style={{ fontWeight: 700, marginBottom: 6, fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: 1 }}>OBS SETUP</div>
                Settings → Stream<br/>
                Service: <code style={{ fontFamily: "'Share Tech Mono',monospace" }}>Custom…</code><br/>
                Server: <code style={{ fontFamily: "'Share Tech Mono',monospace" }}>rtmp://localhost:1935/live</code><br/>
                Stream Key: <code style={{ fontFamily: "'Share Tech Mono',monospace", wordBreak: "break-all" }}>{streamInfo.stream_key}</code>
              </div>

              {/* FFmpeg command */}
              <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(0,212,255,.04)", border: "1px solid rgba(0,212,255,.15)", fontSize: ".73rem", color: "var(--accent)", lineHeight: 1.8 }}>
                <div style={{ fontWeight: 700, marginBottom: 6, fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: 1 }}>FFMPEG TEST PUSH</div>
                <code style={{ fontFamily: "'Share Tech Mono',monospace", wordBreak: "break-all", fontSize: ".68rem" }}>
                  ffmpeg -re -i input.mp4 -c copy -f flv \<br/>
                  &nbsp;&nbsp;{streamInfo.rtmp_url}
                </code>
                <button onClick={() => copy(`ffmpeg -re -i input.mp4 -c copy -f flv ${streamInfo.rtmp_url}`, "ffcmd")}
                  style={{ display: "block", marginTop: 6, color: copied === "ffcmd" ? "var(--green)" : "var(--muted)", fontSize: ".7rem" }}>
                  {copied === "ffcmd" ? "✓ Copied" : "Copy command"}
                </button>
              </div>

              {/* How it works */}
              <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg3)", border: "1px solid var(--border)", fontSize: ".72rem", color: "var(--muted)", lineHeight: 1.8 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, letterSpacing: 1, color: "var(--text)", marginBottom: 4 }}>HOW IT WORKS</div>
                OBS/FFmpeg → <span style={{ color: "var(--accent)" }}>RTMP :1935</span> → nginx-rtmp<br/>
                nginx writes HLS segments to disk<br/>
                Browser plays <span style={{ color: "var(--green)" }}>HLS :8080</span> via hls.js<br/>
                Latency: ~4–8 s (2 s segments × 2–4 buffer)
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}