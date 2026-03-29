import type { OverlayConfig } from '../types';

interface PreviewPanelProps {
  overlay: OverlayConfig;
  videoUrl?: string | null;
  isProcessing?: boolean;
}

export function PreviewPanel({ overlay, videoUrl, isProcessing }: PreviewPanelProps) {
  return (
    <div className="w-full h-full bg-slate-900 flex items-center justify-center p-6">
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-lg overflow-hidden shadow-2xl border-4 border-slate-700">
        {videoUrl ? (
          <video 
            src={videoUrl} 
            controls 
            className="w-full h-full object-cover"
            autoPlay
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-700 flex items-center justify-center">
                <svg className="w-10 h-10 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
              <p className="text-slate-400 text-sm">Video preview will appear here</p>
            </div>
          </div>
        )}

        {overlay.enabled && (
          <>
            {/* Channel Name - Top Left */}
            <div className="absolute top-4 left-4">
              <div className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-sm tracking-wide shadow-lg">
                {overlay.channelName}
              </div>
            </div>

            {/* Headline - Top Center */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2">
              <div className="bg-red-600 text-white px-8 py-3 rounded font-bold text-lg tracking-wider shadow-lg">
                {overlay.headline}
              </div>
            </div>

            {/* Badge - Top Right */}
            <div className="absolute top-4 right-4">
              <div className="bg-red-500 text-white px-4 py-2 rounded-full font-bold text-xs tracking-widest shadow-lg animate-pulse">
                {overlay.badgeText}
              </div>
            </div>

            {/* Ticker - Bottom */}
            <div className="absolute bottom-0 left-0 right-0 bg-slate-900/95 border-t-4 border-red-600">
              <div className="py-3 px-4 overflow-hidden">
                <div className="whitespace-nowrap animate-marquee">
                  <span className="text-white font-medium text-sm">
                    {overlay.ticker}
                  </span>
                </div>
              </div>
            </div>

            {/* Processing Overlay */}
            {isProcessing && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-white font-medium">Processing video...</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}