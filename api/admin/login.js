const { setCors, sendJson, getBody, readAdminConfig } = require('../_lib/storage');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const rawBody = await getBody(req);
  try {
    const payload = JSON.parse(rawBody);
    const inputPassword = (payload.password || '').toString().trim();
    const cfg = await readAdminConfig();
    const expected = (cfg.adminPassword || 'admin123').toString().trim();
    if (inputPassword && (inputPassword === expected || inputPassword.toLowerCase() === expected.toLowerCase())) {
      return sendJson(res, 200, {
        status: 'success',
        token: Buffer.from(expected).toString('base64'),
        message: 'Admin authentication successful'
      });
    }
    return sendJson(res, 401, { status: 'error', message: 'Invalid administrator password' });
  } catch (e) {
    return sendJson(res, 400, { status: 'error', message: 'Invalid JSON payload' });
  }
};
