# Deployment Guide for mychesscoach.bookiji.com

## Step 1: Install Vercel CLI (if not already installed)

```bash
npm i -g vercel
```

## Step 2: Login to Vercel

```bash
vercel login
```

## Step 3: Create Postgres Database

- **Vercel Postgres**: Vercel Dashboard → Storage → Create Database → Postgres
- **Neon** (portable): [neon.tech](https://neon.tech) → create project
- Copy the connection string (`POSTGRES_URL`)

## Step 4: Initialize Database Schema

1. Open the SQL Editor in your Postgres provider (Vercel Postgres, Neon, or `psql`)
2. Run the entire contents of `lib/sql/schema.sql`

## Step 5: Set Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables:

- `OPENAI_API_KEY`: Your OpenAI API key
- `POSTGRES_URL`: Your Postgres connection string (auto-set if using Vercel Postgres; otherwise from Neon or your provider)
- `OPENAI_MODEL`: (Optional) Model to use, default is `gpt-4o-mini`

## Step 6: Deploy to Vercel

```bash
vercel --prod
```

## Step 7: Configure Custom Domain

1. In Vercel Dashboard → Your Project → Settings → Domains
2. Add `mychesscoach.bookiji.com`
3. Follow the DNS configuration instructions:
   - Add a CNAME record pointing to `cname.vercel-dns.com`
   - Or add an A record if specified by Vercel

## Step 8: Verify Deployment

1. Visit `https://mychesscoach.bookiji.com`
2. Test the application:
   - Upload a PGN file
   - Try the chat feature
   - Check game inspector

## Troubleshooting

### Database Connection Issues
- Verify POSTGRES_URL is set correctly
- Check that the database schema is initialized
- Ensure the database is in the same region as your deployment

### OpenAI API Issues
- Verify OPENAI_API_KEY is set
- Check your OpenAI account has credits
- Verify the model name is correct

### Build Errors
- Check that all dependencies are in package.json
- Verify TypeScript compilation passes: `npm run build`
- Check Vercel build logs for specific errors
