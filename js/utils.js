/**
 * vAccess — utils.js
 * Utility functions used across the application.
 * Keeps common helpers in one place for easy maintenance.
 */

// ============================================================
// DATE & TIME UTILITIES
// ============================================================

/** Format a date string (YYYY-MM-DD) to a human-readable form */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Format a datetime string to readable form */
function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Format a time string (HH:MM) to 12-hour format */
function formatTime(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Get time elapsed from now (e.g. "2 days ago") */
function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)  return `${days}d ago`;
  return formatDate(isoStr.split('T')[0]);
}

/** Get today's date string as YYYY-MM-DD */
function today() {
  return new Date().toISOString().split('T')[0];
}

/** Get YYYY-MM-DD string from a Date object */
function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

// ============================================================
// ID GENERATION
// ============================================================

/** Generate a next booking ID like B011 */
function generateBookingId() {
  const bookings = getBookings();
  const nums = bookings.map(b => parseInt(b.B_ID.replace('B', ''), 10)).filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return 'B' + String(max + 1).padStart(3, '0');
}

/** Generate a next timeslot ID */
function generateSlotId() {
  const slots = getTimeslots();
  const nums = slots.map(s => parseInt(s.Slot_ID.replace('TS', ''), 10)).filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return 'TS' + String(max + 1).padStart(3, '0');
}

/** Generate a next approval ID */
function generateApprovalId() {
  const approvals = getApprovals();
  const nums = approvals.map(a => parseInt(a.Ap_ID.replace('AP', ''), 10)).filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return 'AP' + String(max + 1).padStart(3, '0');
}

/** Generate a notification ID */
function generateNotifId() {
  const notifs = getNotifications();
  const nums = notifs.map(n => parseInt(n.id.replace('N', ''), 10)).filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return 'N' + String(max + 1).padStart(3, '0');
}

// ============================================================
// BADGE / STATUS HTML HELPERS
// ============================================================

/** Returns an HTML badge string for a booking status */
function statusBadge(status) {
  const map = {
    'Pending':   '<span class="badge badge-pending badge-dot">Pending</span>',
    'Approved':  '<span class="badge badge-approved badge-dot">Approved</span>',
    'Rejected':  '<span class="badge badge-rejected badge-dot">Rejected</span>',
    'Cancelled': '<span class="badge badge-cancelled badge-dot">Cancelled</span>',
  };
  return map[status] || `<span class="badge">${status}</span>`;
}

/** Returns an HTML badge for venue status */
function venueStatusBadge(status) {
  const map = {
    'Available':   '<span class="badge badge-available">Available</span>',
    'Booked':      '<span class="badge badge-booked">Booked</span>',
    'Maintenance': '<span class="badge badge-cancelled">Maintenance</span>',
  };
  return map[status] || `<span class="badge">${status}</span>`;
}

// ============================================================
// DOM HELPERS
// ============================================================

/** Get element by ID */
function el(id) { return document.getElementById(id); }

/** Set innerHTML safely */
function setHTML(id, html) {
  const element = el(id);
  if (element) element.innerHTML = html;
}

/** Show/hide an element */
function showEl(id) { const e = el(id); if (e) e.classList.remove('hidden'); }
function hideEl(id) { const e = el(id); if (e) e.classList.add('hidden'); }

/** Toggle an element */
function toggleEl(id) { const e = el(id); if (e) e.classList.toggle('hidden'); }

/** Create an element with classes and optionally innerHTML */
function createElement(tag, classes, html) {
  const e = document.createElement(tag);
  if (classes) e.className = classes;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** Sanitize string for safe insertion into HTML */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, function (char) {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[char];
  });
}
window.escapeHtml = escapeHtml;

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(message, type = 'info', duration = 3500) {
  const container = document.querySelector('.toast-container') || createToastContainer();
  const icons = { info: '🔔', success: '✅', error: '❌', warning: '⚠️' };
  const toast = createElement('div', `toast toast-${type}`);
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.closest('.toast').remove()" aria-label="Close">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function createToastContainer() {
  const c = createElement('div', 'toast-container');
  document.body.appendChild(c);
  return c;
}

