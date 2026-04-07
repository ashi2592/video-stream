export interface OverlayConfig {
  channelName: string;
  headline: string;
  ticker: string;
  badgeText: string;
  enabled: boolean;
}

export interface UploadResponse {
  task_id: string;
  video_id: string;
  status: 'queued' | 'processing' | 'success' | 'failed';
}

export interface StatusResponse {
  task_id: string;
  status: 'queued' | 'processing' | 'success' | 'failed';
  progress: number;
  video_id?: string;
  error?: string;
}

export interface VideoUrlsResponse {
  video_id: string;
  url: string;
  thumbnail_url?: string;
}


export type ContentType = 'video' | 'image' | 'text' | 'carousel' | 'livestream';
export type MediaSourceType = 'file' | 'path' | 'rtmp' | 'hls' | 'webcam' | 'none';

export interface SlotMediaSource {
  slotId: number;
  contentType: ContentType;
  sourceType: MediaSourceType;
  // file upload
  fileUrl: string | null;
  fileName: string | null;
  filePath: string | null;   // server-side absolute path
  // stream / URL
  streamUrl: string | null;  // rtmp:// or http://…m3u8
  streamKey: string | null;
  // display
  label: string;
}

export interface StreamSession {
  streamKey: string;
  status: 'idle' | 'connecting' | 'live' | 'error';
  hlsUrl: string | null;
  templateId: string | null;
  templateName: string | null;
  startedAt: string | null;
  pid: number | null;
  error: string | null;
}

export interface SlotDefinition {
  id: number;
  label: string;
}

export interface SlotMediaManagerProps {
  slots: SlotDefinition[];
  slotSources: Record<number, SlotMediaSource>;
  onSourceChange: (slotId: number, source: Partial<SlotMediaSource>) => void;
  session: StreamSession | null;
  templateId: string | null;
  apiBase: string;
  onSessionChange: (session: StreamSession | null) => void;
}
