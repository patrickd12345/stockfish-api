FROM python:3.10-slim

RUN apt-get update && apt-get install -y curl wget unzip git build-essential

# Download Stockfish
RUN curl -LO https://stockfishchess.org/files/stockfish-ubuntu-x86-64-modern.zip && \
    unzip stockfish-ubuntu-x86-64-modern.zip && \
    mv stockfish/* /usr/local/bin/ && \
    chmod +x /usr/local/bin/stockfish

WORKDIR /app
COPY . .

RUN pip install --no-cache-dir -r requirements.txt

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]