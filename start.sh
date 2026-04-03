#!/bin/bash
set -e

echo ""
echo "🚀 InvoiceHub — Club Brugge"
echo "================================"

# Install server deps
if [ ! -d "server/node_modules" ]; then
  echo "📦 Installing server dependencies..."
  cd server && npm install && cd ..
fi

# Install client deps
if [ ! -d "client/node_modules" ]; then
  echo "📦 Installing client dependencies..."
  cd client && npm install && cd ..
fi

# Build client
echo "🔨 Building client..."
cd client && npm run build && cd ..

echo ""
echo "✅ InvoiceHub is starting at http://localhost:3456"
echo ""

node server/index.js
