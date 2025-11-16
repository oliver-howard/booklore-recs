// API base URL
const API_BASE = '/api';

// Track authentication state
let isAuthenticated = false;
let hasReadingHistory = false;
let hasBookLore = false;
let hasGoodreads = false;
let notificationTimeout;
let tbrCache = [];
let authMode = 'login';

function clearAppState() {
  const resultAreas = [
    'similar-results',
    'contrasting-results',
    'blindspots-results',
    'custom-results',
    'stats-results',
    'tbr-results',
  ];

  resultAreas.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = '';
    }
  });

  const loadingElement = document.getElementById('loading');
  loadingElement?.classList.add('hidden');

  const errorElement = document.getElementById('error');
  errorElement?.classList.add('hidden');

  const notificationElement = document.getElementById('notification');
  notificationElement?.classList.add('hidden');

  tbrCache = [];
  updateHeroPreviewCard();
}

// Check authentication status
async function checkAuthStatus() {
  try {
    const response = await fetch(`${API_BASE}/auth/status`);
    const data = await response.json();

    if (data.authenticated) {
      const isNewlyAuthenticated = !isAuthenticated;
      isAuthenticated = true;
      hasReadingHistory = data.hasReadingHistory || false;
      hasBookLore = data.hasBookLore || false;
      hasGoodreads = data.hasGoodreads || false;
      hideLoginModal();

      showUserInfo(data.username);
      updateUIForMode();
      updateSettingsUI(data);

      if (isNewlyAuthenticated) {
        loadTBR();
      }
    } else {
      isAuthenticated = false;
      hasReadingHistory = false;
      hasBookLore = false;
      hasGoodreads = false;
      clearAppState();
      showLoginModal();
    }
  } catch (error) {
    console.error('Error checking auth status:', error);
    showLoginModal();
  }
}

// Update UI based on available data sources
function updateUIForMode() {
  // Tabs that require reading history (BookLore or Goodreads CSV)
  const historyRequiredTabs = ['similar', 'contrasting', 'blindspots', 'stats'];

  historyRequiredTabs.forEach(tab => {
    const button = document.querySelector(`[data-tab="${tab}"]`);
    if (button) {
      if (hasReadingHistory) {
        button.disabled = false;
        button.title = '';
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
      } else {
        button.disabled = true;
        button.title = 'Configure a data source in Settings to access this feature';
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
      }
    }
  });

  // If on a restricted tab without proper access, switch to custom tab
  const activeTab = document.querySelector('.tab-button.active');
  if (activeTab) {
    const tabName = activeTab.dataset.tab;
    const needsHistory = historyRequiredTabs.includes(tabName);

    if (needsHistory && !hasReadingHistory) {
      switchTab('custom');
    }
  }

  const statsHeaderBtn = document.getElementById('stats-header-btn');
  if (statsHeaderBtn) {
    if (hasReadingHistory) {
      statsHeaderBtn.disabled = false;
      statsHeaderBtn.title = '';
      statsHeaderBtn.style.opacity = '1';
      statsHeaderBtn.style.cursor = 'pointer';
    } else {
      statsHeaderBtn.disabled = true;
      statsHeaderBtn.title = 'Connect a data source in Settings to view statistics';
      statsHeaderBtn.style.opacity = '0.5';
      statsHeaderBtn.style.cursor = 'not-allowed';
    }
  }
}

// Update settings UI based on current configuration
function updateSettingsUI(data) {
  // Update BookLore status
  const bookloreStatus = document.getElementById('booklore-status-text');
  if (data.hasBookLore) {
    bookloreStatus.textContent = '✓ Connected';
    bookloreStatus.style.color = 'var(--success-color, #22c55e)';
  } else {
    bookloreStatus.textContent = 'Not connected';
    bookloreStatus.style.color = 'var(--text-secondary)';
  }

  // Update Goodreads status
  const goodreadsStatus = document.getElementById('goodreads-status-text');
  if (data.hasGoodreads) {
    goodreadsStatus.textContent = `✓ ${data.booksCount} books imported`;
    goodreadsStatus.style.color = 'var(--success-color, #22c55e)';
  } else {
    goodreadsStatus.textContent = 'No data uploaded';
    goodreadsStatus.style.color = 'var(--text-secondary)';
  }
}

