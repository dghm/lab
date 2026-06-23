async function getCurrentUser() {
  const res = await fetch('/api/auth/me');
  return res.json();
}

async function requireLogin() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  return user;
}

const ROLE_LABELS = {
  owner: '業主',
  venue_admin: '場主',
  coach: '教練',
  member: '會員',
};

function renderNav(user, activePage) {
  const nav = document.getElementById('nav');
  if (!nav) return;

  const links = [];
  if (user.role !== 'owner') {
    links.push({ href: 'index.html', label: '預約' });
    links.push({ href: 'my-bookings.html', label: '我的預約' });
  }
  if (user.role === 'venue_admin' || user.role === 'owner') {
    links.push({ href: 'venue-admin.html', label: '場館管理' });
  }
  if (user.role === 'owner') {
    links.push({ href: 'owner.html', label: '業主後台' });
  }

  nav.innerHTML =
    links
      .map(
        (l) =>
          `<a href="${l.href}" class="${l.href === activePage ? 'active' : ''}">${l.label}</a>`
      )
      .join('') +
    `<span class="nav-user">${user.name}（${ROLE_LABELS[user.role] || user.role}）</span><button id="logout-btn">登出</button>`;

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });
}
