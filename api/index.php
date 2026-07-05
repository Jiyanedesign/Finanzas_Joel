<?php
error_reporting(0); // Desactivar reportes de warnings para no romper respuestas JSON en producción
ini_set('display_errors', 0);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db_connect.php';

// Iniciar sesión con parámetros seguros
session_start([
    'cookie_lifetime' => SESSION_LIFETIME,
    'cookie_httponly' => true,
    'cookie_samesite' => 'Strict'
]);

header('Content-Type: application/json; charset=utf-8');

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Helper: Obtener cuerpo JSON de la petición
function getJsonInput() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

// Helper: Escribir log de auditoría
function logActivity($pdo, $userId, $action, $details) {
    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    try {
        $stmt = $pdo->prepare("INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)");
        $stmt->execute([$userId, $action, $details, $ip]);
    } catch (Exception $e) {}
}

// Helper: Forzar Autenticación
function requireAuth() {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(410);
        echo json_encode(['error' => 'Sesión expirada o inválida. Por favor inicie sesión.']);
        exit;
    }
}

// Helper: Limpiar inputs contra ataques XSS
function clean($str) {
    return htmlspecialchars(trim($str ?? ''), ENT_QUOTES, 'UTF-8');
}

// ==========================================
// CONTROLADOR CENTRAL DE ACCIONES (API ROUTER)
// ==========================================
try {
    switch ($action) {
        
        // ------------------------------------------
        // AUTENTICACIÓN
        // ------------------------------------------
        case 'register':
            if ($method !== 'POST') throw new Exception('Método no permitido', 405);
            $data = getJsonInput();
            $name = clean($data['name'] ?? '');
            $email = clean($data['email'] ?? '');
            $password = $data['password'] ?? '';

            if (empty($name) || empty($email) || empty($password)) {
                throw new Exception('Todos los campos son requeridos.');
            }
            if (strlen($password) < 8) {
                throw new Exception('La contraseña debe tener al menos 8 caracteres.');
            }

            // Verificar duplicados
            $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
            $stmt->execute([$email]);
            if ($stmt->fetch()) {
                throw new Exception('Este correo electrónico ya está registrado.');
            }

            $hash = password_hash($password, PASSWORD_BCRYPT);
            $stmtInsert = $pdo->prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)");
            $stmtInsert->execute([$name, $email, $hash]);
            $newId = $pdo->lastInsertId();

            logActivity($pdo, $newId, 'REGISTER', 'Usuario registrado con éxito.');
            echo json_encode(['message' => 'Usuario registrado con éxito. Ahora puede iniciar sesión.']);
            break;

        case 'login':
            if ($method !== 'POST') throw new Exception('Método no permitido', 405);
            $data = getJsonInput();
            $email = clean($data['email'] ?? '');
            $password = $data['password'] ?? '';

            if (empty($email) || empty($password)) {
                throw new Exception('Email y contraseña requeridos.');
            }

            $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
            $stmt->execute([$email]);
            $user = $stmt->fetch();

            if (!$user) {
                throw new Exception('Credenciales inválidas.');
            }

            // Comprobar bloqueo temporal
            if ($user['lock_until']) {
                $lockTime = new DateTime($user['lock_until']);
                $now = new DateTime();
                if ($lockTime > $now) {
                    $diff = $lockTime->diff($now);
                    $minutes = ($diff->h * 60) + $diff->i;
                    throw new Exception("Cuenta bloqueada temporalmente. Intente de nuevo en {$minutes} minutos.");
                }
            }

            if (!password_verify($password, $user['password_hash'])) {
                // Incrementar intentos fallidos
                $attempts = $user['failed_login_attempts'] + 1;
                $lockUntil = null;
                $errorMsg = 'Credenciales inválidas.';

                if ($attempts >= 5) {
                    $now = new DateTime();
                    $now->modify('+15 minutes');
                    $lockUntil = $now->format('Y-m-d H:i:s');
                    $errorMsg = 'Demasiados intentos fallidos. Su cuenta ha sido bloqueada por 15 minutos.';
                }

                $stmtUpdate = $pdo->prepare("UPDATE users SET failed_login_attempts = ?, lock_until = ? WHERE id = ?");
                $stmtUpdate->execute([$attempts, $lockUntil, $user['id']]);
                
                logActivity($pdo, $user['id'], 'LOGIN_FAILED', "Intento fallido de login. Intento #{$attempts}");
                throw new Exception($errorMsg);
            }

            // Resetear fallos y login exitoso
            $nowStr = date('Y-m-d H:i:s');
            $stmtSuccess = $pdo->prepare("UPDATE users SET failed_login_attempts = 0, lock_until = NULL, last_login = ? WHERE id = ?");
            $stmtSuccess->execute([$nowStr, $user['id']]);

            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_name'] = $user['name'];
            $_SESSION['user_email'] = $user['email'];

            logActivity($pdo, $user['id'], 'LOGIN_SUCCESS', 'Inicio de sesión exitoso.');

            echo json_encode([
                'message' => 'Inicio de sesión exitoso.',
                'user' => [
                    'id' => $user['id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'lastLogin' => $user['last_login'],
                    'hasPin' => !empty($user['security_pin'])
                ]
            ]);
            break;

        case 'logout':
            requireAuth();
            logActivity($pdo, $_SESSION['user_id'], 'LOGOUT', 'Cierre de sesión.');
            session_destroy();
            echo json_encode(['message' => 'Sesión cerrada correctamente.']);
            break;

        case 'me':
            if (!isset($_SESSION['user_id'])) {
                http_response_code(411);
                echo json_encode(['error' => 'No autenticado.']);
                exit;
            }
            $stmt = $pdo->prepare("SELECT name, email, last_login, security_pin FROM users WHERE id = ?");
            $stmt->execute([$_SESSION['user_id']]);
            $user = $stmt->fetch();
            echo json_encode([
                'user' => [
                    'id' => $_SESSION['user_id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'lastLogin' => $user['last_login'],
                    'hasPin' => !empty($user['security_pin'])
                ]
            ]);
            break;

        case 'verify-pin':
            requireAuth();
            $data = getJsonInput();
            $pin = clean($data['pin'] ?? '');

            $stmt = $pdo->prepare("SELECT security_pin FROM users WHERE id = ?");
            $stmt->execute([$_SESSION['user_id']]);
            $user = $stmt->fetch();

            if (empty($user['security_pin'])) {
                echo json_encode(['success' => true, 'message' => 'PIN no configurado']);
            } else if ($user['security_pin'] === $pin) {
                echo json_encode(['success' => true]);
            } else {
                throw new Exception('PIN incorrecto.');
            }
            break;

        case 'change-pin':
            requireAuth();
            $data = getJsonInput();
            $pin = clean($data['pin'] ?? '');

            if (!empty($pin) && (!is_numeric($pin) || strlen($pin) !== 4)) {
                throw new Exception('El PIN debe ser numérico de 4 dígitos.');
            }

            $stmt = $pdo->prepare("UPDATE users SET security_pin = ? WHERE id = ?");
            $stmt->execute([empty($pin) ? null : $pin, $_SESSION['user_id']]);

            logActivity($pdo, $_SESSION['user_id'], 'PIN_CHANGE', empty($pin) ? 'PIN desactivado.' : 'PIN de seguridad configurado.');
            echo json_encode(['message' => empty($pin) ? 'PIN desactivado.' : 'PIN configurado con éxito.']);
            break;

        case 'update-profile':
            requireAuth();
            $data = getJsonInput();
            $name = clean($data['name'] ?? '');
            $email = clean($data['email'] ?? '');

            if (empty($name) || empty($email)) {
                throw new Exception('Nombre y email son requeridos.');
            }

            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new Exception('El formato del correo electrónico es inválido.');
            }

            // Comprobar si el correo ya está registrado por otro usuario
            $stmtCheck = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
            $stmtCheck->execute([$email, $_SESSION['user_id']]);
            if ($stmtCheck->fetch()) {
                throw new Exception('Este correo electrónico ya está en uso por otra cuenta.');
            }

            // Actualizar usuario
            $stmt = $pdo->prepare("UPDATE users SET name = ?, email = ? WHERE id = ?");
            $stmt->execute([$name, $email, $_SESSION['user_id']]);

            $_SESSION['user_name'] = $name;
            $_SESSION['user_email'] = $email;

            logActivity($pdo, $_SESSION['user_id'], 'UPDATE_PROFILE', "Perfil actualizado. Nuevo correo: {$email}");
            echo json_encode(['message' => 'Perfil actualizado con éxito.']);
            break;

        case 'change-password':
            requireAuth();
            $data = getJsonInput();
            $current = $data['currentPassword'] ?? '';
            $new = $data['newPassword'] ?? '';

            if (empty($current) || empty($new)) {
                throw new Exception('Ambos campos son requeridos.');
            }
            if (strlen($new) < 8) {
                throw new Exception('La contraseña debe tener al menos 8 caracteres.');
            }

            $stmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = ?");
            $stmt->execute([$_SESSION['user_id']]);
            $user = $stmt->fetch();

            if (!password_verify($current, $user['password_hash'])) {
                throw new Exception('La contraseña actual es incorrecta.');
            }

            $newHash = password_hash($new, PASSWORD_BCRYPT);
            $stmtUpdate = $pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
            $stmtUpdate->execute([$newHash, $_SESSION['user_id']]);

            logActivity($pdo, $_SESSION['user_id'], 'PASSWORD_CHANGE', 'Contraseña cambiada con éxito.');
            echo json_encode(['message' => 'Contraseña cambiada con éxito.']);
            break;

        case 'recover-password':
            $data = getJsonInput();
            $email = clean($data['email'] ?? '');
            $pin = clean($data['pin'] ?? '');
            $new = $data['newPassword'] ?? '';

            if (empty($email) || empty($pin) || empty($new)) {
                throw new Exception('Email, PIN y nueva contraseña son obligatorios.');
            }
            if (strlen($new) < 8) {
                throw new Exception('La contraseña debe tener al menos 8 caracteres.');
            }

            $stmt = $pdo->prepare("SELECT id, security_pin FROM users WHERE email = ?");
            $stmt->execute([$email]);
            $user = $stmt->fetch();

            if (!$user || empty($user['security_pin']) || $user['security_pin'] !== $pin) {
                throw new Exception('Credenciales o PIN de recuperación incorrectos.');
            }

            $newHash = password_hash($new, PASSWORD_BCRYPT);
            $stmtUpdate = $pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
            $stmtUpdate->execute([$newHash, $user['id']]);

            logActivity($pdo, $user['id'], 'PASSWORD_RECOVER', 'Contraseña recuperada mediante PIN.');
            echo json_encode(['message' => 'Contraseña restablecida con éxito. Ya puede iniciar sesión.']);
            break;

        // ------------------------------------------
        // CONFIGURACIONES MENSUALES
        // ------------------------------------------
        case 'get_months':
            requireAuth();
            $stmt = $pdo->prepare("SELECT * FROM monthly_configs WHERE user_id = ? ORDER BY year DESC, month DESC");
            $stmt->execute([$_SESSION['user_id']]);
            echo json_encode($stmt->fetchAll());
            break;

        case 'create_month':
            requireAuth();
            $data = getJsonInput();
            $month = intval($data['month'] ?? 0);
            $year = intval($data['year'] ?? 0);
            $budget = floatval($data['initial_budget'] ?? 0);
            $balance = floatval($data['initial_balance'] ?? 0);
            $goal = floatval($data['saving_goal'] ?? 0);
            $currency = clean($data['currency'] ?? '$');
            $start = intval($data['cycle_start_day'] ?? 1);
            $end = intval($data['cycle_end_day'] ?? 28);
            $notes = clean($data['notes'] ?? '');

            if ($month < 1 || $month > 12 || $year < 2020) {
                throw new Exception('Mes o año inválidos.');
            }

            $stmtCheck = $pdo->prepare("SELECT id FROM monthly_configs WHERE user_id = ? AND month = ? AND year = ?");
            $stmtCheck->execute([$_SESSION['user_id'], $month, $year]);
            if ($stmtCheck->fetch()) {
                throw new Exception('El mes financiero indicado ya está configurado.');
            }

            $stmt = $pdo->prepare("INSERT INTO monthly_configs (user_id, month, year, initial_budget, initial_balance, saving_goal, currency, notes, cycle_start_day, cycle_end_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$_SESSION['user_id'], $month, $year, $budget, $balance, $goal, $currency, $notes, $start, $end]);
            
            $newId = $pdo->lastInsertId();
            logActivity($pdo, $_SESSION['user_id'], 'CREATE_MONTH', "Mes creado: {$month}/{$year}");
            echo json_encode(['id' => $newId, 'message' => 'Mes financiero configurado correctamente.']);
            break;

        case 'update_month':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            $data = getJsonInput();
            $budget = floatval($data['initial_budget'] ?? 0);
            $balance = floatval($data['initial_balance'] ?? 0);
            $goal = floatval($data['saving_goal'] ?? 0);
            $currency = clean($data['currency'] ?? '$');
            $start = intval($data['cycle_start_day'] ?? 1);
            $end = intval($data['cycle_end_day'] ?? 28);
            $notes = clean($data['notes'] ?? '');

            $stmtCheck = $pdo->prepare("SELECT is_closed FROM monthly_configs WHERE id = ? AND user_id = ?");
            $stmtCheck->execute([$id, $_SESSION['user_id']]);
            $month = $stmtCheck->fetch();
            if (!$month) throw new Exception('Mes no encontrado.');
            if ($month['is_closed']) throw new Exception('El mes está cerrado. Edición bloqueada.');

            $stmt = $pdo->prepare("UPDATE monthly_configs SET initial_budget = ?, initial_balance = ?, saving_goal = ?, currency = ?, notes = ?, cycle_start_day = ?, cycle_end_day = ? WHERE id = ? AND user_id = ?");
            $stmt->execute([$budget, $balance, $goal, $currency, $notes, $start, $end, $id, $_SESSION['user_id']]);

            logActivity($pdo, $_SESSION['user_id'], 'UPDATE_MONTH', "Configuración de mes ID {$id} actualizada.");
            echo json_encode(['message' => 'Configuración actualizada correctamente.']);
            break;

        case 'close_month':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);

            $stmtCheck = $pdo->prepare("SELECT * FROM monthly_configs WHERE id = ? AND user_id = ?");
            $stmtCheck->execute([$id, $_SESSION['user_id']]);
            $month = $stmtCheck->fetch();

            if (!$month) throw new Exception('Mes no encontrado.');
            if ($month['is_closed']) throw new Exception('El mes ya está cerrado.');

            // Cerrar mes actual
            $stmtClose = $pdo->prepare("UPDATE monthly_configs SET is_closed = 1 WHERE id = ?");
            $stmtClose->execute([$id]);

            // Calcular mes siguiente
            $nextMonth = $month['month'] + 1;
            $nextYear = $month['year'];
            if ($nextMonth > 12) {
                $nextMonth = 1;
                $nextYear += 1;
            }

            // Comprobar si ya existe
            $stmtNext = $pdo->prepare("SELECT id FROM monthly_configs WHERE user_id = ? AND month = ? AND year = ?");
            $stmtNext->execute([$_SESSION['user_id'], $nextMonth, $nextYear]);
            $nextExists = $stmtNext->fetch();

            $nextMonthId = null;
            if (!$nextExists) {
                // Calcular balance resultante
                $stmtInc = $pdo->prepare("SELECT SUM(amount) as total FROM incomes WHERE month_config_id = ? AND status='recibido'");
                $stmtInc->execute([$id]);
                $totalIncomes = $stmtInc->fetch()['total'] ?? 0;

                $stmtExp = $pdo->prepare("SELECT SUM(amount) as total FROM expenses WHERE month_config_id = ? AND status='pagado'");
                $stmtExp->execute([$id]);
                $totalExpenses = $stmtExp->fetch()['total'] ?? 0;

                $finalBalance = $month['initial_balance'] + $totalIncomes - $totalExpenses;

                // Crear mes
                $stmtCreate = $pdo->prepare("INSERT INTO monthly_configs (user_id, month, year, initial_budget, initial_balance, saving_goal, currency, notes, cycle_start_day, cycle_end_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmtCreate->execute([$_SESSION['user_id'], $nextMonth, $nextYear, $month['initial_budget'], $finalBalance, $month['saving_goal'], $month['currency'], "Generado al cerrar periodo anterior {$month['month']}/{$month['year']}", $month['cycle_start_day'], $month['cycle_end_day']]);
                $nextMonthId = $pdo->lastInsertId();

                // Procesar recurrentes programados para el nuevo mes
                $stmtRec = $pdo->prepare("SELECT * FROM recurring_templates WHERE user_id = ? AND status = 'activo'");
                $stmtRec->execute([$_SESSION['user_id']]);
                $recurring = $stmtRec->fetchAll();

                $stmtInsertExp = $pdo->prepare("INSERT INTO expenses (user_id, month_config_id, date, time, amount, title, category_id, payment_method, account_id, expense_type, status, notes, is_recurring) VALUES (?, ?, ?, '08:00', ?, ?, ?, ?, ?, 'recurrente', 'pendiente', ?, 1)");
                $stmtUpdateRec = $pdo->prepare("UPDATE recurring_templates SET next_due_date = ? WHERE id = ?");

                foreach ($recurring as $rec) {
                    $recDate = new DateTime($rec['next_due_date']);
                    if (intval($recDate->format('m')) === $nextMonth && intval($recDate->format('Y')) === $nextYear) {
                        // Crear gasto pendiente
                        $stmtInsertExp->execute([
                            $_SESSION['user_id'], $nextMonthId, $rec['next_due_date'], $rec['amount'], $rec['name'], 
                            $rec['category_id'], $rec['payment_method'], $rec['account_id'], 'Gasto mensual recurrente programado.'
                        ]);

                        // Calcular próxima fecha
                        if ($rec['frequency'] === 'mensual') {
                            $recDate->modify('+1 month');
                        } else if ($rec['frequency'] === 'semanal') {
                            $recDate->modify('+7 days');
                        } else if ($rec['frequency'] === 'quincenal') {
                            $recDate->modify('+15 days');
                        } else if ($rec['frequency'] === 'anual') {
                            $recDate->modify('+1 year');
                        }
                        $stmtUpdateRec->execute([$recDate->format('Y-m-d'), $rec['id']]);
                    }
                }
            }

            logActivity($pdo, $_SESSION['user_id'], 'CLOSE_MONTH', "Cierre de mes {$month['month']}/{$month['year']}.");
            echo json_encode(['message' => 'Mes cerrado correctamente y nuevo mes financiero inicializado.', 'nextMonthId' => $nextMonthId]);
            break;

        // ------------------------------------------
        // CUENTAS Y TARJETAS
        // ------------------------------------------
        case 'get_accounts':
            requireAuth();
            $stmt = $pdo->prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY status ASC, name ASC");
            $stmt->execute([$_SESSION['user_id']]);
            echo json_encode($stmt->fetchAll());
            break;

        case 'create_account':
            requireAuth();
            $data = getJsonInput();
            $name = clean($data['name'] ?? '');
            $bank = clean($data['bank'] ?? '');
            $type = clean($data['type'] ?? '');
            $last_four = clean($data['last_four'] ?? '');
            $color = clean($data['color'] ?? '#4F46E5');
            $text_color = clean($data['text_color'] ?? '#FFFFFF');
            $balance = floatval($data['initial_balance'] ?? 0);
            $limit = floatval($data['credit_limit'] ?? 0);
            $cut = intval($data['cut_off_day'] ?? null);
            $due = intval($data['due_day'] ?? null);
            $notes = clean($data['notes'] ?? '');
            $parent_account_id = isset($data['parent_account_id']) && $data['parent_account_id'] !== '' ? intval($data['parent_account_id']) : null;

            if (empty($name) || empty($type)) throw new Exception('Nombre y tipo de cuenta requeridos.');

            $stmt = $pdo->prepare("INSERT INTO accounts (user_id, name, bank, type, last_four, color, text_color, initial_balance, credit_limit, cut_off_day, due_day, notes, parent_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$_SESSION['user_id'], $name, $bank, $type, $last_four ?: null, $color, $text_color, $balance, $limit, $cut ?: null, $due ?: null, $notes, $parent_account_id]);

            logActivity($pdo, $_SESSION['user_id'], 'CREATE_ACCOUNT', "Cuenta creada: {$name}");
            echo json_encode(['message' => 'Cuenta/Tarjeta creada con éxito.']);
            break;

        case 'update_account':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            $data = getJsonInput();
            $name = clean($data['name'] ?? '');
            $bank = clean($data['bank'] ?? '');
            $type = clean($data['type'] ?? '');
            $last_four = clean($data['last_four'] ?? '');
            $color = clean($data['color'] ?? '#4F46E5');
            $text_color = clean($data['text_color'] ?? '#FFFFFF');
            $balance = floatval($data['initial_balance'] ?? 0);
            $limit = floatval($data['credit_limit'] ?? 0);
            $cut = intval($data['cut_off_day'] ?? null);
            $due = intval($data['due_day'] ?? null);
            $status = clean($data['status'] ?? 'activa');
            $notes = clean($data['notes'] ?? '');
            $parent_account_id = isset($data['parent_account_id']) && $data['parent_account_id'] !== '' ? intval($data['parent_account_id']) : null;

            $stmt = $pdo->prepare("UPDATE accounts SET name = ?, bank = ?, type = ?, last_four = ?, color = ?, text_color = ?, initial_balance = ?, credit_limit = ?, cut_off_day = ?, due_day = ?, status = ?, notes = ?, parent_account_id = ? WHERE id = ? AND user_id = ?");
            $stmt->execute([$name, $bank, $type, $last_four ?: null, $color, $text_color, $balance, $limit, $cut ?: null, $due ?: null, $status, $notes, $parent_account_id, $id, $_SESSION['user_id']]);

            logActivity($pdo, $_SESSION['user_id'], 'UPDATE_ACCOUNT', "Cuenta actualizada: {$name}");
            echo json_encode(['message' => 'Cuenta/Tarjeta actualizada con éxito.']);
            break;

        case 'delete_account':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            
            $stmt = $pdo->prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?");
            $stmt->execute([$id, $_SESSION['user_id']]);
            
            logActivity($pdo, $_SESSION['user_id'], 'DELETE_ACCOUNT', "Cuenta eliminada ID {$id}");
            echo json_encode(['message' => 'Cuenta/Tarjeta eliminada.']);
            break;

        // ------------------------------------------
        // CATEGORÍAS Y SUBCATEGORÍAS
        // ------------------------------------------
        case 'get_categories':
            requireAuth();
            $stmt = $pdo->prepare("SELECT * FROM categories WHERE user_id = ? ORDER BY name ASC");
            $stmt->execute([$_SESSION['user_id']]);
            $categories = $stmt->fetchAll();

            $stmtSub = $pdo->prepare("SELECT * FROM subcategories WHERE category_id = ? ORDER BY name ASC");
            foreach ($categories as &$c) {
                $stmtSub->execute([$c['id']]);
                $c['subcategories'] = $stmtSub->fetchAll();
            }
            echo json_encode($categories);
            break;

        case 'create_category':
            requireAuth();
            $data = getJsonInput();
            $name = clean($data['name'] ?? '');
            $icon = clean($data['icon'] ?? 'tag');
            $color = clean($data['color'] ?? '#10B981');
            $budget = floatval($data['budget'] ?? 0);
            $rule_type = clean($data['rule_type'] ?? 'deseo');
            $subcategories = $data['subcategories'] ?? [];

            if (empty($name)) throw new Exception('El nombre es obligatorio.');

            $stmt = $pdo->prepare("INSERT INTO categories (user_id, name, icon, color, budget, rule_type) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$_SESSION['user_id'], $name, $icon, $color, $budget, $rule_type]);
            $catId = $pdo->lastInsertId();

            $stmtSub = $pdo->prepare("INSERT INTO subcategories (category_id, name) VALUES (?, ?)");
            foreach ($subcategories as $sub) {
                if (!empty(trim($sub))) {
                    $stmtSub->execute([$catId, clean($sub)]);
                }
            }

            logActivity($pdo, $_SESSION['user_id'], 'CREATE_CATEGORY', "Categoría creada: {$name}");
            echo json_encode(['message' => 'Categoría creada con éxito.']);
            break;

        case 'update_category':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            $data = getJsonInput();
            $name = clean($data['name'] ?? '');
            $icon = clean($data['icon'] ?? 'tag');
            $color = clean($data['color'] ?? '#10B981');
            $budget = floatval($data['budget'] ?? 0);
            $rule_type = clean($data['rule_type'] ?? 'deseo');
            $status = clean($data['status'] ?? 'activa');
            $subcategories = $data['subcategories'] ?? [];

            $stmt = $pdo->prepare("UPDATE categories SET name = ?, icon = ?, color = ?, budget = ?, rule_type = ?, status = ? WHERE id = ? AND user_id = ?");
            $stmt->execute([$name, $icon, $color, $budget, $rule_type, $status, $id, $_SESSION['user_id']]);

            // Actualizar subcategorías
            $stmtDel = $pdo->prepare("DELETE FROM subcategories WHERE category_id = ?");
            $stmtDel->execute([$id]);

            $stmtSub = $pdo->prepare("INSERT INTO subcategories (category_id, name) VALUES (?, ?)");
            foreach ($subcategories as $sub) {
                if (!empty(trim($sub))) {
                    $stmtSub->execute([$id, clean($sub)]);
                }
            }

            logActivity($pdo, $_SESSION['user_id'], 'UPDATE_CATEGORY', "Categoría actualizada: {$name}");
            echo json_encode(['message' => 'Categoría actualizada con éxito.']);
            break;

        case 'delete_category':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            
            $stmt = $pdo->prepare("DELETE FROM categories WHERE id = ? AND user_id = ?");
            $stmt->execute([$id, $_SESSION['user_id']]);
            
            logActivity($pdo, $_SESSION['user_id'], 'DELETE_CATEGORY', "Categoría eliminada ID {$id}");
            echo json_encode(['message' => 'Categoría eliminada con éxito.']);
            break;

        // ------------------------------------------
        // INGRESOS
        // ------------------------------------------
        case 'get_incomes':
            requireAuth();
            $monthConfigId = intval($_GET['monthConfigId'] ?? 0);
            if (!$monthConfigId) throw new Exception('ID de mes requerido.');

            $stmt = $pdo->prepare("
                SELECT i.*, c.name as category_name, a.name as account_name, a.color as account_color, r.filename as receipt_file
                FROM incomes i
                LEFT JOIN categories c ON i.category_id = c.id
                LEFT JOIN accounts a ON i.account_id = a.id
                LEFT JOIN receipts r ON r.transaction_type = 'income' AND r.transaction_id = i.id
                WHERE i.user_id = ? AND i.month_config_id = ?
                ORDER BY i.date DESC, i.id DESC
            ");
            $stmt->execute([$_SESSION['user_id'], $monthConfigId]);
            echo json_encode($stmt->fetchAll());
            break;

        case 'create_income':
            requireAuth();
            $data = getJsonInput();
            $monthConfigId = intval($data['month_config_id'] ?? 0);
            $date = clean($data['date'] ?? '');
            $amount = floatval($data['amount'] ?? 0);
            $source = clean($data['source'] ?? '');
            $categoryId = intval($data['category_id'] ?? null);
            $method = clean($data['receipt_method'] ?? 'Transferencia');
            $accountId = intval($data['account_id'] ?? null);
            $status = clean($data['status'] ?? 'recibido');
            $tag = clean($data['custom_tag'] ?? '');
            $desc = clean($data['description'] ?? '');

            if (empty($date) || $amount <= 0 || empty($source)) throw new Exception('Datos obligatorios faltantes.');

            $stmt = $pdo->prepare("INSERT INTO incomes (user_id, month_config_id, date, amount, source, category_id, receipt_method, account_id, description, status, custom_tag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$_SESSION['user_id'], $monthConfigId, $date, $amount, $source, $categoryId ?: null, $method, $accountId ?: null, $desc, $status, $tag]);

            if ($accountId && $status === 'recibido') {
                $stmtBal = $pdo->prepare("UPDATE accounts SET initial_balance = initial_balance + ? WHERE id = ?");
                $stmtBal->execute([$amount, $accountId]);
            }

            logActivity($pdo, $_SESSION['user_id'], 'CREATE_INCOME', "Ingreso registrado: {$source} ($${amount})");
            echo json_encode(['message' => 'Ingreso registrado con éxito.']);
            break;

        case 'update_income':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            $data = getJsonInput();
            $date = clean($data['date'] ?? '');
            $amount = floatval($data['amount'] ?? 0);
            $source = clean($data['source'] ?? '');
            $categoryId = intval($data['category_id'] ?? null);
            $method = clean($data['receipt_method'] ?? 'Transferencia');
            $accountId = intval($data['account_id'] ?? null);
            $status = clean($data['status'] ?? 'recibido');
            $tag = clean($data['custom_tag'] ?? '');
            $desc = clean($data['description'] ?? '');

            $stmtOld = $pdo->prepare("SELECT * FROM incomes WHERE id = ? AND user_id = ?");
            $stmtOld->execute([$id, $_SESSION['user_id']]);
            $old = $stmtOld->fetch();
            if (!$old) throw new Exception('Registro no encontrado.');

            // Deshacer balance anterior
            if ($old['account_id'] && $old['status'] === 'recibido') {
                $stmtBal = $pdo->prepare("UPDATE accounts SET initial_balance = initial_balance - ? WHERE id = ?");
                $stmtBal->execute([$old['amount'], $old['account_id']]);
            }

            $stmt = $pdo->prepare("UPDATE incomes SET date = ?, amount = ?, source = ?, category_id = ?, receipt_method = ?, account_id = ?, description = ?, status = ?, custom_tag = ? WHERE id = ? AND user_id = ?");
            $stmt->execute([$date, $amount, $source, $categoryId ?: null, $method, $accountId ?: null, $desc, $status, $tag, $id, $_SESSION['user_id']]);

            // Aplicar nuevo balance
            if ($accountId && $status === 'recibido') {
                $stmtBal = $pdo->prepare("UPDATE accounts SET initial_balance = initial_balance + ? WHERE id = ?");
                $stmtBal->execute([$amount, $accountId]);
            }

            logActivity($pdo, $_SESSION['user_id'], 'UPDATE_INCOME', "Ingreso actualizado: {$source} ($${amount})");
            echo json_encode(['message' => 'Ingreso actualizado con éxito.']);
            break;

        case 'delete_income':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);

            $stmtOld = $pdo->prepare("SELECT * FROM incomes WHERE id = ? AND user_id = ?");
            $stmtOld->execute([$id, $_SESSION['user_id']]);
            $old = $stmtOld->fetch();
            if (!$old) throw new Exception('Registro no encontrado.');

            if ($old['account_id'] && $old['status'] === 'recibido') {
                $stmtBal = $pdo->prepare("UPDATE accounts SET initial_balance = initial_balance - ? WHERE id = ?");
                $stmtBal->execute([$old['amount'], $old['account_id']]);
            }

            // Eliminar comprobante físico
            $stmtFile = $pdo->prepare("SELECT filename FROM receipts WHERE transaction_type = 'income' AND transaction_id = ?");
            $stmtFile->execute([$id]);
            $file = $stmtFile->fetch();
            if ($file) {
                @unlink(UPLOAD_DIR . $file['filename']);
                $stmtDelR = $pdo->prepare("DELETE FROM receipts WHERE transaction_type = 'income' AND transaction_id = ?");
                $stmtDelR->execute([$id]);
            }

            $stmt = $pdo->prepare("DELETE FROM incomes WHERE id = ? AND user_id = ?");
            $stmt->execute([$id, $_SESSION['user_id']]);

            logActivity($pdo, $_SESSION['user_id'], 'DELETE_INCOME', "Ingreso eliminado: {$old['source']}");
            echo json_encode(['message' => 'Ingreso eliminado con éxito.']);
            break;

        // ------------------------------------------
        // GASTOS (EXTREMADAMENTE COMPLETO)
        // ------------------------------------------
        case 'get_expenses':
            requireAuth();
            $monthConfigId = intval($_GET['monthConfigId'] ?? 0);
            if (!$monthConfigId) throw new Exception('ID de mes requerido.');

            $stmt = $pdo->prepare("
                SELECT e.*, c.name as category_name, c.color as category_color, s.name as subcategory_name, 
                       a.name as account_name, a.color as account_color, r.filename as receipt_file
                FROM expenses e
                LEFT JOIN categories c ON e.category_id = c.id
                LEFT JOIN subcategories s ON e.subcategory_id = s.id
                LEFT JOIN accounts a ON e.account_id = a.id
                LEFT JOIN receipts r ON r.transaction_type = 'expense' AND r.transaction_id = e.id
                WHERE e.user_id = ? AND e.month_config_id = ?
                ORDER BY e.date DESC, e.time DESC, e.id DESC
            ");
            $stmt->execute([$_SESSION['user_id'], $monthConfigId]);
            echo json_encode($stmt->fetchAll());
            break;

        case 'create_expense':
            requireAuth();
            $data = getJsonInput();
            $monthConfigId = intval($data['month_config_id'] ?? 0);
            $date = clean($data['date'] ?? '');
            $time = clean($data['time'] ?? '12:00');
            $amount = floatval($data['amount'] ?? 0);
            $title = clean($data['title'] ?? '');
            $categoryId = intval($data['category_id'] ?? null);
            $subId = intval($data['subcategory_id'] ?? null);
            $method = clean($data['payment_method'] ?? 'efectivo');
            $accountId = intval($data['account_id'] ?? null);
            $type = clean($data['expense_type'] ?? 'variable');
            $status = clean($data['status'] ?? 'pagado');
            $merchant = clean($data['merchant'] ?? '');
            $person = clean($data['related_person'] ?? '');
            $tag = clean($data['custom_tag'] ?? '');
            $deducible = !empty($data['is_deducible']) ? 1 : 0;
            $necessary = !empty($data['is_necessary']) ? 1 : 0;
            $planned = !empty($data['is_planned']) ? 1 : 0;
            $notes = clean($data['notes'] ?? '');
            $split_type = clean($data['split_type'] ?? 'simple');
            $split_details = !empty($data['split_details']) ? json_encode($data['split_details']) : null;

            if (empty($date) || $amount <= 0 || empty($title) || empty($method)) throw new Exception('Faltan campos requeridos.');

            $stmt = $pdo->prepare("
                INSERT INTO expenses (
                    user_id, month_config_id, date, time, amount, title, category_id, subcategory_id,
                    payment_method, account_id, expense_type, status, merchant, related_person, custom_tag,
                    is_deducible, is_necessary, is_planned, notes, split_type, split_details
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $_SESSION['user_id'], $monthConfigId, $date, $time, $amount, $title, $categoryId ?: null, $subId ?: null,
                $method, $accountId ?: null, $type, $status, $merchant, $person, $tag,
                $deducible, $necessary, $planned, $notes, $split_type, $split_details
            ]);

            $newId = $pdo->lastInsertId();

            if ($accountId && $status === 'pagado') {
                $stmtBal = $pdo->prepare("UPDATE accounts SET initial_balance = initial_balance - ? WHERE id = ?");
                $stmtBal->execute([$amount, $accountId]);
            }

            logActivity($pdo, $_SESSION['user_id'], 'CREATE_EXPENSE', "Gasto registrado: {$title} ($${amount})");
            echo json_encode(['id' => $newId, 'message' => 'Gasto registrado con éxito.']);
            break;

        case 'update_expense':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            $data = getJsonInput();
            $date = clean($data['date'] ?? '');
            $time = clean($data['time'] ?? '12:00');
            $amount = floatval($data['amount'] ?? 0);
            $title = clean($data['title'] ?? '');
            $categoryId = intval($data['category_id'] ?? null);
            $subId = intval($data['subcategory_id'] ?? null);
            $method = clean($data['payment_method'] ?? 'efectivo');
            $accountId = intval($data['account_id'] ?? null);
            $type = clean($data['expense_type'] ?? 'variable');
            $status = clean($data['status'] ?? 'pagado');
            $merchant = clean($data['merchant'] ?? '');
            $person = clean($data['related_person'] ?? '');
            $tag = clean($data['custom_tag'] ?? '');
            $deducible = !empty($data['is_deducible']) ? 1 : 0;
            $necessary = !empty($data['is_necessary']) ? 1 : 0;
            $planned = !empty($data['is_planned']) ? 1 : 0;
            $notes = clean($data['notes'] ?? '');
            $split_type = clean($data['split_type'] ?? 'simple');
            $split_details = !empty($data['split_details']) ? json_encode($data['split_details']) : null;

            $stmtOld = $pdo->prepare("SELECT * FROM expenses WHERE id = ? AND user_id = ?");
            $stmtOld->execute([$id, $_SESSION['user_id']]);
            $old = $stmtOld->fetch();
            if (!$old) throw new Exception('Gasto no encontrado.');

            if ($old['account_id'] && $old['status'] === 'pagado') {
                $stmtBal = $pdo->prepare("UPDATE accounts SET initial_balance = initial_balance + ? WHERE id = ?");
                $stmtBal->execute([$old['amount'], $old['account_id']]);
            }

            $stmt = $pdo->prepare("
                UPDATE expenses SET 
                    date = ?, time = ?, amount = ?, title = ?, category_id = ?, subcategory_id = ?,
                    payment_method = ?, account_id = ?, expense_type = ?, status = ?, merchant = ?, related_person = ?, custom_tag = ?,
                    is_deducible = ?, is_necessary = ?, is_planned = ?, notes = ?, split_type = ?, split_details = ?
                WHERE id = ? AND user_id = ?
            ");
            $stmt->execute([
                $date, $time, $amount, $title, $categoryId ?: null, $subId ?: null,
                $method, $accountId ?: null, $type, $status, $merchant, $person, $tag,
                $deducible, $necessary, $planned, $notes, $split_type, $split_details, $id, $_SESSION['user_id']
            ]);

            if ($accountId && $status === 'pagado') {
                $stmtBal = $pdo->prepare("UPDATE accounts SET initial_balance = initial_balance - ? WHERE id = ?");
                $stmtBal->execute([$amount, $accountId]);
            }

            logActivity($pdo, $_SESSION['user_id'], 'UPDATE_EXPENSE', "Gasto actualizado: {$title} ($${amount})");
            echo json_encode(['message' => 'Gasto actualizado con éxito.']);
            break;

        case 'delete_expense':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);

            $stmtOld = $pdo->prepare("SELECT * FROM expenses WHERE id = ? AND user_id = ?");
            $stmtOld->execute([$id, $_SESSION['user_id']]);
            $old = $stmtOld->fetch();
            if (!$old) throw new Exception('Gasto no encontrado.');

            if ($old['account_id'] && $old['status'] === 'pagado') {
                $stmtBal = $pdo->prepare("UPDATE accounts SET initial_balance = initial_balance + ? WHERE id = ?");
                $stmtBal->execute([$old['amount'], $old['account_id']]);
            }

            // Eliminar comprobante
            $stmtFile = $pdo->prepare("SELECT filename FROM receipts WHERE transaction_type = 'expense' AND transaction_id = ?");
            $stmtFile->execute([$id]);
            $file = $stmtFile->fetch();
            if ($file) {
                @unlink(UPLOAD_DIR . $file['filename']);
                $stmtDelR = $pdo->prepare("DELETE FROM receipts WHERE transaction_type = 'expense' AND transaction_id = ?");
                $stmtDelR->execute([$id]);
            }

            $stmt = $pdo->prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?");
            $stmt->execute([$id, $_SESSION['user_id']]);

            logActivity($pdo, $_SESSION['user_id'], 'DELETE_EXPENSE', "Gasto eliminado: {$old['title']}");
            echo json_encode(['message' => 'Gasto eliminado con éxito.']);
            break;

        // ------------------------------------------
        // COMPROBANTES DE TRANSACCIONES
        // ------------------------------------------
        case 'upload_receipt':
            requireAuth();
            $type = clean($_POST['transactionType'] ?? '');
            $transId = intval($_POST['transactionId'] ?? 0);

            if (empty($type) || !$transId || !isset($_FILES['file'])) throw new Exception('Faltan metadatos o archivo.');

            // Validar archivo
            $file = $_FILES['file'];
            if ($file['error'] !== UPLOAD_ERR_OK) throw new Exception('Error al transferir archivo al servidor.');
            if ($file['size'] > MAX_FILE_SIZE) throw new Exception('El archivo supera el límite de 5MB.');

            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, ['jpg', 'jpeg', 'png', 'pdf'])) throw new Exception('Tipo de archivo no permitido. Solo JPG, PNG o PDF.');

            // Crear carpeta si no existe
            if (!is_dir(UPLOAD_DIR)) {
                mkdir(UPLOAD_DIR, 0755, true);
            }

            // Borrar anterior
            $stmtOld = $pdo->prepare("SELECT id, filename FROM receipts WHERE user_id = ? AND transaction_type = ? AND transaction_id = ?");
            $stmtOld->execute([$_SESSION['user_id'], $type, $transId]);
            $oldFile = $stmtOld->fetch();
            if ($oldFile) {
                @unlink(UPLOAD_DIR . $oldFile['filename']);
                $stmtDel = $pdo->prepare("DELETE FROM receipts WHERE id = ?");
                $stmtDel->execute([$oldFile['id']]);
            }

            $newFilename = uniqid() . '.' . $ext;
            if (!move_uploaded_file($file['tmp_name'], UPLOAD_DIR . $newFilename)) {
                throw new Exception('Fallo al almacenar el archivo en disco.');
            }

            $stmt = $pdo->prepare("INSERT INTO receipts (user_id, transaction_type, transaction_id, filename, original_name, mime_type, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$_SESSION['user_id'], $type, $transId, $newFilename, clean($file['name']), $file['type'], $file['size']]);

            logActivity($pdo, $_SESSION['user_id'], 'UPLOAD_RECEIPT', "Comprobante cargado para {$type} ID {$transId}.");
            echo json_encode(['message' => 'Comprobante guardado correctamente.']);
            break;

        case 'delete_receipt':
            requireAuth();
            $data = getJsonInput();
            $type = clean($data['transactionType'] ?? '');
            $transId = intval($data['transactionId'] ?? 0);

            $stmt = $pdo->prepare("SELECT id, filename FROM receipts WHERE user_id = ? AND transaction_type = ? AND transaction_id = ?");
            $stmt->execute([$_SESSION['user_id'], $type, $transId]);
            $file = $stmt->fetch();

            if (!$file) throw new Exception('Comprobante no encontrado.');

            @unlink(UPLOAD_DIR . $file['filename']);
            $stmtDel = $pdo->prepare("DELETE FROM receipts WHERE id = ?");
            $stmtDel->execute([$file['id']]);

            logActivity($pdo, $_SESSION['user_id'], 'DELETE_RECEIPT', "Comprobante eliminado de {$type} ID {$transId}.");
            echo json_encode(['message' => 'Comprobante eliminado con éxito.']);
            break;

        // ------------------------------------------
        // METAS DE AHORRO
        // ------------------------------------------
        case 'get_savings':
            requireAuth();
            $stmt = $pdo->prepare("SELECT * FROM savings_goals WHERE user_id = ? ORDER BY target_date ASC");
            $stmt->execute([$_SESSION['user_id']]);
            echo json_encode($stmt->fetchAll());
            break;

        case 'create_saving':
            requireAuth();
            $data = getJsonInput();
            $name = clean($data['name'] ?? '');
            $target = floatval($data['target_amount'] ?? 0);
            $saved = floatval($data['saved_amount'] ?? 0);
            $date = clean($data['target_date'] ?? null);
            $priority = clean($data['priority'] ?? 'media');
            $desc = clean($data['description'] ?? '');

            if (empty($name) || $target <= 0) throw new Exception('Nombre y monto objetivo requeridos.');

            $stmt = $pdo->prepare("INSERT INTO savings_goals (user_id, name, target_amount, saved_amount, target_date, description, priority) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$_SESSION['user_id'], $name, $target, $saved, $date ?: null, $desc, $priority]);

            logActivity($pdo, $_SESSION['user_id'], 'CREATE_SAVING', "Meta creada: {$name}");
            echo json_encode(['message' => 'Meta de ahorro creada con éxito.']);
            break;

        case 'update_saving':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            $data = getJsonInput();
            $name = clean($data['name'] ?? '');
            $target = floatval($data['target_amount'] ?? 0);
            $saved = floatval($data['saved_amount'] ?? 0);
            $date = clean($data['target_date'] ?? null);
            $priority = clean($data['priority'] ?? 'media');
            $status = clean($data['status'] ?? 'en_progreso');
            $desc = clean($data['description'] ?? '');

            $stmt = $pdo->prepare("UPDATE savings_goals SET name = ?, target_amount = ?, saved_amount = ?, target_date = ?, description = ?, priority = ?, status = ? WHERE id = ? AND user_id = ?");
            $stmt->execute([$name, $target, $saved, $date ?: null, $desc, $priority, $status, $id, $_SESSION['user_id']]);

            logActivity($pdo, $_SESSION['user_id'], 'UPDATE_SAVING', "Meta actualizada: {$name}");
            echo json_encode(['message' => 'Meta de ahorro actualizada con éxito.']);
            break;

        case 'delete_saving':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            $stmt = $pdo->prepare("DELETE FROM savings_goals WHERE id = ? AND user_id = ?");
            $stmt->execute([$id, $_SESSION['user_id']]);
            echo json_encode(['message' => 'Meta eliminada.']);
            break;

        // ------------------------------------------
        // DEUDAS Y PAGOS
        // ------------------------------------------
        case 'get_debts':
            requireAuth();
            $stmt = $pdo->prepare("SELECT * FROM debts WHERE user_id = ? ORDER BY status DESC, due_date ASC");
            $stmt->execute([$_SESSION['user_id']]);
            echo json_encode($stmt->fetchAll());
            break;

        case 'create_debt':
            requireAuth();
            $data = getJsonInput();
            $name = clean($data['name'] ?? '');
            $lender = clean($data['lender'] ?? '');
            $total = floatval($data['total_amount'] ?? 0);
            $paid = floatval($data['paid_amount'] ?? 0);
            $start = clean($data['start_date'] ?? '');
            $due = clean($data['due_date'] ?? null);
            $installments = intval($data['installments_total'] ?? 1);
            $installments_paid = intval($data['installments_paid'] ?? 0);
            $installment_val = floatval($data['installment_value'] ?? null);
            $notes = clean($data['notes'] ?? '');

            if (empty($name) || empty($lender) || $total <= 0 || empty($start)) throw new Exception('Datos obligatorios faltantes.');

            $stmt = $pdo->prepare("INSERT INTO debts (user_id, name, lender, total_amount, paid_amount, start_date, due_date, installments_total, installments_paid, installment_value, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$_SESSION['user_id'], $name, $lender, $total, $paid, $start, $due ?: null, $installments, $installments_paid, $installment_val ?: null, $notes]);

            logActivity($pdo, $_SESSION['user_id'], 'CREATE_DEBT', "Deuda registrada: {$name}");
            echo json_encode(['message' => 'Deuda registrada con éxito.']);
            break;

        case 'update_debt':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            $data = getJsonInput();
            $name = clean($data['name'] ?? '');
            $lender = clean($data['lender'] ?? '');
            $total = floatval($data['total_amount'] ?? 0);
            $paid = floatval($data['paid_amount'] ?? 0);
            $start = clean($data['start_date'] ?? '');
            $due = clean($data['due_date'] ?? null);
            $installments = intval($data['installments_total'] ?? 1);
            $installments_paid = intval($data['installments_paid'] ?? 0);
            $installment_val = floatval($data['installment_value'] ?? null);
            $status = clean($data['status'] ?? 'pendiente');
            $notes = clean($data['notes'] ?? '');

            $stmt = $pdo->prepare("UPDATE debts SET name = ?, lender = ?, total_amount = ?, paid_amount = ?, start_date = ?, due_date = ?, installments_total = ?, installments_paid = ?, installment_value = ?, status = ?, notes = ? WHERE id = ? AND user_id = ?");
            $stmt->execute([$name, $lender, $total, $paid, $start, $due ?: null, $installments, $installments_paid, $installment_val ?: null, $status, $notes, $id, $_SESSION['user_id']]);

            echo json_encode(['message' => 'Deuda actualizada.']);
            break;

        case 'pay_debt':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            $data = getJsonInput();
            $amount = floatval($data['amount'] ?? 0);
            $method = clean($data['paymentMethod'] ?? 'efectivo');
            $accountId = intval($data['accountId'] ?? null);
            $date = clean($data['date'] ?? '');
            $monthConfigId = intval($data['monthConfigId'] ?? 0);

            if ($amount <= 0 || !$monthConfigId || empty($date)) throw new Exception('Datos de pago inválidos.');

            $stmtOld = $pdo->prepare("SELECT * FROM debts WHERE id = ? AND user_id = ?");
            $stmtOld->execute([$id, $_SESSION['user_id']]);
            $debt = $stmtOld->fetch();
            if (!$debt) throw new Exception('Deuda no encontrada.');

            $newPaid = $debt['paid_amount'] + $amount;
            $newInstallmentsPaid = $debt['installments_paid'] + 1;
            $newStatus = $newPaid >= $debt['total_amount'] ? 'pagado' : $debt['status'];

            $stmtUpdate = $pdo->prepare("UPDATE debts SET paid_amount = ?, installments_paid = ?, status = ? WHERE id = ?");
            $stmtUpdate->execute([$newPaid, $newInstallmentsPaid, $newStatus, $id]);

            // Insertar como Gasto del mes
            $stmtGasto = $pdo->prepare("INSERT INTO expenses (user_id, month_config_id, date, time, amount, title, payment_method, account_id, expense_type, status, merchant, notes) VALUES (?, ?, ?, '12:00', ?, ?, ?, ?, 'deuda', 'pagado', ?, ?)");
            $stmtGasto->execute([$_SESSION['user_id'], $monthConfigId, $date, $amount, "Pago Deuda: {$debt['name']}", $method, $accountId ?: null, $debt['lender'], 'Abono registrado a la cuenta del acreedor']);

            if ($accountId) {
                $stmtBal = $pdo->prepare("UPDATE accounts SET initial_balance = initial_balance - ? WHERE id = ?");
                $stmtBal->execute([$amount, $accountId]);
            }

            logActivity($pdo, $_SESSION['user_id'], 'PAY_DEBT', "Abono a deuda {$debt['name']}: $${amount}");
            echo json_encode(['message' => 'Abono registrado con éxito y reflejado en gastos mensuales.']);
            break;

        case 'delete_debt':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            $stmt = $pdo->prepare("DELETE FROM debts WHERE id = ? AND user_id = ?");
            $stmt->execute([$id, $_SESSION['user_id']]);
            echo json_encode(['message' => 'Deuda eliminada.']);
            break;

        // ------------------------------------------
        // GASTOS RECURRENTES
        // ------------------------------------------
        case 'get_recurring':
            requireAuth();
            $stmt = $pdo->prepare("
                SELECT r.*, c.name as category_name, a.name as account_name
                FROM recurring_templates r
                LEFT JOIN categories c ON r.category_id = c.id
                LEFT JOIN accounts a ON r.account_id = a.id
                WHERE r.user_id = ?
            ");
            $stmt->execute([$_SESSION['user_id']]);
            echo json_encode($stmt->fetchAll());
            break;

        case 'create_recurring':
            requireAuth();
            $data = getJsonInput();
            $name = clean($data['name'] ?? '');
            $amount = floatval($data['amount'] ?? 0);
            $catId = intval($data['category_id'] ?? null);
            $method = clean($data['payment_method'] ?? 'tarjeta_credito');
            $accountId = intval($data['account_id'] ?? null);
            $frequency = clean($data['frequency'] ?? 'mensual');
            $next = clean($data['next_due_date'] ?? '');
            $notes = clean($data['notes'] ?? '');

            if (empty($name) || $amount <= 0 || empty($next)) throw new Exception('Datos obligatorios faltantes.');

            $stmt = $pdo->prepare("INSERT INTO recurring_templates (user_id, name, amount, category_id, payment_method, account_id, frequency, next_due_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$_SESSION['user_id'], $name, $amount, $catId ?: null, $method, $accountId ?: null, $frequency, $next, $notes]);

            echo json_encode(['message' => 'Gasto recurrente programado con éxito.']);
            break;

        case 'update_recurring':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            $data = getJsonInput();
            $name = clean($data['name'] ?? '');
            $amount = floatval($data['amount'] ?? 0);
            $catId = intval($data['category_id'] ?? null);
            $method = clean($data['payment_method'] ?? 'tarjeta_credito');
            $accountId = intval($data['account_id'] ?? null);
            $frequency = clean($data['frequency'] ?? 'mensual');
            $next = clean($data['next_due_date'] ?? '');
            $status = clean($data['status'] ?? 'activo');
            $notes = clean($data['notes'] ?? '');

            $stmt = $pdo->prepare("UPDATE recurring_templates SET name = ?, amount = ?, category_id = ?, payment_method = ?, account_id = ?, frequency = ?, next_due_date = ?, status = ?, notes = ? WHERE id = ? AND user_id = ?");
            $stmt->execute([$name, $amount, $catId ?: null, $method, $accountId ?: null, $frequency, $next, $status, $notes, $id, $_SESSION['user_id']]);

            echo json_encode(['message' => 'Gasto recurrente actualizado.']);
            break;

        case 'delete_recurring':
            requireAuth();
            $id = intval($_GET['id'] ?? 0);
            $stmt = $pdo->prepare("DELETE FROM recurring_templates WHERE id = ? AND user_id = ?");
            $stmt->execute([$id, $_SESSION['user_id']]);
            echo json_encode(['message' => 'Gasto recurrente eliminado.']);
            break;

        // ------------------------------------------
        // ACTIVIDAD, REPORTES Y COMPARATIVA
        // ------------------------------------------
        case 'get_activity':
            requireAuth();
            $stmt = $pdo->prepare("SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50");
            $stmt->execute([$_SESSION['user_id']]);
            echo json_encode($stmt->fetchAll());
            break;

        case 'compare_months':
            requireAuth();
            $m1 = intval($_GET['month1Id'] ?? 0);
            $m2 = intval($_GET['month2Id'] ?? 0);

            if (!$m1 || !$m2) throw new Exception('IDs de meses requeridos.');

            // Mes 1
            $stmtMeta = $pdo->prepare("SELECT * FROM monthly_configs WHERE id = ? AND user_id = ?");
            $stmtMeta->execute([$m1, $_SESSION['user_id']]);
            $meta1 = $stmtMeta->fetch();

            $stmtInc = $pdo->prepare("SELECT SUM(amount) as total FROM incomes WHERE month_config_id = ? AND status='recibido'");
            $stmtInc->execute([$m1]);
            $inc1 = $stmtInc->fetch()['total'] ?? 0;

            $stmtExp = $pdo->prepare("SELECT SUM(amount) as total FROM expenses WHERE month_config_id = ? AND status='pagado'");
            $stmtExp->execute([$m1]);
            $exp1 = $stmtExp->fetch()['total'] ?? 0;

            // Mes 2
            $stmtMeta->execute([$m2, $_SESSION['user_id']]);
            $meta2 = $stmtMeta->fetch();

            $stmtInc->execute([$m2]);
            $inc2 = $stmtInc->fetch()['total'] ?? 0;

            $stmtExp->execute([$m2]);
            $exp2 = $stmtExp->fetch()['total'] ?? 0;

            if (!$meta1 || !$meta2) throw new Exception('Uno o ambos periodos no existen.');

            echo json_encode([
                'month1' => [
                    'meta' => $meta1,
                    'incomes' => floatval($inc1),
                    'expenses' => floatval($exp1),
                    'balance' => $meta1['initial_balance'] + $inc1 - $exp1
                ],
                'month2' => [
                    'meta' => $meta2,
                    'incomes' => floatval($inc2),
                    'expenses' => floatval($exp2),
                    'balance' => $meta2['initial_balance'] + $inc2 - $exp2
                ]
            ]);
            break;

        case 'export_backup':
            requireAuth();
            // Exportar base de datos como JSON
            $tables = ['monthly_configs', 'accounts', 'categories', 'incomes', 'expenses', 'debts', 'savings_goals', 'recurring_templates', 'audit_logs'];
            $data = [];

            // Añadir info de usuario
            $stmtUsr = $pdo->prepare("SELECT id, name, email, created_at FROM users WHERE id = ?");
            $stmtUsr->execute([$_SESSION['user_id']]);
            $data['user'] = $stmtUsr->fetch();

            foreach ($tables as $t) {
                $stmt = $pdo->prepare("SELECT * FROM `{$t}` WHERE user_id = ?");
                $stmt->execute([$_SESSION['user_id']]);
                $data[$t] = $stmt->fetchAll();
            }

            header('Content-disposition: attachment; filename=respaldo_finanzas.json');
            header('Content-type: application/json');
            echo json_encode($data, JSON_PRETTY_PRINT);
            break;

        case 'import_backup':
            requireAuth();
            $monthConfigId = intval($_POST['monthConfigId'] ?? 0);
            if (!$monthConfigId || !isset($_FILES['file'])) throw new Exception('Mes destino o archivo CSV no provistos.');

            $file = $_FILES['file'];
            if ($file['error'] !== UPLOAD_ERR_OK) throw new Exception('Error de transferencia.');
            
            $content = file_get_contents($file['tmp_name']);
            $lines = explode("\n", $content);
            $importedExpenses = 0;
            $importedIncomes = 0;

            $stmtInsExp = $pdo->prepare("INSERT INTO expenses (user_id, month_config_id, date, time, amount, title, category_id, payment_method, status, notes) VALUES (?, ?, ?, '12:00', ?, ?, ?, ?, 'pagado', ?)");
            $stmtInsInc = $pdo->prepare("INSERT INTO incomes (user_id, month_config_id, date, amount, source, category_id, receipt_method, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, 'recibido', ?)");
            $stmtFindCat = $pdo->prepare("SELECT id FROM categories WHERE name = ? AND user_id = ?");

            for ($i = 1; $i < count($lines); $i++) {
                $line = trim($lines[$i]);
                if (empty($line)) continue;

                // Soporte a comillas en CSV
                $cols = str_getcsv($line);
                if (count($cols) < 4) continue;

                $type = clean($cols[0]);
                $date = clean($cols[1]);
                $amount = floatval($cols[2]);
                $title = clean($cols[3]);
                $categoryName = clean($cols[4] ?? '');
                $method = clean($cols[5] ?? '');
                $notes = clean($cols[6] ?? 'Importado de CSV');

                if ($amount <= 0 || empty($date) || empty($title)) continue;

                // Buscar ID de categoría
                $stmtFindCat->execute([$categoryName, $_SESSION['user_id']]);
                $cat = $stmtFindCat->fetch();
                $catId = $cat ? $cat['id'] : null;

                if ($type === 'expense') {
                    $stmtInsExp->execute([$_SESSION['user_id'], $monthConfigId, $date, $amount, $title, $catId, $method ?: 'efectivo', $notes]);
                    $importedExpenses++;
                } else if ($type === 'income') {
                    $stmtInsInc->execute([$_SESSION['user_id'], $monthConfigId, $date, $amount, $title, $catId, $method ?: 'transferencia', $notes]);
                    $importedIncomes++;
                }
            }

            logActivity($pdo, $_SESSION['user_id'], 'IMPORT_CSV', "Importación CSV: {$importedExpenses} gastos y {$importedIncomes} ingresos.");
            echo json_encode(['message' => "Importación completada. Se importaron {$importedExpenses} gastos y {$importedIncomes} ingresos con éxito."]);
            break;

        default:
            throw new Exception('Acción API no reconocida.', 404);
    }
} catch (Exception $e) {
    $code = $e->getCode();
    if ($code < 400 || $code > 599) $code = 400;
    http_response_code($code);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
