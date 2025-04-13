# Start from Ubuntu and install Python and Stockfish
FROM ubuntu:22.04

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 python3-pip curl unzip stockfish && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy your files
COPY requirements.txt .

# Install Python deps
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy the rest of your app
COPY . .

# Confirm Stockfish is available
RUN stockfish --version

# Expose port and launch
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
