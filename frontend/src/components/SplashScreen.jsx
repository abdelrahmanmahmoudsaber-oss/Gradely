import React from 'react';

export default function SplashScreen({ statusText = 'جاري تجهيز بياناتك...' }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      background: '#070b14',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 'clamp(2rem, 5vh, 3.5rem) 1.25rem',
      boxSizing: 'border-box',
      zIndex: 99999,
      fontFamily: "'Cairo', system-ui, -apple-system, sans-serif",
      color: '#ffffff',
      overflow: 'hidden'
    }}>
      {/* Ambient background ribbons & glows */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1
        }}
        viewBox="0 0 400 800"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="curveGoldBlueTop" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d97706" stopOpacity="0.8" />
            <stop offset="40%" stopColor="#f59e0b" stopOpacity="0.5" />
            <stop offset="70%" stopColor="#38bdf8" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#1e40af" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="curveGoldBlueBottom" x1="100%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="40%" stopColor="#818cf8" stopOpacity="0.6" />
            <stop offset="70%" stopColor="#f59e0b" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="centerAmbient" cx="50%" cy="38%" r="45%">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#0f172a" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#070b14" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Center Glow */}
        <rect width="400" height="800" fill="url(#centerAmbient)" />

        {/* Top-left elegant curves */}
        <path
          d="M -60 140 C 60 70, 160 30, 280 -60"
          stroke="url(#curveGoldBlueTop)"
          strokeWidth="2.5"
          fill="none"
          opacity="0.75"
        />
        <path
          d="M -80 200 C 40 130, 140 80, 320 -30"
          stroke="url(#curveGoldBlueTop)"
          strokeWidth="1.2"
          fill="none"
          opacity="0.45"
        />

        {/* Bottom-right elegant curves */}
        <path
          d="M 120 860 C 240 790, 340 730, 460 620"
          stroke="url(#curveGoldBlueBottom)"
          strokeWidth="2.5"
          fill="none"
          opacity="0.75"
        />
        <path
          d="M 80 890 C 200 820, 310 760, 480 660"
          stroke="url(#curveGoldBlueBottom)"
          strokeWidth="1.2"
          fill="none"
          opacity="0.4"
        />
      </svg>

      {/* Invisible spacer for vertical balance */}
      <div style={{ height: '10px' }} />

      {/* Main Brand & Status Content */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        maxWidth: '380px',
        width: '100%',
        zIndex: 2
      }}>
        {/* Glow App Icon Container */}
        <div style={{
          position: 'relative',
          marginBottom: '1.4rem'
        }}>
          {/* Intense Neon Blue Glow */}
          <div style={{
            position: 'absolute',
            inset: '-10px',
            background: 'radial-gradient(circle, rgba(56, 189, 248, 0.5) 0%, rgba(99, 102, 241, 0.4) 50%, rgba(7, 11, 20, 0) 75%)',
            borderRadius: '34px',
            filter: 'blur(20px)',
            opacity: 0.85,
            animation: 'gradelyPulse 3s ease-in-out infinite'
          }} />

          {/* Squircle Tile with Glassmorphism */}
          <div style={{
            position: 'relative',
            width: '92px',
            height: '92px',
            background: 'linear-gradient(145deg, #131c31 0%, #0a0f1d 100%)',
            borderRadius: '26px',
            border: '1.5px solid rgba(56, 189, 248, 0.45)',
            boxShadow: '0 15px 35px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(10px)'
          }}>
            {/* Gradely Stylized Icon: G wearing Mortarboard */}
            <svg width="60" height="60" viewBox="0 0 100 100" fill="none">
              <defs>
                <linearGradient id="gLetterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="50%" stopColor="#60a5fa" />
                  <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
                <linearGradient id="capGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
                <filter id="iconDropShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.5" />
                </filter>
              </defs>

              {/* Bold Stylized 'G' */}
              <path
                d="M 52 28 C 36 28 24 40 24 56 C 24 72 36 84 52 84 C 68 84 76 73 76 62 L 52 62 L 52 50 L 88 50 C 89 74 74 94 52 94 C 28 94 12 76 12 56 C 12 34 29 18 52 18 C 63 18 73 22 80 29 L 71 38 C 66 32 59 28 52 28 Z"
                fill="url(#gLetterGrad)"
                filter="url(#iconDropShadow)"
              />

              {/* Graduation Cap on top left of G */}
              <g transform="translate(18, 10) rotate(-16) scale(0.9)">
                {/* Cap diamond */}
                <polygon
                  points="26,4 48,13 26,22 4,13"
                  fill="url(#capGrad)"
                  stroke="#fbbf24"
                  strokeWidth="1.2"
                />
                {/* Cap skull base */}
                <path
                  d="M 12 16 L 12 24 C 12 28 40 28 40 24 L 40 16 Z"
                  fill="#b45309"
                  opacity="0.9"
                />
                {/* Tassel Button & Hanging String */}
                <circle cx="26" cy="13" r="2.2" fill="#fef3c7" />
                <path
                  d="M 26 13 Q 10 18 8 26"
                  stroke="#fbbf24"
                  strokeWidth="1.5"
                  fill="none"
                />
                <circle cx="8" cy="27" r="1.8" fill="#f59e0b" />
              </g>
            </svg>
          </div>
        </div>

        {/* Brand Name with Purple 'y' */}
        <h1 style={{
          margin: '0 0 1.6rem 0',
          fontSize: 'clamp(2.4rem, 6vw, 2.9rem)',
          fontWeight: 900,
          letterSpacing: '-0.5px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1
        }}>
          <span style={{ color: '#ffffff' }}>Gradel</span>
          <span style={{
            background: 'linear-gradient(135deg, #a855f7 0%, #818cf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>y</span>
        </h1>

        {/* Glowing Progress Bar */}
        <div style={{
          width: '210px',
          height: '5px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '999px',
          overflow: 'hidden',
          position: 'relative',
          marginBottom: '1rem',
          boxShadow: '0 0 15px rgba(56, 189, 248, 0.25)'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '50%',
            background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 60%, #a855f7 100%)',
            borderRadius: '999px',
            boxShadow: '0 0 12px #38bdf8',
            animation: 'gradelyIndeterminate 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite'
          }} />
        </div>

        {/* Status Text */}
        <span style={{
          fontSize: '0.92rem',
          color: '#94a3b8',
          fontWeight: 500,
          letterSpacing: '0.2px'
        }}>
          {statusText}
        </span>
      </div>

      {/* Developer Credits - Ultra Clean & Organized Bottom Pill */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '9px',
        zIndex: 2,
        width: '100%',
        maxWidth: '440px'
      }}>
        {/* Separator with DEVELOPED BY */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          width: '100%',
          color: '#64748b',
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '1.2px'
        }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />
          <span>DEVELOPED BY</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />
        </div>

        {/* Outer Glowing Glass Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          padding: '10px 18px',
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1.2px solid rgba(56, 189, 248, 0.35)',
          boxShadow: '0 0 25px rgba(56, 189, 248, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          backdropFilter: 'blur(16px)',
          maxWidth: '96vw',
          width: 'max-content',
          boxSizing: 'border-box'
        }}>
          {/* Eng Abdelrahman Mahmoud */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
              border: '1.5px solid #60a5fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.72rem',
              fontWeight: 900,
              color: '#ffffff',
              boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
              flexShrink: 0
            }}>
              AM
            </div>
            <span style={{
              fontSize: 'clamp(0.78rem, 2.5vw, 0.88rem)',
              fontWeight: 700,
              color: '#f8fafc',
              whiteSpace: 'nowrap',
              letterSpacing: '0.2px'
            }}>
              Eng Abdelrahman Mahmoud
            </span>
          </div>

          {/* Thin Glass Divider */}
          <div style={{
            width: '1px',
            height: '18px',
            background: 'rgba(255, 255, 255, 0.15)',
            flexShrink: 0
          }} />

          {/* Eng Mostafa Tag */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0d9488, #14b8a6)',
              border: '1.5px solid #5eead4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.72rem',
              fontWeight: 900,
              color: '#ffffff',
              boxShadow: '0 0 10px rgba(20, 184, 166, 0.5)',
              flexShrink: 0
            }}>
              MT
            </div>
            <span style={{
              fontSize: 'clamp(0.78rem, 2.5vw, 0.88rem)',
              fontWeight: 700,
              color: '#f8fafc',
              whiteSpace: 'nowrap',
              letterSpacing: '0.2px'
            }}>
              Eng Mostafa Tag
            </span>
          </div>
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes gradelyIndeterminate {
          0% {
            left: -50%;
          }
          100% {
            left: 100%;
          }
        }
        @keyframes gradelyPulse {
          0%, 100% {
            opacity: 0.7;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.08);
          }
        }
      `}</style>
    </div>
  );
}
