export const Icon = {
  Upload: () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 4v12m-4-4l4-4 4 4"/>
    </svg>
  ),
  Stream: () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
    </svg>
  ),
  Record: () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="4" fill="currentColor"/>
      <circle cx="12" cy="12" r="9" strokeDasharray="2 2"/>
    </svg>
  ),
  Play: () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <polygon points="5,3 19,12 5,21" fill="currentColor" stroke="none"/>
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
    </svg>
  ),
  Copy: () => (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  ),
  Screen: () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
    </svg>
  ),
  Cam: () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  ),
  Stop: () => (
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
    </svg>
  ),
  Download: () => (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m-4-4l4 4 4-4"/>
    </svg>
  ),
};
