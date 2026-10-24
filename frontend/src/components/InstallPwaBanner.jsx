import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

export default function InstallPwaBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // 1. Check if already running as standalone PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
      return;
    }

    // 2. Check if user dismissed it recently (past 3 days)
    const dismissedTime = parseInt(localStorage.getItem('gradely_pwa_dismissed') || '0', 10);
    if (Date.now() - dismissedTime < 3 * 24 * 60 * 60 * 1000) {
      return;
    }

    // 3. Listen for the native install prompt event
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('gradely_pwa_dismissed', String(Date.now()));
  };

  if (!showBanner || !deferredPrompt) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9998,
        width: 'calc(100% - 32px)',
        maxWidth: '480px',
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(79, 70, 229, 0.4)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5), 0 0 20px rgba(79, 70, 229, 0.2)',
        borderRadius: '16px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      dir="rtl"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#fff',
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
          }}
        >
          <Smartphone size={22} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            تثبيت Gradely كتطبيق
          </div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            تصفح أسرع، استهلاك أقل للبيانات، وتحديث فوري
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={handleInstallClick}
          style={{
            background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '8px 14px',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)',
            transition: 'transform 0.15s ease'
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Download size={15} />
          تثبيت
        </button>

        <button
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s'
          }}
          title="إغلاق"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
