import InAppBrowser from 'react-native-inappbrowser-reborn';
import { Linking } from 'react-native';
import Config from 'react-native-config';

const DONE_URL = `${Config.API_URL}/auth/done`;

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
    `https://api.instagram.com/oauth/authorize` +
    `?force_reauth=true` +
    `&client_id=${Config.INSTAGRAM_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(Config.API_URL + '/auth/instagram/callback')}` +
    `&response_type=code` +
    `&scope=instagram_business_basic` +
    `&state=${state}`
  );
}

async function _pollForToken(sessionId) {
  const url = `${Config.API_URL}/auth/instagram/status?session_id=${encodeURIComponent(sessionId)}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.token || null;
}

export async function initiateInstagramAuth() {
  const state = generateState();
  const authUrl = buildAuthUrl(state);

  try {
    const available = await InAppBrowser.isAvailable();

    if (available) {
      const result = await InAppBrowser.openAuth(authUrl, DONE_URL, {
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

        if (params.get('error')) return null;

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
  return new Promise((resolve) => {
    const sub = Linking.addEventListener('url', async ({ url }) => {
      if (!url?.startsWith(DONE_URL)) return;
      sub.remove();
      const qs = url.split('?')[1]?.split('#')[0] || '';
      const params = new URLSearchParams(qs);
      const sid = params.get('sid') || state;
      resolve(await _pollForToken(sid));
    });
    Linking.openURL(authUrl);
    setTimeout(() => { sub.remove(); resolve(null); }, 5 * 60 * 1000);
  });
}

export default { initiateInstagramAuth };
