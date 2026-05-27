// setup.js
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');

async function setup() {
    // Create data directory
    try {
        await fs.mkdir('./data', { recursive: true });
        console.log('✅ Data directory created');
    } catch (err) {
        console.log('📁 Data directory already exists');
    }

    // Create users.json with default admin
    const adminPassword = await bcrypt.hash('admin123', 10);
    const defaultUsers = [{
        id: 1,
        username: 'admin404',
        email: 'halimaw@mail.com',
        password: halimaw123,
        role: 'admin',
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
    }];

    await fs.writeFile('./data/users.json', JSON.stringify(defaultUsers, null, 2));
    console.log('✅ users.json created with default admin account');

    // Create empty share_logs.json
    await fs.writeFile('./data/share_logs.json', JSON.stringify([], null, 2));
    console.log('✅ share_logs.json created');

    // Create empty session_logs.json
    await fs.writeFile('./data/session_logs.json', JSON.stringify([], null, 2));
    console.log('✅ session_logs.json created');

    console.log('\n📝 Setup complete!');
    console.log('🔐 Default login credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('\n🚀 You can now run: npm start');
}

setup();