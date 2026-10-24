import React from 'react';
import { Sparkles, Code2 } from 'lucide-react';

export default function SplashScreen({ statusText = 'جاري التحقق من الجلسة ومزامنة البيانات...' }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      background: 'radial-gradient(circle at 50% 30%, #1e1b4b 0%, #0a0f1d 70%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 'clamp(2rem, 5vh, 3.5rem) 1.5rem',
      boxSizing: 'border-box',
      zIndex: 99999,
      fontFamily: "'Cairo', system-ui, -apple-system, sans-serif",
      color: '#ffffff',
      overflow: 'hidden'
    }}>
      {/* Decorative top ambient blur */}
      <div style={{
        position: 'absolute',
        top: '-15%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '320px',
        height: '320px',
        background: 'rgba(99, 102, 241, 0.18)',
        filter: 'blur(90px)',
        borderRadius: '50%',
        pointerEvents: 'none'
      }} />

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
        {/* Logo Container with Soft Glow */}
        <div style={{
          position: 'relative',
          marginBottom: '1.25rem'
        }}>
          <div style={{
            position: 'absolute',
            inset: '-8px',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(168, 85, 247, 0.4))',
            borderRadius: '28px',
            filter: 'blur(16px)',
            opacity: 0.7,
            animation: 'pulse 3s ease-in-out infinite'
          }} />
          <div style={{
            position: 'relative',
            width: '84px',
            height: '84px',
            background: 'linear-gradient(145deg, #1e1e38, #0f1424)',
            borderRadius: '24px',
            border: '1.5px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 12px 30px -5px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <img 
              src="/gradely_logo.png" 
              alt="Gradely"
              style={{
                width: '54px',
                height: '54px',
                objectFit: 'contain',
                filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.4))'
              }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>
        </div>

        {/* Brand Name */}
        <h1 style={{
          margin: '0 0 0.35rem 0',
          fontSize: 'clamp(2rem, 5vw, 2.4rem)',
          fontWeight: 900,
          letterSpacing: '-0.5px',
          background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #818cf8 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: 1.2
        }}>
          Gradely
        </h1>

        {/* Subtitle */}
        <p style={{
          margin: '0 0 1.75rem 0',
          fontSize: '0.95rem',
          color: '#94a3b8',
          fontWeight: 600,
          letterSpacing: '0.2px'
        }}>
          المنصة الذكية لإدارة المتابعة الأكاديمية
        </p>

        {/* Animated Loading Bar */}
        <div style={{
          width: '180px',
          height: '4px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '999px',
          overflow: 'hidden',
          position: 'relative',
          marginBottom: '1rem'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '45%',
            background: 'linear-gradient(90deg, #6366f1, #a855f7, #38bdf8)',
            borderRadius: '999px',
            animation: 'gradelyIndeterminate 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite'
          }} />
        </div>

        {/* Status Text */}
        <span style={{
          fontSize: '0.85rem',
          color: '#64748b',
          fontWeight: 500
        }}>
          {statusText}
        </span>
      </div>

      {/* Developer Credits - Fixed at Bottom */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        padding: '12px 20px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        borderRadius: '16px',
        backdropFilter: 'blur(10px)',
        maxWidth: '340px',
        width: '100%',
        boxSizing: 'border-box',
        zIndex: 2
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#818cf8',
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          <Code2 size={13} />
          <span>Developed with Dedication by</span>
        </div>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '8px 14px',
          marginTop: '2px'
        }}>
          <span style={{
            fontSize: '0.85rem',
            fontWeight: 800,
            color: '#f8fafc',
            letterSpacing: '0.3px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span style={{ color: '#38bdf8' }}>•</span> Eng Abdelrahman Mahmoud
          </span>
          <span style={{
            fontSize: '0.85rem',
            fontWeight: 800,
            color: '#f8fafc',
            letterSpacing: '0.3px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span style={{ color: '#a855f7' }}>•</span> Eng Mostafa Tag
          </span>
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes gradelyIndeterminate {
          0% {
            left: -45%;
          }
          100% {
            left: 100%;
          }
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 0.6;
            transform: scale(1);
          }
          50% {
            opacity: 0.9;
            transform: scale(1.05);
          }
        }
      `}</style>
    </div>
  );
}
