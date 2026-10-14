import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

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

  // Capture Referral code if visitor arrives via www.feedcoin.online/?ref=USERNAME
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref') || urlParams.get('referrer');
  if (refCode) {
    localStorage.setItem('referred_by', refCode.trim());
  }

  // Mobile menu toggle
  hamburgerBtn?.addEventListener('click', () => {
    navLinks?.classList.toggle('open');
  });

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
  openLoginBtn?.addEventListener('click', () => {
    if (auth.currentUser) window.location.href = 'dashboard.html';
    else openModal('login');
  });
  openRegisterBtn?.addEventListener('click', () => openModal('register'));
  heroStartBtn?.addEventListener('click', () => {
    if (auth.currentUser) window.location.href = 'dashboard.html';
    else openModal('register');
  });

  onAuthStateChanged(auth, (user) => {
    if (openLoginBtn) {
      openLoginBtn.textContent = user ? 'Dashboard' : 'Login';
      openLoginBtn.classList.toggle('btn-primary', Boolean(user));
      openLoginBtn.classList.toggle('btn-ghost', !user);
    }
    if (openRegisterBtn) openRegisterBtn.style.display = user ? 'none' : '';
    if (heroStartBtn) heroStartBtn.textContent = user ? 'Go to Dashboard' : 'Get Started';
  });

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // Handle Registration: Save all user inputs
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('regFullName')?.value.trim() || 'FeedCoin User';
    const username = document.getElementById('regUsername')?.value.trim() || 'member';
    const email = document.getElementById('regEmail')?.value.trim() || 'user@feedcoin.online';
    const phone = document.getElementById('regPhone')?.value.trim() || 'Not provided';
    const password = document.getElementById('regPassword')?.value;

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', credential.user.uid), {
        profile: { fullName, username, email, phone },
        balances: { capital: 0, bonus: 0, task: 0, yieldTotal: 0 },
        lastMinedAt: 0,
        transactionHistory: []
      });

      showToast('Account created! Loading your dashboard...');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
    } catch (error) {
      showToast(error.code === 'auth/email-already-in-use'
        ? 'An account already exists for this email. Please log in.'
        : error.code === 'auth/weak-password'
          ? 'Password must be at least 6 characters.'
          : 'Could not create your account. Please try again.');
    }
  });

  // Handle Login
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      showToast('Login successful! Redirecting...');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
    } catch (error) {
      showToast('Email or password is incorrect. Please try again.');
    }
  });
});