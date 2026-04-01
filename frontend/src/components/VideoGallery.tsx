import { useState, useRef, useEffect, useCallback } from "react";
import {StreamCard} from './StreamCard'

// Type definitions
interface Stream {
  stream_key: string;
  name?: string;
  // Add other stream properties as needed
}

interface VideoGalleryProps {
  streams: Stream[];
  onSelectStream: (stream: Stream) => void;
  selectedStream: Stream | null;
  getHlsUrl: (stream: Stream) => string;
}

type ViewMode = "grid" | "list";

function Tag({ label, color = "var(--muted)" }) {
  return <span style={{ fontSize:".65rem",fontFamily:"'Share Tech Mono',monospace",color,letterSpacing:1,textTransform:"uppercase" }}>{label}</span>;
}


export const VideoGallery = ({ 
  streams, 
  onSelectStream, 
  selectedStream, 
  getHlsUrl 
}: VideoGalleryProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  
  const handleCopy = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      // Optionally show success feedback
      console.log('URL copied successfully');
    } catch (err) {
      console.error('Failed to copy:', err);
      // Optionally show error feedback
    }
  };
  
  const containerStyle: React.CSSProperties = {
    display: viewMode === "grid" ? "grid" : "flex",
    gridTemplateColumns: viewMode === "grid" ? "repeat(auto-fill, minmax(280px, 1fr))" : "1fr",
    gap: "12px",
    flexDirection: viewMode === "grid" ? "unset" : "column",
    maxHeight: "500px",
    overflowY: "auto",
    padding: "2px"
  };
  
  return (
    <div>
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        marginBottom: "12px",
        padding: "0 4px"
      }}>
        <Tag 
          label={`${streams.length} active stream${streams.length !== 1 ? 's' : ''}`} 
          color="var(--accent)"
        />
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setViewMode("grid")}
            style={{
              padding: "4px 8px",
              background: viewMode === "grid" ? "var(--accent)" : "var(--bg3)",
              color: viewMode === "grid" ? "#000" : "var(--muted)",
              border: "1px solid var(--border)",
              borderRadius: "3px",
              fontSize: ".7rem",
              cursor: "pointer",
              fontFamily: "'Share Tech Mono',monospace"
            }}
          >
            ⊞ Grid
          </button>
          <button
            onClick={() => setViewMode("list")}
            style={{
              padding: "4px 8px",
              background: viewMode === "list" ? "var(--accent)" : "var(--bg3)",
              color: viewMode === "list" ? "#000" : "var(--muted)",
              border: "1px solid var(--border)",
              borderRadius: "3px",
              fontSize: ".7rem",
              cursor: "pointer",
              fontFamily: "'Share Tech Mono',monospace"
            }}
          >
            ≡ List
          </button>
        </div>
      </div>
      
      <div style={containerStyle}>
        {streams.map((stream) => (
          <StreamCard
            key={stream.stream_key}
            stream={stream}
            onPlay={() => onSelectStream(stream)}
            onCopy={(url: string) => handleCopy(url)}
            isPlaying={selectedStream?.stream_key === stream.stream_key}
            getHlsUrl={getHlsUrl}
          />
        ))}
      </div>
    </div>
  );
}
