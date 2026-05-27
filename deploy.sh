#!/bin/bash

# Render Deployment Helper Script

echo "🚀 Preparing for Render deployment..."

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install git first."
    exit 1
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "📁 Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit for Render deployment"
fi

# Create necessary directories
mkdir -p backend/logs backend/data frontend/css frontend/js

echo "✅ Directory structure created"

echo ""
echo "📋 Next steps for Render deployment:"
echo "1. Push this code to GitHub:"
echo "   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git"
echo "   git push -u origin main"
echo ""
echo "2. Go to https://dashboard.render.com"
echo "3. Click 'New +' → 'Web Service'"
echo "4. Connect your GitHub repository"
echo "5. Use these settings:"
echo "   - Build Command: cd backend && npm install && npm run build"
echo "   - Start Command: cd backend && npm start"
echo "6. Add environment variables:"
echo "   - JWT_SECRET: $(openssl rand -base64 32 2>/dev/null || echo 'generate-random-secret')"
echo "   - SESSION_SECRET: $(openssl rand -base64 32 2>/dev/null || echo 'generate-random-secret-2')"
echo "   - NODE_ENV: production"
echo ""
echo "7. Click 'Create Web Service'"
echo ""
echo "✅ Default login: admin / admin123"