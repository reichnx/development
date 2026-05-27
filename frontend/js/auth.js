<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Facebook Share Tool</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <nav class="navbar navbar-dark bg-primary">
        <div class="container">
            <a class="navbar-brand" href="/">
                <i class="fas fa-share-alt"></i> Facebook Share Tool
            </a>
            <div id="userInfo" class="text-white">
                <span id="username"></span>
                <button id="logoutBtn" class="btn btn-light btn-sm ms-2">Logout</button>
            </div>
        </div>
    </nav>

    <div class="container mt-4">
        <!-- Alerts -->
        <div id="alertContainer"></div>

        <!-- Statistics Cards -->
        <div class="row mb-4" id="statsCards">
            <div class="col-md-3">
                <div class="card stat-card">
                    <div class="card-body">
                        <h5 class="card-title">Total Shares</h5>
                        <h2 id="totalShares">0</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card stat-card">
                    <div class="card-body">
                        <h5 class="card-title">Active Cookies</h5>
                        <h2 id="activeCookies">0</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card stat-card">
                    <div class="card-body">
                        <h5 class="card-title">Active Jobs</h5>
                        <h2 id="activeJobs">0</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card stat-card">
                    <div class="card-body">
                        <h5 class="card-title">Success Rate</h5>
                        <h2 id="successRate">0%</h2>
                    </div>
                </div>
            </div>
        </div>

        <!-- Main Content Tabs -->
        <ul class="nav nav-tabs" id="mainTabs" role="tablist">
            <li class="nav-item">
                <a class="nav-link active" data-bs-toggle="tab" href="#share">
                    <i class="fas fa-share"></i> New Share
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" data-bs-toggle="tab" href="#cookies">
                    <i class="fas fa-cookie-bite"></i> Cookies
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" data-bs-toggle="tab" href="#history">
                    <i class="fas fa-history"></i> Share History
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" data-bs-toggle="tab" href="#logs">
                    <i class="fas fa-list"></i> Real-time Logs
                </a>
            </li>
        </ul>

        <div class="tab-content mt-3">
            <!-- Share Tab -->
            <div class="tab-pane fade show active" id="share">
                <div class="card">
                    <div class="card-body">
                        <form id="shareForm">
                            <div class="mb-3">
                                <label for="postLink" class="form-label">Facebook Post URL</label>
                                <input type="url" class="form-control" id="postLink" required 
                                       placeholder="https://www.facebook.com/...">
                            </div>
                            <div class="mb-3">
                                <label for="totalShares" class="form-label">Number of Shares</label>
                                <input type="number" class="form-control" id="totalShares" 
                                       min="1" max="500" value="10" required>
                                <small class="text-muted">Max 500 shares per request</small>
                            </div>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-play"></i> Start Sharing
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            <!-- Cookies Tab -->
            <div class="tab-pane fade" id="cookies">
                <div class="card">
                    <div class="card-body">
                        <button class="btn btn-success mb-3" data-bs-toggle="modal" data-bs-target="#addCookieModal">
                            <i class="fas fa-plus"></i> Add Cookie
                        </button>
                        <button class="btn btn-danger mb-3" id="clearAllCookies">
                            <i class="fas fa-trash"></i> Clear All
                        </button>
                        <div id="cookiesList"></div>
                    </div>
                </div>
            </div>

            <!-- History Tab -->
            <div class="tab-pane fade" id="history">
                <div class="card">
                    <div class="card-body">
                        <div id="sharesHistory"></div>
                    </div>
                </div>
            </div>

            <!-- Logs Tab -->
            <div class="tab-pane fade" id="logs">
                <div class="card">
                    <div class="card-body">
                        <div class="mb-3">
                            <select id="jobSelect" class="form-select">
                                <option value="">Select a share job to view logs</option>
                            </select>
                        </div>
                        <div id="logsContainer" class="logs-container"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Add Cookie Modal -->
    <div class="modal fade" id="addCookieModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Add Facebook Cookie</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <form id="addCookieForm">
                        <div class="mb-3">
                            <label for="cookieName" class="form-label">Cookie Name</label>
                            <input type="text" class="form-control" id="cookieName" required>
                        </div>
                        <div class="mb-3">
                            <label for="cookieValue" class="form-label">Cookie String</label>
                            <textarea class="form-control" id="cookieValue" rows="5" required 
                                      placeholder="c_user=...; xs=...;"></textarea>
                            <small class="text-muted">Paste your Facebook cookie string here</small>
                        </div>
                        <div class="mb-3">
                            <label for="proxy" class="form-label">Proxy (Optional)</label>
                            <input type="text" class="form-control" id="proxy" 
                                   placeholder="http://proxy.example.com:8080">
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" id="saveCookieBtn">Save Cookie</button>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="/js/auth.js"></script>
    <script src="/js/dashboard.js"></script>
    <script src="/js/app.js"></script>
</body>
</html>