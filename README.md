# LaunchPilot AI

LaunchPilot AI is a launch-planning workspace for digital product creators. It includes idea validation, product blueprints, sales-page drafts, pricing hypotheses, marketing drafts, saved projects, launch tasks, and manual competitor notes.

This repository uses a lightweight static frontend plus TypeScript API functions on Vercel. It is not a Next.js project. Do not change the Vercel framework preset to Next.js. The response headers allow the site to be framed by Whop domains; the earlier `X-Frame-Options: DENY` configuration has been removed.

## What is included in the ZIP

The ZIP contains the full editable application source: the browser interface, Vercel API routes, server-side authentication and billing code, Prisma database schema and migrations, configuration files, and automated tests. It intentionally does not include `node_modules`, generated `dist` files, database contents, or your private `.env` file. Those files are either generated during setup or must remain private. The 81 KB figure is the compressed download size; the files expand to roughly 200 KB.

## Start here (Windows)

1. Extract the ZIP into a normal folder. Open PowerShell in that folder—the folder must contain `package.json` and `index.html`.
2. Install Node.js 22 LTS if it is not already installed. Close and reopen PowerShell afterward.
3. Run:

   ```powershell
   Copy-Item .env.example .env
   npm install
   ```

4. Before starting the app, complete the environment variables in `.env` using the setup guide below. Never upload `.env` to GitHub or put secret keys in `index.html`.
5. Run these checks:

   ```powershell
   npx prisma generate
   npx prisma validate
   npm run typecheck
   npm test
   npm run build
   ```

6. To run the website and API on your computer, run `npm run dev`. Open the local address printed by Vercel, usually `http://localhost:3000`.

`npm install` needs internet access. A database, Whop credentials, and a Groq API key are needed to test the connected features end to end. The marketing pages can load without provider credentials, but account storage, AI generation, and paid membership checks cannot work until configured.

## Required services and environment variables

### 1. PostgreSQL database

Create a PostgreSQL database (Neon is supported). In `.env`, set:

- `DATABASE_URL`: the pooled PostgreSQL connection string for app requests.
- `DIRECT_URL`: the direct/unpooled PostgreSQL connection string for Prisma migrations.

Use the exact connection strings supplied by your database provider. Do not include quote characters unless your `.env` parser/provider requires them.

### 2. Session security

Change `SESSION_SECRET` to a random string of at least 32 characters. In PowerShell, one way to generate it is:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Keep this secret private. Set a separate value in Vercel's Production environment.

### 3. Groq AI generation

Set `GROQ_API_KEY` from your Groq account. Keep it server-side. `GROQ_MODEL` is optional; the default is `llama-3.3-70b-versatile`. AI generation returns a clear setup error until a key is available.

### 4. Whop sign-in (required for a Whop marketplace launch)

In the Whop developer dashboard, create or open the app's OAuth settings and configure the exact callback URLs:

- Local testing: `http://localhost:3000/api/auth/callback`
- Production: `https://YOUR-DEPLOYED-DOMAIN/api/auth/callback`

Replace `YOUR-DEPLOYED-DOMAIN` with the real Vercel domain. Add the `oauth:token_exchange` permission to the Whop app. Then set:

- `WHOP_CLIENT_ID`: the app/client ID beginning with `app_`.
- `WHOP_CLIENT_SECRET`: the OAuth client secret.
- `WHOP_SANDBOX=true` only for sandbox testing. Remove it or set it to `false` for production.
- `APP_BASE_URL`: `http://localhost:3000` locally and the full HTTPS domain in Vercel Production, with no extra path.

The sign-in flow uses state, nonce, PKCE, a short-lived HTTP-only cookie, and the existing database session. The app does not store Whop access tokens after retrieving the user's profile. Existing email/password accounts are linked only when Whop confirms the email is verified and the identity can be safely matched. The OAuth callback returns to the standalone app URL; confirm the complete embedded login experience in your Whop preview before submitting the listing.

### 5. Whop Pro membership verification

For subscription activation, set the server-side company API key and the exact identifiers for the intended Pro offer:

- `WHOP_COMPANY_API_KEY` (or the supported legacy `WHOP_API_KEY`).
- `WHOP_COMPANY_ID`.
- `WHOP_PRODUCT_ID`.
- `WHOP_PRO_PLAN_ID`.
- `WHOP_WEBHOOK_SECRET`.

Configure the Whop webhook to `https://YOUR-DEPLOYED-DOMAIN/api/webhooks/whop`. Enable the applicable membership lifecycle events, including activation, update, and deactivation events available in your Whop dashboard. Webhook signing must be enabled; unverified events are rejected.

The checkout link is configured with `WHOP_PRO_CHECKOUT_URL`. It is intentionally blank by default so LaunchPilot cannot accidentally send customers to a different product's checkout. Until you add a reusable checkout URL created specifically for LaunchPilot Pro, the upgrade buttons show a setup message instead of taking payment. Before accepting money, open the configured link in a private browser window and confirm it works, is reusable, and points to the same product and plan IDs configured above. The build step places only this public checkout URL into the frontend; no API secret is exposed there.

A checkout click alone does not grant Pro access. The app grants access only after a server-side membership lookup matches the configured company, product, and plan, or a verified webhook syncs that membership.

## Deploy to Vercel

1. Push the complete project folder to GitHub. The repository root must contain `index.html`, `package.json`, `build.mjs`, `api/`, `lib/`, and `prisma/`.
2. In Vercel, import that GitHub repository.
3. Use these build settings:
   - **Framework Preset:** Other
   - **Root Directory:** repository root
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install --no-audit --no-fund`
4. Add the environment variables above to Vercel for Production. Use the deployed HTTPS domain in `APP_BASE_URL`; use production Whop credentials and set `WHOP_SANDBOX` to `false` or remove it.
5. Redeploy after saving environment variables.
6. In a terminal opened in the project root with the Production variables available, run `npm run db:deploy` once to apply the committed Prisma migrations. If deploying directly from Vercel, use a separate release step or run the command locally with the production database URLs set; do not run development migrations against production.
7. Test the deployed homepage, Whop sign-in, account creation, saving a project, one AI generation, and a real Whop test membership before sharing the listing publicly.

`build.mjs` creates `dist/index.html`. Vercel serves that static file and deploys the TypeScript files under `api/` as server-side functions. The app uses hash-based frontend routes, so normal site sections do not need separate HTML files. If `/` returns `404 NOT_FOUND`, check that the deployment is using the repository root and that the latest build contains `dist/index.html`.

## Current product limits

- Free: 3 successful AI generations total, up to 3 projects, Idea Validator and Product Blueprint.
- Pro: up to 100 successful generations in the billing period, up to 100 projects, and advanced sales/pricing/marketing tools.
- Competitor research is a manually maintained notes workspace. It does not claim to fetch or verify live competitor data.
- Contact submissions are stored in the database; they are not emailed because an email-delivery provider is not configured.

## Before public launch

Review the editable privacy, terms, and refund-policy templates, and add a real support contact and legally correct business details. Confirm Whop's current checkout and webhook settings, verify all Production environment variables, then run the test suite and complete a real end-to-end test. No source ZIP can verify external account credentials or guarantee zero deployment issues without those live checks.
