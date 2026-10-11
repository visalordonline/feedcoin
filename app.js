// Landing Page Logic & Session Control
document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  const authModal = document.getElementById('authModal');
  const openLoginBtn = document.getElementById('openLoginBtn');
  const openRegisterBtn = document.getElementById('openRegisterBtn');
  const heroStartBtn = document.getElementById('heroStartBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const toast = document.getElementById('toast');
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const navLinks = document.getElementById('navLinks');

  // Mobile menu toggle
  hamburgerBtn?.addEventListener('click', () => {
    navLinks?.classList.toggle('open');
  });

  const isLoggedIn = localStorage.getItem('is_logged_in') === 'true';

  if (isLoggedIn) {
    if (openLoginBtn) {
      openLoginBtn.textContent = 'Dashboard';
      openLoginBtn.classList.replace('btn-ghost', 'btn-primary');
      openLoginBtn.onclick = () => { window.location.href = 'dashboard.html'; };
    }
    if (openRegisterBtn) openRegisterBtn.style.display = 'none';
    if (heroStartBtn) {
      heroStartBtn.textContent = 'Go to Dashboard';
      heroStartBtn.onclick = () => { window.location.href = 'dashboard.html'; };
    }
  } else {
    openLoginBtn?.addEventListener('click', () => openModal('login'));
    openRegisterBtn?.addEventListener('click', () => openModal('register'));
    heroStartBtn?.addEventListener('click', () => openModal('register'));
  }

  // Dark/Light Theme Toggle
  themeToggle?.addEventListener('click', () => {
    document.documentElement.classList.toggle('light');
    themeToggle.textContent = document.documentElement.classList.contains('light') ? '☀️' : '🌙';
  });

  const openModal = (tab = 'login') => {
    authModal?.classList.remove('hidden');
    switchTab(tab);
  };
  
  const closeModal = () => authModal?.classList.add('hidden');
  closeModalBtn?.addEventListener('click', closeModal);

  function switchTab(tab) {
    if (tab === 'login') {
      tabLogin?.classList.add('active');
      tabRegister?.classList.remove('active');
      loginForm?.classList.remove('hidden');
      registerForm?.classList.add('hidden');
    } else {
      tabRegister?.classList.add('active');
      tabLogin?.classList.remove('active');
      registerForm?.classList.remove('hidden');
      loginForm?.classList.add('hidden');
    }
  }

  tabLogin?.addEventListener('click', () => switchTab('login'));
  tabRegister?.addEventListener('click', () => switchTab('register'));

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // Handle Step 1 Registration
  registerForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fullName = document.getElementById('regFullName').value.trim() || 'Alex Rivers';
    localStorage.setItem('is_logged_in', 'true');
    localStorage.setItem('user_name', fullName);

    showToast('Account created! Loading your investment hub...');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
  });

  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    localStorage.setItem('is_logged_in', 'true');
    showToast('Login successful! Redirecting...');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
  });
});