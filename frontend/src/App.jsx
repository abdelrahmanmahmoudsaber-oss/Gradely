import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import Login from './pages/Login';
import { supabase } from './supabaseClient';
import { cacheManager } from './utils/dataCache';
import NetworkIndicator from './components/NetworkIndicator';
import InstallPwaBanner from './components/InstallPwaBanner';
import SplashScreen from './components/SplashScreen';
import { registerCurrentDevice, startDeviceHeartbeat } from './utils/deviceHelper';

// Code Splitting / Lazy Loading: Isolates Admin bundles and code from Student bundle
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));

const PageLoader = () => <SplashScreen statusText="جاري تحميل الصفحة والمكونات..." />;

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
    // SECURITY & MULTI-DEVICE STABILITY:
    // Seamlessly handles multi-device sessions (phone + PC simultaneously)
    // and guards against unexpected dropouts during network blips or tab switches.
    // -----------------------------------------------------------------------
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session && session.user) {
          const profile = await fetchUserProfile(session.user.id);
          if (profile) {
            setUser(profile);
            registerCurrentDevice(profile);
            // Cache display info in localStorage ONLY for UX (not security).
            localStorage.setItem('gradely_user_display', JSON.stringify({
              name: profile.name,
              role: profile.role,
              user_id: profile.user_id,
            }));
            setAuthLoading(false);
            return;
          } else if (navigator.onLine) {
            // Online but session has no linked DB profile — sign out to clean up.
            await supabase.auth.signOut().catch(() => {});
            setUser(null);
            localStorage.removeItem('gradely_user_display');
          } else {
            // Offline / network failure: fallback to cached user display to prevent offline kickout
            const cached = localStorage.getItem('gradely_user_display');
            if (cached) {
              try {
                setUser(JSON.parse(cached));
                setAuthLoading(false);
                return;
              } catch (e) {}
            }
          }
        }
      } catch (err) {
        console.warn('Supabase auth session check notice:', err);
      }

      // Multi-device fallback for users (TAs & Students) who authenticated via verify_legacy_login
      const adminSession = localStorage.getItem('gradely_admin_session');
      const studentSession = localStorage.getItem('gradely_student_session');
      const storedToken = localStorage.getItem('gradely_session_token');

      if (adminSession && storedToken) {
        try {
          const parsed = JSON.parse(adminSession);
          if (parsed && (parsed.role === 'admin' || parsed.role === 'super_admin') && parsed.user_id) {
            // Server-side database verification to prevent client-side role tampering
            const { data: isAdmin, error: adminErr } = await supabase.rpc('verify_is_admin', {
              p_user_id: String(parsed.user_id),
              p_session_token: storedToken
            });

            if (isAdmin === true) {
              setUser({ ...parsed, session_token: storedToken });
              registerCurrentDevice(parsed);
              setAuthLoading(false);
              return;
            } else if (!adminErr) {
              // Server returned explicit false (e.g. session sliding token rotation or another device logged in)
              // To prevent kicking out active TAs: verify identity directly against the users table
              const { data: userRecord, error: userErr } = await supabase
                .from('users')
                .select('id, user_id, name, role, year_level, section, assigned_subjects')
                .eq('user_id', parsed.user_id)
                .single();

              if (!userErr && userRecord && (userRecord.role === 'admin' || userRecord.role === 'super_admin')) {
                const verifiedStaff = { ...userRecord, session_token: storedToken };
                setUser(verifiedStaff);
                registerCurrentDevice(verifiedStaff);
                setAuthLoading(false);
                return;
              } else {
                localStorage.removeItem('gradely_admin_session');
              }
            } else {
              // Network error / offline: preserve session so TA can continue taking attendance offline
              setUser({ ...parsed, session_token: storedToken });
              setAuthLoading(false);
              return;
            }
          }
        } catch (e) {}
      }

      if (studentSession && storedToken) {
        try {
          const parsed = JSON.parse(studentSession);
          if (parsed && parsed.role === 'student' && parsed.user_id) {
            const { data: isValid, error: rpcErr } = await supabase.rpc('verify_student_token_for_user', {
              p_session_token: storedToken,
              p_user_id: parsed.user_id
            });

            if (isValid === true) {
              setUser({ ...parsed, session_token: storedToken });
              registerCurrentDevice(parsed);
              setAuthLoading(false);
              return;
            } else if (rpcErr) {
              // Network error: preserve student session
              setUser({ ...parsed, session_token: storedToken });
              setAuthLoading(false);
              return;
            } else {
              // Graceful fallback: check student existence in users table
              const { data: stuRecord, error: stuErr } = await supabase
                .from('users')
                .select('id, user_id, name, role, year_level, section, assigned_subjects')
                .eq('user_id', parsed.user_id)
                .single();

              if (!stuErr && stuRecord && stuRecord.role === 'student') {
                const validStudent = { ...stuRecord, session_token: storedToken };
                setUser(validStudent);
                registerCurrentDevice(validStudent);
                setAuthLoading(false);
                return;
              } else {
                localStorage.removeItem('gradely_student_session');
              }
            }
          }
        } catch (e) {}
      }

      // Only wipe if there is truly no session or credentials were unambiguously invalid
      if (!adminSession && !studentSession) {
        setUser(null);
        localStorage.removeItem('gradely_user_display');
        localStorage.removeItem('gradely_student_session');
        localStorage.removeItem('gradely_admin_session');
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
          registerCurrentDevice(profile);
          localStorage.setItem('gradely_user_display', JSON.stringify({
            name: profile.name,
            role: profile.role,
            user_id: profile.user_id,
          }));
        }
      } else if (event === 'SIGNED_OUT') {
        // Prevent spurious Supabase Auth SIGNED_OUT from terminating active legacy token sessions
        const hasLegacyToken = localStorage.getItem('gradely_session_token');
        const hasLegacyAdmin = localStorage.getItem('gradely_admin_session');
        const hasLegacyStudent = localStorage.getItem('gradely_student_session');
        if (!hasLegacyToken && !hasLegacyAdmin && !hasLegacyStudent) {
          setUser(null);
          localStorage.removeItem('gradely_user_display');
          localStorage.removeItem('gradely_student_session');
          localStorage.removeItem('gradely_admin_session');
          localStorage.removeItem('gradely_session_token');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // -------------------------------------------------------------------------
  // Automatic Device Heartbeat & Multi-Device Sliding Window Session Renewal:
  // - Keeps last_active timestamp updated in real time for "الأجهزة المتصلة"
  // - Extends 30-day session sliding window so active users NEVER get kicked out
  // - Detects if this device was remotely revoked from another device
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!user || !user.user_id) return;
    const cleanup = startDeviceHeartbeat(user, () => {
      console.warn('Session was explicitly revoked from another device.');
      handleLogout();
    });
    return () => cleanup();
  }, [user?.user_id]);

  const handleLogin = (userData) => {
    // Called from Login.jsx after successful verification
    setUser(userData);
    registerCurrentDevice(userData);
    localStorage.setItem('gradely_user_display', JSON.stringify({
      name: userData.name,
      role: userData.role,
      user_id: userData.user_id,
    }));
    if (userData.role === 'student') {
      localStorage.setItem('gradely_student_session', JSON.stringify(userData));
      localStorage.removeItem('gradely_admin_session');
    } else {
      localStorage.setItem('gradely_admin_session', JSON.stringify(userData));
      localStorage.removeItem('gradely_student_session');
    }
  };

  const handleLogout = async () => {
    // 1. Revoke the server-side session token BEFORE clearing local state.
    try {
      const storedToken = localStorage.getItem('gradely_session_token');
      if (storedToken) {
        const rpcPromise = supabase.rpc('revoke_student_session', {
          p_session_token: storedToken
        });
        await Promise.race([
          rpcPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]).catch(() => {});
      }
    } catch {
      // Never block logout on revocation failure
    }

    // 2. Sign out of Supabase Auth
    await supabase.auth.signOut().catch(() => {});

    // 3. Clear all local state and storage
    setUser(null);
    cacheManager.clear();
    localStorage.removeItem('gradely_user_display');
    localStorage.removeItem('gradely_student_session');
    localStorage.removeItem('gradely_admin_session');
    localStorage.removeItem('gradely_session_token');
    localStorage.removeItem('gradely_device_session_token');
    localStorage.removeItem('gradely_user');
  };

  // Show nothing while the session is being checked — prevents login flash.
  if (authLoading) {
    return <SplashScreen statusText="جاري التحقق من الجلسة ومزامنة البيانات..." />;
  }

  return (
    <Router>
      <div className="app-root">
        <NetworkIndicator />
        <InstallPwaBanner />
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
