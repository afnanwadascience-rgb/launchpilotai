import type { VercelRequest, VercelResponse } from '@vercel/node';

import authHandler from '../server/handlers/auth';
import projectsHandler from '../server/handlers/projects';
import tasksHandler from '../server/handlers/tasks';
import competitorsHandler from '../server/handlers/competitors';
import aiHandler from '../server/handlers/ai';
import settingsHandler from '../server/handlers/settings';
import billingHandler from '../server/handlers/billing';
import whopAuthHandler from '../server/handlers/whop-auth';
import checkoutHandler from '../server/handlers/checkout';
import whopWebhookHandler from '../server/handlers/whop-webhook';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { path } = req.query;
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  const route = segments.join('/');

  try {
    if (route.startsWith('auth')) return await authHandler(req, res);
    if (route.startsWith('projects')) return await projectsHandler(req, res);
    if (route.startsWith('tasks')) return await tasksHandler(req, res);
    if (route.startsWith('competitors')) return await competitorsHandler(req, res);
    if (route.startsWith('ai')) return await aiHandler(req, res);
    if (route.startsWith('settings')) return await settingsHandler(req, res);
    if (route.startsWith('billing')) return await billingHandler(req, res);
    if (route.startsWith('whop/auth') || route.startsWith('whop-auth')) return await whopAuthHandler(req, res);
    if (route.startsWith('checkout')) return await checkoutHandler(req, res);
    if (route.startsWith('whop/webhook') || route.startsWith('whop-webhook')) return await whopWebhookHandler(req, res);

    return res.status(404).json({ error: `API route not found: /api/${route}` });
  } catch (error: any) {
    console.error(`API Error on route /api/${route}:`, error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}