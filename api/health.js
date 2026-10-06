const { setCors, sendJson, readResponses } = require('./_lib/storage');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });

  const list = await readResponses();
  return sendJson(res, 200, {
    status: 'online',
    service: 'Kumari Bank Limited KYC Backend',
    database: 'Supabase PostgreSQL',
    totalResponses: list.length,
    time: new Date().toISOString()
  });
};
