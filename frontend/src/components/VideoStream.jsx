import { useState, useRef, useEffect, useCallback } from "react";
import { StreamTab } from "./StreamTab";
import {VideoGallery} from './VideoGallery'
import {StatusTab} from './StatusTab'
import {UploadTab} from './UploadTab'
import {
  Panel,
  Tag,
  Pill,
  LiveDot,
  Spinner,
  CopyButton
} from './SharedComponent'
import {Icon} from '../constant/icon'
import {fmt,fmtTime}  from '../utils'
// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DEFAULT_API = "http://localhost:8000";
const NGINX_API = "http://localhost:8080";

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


// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const TABS = [
  { id:"upload", label:"Upload",        Icon: Icon.Upload },
  { id:"stream", label:"Live Stream",   Icon: Icon.Stream },
  { id:"status", label:"Status / Play", Icon: Icon.Play   },
];

export default function VideoStream() {
  const [tab,     setTab]     = useState("upload");
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [liveBase, setLiveBase] = useState(NGINX_API);


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
        {tab === "stream" && <StreamTab apiBase={apiBase} streamBase={liveBase}/>}
        {tab === "status" && <StatusTab apiBase={apiBase}/>}
      </div>
    </>
  );
}