// Show/hide login modal
function showLoginModal() {
  setAuthMode('login');
  document.getElementById('login-modal').style.display = 'flex';
}

function hideLoginModal() {
  document.getElementById('login-modal').style.display = 'none';
}

// Show user info
function showUserInfo(username) {
  document.getElementById('username-display').textContent = username;
  document.getElementById('user-info').classList.remove('hidden');
}

function setAuthMode(mode) {
  authMode = mode;
  const modeInput = document.getElementById('auth-mode');
  const subtitle = document.getElementById('auth-modal-subtitle');
  const submitButton = document.getElementById('auth-submit-btn');
  const toggleMessage = document.getElementById('auth-toggle-message');
  const toggleButton = document.getElementById('auth-toggle-button');
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const errorElement = document.getElementById('auth-error');

  if (!modeInput || !subtitle || !submitButton || !toggleMessage || !toggleButton || !usernameInput || !passwordInput) {
    return;
  }

  modeInput.value = mode;
  errorElement?.classList.add('hidden');

  if (mode === 'login') {
    subtitle.textContent = 'Log in to your account';
    submitButton.textContent = 'Log In';
    toggleMessage.textContent = 'Need an account?';
    toggleButton.textContent = 'Create one';
    usernameInput.placeholder = 'Enter your username';
    passwordInput.placeholder = 'Enter your password';
    passwordInput.setAttribute('minlength', '1');
  } else {
    subtitle.textContent = 'Create a new account';
    submitButton.textContent = 'Create Account';
    toggleMessage.textContent = 'Already have an account?';
    toggleButton.textContent = 'Log in';
    usernameInput.placeholder = 'Choose a username';
    passwordInput.placeholder = 'Choose a password (min 6 characters)';
    passwordInput.setAttribute('minlength', '6');
  }
}

function toggleAuthMode() {
  setAuthMode(authMode === 'login' ? 'register' : 'login');
}

