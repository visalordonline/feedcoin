// Toast
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

// Notification
document.getElementById('notifBtn')?.addEventListener('click', () => {
  showToast('No new notifications');
});

// Task cards
document.querySelectorAll('.task-card').forEach(card => {
  card.addEventListener('click', () => {
    const action = card.dataset.action;
    const messages = {
      bonus: 'Feed Bonus claimed! +$5.00',
      games: 'Opening Games...',
      ads: 'Loading Ads...'
    };
    showToast(messages[action] || 'Task started');
  });
});

// Install buttons
document.querySelectorAll('.offer-item .btn').forEach(btn => {
  btn.addEventListener('click', () => {
    showToast(`Installing ${btn.dataset.app}...`);
  });
});

// Set active nav based on current page
const currentPage = window.location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-item').forEach(item => {
  const href = item.getAttribute('href');
  if (href === currentPage || (currentPage === '' && href === 'index.html')) {
    item.classList.add('active');
  } else {
    item.classList.remove('active');
  }
});