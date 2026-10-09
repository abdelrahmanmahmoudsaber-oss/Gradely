import { useState, useEffect } from 'react';
import { LogOut, BookOpen, Users, CheckSquare, FileText, LayoutDashboard, Menu, X, Printer, KeyRound, Lock, WifiOff, Wifi } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { isSuperUser } from '../utils/dataCache';
import { checkAndRunScheduledBackup } from '../utils/backupService';
import OverviewTab from '../components/admin/OverviewTab';
import SubjectsTab from '../components/admin/SubjectsTab';
import StudentsTab from '../components/admin/StudentsTab';
import AttendanceTab from '../components/admin/AttendanceTab';
import GradesTab from '../components/admin/GradesTab';
import StudentReportTab from '../components/admin/StudentReportTab';

export default function AdminDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Password Change Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' });
  const [passwordUpdating, setPasswordUpdating] = useState(false);

  const isSuperAdmin = isSuperUser(user);
  const [autoBackupNotice, setAutoBackupNotice] = useState('');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Automatic scheduled background backup checker
  useEffect(() => {
    if (!isSuperAdmin) return;

    const runCheck = () => {
      checkAndRunScheduledBackup(user, (res) => {
        if (res && res.success) {
          setAutoBackupNotice('🤖 تم إرسال النسخة الاحتياطية المجدولة تلقائياً إلى بريدك الإلكتروني!');
          setTimeout(() => setAutoBackupNotice(''), 8000);
        }
      });
    };

    // Check 3 seconds after dashboard load
    const timeout = setTimeout(runCheck, 3000);

    // Check periodically every 5 minutes (reduced from 60s to minimize server logs)
    const interval = setInterval(runCheck, 5 * 60 * 1000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [isSuperAdmin, user]);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMsg({ type: '', text: '' });

    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'يجب أن تتكون كلمة المرور الجديدة من 6 أحرف أو أرقام على الأقل' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMsg({ type: 'error', text: 'كلمتا المرور غير متطابقتين' });
      return;
    }

    try {
      setPasswordUpdating(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setPasswordMsg({ type: 'success', text: '✅ تم تحديث كلمة المرور الخاصة بحسابك بنجاح!' });
      setTimeout(() => {
        setShowPasswordModal(false);
        setNewPassword('');
        setConfirmNewPassword('');
        setPasswordMsg({ type: '', text: '' });
      }, 1500);
    } catch (err) {
      console.error(err);
      setPasswordMsg({ type: 'error', text: err.message || 'حدث خطأ أثناء تحديث كلمة المرور' });
    } finally {
      setPasswordUpdating(false);
    }
  };

  const getPageTitle = () => {
    switch(activeTab) {
      case 'overview': return 'نظرة عامة';
      case 'subjects': return 'إدارة المواد';
      case 'students': return 'إدارة المستخدمين';
      case 'attendance': return 'سجل الغياب';
      case 'grades': return 'الدرجات التفصيلية';
      case 'report': return 'تقرير الطالب الشامل';
      default: return '';
    }
  };

  const allNavItems = [
    { id: 'overview', label: 'نظرة عامة', icon: <LayoutDashboard size={20} />, superOnly: false },
    { id: 'subjects', label: 'إدارة المواد', icon: <BookOpen size={20} />, superOnly: true },
    { id: 'students', label: 'إدارة المستخدمين', icon: <Users size={20} />, superOnly: true },
    { id: 'attendance', label: 'سجل الغياب', icon: <CheckSquare size={20} />, superOnly: false },
    { id: 'grades', label: 'الدرجات التفصيلية', icon: <FileText size={20} />, superOnly: false },
    { id: 'report', label: 'تقرير طالب شامل', icon: <Printer size={20} />, superOnly: false },
  ];

  const navItems = allNavItems.filter(item => isSuperAdmin || !item.superOnly);

  return (
    <div style={{display: 'flex', minHeight: '100vh', width: '100%', position: 'relative', overflowX: 'hidden'}}>
      
      {/* Mobile Menu Backdrop */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(3px)',
            zIndex: 90
          }}
          className="fade-in"
        />
      )}

      {/* Sidebar Drawer */}
      <div 
        style={{
          width: '280px', 
          maxWidth: '85vw',
          background: 'var(--surface)', 
          borderLeft: '1px solid var(--border)', 
          display: 'flex', 
          flexDirection: 'column',
          position: mobileMenuOpen ? 'fixed' : 'sticky',
          top: 0,
          right: 0,
          height: '100vh',
          zIndex: 100,
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: mobileMenuOpen ? '-10px 0 30px rgba(0,0,0,0.5)' : 'none'
        }}
        className={mobileMenuOpen ? '' : 'hide-on-mobile'}
      >
        <div style={{padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)'}}>
          <div>
            <h2 style={{margin: 0, color: 'var(--primary-hover)', fontSize: '1.8rem', fontWeight: 800, letterSpacing: '0.5px'}}>Gradely</h2>
            <span style={{fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginTop: '2px'}}>
              {isSuperAdmin ? 'بوابة الإدارة الأكاديمية' : 'بوابة المعيد والمشرف'}
            </span>
          </div>
          <button 
            className="show-on-mobile"
            style={{background:'rgba(255,255,255,0.05)', padding:'6px', color:'var(--text-main)', border:'none', borderRadius:'50%', cursor:'pointer', display: 'flex'}}
            onClick={() => setMobileMenuOpen(false)}
            aria-label="إغلاق القائمة"
          >
            <X size={22} />
          </button>
        </div>

        <div style={{padding: '1.2rem 1.5rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)'}}>
            <div style={{width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(79, 70, 229, 0.25)', color: 'var(--primary-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem'}}>
              {(user?.name || user?.user_id || 'U').charAt(0)}
            </div>
            <div style={{minWidth: 0}}>
              <div style={{fontWeight: 800, fontSize: '0.95rem', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{user?.name || user?.user_id || 'المسؤول'}</div>
              <div style={{fontSize: '0.8rem', fontWeight: 700, marginTop: '2px', color: isSuperAdmin ? 'var(--success)' : '#60a5fa'}}>
                {isSuperAdmin ? 'مدير النظام' : 'معيد / مشرف'}
              </div>
            </div>
          </div>
        </div>

        <nav style={{padding: '0 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, overflowY: 'auto'}}>
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button 
                key={item.id}
                onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                style={{
                  background: isActive ? 'rgba(79, 70, 229, 0.2)' : 'transparent',
                  color: isActive ? '#ffffff' : '#cbd5e1',
                  border: 'none',
                  borderRight: isActive ? '4px solid var(--primary-hover)' : '4px solid transparent',
                  borderRadius: '0 8px 8px 0',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '1rem',
                  fontWeight: 700,
                  fontFamily: "'Cairo', sans-serif",
                  cursor: 'pointer',
                  textAlign: 'right',
                  transition: 'all 0.15s ease',
                  width: '100%'
                }}
              >
                <span style={{color: isActive ? 'var(--primary-hover)' : '#94a3b8', display: 'flex', alignItems: 'center'}}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={{padding: '1.2rem', borderTop: '1px solid var(--border)'}}>
          <button 
            onClick={onLogout}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '10px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <LogOut size={16} />
            تسجيل الخروج
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%'}}>
        
        {/* Top Navbar */}
        <header style={{
          height: '65px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 clamp(1rem, 3vw, 2rem)',
          position: 'sticky',
          top: 0,
          zIndex: 40
        }}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.8rem'}}>
            <button 
              className="show-on-mobile"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border)',
                color: 'var(--text-main)',
                padding: '8px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onClick={() => setMobileMenuOpen(true)}
              aria-label="فتح القائمة"
            >
              <Menu size={22} />
            </button>
            <h1 style={{margin: 0, fontSize: 'clamp(1.2rem, 3vw, 1.5rem)', fontWeight: 800}}>{getPageTitle()}</h1>
          </div>

          <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
            <button 
              onClick={() => { setShowPasswordModal(true); setPasswordMsg({type:'',text:''}); }}
              style={{
                background: 'rgba(79, 70, 229, 0.1)',
                border: '1px solid rgba(79, 70, 229, 0.3)',
                color: 'var(--primary-hover)',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              <KeyRound size={15} /> تغيير كلمة المرور
            </button>
          </div>
        </header>

        {/* Network Offline Alert Banner */}
        {!isOnline && (
          <div 
            style={{
              background: 'linear-gradient(90deg, #991b1b 0%, #b91c1c 100%)',
              color: '#ffffff',
              padding: '10px 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              fontSize: '0.92rem',
              fontWeight: 700,
              boxShadow: '0 4px 15px rgba(185, 28, 28, 0.4)',
              zIndex: 35,
              textAlign: 'center'
            }}
          >
            <WifiOff size={20} style={{flexShrink:0}} />
            <span>⚠️ تنبيه: انقطع الاتصال بالإنترنت! أنت تعمل الآن في وضع عدم الاتصال (Offline Mode). جميع تسجيلات الغياب والدرجات يتم حفظها محلياً على جهازك بأمان، وستتم المزامنة تلقائياً فور عودة الإنترنت.</span>
          </div>
        )}

        {/* Auto Backup Notification Banner */}
        {autoBackupNotice && (
          <div 
            style={{
              background: 'linear-gradient(90deg, #065f46 0%, #047857 100%)',
              color: '#ffffff',
              padding: '10px 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              fontSize: '0.92rem',
              fontWeight: 700,
              boxShadow: '0 4px 15px rgba(4, 120, 87, 0.4)',
              zIndex: 35,
              textAlign: 'center'
            }}
            className="fade-in"
          >
            <span>{autoBackupNotice}</span>
          </div>
        )}

        {/* Dynamic View Component */}
        <main style={{padding: 'clamp(1rem, 2.5vw, 2rem)', flex: 1, overflowY: 'auto', width: '100%', boxSizing: 'border-box'}}>
          {activeTab === 'overview' && <OverviewTab user={user} />}
          {activeTab === 'subjects' && isSuperAdmin && <SubjectsTab user={user} />}
          {activeTab === 'students' && isSuperAdmin && <StudentsTab user={user} />}
          {activeTab === 'attendance' && <AttendanceTab user={user} />}
          {activeTab === 'grades' && <GradesTab user={user} />}
          {activeTab === 'report' && <StudentReportTab user={user} />}
        </main>
      </div>

      {/* Password Change Modal for TA / Admin */}
      {showPasswordModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
            boxSizing: 'border-box'
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setShowPasswordModal(false);
          }}
        >
          <div 
            className="panel fade-in" 
            style={{
              maxWidth: '440px',
              width: '100%',
              background: 'var(--surface, #1e293b)',
              border: '1px solid var(--border, #334155)',
              borderRadius: '16px',
              padding: '1.8rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              position: 'relative'
            }}
          >
            <button 
              onClick={() => setShowPasswordModal(false)}
              style={{
                position: 'absolute',
                top: '14px',
                left: '14px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.15)',
                color: 'var(--primary-hover, #6366f1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto'
              }}>
                <Lock size={28} />
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.3rem', color: 'var(--text-main, #f8fafc)' }}>
                🔑 تغيير كلمة المرور لحسابك
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)', lineHeight: 1.5 }}>
                أدخل كلمة المرور الجديدة الخاصة بحسابك المشرف (6 أحرف أو أرقام على الأقل).
              </p>
            </div>

            {passwordMsg.text && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                textAlign: 'center',
                background: passwordMsg.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: passwordMsg.type === 'error' ? 'var(--danger, #ef4444)' : 'var(--success, #10b981)',
                border: passwordMsg.type === 'error' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                {passwordMsg.text}
              </div>
            )}

            <form onSubmit={handleChangePassword}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  كلمة المرور الجديدة:
                </label>
                <input 
                  type="password"
                  required
                  minLength={6}
                  placeholder="6 أحرف أو أرقام على الأقل"
                  className="input-field"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '1.4rem' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  تأكيد كلمة المرور الجديدة:
                </label>
                <input 
                  type="password"
                  required
                  minLength={6}
                  placeholder="أعد كتابة كلمة المرور"
                  className="input-field"
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="submit"
                  disabled={passwordUpdating}
                  className="btn-primary"
                  style={{ flex: 1, padding: '10px', fontSize: '0.95rem', fontWeight: 700 }}
                >
                  {passwordUpdating ? 'جاري الحفظ...' : '💾 حفظ كلمة المرور'}
                </button>
                <button 
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="btn-secondary"
                  style={{ padding: '10px 16px', fontSize: '0.9rem' }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
