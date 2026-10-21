import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import Login from './pages/Login';
import { supabase } from './supabaseClient';
import { cacheManager } from './utils/dataCache';
import NetworkIndicator from './components/NetworkIndicator';

// Code Splitting / Lazy Loading: Isolates Admin bundles and code from Student bundle
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));

const PageLoader = () => (
  <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #0f172a)' }}>
    <div style={{ textAlign: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: '1.1rem' }}>
      <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'spin 1s linear infinite' }}>⏳</div>
      جاري تحميل بيانات المنصة...
    </div>
  </div>
);

export default function App() {
  const [user, setUser] = useState(null);
  // authLoading: true while we check the Supabase session on mount.
  // Prevents a flash of the login page before the session is confirmed.
  const [authLoading, setAuthLoading] = useState(true);

  // Fetch the full user profile from the DB using the authenticated session.
  const fetchUserProfile = async (authUserId) => {
    let { data, error } = await supabase
      .from('users')
      .select('id, user_id, name, role, year_level, section, assigned_subjects, auth_id, created_at')
      .eq('auth_id', authUserId)
      .single();

    if (error || !data) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser && authUser.email) {
        const uId = authUser.email.replace('@gradely.app', '').trim();
        const res = await supabase
          .from('users')
          .select('id, user_id, name, role, year_level, section, assigned_subjects, auth_id, created_at')
          .eq('user_id', uId)
          .single();
        if (res.data) {
          data = res.data;
        }
      }
    }
    return data;
  };

  useEffect(() => {
    // -----------------------------------------------------------------------
    // SECURITY: Do NOT use localStorage to determine role or identity.
    // We call getSession() to check for a real server-issued JWT.
    // Only if a valid Supabase Auth session exists do we fetch the DB profile.
    // localStorage.gradely_user_display is kept only as a non-authoritative
    // display cache to avoid a loading flicker — never used for security.
    // -----------------------------------------------------------------------
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session && session.user) {
        const profile = await fetchUserProfile(session.user.id);
        if (profile) {
          setUser(profile);
          // Cache display info in localStorage ONLY for UX (not security).
          localStorage.setItem('gradely_user_display', JSON.stringify({
            name: profile.name,
            role: profile.role,
            user_id: profile.user_id,
          }));
        } else {
          // Session exists but no linked profile — sign out to clean up.
          await supabase.auth.signOut();
          setUser(null);
          localStorage.removeItem('gradely_user_display');
        }
      } else {
        // Fallback for students who authenticated via secure verify_legacy_login
        const studentSession = localStorage.getItem('gradely_student_session');
        const storedToken = localStorage.getItem('gradely_session_token');
        if (studentSession && storedToken) {
          try {
            const parsed = JSON.parse(studentSession);
            if (parsed && parsed.role === 'student' && parsed.user_id) {
              // ISSUE-27 & Attendance fix: validate the stored token server-side for THIS specific user.
              // A forged, expired, or mismatched localStorage entry cannot pass a live server check.
              const { data: isValid, error: rpcErr } = await supabase.rpc('verify_student_token_for_user', {
                p_session_token: storedToken,
                p_user_id: parsed.user_id
              });
              if (isValid === true) {
                // Token is valid and belongs to this student — restore session
                setUser({ ...parsed, session_token: storedToken });
                setAuthLoading(false);
                return;
              }
              // Transitional fallback if verify_student_token_for_user RPC is not yet deployed
              if (rpcErr && (rpcErr.code === 'PGRST202' || rpcErr.message?.includes('not find'))) {
                const { error: validationErr } = await supabase.rpc('get_my_attendance', {
                  p_session_token: storedToken
                });
                if (!validationErr) {
                  setUser({ ...parsed, session_token: storedToken });
                  setAuthLoading(false);
                  return;
                }
              }
              // Token invalid, expired, or belongs to another user — clear session
            }
          } catch (e) {}
        }
        setUser(null);
        localStorage.removeItem('gradely_user_display');
        localStorage.removeItem('gradely_student_session');
        localStorage.removeItem('gradely_session_token');
        cacheManager.clear();
      }
      setAuthLoading(false);
    };

    initAuth();

    // Listen for auth state changes (login, logout, token refresh, session expiry).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session && session.user) {
        const profile = await fetchUserProfile(session.user.id);
        if (profile) {
          setUser(profile);
          localStorage.setItem('gradely_user_display', JSON.stringify({
            name: profile.name,
            role: profile.role,
            user_id: profile.user_id,
          }));
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('gradely_user_display');
        localStorage.removeItem('gradely_student_session');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (userData) => {
    // Called from Login.jsx after successful verification
    setUser(userData);
    localStorage.setItem('gradely_user_display', JSON.stringify({
      name: userData.name,
      role: userData.role,
      user_id: userData.user_id,
    }));
    if (userData.role === 'student') {
      localStorage.setItem('gradely_student_session', JSON.stringify(userData));
    }
  };

  const handleLogout = async () => {
    // 1. Revoke the server-side student session token BEFORE clearing local state.
    //    This ensures the token is invalidated on the server so it cannot be reused
    //    even if an attacker captures it from memory or network traffic.
    //    We attempt revocation even if the user is not technically a 'student' role,
    //    because any legacy-login user may have a session token stored.
    try {
      const storedToken = localStorage.getItem('gradely_session_token');
      if (storedToken) {
        // Fire-and-forget with a short timeout — never block logout on RPC failure.
        const rpcPromise = supabase.rpc('revoke_student_session', {
          p_session_token: storedToken
        });
        // Wait max 3 seconds; proceed regardless of outcome
        await Promise.race([
          rpcPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]).catch(() => {
          // Silently absorb: network error or timeout should not prevent logout
        });
      }
    } catch {
      // Never block logout on revocation failure
    }

    // 2. Sign out of Supabase Auth (invalidates Supabase JWT session for admins/TAs)
    await supabase.auth.signOut().catch(() => {});

    // 3. Clear all local state and storage
    setUser(null);
    cacheManager.clear();
    localStorage.removeItem('gradely_user_display');
    localStorage.removeItem('gradely_student_session');
    localStorage.removeItem('gradely_session_token');
    // Remove legacy key too if it still exists
    localStorage.removeItem('gradely_user');
  };

  // Show nothing while the session is being checked — prevents login flash.
  if (authLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '1.1rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          جاري التحقق من الجلسة...
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="app-root">
        <NetworkIndicator />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route
              path="/"
              element={!user ? <Login onLogin={handleLogin} /> : (
                (user.role === 'admin' || user.role === 'super_admin')
                  ? <Navigate to="/admin" />
                  : <Navigate to="/dashboard" />
              )}
            />
            <Route
              path="/admin"
              element={user && (user.role === 'admin' || user.role === 'super_admin')
                ? <AdminDashboard user={user} onLogout={handleLogout} />
                : <Navigate to="/" />}
            />
            <Route
              path="/dashboard"
              element={user && user.role === 'student'
                ? <StudentDashboard user={user} onLogout={handleLogout} />
                : <Navigate to="/" />}
            />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
}
