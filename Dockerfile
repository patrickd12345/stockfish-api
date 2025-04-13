# Use full Debian to ensure apt has stockfish
FROM debian:bullseye

# Set workdir
WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y \
    python3 python3-pip curl unzip stockfish && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy Python deps
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy app
COPY . .

# Optional: check if Stockfish is ready (helpful for debugging)
RUN stockfish --version

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
