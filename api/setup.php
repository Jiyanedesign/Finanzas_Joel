<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/config.php';

header('Content-Type: text/html; charset=utf-8');

try {
    // Conectar inicialmente a MySQL sin base de datos para intentar crearla si no existe (útil en local)
    $dsn = "mysql:host=" . DB_HOST . ";charset=utf8mb4";
    $options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
    $tempPdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    
    // Crear base de datos si no existe (en Hostinger puede fallar si no hay privilegios, por lo que el usuario debe crearla antes)
    $tempPdo->exec("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $tempPdo = null;

    // Conectar a la base de datos definitiva
    require_once __DIR__ . '/db_connect.php';
    
    echo "<h2>Inicializando Tablas de la Base de Datos...</h2>";

    // 1. Crear tablas
    $sqlSchema = "
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        security_pin VARCHAR(4),
        failed_login_attempts INT DEFAULT 0,
        lock_until DATETIME,
        last_login DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS monthly_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        month INT NOT NULL,
        year INT NOT NULL,
        initial_budget DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        initial_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        saving_goal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        currency VARCHAR(10) NOT NULL DEFAULT '$',
        notes TEXT,
        cycle_start_day INT DEFAULT 1,
        cycle_end_day INT DEFAULT 28,
        is_closed TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        bank VARCHAR(100),
        type VARCHAR(50) NOT NULL,
        last_four VARCHAR(4),
        color VARCHAR(10) DEFAULT '#4F46E5',
        text_color VARCHAR(10) DEFAULT '#FFFFFF',
        initial_balance DECIMAL(10,2) DEFAULT 0.00,
        credit_limit DECIMAL(10,2) DEFAULT 0.00,
        cut_off_day INT,
        due_day INT,
        status VARCHAR(20) DEFAULT 'activa',
        notes TEXT,
        parent_account_id INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(50) DEFAULT 'tag',
        color VARCHAR(10) DEFAULT '#10B981',
        budget DECIMAL(10,2) DEFAULT 0.00,
        rule_type VARCHAR(20) DEFAULT 'deseo',
        status VARCHAR(20) DEFAULT 'activa',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS subcategories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        month_config_id INT NOT NULL,
        date DATE NOT NULL,
        time TIME NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        title VARCHAR(150) NOT NULL,
        description TEXT,
        category_id INT,
        subcategory_id INT,
        payment_method VARCHAR(50) NOT NULL,
        account_id INT,
        expense_type VARCHAR(50) DEFAULT 'variable',
        status VARCHAR(20) DEFAULT 'pagado',
        merchant VARCHAR(100),
        related_person VARCHAR(100),
        custom_tag VARCHAR(50),
        is_deducible TINYINT DEFAULT 0,
        is_necessary TINYINT DEFAULT 1,
        is_planned TINYINT DEFAULT 1,
        is_recurring TINYINT DEFAULT 0,
        notes TEXT,
        split_type VARCHAR(20) DEFAULT 'simple',
        split_details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (month_config_id) REFERENCES monthly_configs(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE SET NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS incomes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        month_config_id INT NOT NULL,
        date DATE NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        source VARCHAR(100) NOT NULL,
        category_id INT,
        receipt_method VARCHAR(50),
        account_id INT,
        description TEXT,
        status VARCHAR(20) DEFAULT 'recibido',
        custom_tag VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (month_config_id) REFERENCES monthly_configs(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS receipts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        transaction_type VARCHAR(20) NOT NULL,
        transaction_id INT NOT NULL,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS recurring_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(150) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        category_id INT,
        payment_method VARCHAR(50) NOT NULL,
        account_id INT,
        frequency VARCHAR(50) NOT NULL,
        next_due_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'activo',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS debts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(150) NOT NULL,
        lender VARCHAR(150) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        paid_amount DECIMAL(10,2) DEFAULT 0.00,
        start_date DATE NOT NULL,
        due_date DATE,
        installments_total INT DEFAULT 1,
        installments_paid INT DEFAULT 0,
        installment_value DECIMAL(10,2),
        frequency VARCHAR(50) DEFAULT 'mensual',
        payment_method VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pendiente',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS savings_goals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(150) NOT NULL,
        target_amount DECIMAL(10,2) NOT NULL,
        saved_amount DECIMAL(10,2) DEFAULT 0.00,
        target_date DATE,
        description TEXT,
        priority VARCHAR(20) DEFAULT 'media',
        status VARCHAR(20) DEFAULT 'en_progreso',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS future_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        target_date DATE DEFAULT NULL,
        deduct_from_budget TINYINT(1) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pendiente',
        notes TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ";

    $pdo->exec($sqlSchema);
    
    try {
        $pdo->exec("ALTER TABLE accounts ADD COLUMN parent_account_id INT DEFAULT NULL");
        $pdo->exec("ALTER TABLE accounts ADD FOREIGN KEY (parent_account_id) REFERENCES accounts(id) ON DELETE SET NULL");
    } catch (Exception $e) {}

    try {
        $pdo->exec("
        CREATE TABLE IF NOT EXISTS future_expenses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            target_date DATE DEFAULT NULL,
            deduct_from_budget TINYINT(1) DEFAULT 0,
            status VARCHAR(50) DEFAULT 'pendiente',
            notes TEXT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
    } catch (Exception $e) {}

    try {
        $pdo->exec("ALTER TABLE accounts ADD COLUMN text_color VARCHAR(10) DEFAULT '#FFFFFF'");
    } catch (Exception $e) {}

    try {
        $pdo->exec("ALTER TABLE categories ADD COLUMN rule_type VARCHAR(20) DEFAULT 'deseo'");
    } catch (Exception $e) {}

    echo "<p class='text-success'>✔️ Estructura de tablas MySQL creada correctamente.</p>";

    // 2. Sembrar datos
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM users");
    $userCount = $stmt->fetch()['count'];

    $forceReset = isset($_GET['reset']) && $_GET['reset'] === 'confirm';

    if ($userCount == 0 || $forceReset) {
        echo "<h2>Restableciendo y Sembrando Datos Limpios...</h2>";

        // Limpiar base de datos por completo
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");
        $pdo->exec("TRUNCATE TABLE users;");
        $pdo->exec("TRUNCATE TABLE accounts;");
        $pdo->exec("TRUNCATE TABLE categories;");
        $pdo->exec("TRUNCATE TABLE subcategories;");
        $pdo->exec("TRUNCATE TABLE monthly_configs;");
        $pdo->exec("TRUNCATE TABLE incomes;");
        $pdo->exec("TRUNCATE TABLE expenses;");
        $pdo->exec("TRUNCATE TABLE debts;");
        $pdo->exec("TRUNCATE TABLE savings_goals;");
        $pdo->exec("TRUNCATE TABLE recurring_templates;");
        $pdo->exec("TRUNCATE TABLE audit_logs;");
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");

        // Crear usuario admin@admin.com / admin123
        $passHash = password_hash('admin123', PASSWORD_BCRYPT);
        $stmtUser = $pdo->prepare("INSERT INTO users (name, email, password_hash, security_pin) VALUES (?, ?, ?, ?)");
        $stmtUser->execute(['Joel Administrador', 'admin@admin.com', $passHash, '1234']);
        $userId = $pdo->lastInsertId();

        // Cuentas semilla (con balance inicial de 0.00 para empezar de cero)
        $accounts = [
            ['name' => 'Efectivo Personal', 'bank' => 'N/A', 'type' => 'efectivo', 'last_four' => null, 'color' => '#F59E0B', 'initial_balance' => 0.0],
            ['name' => 'Cuenta Pichincha', 'bank' => 'Banco Pichincha', 'type' => 'cuenta_bancaria', 'last_four' => '4567', 'color' => '#3B82F6', 'initial_balance' => 0.0],
            ['name' => 'Tarjeta Visa Gold', 'bank' => 'Banco Pichincha', 'type' => 'tarjeta_credito', 'last_four' => '9876', 'color' => '#EF4444', 'initial_balance' => 0.0, 'credit_limit' => 2000.0, 'cut' => 15, 'due' => 5],
            ['name' => 'Billetera Digital Deuna', 'bank' => 'Banco Pichincha', 'type' => 'billetera_digital', 'last_four' => null, 'color' => '#10B981', 'initial_balance' => 0.0]
        ];

        $accountIds = [];
        $stmtAcc = $pdo->prepare("INSERT INTO accounts (user_id, name, bank, type, last_four, color, initial_balance, credit_limit, cut_off_day, due_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($accounts as $acc) {
            $stmtAcc->execute([
                $userId, $acc['name'], $acc['bank'], $acc['type'], $acc['last_four'], $acc['color'], 
                $acc['initial_balance'], isset($acc['credit_limit']) ? $acc['credit_limit'] : 0, 
                isset($acc['cut']) ? $acc['cut'] : null, isset($acc['due']) ? $acc['due'] : null
            ]);
            $accountIds[$acc['name']] = $pdo->lastInsertId();
        }

        // Categorías semilla
        $categories = [
            ['name' => 'Alimentación', 'icon' => 'utensils', 'color' => '#EF4444', 'budget' => 0.0, 'rule_type' => 'necesidad', 'subs' => ['Supermercado', 'Restaurantes', 'Cafés']],
            ['name' => 'Transporte', 'icon' => 'car', 'color' => '#3B82F6', 'budget' => 0.0, 'rule_type' => 'necesidad', 'subs' => ['Gasolina', 'Taxi/Uber', 'Mantenimiento']],
            ['name' => 'Vivienda', 'icon' => 'home', 'color' => '#10B981', 'budget' => 0.0, 'rule_type' => 'necesidad', 'subs' => ['Alquiler', 'Servicios básicos', 'Internet', 'Reparaciones']],
            ['name' => 'Entretenimiento', 'icon' => 'film', 'color' => '#F59E0B', 'budget' => 0.0, 'rule_type' => 'deseo', 'subs' => ['Cine', 'Suscripciones', 'Salidas']],
            ['name' => 'Salud', 'icon' => 'heart', 'color' => '#EC4899', 'budget' => 0.0, 'rule_type' => 'necesidad', 'subs' => ['Medicinas', 'Consultas', 'Seguro']],
            ['name' => 'Educación', 'icon' => 'book', 'color' => '#8B5CF6', 'budget' => 0.0, 'rule_type' => 'necesidad', 'subs' => ['Cursos', 'Libros', 'Materiales']],
            ['name' => 'Ahorro', 'icon' => 'piggy-bank', 'color' => '#06B6D4', 'budget' => 0.0, 'rule_type' => 'ahorro', 'subs' => ['Fondo Emergencia', 'Inversiones']]
        ];

        $categoryIds = [];
        $stmtCat = $pdo->prepare("INSERT INTO categories (user_id, name, icon, color, budget, rule_type) VALUES (?, ?, ?, ?, ?, ?)");
        $stmtSub = $pdo->prepare("INSERT INTO subcategories (category_id, name) VALUES (?, ?)");
        
        foreach ($categories as $cat) {
            $stmtCat->execute([$userId, $cat['name'], $cat['icon'], $cat['color'], $cat['budget'], $cat['rule_type']]);
            $catId = $pdo->lastInsertId();
            $categoryIds[$cat['name']] = $catId;

            foreach ($cat['subs'] as $sub) {
                $stmtSub->execute([$catId, $sub]);
            }
        }

        // Log auditoría
        $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, 'CLEAN_DATABASE_RESET', 'Base de datos MySQL inicializada a cero con plantillas de categorías y cuentas vacías.', '127.0.0.1')");
        $stmtAudit->execute([$userId]);

        echo "<p class='text-success'>✔️ Base de datos restablecida a cero con éxito. Se crearon las plantillas de cuentas y categorías.</p>";
    } else {
        echo "<p class='text-info'>ℹ️ La base de datos ya contiene registros. Si desea borrar todo y restablecerla a cero, acceda a: <code>/api/setup.php?reset=confirm</code></p>";
    }

    echo "<h3>🎉 Configuración completada. Ya puedes iniciar sesión desde cero.</h3>";
    echo "<p><a href='/index.html' style='font-size: 1.15rem; font-weight: bold; color: #4F46E5;'>Ir a la Página de Login de JiyaneFinance</a></p>";

} catch (PDOException $e) {
    echo "<h2 class='text-danger'>❌ Error durante la instalación:</h2>";
    echo "<pre>" . $e->getMessage() . "</pre>";
    echo "<p>Por favor verifique los credenciales y la base de datos MySQL en <code>api/config.php</code>.</p>";
}
?>
