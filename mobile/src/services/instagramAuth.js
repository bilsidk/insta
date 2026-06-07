import { Platform } from 'react-native';

const INSTA_AUTH_CONFIG = {
  clientId: process.env.INSTAGRAM_APP_ID || '',
  clientSecret: process.env.INSTAGRAM_APP_SECRET || '',
  redirectUrl: 'com.instagrowth://oauthredirect',
  scopes: ['instagram_business_basic', 'instagram_business_manage_messages', 'instagram_business_content_publish'],
  additionalParameters: {},
  serviceConfiguration: {
    authorizationEndpoint: 'https://www.facebook.com/v22.0/dialog/oauth',
    tokenEndpoint: 'https://graph.facebook.com/v22.0/oauth/access_token',
  },
};

export async function initiateInstagramAuth(authorize) {
  try {
    const result = await authorize(INSTA_AUTH_CONFIG);
    return result.accessToken || result.authorizationCode;
  } catch (err) {
    if (err.message?.includes('User cancelled')) return null;
    throw err;
  }
}

export default { initiateInstagramAuth, INSTA_AUTH_CONFIG };
