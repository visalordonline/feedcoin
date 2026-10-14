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

  // Capture Referral code if visitor arrives via https://feedcoin.online/?ref=USERNAME
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref') || urlParams.get('referrer');
  if (refCode) {
    localStorage.setItem('referred_by', refCode.trim().toLowerCase());
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

  // Handle Registration: Save all user inputs and referrer
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('regFullName')?.value.trim() || 'FeedCoin User';
    const username = document.getElementById('regUsername')?.value.trim().toLowerCase() || 'member';
    const email = document.getElementById('regEmail')?.value.trim() || 'user@feedcoin.online';
    const phone = document.getElementById('regPhone')?.value.trim() || 'Not provided';
    const password = document.getElementById('regPassword')?.value;

    const referredBy = (localStorage.getItem('referred_by') || '').trim().toLowerCase();

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', credential.user.uid), {
        profile: { fullName, username, email, phone },
        balances: { capital: 0, bonus: 0, task: 0, yieldTotal: 0 },
        lastMinedAt: 0,
        transactionHistory: [],
        referredBy: referredBy || null,
        createdAt: Date.now()
      });

      // Public referral record: lets the referrer see this member + amount invested
      // without exposing the member's private user document.
      if (referredBy) {
        try {
          await setDoc(doc(db, 'referrals', credential.user.uid), {
            referredBy,
            memberUid: credential.user.uid,
            fullName,
            username,
            invested: 0,
            createdAt: Date.now()
          });
        } catch (refErr) {
          console.warn('Could not save referral record:', refErr);
        }
      }

      localStorage.removeItem('referred_by');

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

// Local Cache Policy Popup Controller
document.addEventListener('DOMContentLoaded', () => {
  const policyModal = document.getElementById('policyNoticeModal');
  const closeBtn = document.getElementById('closePolicyNotice');
  const acceptBtn = document.getElementById('acceptPolicyBtn');

  const CACHE_KEY = 'feedcoin_policy_ack';
  const EXPIRY_DAYS = 7;

  function shouldShowPolicyPopup() {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (!cachedData) return true;

    try {
      const parsed = JSON.parse(cachedData);
      const now = new Date().getTime();
      if (now - parsed.timestamp > EXPIRY_DAYS * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(CACHE_KEY);
        return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  }

  function markPolicyAccepted() {
    const payload = {
      accepted: true,
      timestamp: new Date().getTime()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    policyModal?.classList.add('hidden');
  }

  if (shouldShowPolicyPopup()) {
    setTimeout(() => {
      policyModal?.classList.remove('hidden');
    }, 1500);
  }

  closeBtn?.addEventListener('click', () => {
    policyModal?.classList.add('hidden');
  });

  acceptBtn?.addEventListener('click', markPolicyAccepted);
});