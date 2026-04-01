

import { useState, useRef, useEffect, useCallback } from "react";

import {
  Panel,
  Tag,
  Pill,
  LiveDot,
  Spinner,
  CopyButton,
    StatusChip,
    MetricTile,
    StreamStatusBadge

} from './SharedComponent'

export const  StreamCard = ({ stream, onPlay, onCopy, isPlaying, getHlsUrl }) => {
  const [showOptions, setShowOptions] = useState(false);
  const streamUrl = getHlsUrl(stream.stream_key);
  
  const getStatusColor = () => {
    switch(stream.status) {
      case 'live': return 'var(--red)';
      case 'active': return 'var(--green)';
      default: return 'var(--amber)';
    }
  };
  
  const getStatusIcon = () => {
    switch(stream.status) {
      case 'live': return '🔴';
      case 'active': return '🟢';
      default: return '🟡';
    }
  };
  
  return (
    <div 
      style={{
        background: isPlaying ? "var(--bg1)" : "var(--bg3)",
        border: `1px solid ${isPlaying ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "4px",
        padding: "12px",
        transition: "all 0.2s ease",
        cursor: "pointer"
      }}
      onMouseEnter={() => setShowOptions(true)}
      onMouseLeave={() => setShowOptions(false)}
      onClick={() => onPlay(stream)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
          <span style={{ fontSize: "1.2rem" }}>{getStatusIcon()}</span>
          <div style={{ flex: 1 }}>
            <div style={{ 
              fontFamily: "'Barlow Condensed',sans-serif", 
              fontWeight: 600, 
              color: "var(--white)", 
              fontSize: "1rem",
              marginBottom: "2px"
            }}>
              {stream.title || `Stream: ${stream.stream_key?.slice(0, 8)}...` || "Untitled Stream"}
            </div>
            <div style={{ 
              fontFamily: "'Share Tech Mono',monospace", 
              color: "var(--muted)", 
              fontSize: ".65rem",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span>🔑 {stream.stream_key?.slice(0, 12)}...</span>
            </div>
          </div>
        </div>
        <Pill color={getStatusColor()}>
          {stream.status === "live" && <LiveDot color={getStatusColor()}/>}
          {(stream.status || "OFFLINE").toUpperCase()}
        </Pill>
      </div>
      
      {/* Stream URL Preview */}
      {streamUrl && (
        <div style={{
          fontFamily: "'Share Tech Mono',monospace",
          fontSize: ".68rem",
          color: "var(--muted)",
          background: "var(--bg2)",
          padding: "6px 8px",
          borderRadius: "3px",
          marginBottom: "8px",
          wordBreak: "break-all",
          border: "1px solid var(--border)"
        }}>
          {streamUrl}
        </div>
      )}
      
      {/* Action Buttons - Show on hover */}
      {showOptions && streamUrl && (
        <div style={{ 
          display: "flex", 
          gap: "8px", 
          marginTop: "8px",
          animation: "fadeIn 0.2s ease"
        }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay(stream);
            }}
            style={{
              flex: 1,
              padding: "4px 8px",
              background: "var(--accent)",
              color: "#000",
              border: "none",
              borderRadius: "3px",
              fontSize: ".7rem",
              fontFamily: "'Barlow Condensed',sans-serif",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px"
            }}
          >
            ▶ Play Now
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy(streamUrl);
            }}
            style={{
              padding: "4px 8px",
              background: "var(--bg4)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "3px",
              fontSize: ".7rem",
              fontFamily: "'Share Tech Mono',monospace",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            ⧉ Copy URL
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.open(streamUrl, '_blank');
            }}
            style={{
              padding: "4px 8px",
              background: "var(--bg4)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "3px",
              fontSize: ".7rem",
              fontFamily: "'Share Tech Mono',monospace",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            🔗 Open
          </button>
        </div>
      )}
    </div>
  );
}
