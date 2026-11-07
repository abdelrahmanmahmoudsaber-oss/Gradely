import { supabase } from '../supabaseClient';

export const getDeviceSessionToken = () => {
  let tok = localStorage.getItem('gradely_device_session_token');
  if (!tok) {
    tok = 'dev_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
    localStorage.setItem('gradely_device_session_token', tok);
  }
  return tok;
};

export const getDeviceDetails = () => {
  const ua = navigator.userAgent || '';
  let os = 'جهاز كمبيوتر';
  let type = 'desktop';

  // OS detection
  if (/android/i.test(ua)) {
    os = /tablet|ipad/i.test(ua) ? 'تابلت (Android)' : 'هاتف ذكي (Android)';
    type = 'mobile';
  } else if (/ipad/i.test(ua)) {
    os = 'آيباد (iPad)';
    type = 'mobile';
  } else if (/iphone|ipod/i.test(ua)) {
    os = 'آيفون (iPhone)';
    type = 'mobile';
  } else if (/windows nt 10/i.test(ua)) {
    os = 'كمبيوتر شخصي (Windows 10/11)';
    type = 'desktop';
  } else if (/windows/i.test(ua)) {
    os = 'كمبيوتر شخصي (Windows)';
    type = 'desktop';
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = 'جهاز ماك (macOS)';
    type = 'desktop';
  } else if (/linux/i.test(ua)) {
    os = 'نظام لينكس (Linux)';
    type = 'desktop';
  }

  // Browser detection
  let browser = 'متصفح ويب';
  if (/samsungbrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/edg/i.test(ua)) browser = 'Microsoft Edge';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';
  else if (/safari/i.test(ua)) browser = 'Apple Safari';

  const name = `${os} · ${browser}`;
  return { name, type };
};

export async function registerCurrentDevice(user) {
  if (!user || !user.user_id) return null;
  try {
    const token = getDeviceSessionToken();
    const dev = getDeviceDetails();
    const loginToken = user.session_token || localStorage.getItem('gradely_session_token') || null;

    const { data, error } = await supabase.rpc('register_active_session', {
      p_user_id: user.user_id,
      p_session_token: token,
      p_device_name: dev.name,
      p_device_type: dev.type,
      p_auth_token: loginToken
    });

    if (error) {
      console.warn('Device registration notice:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    // Non-blocking background registration
    return null;
  }
}

/**
 * Starts a background heartbeat that:
 * 1. Renews device last_active timestamp so "الأجهزة المتصلة" is 100% accurate.
 * 2. Slides session validity window by 30 days so active users are never kicked out.
 * 3. Immediately detects if another device remotely revoked this session.
 */
export function startDeviceHeartbeat(user, onRevoked) {
  if (!user || !user.user_id) return () => {};

  // Initial registration on startup
  registerCurrentDevice(user);

  let isChecking = false;

  const performPing = async () => {
    if (isChecking || !navigator.onLine) return;
    isChecking = true;
    try {
      const res = await registerCurrentDevice(user);
      // If server explicitly returns unauthorized_token or session revoked
      if (res && res.success === false && (res.error === 'unauthorized_token' || res.error === 'session_revoked')) {
        if (typeof onRevoked === 'function') {
          onRevoked();
        }
      }
    } catch {
      // Offline / network glitch - never logout
    } finally {
      isChecking = false;
    }
  };

  // Heartbeat every 2.5 minutes
  const intervalId = setInterval(performPing, 2.5 * 60 * 1000);

  // Instant refresh when user switches back to this tab
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      performPing();
    }
  };

  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}
