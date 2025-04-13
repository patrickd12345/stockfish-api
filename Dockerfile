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

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -yq unzip wget && \
    wget --content-disposition https://github.com/official-stockfish/Stockfish/releases/download/sf_16/stockfish-ubuntu-x86-64-avx2.zip -O stockfish.zip && \
    unzip stockfish.zip -d stockfish-dir && \
    mv stockfish-dir/stockfish* stockfish && \
    chmod +x stockfish && \
    rm -rf stockfish.zip stockfish-dir








# Expose port for FastAPI
EXPOSE 8000

# Launch FastAPI using uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
 
