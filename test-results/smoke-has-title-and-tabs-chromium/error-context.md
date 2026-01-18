# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - heading "Import Games" [level=2] [ref=e4]
    - generic [ref=e5]:
      - generic [ref=e6]: Upload PGN File
      - button "Choose File" [ref=e7]
    - button "Upload & Process" [ref=e8] [cursor=pointer]
    - generic [ref=e9]:
      - heading "Search Games" [level=2] [ref=e10]
      - textbox "Search white, black, opening..." [ref=e11]
      - generic [ref=e13]: No games found.
    - generic [ref=e14]:
      - heading "Demo Board" [level=2] [ref=e15]
      - generic [ref=e17]:
        - button "Start Pos" [ref=e18] [cursor=pointer]
        - button "Ruy Lopez" [ref=e19] [cursor=pointer]
      - generic [ref=e20]:
        - generic [ref=e21]: Custom FEN
        - textbox [ref=e22]: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
  - main [ref=e23]:
    - generic [ref=e25]:
      - button "Dashboard & Chat" [ref=e26] [cursor=pointer]
      - button "Game Inspector (Replay)" [active] [ref=e27] [cursor=pointer]
    - generic [ref=e28]:
      - heading "Coach Chat" [level=2] [ref=e30]
      - generic [ref=e32]: Start a conversation with your chess coach
      - generic [ref=e33]:
        - textbox "Ask your coach" [ref=e34]
        - button "Send" [disabled] [ref=e35]
```