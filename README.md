# LaunchPilot AI

LaunchPilot AI is a launch-planning workspace for digital product creators. It includes idea validation, product blueprints, sales-page drafts, pricing hypotheses, marketing drafts, saved projects, launch tasks, and manual competitor notes.

This repository uses a lightweight static frontend plus a single TypeScript API gateway on Vercel. It is not a Next.js project. Keep the Vercel framework preset set to **Other**; do not convert it to Next.js. The current route handlers live in `server-routes/` and are dispatched by `api/gateway.ts`, keeping Vercel Hobby deployments under the serverless-function limit.

## Windows setup

1. Extract the ZIP into a normal folder. Open PowerShell in that folder; it must contain `package.json` and `index.html`.
2. Use Node.js 22 LTS or another supported Node version (20.9+).
3. Run:

   ```powershell
   Copy-Item .env.example .env
   npm install
   ```

4. Fill the environment variables in `.env` with your own credentials. The example file intentionally contains placeholders only.
5. Run these checks:

   ```powershell
   npx prisma generate
   npx prisma validate
   npm run typecheck
   npm test
   npm run build
   ```

6. Start locally with `npm run dev`; Vercel CLI prints the local URL, usually `http://localhost:3000`.

## Required application configuration

### Database and application security

- `DATABASE_URL`: pooled PostgreSQL URL for app requests.
- `DIRECT_URL`: direct PostgreSQL URL for Prisma migrations.
- `SESSION_SECRET`: unique random string of at least 32 characters.
- `GROQ_API_KEY`: server-side Groq API key for AI generation.
- `GROQ_MODEL`: optional model name; defaults in the application if omitted.

Never put database credentials, session secrets, Paddle API keys, or webhook secrets in `index.html`, `.env.example`, or Git. Use `.env` locally and Vercel environment variables for deployed environments.

## Existing Whop billing

Whop remains supported. Configure `WHOP_COMPANY_API_KEY` (or supported legacy `WHOP_API_KEY`), `WHOP_COMPANY_ID`, `WHOP_PRODUCT_ID`, `WHOP_PRO_PLAN_ID`, and `WHOP_WEBHOOK_SECRET` on the server. Set `WHOP_PRO_CHECKOUT_URL` to the reusable checkout URL made for LaunchPilot Pro.

Configure the Whop webhook destination as:

`https://YOUR-DOMAIN/api/webhooks/whop`

Whop checkout clicks do not activate a subscription by themselves. The app checks verified membership details or a signed Whop webhook.

## Add Paddle Billing

The code adds Paddle checkout alongside Whop. Start in **sandbox**; do not set live credentials until the sandbox flow has passed.

Set these environment variables:

| Variable | Where it is used | Value |
|---|---|---|
| `PADDLE_ENVIRONMENT` | Build and server | `sandbox` for test mode; `production` only after live approval |
| `PADDLE_API_KEY` | Server only | Paddle sandbox API key while testing; keep secret |
| `PADDLE_CLIENT_TOKEN` | Frontend build | Paddle client-side token; safe to publish in the static frontend |
| `PADDLE_PRO_PRICE_ID` | Server only | Paddle recurring monthly Pro price ID (`pri_...`) |
| `PADDLE_WEBHOOK_SECRET` | Server only | Secret generated for the configured Paddle notification destination |

For a local sandbox build, put `PADDLE_CLIENT_TOKEN` and `PADDLE_ENVIRONMENT` in `.env` before `npm run build`. Vercel reads the same names from the project's Environment Variables settings during the build. The client token is public; the API key and webhook secret are never injected into the frontend.

### Paddle setup steps

1. In Paddle **Sandbox**, create the LaunchPilot Pro product and a recurring monthly price. Copy its price ID (`pri_...`). The code does not hardcode a dollar amount; Paddle's configured price determines the amount charged.
2. Create a sandbox API key with permission to create transactions. Store it in `PADDLE_API_KEY`.
3. Create a Paddle client-side token for sandbox and set `PADDLE_CLIENT_TOKEN`.
4. Set `PADDLE_PRO_PRICE_ID` to the price ID and `PADDLE_ENVIRONMENT=sandbox`.
5. In Paddle Developer Tools, create a notification destination pointing to `https://YOUR-DOMAIN/api/webhooks/paddle` (or your temporary secure test tunnel URL). Copy that destination's endpoint secret into `PADDLE_WEBHOOK_SECRET`.
6. Subscribe the destination to `subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`, `subscription.paused`, and `subscription.resumed`.
7. Deploy and test using Paddle's sandbox checkout and webhook simulator before switching to live credentials.

The checkout endpoint creates a server-side Paddle transaction tied to a random, one-time-intent token stored by hash in the database; it does not trust a browser-supplied user ID. The Paddle webhook verifies the raw request body signature before processing events. Pro access is granted only by a verified subscription event for the configured price and a known checkout intent; `transaction.completed` by itself does not grant recurring Pro access. Subscription state is synchronized server-side, and expired/past-due/canceled/paused subscriptions do not keep Pro access indefinitely.

Paddle and Whop share one subscription row per user. Checkout is blocked when an active Pro subscription is already detected, and lifecycle events from a different provider are prevented from overwriting an already active provider subscription. Users should not purchase the same plan from both providers.

### Database migration

The new migration is `prisma/migrations/20261022000000_paddle_billing/migration.sql`. Before using Paddle on a deployed database, run this command from the project root with `DATABASE_URL` and `DIRECT_URL` pointing to that database:

```powershell
npm run db:deploy
```

Do not run a development migration against production.

## Deploy to Vercel

1. Push only source/configuration files to GitHub. Do not commit `.env`, `.env.local`, `.aider-desk/`, build output, or generated dependencies.
2. Set **Framework Preset** to **Other**, **Root Directory** to the repository root, **Build Command** to `npm run build`, **Output Directory** to `dist`, and **Install Command** to `npm install --no-audit --no-fund`.
3. Add the database, session, AI, Whop, and Paddle environment variables needed for the features you have enabled. Use sandbox values for Paddle testing.
4. Deploy, run the migration once, and test the public pages, login, project save, AI generation, Whop verification, Paddle sandbox checkout, webhook activation, renewal/update, and cancellation.

## Current product limits

- Free: 3 successful AI generations total, up to 3 projects, and the Idea Validator/Product Blueprint tools.
- Pro: up to 100 successful generations per billing period, up to 100 projects, and advanced sales/pricing/marketing tools.
- Competitor research is a manual notes workspace; it does not fetch or verify live competitor data.
- Contact submissions are stored in the database; email delivery is not configured.

## Security reminders

- The ZIP that was inspected contained private environment files and a Paddle MCP configuration. This clean source package excludes those files and excludes the Git history so historical secrets are not bundled into the new archive.
- Rotate any database, Whop, or Paddle credentials that were present in the previous ZIP. Also review the hosting database provider's access logs.
- Do not use production payment credentials until Paddle approves the account and all sandbox checks pass. Account eligibility and verification must be completed truthfully by the authorized account holder.
- No local test can verify the external Paddle dashboard configuration or prove a real end-to-end payment; those checks must be completed in Paddle sandbox.
