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