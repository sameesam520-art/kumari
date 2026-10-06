const { setCors, sendJson, isAuthorizedAdmin } = require('../_lib/storage');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const query = req.query || {};
  if (await isAuthorizedAdmin(req, query)) {
    return sendJson(res, 200, { status: 'success', authenticated: true });
  }
  return sendJson(res, 401, { status: 'error', authenticated: false, message: 'Not authenticated' });
};
