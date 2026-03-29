import { useState, useCallback } from 'react';
import type { OverlayConfig, UploadResponse, StatusResponse, VideoUrlsResponse } from '../types';

export function useVideoUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'queued' | 'processing' | 'success' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadVideo = useCallback(async (file: File, overlay: OverlayConfig) => {
    setIsUploading(true);
    setError(null);
    setStatus('queued');
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('channel_name', overlay.channelName);
      formData.append('headline', overlay.headline);
      formData.append('ticker', overlay.ticker);
      formData.append('badge_text', overlay.badgeText);
      formData.append('enabled', overlay.enabled.toString());

      // Simulate upload
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock response
      const mockTaskId = `task_${Date.now()}`;
      const mockVideoId = `vid_${Date.now()}`;
      setTaskId(mockTaskId);
      
      // Start polling
      pollStatus(mockTaskId, mockVideoId);
    } catch (err) {
      setError('Upload failed. Please try again.');
      setIsUploading(false);
      setStatus('failed');
    }
  }, []);

  const pollStatus = useCallback(async (taskId: string, videoId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        // Simulate status check
        await new Promise(resolve => setTimeout(resolve, 500));
        
        setProgress(prev => {
          const newProgress = Math.min(prev + Math.random() * 15, 100);
          
          if (newProgress >= 100) {
            clearInterval(pollInterval);
            setStatus('success');
            setIsUploading(false);
            setVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
            return 100;
          }
          
          if (newProgress > 30 && status === 'queued') {
            setStatus('processing');
          }
          
          return newProgress;
        });
      } catch (err) {
        clearInterval(pollInterval);
        setError('Status check failed');
        setStatus('failed');
        setIsUploading(false);
      }
    }, 2000);
  }, [status]);

  const reset = useCallback(() => {
    setTaskId(null);
    setStatus('idle');
    setProgress(0);
    setVideoUrl(null);
    setError(null);
    setIsUploading(false);
  }, []);

  return {
    isUploading,
    taskId,
    status,
    progress,
    videoUrl,
    error,
    uploadVideo,
    reset
  };
}