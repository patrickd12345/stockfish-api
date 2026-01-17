# Quick Start - Deploy to mychesscoach.bookiji.com

## Prerequisites
- Node.js 18+ installed
- Vercel account
- OpenAI API key

## Quick Deployment Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up Postgres:**
   - Vercel Postgres: Vercel Dashboard → Storage → Create Postgres
   - Or Neon: [neon.tech](https://neon.tech) → create project
   - Copy the connection string → set as `POSTGRES_URL`

3. **Deploy to Vercel:**
   ```bash
   vercel --prod
   ```
   When prompted:
   - Link to existing project? **No** (create new)
   - Set up and deploy? **Yes**
   - Environment variables will be set via Vercel dashboard

4. **Configure Environment Variables in Vercel Dashboard:**
   - Go to Project → Settings → Environment Variables
   - Add:
     - `OPENAI_API_KEY` = your OpenAI API key
     - `POSTGRES_URL` = your Postgres connection string (Vercel Postgres or Neon)
     - `OPENAI_MODEL` = `gpt-4o-mini` (optional)

5. **Initialize Database:**
   - Go to Vercel Dashboard → Your Postgres Database → SQL Editor
   - Run the SQL from `lib/sql/schema.sql`

6. **Add Custom Domain:**
   - Go to Project → Settings → Domains
   - Add: `mychesscoach.bookiji.com`
   - Follow DNS instructions (add CNAME record)

7. **Redeploy (if needed after env vars):**
   ```bash
   vercel --prod
   ```

## Verify Deployment

Visit: `https://mychesscoach.bookiji.com`

Test:
- Upload a PGN file
- Try the chat feature
- Check game inspector

## Troubleshooting

- **Build fails**: Check Vercel build logs
- **Database errors**: Verify schema is initialized
- **OpenAI errors**: Check API key and credits
- **Domain not working**: Verify DNS records (may take up to 48 hours)

For detailed instructions, see `DEPLOYMENT.md`
