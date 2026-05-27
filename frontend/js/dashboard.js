// Load dashboard statistics
async function loadStats() {
    try {
        // Load cookie stats
        const cookieStats = await apiRequest('/cookies/stats');
        document.getElementById('activeCookies').textContent = cookieStats.data.active || 0;
        
        // Load share stats
        const shares = await apiRequest('/shares');
        const totalShares = shares.data.reduce((sum, job) => sum + job.successfulShares, 0);
        const activeJobs = shares.data.filter(job => job.status === 'processing').length;
        const successRate = shares.data.length > 0 
            ? Math.round((shares.data.filter(job => job.status === 'completed').length / shares.data.length) * 100)
            : 0;
        
        document.getElementById('totalShares').textContent = totalShares;
        document.getElementById('activeJobs').textContent = activeJobs;
        document.getElementById('successRate').textContent = `${successRate}%`;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Load cookies list
async function loadCookies() {
    try {
        const response = await apiRequest('/cookies');
        const cookies = response.data;
        
        const cookiesList = document.getElementById('cookiesList');
        if (cookies.length === 0) {
            cookiesList.innerHTML = '<div class="alert alert-info">No cookies added yet. Click "Add Cookie" to get started.</div>';
            return;
        }
        
        cookiesList.innerHTML = cookies.map(cookie => `
            <div class="cookie-card">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <span class="cookie-status status-${cookie.status}"></span>
                        <strong>${escapeHtml(cookie.name)}</strong>
                        <small class="text-muted ms-2">ID: ${cookie.id.substring(0, 8)}</small>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-warning me-2" onclick="toggleCookieStatus('${cookie.id}', '${cookie.status}')">
                            <i class="fas fa-power-off"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteCookie('${cookie.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="mt-2">
                    <small>Shares: ${cookie.sharesCount} | Last Used: ${cookie.lastUsed ? formatDate(cookie.lastUsed) : 'Never'}</small>
                    ${cookie.proxy ? `<br><small>Proxy: ${cookie.proxy}</small>` : ''}
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load cookies:', error);
    }
}

// Toggle cookie status
async function toggleCookieStatus(cookieId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
        await apiRequest(`/cookies/${cookieId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        showAlert(`Cookie status updated to ${newStatus}`, 'success');
        loadCookies();
    } catch (error) {
        console.error('Failed to update cookie status:', error);
    }
}

// Delete cookie
async function deleteCookie(cookieId) {
    if (confirm('Are you sure you want to delete this cookie?')) {
        try {
            await apiRequest(`/cookies/${cookieId}`, {
                method: 'DELETE'
            });
            showAlert('Cookie deleted successfully', 'success');
            loadCookies();
            loadStats();
        } catch (error) {
            console.error('Failed to delete cookie:', error);
        }
    }
}

// Clear all cookies
async function clearAllCookies() {
    if (confirm('Are you sure you want to clear ALL cookies? This action cannot be undone.')) {
        try {
            await apiRequest('/cookies/clear/all', {
                method: 'DELETE'
            });
            showAlert('All cookies cleared successfully', 'success');
            loadCookies();
            loadStats();
        } catch (error) {
            console.error('Failed to clear cookies:', error);
        }
    }
}

// Load share history
async function loadShareHistory() {
    try {
        const response = await apiRequest('/shares');
        const shares = response.data;
        
        const historyDiv = document.getElementById('sharesHistory');
        if (shares.length === 0) {
            historyDiv.innerHTML = '<div class="alert alert-info">No share jobs found. Start sharing to see history.</div>';
            return;
        }
        
        historyDiv.innerHTML = shares.map(job => `
            <div class="share-item">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="mb-2">
                            <strong>${escapeHtml(job.link)}</strong>
                        </div>
                        <div class="mb-2">
                            <span class="badge bg-${getStatusColor(job.status)}">${job.status}</span>
                            <small class="ms-2">Started: ${formatDate(job.startTime)}</small>
                            ${job.endTime ? `<small class="ms-2">Ended: ${formatDate(job.endTime)}</small>` : ''}
                        </div>
                        <div class="mb-2">
                            <div class="progress">
                                <div class="progress-bar" style="width: ${job.progress}%">
                                    ${job.progress}%
                                </div>
                            </div>
                        </div>
                        <div>
                            <small>Success: ${job.successfulShares} / ${job.totalShares}</small>
                            <small class="ms-3">Failed: ${job.failedShares}</small>
                            ${job.duration ? `<small class="ms-3">Duration: ${formatDuration(job.duration)}</small>` : ''}
                        </div>
                    </div>
                    ${job.status === 'processing' ? `
                        <button class="btn btn-sm btn-danger" onclick="cancelShare('${job.id}')">
                            <i class="fas fa-stop"></i> Cancel
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
        
        // Update job select dropdown for logs
        const jobSelect = document.getElementById('jobSelect');
        jobSelect.innerHTML = '<option value="">Select a share job to view logs</option>' +
            shares.slice(0, 20).map(job => `
                <option value="${job.id}">${job.id.substring(0, 8)} - ${job.status} - ${formatDate(job.startTime)}</option>
            `).join('');
    } catch (error) {
        console.error('Failed to load share history:', error);
    }
}

// Cancel share job
async function cancelShare(jobId) {
    if (confirm('Are you sure you want to cancel this share job?')) {
        try {
            await apiRequest(`/shares/${jobId}/cancel`, {
                method: 'POST'
            });
            showAlert('Share job cancelled successfully', 'success');
            loadShareHistory();
            loadStats();
        } catch (error) {
            console.error('Failed to cancel share:', error);
        }
    }
}

// Load job logs
async function loadJobLogs(jobId) {
    if (!jobId) {
        document.getElementById('logsContainer').innerHTML = '<div class="text-muted">Select a job to view logs</div>';
        return;
    }
    
    try {
        const response = await apiRequest(`/shares/${jobId}/logs?limit=200`);
        const logs = response.data;
        
        const logsContainer = document.getElementById('logsContainer');
        if (logs.length === 0) {
            logsContainer.innerHTML = '<div class="text-muted">No logs available for this job</div>';
            return;
        }
        
        logsContainer.innerHTML = logs.map(log => `
            <div class="log-entry log-${log.level}">
                <span class="text-muted">[${formatDate(log.timestamp)}]</span>
                [${log.level.toUpperCase()}] ${escapeHtml(log.message)}
                ${log.cookieId ? `<span class="text-muted"> (Cookie: ${log.cookieId.substring(0, 8)})</span>` : ''}
            </div>
        `).join('');
        
        // Auto-scroll to bottom
        logsContainer.scrollTop = logsContainer.scrollHeight;
    } catch (error) {
        console.error('Failed to load logs:', error);
    }
}

// Helper function to get status color
function getStatusColor(status) {
    const colors = {
        'pending': 'secondary',
        'processing': 'primary',
        'completed': 'success',
        'failed': 'danger',
        'cancelled': 'warning'
    };
    return colors[status] || 'secondary';
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-refresh data
let refreshInterval;

function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        loadStats();
        loadShareHistory();
    }, 5000);
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;
    
    loadStats();
    loadCookies();
    loadShareHistory();
    startAutoRefresh();
    
    // Event listeners
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('clearAllCookies').addEventListener('click', clearAllCookies);
    document.getElementById('saveCookieBtn').addEventListener('click', saveCookie);
    document.getElementById('jobSelect').addEventListener('change', (e) => {
        loadJobLogs(e.target.value);
    });
    
    // Share form submission
    document.getElementById('shareForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const link = document.getElementById('postLink').value;
        const totalShares = parseInt(document.getElementById('totalShares').value);
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';
        
        try {
            const response = await apiRequest('/shares/create', {
                method: 'POST',
                body: JSON.stringify({ link, totalShares })
            });
            
            showAlert(`Share job created successfully! ID: ${response.data.id.substring(0, 8)}`, 'success');
            document.getElementById('shareForm').reset();
            loadShareHistory();
            loadStats();
            
            // Switch to history tab
            const historyTab = document.querySelector('[data-bs-target="#history"]');
            const tab = new bootstrap.Tab(historyTab);
            tab.show();
        } catch (error) {
            console.error('Failed to start share:', error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
});

// Save cookie
async function saveCookie() {
    const name = document.getElementById('cookieName').value;
    const cookie = document.getElementById('cookieValue').value;
    const proxy = document.getElementById('proxy').value;
    
    if (!name || !cookie) {
        showAlert('Please fill in all required fields', 'warning');
        return;
    }
    
    const saveBtn = document.getElementById('saveCookieBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
    
    try {
        await apiRequest('/cookies/add', {
            method: 'POST',
            body: JSON.stringify({ name, cookie, proxy })
        });
        
        showAlert('Cookie added successfully', 'success');
        document.getElementById('addCookieForm').reset();
        const modal = bootstrap.Modal.getInstance(document.getElementById('addCookieModal'));
        modal.hide();
        loadCookies();
        loadStats();
    } catch (error) {
        console.error('Failed to add cookie:', error);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}