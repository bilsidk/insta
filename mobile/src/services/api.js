import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'http://localhost:4000';

async function request(path, options = {}) {
  const token = await AsyncStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
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
  signIn: (code) => request('/auth/instagram', { method: 'POST', body: JSON.stringify({ code }) }),
  getMe: () => request('/users/me'),
  deleteAccount: () => request('/users/me', { method: 'DELETE' }),
  getMyPosts: () => request('/accounts/posts'),
  disconnectInstagram: () => request('/accounts/disconnect', { method: 'POST' }),
  getTasks: (type) => request(`/tasks${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  getMyTasks: () => request('/tasks/my'),
  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  verifyTask: (taskId) => request(`/tasks/${taskId}/verify`, { method: 'POST' }),
  pauseCampaign: (id) => request(`/tasks/${id}/pause`, { method: 'PATCH' }),
  resumeCampaign: (id) => request(`/tasks/${id}/resume`, { method: 'PATCH' }),
  cancelCampaign: (id) => request(`/tasks/${id}/cancel`, { method: 'PATCH' }),
  getTransactions: () => request('/transactions'),
  getAdminStatus: () => request('/admin/status'),
  updateAdminSettings: (data) => request('/admin/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  setAdminMode: (mode, reason) => request('/admin/mode', { method: 'POST', body: JSON.stringify({ mode, reason }) }),
  promoteUser: (userId, role) => request('/admin/promote', { method: 'POST', body: JSON.stringify({ userId, role }) }),
};

export default api;
