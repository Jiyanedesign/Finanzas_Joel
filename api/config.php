<?php
// Configuración de la base de datos MySQL (Hostinger / Localhost)
define('DB_HOST', 'localhost');
define('DB_NAME', 'aura_finance');
define('DB_USER', 'root');
define('DB_PASS', '');

// Configuración general
define('SESSION_LIFETIME', 86400); // 1 día en segundos
define('UPLOAD_DIR', __DIR__ . '/../public/uploads/');
define('MAX_FILE_SIZE', 5242880); // 5MB
?>
