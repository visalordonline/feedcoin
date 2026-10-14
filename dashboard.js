import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  // Helper for namespaced storage keys
  const getStorageKey = (uid, key) => `fc_${uid}_${key}`;

  function formatNGN(n) {
    return '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // -------------------------------------------------------------
  // 1. FAST LOCAL HYDRATION (Prevents UI flickering on refresh)
  // -------------------------------------------------------------
  const lastActiveUid = localStorage.getItem('fc_last_uid');
  if (lastActiveUid) {
    hydrateCachedUI(lastActiveUid);
  }

  function hydrateCachedUI(uid) {
    try {
      const cap = parseFloat(localStorage.getItem(getStorageKey(uid, 'capital'))) || 0;
      const bon = parseFloat(localStorage.getItem(getStorageKey(uid, 'bonus'))) || 0;
      const tsk = parseFloat(localStorage.getItem(getStorageKey(uid, 'task_bal'))) || 0;
      const yld = parseFloat(localStorage.getItem(getStorageKey(uid, 'yield_total'))) || 0;
      const profile = JSON.parse(localStorage.getItem(getStorageKey(uid, 'profile')) || '{}');
      const bank = JSON.parse(localStorage.getItem(getStorageKey(uid, 'user_bank')) || 'null');
      const txHistory = JSON.parse(localStorage.getItem(getStorageKey(uid, 'tx_history')) || '[]');
      const kyc = JSON.parse(localStorage.getItem(getStorageKey(uid, 'kyc_data')) || 'null');

      renderBalancesFromValues(cap, bon, tsk, yld);
      if (profile && Object.keys(profile).length) renderProfileUI(profile, uid);
      if (bank) renderBankUI(bank);
      if (txHistory.length) renderTxHistoryFromList(txHistory);
      if (kyc) renderKycStatus(kyc);
    } catch (e) {
      console.warn('Cache hydration skipped:', e);
    }
  }

  // -------------------------------------------------------------
  // 2. AUTHENTICATION & REMOTE FIRESTORE SYNC
  // -------------------------------------------------------------
  (async () => {
    const user = await new Promise(resolve => onAuthStateChanged(auth, resolve));
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    const uid = user.uid;
    localStorage.setItem('fc_last_uid', uid);
    const userStorageKey = key => getStorageKey(uid, key);
    const userDocRef = doc(db, 'users', uid);

    // Initial pass hydration for current user
    hydrateCachedUI(uid);

    let accountSnapshot = await getDoc(userDocRef);
    if (!accountSnapshot.exists()) {
      // Safe write: merge ensures pre-existing fields like kycData are never overwritten
      await setDoc(userDocRef, {
        profile: {
          fullName: user.displayName || 'FeedCoin User',
          username: '',
          email: user.email || '',
          phone: ''
        },
        balances: { capital: 0, bonus: 0, task: 0, yieldTotal: 0 },
        lastMinedAt: 0,
        transactionHistory: []
      }, { merge: true });
      accountSnapshot = await getDoc(userDocRef);
    }

    const account = accountSnapshot.data() || {};
    applyAccountData(account);

    function applyAccountData(data) {
      if (!data) return;
      const balances = data.balances || {};

      localStorage.setItem(userStorageKey('capital'), String(balances.capital || 0));
      localStorage.setItem(userStorageKey('bonus'), String(balances.bonus || 0));
      localStorage.setItem(userStorageKey('task_bal'), String(balances.task || 0));
      localStorage.setItem(userStorageKey('yield_total'), String(balances.yieldTotal || 0));
      localStorage.setItem(userStorageKey('last_mined'), String(data.lastMinedAt || 0));
      localStorage.setItem(userStorageKey('tx_history'), JSON.stringify(data.transactionHistory || []));
      
      if (data.profile) {
        localStorage.setItem(userStorageKey('profile'), JSON.stringify(data.profile));
      }
      if (data.bankDetails) {
        localStorage.setItem(userStorageKey('user_bank'), JSON.stringify(data.bankDetails));
      }
      if (data.kycData) {
        localStorage.setItem(userStorageKey('kyc_data'), JSON.stringify(data.kycData));
      }

      renderBalances();
      renderProfileUI(data.profile || {}, uid, user);
      renderBankUI(data.bankDetails);
      renderTxHistory();
      renderKycStatus(data.kycData);
    }

    function saveUserField(field, value) {
      updateDoc(userDocRef, { [field]: value }).catch(() => {
        showToast('Could not save your account data. Check your connection.');
      });
    }

    // -------------------------------------------------------------
    // PROFILE DETAILS
    // -------------------------------------------------------------
    function renderProfileUI(prof, currentUid, authUser) {
      const name = prof.fullName || authUser?.displayName || 'FeedCoin User';
      const email = prof.email || authUser?.email || '';
      const uname = prof.username || '';
      const phone = prof.phone || '';
      const initial = name.charAt(0).toUpperCase();

      const headerAvatar = document.getElementById('headerAvatar');
      const headerUserName = document.getElementById('headerUserName');
      if (headerAvatar) headerAvatar.textContent = initial;
      if (headerUserName) headerUserName.textContent = name;

      const profileAvatar = document.getElementById('profileAvatar');
      const profileName = document.getElementById('profileName');
      const profileEmail = document.getElementById('profileEmail');
      if (profileAvatar) profileAvatar.textContent = initial;
      if (profileName) profileName.textContent = name;
      if (profileEmail) profileEmail.textContent = email;

      const displayFullName = document.getElementById('displayFullName');
      const displayUsername = document.getElementById('displayUsername');
      const displayEmail = document.getElementById('displayEmail');
      const displayPhone = document.getElementById('displayPhone');
      if (displayFullName) displayFullName.textContent = name;
      if (displayUsername) displayUsername.textContent = uname ? '@' + uname : '-';
      if (displayEmail) displayEmail.textContent = email;
      if (displayPhone) displayPhone.textContent = phone || '-';

      const refCodeInput = document.getElementById('refCodeInput');
      if (refCodeInput) {
        refCodeInput.value = `https://www.feedcoin.online/index.html?ref=${encodeURIComponent(uname || currentUid)}`;
      }
    }

    // -------------------------------------------------------------
    // BALANCES
    // -------------------------------------------------------------
    function getCapital() { return parseFloat(localStorage.getItem(userStorageKey('capital'))) || 0; }
    function getBonus() { return parseFloat(localStorage.getItem(userStorageKey('bonus'))) || 0; }
    function getTaskBal() { return parseFloat(localStorage.getItem(userStorageKey('task_bal'))) || 0; }
    function getYieldTotal() { return parseFloat(localStorage.getItem(userStorageKey('yield_total'))) || 0; }

    function setCapital(v) {
      const value = Math.max(0, v);
      localStorage.setItem(userStorageKey('capital'), value.toFixed(2));
      saveUserField('balances.capital', value);
    }
    function setBonus(v) {
      const value = Math.max(0, v);
      localStorage.setItem(userStorageKey('bonus'), value.toFixed(2));
      saveUserField('balances.bonus', value);
    }
    function setTaskBal(v) {
      const value = Math.max(0, v);
      localStorage.setItem(userStorageKey('task_bal'), value.toFixed(2));
      saveUserField('balances.task', value);
    }
    function setYieldTotal(v) {
      const value = Math.max(0, v);
      localStorage.setItem(userStorageKey('yield_total'), value.toFixed(2));
      saveUserField('balances.yieldTotal', value);
    }

    function renderBalances() {
      renderBalancesFromValues(getCapital(), getBonus(), getTaskBal(), getYieldTotal());
    }

    // -------------------------------------------------------------
    // BANK DETAILS & MODALS
    // -------------------------------------------------------------
    const editBankBtn = document.getElementById('editBankBtn');
    const bankModal = document.getElementById('bankModal');
    const closeBankModal = document.getElementById('closeBankModal');
    const bankForm = document.getElementById('bankForm');

    function getSavedBank() {
      const raw = localStorage.getItem(userStorageKey('user_bank'));
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }

    editBankBtn?.addEventListener('click', () => {
      const b = getSavedBank();
      if (b) {
        document.getElementById('bankNameInput').value = b.bankName || '';
        document.getElementById('accountNumberInput').value = b.accountNumber || '';
        document.getElementById('accountHolderInput').value = b.accountHolder || '';
      }
      bankModal?.classList.remove('hidden');
    });

    closeBankModal?.addEventListener('click', () => bankModal?.classList.add('hidden'));

    bankForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const bankName = document.getElementById('bankNameInput').value.trim();
      const accountNumber = document.getElementById('accountNumberInput').value.trim();
      const accountHolder = document.getElementById('accountHolderInput').value.trim();

      if (accountNumber.length !== 10 || isNaN(accountNumber)) {
        showToast('Account number must be 10 digits.');
        return;
      }

      const bankDetails = { bankName, accountNumber, accountHolder };
      localStorage.setItem(userStorageKey('user_bank'), JSON.stringify(bankDetails));
      saveUserField('bankDetails', bankDetails);
      bankModal?.classList.add('hidden');
      renderBankUI(bankDetails);
      showToast('Bank details saved successfully.');
    });

    // -------------------------------------------------------------
    // WITHDRAWALS
    // -------------------------------------------------------------
    const withdrawAmountModal = document.getElementById('withdrawAmountModal');
    const closeWithdrawModal = document.getElementById('closeWithdrawModal');
    const withdrawAmountForm = document.getElementById('withdrawAmountForm');
    const modalAvailableBal = document.getElementById('modalAvailableBal');
    const withdrawToLine = document.getElementById('withdrawToLine');
    const withdrawAmountInput = document.getElementById('withdrawAmountInput');
    let currentWithdrawType = null;

    function promptWithdraw(type) {
      const bank = getSavedBank();
      if (!bank) {
        showToast('Please add bank details first.');
        bankModal?.classList.remove('hidden');
        return;
      }

      currentWithdrawType = type;
      const avail = (type === 'bonus') ? getBonus() : getTaskBal();

      if (type === 'task' && avail < 2000) {
        showToast('Minimum task reward withdrawal is ₦2,000.00');
        return;
      }
      if (avail <= 0) {
        showToast('Insufficient balance to withdraw.');
        return;
      }

      modalAvailableBal.value = formatNGN(avail);
      withdrawToLine.value = `${bank.bankName} - ${bank.accountNumber} (${bank.accountHolder})`;
      withdrawAmountInput.value = avail;
      withdrawAmountInput.max = avail;
      withdrawAmountModal?.classList.remove('hidden');
    }

    document.getElementById('withdrawBonusBtn')?.addEventListener('click', () => promptWithdraw('bonus'));
    document.getElementById('withdrawTaskBtn')?.addEventListener('click', () => promptWithdraw('task'));
    closeWithdrawModal?.addEventListener('click', () => withdrawAmountModal?.classList.add('hidden'));

    withdrawAmountForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseFloat(withdrawAmountInput.value) || 0;
      const avail = (currentWithdrawType === 'bonus') ? getBonus() : getTaskBal();

      if (amount <= 0 || amount > avail) {
        showToast('Invalid withdrawal amount.');
        return;
      }

      if (currentWithdrawType === 'bonus') {
        setBonus(avail - amount);
      } else {
        setTaskBal(avail - amount);
      }

      recordHistory('Withdrawal Pending', amount, 'withdraw');
      withdrawAmountModal?.classList.add('hidden');
      renderBalances();
      showToast('Withdrawal submitted for admin review!');
    });

    // Withdraw All
    const withdrawAllModal = document.getElementById('withdrawAllModal');
    const closeWithdrawAllModal = document.getElementById('closeWithdrawAllModal');
    const cancelWithdrawAll = document.getElementById('cancelWithdrawAll');
    const confirmWithdrawAll = document.getElementById('confirmWithdrawAll');
    const withdrawAllSummary = document.getElementById('withdrawAllSummary');

    document.getElementById('withdrawAllBtn')?.addEventListener('click', () => {
      const bank = getSavedBank();
      if (!bank) {
        showToast('Please add bank details first.');
        bankModal?.classList.remove('hidden');
        return;
      }

      const total = getCapital() + getBonus() + getTaskBal();
      if (total <= 0) {
        showToast('No funds available.');
        return;
      }

      if (withdrawAllSummary) {
        withdrawAllSummary.innerHTML = `
          <li class="history-item"><span>Capital:</span><strong>${formatNGN(getCapital())}</strong></li>
          <li class="history-item"><span>Bonus:</span><strong>${formatNGN(getBonus())}</strong></li>
          <li class="history-item"><span>Task Rewards:</span><strong>${formatNGN(getTaskBal())}</strong></li>
          <li class="history-item"><span>Total Payout:</span><strong style="color:var(--accent-emerald);">${formatNGN(total)}</strong></li>
        `;
      }
      withdrawAllModal?.classList.remove('hidden');
    });

    closeWithdrawAllModal?.addEventListener('click', () => withdrawAllModal?.classList.add('hidden'));
    cancelWithdrawAll?.addEventListener('click', () => withdrawAllModal?.classList.add('hidden'));

    confirmWithdrawAll?.addEventListener('click', () => {
      const total = getCapital() + getBonus() + getTaskBal();
      setCapital(0);
      setBonus(0);
      setTaskBal(0);

      recordHistory('Full Account Withdrawal', total, 'withdraw');
      withdrawAllModal?.classList.add('hidden');
      renderBalances();
      showToast('Withdrawal submitted! Capital returned.');
    });

    function recordHistory(title, amount, type = 'earn') {
      const history = JSON.parse(localStorage.getItem(userStorageKey('tx_history')) || '[]');
      history.unshift({
        title,
        amount,
        type,
        date: new Date().toLocaleString()
      });
      const updatedHistory = history.slice(0, 30);
      localStorage.setItem(userStorageKey('tx_history'), JSON.stringify(updatedHistory));
      saveUserField('transactionHistory', updatedHistory);
      renderTxHistoryFromList(updatedHistory);
    }

    function renderTxHistory() {
      const history = JSON.parse(localStorage.getItem(userStorageKey('tx_history')) || '[]');
      renderTxHistoryFromList(history);
    }

    // -------------------------------------------------------------
    // TAP MINING
    // -------------------------------------------------------------
    const coinBtn = document.getElementById('CoinBtn');
    coinBtn?.addEventListener('click', () => {
      const lastMined = parseInt(localStorage.getItem(userStorageKey('last_mined')) || '0', 10);
      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;

      if (now - lastMined < cooldown) {
        const remainingHours = Math.ceil((cooldown - (now - lastMined)) / (1000 * 60 * 60));
        showToast(`Already claimed today! Next tap in ~${remainingHours}h.`);
        return;
      }

      localStorage.setItem(userStorageKey('last_mined'), now.toString());
      saveUserField('lastMinedAt', now);
      const reward = 200;
      setTaskBal(getTaskBal() + reward);
      setYieldTotal(getYieldTotal() + reward);
      recordHistory('Daily Tap Mining', reward, 'earn');
      renderBalances();
      if (window.confetti) confetti();
      showToast(`Mined +${formatNGN(reward)} successfully!`);
    });

    // Realtime changes listener from Firestore
    onSnapshot(userDocRef, snapshot => {
      if (!snapshot.exists()) return;
      applyAccountData(snapshot.data());
    }, () => console.warn('Sync lost or offline.'));
  })().catch(error => {
    console.error('Session initialization error:', error);
  });

  // -------------------------------------------------------------
  // 3. UI RENDERING UTILITIES
  // -------------------------------------------------------------
  function renderBalancesFromValues(cap, bon, tsk, yld) {
    const total = cap + bon + tsk;
    const totalEl = document.getElementById('totalCoins');
    if (totalEl) totalEl.textContent = formatNGN(total);
    const balInv = document.getElementById('balanceInvested');
    if (balInv) balInv.textContent = formatNGN(cap);
    const balBon = document.getElementById('balanceBonus');
    if (balBon) balBon.textContent = formatNGN(bon);
    const balTsk = document.getElementById('balanceTask');
    if (balTsk) balTsk.textContent = formatNGN(tsk);
    const balYld = document.getElementById('balanceYield');
    if (balYld) balYld.textContent = formatNGN(yld);

    const actInv = document.getElementById('activeInvestments');
    if (actInv) actInv.textContent = formatNGN(cap);
    const dailyY = document.getElementById('dailyYieldDisplay');
    if (dailyY) dailyY.textContent = `+${formatNGN(cap * 0.045)} / day`;

    const wdCap = document.getElementById('wdCapital');
    if (wdCap) wdCap.textContent = formatNGN(cap);
    const wdBon = document.getElementById('wdBonus');
    if (wdBon) wdBon.textContent = formatNGN(bon);
    const wdTsk = document.getElementById('wdTask');
    if (wdTsk) wdTsk.textContent = formatNGN(tsk);
    const wdTot = document.getElementById('wdTotal');
    if (wdTot) wdTot.textContent = formatNGN(total);
  }

  function renderBankUI(bank) {
    const savedAccountBox = document.getElementById('savedAccountBox');
    const savedAccountDisplay = document.getElementById('savedAccountDisplay');
    const profileBankDetails = document.getElementById('profileBankDetails');

    if (bank && bank.accountNumber) {
      const summary = `${bank.bankName} • ${bank.accountNumber} (${bank.accountHolder})`;
      if (savedAccountDisplay) savedAccountDisplay.textContent = summary;
      if (savedAccountBox) savedAccountBox.classList.remove('hidden');
      if (profileBankDetails) {
        profileBankDetails.innerHTML = `<strong>Bank:</strong> ${bank.bankName}<br/><strong>Account:</strong> ${bank.accountNumber}<br/><strong>Holder:</strong> ${bank.accountHolder}`;
      }
    } else {
      if (savedAccountBox) savedAccountBox.classList.add('hidden');
      if (profileBankDetails) profileBankDetails.textContent = 'No bank details added yet.';
    }
  }

  function renderTxHistoryFromList(history) {
    const txList = document.getElementById('txList');
    const historyList = document.getElementById('historyList');

    if (txList) {
      if (!history || history.length === 0) {
        txList.innerHTML = '<li class="history-empty muted">No transactions yet.</li>';
      } else {
        txList.innerHTML = history.map(item => `
          <li class="history-item">
            <div>
              <strong>${item.title}</strong>
              <small>${item.date}</small>
            </div>
            <span class="earned-amount">${formatNGN(item.amount)}</span>
          </li>
        `).join('');
      }
    }

    if (historyList) {
      const withdrawals = (history || []).filter(h => h.type === 'withdraw');
      if (withdrawals.length === 0) {
        historyList.innerHTML = '<li class="history-empty muted">No withdrawal history yet.</li>';
      } else {
        historyList.innerHTML = withdrawals.map(w => `
          <li class="history-item">
            <div>
              <strong>${w.title}</strong>
              <small>${w.date}</small>
            </div>
            <span class="earned-amount">${formatNGN(w.amount)}</span>
          </li>
        `).join('');
      }
    }
  }

  function renderKycStatus(kycData) {
    const isVerified = Boolean(kycData?.isVerified);
    const kycBadge = document.getElementById('kycBadge');
    const kycActionBtn = document.getElementById('kycActionBtn');
    const kycDetailsList = document.getElementById('kycDetailsList');
    const kycDocType = document.getElementById('kycDocType');
    const kycDocNum = document.getElementById('kycDocNum');
    const kycPromptModal = document.getElementById('kycPromptModal');

    if (kycBadge) {
      kycBadge.textContent = isVerified ? 'Status: Verified ✓' : 'Status: Not Verified';
      kycBadge.style.color = isVerified ? 'var(--accent-emerald)' : '#ef4444';
    }
    if (kycActionBtn) kycActionBtn.style.display = isVerified ? 'none' : '';
    if (kycDetailsList) kycDetailsList.style.display = isVerified ? 'flex' : 'none';
    if (isVerified) {
      if (kycDocType) kycDocType.textContent = kycData?.docType || 'Government ID';
      if (kycDocNum) kycDocNum.textContent = kycData?.docNumberMasked || '••••••••';
      kycPromptModal?.classList.add('hidden');
    }
  }

  // -------------------------------------------------------------
  // 4. NAVIGATION, TABS & GLOBAL CONTROLS
  // -------------------------------------------------------------
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabPanes = document.querySelectorAll('.dashboard-tab-pane');

  function switchDashboardTab(targetTabId) {
    tabPanes.forEach(pane => pane.classList.remove('active'));
    tabLinks.forEach(link => {
      if (link.dataset.tab === targetTabId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
    const targetPane = document.getElementById(targetTabId);
    if (targetPane) targetPane.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  tabLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.tab;
      if (target) switchDashboardTab(target);
    });
  });

  const dismissKycPrompt = document.getElementById('dismissKycPrompt');
  dismissKycPrompt?.addEventListener('click', () => {
    document.getElementById('kycPromptModal')?.classList.add('hidden');
  });

  const copyRefBtn = document.getElementById('copyRefBtn');
  copyRefBtn?.addEventListener('click', () => {
    const refCodeInput = document.getElementById('refCodeInput');
    if (refCodeInput) {
      navigator.clipboard.writeText(refCodeInput.value).then(() => {
        showToast('Referral link copied to clipboard!');
      }).catch(() => {
        refCodeInput.select();
        document.execCommand('copy');
        showToast('Referral link copied!');
      });
    }
  });

  const themeToggle = document.getElementById('themeToggle');
  themeToggle?.addEventListener('click', () => {
    document.documentElement.classList.toggle('light');
    themeToggle.textContent = document.documentElement.classList.contains('light') ? '☀️' : '🌙';
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    signOut(auth).then(() => {
      localStorage.removeItem('fc_last_uid');
      window.location.href = 'index.html';
    }).catch(() => showToast('Could not log out. Please try again.'));
  });

  const toast = document.getElementById('toast');
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  document.querySelectorAll('.invest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const plan = btn.dataset.plan;
      const amount = btn.dataset.amount;
      window.location.href = `payment.html?plan=${encodeURIComponent(plan)}&amount=${encodeURIComponent(amount)}`;
    });
  });
});