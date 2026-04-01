import { useState, useRef, useEffect } from "react";

const LAYOUTS = [
  {
    id: "single",
    label: "Single",
    icon: (
      <svg viewBox="0 0 56 36" width="56" height="36">
        <rect x="2" y="2" width="52" height="32" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: "split-v",
    label: "Split Vertical",
    icon: (
      <svg viewBox="0 0 56 36" width="56" height="36">
        <rect x="2" y="2" width="24" height="32" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="30" y="2" width="24" height="32" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: "split-h",
    label: "Split Horizontal",
    icon: (
      <svg viewBox="0 0 56 36" width="56" height="36">
        <rect x="2" y="2" width="52" height="14" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="2" y="20" width="52" height="14" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: "triple",
    label: "3 Videos",
    icon: (
      <svg viewBox="0 0 56 36" width="56" height="36">
        <rect x="2" y="2" width="52" height="17" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="2" y="23" width="24" height="11" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="30" y="23" width="24" height="11" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
];

const BADGE_PRESETS = ["BREAKING", "LIVE", "EXCLUSIVE", "ALERT", "UPDATE", "SPECIAL REPORT"];

function TickerPreview({ text, color, bgColor, speed }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(0);
  const animRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.scrollWidth;
    const container = 640;
    let prev = null;

    function frame(ts) {
      if (!prev) prev = ts;
      const dx = ((ts - prev) / 1000) * speed;
      prev = ts;
      setPos(p => {
        const next = p - dx;
        return next < -(w + 40) ? container : next;
      });
      animRef.current = requestAnimationFrame(frame);
    }

    animRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animRef.current);
  }, [speed, text]);

  return (
    <div style={{ background: bgColor, overflow: "hidden", height: 28, display: "flex", alignItems: "center", position: "relative" }}>
      <span
        ref={ref}
        style={{
          position: "absolute",
          left: pos,
          whiteSpace: "nowrap",
          fontSize: 12,
          fontWeight: 500,
          color,
          letterSpacing: "0.02em",
          fontFamily: "monospace",
        }}
      >
        {text} &nbsp;&nbsp;&bull;&nbsp;&nbsp; {text}
      </span>
    </div>
  );
}

function VideoSlot({ label, style }) {
  return (
    <div style={{
      ...style,
      background: "rgba(0,0,0,0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden",
    }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
        <polygon points="5,3 19,12 5,21"/>
      </svg>
      <span style={{ position: "absolute", bottom: 6, left: 8, fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>{label}</span>
    </div>
  );
}

function LivePreview({ config }) {
  const { layout, channelName, headline, badgeText, badgeColor, ticker, tickerColor, tickerBg, topBarColor, bottomBarColor, showTicker, showLogo, logoText, logoImage, borderColor, showBorder, tickerSpeed } = config;

  const W = 640, H = 360;
  const TOP = 40, BOTTOM = 44, TICKER_H = 28;
  const videoAreaTop = TOP;
  const videoAreaBottom = H - BOTTOM - (showTicker ? TICKER_H : 0);
  const videoH = videoAreaBottom - videoAreaTop;

  let slots = [];
  if (layout === "single") {
    slots = [{ label: "VIDEO 1", style: { position: "absolute", top: videoAreaTop, left: 0, width: W, height: videoH } }];
  } else if (layout === "split-v") {
    slots = [
      { label: "VIDEO 1", style: { position: "absolute", top: videoAreaTop, left: 0, width: W / 2 - 1, height: videoH } },
      { label: "VIDEO 2", style: { position: "absolute", top: videoAreaTop, left: W / 2 + 1, width: W / 2 - 1, height: videoH } },
    ];
  } else if (layout === "split-h") {
    slots = [
      { label: "VIDEO 1", style: { position: "absolute", top: videoAreaTop, left: 0, width: W, height: videoH / 2 - 1 } },
      { label: "VIDEO 2", style: { position: "absolute", top: videoAreaTop + videoH / 2 + 1, left: 0, width: W, height: videoH / 2 - 1 } },
    ];
  } else if (layout === "triple") {
    slots = [
      { label: "VIDEO 1", style: { position: "absolute", top: videoAreaTop, left: 0, width: W, height: videoH * 0.55 - 1 } },
      { label: "VIDEO 2", style: { position: "absolute", top: videoAreaTop + videoH * 0.55 + 1, left: 0, width: W / 2 - 1, height: videoH * 0.45 - 2 } },
      { label: "VIDEO 3", style: { position: "absolute", top: videoAreaTop + videoH * 0.55 + 1, left: W / 2 + 1, width: W / 2 - 1, height: videoH * 0.45 - 2 } },
    ];
  }

  return (
    <div style={{
      width: W,
      height: H,
      position: "relative",
      background: "#111",
      fontFamily: "sans-serif",
      overflow: "hidden",
      border: showBorder ? `3px solid ${borderColor}` : "none",
      boxSizing: "border-box",
      flexShrink: 0,
    }}>
      {slots.map((s, i) => <VideoSlot key={i} {...s} />)}

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: TOP, background: topBarColor, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
        {showLogo && logoImage ? (
          <img src={logoImage} style={{ height: 28, objectFit: "contain" }} alt="logo" />
        ) : showLogo && logoText ? (
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 18, letterSpacing: "0.15em", textTransform: "uppercase" }}>{logoText}</span>
        ) : (
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 16, letterSpacing: "0.12em", textTransform: "uppercase" }}>{channelName || "CHANNEL NAME"}</span>
        )}
      </div>

      <div style={{
        position: "absolute",
        bottom: showTicker ? TICKER_H : 0,
        left: 0, right: 0,
        height: BOTTOM,
        background: bottomBarColor,
        display: "flex",
        alignItems: "center",
        zIndex: 10,
        paddingLeft: 8,
        gap: 10,
      }}>
        {badgeText && (
          <div style={{
            background: badgeColor,
            color: "#fff",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.08em",
            padding: "3px 8px",
            borderRadius: 2,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}>{badgeText}</div>
        )}
        <span style={{ color: "#fff", fontSize: 13, fontWeight: 500, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {headline || "Your headline will appear here"}
        </span>
      </div>

      {showTicker && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: TICKER_H, zIndex: 10 }}>
          <TickerPreview text={ticker || "Ticker text scrolls here • Stay tuned for more updates"} color={tickerColor} bgColor={tickerBg} speed={tickerSpeed} />
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function ColorPicker({ value, onChange, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 32, height: 32, border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, cursor: "pointer", padding: 2, background: "none" }} />
      <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--color-text-secondary)" }}>{value}</span>
    </div>
  );
}

const DEFAULT = {
  layout: "single",
  channelName: "NEWS 24",
  headline: "BREAKING: Major earthquake strikes Pacific coast",
  badgeText: "BREAKING",
  badgeColor: "#e74c3c",
  ticker: "Markets fall 3% • Tech stocks lead decline • Oil prices surge to $95/barrel • More updates coming",
  tickerColor: "#f1c40f",
  tickerBg: "#2c3e50",
  topBarColor: "#1a1a2e",
  bottomBarColor: "#c0392b",
  showTicker: true,
  showLogo: false,
  logoText: "",
  logoImage: null,
  borderColor: "#c0392b",
  showBorder: true,
  tickerSpeed: 80,
};

export default function OverlayTemplate() {
  const [cfg, setCfg] = useState(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [templateName, setTemplateName] = useState("My News Template");
  const [tab, setTab] = useState("layout");
  const fileRef = useRef();

  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }));

  const handleLogoUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set("logoImage", ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      name: templateName,
      config: {
        layout: cfg.layout,
        channel_name: cfg.channelName,
        headline: cfg.headline,
        badge_text: cfg.badgeText,
        badge_color: cfg.badgeColor,
        ticker_text: cfg.ticker,
        ticker_color: cfg.tickerColor,
        ticker_bg: cfg.tickerBg,
        ticker_speed: cfg.tickerSpeed,
        top_bar_color: cfg.topBarColor,
        bottom_bar_color: cfg.bottomBarColor,
        show_ticker: cfg.showTicker,
        show_logo: cfg.showLogo,
        logo_text: cfg.logoText,
        logo_image: cfg.logoImage,
        border_color: cfg.borderColor,
        show_border: cfg.showBorder,
      },
      created_at: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Server error");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaved("error");
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const TABS = [
    { id: "layout", label: "Layout" },
    { id: "branding", label: "Branding" },
    { id: "content", label: "Content" },
    { id: "style", label: "Style" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: 600 }}>
      <div style={{
        background: "var(--color-background-primary)",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e74c3c", animation: "pulse 1.5s infinite" }} />
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>Overlay Template Editor</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            style={{ fontSize: 13, padding: "5px 10px", width: 200, borderRadius: 6 }}
            placeholder="Template name"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: saved === true ? "#27ae60" : saved === "error" ? "#e74c3c" : "#e74c3c",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "6px 16px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              opacity: saving ? 0.7 : 1,
              transition: "background 0.2s",
            }}
          >
            {saving ? "Saving…" : saved === true ? "Saved!" : saved === "error" ? "Failed" : "Save Template"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        <div style={{
          width: 280,
          borderRight: "0.5px solid var(--color-border-tertiary)",
          background: "var(--color-background-secondary)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  padding: "10px 4px",
                  fontSize: 11,
                  fontWeight: tab === t.id ? 500 : 400,
                  color: tab === t.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  background: "none",
                  border: "none",
                  borderBottom: tab === t.id ? "2px solid #e74c3c" : "2px solid transparent",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
            {tab === "layout" && (
              <Section title="Video Layout">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {LAYOUTS.map(l => (
                    <button
                      key={l.id}
                      onClick={() => set("layout", l.id)}
                      style={{
                        padding: "10px 8px 8px",
                        border: cfg.layout === l.id ? "1.5px solid #e74c3c" : "0.5px solid var(--color-border-secondary)",
                        borderRadius: 8,
                        background: cfg.layout === l.id ? "rgba(231,76,60,0.07)" : "var(--color-background-primary)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                        color: cfg.layout === l.id ? "#e74c3c" : "var(--color-text-secondary)",
                        transition: "all 0.15s",
                      }}
                    >
                      {l.icon}
                      <span style={{ fontSize: 10, fontWeight: 500 }}>{l.label}</span>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {tab === "branding" && (
              <>
                <Section title="Channel">
                  <Field label="Channel name">
                    <input value={cfg.channelName} onChange={e => set("channelName", e.target.value)} placeholder="NEWS 24" />
                  </Field>
                </Section>

                <Section title="Logo">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <button
                      onClick={() => set("showLogo", false)}
                      style={{
                        flex: 1, padding: "6px 0", fontSize: 12, borderRadius: 6, cursor: "pointer",
                        border: !cfg.showLogo ? "1.5px solid #e74c3c" : "0.5px solid var(--color-border-secondary)",
                        background: !cfg.showLogo ? "rgba(231,76,60,0.07)" : "none",
                        color: !cfg.showLogo ? "#e74c3c" : "var(--color-text-secondary)",
                      }}
                    >None</button>
                    <button
                      onClick={() => { set("showLogo", true); set("logoImage", null); }}
                      style={{
                        flex: 1, padding: "6px 0", fontSize: 12, borderRadius: 6, cursor: "pointer",
                        border: cfg.showLogo && !cfg.logoImage ? "1.5px solid #e74c3c" : "0.5px solid var(--color-border-secondary)",
                        background: cfg.showLogo && !cfg.logoImage ? "rgba(231,76,60,0.07)" : "none",
                        color: cfg.showLogo && !cfg.logoImage ? "#e74c3c" : "var(--color-text-secondary)",
                      }}
                    >Text</button>
                    <button
                      onClick={() => { set("showLogo", true); fileRef.current?.click(); }}
                      style={{
                        flex: 1, padding: "6px 0", fontSize: 12, borderRadius: 6, cursor: "pointer",
                        border: cfg.showLogo && cfg.logoImage ? "1.5px solid #e74c3c" : "0.5px solid var(--color-border-secondary)",
                        background: cfg.showLogo && cfg.logoImage ? "rgba(231,76,60,0.07)" : "none",
                        color: cfg.showLogo && cfg.logoImage ? "#e74c3c" : "var(--color-text-secondary)",
                      }}
                    >Image</button>
                    <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
                  </div>

                  {cfg.showLogo && !cfg.logoImage && (
                    <Field label="Logo text">
                      <input value={cfg.logoText} onChange={e => set("logoText", e.target.value)} placeholder="NEWS 24" />
                    </Field>
                  )}
                  {cfg.showLogo && cfg.logoImage && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--color-background-primary)", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)" }}>
                      <img src={cfg.logoImage} style={{ height: 24, maxWidth: 80, objectFit: "contain" }} alt="logo preview" />
                      <button onClick={() => set("logoImage", null)} style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                    </div>
                  )}
                </Section>
              </>
            )}

            {tab === "content" && (
              <>
                <Section title="Headline">
                  <Field label="Headline text">
                    <textarea
                      value={cfg.headline}
                      onChange={e => set("headline", e.target.value)}
                      rows={2}
                      style={{ fontSize: 13, padding: "6px 10px", width: "100%", resize: "vertical", borderRadius: 6, boxSizing: "border-box" }}
                    />
                  </Field>
                  <Field label="Badge text">
                    <input value={cfg.badgeText} onChange={e => set("badgeText", e.target.value)} placeholder="BREAKING" />
                  </Field>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                    {BADGE_PRESETS.map(b => (
                      <button
                        key={b}
                        onClick={() => set("badgeText", b)}
                        style={{
                          fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                          border: cfg.badgeText === b ? "1px solid #e74c3c" : "0.5px solid var(--color-border-secondary)",
                          background: cfg.badgeText === b ? "rgba(231,76,60,0.1)" : "none",
                          color: cfg.badgeText === b ? "#e74c3c" : "var(--color-text-secondary)",
                          fontWeight: 500,
                        }}
                      >{b}</button>
                    ))}
                  </div>
                </Section>

                <Section title="Ticker">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Show ticker</span>
                    <button
                      onClick={() => set("showTicker", !cfg.showTicker)}
                      style={{
                        width: 38, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
                        background: cfg.showTicker ? "#e74c3c" : "var(--color-border-secondary)",
                        position: "relative", transition: "background 0.2s",
                      }}
                    >
                      <span style={{
                        position: "absolute", top: 2, left: cfg.showTicker ? 20 : 2, width: 16, height: 16,
                        borderRadius: "50%", background: "#fff", transition: "left 0.2s",
                      }} />
                    </button>
                  </div>
                  {cfg.showTicker && (
                    <>
                      <Field label="Ticker text">
                        <textarea
                          value={cfg.ticker}
                          onChange={e => set("ticker", e.target.value)}
                          rows={3}
                          style={{ fontSize: 13, padding: "6px 10px", width: "100%", resize: "vertical", borderRadius: 6, boxSizing: "border-box" }}
                        />
                      </Field>
                      <Field label={`Speed: ${cfg.tickerSpeed}px/s`}>
                        <input type="range" min="30" max="200" step="10" value={cfg.tickerSpeed} onChange={e => set("tickerSpeed", Number(e.target.value))} style={{ width: "100%" }} />
                      </Field>
                    </>
                  )}
                </Section>
              </>
            )}

            {tab === "style" && (
              <>
                <Section title="Top Bar">
                  <Field label="Background color">
                    <ColorPicker value={cfg.topBarColor} onChange={v => set("topBarColor", v)} />
                  </Field>
                </Section>

                <Section title="Headline Bar">
                  <Field label="Background color">
                    <ColorPicker value={cfg.bottomBarColor} onChange={v => set("bottomBarColor", v)} />
                  </Field>
                  <Field label="Badge color">
                    <ColorPicker value={cfg.badgeColor} onChange={v => set("badgeColor", v)} />
                  </Field>
                </Section>

                <Section title="Ticker">
                  <Field label="Background">
                    <ColorPicker value={cfg.tickerBg} onChange={v => set("tickerBg", v)} />
                  </Field>
                  <Field label="Text color">
                    <ColorPicker value={cfg.tickerColor} onChange={v => set("tickerColor", v)} />
                  </Field>
                </Section>

                <Section title="Border">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Show border</span>
                    <button
                      onClick={() => set("showBorder", !cfg.showBorder)}
                      style={{
                        width: 38, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
                        background: cfg.showBorder ? "#e74c3c" : "var(--color-border-secondary)",
                        position: "relative", transition: "background 0.2s",
                      }}
                    >
                      <span style={{
                        position: "absolute", top: 2, left: cfg.showBorder ? 20 : 2, width: 16, height: 16,
                        borderRadius: "50%", background: "#fff", transition: "left 0.2s",
                      }} />
                    </button>
                  </div>
                  {cfg.showBorder && (
                    <Field label="Border color">
                      <ColorPicker value={cfg.borderColor} onChange={v => set("borderColor", v)} />
                    </Field>
                  )}
                </Section>
              </>
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#1a1a1a", overflowX: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Live Preview — 640 × 360</div>
            <div style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>
              <LivePreview config={cfg} />
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Preview is proportional to 1280×720 output</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
        input[type="text"], input:not([type="range"]):not([type="color"]):not([type="file"]), textarea, select {
          width: 100%; box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}