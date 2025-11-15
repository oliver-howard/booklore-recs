// API base URL
const API_BASE = '/api';

// Initialize session on page load
let sessionInitialized = false;

async function initSession() {
  if (sessionInitialized) return;

  try {
    showLoading(true);
    const response = await fetch(`${API_BASE}/auth/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to initialize session');
    }

    sessionInitialized = true;
    showLoading(false);
  } catch (error) {
    showLoading(false);
    showError(
      `Authentication failed: ${error.message}. Please check your BookLore credentials in .env`
    );
    throw error;
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
  try {
    clearError();
    await initSession();
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
  try {
    clearError();
    await initSession();
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
  try {
    clearError();
    await initSession();
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
  try {
    clearError();
    const criteria = document.getElementById('custom-criteria').value.trim();

    if (!criteria) {
      showError('Please enter your criteria');
      return;
    }

    await initSession();
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
  try {
    clearError();
    await initSession();
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

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  console.log('BookLore Recommendations app loaded');
});
