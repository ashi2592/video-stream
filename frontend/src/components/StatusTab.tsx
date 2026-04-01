// ─── STATUS / PLAYBACK TAB ────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Add this import for navigation
import {
  Panel,
  Tag,
  Pill,
  LiveDot,
  Spinner,
  CopyButton,
  StatusChip,
} from './SharedComponent'

import {Icon} from '../constant/icon'

// Type definitions
interface OverlayConfig {
  channel_name?: string;
  headline?: string;
  ticker?: string;
  badge_text?: string;
  enabled?: boolean;
  [key: string]: any;
}

interface VideoDoc {
  id: string;
  title?: string | null;
  filename?: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  size_bytes?: number;
  created_at?: string;
  task_id?: string;
  paths?: {
    mp4?: string;
    [key: string]: string | undefined;
  };
  overlay?: OverlayConfig;
  error?: string;
}

interface VideoListResponse {
  count: number;
  videos: VideoDoc[];
}

interface StatusTabProps {
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

export const StatusTab = ({ apiBase }: StatusTabProps): JSX.Element => {
  const navigate = useNavigate(); // Add navigation hook
  const [videoId, setVideoId] = useState<string>("");
  const [doc, setDoc] = useState<VideoDoc | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState<boolean>(false);
  const [videoList, setVideoList] = useState<VideoDoc[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch list of ready videos
  const fetchVideoList = async (): Promise<void> => {
    setLoadingList(true);
    try {
      const response = await fetch(`${apiBase}/video/`);
      if (!response.ok) throw new Error(`Failed to fetch video list: ${response.status}`);
      const data: VideoListResponse = await response.json();
      setVideoList(data.videos || []);
    } catch (err) {
      console.error('Error fetching video list:', err);
      setError(err instanceof Error ? err.message : 'Failed to load video list');
    } finally {
      setLoadingList(false);
    }
  };

  // Load video list on mount
  useEffect(() => {
    fetchVideoList();
  }, [apiBase]);

  const lookup = async (id?: string): Promise<void> => {
    const vid = id || videoId;
    if (!vid.trim()) return;
    
    setLoading(true);
    setError(null);
    setDoc(null);
    setWatching(false);
    
    if (pollRef.current) clearInterval(pollRef.current);
    
    try {
      const r = await fetch(`${apiBase}/video/${vid.trim()}`);
      if (!r.ok) throw new Error(`${r.status} — Video not found`);
      const d: VideoDoc = await r.json();
      setDoc(d);
      
      if (d.status !== "ready" && d.status !== "failed") {
        pollRef.current = setInterval(async () => {
          try {
            const r2 = await fetch(`${apiBase}/video/${vid.trim()}`);
            const d2: VideoDoc = await r2.json();
            setDoc(d2);
            if (d2.status === "ready" || d2.status === "failed") {
              if (pollRef.current) clearInterval(pollRef.current);
              // Refresh video list when processing completes
              if (d2.status === "ready") fetchVideoList();
            }
          } catch (err) {
            console.error('Polling error:', err);
          }
        }, 2500);
      } else if (d.status === "ready") {
        // Refresh video list if we found a ready video
        fetchVideoList();
      }
    } catch(e) {
      setError(e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSelectVideo = (video: VideoDoc): void => {
    setVideoId(video.id);
    lookup(video.id);
    // Navigate to player page with video_id parameter
    navigate(`/player?video_id=${video.id}`);
  };

  const handlePlayClick = (video: VideoDoc): void => {
    // Navigate directly to player page
    navigate(`/player?video_id=${video.id}`);
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <Panel title="Video Status & Playback" accent="var(--accent)">
        {/* Search Section */}
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <input 
            value={videoId} 
            onChange={e => setVideoId(e.target.value)} 
            placeholder="Enter video_id…"
            onKeyDown={e => e.key === "Enter" && lookup()}
            style={{ 
              flex: 1, 
              background: "var(--bg3)", 
              border: "1px solid var(--border)", 
              color: "var(--text)", 
              padding: "8px 12px", 
              fontSize: ".85rem", 
              fontFamily: "'Share Tech Mono',monospace" 
            }}
            onFocus={e => e.target.style.borderColor = "var(--accent)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
          <button 
            onClick={() => lookup()} 
            disabled={loading}
            style={{ 
              padding: "8px 24px", 
              background: loading ? "var(--bg4)" : "var(--accent)", 
              color: loading ? "var(--muted)" : "#000", 
              fontFamily: "'Barlow Condensed',sans-serif", 
              fontWeight: 700, 
              fontSize: "1rem", 
              letterSpacing: 3, 
              textTransform: "uppercase", 
              clipPath: "polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)" 
            }}>
            {loading ? <Spinner size={16} color="#000"/> : "Lookup"}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div style={{ 
            padding: "10px 14px", 
            background: "rgba(255,60,95,.08)", 
            border: "1px solid rgba(255,60,95,.25)", 
            color: "var(--red)", 
            fontSize: ".82rem", 
            marginBottom: 12 
          }}>
            {error}
          </div>
        )}

        {/* Ready Videos List */}
        <div style={{ marginBottom: 20 }}>
          <Tag label={`READY VIDEOS (${videoList.length})`} color="var(--accent)" />
          {loadingList ? (
            <div style={{ padding: "20px", textAlign: "center" }}>
              <Spinner size={24} />
            </div>
          ) : videoList.length > 0 ? (
            <div style={{ 
              marginTop: 10,
              display: "flex", 
              flexDirection: "column", 
              gap: 8,
              maxHeight: 300,
              overflowY: "auto"
            }}>
              {videoList.map((video) => (
                <div
                  key={video.id}
                  style={{
                    background: video.id === doc?.id ? "rgba(0,212,255,.1)" : "var(--bg3)",
                    border: `1px solid ${video.id === doc?.id ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: "4px",
                    padding: "12px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onClick={() => handleSelectVideo(video)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(0,212,255,.05)";
                    e.currentTarget.style.borderColor = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    if (video.id !== doc?.id) {
                      e.currentTarget.style.background = "var(--bg3)";
                      e.currentTarget.style.borderColor = "var(--border)";
                    }
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontFamily: "'Barlow Condensed',sans-serif", 
                        fontWeight: 700, 
                        fontSize: "1rem", 
                        color: "var(--white)" 
                      }}>
                        {video.title || video.filename || video.id}
                      </div>
                      <div style={{ 
                        fontFamily: "'Share Tech Mono',monospace", 
                        fontSize: ".7rem", 
                        color: "var(--muted)", 
                        marginTop: 2 
                      }}>
                        {video.id}
                      </div>
                      {video.overlay && (
                        <div style={{ 
                          display: "flex", 
                          flexWrap: "wrap", 
                          gap: 8, 
                          marginTop: 6 
                        }}>
                          {video.overlay.headline && (
                            <span style={{ 
                              fontSize: ".7rem", 
                              color: "var(--accent)" 
                            }}>
                              📰 {video.overlay.headline}
                            </span>
                          )}
                          {video.overlay.channel_name && (
                            <span style={{ 
                              fontSize: ".7rem", 
                              color: "var(--muted)" 
                            }}>
                              📺 {video.overlay.channel_name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {video.created_at && (
                        <span style={{ 
                          fontSize: ".65rem", 
                          color: "var(--muted)" 
                        }}>
                          {new Date(video.created_at).toLocaleDateString()}
                        </span>
                      )}
                      <StatusChip status={video.status} />
                      {video.status === "ready" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent triggering parent onClick
                            handlePlayClick(video);
                          }}
                          style={{
                            padding: "4px 12px",
                            background: "var(--accent)",
                            color: "#000",
                            border: "none",
                            borderRadius: "3px",
                            fontSize: ".7rem",
                            fontFamily: "'Barlow Condensed',sans-serif",
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = "0.8";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = "1";
                          }}
                        >
                          ▶ Play
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ 
              padding: "20px", 
              textAlign: "center", 
              color: "var(--muted)", 
              fontSize: ".8rem",
              background: "var(--bg3)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              marginTop: 10
            }}>
              No ready videos found
            </div>
          )}
        </div>

        {/* Video Details - Removed video player section */}
        {doc && doc.status !== "ready" && (
          <div style={{ animation: "slide-up .25s ease" }}>
            {/* Header row */}
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between", 
              marginBottom: 14 
            }}>
              <div>
                <div style={{ 
                  fontFamily: "'Barlow Condensed',sans-serif", 
                  fontWeight: 700, 
                  fontSize: "1.2rem", 
                  color: "var(--white)" 
                }}>
                  {doc.title || doc.filename || doc.id}
                </div>
                <div style={{ 
                  fontFamily: "'Share Tech Mono',monospace", 
                  fontSize: ".7rem", 
                  color: "var(--muted)", 
                  marginTop: 2 
                }}>
                  {doc.id}
                </div>
              </div>
              <StatusChip status={doc.status} />
            </div>

            {/* Info grid */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(3,1fr)", 
              gap: 10, 
              marginBottom: 16 
            }}>
              {[
                { label: "SIZE", val: doc.size_bytes ? formatBytes(doc.size_bytes) : "—" },
                { label: "CREATED", val: doc.created_at ? new Date(doc.created_at).toLocaleString() : "—" },
                { label: "TASK ID", val: doc.task_id ? doc.task_id.slice(0, 10) + "…" : "—" },
              ].map(c => (
                <div key={c.label} style={{ 
                  background: "var(--bg3)", 
                  border: "1px solid var(--border)", 
                  padding: "8px 12px" 
                }}>
                  <Tag label={c.label} />
                  <div style={{ 
                    fontFamily: "'Share Tech Mono',monospace", 
                    fontSize: ".78rem", 
                    color: "var(--text)", 
                    marginTop: 3 
                  }}>
                    {c.val}
                  </div>
                </div>
              ))}
            </div>

            {/* Overlay info */}
            {doc.overlay && (
              <div style={{ 
                marginBottom: 14, 
                padding: "10px 14px", 
                background: "var(--bg3)", 
                border: "1px solid var(--border)" 
              }}>
                <Tag label="OVERLAY CONFIG" />
                <div style={{ 
                  display: "flex", 
                  flexWrap: "wrap", 
                  gap: 10, 
                  marginTop: 8 
                }}>
                  {Object.entries(doc.overlay).map(([k, v]) => v !== undefined && (
                    <span key={k} style={{ 
                      fontFamily: "'Share Tech Mono',monospace", 
                      fontSize: ".7rem", 
                      color: "var(--muted)" 
                    }}>
                      <span style={{ color: "var(--accent)" }}>{k}</span>: {String(v)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Processing animation */}
            {(doc.status === "queued" || doc.status === "processing") && (
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 12, 
                padding: "12px 16px", 
                background: "rgba(0,212,255,.05)", 
                border: "1px solid rgba(0,212,255,.2)", 
                marginBottom: 14 
              }}>
                <Spinner />
                <span style={{ fontSize: ".82rem", color: "var(--accent)" }}>
                  {doc.status === "queued" 
                    ? "Waiting for FFmpeg worker…" 
                    : "Applying news overlay — this may take a moment…"}
                </span>
              </div>
            )}

            {/* Failed state */}
            {doc.status === "failed" && (
              <div style={{ 
                padding: "12px 14px", 
                background: "rgba(255,60,95,.07)", 
                border: "1px solid rgba(255,60,95,.2)", 
                color: "var(--red)", 
                fontSize: ".82rem" 
              }}>
                ✗ Processing failed — {doc.error || "check worker logs"}
              </div>
            )}
          </div>
        )}

        {/* Ready video message */}
        {doc && doc.status === "ready" && (
          <div style={{ 
            padding: "16px", 
            background: "rgba(0,212,255,.1)", 
            border: "1px solid var(--accent)",
            borderRadius: "4px",
            textAlign: "center",
            marginTop: 16
          }}>
            <div style={{ 
              fontFamily: "'Barlow Condensed',sans-serif", 
              fontSize: "1rem", 
              color: "var(--accent)",
              marginBottom: 12
            }}>
              ✓ Video is ready for playback
            </div>
            <button
              onClick={() => handlePlayClick(doc)}
              style={{
                padding: "8px 24px",
                background: "var(--accent)",
                color: "#000",
                border: "none",
                borderRadius: "4px",
                fontSize: ".9rem",
                fontFamily: "'Barlow Condensed',sans-serif",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              ▶ Open in Player
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
}

export default StatusTab;