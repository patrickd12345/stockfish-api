import chess
import chess.svg


DEFAULT_BOARD_SIZE = 400


def render_board(fen: str, size: int = DEFAULT_BOARD_SIZE) -> str:
    board = chess.Board(fen)
    return chess.svg.board(board=board, size=size)
