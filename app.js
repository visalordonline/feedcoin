// Landing Page Logic, Session Check & Dynamic Button States
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

  // Check if User is Already Logged In
  const isLoggedIn = localStorage.getItem('is_logged_in') === 'true';

  // Update Header and Hero Buttons if Logged In
  if (isLoggedIn) {
    if (openLoginBtn) {
      openLoginBtn.textContent = 'Dashboard';
      openLoginBtn.classList.replace('btn-ghost', 'btn-primary');
      openLoginBtn.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
      });
    }

    if (openRegisterBtn) {
      openRegisterBtn.style.display = 'none'; // Hide redundant button
    }

    if (heroStartBtn) {
      heroStartBtn.textContent = 'Go to Dashboard';
      heroStartBtn.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
      });
    }
  } else {
    // Standard Modal Triggers for Guests
    openLoginBtn?.addEventListener('click', () => openModal('login'));
    openRegisterBtn?.addEventListener('click', () => openModal('register'));
    heroStartBtn?.addEventListener('click', () => openModal('register'));
  }

  // Theme Toggle
  themeToggle?.addEventListener('click', () => {
    document.documentElement.classList.toggle('light');
    themeToggle.textContent = document.documentElement.classList.contains('light') ? '☀️' : '🌙';
  });

  // Modal Open & Close Functions
  const openModal = (tab = 'login') => {
    authModal.classList.remove('hidden');
    switchTab(tab);
  };
  
  const closeModal = () => authModal.classList.add('hidden');
  closeModalBtn?.addEventListener('click', closeModal);

  function switchTab(tab) {
    if (tab === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      registerForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
    }
  }

  tabLogin?.addEventListener('click', () => switchTab('login'));
  tabRegister?.addEventListener('click', () => switchTab('register'));

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // Handle Account Registration
  registerForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fullName = document.getElementById('regFullName').value || 'Alex Rivers';
    const username = document.getElementById('regUsername').value || 'alexCoinr';

    // Set Session State
    localStorage.setItem('is_logged_in', 'true');
    localStorage.setItem('user_name', fullName);
    localStorage.setItem('user_username', '@' + username);

    showToast('Account created! Redirecting to Dashboard...');
    
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1000);
  });

  // Handle Account Login
  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    // Set Session State
    localStorage.setItem('is_logged_in', 'true');
    
    showToast('Login successful! Redirecting...');
    
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1000);
  });
});