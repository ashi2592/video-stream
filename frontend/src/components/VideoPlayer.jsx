import { useEffect, useRef, useState } from "react";

/**
 * VideoPlayer — HLS adaptive streaming player.
 * Falls back to native <video> for Safari (which supports HLS natively).
 *
 * Props:
 *   src      — HLS .m3u8 URL (required)
 *   mp4Src   — MP4 fallback URL (optional)
 *   poster   — Poster image URL (optional)
 *   autoPlay — boolean (default false)
 */
export default function VideoPlayer({ src, mp4Src, poster, autoPlay = false }) {
  const videoRef  = useRef(null);
  const hlsRef    = useRef(null);
  const [quality, setQuality] = useState("Auto");
  const [levels,  setLevels]  = useState([]);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!src || !videoRef.current) return;

    const video = videoRef.current;

    // Safari natively supports HLS — no library needed
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    // All other browsers: use hls.js
    import("hls.js").then(({ default: Hls }) => {
      if (!Hls.isSupported()) {
        setError("HLS not supported in this browser.");
        return;
      }

      const hls = new Hls({ startLevel: -1 }); // -1 = auto quality
      hlsRef.current = hls;

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const lvls = data.levels.map((l, i) => ({
          index: i,
          label: `${l.height}p`,
        }));
        setLevels([{ index: -1, label: "Auto" }, ...lvls]);
        if (autoPlay) video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setError("Stream error. Please refresh.");
      });
    });

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, autoPlay]);

  function switchQuality(index) {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setQuality(levels.find(l => l.index === index)?.label || "Auto");
    }
  }

  return (
    <div className="player-wrapper">
      {error ? (
        <div className="player-error">{error}</div>
      ) : (
        <>
          <video
            ref={videoRef}
            controls
            playsInline
            poster={poster}
            style={{ width: "100%", borderRadius: 8, background: "#000" }}
          >
            {mp4Src && <source src={mp4Src} type="video/mp4" />}
          </video>

          {levels.length > 1 && (
            <div className="quality-selector">
              <span>Quality: </span>
              {levels.map(l => (
                <button
                  key={l.index}
                  className={quality === l.label ? "active" : ""}
                  onClick={() => switchQuality(l.index)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
