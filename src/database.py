import os
import sqlite3
from typing import Iterable, List, Optional


DEFAULT_DB_PATH = os.path.join(os.getcwd(), "data", "chess_coach.db")


def _ensure_db_dir(db_path: str) -> None:
    folder = os.path.dirname(db_path)
    if folder:
        os.makedirs(folder, exist_ok=True)


def get_connection(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    _ensure_db_dir(db_path)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str = DEFAULT_DB_PATH) -> None:
    _ensure_db_dir(db_path)
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT,
                white TEXT,
                black TEXT,
                result TEXT,
                opening_name TEXT,
                my_accuracy REAL,
                blunders INTEGER,
                pgn_text TEXT
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS moves (
                game_id INTEGER,
                move_number INTEGER,
                ply INTEGER,
                fen TEXT,
                move_san TEXT,
                engine_eval INTEGER,
                is_blunder INTEGER,
                FOREIGN KEY(game_id) REFERENCES games(id)
            )
            """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_moves_game_ply ON moves(game_id, ply)"
        )
        conn.commit()


def insert_game(conn: sqlite3.Connection, game_data: dict) -> int:
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO games (
            date, white, black, result, opening_name, my_accuracy, blunders, pgn_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            game_data.get("date"),
            game_data.get("white"),
            game_data.get("black"),
            game_data.get("result"),
            game_data.get("opening_name"),
            game_data.get("my_accuracy"),
            game_data.get("blunders"),
            game_data.get("pgn_text"),
        ),
    )
    conn.commit()
    return int(cursor.lastrowid)


def insert_moves(
    conn: sqlite3.Connection, game_id: int, moves: Iterable[dict]
) -> None:
    cursor = conn.cursor()
    cursor.executemany(
        """
        INSERT INTO moves (
            game_id, move_number, ply, fen, move_san, engine_eval, is_blunder
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                game_id,
                move.get("move_number"),
                move.get("ply"),
                move.get("fen"),
                move.get("move_san"),
                move.get("engine_eval"),
                int(bool(move.get("is_blunder"))),
            )
            for move in moves
        ],
    )
    conn.commit()


def fetch_games(conn: sqlite3.Connection) -> List[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, date, white, black, result, opening_name, my_accuracy, blunders
        FROM games
        ORDER BY id DESC
        """
    )
    return cursor.fetchall()


def fetch_game_pgn(conn: sqlite3.Connection, game_id: int) -> Optional[str]:
    cursor = conn.cursor()
    cursor.execute("SELECT pgn_text FROM games WHERE id = ?", (game_id,))
    row = cursor.fetchone()
    if not row:
        return None
    return row["pgn_text"]
