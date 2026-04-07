/* ═══════════════════════════════════════════════════
   ExamPro - Auth Helpers
   ═══════════════════════════════════════════════════ */

const Auth = {
  save(token, user) {
    localStorage.setItem('ep_token', token);
    localStorage.setItem('ep_user', JSON.stringify(user));
  },

  getToken() { return localStorage.getItem('ep_token'); },

  getUser() {
    try { return JSON.parse(localStorage.getItem('ep_user')); }
    catch { return null; }
  },

  logout() {
    localStorage.removeItem('ep_token');
    localStorage.removeItem('ep_user');
    window.location.href = '/login.html';
  },

  requireAuth(allowedRoles = []) {
    const token = this.getToken();
    const user  = this.getUser();
    if (!token || !user) {
      window.location.href = '/login.html';
      return null;
    }
    if (allowedRoles.length && !allowedRoles.includes(user.role)) {
      window.location.href = '/login.html';
      return null;
    }
    return user;
  },

  redirectByRole(role) {
    const map = { admin: '/admin/dashboard.html', teacher: '/teacher/dashboard.html', student: '/student/dashboard.html' };
    window.location.href = map[role] || '/login.html';
  },
};

window.Auth = Auth;

/* ─── Toast notifications ─────────────────────────── */
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
window.showToast = showToast;

/* ─── Sidebar helpers ────────────────────────────── */
function initSidebar() {
  const user = Auth.getUser();
  if (!user) return;

  const nameEl = document.getElementById('sidebar-user-name');
  const roleEl = document.getElementById('sidebar-user-role');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role;
  if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());

  // Mark active nav
  document.querySelectorAll('.nav-item').forEach((item) => {
    if (item.href && item.href.includes(window.location.pathname.split('/').pop())) {
      item.classList.add('active');
    }
  });
}
window.initSidebar = initSidebar;

/* ─── Modal helpers ─────────────────────────────── */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
  if (e.target.classList.contains('modal-close')) {
    e.target.closest('.modal-overlay')?.classList.remove('open');
  }
});
window.openModal = openModal;
window.closeModal = closeModal;

/* ─── Tab helpers ───────────────────────────────── */
function initTabs(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  container.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === target);
      });
    });
  });
}
window.initTabs = initTabs;

/* ─── Date/Time Helpers ─────────────────────────── */
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.formatDuration = formatDuration;

/* ─── Status Badge Helper ───────────────────────── */
function statusBadge(status) {
  const map = {
    draft:     'badge-gray',
    scheduled: 'badge-info',
    active:    'badge-success',
    completed: 'badge-warning',
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status}</span>`;
}
window.statusBadge = statusBadge;
