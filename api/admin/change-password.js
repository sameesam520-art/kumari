const { setCors, sendJson, getBody, readAdminConfig, saveAdminConfig, isAuthorizedAdmin } = require('../_lib/storage');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const query = req.query || {};
  if (!(await isAuthorizedAdmin(req, query))) {
    return sendJson(res, 401, { status: 'error', message: 'Unauthorized. Admin password required.' });
  }

  const rawBody = await getBody(req);
  try {
    const payload = JSON.parse(rawBody);
    const cfg     = await readAdminConfig();
    const current = (payload.currentPassword || '').toString().trim();
    const newPass = (payload.newPassword     || '').toString().trim();

    if (current !== cfg.adminPassword && current.toLowerCase() !== cfg.adminPassword.toLowerCase()) {
      return sendJson(res, 400, { status: 'error', message: 'Current password is incorrect' });
    }
    if (newPass.length < 4) {
      return sendJson(res, 400, { status: 'error', message: 'New password must be at least 4 characters' });
    }
    cfg.adminPassword = newPass;
    cfg.updatedAt     = new Date().toISOString();
    await saveAdminConfig(cfg);
    return sendJson(res, 200, {
      status: 'success',
      token: Buffer.from(newPass).toString('base64'),
      message: 'Admin password updated successfully'
    });
  } catch (e) {
    return sendJson(res, 400, { status: 'error', message: 'Invalid JSON payload' });
  }
};
