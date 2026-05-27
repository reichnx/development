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

// User agents for rotation
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1"
];

// Load users from file
async function loadUsers() {
    try {
        const data = await fs.readFile('./data/users.json', 'utf8');
        users = JSON.parse(data);
        console.log(`✅ Loaded ${users.length} users from database`);
    } catch (err) {
        console.log('📝 No existing users found, creating default admin account...');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        users = [{
            id: 1,
            username: 'admin',
            email: 'admin@sharemaster.com',
            password: hashedPassword,
            role: 'admin',
            isActive: true,
            cookies: [],
            stats: {
                totalShares: 0,
                successfulShares: 0,
                failedShares: 0,
                totalCookies: 0
            },
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

// Token extraction function
async function extractToken(cookie) {
    try {
        const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        const response = await axios.get('https://business.facebook.com/business_locations', {
            headers: {
                'User-Agent': ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cookie': cookie,
                'Connection': 'keep-alive'
            },
            timeout: 15000
        });
        
        const patterns = [
            /"accessToken":"([^"]+)"/,
            /access_token=([^&"\s]+)/,
            /EAAG\w+/,
            /EAA[A-Za-z0-9]{50,}/
        ];
        
        for (const pattern of patterns) {
            const match = response.data.match(pattern);
            if (match) {
                const token = match[1] || match[0];
                if (token && token.length > 30) {
                    return token;
                }
            }
        }
        return null;
    } catch (err) {
        console.error('Token extraction failed:', err.message);
        return null;
    }
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

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { status: false, message: 'Too many attempts. Try again later.' }
});

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ status: false, message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ status: false, message: 'Invalid or expired token' });
        }
        
        const existingUser = users.find(u => u.id === user.id);
        if (!existingUser || !existingUser.isActive) {
            return res.status(401).json({ status: false, message: 'User not found' });
        }
        
        req.user = user;
        next();
    });
}

// ==================== AUTHENTICATION ENDPOINTS ====================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ status: false, message: 'All fields are required' });
        }

        if (username.length < 3) {
            return res.status(400).json({ status: false, message: 'Username must be at least 3 characters' });
        }

        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            return res.status(400).json({ status: false, message: 'Invalid email format' });
        }

        if (password.length < 6) {
            return res.status(400).json({ status: false, message: 'Password must be at least 6 characters' });
        }

        const existingUser = users.find(u => u.username === username || u.email === email);
        if (existingUser) {
            return res.status(400).json({ status: false, message: 'Username or email already exists' });
        }

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
                failedShares: 0,
                totalCookies: 0
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

        const accessToken = jwt.sign(
            { id: newUser.id, username: newUser.username, role: newUser.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        const refreshToken = jwt.sign({ id: newUser.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
        refreshTokens.set(refreshToken, newUser.id);

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
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ status: false, message: 'Username and password required' });
        }

        const user = users.find(u => u.username === username || u.email === username);
        if (!user) {
            return res.status(401).json({ status: false, message: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(401).json({ status: false, message: 'Account disabled' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ status: false, message: 'Invalid credentials' });
        }

        user.lastLogin = new Date().toISOString();
        await saveUsers();

        const accessToken = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        const refreshToken = jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
        refreshTokens.set(refreshToken, user.id);

        // Log session
        sessionLogs.unshift({
            id: uuidv4(),
            userId: user.id,
            username: user.username,
            action: 'login',
            ip: req.ip,
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
                    stats: user.stats
                },
                accessToken,
                refreshToken
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ status: false, message: 'Refresh token required' });
        }

        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        
        if (!refreshTokens.has(refreshToken)) {
            return res.status(401).json({ status: false, message: 'Invalid refresh token' });
        }

        const user = users.find(u => u.id === decoded.id);
        if (!user || !user.isActive) {
            return res.status(401).json({ status: false, message: 'User not found' });
        }

        const newAccessToken = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ status: true, data: { accessToken: newAccessToken } });

    } catch (error) {
        res.status(401).json({ status: false, message: 'Invalid refresh token' });
    }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (refreshToken) {
            refreshTokens.delete(refreshToken);
        }
        res.json({ status: true, message: 'Logout successful' });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

// ==================== COOKIE MANAGEMENT ====================

