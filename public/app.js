// API base URL
const API_BASE = '/api';

// Track authentication state
let isAuthenticated = false;

// Check authentication status
async function checkAuthStatus() {
  try {
    const response = await fetch(`${API_BASE}/auth/status`);
    const data = await response.json();

    if (data.authenticated) {
      isAuthenticated = true;
      hideLoginModal();
      showUserInfo(data.username);
    } else {
      isAuthenticated = false;
      showLoginModal();
    }
  } catch (error) {
    console.error('Error checking auth status:', error);
    showLoginModal();
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

// Handle login form submission
async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const rememberMe = document.getElementById('remember-me').checked;
  const errorDiv = document.getElementById('login-error');

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

    // Save or clear username based on "Remember Me" checkbox
    if (rememberMe) {
      localStorage.setItem('booklore_username', username);
    } else {
      localStorage.removeItem('booklore_username');
    }

    showUserInfo(data.username);
    hideLoginModal();
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
    hideUserInfo();
    showLoginModal();

    // Clear any displayed data
    document.querySelectorAll('.results').forEach((el) => (el.innerHTML = ''));
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// Tab switching
document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    const tabName = button.dataset.tab;

    // Update active button
    document.querySelectorAll('.tab-button').forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');

    // Update active pane
    document
      .querySelectorAll('.tab-pane')
      .forEach((pane) => pane.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
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
  setTimeout(() => {
    errorDiv.classList.add('hidden');
  }, 5000);
}

function clearError() {
  document.getElementById('error').classList.add('hidden');
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

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  console.log('BookLore Recommendations app loaded');
  loadTheme();
  checkAuthStatus();
});
