# Use official Python base image
FROM python:3.11-slim

# Set work directory
WORKDIR /app

# Install dependencies (curl + unzip for downloading stockfish)
RUN apt-get update && apt-get install -y curl unzip && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy only requirement file first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Download Stockfish 16 AVX2 Linux binary
RUN apt-get update && apt-get install -y wget unzip && \
    wget -O stockfish.zip https://github.com/official-stockfish/Stockfish/releases/download/sf_16/stockfish-ubuntu-x86-64-avx2.zip && \
    unzip stockfish.zip && \
    mv stockfish/* stockfish && \
    chmod +x stockfish && \
    rm -rf stockfish.zip stockfish/*




# Expose port for FastAPI
EXPOSE 8000

# Launch FastAPI using uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
 
