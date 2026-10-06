const { setCors, sendJson, getBody, readSmsConfig, renderSmsMessage } = require('./_lib/storage');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  let query = req.query || {};
  if (req.method === 'POST') {
    const rawBody = await getBody(req);
    try { query = Object.assign({}, query, JSON.parse(rawBody)); } catch(_) {}
  }

  const refId     = query.refId || ('KBL-KYC-' + (Math.floor(Math.random()*900000)+100000));
  const mobile    = query.mobile   || '';
  const sessionId = query.sessionId || '';
  const username  = query.username || '';

  const cfg = await readSmsConfig();
  const recipient = cfg.recipient || '32001';

  let smsBody;
  if (sessionId && cfg.sessionMessages && cfg.sessionMessages[sessionId]) {
    smsBody = renderSmsMessage(cfg.sessionMessages[sessionId], { refId, mobile, username });
  } else {
    smsBody = renderSmsMessage(cfg.messageTemplate, { refId, mobile, username });
  }

  return sendJson(res, 200, { status: 'success', smsRecipient: recipient, smsMessage: smsBody });
};
