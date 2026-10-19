/**
 * vAccess — app.js
 * Main application bootstrap.
 * Initializes shared UI components on every page.
 */

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initSidebarLogout();
  markActiveSidebarLink();
  initModalClose();
  updateNotifBadge();
  updateSidebarUser();
  updateTopbarUser();
});

/** Shared sidebar logout initialization */
function initSidebarLogout() {
  const logoutBtn = document.getElementById('sidebar-logout');
  if (!logoutBtn || logoutBtn.dataset.boundLogout) return;
  logoutBtn.dataset.boundLogout = 'true';

  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof showConfirm === 'function') {
      showConfirm({
        title: 'Log Out',
        message: 'Are you sure you want to log out of vAccess?',
        icon: '🚪',
        confirmText: 'Log Out',
        confirmClass: 'btn-primary',
        onConfirm: () => {
          if (typeof logout === 'function') {
            logout();
          } else {
            window.location.href = '../index.html';
          }
        }
      });
    } else {
      if (window.confirm('Are you sure you want to log out?')) {
        if (typeof logout === 'function') {
          logout();
        } else {
          window.location.href = '../index.html';
        }
      }
    }
  });
}

/** Populate sidebar user info from session */
function updateSidebarUser() {
  const session = getSession();
  if (!session || !session.name) return;
  const nameEl   = document.querySelector('.sidebar-user-name');
  const roleEl   = document.querySelector('.sidebar-user-role');
  const avatarEl = document.querySelector('.sidebar-user-avatar');
  if (nameEl)   nameEl.textContent   = session.name;
  if (roleEl && session.role) roleEl.textContent = session.role.charAt(0).toUpperCase() + session.role.slice(1);
  if (avatarEl) avatarEl.textContent = getInitials(session.name);
}

/** Populate topbar user info if present */
function updateTopbarUser() {
  const session = getSession();
  if (!session || !session.name) return;
  const topbarName = document.querySelector('.topbar-user-name');
  if (topbarName) topbarName.textContent = session.name;
}
