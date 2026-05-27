// public/app.js
let currentUser = null;
let accessToken = null;
let refreshToken = null;
let refreshInterval = null;

const API_URL = window.location.origin;

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${icons[type]}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auth Functions
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    if (tab === 'login') {
        document.querySelector('.tab-btn:first-child').classList.add('active');
        document.getElementById('loginForm').classList.add('active');
    } else {
        document.querySelector('.tab-btn:last-child').classList.add('active');
        document.getElementById('registerForm').classList.add('active');
    }
}

async function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showToast('Please enter username and password', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.status) {
            accessToken = data.data.accessToken;
            refreshToken = data.data.refreshToken;
            currentUser = data.data.user;
            
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            localStorage.setItem('user', JSON.stringify(currentUser));
            
            showToast('Login successful!', 'success');
            loadApp();
        } else {
            showToast(data.message || 'Login failed', 'error');
        }
    } catch (error) {
        showToast('Network error', 'error');
    } finally {
        showLoading(false);
    }
}

async function register() {
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    if (!username || !email || !password) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    if (username.length < 3) {
        showToast('Username must be at least 3 characters', 'error');
        return;
    }
    
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showToast('Invalid email format', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (data.status) {
            accessToken = data.data.accessToken;
            refreshToken = data.data.refreshToken;
            currentUser = data.data.user;
            
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            localStorage.setItem('user', JSON.stringify(currentUser));
            
            showToast('Registration successful!', 'success');
            loadApp();
        } else {
            showToast(data.message || 'Registration failed', 'error');
        }
    } catch (error) {
        showToast('Network error', 'error');
    } finally {
        showLoading(false);
    }
}