const toast = {
  info: (msg, dur) => showToast(msg, 'info', dur),
  success: (msg, dur) => showToast(msg, 'success', dur),
  error: (msg, dur) => showToast(msg, 'error', dur),
  warning: (msg, dur) => showToast(msg, 'warning', dur)
};
window.toast = toast;

// ============================================================
// MODAL HELPERS
// ============================================================

function openModal(id) {
  const overlay = el(id);
  if (overlay) {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const overlay = el(id);
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/** Close modal when clicking overlay background */
function initModalClose() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) closeModal(this.id);
    });
  });
  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', function() {
      const modal = this.closest('.modal-overlay');
      if (modal) closeModal(modal.id);
    });
  });
}

// ============================================================
// CONFIRM DIALOG
// ============================================================

function showConfirm({ title, message, icon = '⚠️', confirmText = 'Confirm', confirmClass = 'btn-danger', onConfirm }) {
  let overlay = el('confirm-dialog-overlay');
  if (!overlay) {
    overlay = createElement('div', 'modal-overlay confirm-dialog');
    overlay.id = 'confirm-dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-body">
          <div class="confirm-icon" id="confirm-icon">⚠️</div>
          <div class="confirm-title" id="confirm-title">Are you sure?</div>
          <div class="confirm-message" id="confirm-message"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-modal-close>Cancel</button>
          <button class="btn btn-danger" id="confirm-ok-btn">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    initModalClose();
  }

  const iconEl = el('confirm-icon');
  if (iconEl) iconEl.textContent = icon;
  const titleEl = el('confirm-title');
  if (titleEl) titleEl.textContent = title;
  const msgEl = el('confirm-message');
  if (msgEl) msgEl.textContent = message;

  const confirmBtn = el('confirm-ok-btn');
  if (confirmBtn) {
    confirmBtn.textContent = confirmText;
    confirmBtn.className = `btn ${confirmClass}`;
    confirmBtn.onclick = () => {
      closeModal('confirm-dialog-overlay');
      if (typeof onConfirm === 'function') onConfirm();
    };
  } else {
    if (window.confirm(message) && typeof onConfirm === 'function') onConfirm();
    return;
  }

  openModal('confirm-dialog-overlay');
}

// ============================================================
// SEARCH / FILTER HELPERS
// ============================================================

/** Simple text search across object values */
function matchesSearch(obj, searchTerm) {
  if (!searchTerm) return true;
  const term = searchTerm.toLowerCase();
  return Object.values(obj).some(v => v && String(v).toLowerCase().includes(term));
}

/** Debounce a function for search inputs */
function debounce(fn, delay = 300) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ============================================================
// URL PARAMS
// ============================================================

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
const getUrlParam = getParam;

// ============================================================
// AVATAR HELPERS
// ============================================================

/** Get initials from a full name */
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
}

// ============================================================
// SIDEBAR TOGGLE (Shared across dashboard pages)
// ============================================================

function initSidebar() {
  const toggle  = document.querySelector('.topbar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay && overlay.classList.toggle('open');
    document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
  });

  overlay && overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  });
}

/** Mark the current page as active in the sidebar */
function markActiveSidebarLink() {
  const path = window.location.pathname.split('/').pop();
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    const href = a.getAttribute('href') || '';
    const hpath = href.split('/').pop();
    if (hpath === path || (path === '' && hpath === 'index.html')) {
      a.classList.add('active');
    }
  });
}

// ============================================================
// VENUE ICON HELPER
// ============================================================
function getVenueIcon(vType) {
  const icons = {
    'Auditorium':     '🎭',
    'Seminar Hall':   '🎓',
    'Conference Room':'💼',
    'Sports Ground':  '⚽',
    'Laboratory':     '🔬',
    'Cafeteria':      '☕',
    'Open Ground':    '🌳',
  };
  return icons[vType] || '🏛️';
}
