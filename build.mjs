import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist');

// Prisma needs URL-shaped datasource values while generating its client, but it
// does not connect to the database during generation. Placeholders are passed
// to this child process only when real values have not been configured; they
// are never written to .env or to the deployment environment.
const env = { ...process.env };
const fallbackDatabaseUrl = 'postgresql://placeholder:placeholder@127.0.0.1:5432/launchpilot_placeholder?schema=public';
env.DATABASE_URL ||= fallbackDatabaseUrl;
env.DIRECT_URL ||= env.DATABASE_URL;
const prismaCommand = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
execFileSync(prismaCommand, ['generate'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

// Load only public checkout values from a local .env file. The Paddle client token
// is designed for frontend use; Paddle API keys and webhook secrets are never injected. Vercel env wins.
function parseEnvFile(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !['WHOP_PRO_CHECKOUT_URL', 'PADDLE_CLIENT_TOKEN', 'PADDLE_ENVIRONMENT'].includes(match[1])) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

const envText = await readFile(join(root, '.env'), 'utf8').catch(() => '');
const localEnv = parseEnvFile(envText);
const checkoutUrl = (process.env.WHOP_PRO_CHECKOUT_URL || localEnv.WHOP_PRO_CHECKOUT_URL || '').trim();
const paddleClientToken = (process.env.PADDLE_CLIENT_TOKEN || localEnv.PADDLE_CLIENT_TOKEN || '').trim();
const paddleEnvironmentRaw = (process.env.PADDLE_ENVIRONMENT || localEnv.PADDLE_ENVIRONMENT || 'sandbox').trim().toLowerCase();
if (!['sandbox', 'production'].includes(paddleEnvironmentRaw)) throw new Error('PADDLE_ENVIRONMENT must be either sandbox or production.');
if (checkoutUrl) {
  let parsedCheckoutUrl;
  try { parsedCheckoutUrl = new URL(checkoutUrl); } catch { throw new Error('WHOP_PRO_CHECKOUT_URL must be a valid HTTPS Whop checkout URL.'); }
  if (parsedCheckoutUrl.protocol !== 'https:' || !(parsedCheckoutUrl.hostname === 'whop.com' || parsedCheckoutUrl.hostname.endsWith('.whop.com'))) {
    throw new Error('WHOP_PRO_CHECKOUT_URL must use HTTPS and a whop.com domain.');
  }
}

// The authoring file stays at the repository root. The public checkout URL is
// injected during build, then only dist/index.html is served as the frontend.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const html = await readFile(join(root, 'index.html'), 'utf8');
const marker = "const CHECKOUT_URL = '__WHOP_PRO_CHECKOUT_URL__';";
const paddleTokenMarker = "const PADDLE_CLIENT_TOKEN = '__PADDLE_CLIENT_TOKEN__';";
const paddleEnvironmentMarker = "const PADDLE_ENVIRONMENT = '__PADDLE_ENVIRONMENT__';";
if (!html.includes(marker)) throw new Error('Whop checkout URL marker is missing from index.html.');
if (!html.includes(paddleTokenMarker) || !html.includes(paddleEnvironmentMarker)) throw new Error('Paddle configuration markers are missing from index.html.');
const builtHtml = html
  .replace(marker, `const CHECKOUT_URL = ${JSON.stringify(checkoutUrl)};`)
  .replace(paddleTokenMarker, `const PADDLE_CLIENT_TOKEN = ${JSON.stringify(paddleClientToken)};`)
  .replace(paddleEnvironmentMarker, `const PADDLE_ENVIRONMENT = ${JSON.stringify(paddleEnvironmentRaw)};`);
await writeFile(join(output, 'index.html'), builtHtml, 'utf8');
console.log(`LaunchPilot AI frontend built to dist/index.html. Whop checkout: ${checkoutUrl ? 'configured' : 'not configured'}. Paddle browser token: ${paddleClientToken ? 'configured' : 'not configured'}. Paddle environment: ${paddleEnvironmentRaw}.`);