// Handle authentication (login or register)
async function handleAuth(event) {
  event.preventDefault();

  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const action = document.getElementById('auth-mode').value || 'login';

  const errorElement = document.getElementById('auth-error');
  errorElement.classList.add('hidden');

  try {
    const response = await fetch(`${API_BASE}/auth/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (data.success) {
      await checkAuthStatus();
    } else {
      errorElement.textContent = data.message || `${action === 'login' ? 'Login' : 'Registration'} failed`;
      errorElement.classList.remove('hidden');
    }
  } catch (error) {
    console.error(`${action} error:`, error);
    errorElement.textContent = `Failed to ${action}. Please try again.`;
    errorElement.classList.remove('hidden');
  }
}

// Settings functions
function showSettings() {
  switchTab('settings');
}

function showStats() {
  if (!hasReadingHistory) {
    showError('Connect BookLore or upload a Goodreads CSV to view statistics.');
    return;
  }
  switchTab('stats');
  getStats();
}

function goToSimilarRecommendations() {
  switchTab('similar');
  getSimilarRecommendations();
}

async function saveBookLoreCredentials(event) {
  event.preventDefault();

  const username = document.getElementById('booklore-username').value.trim();
  const password = document.getElementById('booklore-password').value;

  if (!username || !password) {
    alert('Please enter both username and password');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/settings/booklore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (data.success) {
      alert('BookLore credentials saved successfully!');
      // Clear the form
      document.getElementById('booklore-form').reset();
      // Refresh auth status to update UI
      await checkAuthStatus();
    } else {
      alert(data.message || 'Failed to save credentials');
    }
  } catch (error) {
    console.error('Error saving BookLore credentials:', error);
    alert('Failed to save credentials. Please try again.');
  }
}

async function removeBookLoreCredentials() {
  if (!confirm('Remove BookLore connection? This will not delete your reading history.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/settings/booklore`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (data.success) {
      alert('BookLore connection removed');
      await checkAuthStatus();
    } else {
      alert(data.message || 'Failed to remove connection');
    }
  } catch (error) {
    console.error('Error removing BookLore credentials:', error);
    alert('Failed to remove connection. Please try again.');
  }
}

async function uploadGoodreadsCSV() {
  const fileInput = document.getElementById('settings-csv-input');
  const file = fileInput.files[0];
  const errorElement = document.getElementById('settings-csv-error');
  const successElement = document.getElementById('settings-csv-success');

  errorElement.classList.add('hidden');
  successElement.classList.add('hidden');

  if (!file) {
    errorElement.textContent = 'Please select a CSV file';
    errorElement.classList.remove('hidden');
    return;
  }

  try {
    const csvContent = await file.text();

    const response = await fetch(`${API_BASE}/settings/goodreads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvContent }),
    });

    const data = await response.json();

    if (data.success) {
      successElement.textContent = data.message;
      successElement.classList.remove('hidden');
      fileInput.value = ''; // Clear the file input
      // Refresh auth status to update UI
      await checkAuthStatus();
    } else {
      errorElement.textContent = data.message || 'Failed to upload CSV';
      errorElement.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error uploading CSV:', error);
    errorElement.textContent = 'Failed to upload CSV. Please try again.';
    errorElement.classList.remove('hidden');
  }
}

async function removeGoodreadsData() {
  if (!confirm('Remove Goodreads data? You can upload it again later.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/settings/goodreads`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (data.success) {
      alert('Goodreads data removed');
      await checkAuthStatus();
    } else {
      alert(data.message || 'Failed to remove data');
    }
  } catch (error) {
    console.error('Error removing Goodreads data:', error);
    alert('Failed to remove data. Please try again.');
  }
}

// Logout
async function handleLogout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    isAuthenticated = false;
    hasReadingHistory = false;
    hasBookLore = false;
    hasGoodreads = false;
    clearAppState();
    showLoginModal();
    document.getElementById('user-info').classList.add('hidden');
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// Tab switching
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  document.getElementById(`${tabName}-tab`)?.classList.add('active');

  if (tabName === 'tbr') {
    loadTBR();
  }
}

// Loading state
function showLoading(message = 'Loading recommendations...', targetResultsId) {
  const loadingElement = document.getElementById('loading');
  loadingElement.querySelector('p').textContent = message;

  if (targetResultsId) {
    const targetElement = document.getElementById(targetResultsId);
    if (targetElement && targetElement.parentElement) {
      targetElement.parentElement.insertBefore(loadingElement, targetElement);
    }
  }

  loadingElement.classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatReasoning(reasoning = '') {
  return escapeHtml(reasoning).replace(/\n/g, '<br>');
}

function buildRecommendationActions(rec) {
  const titleData = encodeURIComponent(rec.title || '');
  const authorData = encodeURIComponent(rec.author || 'Unknown');
  const reasoningData = encodeURIComponent(rec.reasoning || '');
  const amazonData = rec.amazonUrl ? encodeURIComponent(rec.amazonUrl) : '';

  return `
    <div class="recommendation-actions">
      ${rec.amazonUrl ? `
        <a href="${escapeHtml(rec.amazonUrl)}" target="_blank" class="amazon-link">
          View on Amazon →
        </a>
      ` : ''}
      <button
        class="btn btn-sm btn-secondary"
        data-title="${titleData}"
        data-author="${authorData}"
        data-reasoning="${reasoningData}"
        data-amazon-url="${amazonData}"
        onclick="addRecommendationToTBR(this)"
      >
        Add to TBR
      </button>
    </div>
  `;
}

function renderRecommendationMarkup(rec, index) {
  const safeTitle = escapeHtml(rec.title || 'Untitled');
  const safeAuthor = escapeHtml(rec.author || 'Unknown');
  const safeReasoning = formatReasoning(rec.reasoning || '');

  return `
    <li class="recommendation-item">
      <div class="recommendation-title">
        <span class="recommendation-index">${index + 1}.</span>
        <div>
          <h3>${safeTitle}</h3>
          <span class="author">by ${safeAuthor}</span>
        </div>
      </div>
      <p class="reasoning">${safeReasoning}</p>
      ${buildRecommendationActions(rec)}
    </li>
  `;
}

function addRecommendationToTBR(button) {
  const book = {
    title: decodeURIComponent(button.dataset.title || ''),
    author: decodeURIComponent(button.dataset.author || ''),
    reasoning: decodeURIComponent(button.dataset.reasoning || ''),
    amazonUrl: button.dataset.amazonUrl ? decodeURIComponent(button.dataset.amazonUrl) : undefined,
  };
  addToTBR(book);
}

// Error handling
function showError(message) {
  const errorElement = document.getElementById('error');
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');
  setTimeout(() => {
    errorElement.classList.add('hidden');
  }, 5000);
}

function showNotification(message, type = 'success') {
  const notificationElement = document.getElementById('notification');
  notificationElement.textContent = message;
  notificationElement.classList.remove('hidden');
  notificationElement.classList.remove('success', 'error');
  notificationElement.classList.add(type);

  clearTimeout(notificationTimeout);
  notificationTimeout = setTimeout(() => {
    notificationElement.classList.add('hidden');
  }, 4000);
}

// Recommendation functions
async function getSimilarRecommendations() {
  showLoading('Loading recommendations...', 'similar-results');
  try {
    const response = await fetch(`${API_BASE}/recommendations/similar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    hideLoading();

    if (data.recommendations) {
      displayRecommendations(data.recommendations, 'similar-results');
    } else {
      showError('Failed to get recommendations');
    }
  } catch (error) {
    hideLoading();
    console.error('Error getting recommendations:', error);
    showError('Failed to get recommendations. Please try again.');
  }
}

async function getContrastingRecommendations() {
  showLoading('Loading recommendations...', 'contrasting-results');
  try {
    const response = await fetch(`${API_BASE}/recommendations/contrasting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    hideLoading();

    if (data.recommendations) {
      displayRecommendations(data.recommendations, 'contrasting-results');
    } else {
      showError('Failed to get recommendations');
    }
  } catch (error) {
    hideLoading();
    console.error('Error getting recommendations:', error);
    showError('Failed to get recommendations. Please try again.');
  }
}

async function getBlindspots() {
  showLoading('Analyzing your reading patterns...', 'blindspots-results');
  try {
    const response = await fetch(`${API_BASE}/recommendations/blindspots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    hideLoading();

    if (data.analysis) {
      displayBlindSpotsAnalysis(data.analysis, 'blindspots-results');
    } else {
      showError('Failed to get analysis');
    }
  } catch (error) {
    hideLoading();
    console.error('Error getting analysis:', error);
    showError('Failed to get analysis. Please try again.');
  }
}

async function getCustomRecommendations() {
  const criteria = document.getElementById('custom-criteria').value.trim();

  if (!criteria) {
    showError('Please enter your criteria');
    return;
  }

  showLoading('Loading recommendations...', 'custom-results');
  try {
    const response = await fetch(`${API_BASE}/recommendations/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria }),
    });

    const data = await response.json();
    hideLoading();

    if (data.recommendations) {
      displayRecommendations(data.recommendations, 'custom-results');
    } else {
      showError('Failed to get recommendations');
    }
  } catch (error) {
    hideLoading();
    console.error('Error getting recommendations:', error);
    showError('Failed to get recommendations. Please try again.');
  }
}

