<?php
// Local PHP server: do not serve databases, private modules, VCS or configuration files.
if(str_starts_with($_SERVER['REQUEST_URI'],'//')){http_response_code(404);exit;}
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$decoded = rawurldecode($uri ?: '/');
if (str_contains($decoded, "\0") || str_contains($decoded, '\\') ||
    preg_match('~(?:^|/)(?:\.|lms-server(?:/|$)|tests(?:/|$)|config\.php(?:/|$)|mail-config\.json(?:/|$)|vendor/phpmailer(?:/|$))|\.(?:sqlite\w*|db|sql)(?:[./-]|$)~i', $decoded)) {
    http_response_code(404); exit;
}
// The existing hosting API is intentionally not connected by this local LMS server.
if (preg_match('~^/api\.php(?:/|$)~i', $decoded)) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'API hosting không được kết nối trong chế độ LMS cục bộ.']);
    return true;
}
$path = __DIR__ . ($decoded === '/' ? '/index.html' : $decoded);
if (!is_file($path)) { http_response_code(404); exit; }
$path=realpath($path);$public=realpath(__DIR__);
if(!$path||!str_starts_with(strtolower($path),strtolower($public.DIRECTORY_SEPARATOR))){http_response_code(404);exit;}
// Cho phép truy cập trực tiếp 100% tất cả các trang web của hệ thống (Ôn thi, Diễn đàn, Gõ phím...)
// Không khóa, không chặn, không bắt buộc phải ghi danh khóa học LMS.
return false;
