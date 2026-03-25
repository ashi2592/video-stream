import { useState } from "react";
import VideoUploader from "./components/VideoUploader";
import LiveStreamer   from "./components/LiveStreamer";
import VideoPlayer   from "./components/VideoPlayer";
import "./App.css";

const TABS = ["Upload", "Live Stream", "Player Demo"];

export default function App() {
  const [tab, setTab] = useState(0);

  return (
    <div className="app">
      <header>
        <h1>StreamForge</h1>
        <p>Upload · Compress · Stream</p>
      </header>

      <nav className="tabs">
        {TABS.map((t, i) => (
          <button
            key={t}
            className={tab === i ? "tab active" : "tab"}
            onClick={() => setTab(i)}
          >
            {t}
          </button>
        ))}
      </nav>

      <main>
        {tab === 0 && <VideoUploader />}
        {tab === 1 && <LiveStreamer />}
        {tab === 2 && (
          <VideoPlayer
            src="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
            mp4Src=""
            poster=""
          />
        )}
      </main>
    </div>
  );
}