async function getStats() {
  showLoading('Loading statistics...', 'stats-results');
  try {
    const response = await fetch(`${API_BASE}/stats`);
    const stats = await response.json();
    hideLoading();

    displayStats(stats, 'stats-results');
  } catch (error) {
    hideLoading();
    console.error('Error getting stats:', error);
    showError('Failed to load statistics. Please try again.');
  }
}

// Display functions
function displayRecommendations(recommendations, elementId) {
  const resultsElement = document.getElementById(elementId);

  if (recommendations.length === 0) {
    resultsElement.innerHTML = '<p class="no-results">No recommendations found.</p>';
    return;
  }

  let html = '<ol class="recommendations-list">';
  recommendations.forEach((rec, index) => {
    html += renderRecommendationMarkup(rec, index);
  });
  html += '</ol>';

  resultsElement.innerHTML = html;
}

function displayBlindSpotsAnalysis(analysis, elementId) {
  const resultsElement = document.getElementById(elementId);

  let html = '<div class="analysis-container">';

  // Patterns
  html += '<div class="analysis-section"><h3>Reading Patterns</h3><ul>';
  analysis.patterns.forEach(pattern => {
    html += `<li>${pattern}</li>`;
  });
  html += '</ul></div>';

  // Blind Spots
  html += '<div class="analysis-section"><h3>Blind Spots & Recommendations</h3>';
  analysis.blindSpots.forEach((blindSpot, index) => {
    html += `
      <div class="blind-spot-card">
        <h4>${index + 1}. ${blindSpot.category}</h4>
        <p>${blindSpot.description}</p>
        <div class="blind-spot-recommendations">
          <h5>Recommended books:</h5>
    `;

    html += '<ol class="recommendations-list nested">';
    blindSpot.recommendations.forEach((rec, recIndex) => {
      html += renderRecommendationMarkup(rec, recIndex);
    });
    html += '</ol>';

    html += '</div></div>';
  });
  html += '</div>';

  // Suggested Topics
  html += '<div class="analysis-section"><h3>Suggested Topics to Explore</h3><ul>';
  analysis.suggestedTopics.forEach(topic => {
    html += `<li>${topic}</li>`;
  });
  html += '</ul></div>';

  html += '</div>';
  resultsElement.innerHTML = html;
}

