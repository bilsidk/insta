import InAppBrowser from 'react-native-inappbrowser-reborn';
import { Linking } from 'react-native';
import Config from 'react-native-config';
import { getDeviceId } from './api';

// The backend's /auth/done page bounces the Custom Tab back into the app on
// this scheme (registered in AndroidManifest) — an https redirectUrl can never
// re-enter the app without verified App Links.
const APP_RETURN_URL = 'com.instagrowth://auth';

function generateState() {
  // 3 segments of base-36 ≈ 33 chars, well above the 16-char minimum the server enforces
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

function buildAuthUrl(state) {
  return (
    `https://www.instagram.com/oauth/authorize` +
    `?client_id=${Config.INSTAGRAM_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(Config.API_URL + '/auth/instagram/callback')}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('instagram_business_basic,instagram_business_manage_comments')}` +
    `&force_authentication=1` +
    `&state=${state}`
  );
}

async function _pollForToken(sessionId) {
  const deviceId = await getDeviceId();
  const url = `${Config.API_URL}/auth/instagram/status` +
    `?session_id=${encodeURIComponent(sessionId)}` +
    (deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : '');
  const resp = await fetch(url);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Sign-in failed');
  return data.token || null;
}

export async function initiateInstagramAuth() {
  const state = generateState();
  const authUrl = buildAuthUrl(state);

  console.log('[Auth] authUrl:', authUrl);

  try {
    const available = await InAppBrowser.isAvailable();
    console.log('[Auth] InAppBrowser available:', available);

    if (available) {
      const result = await InAppBrowser.openAuth(authUrl, APP_RETURN_URL, {
        // Android
        showTitle: false,
        enableUrlBarHiding: true,
        enableDefaultShare: false,
        forceCloseOnRedirection: true,
        // iOS — private session, no shared Safari cookies
        ephemeralWebSession: true,
      });

      if (result.type === 'success' && result.url) {
        const qs = result.url.split('?')[1]?.split('#')[0] || '';
        const params = new URLSearchParams(qs);

        const error = params.get('error');
        if (error) throw new Error(decodeURIComponent(error));

        // Token is stored server-side keyed by state/sid; fetch it now
        const sid = params.get('sid') || state;
        return await _pollForToken(sid);
      }
      return null;
    } else {
      return await _fallbackDeepLink(authUrl, state);
    }
  } catch (err) {
    if (err.message === 'cancelled') return null;
    throw err;
  }
}

async function _fallbackDeepLink(authUrl, state) {
  return new Promise((resolve, reject) => {
    const sub = Linking.addEventListener('url', async ({ url }) => {
      if (!url?.startsWith(APP_RETURN_URL)) return;
      sub.remove();
      const qs = url.split('?')[1]?.split('#')[0] || '';
      const params = new URLSearchParams(qs);
      const sid = params.get('sid') || state;
      try {
        resolve(await _pollForToken(sid));
      } catch (e) { reject(e); }
    });
    Linking.openURL(authUrl);
    setTimeout(() => { sub.remove(); resolve(null); }, 5 * 60 * 1000);
  });
}

export default { initiateInstagramAuth };
