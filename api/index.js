const competitorsHandler = require('../server/handlers/competitors');
const contactHandler = require('../server/handlers/contact');
const projectsHandler = require('../server/handlers/projects');
const settingsHandler = require('../server/handlers/settings');
const tasksHandler = require('../server/handlers/tasks');

const getHandler = (mod) => {
  if (!mod) return null;
  if (typeof mod === 'function') return mod;
  if (mod.default && typeof mod.default === 'function') return mod.default;
  if (mod.handler && typeof mod.handler === 'function') return mod.handler;
  return null;
};

module.exports = async function handler(req, res) {
  try {
    let pathParam = req.query.path;
    if (!pathParam && req.url) {
      const cleanUrl = req.url.split('?')[0];
      pathParam = cleanUrl.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    }
    
    const segments = Array.isArray(pathParam) ? pathParam : (typeof pathParam === 'string' ? pathParam.split('/') : []);
    const route = segments.filter(Boolean).join('/');

    if (!route || route === '') {
      return res.status(200).json({ 
        status: 'API Operational', 
        endpoints: ['competitors', 'contact', 'projects', 'settings', 'tasks'] 
      });
    }

    let targetHandler = null;
    if (route.startsWith('competitors')) targetHandler = getHandler(competitorsHandler);
    else if (route.startsWith('contact')) targetHandler = getHandler(contactHandler);
    else if (route.startsWith('projects')) targetHandler = getHandler(projectsHandler);
    else if (route.startsWith('settings')) targetHandler = getHandler(settingsHandler);
    else if (route.startsWith('tasks')) targetHandler = getHandler(tasksHandler);

    if (!targetHandler) {
      return res.status(404).json({ error: 'API route not found: /api/' + route });
    }

    return await targetHandler(req, res);
  } catch (error) {
    console.error('Critical API Invocation Error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message : 'Unknown error'
    });
  }
};