app.post('/api/cookies/add', authenticateToken, async (req, res) => {
    try {
        const { cookie, name } = req.body;
        
        if (!cookie) {
            return res.status(400).json({ status: false, message: 'Cookie is required' });
        }

        const user = users.find(u => u.id === req.user.id);
        if (!user) {
            return res.status(404).json({ status: false, message: 'User not found' });
        }

        // Validate cookie by extracting token
        const token = await extractToken(cookie);
        const isValid = token !== null;
        
        const newCookie = {
            id: uuidv4(),
            name: name || `Cookie ${user.cookies.length + 1}`,
            cookie: cookie,
            status: isValid ? 'active' : 'invalid',
            createdAt: new Date().toISOString(),
            lastUsed: null,
            usageCount: 0,
            successRate: 0
        };

        user.cookies.push(newCookie);
        user.stats.totalCookies = user.cookies.length;
        await saveUsers();

        res.json({
            status: true,
            message: isValid ? 'Cookie added and validated successfully!' : 'Cookie added but validation failed. Check your cookie string.',
            data: { cookie: newCookie }
        });

    } catch (error) {
        console.error('Add cookie error:', error);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

app.get('/api/cookies/list', authenticateToken, async (req, res) => {
    try {
        const user = users.find(u => u.id === req.user.id);
        
        if (!user) {
            return res.status(404).json({ status: false, message: 'User not found' });
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

        res.json({ status: true, data: { cookies } });

    } catch (error) {
        console.error('List cookies error:', error);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

app.delete('/api/cookies/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user = users.find(u => u.id === req.user.id);
        
        if (!user) {
            return res.status(404).json({ status: false, message: 'User not found' });
        }

        const cookieIndex = user.cookies.findIndex(c => c.id === id);
        if (cookieIndex === -1) {
            return res.status(404).json({ status: false, message: 'Cookie not found' });
        }

        user.cookies.splice(cookieIndex, 1);
        user.stats.totalCookies = user.cookies.length;
        await saveUsers();

        res.json({ status: true, message: 'Cookie deleted successfully' });

    } catch (error) {
        console.error('Delete cookie error:', error);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

app.post('/api/cookies/clear', authenticateToken, async (req, res) => {
    try {
        const user = users.find(u => u.id === req.user.id);
        
        if (!user) {
            return res.status(404).json({ status: false, message: 'User not found' });
        }

        user.cookies = [];
        user.stats.totalCookies = 0;
        await saveUsers();

        res.json({ status: true, message: 'All cookies cleared' });

    } catch (error) {
        console.error('Clear cookies error:', error);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

app.post('/api/cookies/validate/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user = users.find(u => u.id === req.user.id);
        
        if (!user) {
            return res.status(404).json({ status: false, message: 'User not found' });
        }

        const cookie = user.cookies.find(c => c.id === id);
        if (!cookie) {
            return res.status(404).json({ status: false, message: 'Cookie not found' });
        }

        const token = await extractToken(cookie.cookie);
        cookie.status = token ? 'active' : 'invalid';
        await saveUsers();

        res.json({ 
            status: true, 
            message: token ? 'Cookie is valid' : 'Cookie is invalid',
            data: { status: cookie.status }
        });

    } catch (error) {
        console.error('Validate cookie error:', error);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

// ==================== SHARE ENDPOINTS ====================

app.post('/api/share', authenticateToken, async (req, res) => {
    const shareId = uuidv4();
    
    try {
        const { cookieId, link, limit } = req.body;
        
        if (!cookieId || !link || !limit) {
            return res.status(400).json({ status: false, message: 'Cookie ID, link, and limit are required' });
        }

        const user = users.find(u => u.id === req.user.id);
        if (!user) {
            return res.status(404).json({ status: false, message: 'User not found' });
        }

        const cookie = user.cookies.find(c => c.id === cookieId);
        if (!cookie) {
            return res.status(404).json({ status: false, message: 'Cookie not found' });
        }

        if (cookie.status !== 'active') {
            return res.status(400).json({ status: false, message: 'Cookie is not active. Please add a valid cookie.' });
        }

        const shareData = {
            id: shareId,
            userId: user.id,
            username: user.username,
            link: link,
            limit: parseInt(limit),
            cookieId: cookieId,
            cookieName: cookie.name,
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

        // Update cookie usage
        cookie.lastUsed = new Date().toISOString();
        cookie.usageCount++;
        await saveUsers();

        // Start share process
        processShareAsync(shareId, shareData, cookie.cookie).catch(console.error);

        res.json({
            status: true,
            message: 'Share started successfully',
            data: { shareId: shareId }
        });

    } catch (error) {
        console.error('Share error:', error);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

async function processShareAsync(shareId, shareData, cookie) {
    const token = await extractToken(cookie);
    
    if (!token) {
        const share = shareLogs.find(s => s.id === shareId);
        if (share) {
            share.status = 'failed';
            share.endTime = new Date().toISOString();
            await saveOtherData();
        }
        return;
    }

    for (let i = 0; i < shareData.limit; i++) {
        const share = shareLogs.find(s => s.id === shareId);
        if (!share || share.status === 'cancelled') {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        
        try {
            const response = await axios.post('https://graph.facebook.com/v18.0/me/feed', null, {
                params: {
                    link: shareData.link,
                    access_token: token,
                    published: 0
                },
                headers: {
                    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
                    'Cookie': cookie
                },
                timeout: 15000
            });

            if (response.data && response.data.id) {
                share.success++;
            } else {
                share.failed++;
            }
        } catch (err) {
            share.failed++;
            console.error(`Share ${i + 1} failed:`, err.message);
        }

        share.completed = i + 1;
        share.progress = Math.round(((i + 1) / shareData.limit) * 100);
        await saveOtherData();
    }

    const share = shareLogs.find(s => s.id === shareId);
    if (share && share.status !== 'cancelled') {
        share.status = share.success > 0 ? 'completed' : 'failed';
        share.endTime = new Date().toISOString();
        await saveOtherData();

        // Update user stats
        const user = users.find(u => u.id === share.userId);
        if (user) {
            user.stats.totalShares++;
            user.stats.successfulShares += share.success;
            user.stats.failedShares += share.failed;
            await saveUsers();
        }

        // Update cookie success rate
        const user2 = users.find(u => u.id === share.userId);
        const cookie = user2?.cookies.find(c => c.id === share.cookieId);
        if (cookie) {
            const totalAttempts = cookie.usageCount;
            const totalSuccess = cookie.successRate * (totalAttempts - 1) + share.success;
            cookie.successRate = totalAttempts > 0 ? Math.round(totalSuccess / totalAttempts) : 0;
            await saveUsers();
        }
    }
}

app.get('/api/share/:id/progress', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const share = shareLogs.find(s => s.id === id);
        
        if (!share) {
            return res.status(404).json({ status: false, message: 'Share not found' });
        }

        if (share.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ status: false, message: 'Access denied' });
        }

        res.json({ status: true, data: { share } });

    } catch (error) {
        console.error('Progress error:', error);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

app.post('/api/share/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const share = shareLogs.find(s => s.id === id);
        
        if (!share) {
            return res.status(404).json({ status: false, message: 'Share not found' });
        }

        if (share.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ status: false, message: 'Access denied' });
        }

        share.status = 'cancelled';
        share.endTime = new Date().toISOString();
        await saveOtherData();

        res.json({ status: true, message: 'Share cancelled' });

    } catch (error) {
        console.error('Cancel error:', error);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

app.get('/api/history', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const userShares = shareLogs
            .filter(s => s.userId === req.user.id || req.user.role === 'admin')
            .slice(0, limit);

        res.json({ status: true, data: { history: userShares } });

    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

app.get('/api/active-shares', authenticateToken, async (req, res) => {
    try {
        const active = shareLogs.filter(s => 
            (s.userId === req.user.id || req.user.role === 'admin') && 
            s.status === 'processing'
        );

        res.json({ status: true, data: { active_shares: active } });

    } catch (error) {
        console.error('Active shares error:', error);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const userShares = shareLogs.filter(s => s.userId === req.user.id || req.user.role === 'admin');
        
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
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: true,
        message: 'Server running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 5000;

async function startServer() {
    await loadUsers();
    await loadOtherData();
    
    app.listen(PORT, () => {
        console.log(`\n🚀 Server running on http://localhost:${PORT}`);
        console.log(`📝 Default login: admin / admin123`);
        console.log(`✨ Ready!\n`);
    });
}

startServer();

process.on('SIGTERM', async () => {
    await saveUsers();
    await saveOtherData();
    process.exit(0);
});