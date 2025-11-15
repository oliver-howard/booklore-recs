// API base URL
const API_BASE = '/api';

// Track authentication state
let isAuthenticated = false;
let isGuestMode = false;

// Check authentication status
async function checkAuthStatus() {
  try {
    const response = await fetch(`${API_BASE}/auth/status`);
    const data = await response.json();

    if (data.authenticated) {
      isAuthenticated = true;
      isGuestMode = data.isGuest || false;
      hideLoginModal();
      showUserInfo(data.username);
      updateUIForMode();
    } else {
      isAuthenticated = false;
      isGuestMode = false;
      showLoginModal();
    }
  } catch (error) {
    console.error('Error checking auth status:', error);
    showLoginModal();
  }
}

// Update UI based on guest mode or full auth
function updateUIForMode() {
  const guestRestrictedTabs = ['similar', 'contrasting', 'blindspots', 'tbr', 'stats'];

  guestRestrictedTabs.forEach(tab => {
    const button = document.querySelector(`[data-tab="${tab}"]`);
    if (button) {
      if (isGuestMode) {
        button.disabled = true;
        button.title = 'Login with BookLore to access this feature';
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
      } else {
        button.disabled = false;
        button.title = '';
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
      }
    }
  });

  // If guest mode and on a restricted tab, switch to custom tab
  if (isGuestMode) {
    const activeTab = document.querySelector('.tab-button.active');
    if (activeTab && guestRestrictedTabs.includes(activeTab.dataset.tab)) {
      switchTab('custom');
    }
  }
}

// Show/hide login modal
function showLoginModal() {
  document.getElementById('login-modal').classList.add('show');
  loadSavedUsername();
}

function hideLoginModal() {
  document.getElementById('login-modal').classList.remove('show');
}

// Show user info in header
function showUserInfo(username) {
  const userInfo = document.getElementById('user-info');
  const usernameDisplay = document.getElementById('username-display');
  usernameDisplay.textContent = `Logged in as: ${username}`;
  userInfo.classList.remove('hidden');
}

function hideUserInfo() {
  document.getElementById('user-info').classList.add('hidden');
}

// Load saved username if "Remember Me" was checked
function loadSavedUsername() {
  const savedUsername = localStorage.getItem('booklore_username');
  const usernameInput = document.getElementById('login-username');
  const rememberCheckbox = document.getElementById('remember-me');

  if (savedUsername) {
    usernameInput.value = savedUsername;
    rememberCheckbox.checked = true;
  }
}

