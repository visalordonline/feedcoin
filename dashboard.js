document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('is_logged_in') !== 'true') {
    window.location.href = 'index.html';
    return;
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const formatNaira = (amt) => '₦' + Number(amt || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Wallet State
  let wallet = {
    balance: parseFloat(localStorage.getItem('fc_balance')) || 50000,
    activeCapital: parseFloat(localStorage.getItem('fc_capital')) || 0,
    miningEarnings: parseFloat(localStorage.getItem('fc_mining_earned')) || 0,
    taskEarnings: parseFloat(localStorage.getItem('fc_task_earned')) || 0,
    totalYieldEarned: parseFloat(localStorage.getItem('fc_total_yield')) || 0
  };

  const savedName = localStorage.getItem('user_name') || 'Alex Rivers';
  const savedEmail = localStorage.getItem('user_email') || 'alex@feedcoin.io';

  registerUserInDirectory(savedName, savedEmail);

  const headerUserName = document.getElementById('headerUserName');
  const headerAvatar = document.getElementById('headerAvatar');
  const profileName = document.getElementById('profileName');
  const profileAvatar = document.getElementById('profileAvatar');
  const profileEmail = document.getElementById('profileEmail');

  if (headerUserName) headerUserName.textContent = savedName;
  if (headerAvatar) headerAvatar.textContent = savedName.charAt(0).toUpperCase();
  if (profileName) profileName.textContent = savedName;
  if (profileAvatar) profileAvatar.textContent = savedName.charAt(0).toUpperCase();
  if (profileEmail) profileEmail.textContent = savedEmail;

  // DOM Elements - Balances
  const totalCoins = document.getElementById('totalCoins');
  const balanceInvested = document.getElementById('balanceInvested');
  const balanceMining = document.getElementById('balanceMining');
  const balanceTask = document.getElementById('balanceTask');
  const balanceYield = document.getElementById('balanceYield');
  const activeInvestments = document.getElementById('activeInvestments');
  const dailyYieldDisplay = document.getElementById('dailyYieldDisplay');
  const withdrawTabBalance = document.getElementById('withdrawTabBalance');
  const withdrawThresholdHint = document.getElementById('withdrawThresholdHint');
  const taskMinNotice = document.getElementById('taskMinNotice');
  const toast = document.getElementById('toast');
  const historyList = document.getElementById('historyList');

  // DOM Elements - Mining
  const CoinBtn = document.getElementById('CoinBtn');
  const miningBtnText = document.getElementById('miningBtnText');
  const miningCooldownText = document.getElementById('miningCooldownText');
  const claimDailyBtn = document.getElementById('claimDailyBtn');

  // Task Element Mappings
  const taskElements = {
    yt: { inputId: 'ytCodeInput', btnId: 'ytVerifyBtn', coolId: 'ytCooldownText', linkId: 'ytVideoLink', channelBtnId: 'ytChannelBtn', defaultName: 'YouTube' },
    fb: { inputId: 'fbCodeInput', btnId: 'fbVerifyBtn', coolId: 'fbCooldownText', linkId: 'fbVideoLink', channelBtnId: 'fbChannelBtn', defaultName: 'Facebook' },
    tt: { inputId: 'ttCodeInput', btnId: 'ttVerifyBtn', coolId: 'ttCooldownText', linkId: 'ttVideoLink', defaultName: 'TikTok' }
  };

  function getDynamicTaskConfig() {
    const saved = localStorage.getItem('fc_admin_task_config');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      yt: { link: 'https://www.youtube.com/@FEEDCOINAPP', code: 'YT2026', name: 'YouTube' },
      fb: { link: 'https://www.facebook.com/profile.php?id=61595119085030&mibextid=ZbWKwL', code: 'FB2026', name: 'Facebook' },
      tt: { link: 'https://tiktok.com', code: 'TIKTOK2026', name: 'TikTok' }
    };
  }

  function applyDynamicTaskLinks() {
    const tasks = getDynamicTaskConfig();
    Object.keys(taskElements).forEach(platform => {
      const el = taskElements[platform];
      const linkTag = document.getElementById(el.linkId);
      if (linkTag && tasks[platform] && tasks[platform].link) {
        linkTag.href = tasks[platform].link;
      }
    });

    // Check YouTube subscription & Facebook follow status
    updateChannelButtonUI('yt', localStorage.getItem('fc_subscribed_yt') === 'true');
    updateChannelButtonUI('fb', localStorage.getItem('fc_followed_fb') === 'true');
  }

  function updateChannelButtonUI(platform, isDone) {
    const btn = document.getElementById(taskElements[platform]?.channelBtnId);
    if (!btn) return;
    if (isDone) {
      btn.className = 'channel-action-btn completed';
      btn.innerHTML = platform === 'yt' ? '✓ Subscribed to YouTube' : '✓ Following on Facebook';
    } else {
      btn.className = 'channel-action-btn uncompleted';
      btn.innerHTML = platform === 'yt' ? '🔔 Step 1: Subscribe on YouTube' : '👍 Step 1: Follow on Facebook';
    }
  }

  // Handle mandatory clicks
  document.getElementById('ytChannelBtn')?.addEventListener('click', () => {
    localStorage.setItem('fc_subscribed_yt', 'true');
    updateChannelButtonUI('yt', true);
    showToast('YouTube channel opened! Click Subscribe to qualify.');
  });

  document.getElementById('fbChannelBtn')?.addEventListener('click', () => {
    localStorage.setItem('fc_followed_fb', 'true');
    updateChannelButtonUI('fb', true);
    showToast('Facebook page opened! Click Follow to qualify.');
  });

  // Withdrawal Popup Elements
  const withdrawAllBtn = document.getElementById('withdrawAllBtn');
  const withdrawAmountModal = document.getElementById('withdrawAmountModal');
  const closeWithdrawModal = document.getElementById('closeWithdrawModal');
  const withdrawAmountForm = document.getElementById('withdrawAmountForm');
  const withdrawAmountInput = document.getElementById('withdrawAmountInput');
  const modalAvailableBal = document.getElementById('modalAvailableBal');

  // Bank & KYC Elements
  const bankModal = document.getElementById('bankModal');
  const closeBankModal = document.getElementById('closeBankModal');
  const bankForm = document.getElementById('bankForm');
  const savedAccountBox = document.getElementById('savedAccountBox');
  const savedAccountDisplay = document.getElementById('savedAccountDisplay');
  const editBankBtn = document.getElementById('editBankBtn');
  const profileBankDetails = document.getElementById('profileBankDetails');

  const kycBadge = document.getElementById('kycBadge');
  const kycActionBtn = document.getElementById('kycActionBtn');
  const kycDetailsList = document.getElementById('kycDetailsList');
  const kycDocType = document.getElementById('kycDocType');
  const kycDocNum = document.getElementById('kycDocNum');

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function registerUserInDirectory(name, email) {
    let users = JSON.parse(localStorage.getItem('fc_registered_users') || '[]');
    let user = users.find(u => u.email === email);
    if (!user) {
      users.push({
        name,
        email,
        joinedAt: new Date().toLocaleDateString(),
        balance: wallet.balance,
        capital: wallet.activeCapital
      });
      localStorage.setItem('fc_registered_users', JSON.stringify(users));
    }
  }

  function updateUserStatsInDirectory() {
    let users = JSON.parse(localStorage.getItem('fc_registered_users') || '[]');
    const index = users.findIndex(u => u.email === savedEmail);
    if (index !== -1) {
      users[index].balance = wallet.balance;
      users[index].capital = wallet.activeCapital;
      users[index].mining = wallet.miningEarnings;
      users[index].task = wallet.taskEarnings;
      localStorage.setItem('fc_registered_users', JSON.stringify(users));
    }
  }

  function getWithdrawalHistory() {
    return JSON.parse(localStorage.getItem('fc_withdrawals_history') || '[]');
  }

  function saveWithdrawalRecord(record) {
    const history = getWithdrawalHistory();
    history.unshift(record);
    localStorage.setItem('fc_withdrawals_history', JSON.stringify(history));
  }

  function renderPermanentWithdrawalHistory() {
    if (!historyList) return;
    const history = getWithdrawalHistory();
    historyList.innerHTML = '';

    if (history.length === 0) {
      historyList.innerHTML = '<li class="history-empty muted">No withdrawal history yet.</li>';
      return;
    }

    history.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';
      const statusColor = item.status === 'Approved' ? '#10b981' : item.status === 'Rejected' ? '#ef4444' : '#f59e0b';
      
      li.innerHTML = `
        <div>
          <strong>Withdrawal to ${item.bankName} (${item.accountNumber})</strong>
          <small>${item.date} • Status: <span style="color:${statusColor}; font-weight:600;">${item.status}</span></small>
        </div>
        <span class="earned-amount" style="color:#ef4444;">-${formatNaira(item.amount)}</span>
      `;
      historyList.appendChild(li);
    });
  }

  function checkKycStatus() {
    const kycRaw = localStorage.getItem('fc_kyc_data');
    let kycData = null;
    if (kycRaw) {
      try { kycData = JSON.parse(kycRaw); } catch(e) {}
    }
    const isVerified = kycData && kycData.isVerified;

    if (!isVerified) {
      if (kycBadge) {
        kycBadge.textContent = 'Status: Unverified ⚠️';
        kycBadge.style.color = '#ef4444';
      }
      if (kycActionBtn) kycActionBtn.style.display = 'inline-flex';
      if (kycDetailsList) kycDetailsList.style.display = 'none';
    } else {
      if (kycBadge) {
        kycBadge.textContent = 'Status: Verified ✓';
        kycBadge.style.color = 'var(--accent-emerald)';
      }
      if (kycActionBtn) kycActionBtn.style.display = 'none';
      if (kycDetailsList) {
        kycDetailsList.style.display = 'flex';
        if (kycDocType) kycDocType.textContent = kycData.docType;
        if (kycDocNum) kycDocNum.textContent = kycData.docNumberMasked;
      }
    }
  }

  function calculateWithdrawableBalance() {
    if (wallet.taskEarnings < CONFIG.TASK_MIN_WITHDRAW) {
      return Math.max(0, wallet.balance - wallet.taskEarnings);
    }
    return wallet.balance;
  }

  function syncUI() {
    if (totalCoins) totalCoins.textContent = formatNaira(wallet.balance);
    if (balanceInvested) balanceInvested.textContent = formatNaira(wallet.activeCapital);
    if (balanceMining) balanceMining.textContent = formatNaira(wallet.miningEarnings);
    if (balanceTask) balanceTask.textContent = formatNaira(wallet.taskEarnings);
    if (balanceYield) balanceYield.textContent = formatNaira(wallet.totalYieldEarned);
    if (activeInvestments) activeInvestments.textContent = formatNaira(wallet.activeCapital);
    if (dailyYieldDisplay) dailyYieldDisplay.textContent = `+${formatNaira(wallet.activeCapital * CONFIG.DAILY_YIELD_RATE)} / day`;

    const withdrawable = calculateWithdrawableBalance();
    if (withdrawTabBalance) withdrawTabBalance.textContent = formatNaira(withdrawable);

    if (wallet.taskEarnings < CONFIG.TASK_MIN_WITHDRAW) {
      const remaining = CONFIG.TASK_MIN_WITHDRAW - wallet.taskEarnings;
      if (taskMinNotice) taskMinNotice.textContent = `Locked (${formatNaira(wallet.taskEarnings)} / ${formatNaira(CONFIG.TASK_MIN_WITHDRAW)}). Need ${formatNaira(remaining)} more.`;
      if (withdrawThresholdHint) withdrawThresholdHint.textContent = `Task balance (${formatNaira(wallet.taskEarnings)}) is locked until reaching ₦2,000.00.`;
    } else {
      if (taskMinNotice) {
        taskMinNotice.textContent = 'Unlocked & Withdrawable!';
        taskMinNotice.style.color = '#10b981';
      }
      if (withdrawThresholdHint) withdrawThresholdHint.textContent = '';
    }

    localStorage.setItem('fc_balance', wallet.balance);
    localStorage.setItem('fc_capital', wallet.activeCapital);
    localStorage.setItem('fc_mining_earned', wallet.miningEarnings);
    localStorage.setItem('fc_task_earned', wallet.taskEarnings);
    localStorage.setItem('fc_total_yield', wallet.totalYieldEarned);

    checkDailyStatus();
    applyDynamicTaskLinks();
    updateUserStatsInDirectory();
    renderBankAccountDisplay();
    checkKycStatus();
    renderPermanentWithdrawalHistory();
  }

  function checkDailyStatus() {
    const lastMined = parseInt(localStorage.getItem('fc_last_mining')) || 0;
    const miningLeft = DAY_MS - (Date.now() - lastMined);
    if (miningLeft > 0) {
      const hours = Math.ceil(miningLeft / 3600000);
      if (CoinBtn) {
        CoinBtn.disabled = true;
        CoinBtn.style.opacity = '0.5';
      }
      if (miningBtnText) miningBtnText.textContent = 'DONE';
      if (miningCooldownText) miningCooldownText.textContent = `Available tomorrow (in ${hours}h).`;
    } else {
      if (CoinBtn) {
        CoinBtn.disabled = false;
        CoinBtn.style.opacity = '1';
      }
      if (miningBtnText) miningBtnText.textContent = 'TAP';
      if (miningCooldownText) miningCooldownText.textContent = `Ready to mine (+₦${CONFIG.MINING_REWARD}.00).`;
    }

    Object.keys(taskElements).forEach(key => {
      const task = taskElements[key];
      const lastDone = parseInt(localStorage.getItem(`fc_last_task_${key}`)) || 0;
      const timeLeft = DAY_MS - (Date.now() - lastDone);
      const btn = document.getElementById(task.btnId);
      const input = document.getElementById(task.inputId);
      const cool = document.getElementById(task.coolId);

      if (timeLeft > 0) {
        const hours = Math.ceil(timeLeft / 3600000);
        if (btn) btn.disabled = true;
        if (input) input.disabled = true;
        if (cool) cool.textContent = `Done for today. Available tomorrow (in ${hours}h).`;
      } else {
        if (btn) btn.disabled = false;
        if (input) input.disabled = false;
        if (cool) cool.textContent = '';
      }
    });
  }

  // Mining Button
  CoinBtn?.addEventListener('click', () => {
    const lastMined = parseInt(localStorage.getItem('fc_last_mining')) || 0;
    if (Date.now() - lastMined < DAY_MS) {
      showToast('You can only mine once a day!');
      return;
    }
    const reward = CONFIG.MINING_REWARD;
    wallet.balance += reward;
    wallet.miningEarnings += reward;
    localStorage.setItem('fc_last_mining', Date.now());
    syncUI();
    if (window.confetti) confetti();
    showToast(`Mined +${formatNaira(reward)}!`);
  });

  // ==========================================
  // MANDATORY SUBSCRIPTION, 24H EXPIRATION & REDEEM LOGIC
  // ==========================================
  document.querySelectorAll('.task-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const platform = btn.dataset.platform;
      const taskMeta = taskElements[platform];
      const tasksConfig = getDynamicTaskConfig();
      const currentConfig = tasksConfig[platform] || { code: 'YT2026', name: 'Task', generatedAt: Date.now() };

      // 1. Mandatory subscription / follow validation
      if (platform === 'yt' && localStorage.getItem('fc_subscribed_yt') !== 'true') {
        showToast('⚠️ You must subscribe to our YouTube channel first before redeeming!');
        return;
      }

      if (platform === 'fb' && localStorage.getItem('fc_followed_fb') !== 'true') {
        showToast('⚠️ You must follow our Facebook page first before redeeming!');
        return;
      }

      // 2. 24-Hour Code Expiration Check
      const generatedAt = parseInt(currentConfig.generatedAt) || 0;
      const codeAge = Date.now() - generatedAt;
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

      if (generatedAt > 0 && codeAge > TWENTY_FOUR_HOURS) {
        showToast(`⚠️ This ${currentConfig.name} code has expired! Secret codes are only valid for 24 hours.`);
        return;
      }

      // 3. User Daily Claim Cooldown
      const lastDone = parseInt(localStorage.getItem(`fc_last_task_${platform}`)) || 0;
      if (Date.now() - lastDone < DAY_MS) {
        showToast(`${currentConfig.name} task already completed today!`);
        return;
      }

      // 4. Code Match Validation
      const input = document.getElementById(taskMeta.inputId);
      const userCode = (input?.value || '').trim().toUpperCase();

      if (!userCode) {
        showToast('Please enter the redeem code found in the video!');
        return;
      }

      const expectedCode = (currentConfig.code || '').trim().toUpperCase();

      if (userCode !== expectedCode) {
        showToast(`Invalid code! Please check the ${currentConfig.name} video for the correct code.`);
        return;
      }

      // Reward Credit
      const reward = CONFIG.TASK_REWARD;
      wallet.balance += reward;
      wallet.taskEarnings += reward;
      localStorage.setItem(`fc_last_task_${platform}`, Date.now());
      input.value = '';
      syncUI();
      if (window.confetti) confetti();
      
      showToast(`${currentConfig.name} daily task complete! +${formatNaira(reward)} added.`);
    });
  });

  // ==========================================
  // INVESTMENT PACKAGE SUBSCRIPTION
  // ==========================================
  document.querySelectorAll('.invest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const planName = btn.dataset.plan;
      const amount = parseFloat(btn.dataset.amount);

      if (wallet.balance < amount) {
        showToast(`Insufficient balance for ${planName}. Please deposit or mine first.`);
        return;
      }

      wallet.balance -= amount;
      wallet.activeCapital += amount;
      syncUI();
      if (window.confetti) confetti();
      showToast(`Successfully subscribed to ${planName} for ${formatNaira(amount)}!`);
    });
  });

  // Claim Yield
  claimDailyBtn?.addEventListener('click', () => {
    if (wallet.activeCapital <= 0) {
      showToast('No active investment plan running.');
      return;
    }
    const lastYield = parseInt(localStorage.getItem('fc_last_yield')) || 0;
    if (Date.now() - lastYield < DAY_MS) {
      showToast('Daily yield already claimed today!');
      return;
    }
    const yieldAmount = wallet.activeCapital * CONFIG.DAILY_YIELD_RATE;
    wallet.balance += yieldAmount;
    wallet.totalYieldEarned += yieldAmount;
    localStorage.setItem('fc_last_yield', Date.now());
    syncUI();
    showToast(`Claimed +${formatNaira(yieldAmount)} yield!`);
  });

  // Bank Info Functions
  function getSavedBank() {
    const data = localStorage.getItem('fc_user_bank');
    return data ? JSON.parse(data) : null;
  }

  function renderBankAccountDisplay() {
    const bank = getSavedBank();
    if (bank && savedAccountBox && savedAccountDisplay) {
      savedAccountBox.classList.remove('hidden');
      savedAccountDisplay.textContent = `${bank.bankName} || ${bank.accountNumber} (${bank.accountHolder})`;
    }
    if (profileBankDetails) {
      if (bank) {
        profileBankDetails.innerHTML = `<strong>${bank.bankName}</strong><br/>Account Number: ${bank.accountNumber}<br/>Holder: ${bank.accountHolder}`;
      } else {
        profileBankDetails.textContent = 'No bank account linked yet.';
      }
    }
  }

  // Withdraw Amount Modal Handlers
  withdrawAllBtn?.addEventListener('click', () => {
    const withdrawable = calculateWithdrawableBalance();
    if (withdrawable <= 0) {
      showToast('You do not have any withdrawable balance right now.');
      return;
    }

    const bank = getSavedBank();
    if (!bank) {
      showToast('Please set up your linked bank account first.');
      bankModal?.classList.remove('hidden');
      return;
    }

    if (modalAvailableBal) modalAvailableBal.value = formatNaira(withdrawable);
    if (withdrawAmountInput) {
      withdrawAmountInput.max = withdrawable;
      withdrawAmountInput.value = '';
    }
    withdrawAmountModal?.classList.remove('hidden');
  });

  closeWithdrawModal?.addEventListener('click', () => withdrawAmountModal?.classList.add('hidden'));

  withdrawAmountForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmountInput.value);
    const withdrawable = calculateWithdrawableBalance();

    if (!amount || isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid amount.');
      return;
    }

    if (amount > withdrawable) {
      showToast(`Amount exceeds available withdrawable balance of ${formatNaira(withdrawable)}`);
      return;
    }

    const bank = getSavedBank();
    const kycRaw = localStorage.getItem('fc_kyc_data');
    let kycData = kycRaw ? JSON.parse(kycRaw) : null;

    wallet.balance -= amount;
    syncUI();

    const withdrawalRequest = {
      id: 'WD-' + Date.now().toString().slice(-6),
      userName: savedName,
      userEmail: savedEmail,
      amount: amount,
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      accountHolder: bank.accountHolder,
      date: new Date().toLocaleString(),
      status: 'Pending',
      isKycVerified: !!(kycData && kycData.isVerified)
    };

    saveWithdrawalRecord(withdrawalRequest);

    let adminRequests = JSON.parse(localStorage.getItem('fc_admin_withdrawal_requests') || '[]');
    adminRequests.unshift(withdrawalRequest);
    localStorage.setItem('fc_admin_withdrawal_requests', JSON.stringify(adminRequests));

    withdrawAmountModal?.classList.add('hidden');
    renderPermanentWithdrawalHistory();

    showToast('Withdrawal submitted to admin! You will receive your payment immediately admin approves it.');
  });

  editBankBtn?.addEventListener('click', () => {
    const bank = getSavedBank();
    if (bank) {
      document.getElementById('bankNameInput').value = bank.bankName;
      document.getElementById('accountNumberInput').value = bank.accountNumber;
      document.getElementById('accountHolderInput').value = bank.accountHolder;
    }
    bankModal?.classList.remove('hidden');
  });

  closeBankModal?.addEventListener('click', () => bankModal?.classList.add('hidden'));

  bankForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const bankData = {
      bankName: document.getElementById('bankNameInput').value.trim(),
      accountNumber: document.getElementById('accountNumberInput').value.trim(),
      accountHolder: document.getElementById('accountHolderInput').value.trim()
    };

    if (bankData.accountNumber.length !== 10 || isNaN(bankData.accountNumber)) {
      showToast('Account number must be exactly 10 digits.');
      return;
    }

    localStorage.setItem('fc_user_bank', JSON.stringify(bankData));
    bankModal?.classList.add('hidden');
    renderBankAccountDisplay();
    showToast('Bank details saved! You can now request your withdrawal.');
  });

  // Tab Navigation
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabPanes = document.querySelectorAll('.dashboard-tab-pane');
  function switchTab(id) {
    tabPanes.forEach(pane => pane.classList.remove('active'));
    tabLinks.forEach(link => link.classList.toggle('active', link.dataset.tab === id));
    const active = document.getElementById(id);
    if (active) active.classList.add('active');
  }

  tabLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const target = link.dataset.tab;
      if (target) {
        e.preventDefault();
        switchTab(target);
      }
    });
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('is_logged_in');
    window.location.href = 'index.html';
  });

  syncUI();
});