import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.fade-up').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing">
      {/* Nav */}
      <nav className="nav">
        <div className="nav-logo">
          <span className="logo-dot" />
          StreamKit
        </div>
        <div className="nav-links">
          <button className="nav-cta" onClick={() => navigate('/video-stream')}>
            Go Live
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero" ref={heroRef}>
        <div className="hero-bg">
          <div className="grid-lines" />
          <div className="glow glow-1" />
          <div className="glow glow-2" />
        </div>

        <div className="hero-content fade-up">
          <div className="badge">● Live Broadcasting Suite</div>
          <h1 className="hero-title">
            Stream. <span className="accent">Design.</span>
            <br />
            Go Live.
          </h1>
          <p className="hero-sub">
            Professional-grade video streaming with pixel-perfect overlay templates —
            built for creators who refuse to compromise.
          </p>
          <div className="hero-actions">
            <button
              className="btn-primary"
              onClick={() => navigate('/video-stream')}
            >
              Start Streaming
              <span className="btn-arrow">→</span>
            </button>
            <button
              className="btn-secondary"
              onClick={() => navigate('/overlay-template')}
            >
              Design Overlays
            </button>
          </div>
        </div>

        {/* Mock stream preview */}
        <div className="stream-preview fade-up">
          <div className="preview-bar">
            <span className="live-dot" /> LIVE
            <span className="preview-title">My Stream</span>
            <span className="preview-viewers">1.2k viewers</span>
          </div>
          <div className="preview-screen">
            <div className="scan-line" />
            <div className="overlay-demo">
              <div className="overlay-corner tl">
                <div className="ol-name">StreamKit User</div>
                <div className="ol-game">Just Chatting</div>
              </div>
              <div className="overlay-corner br">
                <div className="ol-stat">❤ 4.2k</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <div className="section-label fade-up">What's included</div>
        <div className="feature-grid">
          <div className="feature-card fade-up" onClick={() => navigate('/video-stream')}>
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <h3>Video Stream</h3>
            <p>
              Low-latency live streaming with camera and screen capture, real-time
              controls, and adaptive bitrate management.
            </p>
            <span className="feature-link">Open Stream →</span>
          </div>

          <div className="feature-card fade-up" onClick={() => navigate('/overlay-template')}>
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <h3>Overlay Templates</h3>
            <p>
              Create stunning stream overlays with drag-and-drop elements, custom
              branding, and real-time preview.
            </p>
            <span className="feature-link">Open Editor →</span>
          </div>

          <div className="feature-card fade-up">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <h3>Instant Setup</h3>
            <p>
              No plugins, no downloads. Launch directly in your browser and start
              broadcasting within seconds.
            </p>
            <span className="feature-link">Get started →</span>
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="cta-strip fade-up">
        <div className="cta-inner">
          <h2>Ready to go live?</h2>
          <p>Pick your starting point below.</p>
          <div className="cta-cards">
            <div className="cta-card" onClick={() => navigate('/video-stream')}>
              <div className="cta-card-label">Video Stream</div>
              <p>Broadcast live with your camera or screen.</p>
              <button className="btn-primary small">Launch →</button>
            </div>
            <div className="cta-card accent-card" onClick={() => navigate('/overlay-template')}>
              <div className="cta-card-label">Overlay Studio</div>
              <p>Design and export custom stream overlays.</p>
              <button className="btn-primary small">Launch →</button>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <span className="logo-dot small" /> StreamKit &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default LandingPage;