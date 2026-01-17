import io
from typing import Any, Dict

import chess.pgn
import streamlit as st

from src import analysis, database
from src.agent import BOARD_SVG_MARKER, build_agent
from src.visualizer import DEFAULT_BOARD_SIZE, render_board


DB_PATH = database.DEFAULT_DB_PATH


def ensure_session_state() -> None:
    st.session_state.setdefault("chat_history", [])
    st.session_state.setdefault("current_pgn", None)
    st.session_state.setdefault("stockfish_path", "./stockfish")
    st.session_state.setdefault("username", "")


def make_svg_responsive(svg: str, size: int = DEFAULT_BOARD_SIZE) -> str:
    svg = svg.replace(f'width="{size}"', 'width="100%"')
    svg = svg.replace(f'height="{size}"', 'height="100%"')
    return f'<div style="max-width: {size}px; width: 100%;">{svg}</div>'


def normalize_agent_response(response: Any) -> str:
    if isinstance(response, dict):
        output = response.get("output", "")
        steps = response.get("intermediate_steps", [])
        for step in steps:
            if isinstance(step, tuple) and len(step) >= 2:
                tool_output = step[1]
                if isinstance(tool_output, str) and BOARD_SVG_MARKER in tool_output:
                    output = f"{output}\n{tool_output}".strip()
        return output
    return str(response)


def render_chat_content(content: str) -> None:
    remaining = content or ""
    while BOARD_SVG_MARKER in remaining:
        before, after = remaining.split(BOARD_SVG_MARKER, 1)
        if before.strip():
            st.markdown(before)
        svg_end = after.find("</svg>")
        if svg_end == -1:
            st.markdown(after)
            return
        svg = after[: svg_end + len("</svg>")]
        st.markdown(make_svg_responsive(svg), unsafe_allow_html=True)
        remaining = after[svg_end + len("</svg>") :]
    if remaining.strip():
        st.markdown(remaining)


@st.cache_resource
def load_agent(db_path: str):
    return build_agent(db_path)


def process_pgn(pgn_text: str, stockfish_path: str, username: str) -> None:
    if not pgn_text.strip():
        st.warning("Uploaded PGN is empty.")
        return

    try:
        results = analysis.analyze_pgn(pgn_text, stockfish_path, username)
    except FileNotFoundError as exc:
        st.error(str(exc))
        return
    except Exception as exc:
        st.error(f"Failed to analyze PGN: {exc}")
        return

    if not results:
        st.warning("No games found in the PGN.")
        return

    with database.get_connection(DB_PATH) as conn:
        for entry in results:
            game_id = database.insert_game(conn, entry["game"])
            database.insert_moves(conn, game_id, entry["moves"])

    st.success(f"Processed {len(results)} game(s).")


def load_games() -> Dict[int, dict]:
    with database.get_connection(DB_PATH) as conn:
        games = database.fetch_games(conn)
    return {int(row["id"]): dict(row) for row in games}


def render_replay_tab() -> None:
    st.subheader("Game Inspector")
    games = load_games()
    if not games:
        st.info("No games processed yet.")
        return

    def format_game(game_id: int) -> str:
        game = games[game_id]
        white = game.get("white") or "White"
        black = game.get("black") or "Black"
        date = game.get("date") or "Unknown date"
        result = game.get("result") or "*"
        return f"{white} vs {black} ({date}) {result}"

    game_ids = list(games.keys())
    selected_game_id = st.selectbox("Select Game", game_ids, format_func=format_game)

    with database.get_connection(DB_PATH) as conn:
        pgn_text = database.fetch_game_pgn(conn, int(selected_game_id))

    if not pgn_text:
        st.error("Unable to load the selected game's PGN.")
        return

    st.session_state.current_pgn = pgn_text
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if not game:
        st.error("Failed to parse PGN for replay.")
        return

    moves = list(game.mainline_moves())
    max_step = len(moves)
    step = st.slider("Move", min_value=0, max_value=max_step, value=0)

    board = game.board()
    for move in moves[:step]:
        board.push(move)

    svg = render_board(board.fen(), size=DEFAULT_BOARD_SIZE)
    st.markdown(make_svg_responsive(svg), unsafe_allow_html=True)


def render_chat_tab() -> None:
    st.subheader("Coach Chat")

    for message in st.session_state.chat_history:
        with st.chat_message(message["role"]):
            if message["role"] == "assistant":
                render_chat_content(message["content"])
            else:
                st.markdown(message["content"])

    prompt = st.chat_input("Ask your coach")
    if not prompt:
        return

    st.session_state.chat_history.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        try:
            agent = load_agent(DB_PATH)
            if hasattr(agent, "invoke"):
                response = agent.invoke({"input": prompt})
            else:
                response = agent.run(prompt)
            content = normalize_agent_response(response)
        except Exception as exc:
            content = f"Unable to contact the coach: {exc}"
        render_chat_content(content)

    st.session_state.chat_history.append({"role": "assistant", "content": content})


def main() -> None:
    st.set_page_config(page_title="Chess Coach", layout="wide")
    ensure_session_state()
    database.init_db(DB_PATH)

    with st.sidebar:
        st.header("Upload & Settings")
        uploaded_pgn = st.file_uploader("Upload PGN", type=["pgn"])
        stockfish_path = st.text_input(
            "Stockfish Path", value=st.session_state.stockfish_path
        )
        username = st.text_input("My Username", value=st.session_state.username)
        process_clicked = st.button("Process Games")

        st.session_state.stockfish_path = stockfish_path
        st.session_state.username = username

        if process_clicked:
            if uploaded_pgn is None:
                st.error("Please upload a PGN file before processing.")
            else:
                pgn_text = uploaded_pgn.read().decode("utf-8", errors="ignore")
                with st.spinner("Analyzing games with Stockfish..."):
                    process_pgn(pgn_text, stockfish_path, username)

    tab_chat, tab_replay = st.tabs(["Dashboard & Chat", "Game Inspector (Replay)"])

    with tab_chat:
        render_chat_tab()

    with tab_replay:
        render_replay_tab()


if __name__ == "__main__":
    main()