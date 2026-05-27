const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');

// Store refresh tokens
const refreshTokens = new Map();

// User data structure
let users = [];
let activeShares = new Map();
let shareLogs = [];
let pendingShares = new Map();
let sessionLogs = [];

// Load users from file
async function loadUsers() {
    try {
        const data = await fs.readFile('./data/users.json', 'utf8');
        users = JSON.parse(data);
        console.log(`✅ Loaded ${users.length} users from database`);
    } catch (err) {
        console.log('📝 No existing users found, creating default admin account...');
        // Create default admin account
        const hashedPassword = await bcrypt.hash('admin123', 10);
        users = [{
            id: 1,
            username: 'admin',
            email: 'admin@sharemaster.com',
            password: hashedPassword,
            role: 'admin',
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            settings: {
                notifications: true,
                theme: 'dark',
                language: 'en'
            }
        }];
        await saveUsers();
        console.log('✅ Default admin account created (username: admin, password: admin123)');
    }
}

async function saveUsers() {
    await fs.writeFile('./data/users.json', JSON.stringify(users, null, 2));
}

// Load other data
async function loadOtherData() {
    try {
        const logsData = await fs.readFile('./data/share_logs.json', 'utf8');
        shareLogs = JSON.parse(logsData);
    } catch (err) {
        shareLogs = [];
    }

    try {
        const sessionsData = await fs.readFile('./data/session_logs.json', 'utf8');
        sessionLogs = JSON.parse(sessionsData);
    } catch (err) {
        sessionLogs = [];
    }
}

async function saveOtherData() {
    await fs.writeFile('./data/share_logs.json', JSON.stringify(shareLogs.slice(-1000), null, 2));
    await fs.writeFile('./data/session_logs.json', JSON.stringify(sessionLogs.slice(-5000), null, 2));
}

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(compression());
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: { status: false, message: 'Too many login attempts. Please try again later.' }
});

// ==================== USER AUTHENTICATION MIDDLEWARE ====================

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            status: false, 
            message: 'Access token required',
            code: 'NO_TOKEN'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    status: false, 
                    message: 'Token expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            return res.status(403).json({ 
                status: false, 
                message: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        
        // Check if user still exists
        const existingUser = users.find(u => u.id === user.id);
        if (!existingUser || !existingUser.isActive) {
            return res.status(401).json({ 
                status: false, 
                message: 'User not found or inactive',
                code: 'USER_INACTIVE'
            });
        }
        
        req.user = user;
        next();
    });
}

// Optional authentication (doesn't fail if no token)
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (!err) {
                req.user = user;
            }
        });
    }
    next();
}

// ==================== AUTHENTICATION ENDPOINTS ====================

// Register new user
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({
                status: false,
                message: 'All fields are required',
                code: 'MISSING_FIELDS'
            });
        }

        if (username.length < 3) {
            return res.status(400).json({
                status: false,
                message: 'Username must be at least 3 characters',
                code: 'INVALID_USERNAME'
            });
        }

        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            return res.status(400).json({
                status: false,
                message: 'Invalid email format',
                code: 'INVALID_EMAIL'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                status: false,
                message: 'Password must be at least 6 characters',
                code: 'WEAK_PASSWORD'
            });
        }

        // Check if user exists
        const existingUser = users.find(u => u.username === username || u.email === email);
        if (existingUser) {
            return res.status(400).json({
                status: false,
                message: existingUser.username === username ? 'Username already taken' : 'Email already registered',
                code: 'USER_EXISTS'
            });
        }

        // Create new user
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: users.length + 1,
            username,
            email,
            password: hashedPassword,
            role: 'user',
            isActive: true,
            cookies: [],
            stats: {
                totalShares: 0,
                successfulShares: 0,
                failedShares: 0
            },
            createdAt: new Date().toISOString(),
            lastLogin: null,
            settings: {
                notifications: true,
                theme: 'dark',
                language: 'en'
            }
        };

        users.push(newUser);
        await saveUsers();

        // Generate tokens
        const accessToken = jwt.sign(
            { id: newUser.id, username: newUser.username, role: newUser.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        const refreshToken = jwt.sign(
            { id: newUser.id },
            JWT_REFRESH_SECRET,
            { expiresIn: '7d' }
        );

        refreshTokens.set(refreshToken, newUser.id);

        // Log session
        sessionLogs.unshift({
            id: uuidv4(),
            userId: newUser.id,
            username: newUser.username,
            action: 'register',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
        });
        await saveOtherData();

        res.json({
            status: true,
            message: 'Registration successful',
            data: {
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    email: newUser.email,
                    role: newUser.role
                },
                accessToken,
                refreshToken
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error during registration',
            code: 'SERVER_ERROR'
        });
    }
});

