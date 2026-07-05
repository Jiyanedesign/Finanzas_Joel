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
        initial_balance DECIMAL(10,2) DEFAULT 0.00,
        credit_limit DECIMAL(10,2) DEFAULT 0.00,
        cut_off_day INT,
        due_day INT,
        status VARCHAR(20) DEFAULT 'activa',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(50) DEFAULT 'tag',
        color VARCHAR(10) DEFAULT '#10B981',
        budget DECIMAL(10,2) DEFAULT 0.00,
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
    ";

    $pdo->exec($sqlSchema);
    echo "<p class='text-success'>✔️ Estructura de tablas MySQL creada correctamente.</p>";

    // 2. Sembrar datos si la tabla de usuarios está vacía
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM users");
    $userCount = $stmt->fetch()['count'];

    $stmtMCount = $pdo->query("SELECT COUNT(*) as count FROM monthly_configs");
    $monthCount = $stmtMCount->fetch()['count'];

    if ($userCount == 0 || $monthCount == 0) {
        echo "<h2>Sembrando Datos Financieros Iniciales...</h2>";

        // Limpiar para evitar duplicados parciales de ejecuciones previas
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

        // Cuentas semilla
        $accounts = [
            ['name' => 'Efectivo Personal', 'bank' => 'N/A', 'type' => 'efectivo', 'last_four' => null, 'color' => '#F59E0B', 'initial_balance' => 150.0],
            ['name' => 'Cuenta Ahorros Pichincha', 'bank' => 'Banco Pichincha', 'type' => 'cuenta_bancaria', 'last_four' => '4567', 'color' => '#3B82F6', 'initial_balance' => 1200.0],
            ['name' => 'Tarjeta Visa Gold', 'bank' => 'Banco Pichincha', 'type' => 'tarjeta_credito', 'last_four' => '9876', 'color' => '#EF4444', 'initial_balance' => 0.0, 'credit_limit' => 2000.0, 'cut' => 15, 'due' => 5],
            ['name' => 'Billetera Digital Deuna', 'bank' => 'Banco Pichincha', 'type' => 'billetera_digital', 'last_four' => null, 'color' => '#10B981', 'initial_balance' => 50.0]
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
            ['name' => 'Alimentación', 'icon' => 'utensils', 'color' => '#EF4444', 'budget' => 200.0, 'subs' => ['Supermercado', 'Restaurantes', 'Cafés']],
            ['name' => 'Transporte', 'icon' => 'car', 'color' => '#3B82F6', 'budget' => 80.0, 'subs' => ['Gasolina', 'Taxi/Uber', 'Mantenimiento']],
            ['name' => 'Vivienda', 'icon' => 'home', 'color' => '#10B981', 'budget' => 450.0, 'subs' => ['Alquiler', 'Servicios básicos', 'Internet', 'Reparaciones']],
            ['name' => 'Entretenimiento', 'icon' => 'film', 'color' => '#F59E0B', 'budget' => 80.0, 'subs' => ['Cine', 'Suscripciones', 'Salidas']],
            ['name' => 'Salud', 'icon' => 'heart', 'color' => '#EC4899', 'budget' => 50.0, 'subs' => ['Medicinas', 'Consultas', 'Seguro']],
            ['name' => 'Educación', 'icon' => 'book', 'color' => '#8B5CF6', 'budget' => 100.0, 'subs' => ['Cursos', 'Libros', 'Materiales']],
            ['name' => 'Ahorro', 'icon' => 'piggy-bank', 'color' => '#06B6D4', 'budget' => 150.0, 'subs' => ['Fondo Emergencia', 'Inversiones']]
        ];

        $categoryIds = [];
        $stmtCat = $pdo->prepare("INSERT INTO categories (user_id, name, icon, color, budget) VALUES (?, ?, ?, ?, ?)");
        $stmtSub = $pdo->prepare("INSERT INTO subcategories (category_id, name) VALUES (?, ?)");
        
        foreach ($categories as $cat) {
            $stmtCat->execute([$userId, $cat['name'], $cat['icon'], $cat['color'], $cat['budget']]);
            $catId = $pdo->lastInsertId();
            $categoryIds[$cat['name']] = $catId;

            foreach ($cat['subs'] as $sub) {
                $stmtSub->execute([$catId, $sub]);
            }
        }

        $stmtMonth = $pdo->prepare("INSERT INTO monthly_configs (user_id, month, year, initial_budget, initial_balance, saving_goal, currency, notes, cycle_start_day, cycle_end_day) VALUES (?, 7, 2026, 1200.00, 1400.00, 200.00, '$', ?, 1, 31)");
        $stmtMonth->execute([$userId, 'Mes de planificación de prueba - Julio']);
        $monthConfigId = $pdo->lastInsertId();

        // Obtener subcategorías asociadas
        $stmtGetSub = $pdo->prepare("SELECT s.id FROM subcategories s JOIN categories c ON s.category_id = c.id WHERE c.name = ? AND s.name = ?");
        
        $stmtGetSub->execute(['Alimentación', 'Supermercado']);
        $subSuper = $stmtGetSub->fetch()['id'] ?? null;

        $stmtGetSub->execute(['Vivienda', 'Alquiler']);
        $subAlquiler = $stmtGetSub->fetch()['id'] ?? null;

        $stmtGetSub->execute(['Vivienda', 'Internet']);
        $subInternet = $stmtGetSub->fetch()['id'] ?? null;

        $stmtGetSub->execute(['Transporte', 'Gasolina']);
        $subGasolina = $stmtGetSub->fetch()['id'] ?? null;

        $stmtGetSub->execute(['Entretenimiento', 'Suscripciones']);
        $subNetflix = $stmtGetSub->fetch()['id'] ?? null;

        // Sembrar Ingresos
        $incomes = [
            ['2026-07-01', 1500.00, 'Sueldo Mensual', 'Transferencia', 'Cuenta Ahorros Pichincha', 'Pago mensual de nómina principal'],
            ['2026-07-10', 250.00, 'Proyecto Freelance', 'Transferencia', 'Cuenta Ahorros Pichincha', 'Desarrollo de landing page para cliente'],
            ['2026-07-15', 40.00, 'Reembolso Cena', 'Billetera Digital', 'Billetera Digital Deuna', 'Reembolso por parte de amigos']
        ];
        
        $stmtInc = $pdo->prepare("INSERT INTO incomes (user_id, month_config_id, date, amount, source, receipt_method, account_id, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'recibido')");
        foreach ($incomes as $inc) {
            $stmtInc->execute([$userId, $monthConfigId, $inc[0], $inc[1], $inc[2], $inc[3], $accountIds[$inc[4]], $inc[5]]);
        }

        // Sembrar Gastos
        $expenses = [
            ['2026-07-01', '09:00', 400.00, 'Alquiler Departamento', 'Vivienda', $subAlquiler, 'transferencia_bancaria', 'Cuenta Ahorros Pichincha', 'fijo', 'Propietario Juan', 'personal', 'Pago mensual de alquiler'],
            ['2026-07-03', '14:30', 85.50, 'Compra Semanal Supermercado', 'Alimentación', $subSuper, 'tarjeta_debito', 'Cuenta Ahorros Pichincha', 'variable', 'Supermaxi', 'familia', 'Compra para el hogar'],
            ['2026-07-05', '18:00', 25.00, 'Tanqueada Combustible', 'Transporte', $subGasolina, 'efectivo', 'Efectivo Personal', 'variable', 'Gasolinera Primax', 'personal', 'Gasolina súper para auto'],
            ['2026-07-06', '08:00', 40.00, 'Servicio de Internet Fibra', 'Vivienda', $subInternet, 'tarjeta_credito', 'Tarjeta Visa Gold', 'fijo', 'Netlife', 'servicios', 'Internet del hogar'],
            ['2026-07-12', '20:15', 12.99, 'Mensualidad Netflix', 'Entretenimiento', $subNetflix, 'tarjeta_credito', 'Tarjeta Visa Gold', 'recurrente', 'Netflix', 'suscripciones', 'Suscripción familiar']
        ];

        $stmtExp = $pdo->prepare("INSERT INTO expenses (user_id, month_config_id, date, time, amount, title, category_id, subcategory_id, payment_method, account_id, expense_type, status, merchant, custom_tag, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pagado', ?, ?, ?)");
        foreach ($expenses as $exp) {
            $stmtExp->execute([
                $userId, $monthConfigId, $exp[0], $exp[1], $exp[2], $exp[3], $categoryIds[$exp[4]], $exp[5], 
                $exp[6], $accountIds[$exp[7]], $exp[8], $exp[9], $exp[10], $exp[11]
            ]);
        }

        // Sembrar deudas
        $stmtDebt = $pdo->prepare("INSERT INTO debts (user_id, name, lender, total_amount, paid_amount, start_date, due_date, installments_total, installments_paid, installment_value, status, notes) VALUES (?, 'Préstamo Auto', 'Banco Pichincha', 5000.00, 1500.00, '2026-01-10', '2027-12-10', 24, 6, 220.00, 'pendiente', 'Préstamo compra auto.')");
        $stmtDebt->execute([$userId]);

        // Sembrar metas
        $stmtGoal = $pdo->prepare("INSERT INTO savings_goals (user_id, name, target_amount, saved_amount, target_date, description, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'en_progreso')");
        $stmtGoal->execute([$userId, 'Fondo de Emergencia', 2000.00, 800.00, '2026-12-31', '3 meses de gastos cubiertos.', 'alta']);
        $stmtGoal->execute([$userId, 'Viaje Fin de Año', 1500.00, 300.00, '2026-12-15', 'Vacaciones familiares.', 'media']);

        // Sembrar recurrentes
        $stmtRec = $pdo->prepare("INSERT INTO recurring_templates (user_id, name, amount, category_id, payment_method, account_id, frequency, next_due_date, notes) VALUES (?, 'Spotify Duo', 8.99, ?, 'tarjeta_credito', ?, 'mensual', '2026-08-01', 'Música premium')");
        $stmtRec->execute([$userId, $categoryIds['Entretenimiento'], $accountIds['Tarjeta Visa Gold']]);

        // Log auditoría
        $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, 'SEED_DATABASE_MYSQL', 'Base de datos MySQL sembrada con éxito en setup.', '127.0.0.1')");
        $stmtAudit->execute([$userId]);

        echo "<p class='text-success'>✔️ Datos iniciales y credenciales de prueba sembrados correctamente.</p>";
    } else {
        echo "<p class='text-info'>ℹ️ Los datos ya se encontraban sembrados previamente.</p>";
    }

    echo "<h3>🎉 Instalación completada con éxito. Ya puedes iniciar sesión.</h3>";
    echo "<p><a href='/index.html' style='font-size: 1.15rem; font-weight: bold; color: #4F46E5;'>Ir a la Página de Login de AuraFinance</a></p>";

} catch (PDOException $e) {
    echo "<h2 class='text-danger'>❌ Error durante la instalación:</h2>";
    echo "<pre>" . $e->getMessage() . "</pre>";
    echo "<p>Por favor verifique que la base de datos indicada en <code>api/config.php</code> esté creada en su panel de Hostinger y que los credenciales sean correctos.</p>";
}
?>
