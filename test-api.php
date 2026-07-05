<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: text/html; charset=utf-8');

echo "<h1>AuraFinance - Diagnóstico de Servidor y Conexión</h1>";

// 1. Verificar PHP
echo "<h3>1. Entorno PHP</h3>";
echo "Versión de PHP: " . PHP_VERSION . "<br>";
if (version_compare(PHP_VERSION, '8.0.0', '>=')) {
    echo "<span style='color:green;'>✔️ Versión de PHP recomendada (>= 8.0.0).</span><br>";
} else {
    echo "<span style='color:orange;'>⚠️ Se recomienda PHP 8.0 o superior.</span><br>";
}

// 2. Verificar Extensiones
echo "<h3>2. Extensiones Requeridas</h3>";
$pdo_mysql = extension_loaded('pdo_mysql');
echo "Extensión pdo_mysql: " . ($pdo_mysql ? "<span style='color:green;'>✔️ Instalada</span>" : "<span style='color:red;'>❌ NO instalada (Requerida para MySQL)</span>") . "<br>";

// 3. Cargar Configuración
echo "<h3>3. Carga de Archivos de Configuración</h3>";
if (file_exists(__DIR__ . '/api/config.php')) {
    echo "<span style='color:green;'>✔️ api/config.php encontrado.</span><br>";
    require_once __DIR__ . '/api/config.php';
    echo "DB Host: " . DB_HOST . "<br>";
    echo "DB Name: " . DB_NAME . "<br>";
    echo "DB User: " . DB_USER . "<br>";
} else {
    echo "<span style='color:red;'>❌ api/config.php NO encontrado en la raíz.</span><br>";
}

// 4. Intentar Conexión PDO
echo "<h3>4. Conexión a la Base de Datos</h3>";
if ($pdo_mysql && defined('DB_HOST')) {
    try {
        $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ];
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        echo "<span style='color:green;'>✔️ Conexión exitosa a la base de datos MySQL.</span><br>";

        // 5. Verificar Tablas
        echo "<h3>5. Verificación de Tablas</h3>";
        $tables = ['users', 'monthly_configs', 'accounts', 'categories', 'expenses', 'incomes', 'debts', 'savings_goals'];
        foreach ($tables as $t) {
            try {
                $stmt = $pdo->query("SELECT COUNT(*) as cnt FROM `$t`");
                $count = $stmt->fetch()['cnt'];
                echo "Tabla <strong>$t</strong>: <span style='color:green;'>✔️ Existe</span> (Registros: $count)<br>";
                
                if ($t === 'users') {
                    $stmtUser = $pdo->query("SELECT id, name, email, password_hash FROM users");
                    $users = $stmtUser->fetchAll();
                    echo "--- Usuarios registrados:<br>";
                    foreach ($users as $u) {
                        $verified = password_verify('admin123', $u['password_hash']);
                        echo "------ ID: {$u['id']} | Nombre: {$u['name']} | Email: {$u['email']} | Verificación 'admin123': " . ($verified ? "<span style='color:green;'>✔️ CORRECTA</span>" : "<span style='color:red;'>❌ INCORRECTA</span>") . "<br>";
                    }
                }
            } catch (PDOException $ex) {
                echo "Tabla <strong>$t</strong>: <span style='color:red;'>❌ ERROR o No existe</span> ({$ex->getMessage()})<br>";
            }
        }

    } catch (PDOException $e) {
        echo "<span style='color:red;'>❌ Error de conexión: " . $e->getMessage() . "</span><br>";
    }
} else {
    echo "<span style='color:orange;'>⚠️ No se puede probar la conexión debido a dependencias faltantes.</span><br>";
}
?>
