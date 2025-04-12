FROM python:3.10-slim

RUN apt-get update && apt-get install -y curl wget unzip git build-essential

# Download Stockfish from GitHub Releases instead of stockfishchess.org
RUN curl -L -o /usr/local/bin/stockfish https://github.com/official-stockfish/Stockfish/releases/download/sf_15/stockfish-ubuntu-x86-64 \
    && chmod +x /usr/local/bin/stockfish

WORKDIR /app
COPY . .

RUN pip install --no-cache-dir -r requirements.txt

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]