async function logout() {
    showLoading(true);
    
    try {
        if (refreshToken) {
            await fetch(`${API_URL}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ refreshToken })
            });
        }
    } catch (error) {}
    
    localStorage.clear();
    accessToken = null;
    refreshToken = null;
    currentUser = null;
    
    if (refreshInterval) clearInterval(refreshInterval);
    
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('authContainer').style.display = 'flex';
    showToast('Logged out', 'info');
    showLoading(false);
}

async function refreshAccessToken() {
    if (!refreshToken) return false;
    
    try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });
        
        const data = await response.json();
        
        if (data.status) {
            accessToken = data.data.accessToken;
            localStorage.setItem('accessToken', accessToken);
            return true;
        }
    } catch (error) {}
    
    return false;
}

// Main App
async function loadApp() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    
    document.getElementById('usernameDisplay').textContent = currentUser.username;
    document.getElementById('dashboardUsername').textContent = currentUser.username;
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchPage(item.dataset.page);
        });
    });
    
    await loadDashboard();
    await loadCookies();
    await loadHistory();
    await loadActiveShares();
    
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        if (document.getElementById('dashboardPage').classList.contains('active')) {
            loadDashboard();
        }
        loadActiveShares();
    }, 5000);
    
    setInterval(async () => {
        const success = await refreshAccessToken();
        if (!success) logout();
    }, 23 * 60 * 60 * 1000);
}

function switchPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`${page}Page`).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) item.classList.add('active');
    });
    
    if (page === 'dashboard') loadDashboard();
    else if (page === 'cookies') loadCookies();
    else if (page === 'history') loadHistory();
    else if (page === 'logs') loadLogs();
}

// Dashboard
async function loadDashboard() {
    try {
        const response = await fetch(`${API_URL}/api/stats`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        
        if (data.status) {
            const stats = data.data.stats;
            document.getElementById('totalShares').textContent = stats.total_shares;
            document.getElementById('successShares').textContent = stats.total_successful_shares;
            document.getElementById('failedShares').textContent = stats.total_failed_shares;
            document.getElementById('successRate').textContent = `${stats.success_rate}%`;
            document.getElementById('activeCookies').textContent = stats.active_cookies;
            document.getElementById('activeShares').textContent = stats.active_shares;
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// Cookies
async function loadCookies() {
    try {
        const response = await fetch(`${API_URL}/api/cookies/list`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        
        const container = document.getElementById('cookiesList');
        if (data.status && data.data.cookies.length > 0) {
            container.innerHTML = data.data.cookies.map(cookie => `
                <div class="cookie-item">
                    <div class="cookie-info">
                        <h4><i class="fas fa-cookie"></i> ${escapeHtml(cookie.name)}</h4>
                        <p>${escapeHtml(cookie.preview)}</p>
                        <p><small>Added: ${new Date(cookie.createdAt).toLocaleString()}</small></p>
                        ${cookie.lastUsed ? `<p><small>Last used: ${new Date(cookie.lastUsed).toLocaleString()}</small></p>` : ''}
                        <p><small>Usage: ${cookie.usageCount} times | Success: ${cookie.successRate}%</small></p>
                    </div>
                    <div>
                        <span class="cookie-badge ${cookie.status}">${cookie.status}</span>
                        <button onclick="deleteCookie('${cookie.id}')" class="delete-cookie">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');
            
            const select = document.getElementById('cookieSelect');
            const activeCookies = data.data.cookies.filter(c => c.status === 'active');
            if (activeCookies.length > 0) {
                select.innerHTML = '<option value="">Select a cookie</option>' + 
                    activeCookies.map(cookie => `<option value="${cookie.id}">${escapeHtml(cookie.name)}</option>`).join('');
            } else {
                select.innerHTML = '<option value="">No active cookies available</option>';
            }
        } else {
            container.innerHTML = '<p class="no-data">No cookies added yet. Click "Add Cookie" to get started.</p>';
            document.getElementById('cookieSelect').innerHTML = '<option value="">No cookies available</option>';
        }
    } catch (error) {
        console.error('Error loading cookies:', error);
    }
}

async function addCookie() {
    const name = document.getElementById('cookieName').value.trim();
    const cookie = document.getElementById('cookieValue').value.trim();
    
    if (!cookie) {
        showToast('Please enter your Facebook cookie', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/api/cookies/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ name: name || undefined, cookie })
        });
        
        const data = await response.json();
        
        if (data.status) {
            showToast(data.message, data.data.cookie.status === 'active' ? 'success' : 'warning');
            closeCookieModal();
            loadCookies();
            loadDashboard();
        } else {
            showToast(data.message || 'Failed to add cookie', 'error');
        }
    } catch (error) {
        showToast('Network error', 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteCookie(cookieId) {
    if (!confirm('Are you sure you want to delete this cookie?')) return;
    
    try {
        const response = await fetch(`${API_URL}/api/cookies/${cookieId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        const data = await response.json();
        
        if (data.status) {
            showToast('Cookie deleted', 'success');
            loadCookies();
            loadDashboard();
        } else {
            showToast(data.message || 'Failed to delete', 'error');
        }
    } catch (error) {
        showToast('Network error', 'error');
    }
}

async function clearAllCookies() {
    if (!confirm('WARNING: This will delete ALL your cookies. Are you sure?')) return;
    
    try {
        const response = await fetch(`${API_URL}/api/cookies/clear`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        const data = await response.json();
        
        if (data.status) {
            showToast('All cookies cleared', 'success');
            loadCookies();
            loadDashboard();
        }
    } catch (error) {
        showToast('Network error', 'error');
    }
}

// Share Functions
async function startShare() {
    const cookieId = document.getElementById('cookieSelect').value;
    const link = document.getElementById('postLink').value.trim();
    const limit = document.getElementById('shareLimit').value;
    
    if (!cookieId) {
        showToast('Please select a cookie', 'error');
        return;
    }
    
    if (!link) {
        showToast('Please enter a Facebook post URL', 'error');
        return;
    }
    
    if (!limit || limit < 1 || limit > 300) {
        showToast('Please enter a valid limit (1-300)', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/api/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ cookieId, link, limit: parseInt(limit) })
        });
        
        const data = await response.json();
        
        if (data.status) {
            showToast(data.message, 'success');
            document.getElementById('shareForm').reset();
            switchPage('history');
            loadHistory();
            loadActiveShares();
        } else {
            showToast(data.message || 'Failed to start share', 'error');
        }
    } catch (error) {
        showToast('Network error', 'error');
    } finally {
        showLoading(false);
    }
}

async function cancelShare(shareId) {
    if (!confirm('Cancel this share?')) return;
    
    try {
        const response = await fetch(`${API_URL}/api/share/${shareId}/cancel`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        const data = await response.json();
        
        if (data.status) {
            showToast('Share cancelled', 'success');
            loadActiveShares();
            loadHistory();
        }
    } catch (error) {
        showToast('Network error', 'error');
    }
}

// History
async function loadHistory() {
    try {
        const response = await fetch(`${API_URL}/api/history?limit=50`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        
        const container = document.getElementById('historyList');
        if (data.status && data.data.history.length > 0) {
            container.innerHTML = data.data.history.map(share => `
                <div class="history-item">
                    <div class="history-header">
                        <strong>${escapeHtml(share.link.substring(0, 60))}...</strong>
                        <span class="history-status ${share.status}">${share.status}</span>
                    </div>
                    <div>Cookie: ${escapeHtml(share.cookieName)} | Requested: ${share.limit} shares</div>
                    <div>Success: ${share.success} | Failed: ${share.failed}</div>
                    ${share.progress > 0 && share.status === 'processing' ? `
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${share.progress}%"></div>
                        </div>
                    ` : ''}
                    <div style="font-size: 12px; color: #9ca3af; margin-top: 12px;">
                        Started: ${new Date(share.startTime).toLocaleString()}
                        ${share.endTime ? ` | Ended: ${new Date(share.endTime).toLocaleString()}` : ''}
                    </div>
                    ${share.status === 'processing' ? `
                        <button onclick="cancelShare('${share.id}')" class="btn-danger" style="margin-top: 12px;">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                    ` : ''}
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="no-data">No share history yet</p>';
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

async function loadActiveShares() {
    try {
        const response = await fetch(`${API_URL}/api/active-shares`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        
        const container = document.getElementById('activeSharesList');
        if (data.status && data.data.active_shares.length > 0) {
            container.innerHTML = data.data.active_shares.map(share => `
                <div class="share-item">
                    <div class="history-header">
                        <strong>${escapeHtml(share.link.substring(0, 50))}...</strong>
                        <span class="history-status processing">${share.status}</span>
                    </div>
                    <div>Progress: ${share.completed}/${share.limit} shares</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${share.progress}%"></div>
                    </div>
                    <button onclick="cancelShare('${share.id}')" class="btn-danger" style="margin-top: 12px;">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="no-data">No active shares</p>';
        }
    } catch (error) {
        console.error('Error loading active shares:', error);
    }
}

async function loadLogs() {
    try {
        const response = await fetch(`${API_URL}/api/history?limit=20`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        
        const container = document.getElementById('logsList');
        if (data.status && data.data.history.length > 0) {
            const logs = [];
            data.data.history.forEach(share => {
                logs.push({
                    type: share.status === 'completed' ? 'success' : share.status === 'failed' ? 'error' : 'info',
                    message: `${share.success} successful, ${share.failed} failed using cookie "${share.cookieName}"`,
                    time: share.startTime
                });
            });
            
            container.innerHTML = logs.map(log => `
                <div class="log-item ${log.type}">
                    <div class="log-header">
                        <strong>${log.type.toUpperCase()}</strong>
                        <span class="log-time">${new Date(log.time).toLocaleString()}</span>
                    </div>
                    <div>${escapeHtml(log.message)}</div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="no-data">No logs available</p>';
        }
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

// Modal Functions
function showAddCookieModal() {
    document.getElementById('cookieModal').style.display = 'flex';
}

function closeCookieModal() {
    document.getElementById('cookieModal').style.display = 'none';
    document.getElementById('cookieName').value = '';
    document.getElementById('cookieValue').value = '';
}

function showCookieGuide() {
    alert("How to get your Facebook cookie:\n\n1. Log into Facebook\n2. Press F12 for Developer Tools\n3. Go to Application/Storage tab\n4. Find Cookies > facebook.com\n5. Copy the entire cookie string\n\nFormat: name1=value1; name2=value2; ...");
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const savedToken = localStorage.getItem('accessToken');
    const savedRefreshToken = localStorage.getItem('refreshToken');
    const savedUser = localStorage.getItem('user');
    
    if (savedToken && savedRefreshToken && savedUser) {
        accessToken = savedToken;
        refreshToken = savedRefreshToken;
        currentUser = JSON.parse(savedUser);
        loadApp();
    } else {
        document.getElementById('authContainer').style.display = 'flex';
    }
});

window.onclick = function(event) {
    const modal = document.getElementById('cookieModal');
    if (event.target === modal) closeCookieModal();
};