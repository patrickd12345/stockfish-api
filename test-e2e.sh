#!/bin/bash
set -e

echo "🔹 Step 1: Configuring Test Container..."
# We create a disposable Dockerfile that uses Microsoft's Playwright image.
# This image contains ALL the missing libraries (libatk, libgtk, etc.)
cat > Dockerfile.e2e <<EOF
FROM mcr.microsoft.com/playwright:v1.50.0-jammy

WORKDIR /app

# 1. Install Stockfish (Required for the app logic)
# We copy a known good binary from the official image
COPY --from=officialstockfish/stockfish:latest /usr/local/bin/stockfish /usr/local/bin/stockfish
RUN chmod +x /usr/local/bin/stockfish

# 2. Install Node Dependencies
COPY package.json package-lock.json* ./
# 'npm ci' ensures a clean install inside the container
RUN npm ci

# 3. Copy Your Code
COPY . .

# 4. Build the App (Required for E2E tests)
# We disable telemetry to speed up the build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 5. The Command to Run
CMD ["npm", "run", "test:e2e"]
EOF

echo "🔹 Step 2: Building Container (This may take a minute)..."
# Build the container image tagged 'stockfish-e2e'
docker build -f Dockerfile.e2e -t stockfish-e2e .

echo "🔹 Step 3: Running Tests..."
# --ipc=host: Prevents memory crashes in Chrome
# --rm: Deletes the container after the test finishes
docker run --ipc=host --rm stockfish-e2e

echo "🔹 Step 4: Cleanup..."
rm Dockerfile.e2e