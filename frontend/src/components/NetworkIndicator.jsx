import { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

export default function NetworkIndicator() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowBackOnline(true);
      setTimeout(() => {
        setShowBackOnline(false);
      }, 3500);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBackOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showBackOnline) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: '90%',
        width: 'auto',
        minWidth: '280px',
        padding: '10px 18px',
        borderRadius: '30px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        fontSize: '0.9rem',
        fontWeight: 700,
        boxShadow: isOnline 
          ? '0 8px 25px rgba(16, 185, 129, 0.35)' 
          : '0 8px 25px rgba(239, 68, 68, 0.35)',
        background: isOnline 
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))' 
          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))',
        color: '#ffffff',
        backdropFilter: 'blur(8px)',
        border: isOnline 
          ? '1px solid rgba(255, 255, 255, 0.3)' 
          : '1px solid rgba(255, 255, 255, 0.3)',
        animation: 'slideDown 0.3s ease-out',
        direction: 'rtl',
        pointerEvents: 'none'
      }}
    >
      {isOnline ? (
        <>
          <Wifi size={18} />
          <span>تم استعادة الاتصال بالإنترنت بنجاح ✓</span>
        </>
      ) : (
        <>
          <WifiOff size={18} />
          <span>أنت غير متصل بالإنترنت — التعديلات لن تُحفظ حتى يعود الاتصال</span>
        </>
      )}
    </div>
  );
}
