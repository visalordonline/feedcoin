document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('is_logged_in') !== 'true') {
    window.location.href = 'index.html';
    return;
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const formatNaira = (amt) => '₦' + Number(amt || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Wallet State
  let wallet = {
    yieldBalance: parseFloat(localStorage.getItem('fc_yield_balance')) || 0,
    taskBalance: parseFloat(localStorage.getItem('fc_task_balance')) || 0,
    activeCapital: parseFloat(localStorage.getItem('fc_capital')) || 0,
    miningEarnings: parseFloat(localStorage.getItem('fc_mining_earned')) || 0,
    taskEarnings: parseFloat(localStorage.getItem('fc_task_earned')) || 0,
    totalYieldEarned: parseFloat(localStorage.getItem('fc_total_yield')) || 0
  };

  // ==========================================
  // INVESTMENTS & AUTOMATIC DAILY REWARDS
  // Every investment pays 4.5% of its amount every 24 hours,
  // counted from the moment that investment was activated.
  // ==========================================
  const YIELD_HISTORY_LIMIT = 60;
  const round2 = (n) => Math.round(n * 100) / 100;

  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  // One-time migration: split the old single balance into bonus / task buckets
  if (localStorage.getItem('fc_buckets_v2') !== 'true') {
    const oldBalance = parseFloat(localStorage.getItem('fc_balance')) || 0;
    let yb = wallet.totalYieldEarned;
    let tb = wallet.miningEarnings + wallet.taskEarnings;
    let excess = yb + tb - oldBalance;
    if (excess > 0) {
      const fromYield = Math.min(yb, excess);
      yb -= fromYield;
      excess -= fromYield;
      tb = Math.max(0, tb - excess);
    }
    wallet.yieldBalance = yb;
    wallet.taskBalance = tb;
    localStorage.setItem('fc_buckets_v2', 'true');
  }

  let investments = loadJSON('fc_investments', []);

  // One-time migration: users who invested before this update
  if (investments.length === 0 && wallet.activeCapital > 0) {
    const lastYield = parseInt(localStorage.getItem('fc_last_yield')) || 0;
    const start = lastYield || Date.now();
    investments.push({
      id: 'INV-legacy',
      plan: 'Existing Investment',
      amount: wallet.activeCapital,
      startedAt: start,
      lastCreditAt: start,
      totalPaid: 0
    });
    localStorage.setItem('fc_investments', JSON.stringify(investments));
  }

  // Seed the transaction log once from older data
  if (localStorage.getItem('fc_tx_seeded') !== 'true') {
    const seeded = loadJSON('fc_transactions', []);
    investments.forEach(inv => seeded.push({ id: 'TX-' + inv.id, type: 'invest', title: `Investment • ${inv.plan}`, amount: inv.amount, at: inv.startedAt }));
    loadJSON('fc_yield_history', []).forEach((h, i) => seeded.push({ id: 'TX-Y' + i + '-' + h.at, type: 'bonus', title: `Daily earning • ${h.plan}`, amount: h.amount, at: h.at }));
    loadJSON('fc_withdrawals_history', []).forEach(w => seeded.push({ id: 'TX-' + w.id, type: 'withdraw', title: `Withdrawal • ${w.typeLabel || 'Funds'}`, amount: w.amount, wid: w.id, at: Date.parse(w.date) || Date.now() }));
    localStorage.setItem('fc_transactions', JSON.stringify(seeded.slice(0, 500)));
    localStorage.setItem('fc_tx_seeded', 'true');
  }

  function addTransaction(tx) {
    const list = loadJSON('fc_transactions', []);
    list.unshift(Object.assign({ id: 'TX-' + Date.now() + '-' + Math.floor(Math.random() * 100000), at: Date.now() }, tx));
    localStorage.setItem('fc_transactions', JSON.stringify(list.slice(0, 500)));
  }

  function resolveWithdrawStatus(wid, fallback) {
    const adminReq = loadJSON('fc_admin_withdrawal_requests', []).find(r => r.id === wid);
    if (adminReq && adminReq.status) return adminReq.status;
    const hist = loadJSON('fc_withdrawals_history', []).find(r => r.id === wid);
    return (hist && hist.status) || fallback || 'Pending';
  }

  // Rejected withdrawals: give the money (and any ended investment plans) back to the user
  function processRefunds() {
    const adminReqs = loadJSON('fc_admin_withdrawal_requests', []);
    const history = loadJSON('fc_withdrawals_history', []);
    const refundedIds = [];
    let totalRefunded = 0;

    adminReqs.forEach(req => {
      if (req.status !== 'Rejected' || req.refunded) return;
      if (req.userEmail && req.userEmail !== savedEmail) return;

      const amount = Number(req.amount) || 0;
      const parts = req.breakdown || null;
      // Older requests have no breakdown: return the full amount to the withdrawable bonus balance
      const bonus = parts ? Number(parts.bonus) || 0 : amount;
      const task = parts ? Number(parts.task) || 0 : 0;
      const capital = parts ? Number(parts.capital) || 0 : 0;

      wallet.yieldBalance = round2(wallet.yieldBalance + bonus);
      wallet.taskBalance = round2(wallet.taskBalance + task);

      if (capital > 0) {
        const snap = Array.isArray(req.investmentsSnapshot) ? req.investmentsSnapshot : [];
        if (snap.length) {
          // Resume each plan's 24h countdown from where it was when the withdrawal was requested
          snap.forEach(s => investments.push({
            id: s.id,
            plan: s.plan,
            amount: s.amount,
            startedAt: s.startedAt,
            lastCreditAt: Date.now() + (s.msToNext || 0) - DAY_MS,
            totalPaid: s.totalPaid || 0
          }));
        } else {
          investments.push({ id: 'INV-restored-' + req.id, plan: 'Restored Investment', amount: capital, startedAt: Date.now(), lastCreditAt: Date.now(), totalPaid: 0 });
        }
        saveInvestments();
      }

      req.refunded = true;
      const h = history.find(x => x.id === req.id);
      if (h) h.refunded = true;
      addTransaction({ type: 'refund', title: `Withdrawal #${req.id} rejected, money returned`, amount: amount });
      totalRefunded += amount;
      refundedIds.push(req.id);
    });

    if (refundedIds.length) {
      localStorage.setItem('fc_admin_withdrawal_requests', JSON.stringify(adminReqs));
      localStorage.setItem('fc_withdrawals_history', JSON.stringify(history));
      syncUI();
      showToast(`Withdrawal rejected. ${formatNaira(totalRefunded)} has been returned to your dashboard.`);
    }
  }

  let txFilter = 'all';
  const TX_META = {
    invest:   { icon: '📈', group: 'invest',   color: '#60a5fa', sign: '' },
    bonus:    { icon: '🎁', group: 'earn',     color: '#10b981', sign: '+' },
    task:     { icon: '🎬', group: 'earn',     color: '#10b981', sign: '+' },
    mining:   { icon: '⛏️', group: 'earn',     color: '#10b981', sign: '+' },
    withdraw: { icon: '💸', group: 'withdraw', color: '#ef4444', sign: '-' },
    refund:   { icon: '↩️', group: 'withdraw', color: '#10b981', sign: '+' }
  };

  function renderTransactions() {
    const el = document.getElementById('txList');
    if (!el) return;
    let list = loadJSON('fc_transactions', []).sort((a, b) => b.at - a.at);
    if (txFilter !== 'all') list = list.filter(t => (TX_META[t.type] || {}).group === txFilter);
    el.innerHTML = '';
    if (list.length === 0) {
      el.innerHTML = '<li class="history-empty muted">No transactions yet.</li>';
      return;
    }
    list.slice(0, 100).forEach(t => {
      const meta = TX_META[t.type] || { icon: '•', color: 'inherit', sign: '' };
      let statusHtml = '';
      if (t.type === 'withdraw') {
        const status = resolveWithdrawStatus(t.wid);
        const c = status === 'Approved' ? '#10b981' : status === 'Rejected' ? '#ef4444' : '#f59e0b';
        statusHtml = ` • <span style="color:${c}; font-weight:600;">${status}</span>`;
      }
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
        <div>
          <strong>${meta.icon} ${t.title}</strong>
          <small>${new Date(t.at).toLocaleString()}${statusHtml}</small>
        </div>
        <span class="earned-amount" style="color:${meta.color};">${meta.sign}${formatNaira(t.amount)}</span>
      `;
      el.appendChild(li);
    });
  }

  document.querySelectorAll('.tx-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      txFilter = chip.dataset.filter;
      document.querySelectorAll('.tx-chip').forEach(c => c.classList.toggle('active', c === chip));
      renderTransactions();
    });
  });

  function saveInvestments() {
    localStorage.setItem('fc_investments', JSON.stringify(investments));
  }

  function recalcCapital() {
    wallet.activeCapital = investments.reduce((sum, inv) => sum + inv.amount, 0);
  }

  function formatCountdown(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  // Credits every 24h period that has passed (also catches up days missed while the user was away)
  function accrueYield() {
    const now = Date.now();
    const log = [];
    let credited = 0;

    investments.forEach(inv => {
      const periods = Math.floor((now - inv.lastCreditAt) / DAY_MS);
      if (periods <= 0) return;
      const perDay = round2(inv.amount * CONFIG.DAILY_YIELD_RATE);
      for (let p = 1; p <= periods; p++) {
        log.push({ plan: inv.plan, amount: perDay, at: inv.lastCreditAt + p * DAY_MS });
      }
      inv.lastCreditAt += periods * DAY_MS;
      inv.totalPaid = round2((inv.totalPaid || 0) + perDay * periods);
      credited += perDay * periods;
    });

    if (credited > 0) {
      credited = round2(credited);
      wallet.yieldBalance = round2(wallet.yieldBalance + credited);
      wallet.totalYieldEarned = round2(wallet.totalYieldEarned + credited);
      log.forEach(entry => addTransaction({ type: 'bonus', title: `Daily earning • ${entry.plan}`, amount: entry.amount, at: entry.at }));
      saveInvestments();
      log.sort((a, b) => b.at - a.at);
      const history = loadJSON('fc_yield_history', []);
      localStorage.setItem('fc_yield_history', JSON.stringify(log.concat(history).slice(0, YIELD_HISTORY_LIMIT)));
    }
    return { credited, count: log.length };
  }

  function renderRewardPanel() {
    const perDayTotal = investments.reduce((sum, inv) => sum + inv.amount * CONFIG.DAILY_YIELD_RATE, 0);
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText('rewardTotalEarned', formatNaira(wallet.totalYieldEarned));
    setText('rewardPerDay', formatNaira(perDayTotal));

    // Active plans
    const plansList = document.getElementById('activePlansList');
    if (plansList) {
      plansList.innerHTML = '';
      if (investments.length === 0) {
        plansList.innerHTML = '<li class="history-empty muted">You have no active investment yet.</li>';
      } else {
        investments.forEach(inv => {
          const li = document.createElement('li');
          li.className = 'history-item';
          const nextAt = inv.lastCreditAt + DAY_MS;
          li.innerHTML = `
            <div>
              <strong>${inv.plan} • ${formatNaira(inv.amount)}</strong>
              <small>Next reward in <span class="plan-next" data-next-at="${nextAt}">--:--:--</span> • Earned so far ${formatNaira(inv.totalPaid || 0)}</small>
            </div>
            <span class="earned-amount" style="color:#10b981;">+${formatNaira(inv.amount * CONFIG.DAILY_YIELD_RATE)}/day</span>
          `;
          plansList.appendChild(li);
        });
      }
    }

    // Reward history
    const historyEl = document.getElementById('yieldHistoryList');
    if (historyEl) {
      const history = loadJSON('fc_yield_history', []);
      historyEl.innerHTML = '';
      if (history.length === 0) {
        historyEl.innerHTML = '<li class="history-empty muted">No rewards received yet. Your first reward arrives 24 hours after you invest.</li>';
      } else {
        history.forEach(item => {
          const li = document.createElement('li');
          li.className = 'history-item';
          li.innerHTML = `
            <div>
              <strong>🎁 Daily reward • ${item.plan}</strong>
              <small>${new Date(item.at).toLocaleString()}</small>
            </div>
            <span class="earned-amount" style="color:#10b981;">+${formatNaira(item.amount)}</span>
          `;
          historyEl.appendChild(li);
        });
      }
    }
    updateRewardCountdowns();
  }

  function updateRewardCountdowns() {
    const now = Date.now();
    document.querySelectorAll('[data-next-at]').forEach(el => {
      el.textContent = formatCountdown(parseInt(el.dataset.nextAt) - now);
    });

    const countdownEl = document.getElementById('rewardCountdown');
    const amountEl = document.getElementById('nextRewardAmount');
    const barEl = document.getElementById('rewardProgressBar');
    const pillEl = document.getElementById('rewardStatusPill');
    const subEl = document.getElementById('rewardSubtext');
    const hintEl = document.getElementById('yieldNextHint');

    if (investments.length === 0) {
      if (countdownEl) countdownEl.textContent = '--:--:--';
      if (amountEl) amountEl.textContent = formatNaira(0);
      if (barEl) barEl.style.width = '0%';
      if (pillEl) { pillEl.textContent = 'No active plan'; pillEl.classList.remove('active'); }
      if (subEl) subEl.textContent = 'Invest in a plan below and receive 4.5% of your capital automatically every 24 hours.';
      if (hintEl) hintEl.textContent = '4.5% daily earnings';
      return;
    }

    const soonest = Math.min(...investments.map(inv => inv.lastCreditAt + DAY_MS));
    const dueTogether = investments.filter(inv => inv.lastCreditAt + DAY_MS - soonest < 60000);
    const nextAmount = dueTogether.reduce((sum, inv) => sum + inv.amount * CONFIG.DAILY_YIELD_RATE, 0);
    const remaining = Math.max(0, soonest - now);
    const progress = Math.min(100, Math.max(0, 100 - (remaining / DAY_MS) * 100));

    if (countdownEl) countdownEl.textContent = formatCountdown(remaining);
    if (amountEl) amountEl.textContent = '+' + formatNaira(nextAmount);
    if (barEl) barEl.style.width = progress.toFixed(2) + '%';
    if (pillEl) { pillEl.textContent = 'Earning daily'; pillEl.classList.add('active'); }
    if (subEl) subEl.textContent = 'Your reward is added to your balance automatically. Nothing to claim.';
    if (hintEl) hintEl.textContent = `Next reward in ${formatCountdown(remaining)}`;
  }

  function tickRewards() {
    const result = accrueYield();
    if (result.credited > 0) {
      syncUI();
      if (window.confetti) confetti();
      showToast(`🎁 Daily reward received: +${formatNaira(result.credited)}`);
    }
    updateRewardCountdowns();
  }

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
  const balanceBonus = document.getElementById('balanceBonus');
  const wdCapital = document.getElementById('wdCapital');
  const wdBonus = document.getElementById('wdBonus');
  const wdTask = document.getElementById('wdTask');
  const wdTotal = document.getElementById('wdTotal');
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
        balance: wallet.yieldBalance + wallet.taskBalance,
        capital: wallet.activeCapital
      });
      localStorage.setItem('fc_registered_users', JSON.stringify(users));
    }
  }

  function updateUserStatsInDirectory() {
    let users = JSON.parse(localStorage.getItem('fc_registered_users') || '[]');
    const index = users.findIndex(u => u.email === savedEmail);
    if (index !== -1) {
      users[index].balance = wallet.yieldBalance + wallet.taskBalance;
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
      const status = resolveWithdrawStatus(item.id, item.status);
      const statusColor = status === 'Approved' ? '#10b981' : status === 'Rejected' ? '#ef4444' : '#f59e0b';
      
      li.innerHTML = `
        <div>
          <strong>${item.typeLabel || "Withdrawal"} • ${item.bankName} (${item.accountNumber})</strong>
          <small>${item.date} • Status: <span style="color:${statusColor}; font-weight:600;">${status}</span>${status === "Rejected" ? " • money returned to your balance" : ""}</small>
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

  function syncUI() {
    recalcCapital();
    const setText = (el, value) => { if (el) el.textContent = value; };
    const totalValue = wallet.activeCapital + wallet.yieldBalance + wallet.taskBalance;
    const lifetimeEarned = wallet.totalYieldEarned + wallet.miningEarnings + wallet.taskEarnings;
    const taskLocked = wallet.taskBalance < CONFIG.TASK_MIN_WITHDRAW;

    setText(totalCoins, formatNaira(totalValue));
    setText(balanceInvested, formatNaira(wallet.activeCapital));
    setText(balanceBonus, formatNaira(wallet.yieldBalance));
    setText(balanceTask, formatNaira(wallet.taskBalance));
    setText(balanceYield, formatNaira(lifetimeEarned));
    setText(activeInvestments, formatNaira(wallet.activeCapital));
    setText(dailyYieldDisplay, `+${formatNaira(wallet.activeCapital * CONFIG.DAILY_YIELD_RATE)} / day`);

    setText(wdCapital, formatNaira(wallet.activeCapital));
    setText(wdBonus, formatNaira(wallet.yieldBalance));
    setText(wdTask, formatNaira(wallet.taskBalance));
    setText(wdTotal, formatNaira(totalValue));

    if (taskLocked) {
      const remaining = CONFIG.TASK_MIN_WITHDRAW - wallet.taskBalance;
      setText(taskMinNotice, `Locked until ${formatNaira(CONFIG.TASK_MIN_WITHDRAW)}. Need ${formatNaira(remaining)} more.`);
      if (taskMinNotice) taskMinNotice.style.color = '#f59e0b';
      setText(withdrawThresholdHint, `Locked until ${formatNaira(CONFIG.TASK_MIN_WITHDRAW)} (need ${formatNaira(remaining)} more)`);
      if (withdrawThresholdHint) withdrawThresholdHint.style.color = '#f59e0b';
    } else {
      setText(taskMinNotice, 'Unlocked & withdrawable!');
      if (taskMinNotice) taskMinNotice.style.color = '#10b981';
      setText(withdrawThresholdHint, 'Unlocked & withdrawable');
      if (withdrawThresholdHint) withdrawThresholdHint.style.color = '#10b981';
    }

    localStorage.setItem('fc_yield_balance', wallet.yieldBalance);
    localStorage.setItem('fc_task_balance', wallet.taskBalance);
    localStorage.setItem('fc_balance', wallet.yieldBalance + wallet.taskBalance);
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
    renderRewardPanel();
    renderTransactions();
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
    wallet.taskBalance += reward;
    wallet.miningEarnings += reward;
    addTransaction({ type: 'mining', title: 'Mining reward', amount: reward });
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
      wallet.taskBalance += reward;
      wallet.taskEarnings += reward;
      addTransaction({ type: 'task', title: `${currentConfig.name} task reward`, amount: reward });
      localStorage.setItem(`fc_last_task_${platform}`, Date.now());
      input.value = '';
      syncUI();
      if (window.confetti) confetti();
      
      showToast(`${currentConfig.name} daily task complete! +${formatNaira(reward)} added.`);
    });
  });

  // ==========================================
  // FLUTTERWAVE PAYMENT GATEWAY INTEGRATION
  // ==========================================
  document.querySelectorAll('.invest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const planName = btn.dataset.plan;
      const amount = parseFloat(btn.dataset.amount);

      if (!amount || isNaN(amount)) {
        showToast('Invalid package amount selected.');
        return;
      }

      if (typeof FlutterwaveCheckout !== 'function') {
        showToast('Payment system is loading, please try again in a moment.');
        return;
      }

      FlutterwaveCheckout({
        public_key: CONFIG.FLUTTERWAVE_PUBLIC_KEY,
        tx_ref: 'FC-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
        amount: amount,
        currency: 'NGN',
        payment_options: 'card, banktransfer, ussd',
        customer: {
          email: savedEmail,
          name: savedName,
        },
        customizations: {
          title: 'FeedCoin Investment',
          description: `Deposit for ${planName} (${formatNaira(amount)})`,
          logo: 'logo.jpg',
        },
        callback: function (response) {
          if (response.status === 'successful' || response.status === 'completed') {
            const now = Date.now();
            investments.push({
              id: 'INV-' + now,
              plan: planName,
              amount: amount,
              startedAt: now,
              lastCreditAt: now,
              totalPaid: 0
            });
            saveInvestments();
            addTransaction({ type: 'invest', title: `Investment • ${planName}`, amount: amount });
            syncUI();
            if (window.confetti) confetti();
            showToast(`Payment successful! ${planName} is active. Your first daily reward arrives in 24 hours.`);
          } else {
            showToast('Transaction was not completed. Please try again.');
          }
        },
        onclose: function () {
          showToast('Payment window closed.');
        }
      });
    });
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
      savedAccountDisplay.textContent = `${bank.bankName} • ${bank.accountNumber} (${bank.accountHolder})`;
    }
    if (profileBankDetails) {
      if (bank) {
        profileBankDetails.innerHTML = `<strong>${bank.bankName}</strong><br/>Account Number: ${bank.accountNumber}<br/>Holder: ${bank.accountHolder}`;
      } else {
        profileBankDetails.textContent = 'No bank account linked yet.';
      }
    }
  }

  // ==========================================
  // WITHDRAWALS: Investment Bonus / Task Reward / Withdraw All
  // Bank details are asked for ONCE. After that only an amount (or a confirmation) is needed.
  // ==========================================
  const MIN_WITHDRAW = 500;
  const WITHDRAW_LABELS = { all: 'Withdraw All', bonus: 'Investment Bonus', task: 'Task Reward' };
  const withdrawBonusBtn = document.getElementById('withdrawBonusBtn');
  const withdrawTaskBtn = document.getElementById('withdrawTaskBtn');
  const withdrawModalTitle = document.getElementById('withdrawModalTitle');
  const modalAvailableLabel = document.getElementById('modalAvailableLabel');
  const withdrawAllModal = document.getElementById('withdrawAllModal');
  const withdrawAllSummary = document.getElementById('withdrawAllSummary');
  const withdrawAllWarning = document.getElementById('withdrawAllWarning');
  let pendingAfterBank = null;
  let currentWithdrawType = 'bonus';

  const taskUnlocked = () => wallet.taskBalance >= CONFIG.TASK_MIN_WITHDRAW;

  function requireBank(next) {
    if (getSavedBank()) { next(); return; }
    pendingAfterBank = next;
    showToast('Add your bank account once. You will not be asked again.');
    bankForm?.reset();
    bankModal?.classList.remove('hidden');
  }

  function getWithdrawAllBreakdown() {
    const capital = wallet.activeCapital;
    const bonus = wallet.yieldBalance;
    const task = taskUnlocked() ? wallet.taskBalance : 0;
    return { capital, bonus, task, total: round2(capital + bonus + task) };
  }

  function openAmountModal(type) {
    if (type === 'task' && !taskUnlocked()) {
      showToast(`Task rewards unlock at ${formatNaira(CONFIG.TASK_MIN_WITHDRAW)}. You currently have ${formatNaira(wallet.taskBalance)}.`);
      return;
    }
    const available = type === 'bonus' ? wallet.yieldBalance : wallet.taskBalance;
    if (available < MIN_WITHDRAW) {
      showToast(`Minimum withdrawal is ${formatNaira(MIN_WITHDRAW)}. You currently have ${formatNaira(available)}.`);
      return;
    }
    currentWithdrawType = type;
    const bank = getSavedBank();
    if (withdrawModalTitle) withdrawModalTitle.textContent = type === 'bonus' ? 'Withdraw Investment Bonus' : 'Withdraw Task Reward';
    if (modalAvailableLabel) modalAvailableLabel.textContent = type === 'bonus' ? 'Available Investment Bonus' : 'Available Task Reward';
    if (modalAvailableBal) modalAvailableBal.value = formatNaira(available);
    const payingTo = document.getElementById('withdrawToLine');
    if (payingTo && bank) payingTo.value = `${bank.bankName} • ${bank.accountNumber} (${bank.accountHolder})`;
    if (withdrawAmountInput) {
      withdrawAmountInput.max = available;
      withdrawAmountInput.value = '';
    }
    withdrawAmountModal?.classList.remove('hidden');
  }

  function openWithdrawAllModal() {
    const b = getWithdrawAllBreakdown();
    if (b.total < MIN_WITHDRAW) {
      showToast(`Minimum withdrawal is ${formatNaira(MIN_WITHDRAW)}. You currently have ${formatNaira(b.total)}.`);
      return;
    }
    const row = (label, value, note) => `
      <li class="history-item">
        <div><strong>${label}</strong>${note ? `<small>${note}</small>` : ''}</div>
        <span class="earned-amount">${formatNaira(value)}</span>
      </li>`;
    let rows = row('Invested capital', b.capital) + row('Investment bonus', b.bonus);
    if (taskUnlocked()) {
      rows += row('Task & mining rewards', b.task);
    } else if (wallet.taskBalance > 0) {
      rows += row('Task & mining rewards', 0, `${formatNaira(wallet.taskBalance)} stays locked until ${formatNaira(CONFIG.TASK_MIN_WITHDRAW)}`);
    }
    rows += row('Total to withdraw', b.total);
    if (withdrawAllSummary) withdrawAllSummary.innerHTML = rows;
    if (withdrawAllWarning) withdrawAllWarning.style.display = b.capital > 0 ? 'block' : 'none';
    withdrawAllModal?.classList.remove('hidden');
  }

  function submitWithdrawal(type, amount, parts) {
    const bank = getSavedBank();
    if (!bank) {
      showToast('Please add your bank account first.');
      bankModal?.classList.remove('hidden');
      return;
    }
    const kycData = loadJSON('fc_kyc_data', null);

    wallet.yieldBalance = Math.max(0, round2(wallet.yieldBalance - parts.bonus));
    wallet.taskBalance = Math.max(0, round2(wallet.taskBalance - parts.task));
    let snapshot = [];
    if (type === 'all') {
      snapshot = investments.map(inv => Object.assign({}, inv, { msToNext: Math.max(0, inv.lastCreditAt + DAY_MS - Date.now()) }));
      investments = [];
      saveInvestments();
    }

    const record = {
      id: 'WD-' + Date.now().toString().slice(-6),
      userName: savedName,
      userEmail: savedEmail,
      amount: amount,
      type: type,
      typeLabel: WITHDRAW_LABELS[type],
      breakdown: parts,
      investmentsSnapshot: snapshot,
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      accountHolder: bank.accountHolder,
      date: new Date().toLocaleString(),
      status: 'Pending',
      isKycVerified: !!(kycData && kycData.isVerified)
    };

    saveWithdrawalRecord(record);
    const adminRequests = loadJSON('fc_admin_withdrawal_requests', []);
    adminRequests.unshift(record);
    localStorage.setItem('fc_admin_withdrawal_requests', JSON.stringify(adminRequests));
    addTransaction({ type: 'withdraw', title: `Withdrawal • ${WITHDRAW_LABELS[type]}`, amount: amount, wid: record.id });

    withdrawAmountModal?.classList.add('hidden');
    withdrawAllModal?.classList.add('hidden');
    syncUI();

    showToast(type === 'all'
      ? 'Withdrawal submitted. Your investment plans have ended. Payment comes as soon as admin approves.'
      : 'Withdrawal submitted to admin! You will receive your payment as soon as admin approves it.');
  }

  withdrawBonusBtn?.addEventListener('click', () => requireBank(() => openAmountModal('bonus')));
  withdrawTaskBtn?.addEventListener('click', () => requireBank(() => openAmountModal('task')));
  withdrawAllBtn?.addEventListener('click', () => {
    const b = getWithdrawAllBreakdown();
    if (b.total < MIN_WITHDRAW) {
      showToast(`Minimum withdrawal is ${formatNaira(MIN_WITHDRAW)}. You currently have ${formatNaira(b.total)}.`);
      return;
    }
    requireBank(openWithdrawAllModal);
  });

  document.getElementById('confirmWithdrawAll')?.addEventListener('click', () => {
    const b = getWithdrawAllBreakdown();
    if (b.total < MIN_WITHDRAW) {
      showToast(`Minimum withdrawal is ${formatNaira(MIN_WITHDRAW)}.`);
      return;
    }
    submitWithdrawal('all', b.total, b);
  });
  document.getElementById('cancelWithdrawAll')?.addEventListener('click', () => withdrawAllModal?.classList.add('hidden'));
  document.getElementById('closeWithdrawAllModal')?.addEventListener('click', () => withdrawAllModal?.classList.add('hidden'));
  closeWithdrawModal?.addEventListener('click', () => withdrawAmountModal?.classList.add('hidden'));

  withdrawAmountForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = currentWithdrawType;
    const available = type === 'bonus' ? wallet.yieldBalance : wallet.taskBalance;
    const amount = round2(parseFloat(withdrawAmountInput.value));

    if (!amount || isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid amount.');
      return;
    }
    if (amount < MIN_WITHDRAW) {
      showToast(`Minimum withdrawal is ${formatNaira(MIN_WITHDRAW)}.`);
      return;
    }
    if (amount > available) {
      showToast(`Amount exceeds your available balance of ${formatNaira(available)}`);
      return;
    }
    submitWithdrawal(type, amount, {
      capital: 0,
      bonus: type === 'bonus' ? amount : 0,
      task: type === 'task' ? amount : 0
    });
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

  closeBankModal?.addEventListener('click', () => {
    pendingAfterBank = null;
    bankModal?.classList.add('hidden');
  });

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
    if (pendingAfterBank) {
      const next = pendingAfterBank;
      pendingAfterBank = null;
      showToast('Bank details saved!');
      next();
    } else {
      showToast('Bank details saved!');
    }
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

  processRefunds();
  syncUI();
  tickRewards();
  window.addEventListener('storage', (e) => {
    if (!e.key || e.key === 'fc_admin_withdrawal_requests') processRefunds();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) processRefunds(); });
  setInterval(tickRewards, 1000);
});