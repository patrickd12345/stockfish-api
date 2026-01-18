# Chess Coach - Stockfish API

A chess analysis and coaching application built with Next.js and deployed on Vercel.

## Features

- **PGN Analysis**: Upload and analyze chess games from PGN files
- **AI Coach**: Interactive chat with an AI chess coach powered by LangChain and OpenAI
- **Game Inspector**: Replay and analyze games move by move
- **Stockfish Integration**: Chess engine analysis with centipawn loss and blunder detection
- **Semantic Game Search**: Vector embeddings for game retrieval

## Deployment to Vercel

### Prerequisites

1. A Vercel account
2. A Vercel Postgres database
3. A Vercel AI Gateway + Virtual Key

### Setup Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set up Postgres**
   - **Vercel Postgres**: Vercel Dashboard → Storage → Create Database → Postgres
   - **Neon** (recommended, portable): [neon.tech](https://neon.tech) → create project → copy connection string
   - Set `POSTGRES_URL` to your connection string

3. **Set Environment Variables in Vercel**
  - `POSTGRES_URL`: Your Vercel Postgres connection string
  - `OPENAI_MODEL`: (Optional) OpenAI model to use (default: gpt-4o-mini)
  - `OPENAI_EMBEDDING_MODEL`: (Optional) Embedding model (default: text-embedding-3-small)
  - `STOCKFISH_TIME_LIMIT_MS`: (Optional) Stockfish time per eval in ms (default: 100)
  - `VERCEL_AI_GATEWAY_ID`: Your Vercel AI Gateway ID
  - `VERCEL_VIRTUAL_KEY`: Your Vercel AI Gateway virtual key

4. **Initialize Database**
   - Run the SQL from `lib/sql/schema.sql` in your Postgres database (Vercel Postgres SQL Editor, Neon SQL Editor, or `psql`)

5. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```

6. **Configure Custom Domain**
   - In Vercel dashboard, go to your project settings
   - Add custom domain: `mychesscoach.bookiji.com`
   - Follow DNS configuration instructions

### Local Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Environment Variables**
   Create a `.env.local` file:
   ```
  POSTGRES_URL=postgresql://...   # Neon, Vercel Postgres, or any Postgres
  OPENAI_MODEL=gpt-4o-mini
  OPENAI_EMBEDDING_MODEL=text-embedding-3-small
  STOCKFISH_TIME_LIMIT_MS=100
  VERCEL_AI_GATEWAY_ID=your_gateway_id
  VERCEL_VIRTUAL_KEY=your_virtual_key
  ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Initialize Database**
   Run the SQL from `lib/sql/schema.sql` in your Postgres database before using the API.

## Project Structure

```
├── app/                 # Next.js app directory
│   ├── api/            # API routes
│   ├── page.tsx        # Main page
│   └── layout.tsx      # Root layout
├── components/         # React components
├── lib/               # Library functions
│   ├── agent.ts       # LangChain agent setup
│   ├── analysis.ts    # PGN analysis
│   ├── database.ts    # Database utilities
│   └── visualizer.ts  # Chess board visualization
└── vercel.json        # Vercel configuration
```

## Notes

- **Stockfish**: Runs the bundled Stockfish binary for engine evaluation. Increase `STOCKFISH_TIME_LIMIT_MS` for deeper analysis.
- **Vector Search**: Requires `pgvector` (`CREATE EXTENSION vector;`). See `lib/sql/schema.sql`.
- **Database**: PostgreSQL via `POSTGRES_URL` (Neon, Vercel Postgres, or any Postgres). Use `@neondatabase/serverless` for serverless.
- **Chess Engine**: The app uses `chess.js` for move validation and board representation.

## License

See LICENSE file for details.
