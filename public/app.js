// API base URL
const API_BASE = '/api';

// Track authentication state
let isAuthenticated = false;
let hasReadingHistory = false;
let hasBookLore = false;
let hasGoodreads = false;
let isAdmin = false;
let notificationTimeout;
let tbrCache = [];
let dataSourcePreference = 'auto';
let canToggleDataSource = false;
let adminUsers = [];

function generateClientBookId(title = '', author = '') {
  const normalized = `${title.toLowerCase()}-${author.toLowerCase()}`
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized;
}

function isInTBR(rec) {
  if (!tbrCache || tbrCache.length === 0) {
    return false;
  }
  const id = generateClientBookId(rec.title || '', rec.author || 'Unknown');
  return tbrCache.some((book) => book.id === id);
}
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
  dataSourcePreference = 'auto';
  canToggleDataSource = false;
  isAdmin = false;
  updateDataSourceToggle();
  updateHeroPreviewCard();
}

// Check authentication status
async function checkAuthStatus() {
  try {
    const response = await fetch(`${API_BASE}/auth/status?t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    const data = await response.json();

    if (data.authenticated) {
      const isNewlyAuthenticated = !isAuthenticated;
      isAuthenticated = true;
      hasReadingHistory = data.hasReadingHistory || false;
      hasBookLore = data.hasBookLore || false;
      hasGoodreads = data.hasGoodreads || false;
      isAdmin = !!data.isAdmin;
      dataSourcePreference = data.dataSourcePreference || 'auto';
      canToggleDataSource = !!data.canChooseDataSource;
      hideLoginModal();

      try {
        showUserInfo(data.username);
      } catch (e) {
        console.error('Error showing user info:', e);
      }
      
      try {
        // Page-specific initialization
        const path = window.location.pathname;
        if (path === '/settings') {
          updateSettingsUI(data);
          updateDataSourceToggle();
          loadAppVersion();
          if (isAdmin) {
            await loadAdminUsers();
          }
        } else if (path === '/stats') {
          if (hasReadingHistory) {
            getStats();
          } else {
            const statsResults = document.getElementById('stats-results');
            if (statsResults) {
              statsResults.innerHTML = 
                '<p class="error-message">Connect a data source in Settings to view statistics.</p>';
            }
          }
        } else {
          // Home page
          updateUIForMode();
          if (isNewlyAuthenticated) {
            loadTBR();
          }
        }
      } catch (uiError) {
        console.error('Error updating UI after auth:', uiError);
        // Do NOT show login modal here, as we are authenticated
      }
    } else {
      isAuthenticated = false;
      hasReadingHistory = false;
      hasBookLore = false;
      hasGoodreads = false;
      isAdmin = false;
      dataSourcePreference = 'auto';
      canToggleDataSource = false;
      clearAppState();
      // Only show login modal if we are NOT authenticated
      showLoginModal();
    }
  } catch (error) {
    console.error('Error checking auth status:', error);
    // Only show login modal on network/server errors if we weren't already authenticated
    if (!isAuthenticated) {
      showLoginModal();
    }
  }
}

// Update UI based on available data sources
function updateUIForMode() {
  // Tabs that require reading history (BookLore or Goodreads CSV)
  const historyRequiredTabs = ['similar', 'contrasting', 'blindspots'];

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

    if (needsHistory && !hasReadingHistory) {
      switchTab('custom');
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

  if (data.canChooseDataSource) {
    document.getElementById('data-source-section')?.classList.remove('hidden');
  } else {
    document.getElementById('data-source-section')?.classList.add('hidden');
  }

  if (data.isAdmin) {
    document.getElementById('admin-section')?.classList.remove('hidden');
    renderAdminUsers();
  } else {
    document.getElementById('admin-section')?.classList.add('hidden');
  }
}

// Display app version in settings
async function loadAppVersion() {
  const versionEl = document.getElementById('app-version');
  if (!versionEl) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/version`);
    if (!response.ok) {
      throw new Error(`Failed with status ${response.status}`);
    }
    const data = await response.json();
    const versionLabel = data.version ? `v${data.version}` : '';
    const name = 'BookRex';
    versionEl.textContent = versionLabel ? `${name} ${versionLabel}` : name;
  } catch (error) {
    console.error('Error loading app version:', error);
    versionEl.textContent = 'Version unavailable';
  }
}

