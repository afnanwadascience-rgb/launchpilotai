const competitorsHandler = require('../server/handlers/competitors');
const contactHandler = require('../server/handlers/contact');
const projectsHandler = require('../server/handlers/projects');
const settingsHandler = require('../server/handlers/settings');
const tasksHandler = require('../server/handlers/tasks');

const getHandler = (mod) => (mod && mod.default) ? mod.default : (mod && mod.handler) ? mod.handler : mod;

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

    if (route.startsWith('competitors')) return await getHandler(competitorsHandler)(req, res);
    if (route.startsWith('contact')) return await getHandler(contactHandler)(req, res);
    if (route.startsWith('projects')) return await getHandler(projectsHandler)(req, res);
    if (route.startsWith('settings')) return await getHandler(settingsHandler)(req, res);
    if (route.startsWith('tasks')) return await getHandler(tasksHandler)(req, res);

    return res.status(404).json({ error: 'API route not found: /api/' + route });
  } catch (error) {
    console.error('Permanent Fix API Error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message : 'Unknown error'
    });
  }
};