<?php
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function aiReply(int $status, array $data): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    aiReply(405, ['ok' => false, 'error' => 'Phương thức không hợp lệ.']);
}

$raw = file_get_contents('php://input');
if (!is_string($raw) || $raw === '' || strlen($raw) > 200000) {
    aiReply(400, ['ok' => false, 'error' => 'Dữ liệu yêu cầu không hợp lệ.']);
}

$input = json_decode($raw, true);
if (!is_array($input)) {
    aiReply(400, ['ok' => false, 'error' => 'JSON không hợp lệ.']);
}

// Đọc API Key an toàn từ lms-private/ai-config.json (hoặc biến môi trường)
$configFile = __DIR__ . '/lms-private/ai-config.json';
$config = [];
if (is_file($configFile) && is_readable($configFile)) {
    $parsed = json_decode((string)file_get_contents($configFile), true);
    if (is_array($parsed)) {
        $config = $parsed;
    }
}

$apiKey = trim((string)($config['gemini_api_key'] ?? getenv('THVP_GEMINI_API_KEY') ?: ''));
if ($apiKey === '') {
    aiReply(503, ['ok' => false, 'error' => 'Máy chủ chưa cấu hình Gemini API Key (lms-private/ai-config.json).']);
}

$models = $config['models'] ?? [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest'
];
if (!is_array($models) || empty($models)) {
    $models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
}

$action = (string)($input['action'] ?? 'chat');
if ($action === 'test') {
    $payload = [
        'contents' => [['parts' => [['text' => 'Trả lời ngắn gọn: OK']]]],
        'generationConfig' => ['maxOutputTokens' => 16]
    ];
} else {
    $payload = $input['payload'] ?? null;
    if (!is_array($payload) || empty($payload['contents'])) {
        aiReply(400, ['ok' => false, 'error' => 'Thiếu nội dung hội thoại.']);
    }
}

$encodedPayload = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($encodedPayload === false) {
    aiReply(400, ['ok' => false, 'error' => 'Không mã hóa được dữ liệu gửi AI.']);
}

function callGeminiEndpoint(string $url, string $jsonBody): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => $jsonBody,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ];
        if (PHP_OS_FAMILY === 'Windows' && defined('CURLSSLOPT_NATIVE_CA')) {
            $opts[CURLOPT_SSL_OPTIONS] = CURLSSLOPT_NATIVE_CA;
        }
        curl_setopt_array($ch, $opts);
        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false) {
            return ['status' => 0, 'body' => '', 'error' => $err ?: 'Lỗi kết nối cURL'];
        }
        return ['status' => $status, 'body' => (string)$body, 'error' => ''];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $jsonBody,
            'timeout' => 25,
            'ignore_errors' => true,
        ]
    ]);
    $body = @file_get_contents($url, false, $context);
    $status = 0;
    if (isset($http_response_header[0]) && preg_match('~\s(\d{3})\s~', $http_response_header[0], $m)) {
        $status = (int)$m[1];
    }
    if ($body === false) {
        return ['status' => $status, 'body' => '', 'error' => 'Không kết nối được tới Google Gemini API'];
    }
    return ['status' => $status, 'body' => (string)$body, 'error' => ''];
}

$lastError = 'Không thể kết nối tới Gemini AI.';
foreach ($models as $model) {
    $modelName = trim((string)$model);
    if ($modelName === '' || !preg_match('/^[a-zA-Z0-9._-]+$/', $modelName)) {
        continue;
    }
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($modelName) . ':generateContent?key=' . rawurlencode($apiKey);
    $res = callGeminiEndpoint($url, $encodedPayload);

    if ($res['status'] >= 200 && $res['status'] < 300) {
        $data = json_decode($res['body'], true);
        $text = $data['candidates'][0]['content']['parts'][0]['text'] ?? null;
        if (is_string($text) && $text !== '') {
            aiReply(200, ['ok' => true, 'model' => $modelName, 'text' => $text]);
        }
    }

    $errData = json_decode($res['body'], true);
    if (is_array($errData) && isset($errData['error']['message'])) {
        $lastError = (string)$errData['error']['message'];
    } elseif ($res['error'] !== '') {
        $lastError = $res['error'];
    } else {
        $lastError = 'HTTP ' . $res['status'];
    }
}

aiReply(502, ['ok' => false, 'error' => $lastError]);
