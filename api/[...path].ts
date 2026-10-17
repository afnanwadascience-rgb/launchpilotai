import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import handlers with fallback support
import * as authMod from '../server/handlers/auth';
import * as projectsMod from '../server/handlers/projects';
import * as tasksMod from '../server/handlers/tasks';
import * as competitorsMod from '../server/handlers/competitors';
import * as aiMod from '../server/handlers/ai';
import * as settingsMod from '../server/handlers/settings';
import * as billingMod from '../server/handlers/billing';
import * as whopAuthMod from '../server/handlers/whop-auth';
import * as checkoutMod from '../server/handlers/checkout';
import * as whopWebhookMod from '../server/handlers/whop-webhook';

const getHandler = (mod: any) => mod.default || mod.handler || mod;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { path } = req.query;
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  const route = segments.join('/');

  try {
    if (route.startsWith('auth')) return await getHandler(authMod)(req, res);
    if (route.startsWith('projects')) return await getHandler(projectsMod)(req, res);
    if (route.startsWith('tasks')) return await getHandler(tasksMod)(req, res);
    if (route.startsWith('competitors')) return await getHandler(competitorsMod)(req, res);
    if (route.startsWith('ai')) return await getHandler(aiMod)(req, res);
    if (route.startsWith('settings')) return await getHandler(settingsMod)(req, res);
    if (route.startsWith('billing')) return await getHandler(billingMod)(req, res);
    if (route.startsWith('whop/auth') || route.startsWith('whop-auth')) return await getHandler(whopAuthMod)(req, res);
    if (route.startsWith('checkout')) return await getHandler(checkoutMod)(req, res);
    if (route.startsWith('whop/webhook') || route.startsWith('whop-webhook')) return await getHandler(whopWebhookMod)(req, res);

    return res.status(404).json({ error: `API route not found: /api/${route}` });
  } catch (error: any) {
    console.error(`API Error on route /api/${route}:`, error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}