// Handle guest login
async function handleGuestLogin() {
  const errorDiv = document.getElementById('login-error');
  errorDiv.classList.add('hidden');

  try {
    showLoading(true);

    const response = await fetch(`${API_BASE}/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Guest login failed');
    }

    // Guest login successful
    isAuthenticated = true;
    isGuestMode = true;

    showUserInfo('Guest (Limited Features)');
    hideLoginModal();
    updateUIForMode();
    showLoading(false);
  } catch (error) {
    showLoading(false);
    errorDiv.textContent = error.message;
    errorDiv.classList.remove('hidden');
  }
}

// Handle login form submission
async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const rememberMe = document.getElementById('remember-me').checked;
  const errorDiv = document.getElementById('login-error');

  // Validate inputs
  if (!username || !password) {
    errorDiv.textContent = 'Please enter both username and password';
    errorDiv.classList.remove('hidden');
    return;
  }

  errorDiv.classList.add('hidden');

  try {
    showLoading(true);

    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    // Login successful
    isAuthenticated = true;
    isGuestMode = false;

    // Save or clear username based on "Remember Me" checkbox
    if (rememberMe) {
      localStorage.setItem('booklore_username', username);
    } else {
      localStorage.removeItem('booklore_username');
    }

    showUserInfo(data.username);
    hideLoginModal();
    updateUIForMode();
    showLoading(false);

    // Clear form
    document.getElementById('login-form').reset();
  } catch (error) {
    showLoading(false);
    errorDiv.textContent = error.message;
    errorDiv.classList.remove('hidden');
  }
}

// Handle logout
async function handleLogout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });

    isAuthenticated = false;
    isGuestMode = false;
    hideUserInfo();
    showLoginModal();

    // Clear any displayed data
    document.querySelectorAll('.results').forEach((el) => (el.innerHTML = ''));
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// Tab switching
function switchTab(tabName) {
  // Update active button
  document.querySelectorAll('.tab-button').forEach((btn) => btn.classList.remove('active'));
  const targetButton = document.querySelector(`[data-tab="${tabName}"]`);
  if (targetButton) {
    targetButton.classList.add('active');
  }

  // Update active pane
  document
    .querySelectorAll('.tab-pane')
    .forEach((pane) => pane.classList.remove('active'));
  document.getElementById(`${tabName}-tab`).classList.add('active');
}

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    // Don't allow clicking disabled tabs
    if (button.disabled) {
      return;
    }

    const tabName = button.dataset.tab;
    switchTab(tabName);

    // Auto-load TBR when switching to TBR tab
    if (tabName === 'tbr' && isAuthenticated && !isGuestMode) {
      loadTBR();
    }
  });
});

// Utility functions
function showLoading(show) {
  const loader = document.getElementById('loading');
  if (show) {
    loader.classList.remove('hidden');
  } else {
    loader.classList.add('hidden');
  }
}

function showError(message) {
  const errorDiv = document.getElementById('error');
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');
  errorDiv.classList.remove('success');
  setTimeout(() => {
    errorDiv.classList.add('hidden');
  }, 5000);
}

function showSuccess(message) {
  const errorDiv = document.getElementById('error');
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');
  errorDiv.classList.add('success');
  setTimeout(() => {
    errorDiv.classList.add('hidden');
    errorDiv.classList.remove('success');
  }, 3000);
}

function clearError() {
  const errorDiv = document.getElementById('error');
  errorDiv.classList.add('hidden');
  errorDiv.classList.remove('success');
}

// Similar recommendations
async function getSimilarRecommendations() {
  if (!isAuthenticated) {
    showError('Please log in first');
    showLoginModal();
    return;
  }

  try {
    clearError();
    showLoading(true);

    const response = await fetch(`${API_BASE}/recommendations/similar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error('Failed to get recommendations');
    }

    const data = await response.json();
    displayRecommendations(data.recommendations, 'similar-results');
  } catch (error) {
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

// Contrasting recommendations
async function getContrastingRecommendations() {
  if (!isAuthenticated) {
    showError('Please log in first');
    showLoginModal();
    return;
  }

  try {
    clearError();
    showLoading(true);

    const response = await fetch(`${API_BASE}/recommendations/contrasting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error('Failed to get recommendations');
    }

    const data = await response.json();
    displayRecommendations(data.recommendations, 'contrasting-results');
  } catch (error) {
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

// Blind spots analysis
async function getBlindspots() {
  if (!isAuthenticated) {
    showError('Please log in first');
    showLoginModal();
    return;
  }

  try {
    clearError();
    showLoading(true);

    const response = await fetch(`${API_BASE}/recommendations/blindspots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error('Failed to get analysis');
    }

    const data = await response.json();
    displayBlindspots(data.analysis, 'blindspots-results');
  } catch (error) {
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

// Custom recommendations
async function getCustomRecommendations() {
  if (!isAuthenticated) {
    showError('Please log in first');
    showLoginModal();
    return;
  }

  try {
    clearError();
    const criteria = document.getElementById('custom-criteria').value.trim();

    if (!criteria) {
      showError('Please enter your criteria');
      return;
    }

    showLoading(true);

    const response = await fetch(`${API_BASE}/recommendations/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria }),
    });

    if (!response.ok) {
      throw new Error('Failed to get recommendations');
    }

    const data = await response.json();
    displayRecommendations(data.recommendations, 'custom-results');
  } catch (error) {
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

// Get statistics
async function getStats() {
  if (!isAuthenticated) {
    showError('Please log in first');
    showLoginModal();
    return;
  }

  try {
    clearError();
    showLoading(true);

    const response = await fetch(`${API_BASE}/stats`);

    if (!response.ok) {
      throw new Error('Failed to get statistics');
    }

    const stats = await response.json();
    displayStats(stats, 'stats-results');
  } catch (error) {
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

// Display functions
function displayRecommendations(recommendations, containerId) {
  const container = document.getElementById(containerId);

  if (!recommendations || recommendations.length === 0) {
    container.innerHTML = '<p>No recommendations found.</p>';
    return;
  }

  const html = recommendations
    .map(
      (rec, index) => `
    <div class="card">
      <h3>${index + 1}. ${escapeHtml(rec.title)}</h3>
      <span class="author">by ${escapeHtml(rec.author)}</span>
      <p class="reasoning">${escapeHtml(rec.reasoning)}</p>
      <div class="card-actions">
        ${
          !isGuestMode
            ? `<button class="btn btn-primary btn-sm" onclick="addToTBR('${escapeHtml(rec.title).replace(/'/g, "\\'")}', '${escapeHtml(rec.author).replace(/'/g, "\\'")}', '${escapeHtml(rec.reasoning).replace(/'/g, "\\'")}', '${rec.amazonUrl || ''}')">
                 Add to TBR
               </button>`
            : ''
        }
        ${
          rec.amazonUrl
            ? `<a href="${escapeHtml(rec.amazonUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm amazon-link">
                 View on Amazon →
               </a>`
            : ''
        }
      </div>
    </div>
  `
    )
    .join('');

  container.innerHTML = html;
}

function displayBlindspots(analysis, containerId) {
  const container = document.getElementById(containerId);

  if (!analysis) {
    container.innerHTML = '<p>No analysis available.</p>';
    return;
  }

  let html = '';

  // Patterns
  if (analysis.patterns && analysis.patterns.length > 0) {
    html += `
      <div class="pattern-list">
        <h3>Your Reading Patterns</h3>
        <ul>
          ${analysis.patterns.map((pattern) => `<li>${escapeHtml(pattern)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  // Blind spots
  if (analysis.blindSpots && analysis.blindSpots.length > 0) {
    html += '<h3 style="margin-bottom: 16px;">Blind Spots & Recommendations</h3>';
    analysis.blindSpots.forEach((spot) => {
      html += `
        <div class="blindspot-section">
          <h3>${escapeHtml(spot.category)}</h3>
          <p class="description">${escapeHtml(spot.description)}</p>
          ${
            spot.recommendations && spot.recommendations.length > 0
              ? `
            <h4 style="margin-bottom: 12px;">Recommended Books:</h4>
            ${spot.recommendations
              .map(
                (rec) => `
              <div class="card" style="margin-bottom: 12px;">
                <h3>${escapeHtml(rec.title)}</h3>
                <span class="author">by ${escapeHtml(rec.author)}</span>
                <p class="reasoning">${escapeHtml(rec.reasoning)}</p>
                ${
                  rec.amazonUrl
                    ? `<a href="${escapeHtml(rec.amazonUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm amazon-link">
                         View on Amazon →
                       </a>`
                    : ''
                }
              </div>
            `
              )
              .join('')}
          `
              : ''
          }
        </div>
      `;
    });
  }

  // Suggested topics
  if (analysis.suggestedTopics && analysis.suggestedTopics.length > 0) {
    html += `
      <div class="list-section">
        <h3>Suggested Topics to Explore</h3>
        <ul>
          ${analysis.suggestedTopics.map((topic) => `<li>${escapeHtml(topic)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  container.innerHTML = html;
}

function displayStats(stats, containerId) {
  const container = document.getElementById(containerId);

  const html = `
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">${stats.totalBooksRead}</span>
        <span class="stat-label">Books Read</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${stats.booksRated}</span>
        <span class="stat-label">Books Rated</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${stats.averageRating.toFixed(2)}/10</span>
        <span class="stat-label">Average Rating</span>
      </div>
    </div>

    ${
      stats.topGenres && stats.topGenres.length > 0
        ? `
      <div class="list-section">
        <h3>Top Genres</h3>
        <ul>
          ${stats.topGenres.map((genre, i) => `<li>${i + 1}. ${escapeHtml(genre)}</li>`).join('')}
        </ul>
      </div>
    `
        : ''
    }

    ${
      stats.topAuthors && stats.topAuthors.length > 0
        ? `
      <div class="list-section">
        <h3>Top Authors</h3>
        <ul>
          ${stats.topAuthors.map((author, i) => `<li>${i + 1}. ${escapeHtml(author)}</li>`).join('')}
        </ul>
      </div>
    `
        : ''
    }
  `;

  container.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Theme toggle functionality
function toggleTheme() {
  const root = document.documentElement;
  const themeIcon = document.getElementById('theme-icon');
  const currentTheme = root.getAttribute('data-theme');

  if (currentTheme === 'light') {
    root.removeAttribute('data-theme');
    themeIcon.textContent = '🌙';
    localStorage.setItem('theme', 'dark');
  } else {
    root.setAttribute('data-theme', 'light');
    themeIcon.textContent = '☀️';
    localStorage.setItem('theme', 'light');
  }
}

// Load saved theme on page load
function loadTheme() {
  const savedTheme = localStorage.getItem('theme');
  const root = document.documentElement;
  const themeIcon = document.getElementById('theme-icon');

  if (savedTheme === 'light') {
    root.setAttribute('data-theme', 'light');
    themeIcon.textContent = '☀️';
  } else {
    root.removeAttribute('data-theme');
    themeIcon.textContent = '🌙';
  }
}

// ========== TBR (To Be Read) Functionality ==========

// Helper to generate book ID
function generateBookId(title, author) {
  const normalized = `${title.toLowerCase()}-${author.toLowerCase()}`
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized;
}

// Load TBR list
async function loadTBR() {
  if (!isAuthenticated) {
    showError('Please log in first');
    showLoginModal();
    return;
  }

  if (isGuestMode) {
    showError('TBR list is not available in guest mode');
    return;
  }

  try {
    clearError();
    showLoading(true);

    const response = await fetch(`${API_BASE}/tbr`);

    if (!response.ok) {
      throw new Error('Failed to load TBR list');
    }

    const data = await response.json();
    displayTBR(data.tbr);
  } catch (error) {
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

// Add book to TBR
async function addToTBR(title, author, reasoning, amazonUrl) {
  if (!isAuthenticated || isGuestMode) {
    showError('TBR list is not available in guest mode');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/tbr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, author, reasoning, amazonUrl }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to add book to TBR');
    }

    showSuccess('Book added to TBR list!');
    return true;
  } catch (error) {
    showError(error.message);
    return false;
  }
}

// Remove book from TBR
async function removeFromTBR(bookId) {
  if (!isAuthenticated || isGuestMode) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/tbr/${encodeURIComponent(bookId)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to remove book from TBR');
    }

    // Reload TBR list
    await loadTBR();
  } catch (error) {
    showError(error.message);
  }
}

// Clear entire TBR list
async function clearTBR() {
  if (!isAuthenticated || isGuestMode) {
    return;
  }

  if (!confirm('Are you sure you want to clear your entire TBR list?')) {
    return;
  }

  try {
    showLoading(true);

    const response = await fetch(`${API_BASE}/tbr`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to clear TBR list');
    }

    // Reload empty list
    await loadTBR();
  } catch (error) {
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

// Display TBR list
function displayTBR(books) {
  const container = document.getElementById('tbr-results');

  if (!books || books.length === 0) {
    container.innerHTML = '<p class="empty-state">Your To Be Read list is empty. Add books from recommendations!</p>';
    return;
  }

  const html = books
    .map(
      (book) => `
    <div class="card">
      <div class="card-header">
        <div>
          <h3>${escapeHtml(book.title)}</h3>
          <span class="author">by ${escapeHtml(book.author)}</span>
        </div>
        <button class="btn btn-danger btn-sm" onclick="removeFromTBR('${book.id}')">
          Remove
        </button>
      </div>
      ${book.reasoning ? `<p class="reasoning">${escapeHtml(book.reasoning)}</p>` : ''}
      <p class="text-light" style="font-size: 0.85rem; margin-top: 8px;">
        Added: ${new Date(book.addedAt).toLocaleDateString()}
      </p>
      ${
        book.amazonUrl
          ? `<a href="${escapeHtml(book.amazonUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm amazon-link">
               View on Amazon →
             </a>`
          : ''
      }
    </div>
  `
    )
    .join('');

  container.innerHTML = html;
}

// ====================================================

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  console.log('BookLore Recommendations app loaded');
  loadTheme();
  checkAuthStatus();
});
