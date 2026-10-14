import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  // -------------------------------------------------------------
  // 1. DYNAMIC USER DATA & SESSION AUTH
  // -------------------------------------------------------------
  (async () => {
  const user = await new Promise(resolve => onAuthStateChanged(auth, resolve));
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const userDocRef = doc(db, 'users', user.uid);
  const userStorageKey = key => `fc_${user.uid}_${key}`;
  let accountSnapshot = await getDoc(userDocRef);
  if (!accountSnapshot.exists()) {
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
    });
    accountSnapshot = await getDoc(userDocRef);
  }
  const account = accountSnapshot.data();
  const profile = account.profile || {};
  const userFullName = profile.fullName || user.displayName || 'FeedCoin User';
  const userEmail = profile.email || user.email || '';
  const username = profile.username || '';
  const userPhone = profile.phone || '';

  function applyAccountData(data) {
    localStorage.setItem(userStorageKey('capital'), String(data.balances?.capital || 0));
    localStorage.setItem(userStorageKey('bonus'), String(data.balances?.bonus || 0));
    localStorage.setItem(userStorageKey('task_bal'), String(data.balances?.task || 0));
    localStorage.setItem(userStorageKey('yield_total'), String(data.balances?.yieldTotal || 0));
    localStorage.setItem(userStorageKey('last_mined'), String(data.lastMinedAt || 0));
    localStorage.setItem(userStorageKey('tx_history'), JSON.stringify(data.transactionHistory || []));
    if (data.bankDetails) localStorage.setItem(userStorageKey('user_bank'), JSON.stringify(data.bankDetails));
    if (data.kycData) localStorage.setItem(userStorageKey('kyc_data'), JSON.stringify(data.kycData));
  }
  applyAccountData(account);

  function saveUserField(field, value) {
    updateDoc(userDocRef, { [field]: value }).catch(() => {
      showToast('Could not save your account data. Check your connection and try again.');
    });
  }

  const initial = userFullName.charAt(0).toUpperCase();

  // Populate Header
  const headerAvatar = document.getElementById('headerAvatar');
  const headerUserName = document.getElementById('headerUserName');
  if (headerAvatar) headerAvatar.textContent = initial;
  if (headerUserName) headerUserName.textContent = userFullName;

  // Populate Profile Header
  const profileAvatar = document.getElementById('profileAvatar');
  const profileName = document.getElementById('profileName');
  const profileEmail = document.getElementById('profileEmail');
  if (profileAvatar) profileAvatar.textContent = initial;
  if (profileName) profileName.textContent = userFullName;
  if (profileEmail) profileEmail.textContent = userEmail;

  // Populate Profile Details Grid (Full Name, Username, Email, Phone)
  const displayFullName = document.getElementById('displayFullName');
  const displayUsername = document.getElementById('displayUsername');
  const displayEmail = document.getElementById('displayEmail');
  const displayPhone = document.getElementById('displayPhone');

  if (displayFullName) displayFullName.textContent = userFullName;
  if (displayUsername) displayUsername.textContent = '@' + username;
  if (displayEmail) displayEmail.textContent = userEmail;
  if (displayPhone) displayPhone.textContent = userPhone;

  // -------------------------------------------------------------
  // 2. REFERRAL PROGRAM LINK (Points directly to www.feedcoin.online)
  // -------------------------------------------------------------
  const refCodeInput = document.getElementById('refCodeInput');
  if (refCodeInput) {
    refCodeInput.value = `https://www.feedcoin.online/index.html?ref=${encodeURIComponent(username)}`;
  }

  const copyRefBtn = document.getElementById('copyRefBtn');
  copyRefBtn?.addEventListener('click', () => {
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

  // -------------------------------------------------------------
  // 3. KYC VERIFICATION CHECK & CONDITIONAL POPUP
  // -------------------------------------------------------------
  const kycRaw = localStorage.getItem(userStorageKey('kyc_data'));
  let isVerified = false;
  let parsedKyc = null;

  if (kycRaw) {
    try {
      parsedKyc = JSON.parse(kycRaw);
      isVerified = Boolean(parsedKyc && parsedKyc.isVerified);
    } catch (e) {
      isVerified = false;
    }
  }

  const kycBadge = document.getElementById('kycBadge');
  const kycActionBtn = document.getElementById('kycActionBtn');
  const kycDetailsList = document.getElementById('kycDetailsList');
  const kycDocType = document.getElementById('kycDocType');
  const kycDocNum = document.getElementById('kycDocNum');
  const kycPromptModal = document.getElementById('kycPromptModal');
  const dismissKycPrompt = document.getElementById('dismissKycPrompt');

  if (isVerified) {
    if (kycBadge) {
      kycBadge.textContent = 'Status: Verified ✓';
      kycBadge.style.color = 'var(--accent-emerald)';
    }
    if (kycActionBtn) kycActionBtn.style.display = 'none';
    if (kycDetailsList) kycDetailsList.style.display = 'flex';
    if (kycDocType) kycDocType.textContent = parsedKyc.docType || 'Government ID';
    if (kycDocNum) kycDocNum.textContent = parsedKyc.docNumberMasked || '••••••••';
    kycPromptModal?.classList.add('hidden');
  } else {
    setTimeout(() => {
      kycPromptModal?.classList.remove('hidden');
    }, 800);

    dismissKycPrompt?.addEventListener('click', () => {
      kycPromptModal?.classList.add('hidden');
    });
  }

  // -------------------------------------------------------------
  // 4. TAB NAVIGATION & RESPONSIVENESS
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

  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  themeToggle?.addEventListener('click', () => {
    document.documentElement.classList.toggle('light');
    themeToggle.textContent = document.documentElement.classList.contains('light') ? '☀️' : '🌙';
  });

  // Logout handler
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    signOut(auth).then(() => {
      window.location.href = 'index.html';
    }).catch(() => showToast('Could not log out. Please try again.'));
  });

  // Toast utility
  const toast = document.getElementById('toast');
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // -------------------------------------------------------------
  // 5. BALANCES & STATE
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

  function formatNGN(n) {
    return '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderBalances() {
    const cap = getCapital();
    const bon = getBonus();
    const tsk = getTaskBal();
    const yld = getYieldTotal();
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

  // -------------------------------------------------------------
  // 6. BANK ACCOUNT LINKING & WITHDRAWALS
  // -------------------------------------------------------------
  const savedAccountBox = document.getElementById('savedAccountBox');
  const savedAccountDisplay = document.getElementById('savedAccountDisplay');
  const profileBankDetails = document.getElementById('profileBankDetails');
  const bankModal = document.getElementById('bankModal');
  const closeBankModal = document.getElementById('closeBankModal');
  const bankForm = document.getElementById('bankForm');
  const editBankBtn = document.getElementById('editBankBtn');

  function getSavedBank() {
    const raw = localStorage.getItem(userStorageKey('user_bank'));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function renderBankDetails() {
    const b = getSavedBank();
    if (b && b.accountNumber) {
      const summary = `${b.bankName} • ${b.accountNumber} (${b.accountHolder})`;
      if (savedAccountDisplay) savedAccountDisplay.textContent = summary;
      if (savedAccountBox) savedAccountBox.classList.remove('hidden');
      if (profileBankDetails) {
        profileBankDetails.innerHTML = `<strong>Bank:</strong> ${b.bankName}<br/><strong>Account:</strong> ${b.accountNumber}<br/><strong>Holder:</strong> ${b.accountHolder}`;
      }
    } else {
      if (savedAccountBox) savedAccountBox.classList.add('hidden');
      if (profileBankDetails) profileBankDetails.textContent = 'No bank details added yet.';
    }
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
    renderBankDetails();
    showToast('Bank details saved successfully.');
  });

  // Withdraw Modals
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
    renderTxHistory();
  }

  function renderTxHistory() {
    const history = JSON.parse(localStorage.getItem(userStorageKey('tx_history')) || '[]');
    const txList = document.getElementById('txList');
    const historyList = document.getElementById('historyList');

    if (txList) {
      if (history.length === 0) {
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
      const withdrawals = history.filter(h => h.type === 'withdraw');
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

  // -------------------------------------------------------------
  // 7. TAP MINING LOGIC
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

  // -------------------------------------------------------------
  // 8. INVESTMENT BUTTONS
  // -------------------------------------------------------------
  document.querySelectorAll('.invest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const plan = btn.dataset.plan;
      const amount = btn.dataset.amount;
      window.location.href = `payment.html?plan=${encodeURIComponent(plan)}&amount=${encodeURIComponent(amount)}`;
    });
  });

  // Initialize display
  renderBalances();
  renderBankDetails();
  renderTxHistory();
  onSnapshot(userDocRef, snapshot => {
    if (!snapshot.exists()) {
      showToast('Your account data could not be found.');
      return;
    }
    applyAccountData(snapshot.data());
    renderBalances();
    renderBankDetails();
    renderTxHistory();
  }, () => showToast('Could not sync your account data. Check your connection.'));
  })().catch(error => {
    console.error('Unable to load the signed-in user account.', error);
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = 'Could not load your account. Please try again.';
      toast.classList.add('show');
    }
  });
});