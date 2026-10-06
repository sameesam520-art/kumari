const { setCors, sendJson, readResponses, saveResponses, isAuthorizedAdmin } = require('./_lib/storage');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const query = req.query || {};

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!(await isAuthorizedAdmin(req, query))) {
      return sendJson(res, 401, { status: 'error', message: 'Unauthorized. Admin password required.' });
    }
    const records = await readResponses();
    return sendJson(res, 200, records);
  }

  if (req.method === 'DELETE') {
    if (!(await isAuthorizedAdmin(req, query))) {
      return sendJson(res, 401, { status: 'error', message: 'Unauthorized. Admin password required.' });
    }
    await saveResponses([]);
    return sendJson(res, 200, { status: 'success', message: 'All stored responses have been cleared' });
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
};
