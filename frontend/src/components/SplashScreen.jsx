import React from 'react';

export default function SplashScreen({ statusText = 'جاري التحقق من الجلسة ومزامنة البيانات...' }) {
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
      padding: 'clamp(2rem, 5vh, 3.5rem) 16px',
      boxSizing: 'border-box',
      zIndex: 99999,
      fontFamily: "'Cairo', system-ui, -apple-system, sans-serif",
      color: '#ffffff',
      overflow: 'hidden'
    }}>
      {/* Ambient background curves & radial glows */}
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
          <linearGradient id="curveGoldTop" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d97706" stopOpacity="0.7" />
            <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="curveBlueBottom" x1="100%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.7" />
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="centerAmbientGlow" cx="50%" cy="36%" r="45%">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.38" />
            <stop offset="60%" stopColor="#0f172a" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#070b14" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="400" height="800" fill="url(#centerAmbientGlow)" />

        {/* Diagonal aesthetic lines */}
        <path d="M -80 150 C 40 80, 160 40, 320 -50" stroke="url(#curveGoldTop)" strokeWidth="2.2" fill="none" opacity="0.7" />
        <path d="M -100 210 C 20 140, 140 90, 360 -20" stroke="url(#curveGoldTop)" strokeWidth="1" fill="none" opacity="0.35" />

        <path d="M 100 870 C 240 800, 340 730, 480 610" stroke="url(#curveBlueBottom)" strokeWidth="2.2" fill="none" opacity="0.7" />
        <path d="M 60 900 C 200 830, 300 760, 500 650" stroke="url(#curveBlueBottom)" strokeWidth="1" fill="none" opacity="0.35" />
      </svg>

      {/* Top spacer */}
      <div style={{ height: '8px' }} />

      {/* Center Brand Area */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        maxWidth: '380px',
        width: '100%',
        zIndex: 2
      }}>
        {/* Glassmorphic Squircle Icon Tile */}
        <div style={{
          position: 'relative',
          marginBottom: '1.25rem'
        }}>
          {/* Soft Neon Blue Glow */}
          <div style={{
            position: 'absolute',
            inset: '-12px',
            background: 'radial-gradient(circle, rgba(56, 189, 248, 0.5) 0%, rgba(99, 102, 241, 0.35) 50%, rgba(7, 11, 20, 0) 75%)',
            borderRadius: '34px',
            filter: 'blur(20px)',
            opacity: 0.9,
            animation: 'gradelyPulse 3s ease-in-out infinite'
          }} />

          {/* Squircle Tile */}
          <div style={{
            position: 'relative',
            width: '94px',
            height: '94px',
            background: 'linear-gradient(145deg, #131c31 0%, #0a0f1d 100%)',
            borderRadius: '26px',
            border: '1.5px solid rgba(56, 189, 248, 0.45)',
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(12px)'
          }}>
            <svg width="62" height="62" viewBox="0 0 100 100" fill="none">
              <defs>
                <linearGradient id="gLetter3D" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="45%" stopColor="#60a5fa" />
                  <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
                <linearGradient id="capGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
                <filter id="shadow3D" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.5" />
                </filter>
              </defs>

              {/* 3D Stylized 'G' */}
              <path
                d="M 52 28 C 36 28 24 40 24 56 C 24 72 36 84 52 84 C 68 84 76 73 76 62 L 52 62 L 52 50 L 88 50 C 89 74 74 94 52 94 C 28 94 12 76 12 56 C 12 34 29 18 52 18 C 63 18 73 22 80 29 L 71 38 C 66 32 59 28 52 28 Z"
                fill="url(#gLetter3D)"
                filter="url(#shadow3D)"
              />

              {/* Graduation Cap */}
              <g transform="translate(18, 10) rotate(-16) scale(0.9)">
                <polygon
                  points="26,4 48,13 26,22 4,13"
                  fill="url(#capGoldGrad)"
                  stroke="#fbbf24"
                  strokeWidth="1.2"
                />
                <path
                  d="M 12 16 L 12 24 C 12 28 40 28 40 24 L 40 16 Z"
                  fill="#b45309"
                  opacity="0.9"
                />
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

        {/* Brand Name - STRICT LTR to prevent 'yGradel' reversal */}
        <div dir="ltr" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          marginBottom: '0.4rem',
          unicodeBidi: 'isolate'
        }}>
          <span style={{
            fontSize: 'clamp(2.5rem, 6.5vw, 3rem)',
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '-0.5px'
          }}>
            Gradel
          </span>
          <span style={{
            fontSize: 'clamp(2.5rem, 6.5vw, 3rem)',
            fontWeight: 900,
            color: '#38bdf8',
            textShadow: '0 0 16px rgba(56, 189, 248, 0.65)',
            letterSpacing: '-0.5px'
          }}>
            y
          </span>
        </div>

        {/* Tracking Subtitle */}
        <div style={{
          fontSize: '0.68rem',
          letterSpacing: '3.5px',
          color: '#64748b',
          fontWeight: 800,
          textTransform: 'uppercase',
          marginBottom: '2rem'
        }}>
          ACADEMIC INTELLIGENCE
        </div>

        {/* Loading Section */}
        <div style={{
          width: '220px',
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
            width: '45%',
            background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 60%, #a855f7 100%)',
            borderRadius: '999px',
            boxShadow: '0 0 14px #38bdf8',
            animation: 'gradelyIndeterminate 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite'
          }} />
        </div>

        {/* Arabic Status Caption */}
        <span dir="rtl" style={{
          fontSize: '0.9rem',
          color: '#94a3b8',
          fontWeight: 600,
          letterSpacing: '0.2px'
        }}>
          {statusText}
        </span>
      </div>

      {/* Floating Bottom Footer */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '9px',
        zIndex: 2,
        width: '100%',
        maxWidth: '390px',
        boxSizing: 'border-box'
      }}>
        {/* Tiny uppercase DEVELOPED BY */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          width: '100%',
          color: '#475569',
          fontSize: '0.68rem',
          fontWeight: 800,
          letterSpacing: '2px'
        }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />
          <span>DEVELOPED BY</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />
        </div>

        {/* Frosted Glass Pill Container - STRICT LTR & No Overflow */}
        <div dir="ltr" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '8px 12px',
          background: 'rgba(15, 23, 42, 0.7)',
          border: '1.2px solid rgba(56, 189, 248, 0.35)',
          boxShadow: '0 0 25px rgba(56, 189, 248, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.12)',
          borderRadius: '26px',
          backdropFilter: 'blur(16px)',
          boxSizing: 'border-box',
          gap: '6px'
        }}>
          {/* Badge 1: MT - Eng Mostafa Tag */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            flex: '1 1 0',
            minWidth: 0,
            justifyContent: 'flex-start'
          }}>
            <div style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0d9488, #14b8a6)',
              border: '1.5px solid #5eead4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              fontWeight: 900,
              color: '#ffffff',
              boxShadow: '0 0 8px rgba(20, 184, 166, 0.45)',
              flexShrink: 0
            }}>
              MT
            </div>
            <span style={{
              fontSize: 'clamp(0.72rem, 2.3vw, 0.8rem)',
              fontWeight: 700,
              color: '#f8fafc',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              Eng Mostafa Tag
            </span>
          </div>

          {/* Thin Glass Divider */}
          <div style={{
            width: '1px',
            height: '16px',
            background: 'rgba(255, 255, 255, 0.15)',
            flexShrink: 0
          }} />

          {/* Badge 2: AM - Eng Abdelrahman Mahmoud */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            flex: '1.15 1 0',
            minWidth: 0,
            justifyContent: 'flex-start'
          }}>
            <div style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
              border: '1.5px solid #60a5fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              fontWeight: 900,
              color: '#ffffff',
              boxShadow: '0 0 8px rgba(59, 130, 246, 0.45)',
              flexShrink: 0
            }}>
              AM
            </div>
            <span style={{
              fontSize: 'clamp(0.72rem, 2.3vw, 0.8rem)',
              fontWeight: 700,
              color: '#f8fafc',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              Eng Abdelrahman Mahmoud
            </span>
          </div>
        </div>
      </div>

      {/* Animations */}
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
            opacity: 0.75;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.06);
          }
        }
      `}</style>
    </div>
  );
}
