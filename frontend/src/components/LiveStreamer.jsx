import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "";

export default function LiveStreamer() {
  const [streamInfo, setStreamInfo] = useState(null);
  const [copied, setCopied]         = useState("");

  async function getStreamKey() {
    const res  = await fetch(`${API}/stream/key`);
    const data = await res.json();
    setStreamInfo(data);
  }

  function copy(text, label) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  }

  return (
    <div className="streamer">
      <h2>Go Live</h2>
      <p>Stream from OBS, mobile camera, or any RTMP-compatible app.</p>

      {!streamInfo ? (
        <button className="btn-primary" onClick={getStreamKey}>
          Get Stream Key
        </button>
      ) : (
        <div className="stream-info">
          <label>RTMP Server URL</label>
          <div className="copy-row">
            <code>{streamInfo.rtmp_url.replace(/\/[^/]+$/, "")}</code>
            <button onClick={() => copy(streamInfo.rtmp_url.replace(/\/[^/]+$/, ""), "server")}>
              {copied === "server" ? "Copied!" : "Copy"}
            </button>
          </div>

          <label>Stream Key</label>
          <div className="copy-row">
            <code>{streamInfo.stream_key}</code>
            <button onClick={() => copy(streamInfo.stream_key, "key")}>
              {copied === "key" ? "Copied!" : "Copy"}
            </button>
          </div>

          <label>HLS Playback URL</label>
          <div className="copy-row">
            <code>{streamInfo.hls_playback}</code>
            <button onClick={() => copy(streamInfo.hls_playback, "hls")}>
              {copied === "hls" ? "Copied!" : "Copy"}
            </button>
          </div>

          <p className="hint">
            In OBS → Settings → Stream → Custom RTMP.<br />
            On mobile: use Larix Broadcaster or Streamlabs.
          </p>

          <button className="btn-secondary" onClick={() => setStreamInfo(null)}>
            Get New Key
          </button>
        </div>
      )}
    </div>
  );
}
