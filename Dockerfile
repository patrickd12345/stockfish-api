# Use Debian base with Stockfish preinstalled via apt
FROM python:3.11-slim

WORKDIR /app

# Install dependencies including stockfish via apt
RUN apt-get update && apt-get install -y stockfish curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Confirm stockfish is available
RUN stockfish --version

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
