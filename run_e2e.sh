#!/bin/bash
set -e

# 1. Safety Check: Ensure the binary exists
if [ ! -f "stockfish" ]; then
    echo "❌ Error: 'stockfish' binary not found!"
    echo "   Please ensure the Linux binary named 'stockfish' is in this folder."
    exit 1
fi

echo "🔹 Step 1: Configuring Exclusions..."
# Exclude heavy folders to make the build instant
cat > .dockerignore <<EOF
node_modules
.next
.git
.vercel
test-results
tmp
coverage
EOF

echo "🔹 Step 2: Configuring Container..."
# UPDATED: Changed from v1.50.0 to v1.57.0 to match your package.json
cat > Dockerfile.e2e <<EOF
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# 1. Install Stockfish (From your local file)
COPY stockfish /usr/local/bin/stockfish
RUN chmod +x /usr/local/bin/stockfish

# 2. Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# 3. Copy Source Code
COPY . .

# 4. Build App
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 5. Run Tests
CMD ["npm", "run", "test:e2e"]
EOF

echo "🔹 Step 3: Building Container..."
docker build -f Dockerfile.e2e -t stockfish-e2e .

echo "🔹 Step 4: Running Tests..."
# The results will appear in this terminal window.
docker run --ipc=host --rm stockfish-e2e

echo "🔹 Step 5: Cleanup..."
rm Dockerfile.e2e