/* ═══════════════════════════════════════════════════
   ExamPro - Shared API Client
   ═══════════════════════════════════════════════════ */

const API_BASE = '/api';

const api = {
  async request(method, path, data = null) {
    const token = localStorage.getItem('ep_token');
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (data) opts.body = JSON.stringify(data);

    try {
      const res = await fetch(`${API_BASE}${path}`, opts);
      const json = await res.json();
      if (!res.ok) {
        const msg = json.message || (json.errors && json.errors[0]?.msg) || 'Request failed';
        throw new Error(msg);
      }
      return json;
    } catch (err) {
      throw err;
    }
  },

  async upload(path, formData) {
    const token = localStorage.getItem('ep_token');
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Upload failed');
    return json;
  },

  get:    (path)        => api.request('GET',    path),
  post:   (path, data)  => api.request('POST',   path, data),
  put:    (path, data)  => api.request('PUT',    path, data),
  delete: (path)        => api.request('DELETE', path),
  patch:  (path, data)  => api.request('PATCH',  path, data),
};

window.api = api;
