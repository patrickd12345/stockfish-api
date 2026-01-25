# Chess Coach - Stockfish API

A chess analysis and coaching application built with Next.js and deployed on Vercel.

## Execution Invariant

Server-side engine analysis is a paid resource.

Rules:

- Local execution (WASM) must never invoke server analysis endpoints.
- Server analysis endpoints are Pro-only and are the sole place where Stockfish runs server-side.
- Plan limits and budgets apply only to server-side analysis.
- Cached reads are plan-agnostic.

Violating these rules breaks the business model.

## Features

- **PGN Analysis**: Upload and analyze chess games from PGN files
- **AI Coach**: Interactive chat with an AI chess coach powered by LangChain and OpenAI
- **Game Inspector**: Replay and analyze games move by move
- **Stockfish Integration**: Chess engine analysis with centipawn loss and blunder detection
- **Semantic Game Search**: Vector embeddings for game retrieval
- **Billing**: Stripe integration for Pro subscriptions (Monthly/Annual) with entitlement gating
- **Lichess Live Integration**: Play and analyze live games on Lichess with real-time AI commentary
- **Blunder DNA**: Pattern-based training system that identifies weaknesses and creates personalized drills
- **Post-Game Review Drills**: Convert AI coach suggestions into practice drills automatically

## Deployment to Vercel

### Prerequisites

1. A Vercel account
2. A Vercel Postgres database
3. A Vercel AI Gateway + Virtual Key
4. A Stripe Account

### Setup Steps

1. **Install Dependencies**
   ```bash
   pnpm install
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

  **Stripe Billing Variables:**
  - `STRIPE_SECRET_KEY`: Stripe Secret Key (e.g. `sk_live_...`)
  - `STRIPE_WEBHOOK_SECRET`: Stripe Webhook Secret (e.g. `whsec_...`)
  - `STRIPE_PRO_PRICE_ID_MONTHLY`: Price ID for Monthly Pro Plan (e.g. `price_...`)
  - `STRIPE_PRO_PRICE_ID_YEARLY`: Price ID for Yearly Pro Plan (e.g. `price_...`)
  - `STRIPE_CUSTOMER_PORTAL_RETURN_URL`: `https://your-domain.com/account`
  - `STRIPE_CHECKOUT_SUCCESS_URL`: `https://your-domain.com/billing/success?session_id={CHECKOUT_SESSION_ID}`
  - `STRIPE_CHECKOUT_CANCEL_URL`: `https://your-domain.com/billing/cancelled`

4. **Initialize Database**
   - Run the SQL from `lib/sql/schema.sql` and `lib/sql/migrations/001_billing.sql` in your Postgres database.
   - Or run `npx tsx scripts/migrate-billing.ts` if you have local access with correct env vars.

5. **Billing Setup (Stripe)**
   - **Create Product**: Create a "Pro" product in Stripe Dashboard.
   - **Create Prices**: Add two recurring prices (Monthly and Yearly) to the product. Copy their IDs (`price_...`) to your env vars.
   - **Enable Payments**: Enable Apple Pay and Google Pay in Stripe Dashboard (Settings -> Payments).
   - **Configure Webhooks**:
     - Add a webhook endpoint pointing to `https://your-domain.com/api/billing/webhook`.
     - Select events:
       - `checkout.session.completed`
       - `customer.subscription.created`
       - `customer.subscription.updated`
       - `customer.subscription.deleted`
       - `invoice.payment_succeeded`
       - `invoice.payment_failed`
     - Copy the Signing Secret (`whsec_...`) to `STRIPE_WEBHOOK_SECRET`.
   - **Customer Portal**: Enable Customer Portal in Stripe Settings. Allow customers to manage subscriptions and update payment methods.
   - **Apple Pay**: Verify your domain in Stripe if required (Settings -> Payments -> Apple Pay).

6. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```

7. **Configure Custom Domain**
   - In Vercel dashboard, go to your project settings
   - Add custom domain: `mychesscoach.bookiji.com`
   - Follow DNS configuration instructions

### Local Development

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Set Environment Variables**
   Create a `.env.local` file with all the variables mentioned above.
   - Optional: Set `DEV_ENTITLEMENT=PRO` to grant Pro access in local development (requires local DB).
   - Optional: Set `DEV_ENTITLEMENT_USER_IDS=user1,user2` (with `DEV_ENTITLEMENT=PRO`) to force Pro for specific internal/dev accounts in any environment.

3. **Local DB (Docker, pgvector)**
   - **Port 5433 rationale:** Port 5432 is commonly occupied by Supabase/local Postgres. Binding Docker on 5433 avoids collisions and guarantees the app is talking to the container.
   - **Invariant:** The dev guard passes without `LOCAL_DB=true` as long as `DATABASE_URL` points to localhost.
   - **Command:**
     ```bash
     docker run -d --name stockfish-postgres -p 5433:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=stockfish pgvector/pgvector:pg15
     ```
   - **Shortcuts:**
     ```bash
     pnpm db:local:up
     pnpm db:local:down
     ```

4. **Run Development Server**
   ```bash
   pnpm dev
   ```

5. **Stripe Webhook Testing**
   Use Stripe CLI to forward webhooks:
   ```bash
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```

## Project Structure

```
├── app/                 # Next.js app directory
│   ├── api/            # API routes
│   │   ├── billing/    # Billing routes (checkout, portal, webhook)
│   ├── page.tsx        # Main page
│   ├── pricing/        # Pricing page
│   ├── account/        # Account page
│   └── layout.tsx      # Root layout
├── components/         # React components
├── lib/               # Library functions
│   ├── agent.ts       # LangChain agent setup
│   ├── analysis.ts    # PGN analysis
│   ├── billing.ts     # Billing logic and helpers
│   ├── database.ts    # Database utilities
│   ├── env.ts         # Environment validation
│   └── visualizer.ts  # Chess board visualization
└── vercel.json        # Vercel configuration
```

## License

See LICENSE file for details.