// Login user
app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                status: false,
                message: 'Username and password are required',
                code: 'MISSING_CREDENTIALS'
            });
        }

        // Find user by username or email
        const user = users.find(u => 
            u.username === username || 
            u.email === username
        );

        if (!user) {
            return res.status(401).json({
                status: false,
                message: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(401).json({
                status: false,
                message: 'Account is disabled. Please contact support.',
                code: 'ACCOUNT_DISABLED'
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                status: false,
                message: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Update last login
        user.lastLogin = new Date().toISOString();
        await saveUsers();

        // Generate tokens
        const accessToken = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        const refreshToken = jwt.sign(
            { id: user.id },
            JWT_REFRESH_SECRET,
            { expiresIn: '7d' }
        );

        refreshTokens.set(refreshToken, user.id);

        // Log session
        sessionLogs.unshift({
            id: uuidv4(),
            userId: user.id,
            username: user.username,
            action: 'login',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
        });
        await saveOtherData();

        res.json({
            status: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    stats: user.stats,
                    settings: user.settings
                },
                accessToken,
                refreshToken
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error during login',
            code: 'SERVER_ERROR'
        });
    }
});

// Refresh token
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                status: false,
                message: 'Refresh token required',
                code: 'NO_REFRESH_TOKEN'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        
        // Check if token exists in store
        if (!refreshTokens.has(refreshToken)) {
            return res.status(401).json({
                status: false,
                message: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }

        // Find user
        const user = users.find(u => u.id === decoded.id);
        if (!user || !user.isActive) {
            return res.status(401).json({
                status: false,
                message: 'User not found or inactive',
                code: 'USER_NOT_FOUND'
            });
        }

        // Generate new access token
        const newAccessToken = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            status: true,
            data: {
                accessToken: newAccessToken
            }
        });

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: false,
                message: 'Refresh token expired',
                code: 'REFRESH_TOKEN_EXPIRED'
            });
        }
        
        res.status(401).json({
            status: false,
            message: 'Invalid refresh token',
            code: 'INVALID_REFRESH_TOKEN'
        });
    }
});

// Logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        // Remove refresh token from store
        if (refreshToken) {
            refreshTokens.delete(refreshToken);
        }

        // Log logout
        sessionLogs.unshift({
            id: uuidv4(),
            userId: req.user.id,
            username: req.user.username,
            action: 'logout',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
        });
        await saveOtherData();

        res.json({
            status: true,
            message: 'Logout successful'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error during logout'
        });
    }
});

