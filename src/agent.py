import os
from typing import Any

from langchain_community.agent_toolkits import SQLDatabaseToolkit
from langchain_community.utilities import SQLDatabase
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool

try:
    from langchain_community.agent_toolkits import create_sql_agent
except ImportError:  # pragma: no cover - compatibility fallback
    from langchain_community.agent_toolkits.sql import create_sql_agent

try:
    from langchain.agents import AgentType, initialize_agent
except ImportError:  # pragma: no cover - compatibility fallback
    AgentType = None
    initialize_agent = None

from .visualizer import DEFAULT_BOARD_SIZE, render_board


BOARD_SVG_MARKER = "BOARD_SVG::"


@tool("render_board")
def render_board_tool(fen: str) -> str:
    """Render a chess board from a FEN string and return SVG."""
    svg = render_board(fen, size=DEFAULT_BOARD_SIZE)
    return f"{BOARD_SVG_MARKER}{svg}"


SYSTEM_PROMPT = (
    "You are a chess coach. Use the SQL tools to query the database for stats. "
    "If the user asks to see a board position, call the render_board tool and "
    f"include its output verbatim in your final response so the UI can render it. "
    f"The output is prefixed with {BOARD_SVG_MARKER}."
)


def build_agent(db_path: str) -> Any:
    db = SQLDatabase.from_uri(f"sqlite:///{db_path}")
    llm = ChatOpenAI(
        temperature=0,
        model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
    )
    toolkit = SQLDatabaseToolkit(db=db, llm=llm)

    try:
        return create_sql_agent(
            llm=llm,
            toolkit=toolkit,
            verbose=False,
            extra_tools=[render_board_tool],
            prefix=SYSTEM_PROMPT,
            return_intermediate_steps=True,
        )
    except TypeError:
        if not initialize_agent or not AgentType:
            raise
        tools = toolkit.get_tools() + [render_board_tool]
        return initialize_agent(
            tools=tools,
            llm=llm,
            agent=AgentType.OPENAI_FUNCTIONS,
            verbose=False,
        )
