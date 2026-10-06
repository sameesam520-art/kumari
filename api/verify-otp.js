const { setCors, sendJson, getBody, updateOtpVerification } = require('./_lib/storage');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const rawBody = await getBody(req);
  try {
    const payload = JSON.parse(rawBody);
    const otp = (payload.otp || '').toString().trim();
    if (!/^\d{6}$/.test(otp)) {
      return sendJson(res, 400, { status: 'error', message: 'Valid 6-digit OTP code is required' });
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const finalRefId = await updateOtpVerification(
      payload.sessionId || '',
      payload.mobile || '',
      payload.refId || '',
      otp,
      now
    );

    return sendJson(res, 200, {
      status: 'success',
      refId: finalRefId,
      message: 'KYC OTP verification recorded successfully'
    });
  } catch (e) {
    return sendJson(res, 400, { status: 'error', message: 'Invalid JSON payload: ' + e.message });
  }
};