// Show/hide login modal
function showLoginModal() {
  setAuthMode('login');
  document.getElementById('login-modal').style.display = 'flex';
}

function hideLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) {
    modal.style.display = 'none';
  }
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
      hideLoginModal();
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
function goToSimilarRecommendations() {
  switchTab('similar');
  getSimilarRecommendations();
}

function dataSourceSummaryText() {
  if (dataSourcePreference === 'booklore') {
    return 'Currently using BookLore data for recommendations.';
  }
  if (dataSourcePreference === 'goodreads') {
    return 'Currently using Goodreads data for recommendations.';
  }
  if (hasBookLore) {
    return 'Using BookLore data when available, otherwise falling back to Goodreads.';
  }
  if (hasGoodreads) {
    return 'Using your Goodreads import for recommendations.';
  }
  return 'Connect BookLore or upload Goodreads data to begin.';
}

function updateDataSourceToggle() {
  const section = document.getElementById('data-source-section');
  const summary = document.getElementById('data-source-summary');

  if (!section) {
    return;
  }

  if (!canToggleDataSource) {
    section.classList.add('hidden');
    if (summary) {
      summary.textContent = dataSourceSummaryText();
    }
    return;
  }

  section.classList.remove('hidden');
  if (summary) {
    summary.textContent = dataSourceSummaryText();
  }

  document.querySelectorAll('.toggle-option').forEach((button) => {
    const source = button.dataset.source;
    if (!source) {
      return;
    }
    button.classList.toggle(
      'active',
      source === dataSourcePreference
    );
  });
}

async function setDataSourcePreference(preference) {
  if (preference === dataSourcePreference) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/settings/data-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preference }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showNotification(data.message || 'Failed to update data source', 'error');
      return;
    }

    showNotification(data.message || 'Data source updated', 'success');
    await checkAuthStatus();
  } catch (error) {
    console.error('Error updating data source preference:', error);
    showNotification('Failed to update data source preference. Please try again.', 'error');
  }
}

async function loadAdminUsers() {
  if (!isAdmin) {
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/admin/users`);
    const data = await response.json();
    adminUsers = data.users || [];
    renderAdminUsers();
  } catch (error) {
    console.error('Error loading users:', error);
    showNotification('Failed to load user list', 'error');
  }
}

function renderAdminUsers() {
  const section = document.getElementById('admin-section');
  const list = document.getElementById('admin-users-list');

  if (!section || !list) {
    return;
  }

  if (!isAdmin) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  if (!adminUsers || adminUsers.length === 0) {
    list.innerHTML = '<p class="settings-description">No users found.</p>';
    return;
  }

  const rows = adminUsers
    .map(
      (user) => `
        <tr>
          <td>${user.username}${user.isAdmin ? ' <span class="badge">Admin</span>' : ''}</td>
          <td>${new Date(user.createdAt).toLocaleDateString()}</td>
          <td>${user.hasBookLore ? '✔︎' : '—'}</td>
          <td>${user.hasGoodreads ? '✔︎' : '—'}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="promptPasswordReset(${user.id})">Change Password</button>
            <button class="btn btn-sm btn-secondary" onclick="toggleAdmin(${user.id}, ${user.isAdmin})">
              ${user.isAdmin ? 'Remove Admin' : 'Make Admin'}
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteUserAccount(${user.id})">Delete</button>
          </td>
        </tr>
      `
    )
    .join('');

  list.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Joined</th>
          <th>BookLore</th>
          <th>Goodreads</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

async function deleteUserAccount(userId) {
  if (!confirm('Delete this user? This action cannot be undone.')) {
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
      method: 'DELETE',
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      showNotification(data.message || 'Failed to delete user', 'error');
      return;
    }
    showNotification('User deleted', 'success');
    await loadAdminUsers();
  } catch (error) {
    console.error('Error deleting user:', error);
    showNotification('Failed to delete user', 'error');
  }
}

function promptPasswordReset(userId) {
  const newPassword = prompt('Enter a new password for this user (min 6 characters):');
  if (!newPassword) {
    return;
  }
  if (newPassword.length < 6) {
    alert('Password must be at least 6 characters.');
    return;
  }
  updateUserPassword(userId, newPassword);
}

async function updateUserPassword(userId, password) {
  try {
    const response = await fetch(`${API_BASE}/admin/users/${userId}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      showNotification(data.message || 'Failed to update password', 'error');
      return;
    }
    showNotification('Password updated', 'success');
  } catch (error) {
    console.error('Error updating password:', error);
    showNotification('Failed to update password', 'error');
  }
}

