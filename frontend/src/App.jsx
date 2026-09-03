import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import StudentDashboard from './pages/StudentDashboard';
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { cacheManager } from './utils/dataCache';
import NetworkIndicator from './components/NetworkIndicator';

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
          supabase.from('users').update({ auth_id: authUserId }).eq('id', res.data.id).then();
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
        setUser(null);
        localStorage.removeItem('gradely_user_display');
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
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (userData) => {
    // Called from Login.jsx after successful Supabase Auth sign-in.
    // userData comes from DB profile fetch — not from user input directly.
    setUser(userData);
    localStorage.setItem('gradely_user_display', JSON.stringify({
      name: userData.name,
      role: userData.role,
      user_id: userData.user_id,
    }));
  };

  const handleLogout = async () => {
    cacheManager.clear();
    await supabase.auth.signOut();
    setUser(null);
    localStorage.removeItem('gradely_user_display');
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
        <Routes>
          <Route
            path="/"
            element={!user ? <Login onLogin={handleLogin} /> : (
              user.role === 'admin'
                ? <Navigate to="/admin" />
                : <Navigate to="/dashboard" />
            )}
          />
          <Route
            path="/admin"
            element={user && user.role === 'admin'
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
      </div>
    </Router>
  );
}
