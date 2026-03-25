import { useState, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "";

export default function VideoUploader() {
  const [status, setStatus]     = useState("idle");
  const [progress, setProgress] = useState(0);
  const [videoUrls, setVideoUrls] = useState(null);
  const [error, setError]       = useState("");
  const inputRef = useRef();

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    setStatus("uploading");
    setProgress(10);
    setError("");

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${API}/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const { video_id, task_id } = await res.json();

      setProgress(30);
      setStatus("processing");
      await pollStatus(video_id, task_id);
    } catch (err) {
      setError(err.message || "Upload failed");
      setStatus("error");
    }
  }

  async function pollStatus(video_id, task_id) {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const res  = await fetch(`${API}/status/${task_id}`);
          const data = await res.json();

          if (data.status === "PROCESSING") setProgress(55);
          if (data.status === "UPLOADING")  setProgress(80);

          if (data.status === "SUCCESS") {
            clearInterval(interval);
            setProgress(100);
            const urlRes  = await fetch(`${API}/video/${video_id}/urls`);
            const urlData = await urlRes.json();
            setVideoUrls(urlData.urls);
            setStatus("done");
            resolve();
          }

          if (data.status === "FAILURE") {
            clearInterval(interval);
            setError("Processing failed. Please try again.");
            setStatus("error");
            reject();
          }
        } catch (err) {
          clearInterval(interval);
          setError("Lost connection to server.");
          setStatus("error");
          reject();
        }
      }, 2500);
    });
  }

  const statusLabels = {
    uploading:  "Uploading video...",
    processing: "Compressing + adding overlay...",
  };

  return (
    <div className="uploader">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {status === "idle" && (
        <button className="btn-primary" onClick={() => inputRef.current.click()}>
          Upload Video
        </button>
      )}

      {(status === "uploading" || status === "processing") && (
        <div className="progress-block">
          <p>{statusLabels[status]}</p>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span>{progress}%</span>
        </div>
      )}

      {status === "error" && (
        <div className="error-block">
          <p>{error}</p>
          <button className="btn-secondary" onClick={() => setStatus("idle")}>Try Again</button>
        </div>
      )}

      {status === "done" && videoUrls && (
        <div className="done-block">
          <p className="success-label">Ready to play</p>
          <video controls playsInline style={{ width: "100%", borderRadius: 8 }}>
            <source src={videoUrls.mp4}  type="video/mp4" />
            <source src={videoUrls.webm} type="video/webm" />
          </video>
          <div className="url-links">
            <a href={videoUrls.hls}  target="_blank" rel="noreferrer">HLS Stream (adaptive)</a>
            <a href={videoUrls.mp4}  download>Download MP4</a>
            <a href={videoUrls.webm} download>Download WebM</a>
          </div>
          <button className="btn-secondary" onClick={() => { setStatus("idle"); setVideoUrls(null); }}>
            Upload Another
          </button>
        </div>
      )}
    </div>
  );
}
