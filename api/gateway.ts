type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT' | 'OPTIONS';
type RouteModule = Partial<Record<HttpMethod, unknown>>;
type RouteLoader = () => Promise<unknown>;
type RouteHandler = (
  request: Request,
  context?: { params: Promise<{ id: string }> }
) => Promise<Response> | Response;

const staticRoutes: Record<string, RouteLoader> = {
  'ai/generate': () => import('../server-routes/ai/generate.js'),
  'webhooks/whop': () => import('../server-routes/webhooks/whop.js'),
  'webhooks/paddle': () => import('../server-routes/webhooks/paddle.js'),
  'billing/paddle-checkout': () => import('../server-routes/billing/paddle-checkout.js'),
  'tasks': () => import('../server-routes/tasks.js'),
  'auth/register': () => import('../server-routes/auth/register.js'),
  'auth/logout': () => import('../server-routes/auth/logout.js'),
  'auth/me': () => import('../server-routes/auth/me.js'),
  'auth/login': () => import('../server-routes/auth/login.js'),
  'projects': () => import('../server-routes/projects.js'),
  'competitors': () => import('../server-routes/competitors.js'),
  'settings': () => import('../server-routes/settings.js'),
  'billing/refresh': () => import('../server-routes/billing/refresh.js'),
  'contact': () => import('../server-routes/contact.js'),
};

const dynamicRoutes: Array<{ pattern: RegExp; load: RouteLoader }> = [
  { pattern: /^tasks\/([^/]+)$/, load: () => import('../server-routes/tasks/[id].js') },
  { pattern: /^projects\/([^/]+)$/, load: () => import('../server-routes/projects/[id].js') },
  { pattern: /^competitors\/([^/]+)$/, load: () => import('../server-routes/competitors/[id].js') },
  { pattern: /^content\/([^/]+)$/, load: () => import('../server-routes/content/[id].js') },
];

async function dispatch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rewrittenPath = url.searchParams.get('__route');
  const rawPath = rewrittenPath ?? url.pathname.replace(/^\/api\/?/, '');
  const path = rawPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const method = request.method.toUpperCase() as HttpMethod;

  // This health check deliberately loads no authentication, database, or AI modules.
  if (path === 'health' || path === 'gateway') {
    return Response.json(
      { ok: true, service: 'launchpilot-ai-api', status: 'ready' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let loader: RouteLoader | undefined = staticRoutes[path];
  let id: string | undefined;

  if (!loader) {
    for (const candidate of dynamicRoutes) {
      const match = path.match(candidate.pattern);
      if (!match) continue;

      loader = candidate.load;
      try {
        id = decodeURIComponent(match[1]);
      } catch {
        return Response.json({ error: 'Invalid resource identifier.' }, { status: 400 });
      }
      break;
    }
  }

  if (!loader) {
    return Response.json({ error: 'API endpoint not found.', path }, { status: 404 });
  }

  try {
    // Load only the route requested, rather than importing all routes at startup.
    const route = await loader() as RouteModule;
    const handler = route[method];

    if (typeof handler !== 'function') {
      const allow = Object.keys(route)
        .filter((key) => ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'].includes(key))
        .join(', ');

      return Response.json(
        { error: 'Method not allowed.' },
        { status: 405, headers: { Allow: allow } }
      );
    }

    if (id !== undefined) {
      return await (handler as RouteHandler)(request, {
        params: Promise.resolve({ id }),
      });
    }

    return await (handler as RouteHandler)(request);
  } catch (error) {
    console.error('LaunchPilot API handler failed:', {
      path,
      method,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });

    return Response.json(
      { error: 'The API handler failed.', code: 'API_HANDLER_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export default {
  fetch: dispatch,
};