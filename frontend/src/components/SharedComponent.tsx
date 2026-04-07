// ─── UI COMPONENTS ──────────────────────────────────────────────────────────────

import React, { useState } from 'react';

// Type definitions
interface PanelProps {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  accent?: string;
  style?: React.CSSProperties;
}

interface TagProps {
  label: string;
  color?: string;
}

interface PillProps {
  color?: string;
  children: React.ReactNode;
}

interface LiveDotProps {
  color?: string;
}

interface SpinnerProps {
  size?: number;
  color?: string;
}

interface CopyButtonProps {
  text: string;
  compact?: boolean;
}

interface StatusChipProps {
  status: string;
}

interface StreamStatusBadgeProps {
  status: 'idle' | 'connecting' | 'live' | 'ended' | 'error';
}

interface MetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
  accent?: string;
}

// Type for status mapping
type StatusMap = {
  [key: string]: {
    color: string;
    label: string;
  };
};

// Panel Component
export const Panel = ({ 
  title, 
  badge, 
  children, 
  accent = "var(--accent)", 
  style = {} 
}: PanelProps): JSX.Element => {
  return (
    <div style={{
      background: "var(--bg2)",
      border: "1px solid var(--border)",
      borderTop: `2px solid ${accent}`,
      display: "flex",
      flexDirection: "column",
      animation: "slide-up .35s ease both",
      ...style
    }}>
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        padding: "10px 16px", 
        borderBottom: "1px solid var(--border)" 
      }}>
        <span style={{ 
          fontFamily: "'Barlow Condensed',sans-serif", 
          fontWeight: 700, 
          fontSize: "1rem", 
          letterSpacing: 2, 
          textTransform: "uppercase", 
          color: "var(--white)" 
        }}>
          {title}
        </span>
        {badge}
      </div>
      <div style={{ padding: 16, flex: 1 }}>{children}</div>
    </div>
  );
};

// Tag Component
export const Tag = ({ label, color = "var(--muted)" }: TagProps): JSX.Element => {
  return (
    <span style={{ 
      fontSize: ".65rem", 
      fontFamily: "'Share Tech Mono',monospace", 
      color, 
      letterSpacing: 1, 
      textTransform: "uppercase" 
    }}>
      {label}
    </span>
  );
};

// Pill Component
export const Pill = ({ color = "#00d4ff", children }: PillProps): JSX.Element => {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      background: `${color}18`,
      border: `1px solid ${color}40`,
      color,
      padding: "2px 10px",
      fontSize: ".68rem",
      fontFamily: "'Share Tech Mono',monospace",
      letterSpacing: 1,
      textTransform: "uppercase",
      clipPath: "polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)"
    }}>
      {children}
    </span>
  );
};

// LiveDot Component
export const LiveDot = ({ color = "#ff3c5f" }: LiveDotProps): JSX.Element => {
  return (
    <span style={{
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: color,
      display: "inline-block",
      animation: "pulse-dot 1.2s ease infinite",
      flexShrink: 0
    }} />
  );
};

// Spinner Component
export const Spinner = ({ size = 18, color = "var(--accent)" }: SpinnerProps): JSX.Element => {
  return (
    <span style={{
      width: size,
      height: size,
      border: `2px solid ${color}30`,
      borderTop: `2px solid ${color}`,
      borderRadius: "50%",
      display: "inline-block",
      animation: "spin .8s linear infinite",
      flexShrink: 0
    }} />
  );
};

// CopyButton Component
export const CopyButton = ({ text, compact = false }: CopyButtonProps): JSX.Element => {
  const [copied, setCopied] = useState<boolean>(false);
  const [showTooltip, setShowTooltip] = useState<boolean>(false);
  
  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setShowTooltip(true);
      setTimeout(() => {
        setCopied(false);
        setShowTooltip(false);
      }, 1800);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={handleCopy}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{ 
          color: copied ? "var(--green)" : "var(--muted)", 
          padding: compact ? "2px 6px" : "3px 8px", 
          transition: "color .2s",
          display: "flex", 
          alignItems: "center", 
          gap: 4, 
          fontSize: compact ? ".65rem" : ".7rem", 
          fontFamily: "'Share Tech Mono',monospace",
          border: "1px solid var(--border)", 
          background: "var(--bg3)",
          cursor: "pointer",
          borderRadius: "2px"
        }}
      >
        {copied ? "✓" : "⧉"} {!compact && (copied ? "Copied" : "Copy")}
      </button>
      {showTooltip && !copied && (
        <div style={{
          position: "absolute",
          bottom: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          marginBottom: "5px",
          background: "var(--bg1)",
          color: "var(--text)",
          padding: "2px 6px",
          fontSize: ".65rem",
          borderRadius: "3px",
          whiteSpace: "nowrap",
          border: "1px solid var(--border)",
          zIndex: 1000
        }}>
          Copy to clipboard
        </div>
      )}
    </div>
  );
};

// StatusChip Component
export const StatusChip = ({ status }: StatusChipProps): JSX.Element => {
  const statusMap: StatusMap = {
    queued:     { color: "var(--amber)",   label: "QUEUED" },
    processing: { color: "var(--accent)",  label: "PROCESSING" },
    ready:      { color: "var(--green)",   label: "READY" },
    failed:     { color: "var(--red)",     label: "FAILED" },
  };
  
  const s = statusMap[status] || { color: "var(--muted)", label: status?.toUpperCase() || "—" };
  return (
    <Pill color={s.color}>
      <LiveDot color={s.color} />
      {s.label}
    </Pill>
  );
};

// ─── STREAM STATUS BADGE ─────────────────────────────────────────────────────
export const StreamStatusBadge = ({ status }: StreamStatusBadgeProps): JSX.Element => {
  const statusConfig: Record<string, { color: string; label: string }> = {
    idle:       { color: "var(--muted)",   label: "OFFLINE" },
    connecting: { color: "var(--amber)",   label: "CONNECTING" },
    live:       { color: "var(--red)",     label: "LIVE" },
    ended:      { color: "var(--muted)",   label: "ENDED" },
    error:      { color: "var(--red)",     label: "ERROR" },
  };
  
  const cfg = statusConfig[status] || { color: "var(--muted)", label: "—" };
  
  return (
    <Pill color={cfg.color}>
      {status === "live" && <LiveDot color={cfg.color} />}
      {cfg.label}
    </Pill>
  );
};

// ─── METRIC TILE ─────────────────────────────────────────────────────────────
export const MetricTile = ({ label, value, unit, accent = "var(--accent)" }: MetricTileProps): JSX.Element => {
  return (
    <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", padding: "10px 14px", flex: 1 }}>
      <Tag label={label} />
      <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "1.5rem", color: accent }}>
          {value}
        </span>
        {unit && <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".65rem", color: "var(--muted)" }}>{unit}</span>}
      </div>
    </div>
  );
};

// Optional: Export all components from a single file
export default {
  Panel,
  Tag,
  Pill,
  LiveDot,
  Spinner,
  StatusChip,
  CopyButton,
  StreamStatusBadge,
  MetricTile
};