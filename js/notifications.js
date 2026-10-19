/**
 * vAccess — notifications.js
 * Notification data access layer.
 *
 * REPLACE localStorage calls with fetch() API calls when integrating backend.
 */

// ============================================================
// NOTIFICATIONS CRUD
// ============================================================

/**
 * Get all notifications.
 * REPLACE: return await fetch('/api/notifications').then(r => r.json())
 */
function getNotifications() {
  return JSON.parse(localStorage.getItem('va_notifications') || '[]');
}

/**
 * Get notifications for the current user.
 */
function getMyNotifications() {
  const session = getSession();
  if (!session) return [];
  const all = getNotifications();
  if (session.role === 'admin') return all;
  if (session.role === 'student') return all.filter(n => n.rno === session.id || (!n.rno && !n.fno));
  if (session.role === 'faculty') return all.filter(n => n.fno === session.id || (!n.rno && !n.fno));
  return all;
}

/** Count unread notifications for current user */
function getUnreadCount() {
  return getMyNotifications().filter(n => !(n.read || n.isRead)).length;
}

/**
 * Create a new notification.
 * REPLACE: await fetch('/api/notifications', { method: 'POST', body: JSON.stringify(data) })
 */
function createNotification({ type, message, B_ID = null, rno = null, fno = null }) {
  const notifications = getNotifications();
  const newNotif = {
    id:      generateNotifId(),
    type,
    message,
    time:    new Date().toISOString(),
    read:    false,
    isRead:  false,
    B_ID,
    rno,
    fno,
  };
  notifications.unshift(newNotif); // most recent first
  localStorage.setItem('va_notifications', JSON.stringify(notifications));
  updateNotifBadge();
  return newNotif;
}

/**
 * Mark a notification as read.
 * REPLACE: await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
 */
function markNotificationRead(id) {
  const notifications = getNotifications();
  const n = notifications.find(n => n.id === id);
  if (n) {
    n.read = true;
    n.isRead = true;
    localStorage.setItem('va_notifications', JSON.stringify(notifications));
    updateNotifBadge();
  }
}

/** Mark all notifications as read */
function markAllNotificationsRead() {
  const session = getSession();
  if (!session) return;
  const notifications = getNotifications();
  notifications.forEach(n => {
    if (session.role === 'student' && n.rno === session.id) {
      n.read = true;
      n.isRead = true;
    } else if (session.role === 'faculty' && n.fno === session.id) {
      n.read = true;
      n.isRead = true;
    } else if (session.role === 'admin') {
      n.read = true;
      n.isRead = true;
    }
  });
  localStorage.setItem('va_notifications', JSON.stringify(notifications));
  updateNotifBadge();
}

// ============================================================
// BADGE UPDATE
// ============================================================

/** Update the notification badge count in the topbar and sidebar */
function updateNotifBadge() {
  const count = getUnreadCount();
  const topbarBadges = document.querySelectorAll('.topbar-btn .badge-indicator, #notif-badge-indicator');
  const sidebarBadges = document.querySelectorAll('.nav-notif-badge');

  topbarBadges.forEach(badge => {
    badge.style.display = count > 0 ? 'block' : 'none';
  });

  sidebarBadges.forEach(sidebarBadge => {
    sidebarBadge.textContent = count > 0 ? count : '';
    sidebarBadge.style.display = count > 0 ? 'inline-flex' : 'none';
  });
}

// ============================================================
// RENDER HELPERS
// ============================================================

/** Render a list of notification items into a container element */
function renderNotifications(notifications, containerEl, onClickCb) {
  if (!containerEl) return;
  if (notifications.length === 0) {
    containerEl.innerHTML = `
      <div class="empty-state" style="padding: var(--space-12);">
        <div class="empty-state-icon">🔔</div>
        <h3>No notifications</h3>
        <p>You're all caught up! Notifications will appear here.</p>
      </div>`;
    return;
  }
  containerEl.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" data-bid="${n.B_ID || ''}">
      <div class="notif-icon ${n.type}">${getNotifIcon(n.type)}</div>
      <div class="notif-content">
        <div class="notif-message">${n.message}</div>
        <div class="notif-time">${timeAgo(n.time)}</div>
      </div>
      ${!n.read ? '<div class="notif-unread-dot"></div>' : ''}
    </div>
  `).join('');

  // Attach click handlers
  containerEl.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', () => {
      const id  = item.dataset.id;
      const bid = item.dataset.bid;
      markNotificationRead(id);
      item.classList.remove('unread');
      item.querySelector('.notif-unread-dot')?.remove();
      if (onClickCb) onClickCb(bid, id);
    });
  });
}

function getNotifIcon(type) {
  const icons = { info: '🔔', success: '✅', danger: '❌', warning: '⚠️' };
  return icons[type] || '🔔';
}
