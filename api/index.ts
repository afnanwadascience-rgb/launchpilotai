import type { VercelRequest, VercelResponse } from '@vercel/node';

import * as competitorsMod from '../server/handlers/competitors';
import * as contactMod from '../server/handlers/contact';
import * as projectsMod from '../server/handlers/projects';
import * as settingsMod from '../server/handlers/settings';
import * as tasksMod from '../server/handlers/tasks';

const getHandler = (mod: any) => mod.default || mod.handler || mod;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract path from query (Vercel catch-all rewrites pass query params)
  const pathParam = req.query.path || req.query.rest || req.url?.replace(/^\/api\/?/, '').split('?')[0];
  const segments = Array.isArray(pathParam) ? pathParam : typeof pathParam === 'string' ? pathParam.split('/') : [];
  const route = segments.filter(Boolean).join('/');

  // Fallback check if route is empty or matches root api
  if (!route || route === '') {
    return res.status(200).json({ status: 'LaunchPilot AI API operational', endpoints: ['competitors', 'contact', 'projects', 'settings', 'tasks'] });
  }

  try {
    if (route.startsWith('competitors')) return await getHandler(competitorsMod)(req, res);
    if (route.startsWith('contact')) return await getHandler(contactMod)(req, res);
    if (route.startsWith('projects')) return await getHandler(projectsMod)(req, res);
    if (route.startsWith('settings')) return await getHandler(settingsMod)(req, res);
    if (route.startsWith('tasks')) return await getHandler(tasksMod)(req, res);

    return res.status(404).json({ error: `API route not found: /api/${route}` });
  } catch (error: any) {
    console.error(`API Error on route /api/${route}:`, error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}