// Get current user profile
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
        const user = users.find(u => u.id === req.user.id);
        
        if (!user) {
            return res.status(404).json({
                status: false,
                message: 'User not found'
            });
        }

        res.json({
            status: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    stats: user.stats,
                    settings: user.settings,
                    createdAt: user.createdAt,
                    lastLogin: user.lastLogin
                }
            }
        });

    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// Update user profile
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
        const { email, settings } = req.body;
        const user = users.find(u => u.id === req.user.id);

        if (!user) {
            return res.status(404).json({
                status: false,
                message: 'User not found'
            });
        }

        // Update email if provided
        if (email && email !== user.email) {
            const emailExists = users.some(u => u.email === email && u.id !== user.id);
            if (emailExists) {
                return res.status(400).json({
                    status: false,
                    message: 'Email already in use'
                });
            }
            user.email = email;
        }

        // Update settings if provided
        if (settings) {
            user.settings = { ...user.settings, ...settings };
        }

        await saveUsers();

        res.json({
            status: true,
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    settings: user.settings
                }
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = users.find(u => u.id === req.user.id);

        if (!user) {
            return res.status(404).json({
                status: false,
                message: 'User not found'
            });
        }

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            return res.status(401).json({
                status: false,
                message: 'Current password is incorrect'
            });
        }

        // Validate new password
        if (newPassword.length < 6) {
            return res.status(400).json({
                status: false,
                message: 'New password must be at least 6 characters'
            });
        }

        // Update password
        user.password = await bcrypt.hash(newPassword, 10);
        await saveUsers();

        // Log password change
        sessionLogs.unshift({
            id: uuidv4(),
            userId: user.id,
            username: user.username,
            action: 'change_password',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
        });
        await saveOtherData();

        res.json({
            status: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// Get session logs (admin only)
app.get('/api/auth/sessions', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                status: false,
                message: 'Admin access required'
            });
        }

        const limit = parseInt(req.query.limit) || 100;
        const logs = sessionLogs.slice(0, limit);

        res.json({
            status: true,
            data: { sessions: logs }
        });

    } catch (error) {
        console.error('Session logs error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// ==================== COOKIE MANAGEMENT ENDPOINTS ====================

// Add cookie
app.post('/api/cookies/add', authenticateToken, async (req, res) => {
    try {
        const { cookie, name } = req.body;
        
        if (!cookie) {
            return res.status(400).json({
                status: false,
                message: 'Cookie is required'
            });
        }

        const user = users.find(u => u.id === req.user.id);
        if (!user) {
            return res.status(404).json({
                status: false,
                message: 'User not found'
            });
        }

        const newCookie = {
            id: uuidv4(),
            name: name || `Cookie ${user.cookies.length + 1}`,
            cookie: cookie,
            status: 'pending',
            createdAt: new Date().toISOString(),
            lastUsed: null,
            usageCount: 0,
            successRate: 0
        };

        user.cookies.push(newCookie);
        await saveUsers();

        res.json({
            status: true,
            message: 'Cookie added successfully',
            data: { cookie: newCookie }
        });

    } catch (error) {
        console.error('Add cookie error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// Get user cookies
app.get('/api/cookies/list', authenticateToken, async (req, res) => {
    try {
        const user = users.find(u => u.id === req.user.id);
        
        if (!user) {
            return res.status(404).json({
                status: false,
                message: 'User not found'
            });
        }

        const cookies = user.cookies.map(c => ({
            id: c.id,
            name: c.name,
            status: c.status,
            createdAt: c.createdAt,
            lastUsed: c.lastUsed,
            usageCount: c.usageCount,
            successRate: c.successRate,
            preview: c.cookie.substring(0, 50) + '...'
        }));

        res.json({
            status: true,
            data: { cookies }
        });

    } catch (error) {
        console.error('List cookies error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// Delete cookie
app.delete('/api/cookies/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user = users.find(u => u.id === req.user.id);
        
        if (!user) {
            return res.status(404).json({
                status: false,
                message: 'User not found'
            });
        }

        const cookieIndex = user.cookies.findIndex(c => c.id === id);
        if (cookieIndex === -1) {
            return res.status(404).json({
                status: false,
                message: 'Cookie not found'
            });
        }

        user.cookies.splice(cookieIndex, 1);
        await saveUsers();

        res.json({
            status: true,
            message: 'Cookie deleted successfully'
        });

    } catch (error) {
        console.error('Delete cookie error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// Clear all cookies
app.post('/api/cookies/clear', authenticateToken, async (req, res) => {
    try {
        const user = users.find(u => u.id === req.user.id);
        
        if (!user) {
            return res.status(404).json({
                status: false,
                message: 'User not found'
            });
        }

        user.cookies = [];
        await saveUsers();

        res.json({
            status: true,
            message: 'All cookies cleared successfully'
        });

    } catch (error) {
        console.error('Clear cookies error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// ==================== SHARE ENDPOINTS ====================

// Start share
app.post('/api/share', authenticateToken, async (req, res) => {
    const shareId = uuidv4();
    
    try {
        const { cookieId, link, limit } = req.body;
        
        if (!cookieId || !link || !limit) {
            return res.status(400).json({
                status: false,
                message: 'Cookie ID, link, and limit are required'
            });
        }

        const user = users.find(u => u.id === req.user.id);
        if (!user) {
            return res.status(404).json({
                status: false,
                message: 'User not found'
            });
        }

        const cookie = user.cookies.find(c => c.id === cookieId);
        if (!cookie) {
            return res.status(404).json({
                status: false,
                message: 'Cookie not found'
            });
        }

        const shareData = {
            id: shareId,
            userId: user.id,
            username: user.username,
            link: link,
            limit: parseInt(limit),
            cookieId: cookieId,
            status: 'processing',
            progress: 0,
            completed: 0,
            success: 0,
            failed: 0,
            startTime: new Date().toISOString(),
            endTime: null
        };

        shareLogs.unshift(shareData);
        await saveOtherData();

        res.json({
            status: true,
            message: 'Share started successfully',
            data: { shareId: shareId }
        });

        // Process share in background
        processShareAsync(shareId, shareData, cookie.cookie).catch(console.error);

    } catch (error) {
        console.error('Share error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// Get share progress
app.get('/api/share/:id/progress', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const share = shareLogs.find(s => s.id === id);
        
        if (!share) {
            return res.status(404).json({
                status: false,
                message: 'Share not found'
            });
        }

        if (share.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                status: false,
                message: 'Access denied'
            });
        }

        res.json({
            status: true,
            data: {
                share: {
                    id: share.id,
                    status: share.status,
                    progress: share.progress,
                    completed: share.completed,
                    total: share.limit,
                    success: share.success,
                    failed: share.failed,
                    startTime: share.startTime,
                    endTime: share.endTime
                }
            }
        });

    } catch (error) {
        console.error('Progress error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// Cancel share
app.post('/api/share/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const share = shareLogs.find(s => s.id === id);
        
        if (!share) {
            return res.status(404).json({
                status: false,
                message: 'Share not found'
            });
        }

        if (share.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                status: false,
                message: 'Access denied'
            });
        }

        share.status = 'cancelled';
        share.endTime = new Date().toISOString();
        await saveOtherData();

        res.json({
            status: true,
            message: 'Share cancelled successfully'
        });

    } catch (error) {
        console.error('Cancel share error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// Get share history
app.get('/api/history', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const userShares = shareLogs
            .filter(s => s.userId === req.user.id || req.user.role === 'admin')
            .slice(0, limit);

        res.json({
            status: true,
            data: { history: userShares }
        });

    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// Get active shares
app.get('/api/active-shares', authenticateToken, async (req, res) => {
    try {
        const active = shareLogs.filter(s => 
            (s.userId === req.user.id || req.user.role === 'admin') && 
            s.status === 'processing'
        );

        res.json({
            status: true,
            data: { active_shares: active }
        });

    } catch (error) {
        console.error('Active shares error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// Get stats
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const userShares = shareLogs.filter(s => 
            s.userId === req.user.id || req.user.role === 'admin'
        );
        
        const totalShares = userShares.length;
        const totalSuccess = userShares.reduce((sum, s) => sum + (s.success || 0), 0);
        const totalFailed = userShares.reduce((sum, s) => sum + (s.failed || 0), 0);
        const completedShares = userShares.filter(s => s.status === 'completed').length;
        const successRate = totalShares > 0 ? Math.round((completedShares / totalShares) * 100) : 0;
        
        const user = users.find(u => u.id === req.user.id);
        const activeCookies = user?.cookies.filter(c => c.status === 'active').length || 0;

        res.json({
            status: true,
            data: {
                stats: {
                    total_shares: totalShares,
                    total_successful_shares: totalSuccess,
                    total_failed_shares: totalFailed,
                    completed_shares: completedShares,
                    success_rate: successRate,
                    active_shares: shareLogs.filter(s => s.status === 'processing').length,
                    active_cookies: activeCookies,
                    total_cookies: user?.cookies.length || 0
                }
            }
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({
            status: false,
            message: 'Server error'
        });
    }
});

// ==================== HELPER FUNCTIONS ====================

async function processShareAsync(shareId, shareData, cookie) {
    // Simulate sharing process
    for (let i = 0; i < shareData.limit; i++) {
        // Check if cancelled
        const share = shareLogs.find(s => s.id === shareId);
        if (!share || share.status === 'cancelled') {
            break;
        }

        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Update progress
        share.completed = i + 1;
        share.progress = Math.round(((i + 1) / shareData.limit) * 100);
        
        // Simulate random success/failure (90% success rate for demo)
        if (Math.random() < 0.9) {
            share.success++;
        } else {
            share.failed++;
        }
        
        await saveOtherData();
    }
    
    // Finalize share
    const share = shareLogs.find(s => s.id === shareId);
    if (share && share.status !== 'cancelled') {
        share.status = 'completed';
        share.endTime = new Date().toISOString();
        await saveOtherData();
        
        // Update user stats
        const user = users.find(u => u.id === share.userId);
        if (user) {
            user.stats.totalShares = (user.stats.totalShares || 0) + 1;
            user.stats.successfulShares = (user.stats.successfulShares || 0) + share.success;
            user.stats.failedShares = (user.stats.failedShares || 0) + share.failed;
            await saveUsers();
        }
    }
}

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
    res.json({
        status: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        users: users.length,
        activeShares: shareLogs.filter(s => s.status === 'processing').length
    });
});

// ==================== SERVE FRONTEND ====================

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;

async function startServer() {
    await loadUsers();
    await loadOtherData();
    
    app.listen(PORT, () => {
        console.log(`\n🚀 Server running on http://localhost:${PORT}`);
        console.log(`📝 Default admin login:`);
        console.log(`   Username: admin`);
        console.log(`   Password: admin123`);
        console.log(`\n✨ Ready to accept requests!\n`);
    });
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await saveUsers();
    await saveOtherData();
    process.exit(0);
});