// ─── UPLOAD TAB ──────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import {
  Panel,
  Tag,
  Pill,
  Spinner,
  StatusChip,
} from './SharedComponent';
import { Icon } from '../constant/icon';

// Type definitions
interface MetaData {
  title: string;
  description: string;
  channel_name: string;
  headline: string;
  ticker: string;
  badge_text: string;
  [key: string]: string; // Index signature for dynamic access
}

interface UploadResult {
  video_id?: string;
  paths?: {
    mp4?: string;
    [key: string]: string | undefined;
  };
  error?: string;
  detail?: string;
  [key: string]: any;
}

interface VideoStatusResponse {
  status: 'queued' | 'processing' | 'ready' | 'failed';
  paths?: {
    mp4?: string;
  };
  error?: string;
  [key: string]: any;
}

interface UploadTabProps {
  apiBase: string;
}

// Helper function to format bytes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

type UploadStatus = "uploading" | "queued" | "processing" | "ready" | "failed" | null;

export const UploadTab = ({ apiBase }: UploadTabProps): JSX.Element => {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<MetaData>({
    title: "First video",
    description:"this is video descriptions",
    channel_name: "NEWS 24",
    headline: "BREAKING NEWS",
    ticker: "Stay tuned for updates",
    badge_text: "BREAKING"
  });
  const [prog, setProg] = useState<number>(0);
  const [status, setStatus] = useState<UploadStatus>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [drag, setDrag] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const pickFile = (f: File | undefined): void => {
    if (f && f.type.startsWith("video/")) {
      setFile(f);
    }
  };

  const startUpload = async (): Promise<void> => {
    if (!file) return;
    
    setStatus("uploading");
    setProg(0);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);
    Object.entries(meta).forEach(([k, v]) => v && fd.append(k, v));
    fd.append("enabled", "true");
    fd.append("user_id", "Ashsih");


    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${apiBase}/video/upload-full`);
      
      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable) {
          setProg(Math.round((e.loaded / e.total) * 100));
        }
      };
      
      xhr.onload = () => {
        const data: UploadResult = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) {
          setStatus("failed");
          setResult({ error: data.detail || "Upload failed" });
          return;
        }
        setResult(data);
        setStatus("queued");
        if (data.video_id) {
          pollStatus(data.video_id);
        }
      };
      
      xhr.onerror = () => {
        setStatus("failed");
        setResult({ error: "Network error" });
      };
      
      xhr.send(fd);
    } catch (e) {
      setStatus("failed");
      setResult({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  };

  const pollStatus = (vid: string): void => {
    if (pollRef.current) clearInterval(pollRef.current);
    
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${apiBase}/video/${vid}`);
        const d: VideoStatusResponse = await r.json();
        setStatus(d.status);
        
        if (d.status === "ready" || d.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setResult(prev => ({ ...prev, ...d }));
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const reset = (): void => {
    setFile(null);
    setStatus(null);
    setResult(null);
    setProg(0);
  };

  const handleMetaChange = (key: keyof MetaData, value: string): void => {
    setMeta(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
      {/* Left: drop zone + progress */}
      <Panel 
        title="Upload Video" 
        accent="var(--accent)" 
        badge={<Pill color="var(--accent)">MULTIPART</Pill>}
      >
        {/* Drop zone */}
        <div
          onClick={() => !file && inputRef.current?.click()}
          onDragOver={(e: React.DragEvent) => { 
            e.preventDefault(); 
            setDrag(true); 
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e: React.DragEvent) => { 
            e.preventDefault(); 
            setDrag(false); 
            pickFile(e.dataTransfer.files[0]); 
          }}
          style={{
            border: `1.5px dashed ${drag ? "var(--accent)" : file ? "var(--green)" : "var(--border)"}`,
            borderRadius: 2,
            padding: "28px 20px",
            textAlign: "center",
            cursor: file ? "default" : "pointer",
            background: drag ? "rgba(0,212,255,.05)" : "var(--bg3)",
            transition: "all .2s",
            marginBottom: 16,
          }}
        >
          <input 
            ref={inputRef} 
            type="file" 
            accept="video/*" 
            style={{ display: "none" }} 
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => pickFile(e.target.files?.[0])}
          />
          {file ? (
            <div>
              <div style={{ 
                fontFamily: "'Share Tech Mono',monospace", 
                color: "var(--green)", 
                fontSize: ".85rem", 
                marginBottom: 4 
              }}>
                {file.name}
              </div>
              <div style={{ color: "var(--muted)", fontSize: ".75rem" }}>
                {formatBytes(file.size)} · {file.type}
              </div>
              {status === null && (
                <button 
                  onClick={(e: React.MouseEvent) => { 
                    e.stopPropagation(); 
                    reset(); 
                  }} 
                  style={{ 
                    marginTop: 10, 
                    color: "var(--red)", 
                    fontSize: ".72rem", 
                    fontFamily: "'Share Tech Mono',monospace" 
                  }}
                >
                  ✕ Remove
                </button>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>⬆</div>
              <div style={{ color: "var(--white)", fontWeight: 600, marginBottom: 4 }}>
                Drop video file here
              </div>
              <div style={{ color: "var(--muted)", fontSize: ".8rem" }}>
                or click to browse · MP4, MOV, AVI, WebM · max 500 MB
              </div>
            </div>
          )}
        </div>

        {/* Progress */}
        {status === "uploading" && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              marginBottom: 6, 
              fontSize: ".75rem", 
              color: "var(--muted)" 
            }}>
              <span>UPLOADING</span>
              <span style={{ color: "var(--accent)", fontFamily: "'Share Tech Mono',monospace" }}>
                {prog}%
              </span>
            </div>
            <div style={{ height: 4, background: "var(--bg4)", borderRadius: 2 }}>
              <div style={{ 
                height: "100%", 
                width: `${prog}%`, 
                background: "linear-gradient(90deg,var(--accent),#00ffa3)", 
                borderRadius: 2, 
                transition: "width .3s" 
              }} />
            </div>
          </div>
        )}

        {/* Status messages */}
        {status && status !== "uploading" && (
          <div style={{ 
            marginBottom: 16, 
            padding: "10px 14px", 
            background: "var(--bg3)", 
            border: "1px solid var(--border)", 
            display: "flex", 
            alignItems: "center", 
            gap: 10 
          }}>
            {(status === "queued" || status === "processing") && <Spinner />}
            <div>
              <StatusChip status={status} />
              <div style={{ marginTop: 4, fontSize: ".75rem", color: "var(--muted)" }}>
                {status === "queued" && "Waiting for worker…"}
                {status === "processing" && "FFmpeg is applying your overlay…"}
                {status === "ready" && "✓ Your video is ready to play"}
                {status === "failed" && (result?.error || "Processing failed")}
              </div>
            </div>
          </div>
        )}

        {/* Action button */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={startUpload}
            disabled={!file || !!status}
            style={{
              flex: 1,
              padding: "10px 0",
              background: (!file || !!status) ? "var(--bg4)" : "var(--accent)",
              color: (!file || !!status) ? "var(--muted)" : "#000",
              fontFamily: "'Barlow Condensed',sans-serif",
              fontWeight: 700,
              fontSize: "1rem",
              letterSpacing: 3,
              textTransform: "uppercase",
              transition: "all .2s",
              clipPath: "polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)"
            }}
          >
            {status === "uploading" ? "Uploading…" : "Upload & Process"}
          </button>
          {(status === "ready" || status === "failed") && (
            <button 
              onClick={reset} 
              style={{ 
                padding: "10px 18px", 
                border: "1px solid var(--border)", 
                color: "var(--muted)", 
                fontSize: ".85rem", 
                letterSpacing: 1 
              }}
            >
              Reset
            </button>
          )}
        </div>

        {/* Playback */}
        {status === "ready" && result?.paths?.mp4 && (
          <div style={{ marginTop: 16 }}>
            <Tag label="OUTPUT · MP4" />
            <video 
              controls 
              style={{ 
                width: "100%", 
                marginTop: 8, 
                background: "#000", 
                maxHeight: 320 
              }}
              src={`${apiBase}/${result.paths.mp4}`}
            />
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <a 
                href={`${apiBase}/${result.paths.mp4}`} 
                download 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 6, 
                  color: "var(--accent)", 
                  fontSize: ".8rem", 
                  textDecoration: "none" 
                }}
              >
                <Icon.Download /> Download MP4
              </a>
            </div>
          </div>
        )}
      </Panel>

      {/* Right: overlay metadata form */}
      <Panel 
        title="Overlay Config" 
        accent="var(--amber)" 
        badge={<Pill color="var(--amber)">NEWS LOWER THIRD</Pill>}
      >
        {[
          { key: "title" as const, label: "Video Title", ph: "My Broadcast" },
           { key: "description" as const, label: "Video Descriptions", ph: "My Broadcast" },
          { key: "channel_name" as const, label: "Channel Name", ph: "NEWS 24" },
          { key: "headline" as const, label: "Headline", ph: "BREAKING NEWS" },
          { key: "badge_text" as const, label: "Badge Text", ph: "BREAKING" },
          { key: "ticker" as const, label: "Ticker Text", ph: "Stay tuned for updates…" },
        ].map(({ key, label, ph }) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <label style={{ 
              display: "block", 
              fontSize: ".65rem", 
              fontFamily: "'Share Tech Mono',monospace", 
              color: "var(--muted)", 
              letterSpacing: 1, 
              marginBottom: 4, 
              textTransform: "uppercase" 
            }}>
              {label}
            </label>
            <input
              value={meta[key] || ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleMetaChange(key, e.target.value)}
              placeholder={ph}
              disabled={!!status && status !== null}
              style={{
                width: "100%",
                background: "var(--bg3)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                padding: "7px 10px",
                fontSize: ".82rem",
                fontFamily: "'Barlow',sans-serif",
                transition: "border-color .2s"
              }}
              onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.target.style.borderColor = "var(--accent)"}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => e.target.style.borderColor = "var(--border)"}
            />
          </div>
        ))}
      </Panel>
    </div>
  );
};

export default UploadTab;