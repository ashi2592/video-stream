import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import HLSPlayer from './components/HLSPlayer'
// Ensure these files have been converted to .tsx or have .d.ts declarations
import VideoStream from './components/VideoStream';
import OverlayTemplate from './components/OverlayTemplate';


const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/video-stream" element={<VideoStream />} />
        <Route path="/overlay-template" element={<OverlayTemplate />} />
          <Route path="/player" element={<HLSPlayer />} />
        <Route path="/" element={<LandingPage />} />
      </Routes>
    </Router>
  );
};

export default App;