function displayStats(stats, elementId) {
  const resultsElement = document.getElementById(elementId);

  let html = '<div class="stats-container">';

  html += `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalBooksRead}</div>
        <div class="stat-label">Books Read</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.booksRated}</div>
        <div class="stat-label">Books Rated</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.averageRating.toFixed(1)}/10</div>
        <div class="stat-label">Average Rating</div>
      </div>
    </div>
  `;

  if (stats.topGenres && stats.topGenres.length > 0) {
    html += '<div class="list-section"><h3>Top Genres</h3><ul>';
    stats.topGenres.forEach(genre => {
      html += `<li>${genre}</li>`;
    });
    html += '</ul></div>';
  }

  if (stats.topAuthors && stats.topAuthors.length > 0) {
    html += '<div class="list-section"><h3>Top Authors</h3><ul>';
    stats.topAuthors.forEach(author => {
      html += `<li>${author}</li>`;
    });
    html += '</ul></div>';
  }

  html += '</div>';
  resultsElement.innerHTML = html;
}

// TBR functions
async function loadTBR() {
  showLoading('Loading your TBR list...', 'tbr-results');
  try {
    const response = await fetch(`${API_BASE}/tbr`);
    const data = await response.json();
    hideLoading();

    if (data.tbr) {
      tbrCache = data.tbr;
      displayTBR(data.tbr, 'tbr-results');
      updateHeroPreviewCard();
    } else {
      tbrCache = [];
      updateHeroPreviewCard();
      showError('Failed to load TBR list');
    }
  } catch (error) {
    hideLoading();
    console.error('Error loading TBR:', error);
    showError('Failed to load TBR list. Please try again.');
  }
}

