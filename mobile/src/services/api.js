import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getDeviceId() {
  try {
    let id = await AsyncStorage.getItem('_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem('_device_id', id);
    }
    return id;
  } catch { return null; }
}


const BASE_URL = 'https://insta-production-91be.up.railway.app';

async function request(method, path, body) {
  const token = await AsyncStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = {}; }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    if (err.message === 'Network request failed') throw new Error('Network error - check your connection');
    throw err;
  }
}

export const api = {
  getMe: () => request('GET', '/users/me'),
  deleteAccount: () => request('DELETE', '/users/me'),

  getMyPosts: () => request('GET', '/accounts/posts'),
  disconnectInstagram: () => request('POST', '/accounts/disconnect'),

  getTasks: (type) => request('GET', `/tasks${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  getMyTasks: () => request('GET', '/tasks/my'),
  createTask: (data) => request('POST', '/tasks', data),
  getPricing: () => request('GET', '/tasks/pricing'),
  startTask: (taskId) => request('POST', `/tasks/${taskId}/start`),
  verifyTask: async (taskId, started_at) => {
    const device_id = await getDeviceId();
    return request('POST', `/tasks/${taskId}/verify`, { started_at, device_id });
  },
  pauseCampaign: (id) => request('PATCH', `/tasks/${id}/pause`),
  resumeCampaign: (id) => request('PATCH', `/tasks/${id}/resume`),
  cancelCampaign: (id) => request('PATCH', `/tasks/${id}/cancel`),

  getTransactions: (offset = 0) => request('GET', `/transactions?limit=50&offset=${offset}`),

  getAdminStatus: () => request('GET', '/admin/status'),
  updateAdminSettings: (data) => request('PATCH', '/admin/settings', data),
  setAdminMode: (mode, reason) => request('POST', '/admin/mode', { mode, reason }),
  promoteUser: (username, role) => request('POST', '/admin/promote', { username, role }),
  grantCoins: (username, amount) => request('POST', '/admin/grant-coins', { username, amount }),
  searchUsers: (username) => request('GET', `/admin/users?username=${encodeURIComponent(username)}`),
  banUser: (username, reason, unban = false) => request('POST', '/admin/ban', { username, reason, unban }),
};

export default api;