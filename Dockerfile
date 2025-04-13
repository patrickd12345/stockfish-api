# Stage 1: Base with Stockfish installed 
FROM officialstockfish/stockfish:latest AS stockfish

# Stage 2: Your Python API
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY . .

# Copy Stockfish binary from Stage 1
COPY --from=stockfish /usr/local/bin/stockfish /usr/local/bin/stockfish
RUN chmod +x /usr/local/bin/stockfish

# Debug: show Stockfish version
RUN stockfish bench 1 || true

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
