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
  let name = 'متصفح ويب';
  let type = 'desktop';

  if (/android/i.test(ua)) {
    name = 'هاتف ذكي (Android)';
    type = 'mobile';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    name = 'هاتف ذكي (iPhone / iOS)';
    type = 'mobile';
  } else if (/windows/i.test(ua)) {
    name = 'كمبيوتر شخصي (Windows)';
    type = 'desktop';
  } else if (/macintosh|mac os x/i.test(ua)) {
    name = 'جهاز ماك (macOS)';
    type = 'desktop';
  }

  if (/edg/i.test(ua)) name += ' · Edge';
  else if (/chrome/i.test(ua)) name += ' · Chrome';
  else if (/firefox/i.test(ua)) name += ' · Firefox';
  else if (/safari/i.test(ua)) name += ' · Safari';

  return { name, type };
};

export async function registerCurrentDevice(user) {
  if (!user || !user.user_id) return;
  try {
    const token = getDeviceSessionToken();
    const dev = getDeviceDetails();
    await supabase.rpc('register_active_session', {
      p_user_id: user.user_id,
      p_session_token: token,
      p_device_name: dev.name,
      p_device_type: dev.type
    });
  } catch (err) {
    // Non-blocking background registration
  }
}
