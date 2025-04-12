from fastapi import FastAPI
from pydantic import BaseModel
import subprocess

app = FastAPI()

class EvalRequest(BaseModel):
    fen: str
    depth: int = 15

@app.post("/eval")
def evaluate_position(req: EvalRequest):
    process = subprocess.Popen(
        ['./stockfish'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True
    )

    commands = f"position fen {req.fen}\ngo depth {req.depth}\n"
    process.stdin.write(commands)
    process.stdin.flush()

    output = []
    while True:
        line = process.stdout.readline()
        if line == '' or "bestmove" in line:
            output.append(line.strip())
            break
        output.append(line.strip())

    process.terminate()
    return {"output": output}