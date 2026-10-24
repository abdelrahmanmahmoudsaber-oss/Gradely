import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Smartphone, Laptop, ShieldCheck, LogOut, CheckCircle2, Clock, X, RefreshCw, AlertCircle } from 'lucide-react';
import { getDeviceSessionToken, getDeviceDetails } from '../utils/deviceHelper';

export default function ActiveSessionsModal({ user, onLogout, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const currentDeviceToken = getDeviceSessionToken();

  const loadSessions = async () => {
    setLoading(true);
    try {
      const dev = getDeviceDetails();
      // 1. Register or update this device's heartbeat
      try {
        await supabase.rpc('register_active_session', {
          p_user_id: user.user_id,
          p_session_token: currentDeviceToken,
          p_device_name: dev.name,
          p_device_type: dev.type
        });
      } catch (e) {}

      // 2. Fetch active sessions list for this user
      const { data, error } = await supabase.rpc('get_my_active_sessions', {
        p_user_id: user.user_id,
        p_session_token: currentDeviceToken
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        setSessions(data);
      } else {
        // Fallback representation of current device
        setSessions([
          {
            id: 'current-device',
            device_name: dev.name,
            device_type: dev.type,
            last_active: new Date().toISOString(),
            is_current: true
          }
        ]);
      }
    } catch (err) {
      console.warn('Load sessions notice:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // Revoke any device (current device or another device)
  const handleRevokeSession = async (session) => {
    const isCurrent = session.is_current;
    if (isCurrent) {
      if (!window.confirm('هل أنت متأكد من تسجيل الخروج من هذا الجهاز الآن؟')) return;
    } else {
      if (!window.confirm(`هل أنت متأكد من تسجيل الخروج من (${session.device_name})؟`)) return;
    }

    setRevokingId(session.id);
    try {
      await supabase.rpc('revoke_target_session', {
        p_user_id: user.user_id,
        p_session_token: currentDeviceToken,
        p_target_session_id: session.id
      });

      if (isCurrent) {
        // If logged out from this current device, execute full logout
        localStorage.removeItem('gradely_device_session_token');
        if (onLogout) {
          onLogout();
        } else {
          window.location.reload();
        }
        return;
      }

      setSessions(prev => prev.filter(s => s.id !== session.id));
      setStatusMsg(`تم تسجيل الخروج من (${session.device_name}) بنجاح.`);
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setRevokingId(null);
    }
  };

  // Revoke all other devices except this one
  const handleRevokeAllOther = async () => {
    if (!window.confirm('هل تريد بالتأكيد تسجيل الخروج من جميع الأجهزة الأخرى وإبقائها على هذا الجهاز فقط؟')) return;
    setRevokingAll(true);
    try {
      await supabase.rpc('revoke_all_other_sessions', {
        p_user_id: user.user_id,
        p_session_token: currentDeviceToken
      });
      setSessions(prev => prev.filter(s => s.is_current));
      setStatusMsg('تم إغلاق وتسجيل الخروج من كافة الأجهزة الأخرى بنجاح.');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setRevokingAll(false);
    }
  };

  const formatTimeAgo = (isoStr) => {
    if (!isoStr) return '';
    try {
      const diffMs = Date.now() - new Date(isoStr).getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 2) return 'نشط الآن';
      if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `منذ ${diffHours} ساعة`;
      const diffDays = Math.floor(diffHours / 24);
      return `منذ ${diffDays} يوم`;
    } catch {
      return '';
    }
  };

  const otherSessionsCount = sessions.filter(s => !s.is_current).length;

  return (
    <div 
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'clamp(1rem, 3vw, 2rem)', boxSizing: 'border-box'
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="panel fade-in" style={{
        maxWidth: '560px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
        border: '1px solid rgba(79, 70, 229, 0.35)', boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85)',
        borderRadius: '16px', padding: '1.5rem', boxSizing: 'border-box'
      }}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.2rem',borderBottom:'1px solid var(--border)',paddingBottom:'0.8rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <div style={{background:'rgba(79, 70, 229, 0.15)',padding:'8px',borderRadius:'10px',color:'var(--primary-hover)'}}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 style={{margin:0,fontSize:'1.15rem',color:'var(--text-main)'}}>الأجهزة والجلسات النشطة</h3>
              <p style={{margin:0,fontSize:'0.8rem',color:'var(--text-muted)'}}>مراقبة الأجهزة المتصلة بحسابك وإلغاء تسجيل الدخول من أي جهاز في أي وقت</p>
            </div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',padding:'4px'}}>
            <X size={20} />
          </button>
        </div>

        {statusMsg && (
          <div className="fade-in" style={{padding:'10px 14px',borderRadius:'8px',background:'rgba(16, 185, 129, 0.15)',color:'#34d399',border:'1px solid rgba(16, 185, 129, 0.3)',marginBottom:'1rem',fontSize:'0.85rem',display:'flex',alignItems:'center',gap:'8px'}}>
            <CheckCircle2 size={16} /> {statusMsg}
          </div>
        )}

        {/* Global Action: Revoke All Other Devices */}
        {otherSessionsCount > 0 && (
          <div style={{marginBottom:'1.2rem',display:'flex',justifyContent:'flex-end'}}>
            <button 
              onClick={handleRevokeAllOther}
              disabled={revokingAll}
              style={{
                background:'rgba(239, 68, 68, 0.12)',color:'#f87171',border:'1px solid rgba(239, 68, 68, 0.3)',
                padding:'8px 14px',borderRadius:'8px',cursor:'pointer',fontSize:'0.85rem',fontWeight:700,
                display:'flex',alignItems:'center',gap:'6px',transition:'all 0.2s'
              }}
            >
              {revokingAll ? <RefreshCw size={14} className="spin" /> : <LogOut size={14} />}
              تسجيل الخروج من جميع الأجهزة الأخرى ({otherSessionsCount})
            </button>
          </div>
        )}

        {/* Sessions List */}
        {loading ? (
          <div style={{textAlign:'center',padding:'2rem 0',color:'var(--text-muted)'}}>
            <RefreshCw size={24} className="spin" style={{margin:'0 auto 10px'}} />
            <p style={{margin:0,fontSize:'0.85rem'}}>جاري فحص وتحديث الأجهزة المتصلة...</p>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
            {sessions.map(s => {
              const isMobile = s.device_type === 'mobile';
              return (
                <div 
                  key={s.id}
                  style={{
                    display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',
                    borderRadius:'10px',background: s.is_current ? 'rgba(79, 70, 229, 0.08)' : 'var(--bg-card, rgba(30, 41, 59, 0.5))',
                    border: s.is_current ? '1px solid rgba(79, 70, 229, 0.4)' : '1px solid var(--border)',
                    flexWrap: 'wrap', gap: '10px'
                  }}
                >
                  <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                    <div style={{
                      padding:'8px',borderRadius:'8px',
                      background: s.is_current ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      color: s.is_current ? '#34d399' : 'var(--text-muted)'
                    }}>
                      {isMobile ? <Smartphone size={20} /> : <Laptop size={20} />}
                    </div>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                        <strong style={{fontSize:'0.9rem',color:'var(--text-main)'}}>{s.device_name}</strong>
                        {s.is_current && (
                          <span style={{
                            fontSize:'0.72rem',background:'rgba(16, 185, 129, 0.2)',color:'#34d399',
                            padding:'2px 8px',borderRadius:'12px',fontWeight:700,display:'inline-flex',alignItems:'center',gap:'4px'
                          }}>
                            ● هذا الجهاز
                          </span>
                        )}
                      </div>
                      <p style={{margin:'3px 0 0',fontSize:'0.75rem',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:'4px'}}>
                        <Clock size={12} /> {s.is_current ? 'نشط الآن' : `آخر ظهور: ${formatTimeAgo(s.last_active)}`}
                      </p>
                    </div>
                  </div>

                  {/* Individual Device Logout Button (Available for EVERY device, including current device) */}
                  <button
                    onClick={() => handleRevokeSession(s)}
                    disabled={revokingId === s.id}
                    title={s.is_current ? "تسجيل الخروج من هذا الجهاز الحالي" : "تسجيل الخروج من هذا الجهاز عن بُعد"}
                    style={{
                      background: s.is_current ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.2s'
                    }}
                  >
                    {revokingId === s.id ? <RefreshCw size={13} className="spin" /> : <LogOut size={13} />}
                    {s.is_current ? 'تسجيل الخروج من هذا الجهاز' : 'تسجيل خروج'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{marginTop:'1.2rem',borderTop:'1px solid var(--border)',paddingTop:'0.8rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <button 
            onClick={loadSessions}
            title="تحديث قائمة الأجهزة المتصلة"
            style={{background:'none',border:'none',color:'var(--primary-hover)',cursor:'pointer',fontSize:'0.85rem',display:'flex',alignItems:'center',gap:'6px'}}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> تحديث القائمة
          </button>
          <button className="btn-secondary" onClick={onClose} style={{padding:'8px 18px',fontSize:'0.85rem'}}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
