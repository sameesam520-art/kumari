const { setCors, sendJson, getBody, readSmsConfig, saveSmsConfig, isAuthorizedAdmin } = require('./_lib/storage');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const query = req.query || {};

  if (req.method === 'GET' || req.method === 'HEAD') {
    const cfg = await readSmsConfig();
    return sendJson(res, 200, Object.assign({ status: 'success' }, cfg));
  }

  if (req.method === 'POST') {
    if (!(await isAuthorizedAdmin(req, query))) {
      return sendJson(res, 401, { status: 'error', message: 'Unauthorized. Admin password required.' });
    }
    const rawBody = await getBody(req);
    try {
      const payload = JSON.parse(rawBody);
      const cfg = await readSmsConfig();
      if (payload.messageTemplate !== undefined) cfg.messageTemplate = payload.messageTemplate.trim();
      if (payload.recipient !== undefined)       cfg.recipient        = payload.recipient.trim();
      if (payload.sessionId && payload.customMessage !== undefined) {
        if (!cfg.sessionMessages) cfg.sessionMessages = {};
        cfg.sessionMessages[payload.sessionId] = payload.customMessage.trim();
      }
      cfg.updatedAt  = new Date().toISOString();
      cfg.deployedAt = cfg.updatedAt;
      await saveSmsConfig(cfg);
      return sendJson(res, 200, {
        status: 'success',
        message: 'SMS message configuration deployed successfully',
        recipient: cfg.recipient || '32001',
        messageTemplate: cfg.messageTemplate,
        deployedAt: cfg.deployedAt
      });
    } catch (e) {
      return sendJson(res, 400, { status: 'error', message: 'Invalid payload: ' + e.message });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
};
