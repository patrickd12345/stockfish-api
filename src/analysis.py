import io
import os
import shutil
from typing import Dict, List, Optional

import chess
import chess.engine
import chess.pgn

from urllib.parse import unquote, urlparse

ENGINE_TIME_LIMIT = 0.1
BLUNDER_THRESHOLD = 200
MATE_SCORE = 100000


def resolve_stockfish_path(stockfish_path: str) -> str:
    candidates = [stockfish_path, "./stockfish", "stockfish"]
    for candidate in candidates:
        if not candidate:
            continue
        if os.path.isfile(candidate):
            return candidate
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    raise FileNotFoundError(
        "Stockfish binary not found. Provide a valid path in the sidebar."
    )


def identify_user_color(headers: Dict[str, str], username: str) -> Optional[str]:
    if not username:
        return None
    normalized = username.strip().lower()
    if normalized and headers.get("White", "").strip().lower() == normalized:
        return "white"
    if normalized and headers.get("Black", "").strip().lower() == normalized:
        return "black"
    return None


def score_to_cp(score: chess.engine.PovScore) -> int:
    return int(score.score(mate_score=MATE_SCORE))


def evaluate_position(board: chess.Board, engine: chess.engine.SimpleEngine) -> int:
    info = engine.analyse(board, chess.engine.Limit(time=ENGINE_TIME_LIMIT))
    return score_to_cp(info["score"].pov(chess.WHITE))


def centipawn_loss(before_cp: int, after_cp: int, my_color: str) -> int:
    before_pov = before_cp if my_color == "white" else -before_cp
    after_pov = after_cp if my_color == "white" else -after_cp
    loss = before_pov - after_pov
    return int(max(0, loss))


def accuracy_from_losses(losses: List[int]) -> Optional[float]:
    if not losses:
        return None
    avg_loss = sum(losses) / len(losses)
    accuracy = 100.0 - (avg_loss / 2.0)
    return float(max(0.0, min(100.0, accuracy)))


def analyze_game(
    game: chess.pgn.Game, engine: chess.engine.SimpleEngine, username: str
) -> Dict:
    headers = game.headers
    my_color = identify_user_color(headers, username)

    board = game.board()
    moves: List[Dict] = []
    losses: List[int] = []
    blunders = 0
    ply = 0

    for move in game.mainline_moves():
        ply += 1
        move_number = board.fullmove_number
        move_san = board.san(move)
        is_user_move = (
            my_color == "white"
            and board.turn == chess.WHITE
            or my_color == "black"
            and board.turn == chess.BLACK
        )
        engine_eval = None
        is_blunder = False

        if is_user_move:
            eval_before = evaluate_position(board, engine)
            board.push(move)
            eval_after = evaluate_position(board, engine)
            engine_eval = eval_after
            loss = centipawn_loss(eval_before, eval_after, my_color)
            losses.append(loss)
            if loss > BLUNDER_THRESHOLD:
                is_blunder = True
                blunders += 1
        else:
            board.push(move)

        moves.append(
            {
                "move_number": move_number,
                "ply": ply,
                "fen": board.fen(),
                "move_san": move_san,
                "engine_eval": engine_eval,
                "is_blunder": is_blunder,
            }
        )

    game_pgn = game.accept(
        chess.pgn.StringExporter(headers=True, variations=False, comments=False)
    )

    return {
        "game": {
            "date": headers.get("Date"),
            "white": headers.get("White"),
            "black": headers.get("Black"),
            "result": headers.get("Result"),
            "opening_name": derive_opening_name(headers),
            "my_accuracy": accuracy_from_losses(losses),
            "blunders": blunders,
            "pgn_text": game_pgn,
        },
        "moves": moves,
    }


def analyze_pgn(
    pgn_text: str, stockfish_path: str, username: str
) -> List[Dict]:
    if not pgn_text.strip():
        return []

    engine_path = resolve_stockfish_path(stockfish_path)
    results: List[Dict] = []

    with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
        stream = io.StringIO(pgn_text)
        while True:
            game = chess.pgn.read_game(stream)
            if game is None:
                break
            results.append(analyze_game(game, engine, username))

    return results


def derive_opening_name(headers: Dict[str, str]) -> Optional[str]:
    opening = normalize_opening_name(headers.get("Opening"))
    if opening:
        return opening

    eco_url = normalize_opening_name(headers.get("ECOUrl"))
    if eco_url:
        eco_url_name = opening_name_from_eco_url(eco_url)
        if eco_url_name:
            return eco_url_name

    eco = normalize_opening_name(headers.get("ECO"))
    if eco:
        return f"ECO {eco}"

    return None


def normalize_opening_name(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def opening_name_from_eco_url(eco_url: str) -> Optional[str]:
    try:
        parsed = urlparse(eco_url)
        path = parsed.path.strip("/")
        if not path:
            return None
        last_segment = path.split("/")[-1]
        if not last_segment:
            return None
        decoded = unquote(last_segment)
        normalized = decoded.replace("-", " ").replace("_", " ").strip()
        normalized = " ".join(normalized.split())
        return normalized if normalized else None
    except Exception:
        return None
