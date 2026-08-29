import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { LogIn, Lock, User } from 'lucide-react';

const LinkedInOfficialIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: '3px' }}>
    <rect width="24" height="24" rx="4" fill="#0A66C2"/>
    <path d="M7.4 9.6H4.6V18.6H7.4V9.6ZM6 4.6C5.1 4.6 4.4 5.3 4.4 6.2C4.4 7.1 5.1 7.8 6 7.8C6.9 7.8 7.6 7.1 7.6 6.2C7.6 5.3 6.9 4.6 6 4.6ZM19.4 13.7C19.4 10.8 17.8 9.4 15.6 9.4C13.8 9.4 13 10.4 12.5 11.2V9.6H9.7C9.7 10.4 9.7 18.6 9.7 18.6H12.5V13.6C12.5 13.3 12.5 13.1 12.6 12.9C12.9 12.2 13.5 11.5 14.5 11.5C15.8 11.5 16.3 12.5 16.3 14V18.6H19.4V13.7Z" fill="white"/>
  </svg>
);

export default function Login({ onLogin }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Helper to ensure Supabase Auth minimum 6-character requirement is always met
  const toAuthPassword = (raw) => (raw.length < 6 ? 'Gradely#' + raw : raw);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const trimmedUserId = userId.trim();
      const trimmedPassword = password.trim();
      const email = trimmedUserId + '@gradely.app';
      const authPassword = toAuthPassword(trimmedPassword);

      // ---------------------------------------------------------------
      // STEP 1: Try normal Supabase Auth sign-in with authPassword
      // ---------------------------------------------------------------
      let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: authPassword,
      });

      // Fallback check for passwords >= 6 chars created before padding
      if ((!authData || !authData.session) && trimmedPassword.length >= 6 && trimmedPassword !== authPassword) {
        const directTry = await supabase.auth.signInWithPassword({
          email,
          password: trimmedPassword,
        });
        if (directTry.data && directTry.data.session) {
          authData = directTry.data;
          authError = null;
        }
      }

      if (authData && authData.session) {
        // Fetch profile from DB
        const { data: profile } = await supabase
          .from('users')
          .select('id, user_id, name, role, year_level, assigned_subjects, auth_id, created_at')
          .eq('auth_id', authData.session.user.id)
          .single();

        if (profile) {
          onLogin(profile);
          return;
        }
      }

      // ---------------------------------------------------------------
      // STEP 2: Attempt legacy verification via RPC
      // ---------------------------------------------------------------
      const { data: rpcResult } = await supabase.rpc('verify_legacy_login', {
        p_user_id: trimmedUserId,
        p_password: trimmedPassword
      });

      if (rpcResult && rpcResult.error === 'rate_limited') {
        throw new Error(rpcResult.message || 'تم تجاوز عدد محاولات الدخول الخاطئة المسموحة. يرجى الانتظار 15 دقيقة ثم المحاولة مجدداً.');
      }

      if (rpcResult && rpcResult.success) {
        // Legacy credentials are valid! Create or update Supabase Auth user
        await supabase.auth.signUp({
          email,
          password: authPassword,
          options: {
            data: { user_id: rpcResult.user_id, name: rpcResult.name, role: rpcResult.role }
          }
        });

        // Sign in to establish active session
        const { data: signedInData } = await supabase.auth.signInWithPassword({
          email,
          password: authPassword
        });

        if (signedInData && signedInData.session) {
          // Link auth_id in users table
          await supabase.rpc('link_my_auth_id', { p_user_id: trimmedUserId });

          const { data: profile } = await supabase
            .from('users')
            .select('id, user_id, name, role, year_level, assigned_subjects, auth_id, created_at')
            .eq('user_id', trimmedUserId)
            .single();

          if (profile) {
            onLogin(profile);
            return;
          }
        }
      }

      throw new Error('الرقم الأكاديمي أو كلمة المرور غير صحيحة');

    } catch (err) {
      setError(err.message || 'الرقم الأكاديمي أو كلمة المرور غير صحيحة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        backgroundImage: 'radial-gradient(circle at 50% 18%, rgba(79, 70, 229, 0.12) 0%, transparent 60%)',
        padding: '1.5rem',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background Ambient Glow */}
      <div
        style={{
          position: 'absolute',
          top: '-150px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '500px',
          height: '350px',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(79, 70, 229, 0) 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />

      {/* Main Centered Login Card */}
      <div
        className="fade-in"
        style={{
          width: '100%',
          maxWidth: '430px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '2.5rem 2rem',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.45)',
          position: 'relative',
          zIndex: 1,
          boxSizing: 'border-box'
        }}
      >
        {/* Header Branding with AM Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.9rem' }}>
            <img 
              src="/am_logo.jpg" 
              alt="AM Personal Logo" 
              style={{ 
                width: '68px', 
                height: '68px', 
                borderRadius: '16px', 
                objectFit: 'cover',
                boxShadow: '0 8px 24px rgba(79, 70, 229, 0.35)',
                border: '1px solid rgba(99, 102, 241, 0.35)'
              }} 
            />
          </div>

          <h2 style={{ margin: '0 0 4px 0', fontSize: '1.85rem', fontWeight: 800, color: 'var(--primary-hover)', letterSpacing: '0.5px' }}>
            Gradely
          </h2>
          <h1 style={{ margin: '0 0 6px 0', fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)' }}>
            مرحباً بك
          </h1>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.95rem' }}>
            سجّل الدخول إلى بوابتك الأكاديمية
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '12px 14px',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.3rem' }}>
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '8px',
                fontWeight: 700,
                fontSize: '0.92rem',
                color: 'var(--text-main)'
              }}
            >
              <User size={16} color="var(--primary-hover)" />
              الرقم الأكاديمي
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="أدخل الرقم الأكاديمي"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              maxLength={100}
              style={{
                fontSize: '1rem',
                padding: '12px 14px',
                borderRadius: '8px',
                boxSizing: 'border-box',
                width: '100%'
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '8px',
                fontWeight: 700,
                fontSize: '0.92rem',
                color: 'var(--text-main)'
              }}
            >
              <Lock size={16} color="var(--primary-hover)" />
              كلمة المرور
            </label>
            <input
              type="password"
              className="input-field"
              placeholder="أدخل كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={200}
              style={{
                fontSize: '1rem',
                padding: '12px 14px',
                borderRadius: '8px',
                boxSizing: 'border-box',
                width: '100%'
              }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{
              marginTop: '0.6rem',
              padding: '13px 20px',
              fontSize: '1.05rem',
              fontWeight: 700,
              width: '100%',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <LogIn size={18} />
            {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
          </button>
        </form>

        {/* Personal Branding Footer (Strict LTR) */}
        <div style={{
          textAlign: 'center',
          marginTop: '1.8rem',
          borderTop: '1px solid var(--border)',
          paddingTop: '1.2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          direction: 'ltr'
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            <span>Developed by</span>
            <a 
              href="https://www.linkedin.com/in/abdelrahman-mahmoud-6912801a0/" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                color: 'var(--primary-hover)',
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
              onMouseOver={e => e.currentTarget.style.color = '#818cf8'}
              onMouseOut={e => e.currentTarget.style.color = 'var(--primary-hover)'}
            >
              <span>Abdelrahman Mahmoud</span>
              <LinkedInOfficialIcon />
            </a>
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '1.8px', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase' }}>
            SOFTWARE ENGINEER
          </span>
        </div>

      </div>
    </div>
  );
}