async function addToTBR(book) {
  try {
    const response = await fetch(`${API_BASE}/tbr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: book.title,
        author: book.author,
        reasoning: book.reasoning,
        amazonUrl: book.amazonUrl,
      }),
    });

    const data = await response.json();

    if (data.success) {
      showNotification(`Added "${book.title}" to your TBR list!`, 'success');
      if (document.querySelector('[data-tab="tbr"]').classList.contains('active')) {
        loadTBR();
      } else if (data.book) {
        tbrCache = [data.book, ...tbrCache];
        updateHeroPreviewCard();
      }
    } else {
      showNotification(data.message || 'Failed to add book to TBR', 'error');
    }
  } catch (error) {
    console.error('Error adding to TBR:', error);
    showNotification('Failed to add book to TBR. Please try again.', 'error');
  }
}

async function removeFromTBR(bookId) {
  try {
    const response = await fetch(`${API_BASE}/tbr/${encodeURIComponent(bookId)}`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (data.success) {
      showNotification('Book removed from your TBR list.', 'success');
      loadTBR();
    } else {
      showNotification(data.message || 'Failed to remove book.', 'error');
    }
  } catch (error) {
    console.error('Error removing from TBR:', error);
    showNotification('Failed to remove book. Please try again.', 'error');
  }
}

async function clearTBR() {
  if (!confirm('Clear your entire TBR list? This cannot be undone.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/tbr`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (data.success) {
      showNotification('Your TBR list has been cleared.', 'success');
      loadTBR();
    } else {
      showNotification(data.message || 'Failed to clear TBR list', 'error');
    }
  } catch (error) {
    console.error('Error clearing TBR:', error);
    showNotification('Failed to clear TBR list. Please try again.', 'error');
  }
}

function displayTBR(books, elementId) {
  const resultsElement = document.getElementById(elementId);

  if (books.length === 0) {
    resultsElement.innerHTML = '<p class="no-results">Your TBR list is empty. Add books from recommendations!</p>';
    updateHeroPreviewCard();
    return;
  }

  let html = '<ol class="recommendations-list">';
  books.forEach((book, index) => {
    const safeTitle = escapeHtml(book.title || 'Untitled');
    const safeAuthor = escapeHtml(book.author || 'Unknown');
    const safeReasoning = book.reasoning ? formatReasoning(book.reasoning) : '';
    const addedDate = new Date(book.addedAt).toLocaleDateString();
    html += `
      <li class="recommendation-item">
        <div class="recommendation-title">
          <span class="recommendation-index">${index + 1}.</span>
          <div>
            <h3>${safeTitle}</h3>
            <span class="author">by ${safeAuthor}</span>
          </div>
        </div>
        ${book.reasoning ? `<p class="reasoning">${safeReasoning}</p>` : ''}
        <div class="recommendation-actions">
          ${book.amazonUrl ? `<a href="${escapeHtml(book.amazonUrl)}" target="_blank" class="amazon-link">View on Amazon →</a>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="removeFromTBR('${book.id}')">Remove</button>
        </div>
        <div class="tbr-meta">Added: ${addedDate}</div>
      </li>
    `;
  });
  html += '</ol>';

  resultsElement.innerHTML = html;
  updateHeroPreviewCard();
}

function updateHeroPreviewCard() {
  const card = document.getElementById('hero-preview-card');
  const titleEl = document.getElementById('hero-preview-title');
  const authorEl = document.getElementById('hero-preview-author');
  const reasoningEl = document.getElementById('hero-preview-reasoning');

  if (!card || !titleEl || !authorEl || !reasoningEl) {
    return;
  }

  if (!tbrCache || tbrCache.length === 0) {
    card.classList.add('hidden');
    titleEl.textContent = 'TBR is empty';
    authorEl.textContent = '';
    reasoningEl.textContent = 'Add a book to your TBR to see it featured here.';
    return;
  }

  const index = Math.floor(Math.random() * tbrCache.length);
  const topBook = tbrCache[index];
  card.classList.remove('hidden');
  titleEl.textContent = topBook.title || 'Upcoming book';
  if (topBook.amazonUrl) {
    titleEl.setAttribute('href', topBook.amazonUrl);
  } else {
    titleEl.removeAttribute('href');
  }
  authorEl.textContent = topBook.author ? `by ${topBook.author}` : '';
  reasoningEl.textContent =
    topBook.reasoning || 'Recently added to your TBR. Start reading it next!';
}

// Theme toggle
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);

  // Update icon
  const icon = document.getElementById('theme-icon');
  icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
}

// Initialize theme from localStorage
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const icon = document.getElementById('theme-icon');
  icon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAuthStatus();

  // Tab switching
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      if (!button.disabled) {
        switchTab(button.dataset.tab);
      }
    });
  });
});
