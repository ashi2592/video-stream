// ─── UTILITY FUNCTIONS ──────────────────────────────────────────────────────────────

/**
 * Formats bytes into human-readable string (B, KB, MB)
 * @param bytes - Number of bytes to format
 * @returns Formatted string with appropriate unit
 */
export function fmt(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}

/**
 * Formats seconds into MM:SS format
 * @param s - Number of seconds to format
 * @returns Formatted time string in MM:SS format
 */
export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}