async function toggleAdmin(userId, currentStatus) {
  if (
    !confirm(
      currentStatus
        ? 'Remove admin privileges from this user?'
        : 'Grant admin privileges to this user?'
    )
  ) {
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/admin/users/${userId}/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin: !currentStatus }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      showNotification(data.message || 'Failed to update role', 'error');
      return;
    }
    showNotification('Role updated', 'success');
    await loadAdminUsers();
  } catch (error) {
    console.error('Error updating role:', error);
    showNotification('Failed to update role', 'error');
  }
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

  const filtered = recommendations.filter((rec) => !isInTBR(rec));

  if (filtered.length === 0) {
    resultsElement.innerHTML =
      '<p class="no-results">All recommended books are already in your TBR list.</p>';
    return;
  }

  let html = '<ol class="recommendations-list">';
  filtered.forEach((rec, index) => {
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
  resultsElement.innerHTML = ''; // Clear previous content

  const container = document.createElement('div');
  container.className = 'stats-container';

  // Source Indicator
  const sourceDiv = document.createElement('div');
  sourceDiv.className = 'stats-source';
  sourceDiv.innerHTML = `Data source: <strong>${stats.source === 'booklore' ? 'BookLore' : 'Goodreads'}</strong>`;
  container.appendChild(sourceDiv);

  // Summary Cards
  const grid = document.createElement('div');
  grid.className = 'stats-grid';
  grid.innerHTML = `
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
  `;
  container.appendChild(grid);

  // Charts Container
  const chartsContainer = document.createElement('div');
  chartsContainer.className = 'charts-wrapper';

  // Top Genres Chart
  if (stats.topGenres && stats.topGenres.length > 0) {
    const genreSection = document.createElement('div');
    genreSection.className = 'chart-section';
    genreSection.innerHTML = '<h3>Top Genres</h3><div id="genre-chart"></div>';
    chartsContainer.appendChild(genreSection);
  }

  // Top Authors Chart
  if (stats.topAuthors && stats.topAuthors.length > 0) {
    const authorSection = document.createElement('div');
    authorSection.className = 'chart-section';
    authorSection.innerHTML = '<h3>Top Authors</h3><div id="author-chart"></div>';
    chartsContainer.appendChild(authorSection);
  }

  container.appendChild(chartsContainer);
  resultsElement.appendChild(container);

  // Render D3 Charts
  if (stats.topGenres && stats.topGenres.length > 0) {
    renderBarChart(stats.topGenres, '#genre-chart', 'Genres');
  }
  if (stats.topAuthors && stats.topAuthors.length > 0) {
    renderBarChart(stats.topAuthors, '#author-chart', 'Authors');
  }
}

function renderBarChart(data, selector, label) {
  // Set dimensions
  const margin = { top: 20, right: 30, bottom: 40, left: 120 };
  const width = 500 - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;

  // Append SVG
  const svg = d3.select(selector)
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // X axis
  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.count)])
    .range([0, width]);
  
  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(5))
    .selectAll("text")
    .attr("transform", "translate(-10,0)rotate(-45)")
    .style("text-anchor", "end");

  // Y axis
  const y = d3.scaleBand()
    .range([0, height])
    .domain(data.map(d => d.name))
    .padding(0.2);
  
  svg.append("g")
    .call(d3.axisLeft(y))
    .selectAll("text")
    .style("font-size", "12px");

  // Bars
  svg.selectAll("myRect")
    .data(data)
    .join("rect")
    .attr("x", x(0))
    .attr("y", d => y(d.name))
    .attr("width", d => x(d.count))
    .attr("height", y.bandwidth())
    .attr("fill", "var(--primary)")
    .style("rx", 4); // Rounded corners

  // Labels on bars
  svg.selectAll("myLabel")
    .data(data)
    .join("text")
    .attr("x", d => x(d.count) + 5)
    .attr("y", d => y(d.name) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .text(d => d.count)
    .style("fill", "var(--text)")
    .style("font-size", "12px");
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
  loadAppVersion();

  // Tab switching
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      if (!button.disabled) {
        switchTab(button.dataset.tab);
      }
    });
  });
});
