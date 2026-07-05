const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { dbQuery, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Crear directorios de subida si no existen
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuración de Seguridad
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"]
    }
  }
}));

// Rate Limiting para Autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // límite de 20 intentos de login/registro
  message: { error: 'Demasiados intentos desde esta IP, por favor intente de nuevo en 15 minutos.' }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar Sesiones
app.use(session({
  secret: 'seguridad-finanzas-token-secreto-super-123',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // false para desarrollo local en http://localhost
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 1 día
  }
}));

// Middleware de Autenticación y Rutas Privadas
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(410).json({ error: 'Sesión no activa o expirada. Por favor inicie sesión.' });
  }
  next();
}

// Middleware de Logs de Actividad
async function logActivity(userId, action, details, req) {
  const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : '127.0.0.1';
  try {
    await dbQuery.run(
      'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [userId, action, details, ip]
    );
  } catch (err) {
    console.error('Error escribiendo log de auditoría:', err);
  }
}

// Configuración de Multer para Comprobantes
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Máximo 5MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Solo se permiten archivos de imagen (JPG, PNG) y documentos PDF.'));
  }
});

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));


// ==========================================
// RUTAS DE AUTENTICACIÓN
// ==========================================

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Por favor complete todos los campos.' });
  }
  
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const existing = await dbQuery.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Este correo electrónico ya está registrado.' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await dbQuery.run(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, password_hash]
    );

    await logActivity(result.id, 'REGISTER', 'Usuario registrado con éxito.', req);
    res.json({ message: 'Usuario registrado con éxito. Ahora puede iniciar sesión.' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno en el servidor.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos.' });
  }

  try {
    const user = await dbQuery.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ error: 'Credenciales inválidas.' });
    }

    // Verificar si la cuenta está bloqueada temporalmente
    if (user.lock_until) {
      const lockUntilDate = new Date(user.lock_until);
      if (lockUntilDate > new Date()) {
        const minutesLeft = Math.ceil((lockUntilDate - new Date()) / 1000 / 60);
        return res.status(403).json({ error: `Cuenta bloqueada temporalmente. Intente de nuevo en ${minutesLeft} minutos.` });
      }
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      // Incrementar intentos fallidos
      const newAttempts = user.failed_login_attempts + 1;
      let lockUntil = null;
      let errorMsg = 'Credenciales inválidas.';

      if (newAttempts >= 5) {
        const blockTime = new Date();
        blockTime.setMinutes(blockTime.getMinutes() + 15); // Bloquear por 15 minutos
        lockUntil = blockTime.toISOString();
        errorMsg = 'Demasiados intentos fallidos. Su cuenta ha sido bloqueada por 15 minutos.';
        await dbQuery.run(
          'UPDATE users SET failed_login_attempts = ?, lock_until = ? WHERE id = ?',
          [newAttempts, lockUntil, user.id]
        );
      } else {
        await dbQuery.run(
          'UPDATE users SET failed_login_attempts = ? WHERE id = ?',
          [newAttempts, user.id]
        );
      }
      
      await logActivity(user.id, 'LOGIN_FAILED', `Intento fallido de login. Intento #${newAttempts}`, req);
      return res.status(400).json({ error: errorMsg });
    }

    // Resetear intentos fallidos y actualizar último login
    const now = new Date().toISOString();
    await dbQuery.run(
      'UPDATE users SET failed_login_attempts = 0, lock_until = NULL, last_login = ? WHERE id = ?',
      [now, user.id]
    );

    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;

    await logActivity(user.id, 'LOGIN_SUCCESS', 'Inicio de sesión exitoso.', req);

    res.json({
      message: 'Inicio de sesión exitoso.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        lastLogin: user.last_login,
        hasPin: !!user.security_pin
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno en el servidor.' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await logActivity(req.session.userId, 'LOGOUT', 'Cierre de sesión del usuario.', req);
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Error al cerrar sesión.' });
    }
    res.json({ message: 'Sesión cerrada correctamente.' });
  });
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  try {
    const user = await dbQuery.get('SELECT name, email, last_login, security_pin FROM users WHERE id = ?', [req.session.userId]);
    res.json({
      user: {
        id: req.session.userId,
        name: user.name,
        email: user.email,
        lastLogin: user.last_login,
        hasPin: !!user.security_pin
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error de base de datos.' });
  }
});

// Cambiar contraseña
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const user = await dbQuery.get('SELECT password_hash FROM users WHERE id = ?', [req.session.userId]);
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'La contraseña actual es incorrecta.' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await dbQuery.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.session.userId]);
    await logActivity(req.session.userId, 'PASSWORD_CHANGE', 'El usuario cambió su contraseña.', req);
    res.json({ message: 'Contraseña cambiada con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar contraseña.' });
  }
});

// Recuperar contraseña (simulado - actualiza sin código si coincide usuario/correo)
app.post('/api/auth/recover-password', authLimiter, async (req, res) => {
  const { email, pin, newPassword } = req.body;
  if (!email || !pin || !newPassword) {
    return res.status(400).json({ error: 'Email, PIN de seguridad y nueva contraseña son obligatorios.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const user = await dbQuery.get('SELECT id, security_pin FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ error: 'Correo electrónico no encontrado.' });
    }
    if (!user.security_pin || user.security_pin !== pin) {
      return res.status(400).json({ error: 'El PIN de seguridad ingresado es incorrecto o no está configurado.' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);
    await dbQuery.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
    await logActivity(user.id, 'PASSWORD_RECOVER', 'Contraseña recuperada exitosamente mediante PIN.', req);
    res.json({ message: 'Contraseña restablecida con éxito. Ya puede iniciar sesión.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al recuperar contraseña.' });
  }
});

// Verificar PIN de seguridad (para ver datos financieros sensibles)
app.post('/api/auth/verify-pin', requireAuth, async (req, res) => {
  const { pin } = req.body;
  try {
    const user = await dbQuery.get('SELECT security_pin FROM users WHERE id = ?', [req.session.userId]);
    if (!user.security_pin) {
      return res.json({ success: true, message: 'No hay PIN configurado.' });
    }
    if (user.security_pin === pin) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'PIN incorrecto.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error al verificar PIN.' });
  }
});

// Configurar o cambiar PIN
app.post('/api/auth/change-pin', requireAuth, async (req, res) => {
  const { pin } = req.body;
  if (pin && (pin.length !== 4 || isNaN(pin))) {
    return res.status(400).json({ error: 'El PIN debe ser un código numérico de 4 dígitos.' });
  }

  try {
    await dbQuery.run('UPDATE users SET security_pin = ? WHERE id = ?', [pin || null, req.session.userId]);
    await logActivity(req.session.userId, 'PIN_CHANGE', pin ? 'PIN de seguridad configurado/cambiado.' : 'PIN de seguridad eliminado.', req);
    res.json({ message: pin ? 'PIN configurado con éxito.' : 'PIN de seguridad desactivado.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar PIN.' });
  }
});


// ==========================================
// CONFIGURACIÓN DE MESES FINANCIEROS
// ==========================================

app.get('/api/months', requireAuth, async (req, res) => {
  try {
    const rows = await dbQuery.all(
      'SELECT * FROM monthly_configs WHERE user_id = ? ORDER BY year DESC, month DESC',
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener meses.' });
  }
});

app.post('/api/months', requireAuth, async (req, res) => {
  const { month, year, initial_budget, initial_balance, saving_goal, currency, notes, cycle_start_day, cycle_end_day } = req.body;
  if (!month || !year) {
    return res.status(400).json({ error: 'Mes y año son requeridos.' });
  }

  try {
    const existing = await dbQuery.get(
      'SELECT id FROM monthly_configs WHERE user_id = ? AND month = ? AND year = ?',
      [req.session.userId, month, year]
    );
    if (existing) {
      return res.status(400).json({ error: 'El mes financiero indicado ya existe.' });
    }

    const result = await dbQuery.run(
      `INSERT INTO monthly_configs (user_id, month, year, initial_budget, initial_balance, saving_goal, currency, notes, cycle_start_day, cycle_end_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.session.userId, month, year, initial_budget || 0, initial_balance || 0, saving_goal || 0, currency || '$', notes || '', cycle_start_day || 1, cycle_end_day || 28]
    );

    await logActivity(req.session.userId, 'CREATE_MONTH', `Mes creado: ${month}/${year}`, req);
    res.json({ id: result.id, message: 'Mes financiero configurado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear mes financiero.' });
  }
});

app.put('/api/months/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { initial_budget, initial_balance, saving_goal, currency, notes, cycle_start_day, cycle_end_day } = req.body;

  try {
    const month = await dbQuery.get('SELECT id, is_closed FROM monthly_configs WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    if (!month) {
      return res.status(404).json({ error: 'Mes financiero no encontrado.' });
    }
    if (month.is_closed) {
      return res.status(400).json({ error: 'El mes está cerrado. No se puede editar la configuración.' });
    }

    await dbQuery.run(
      `UPDATE monthly_configs 
       SET initial_budget = ?, initial_balance = ?, saving_goal = ?, currency = ?, notes = ?, cycle_start_day = ?, cycle_end_day = ?
       WHERE id = ? AND user_id = ?`,
      [initial_budget, initial_balance, saving_goal, currency, notes, cycle_start_day, cycle_end_day, id, req.session.userId]
    );

    await logActivity(req.session.userId, 'UPDATE_MONTH', `Configuración de mes ID ${id} actualizada.`, req);
    res.json({ message: 'Configuración actualizada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar mes.' });
  }
});


// ==========================================
// CUENTAS Y TARJETAS
// ==========================================

app.get('/api/accounts', requireAuth, async (req, res) => {
  try {
    const rows = await dbQuery.all('SELECT * FROM accounts WHERE user_id = ? ORDER BY status ASC, name ASC', [req.session.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener cuentas.' });
  }
});

app.post('/api/accounts', requireAuth, async (req, res) => {
  const { name, bank, type, last_four, color, initial_balance, credit_limit, cut_off_day, due_day, notes } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: 'Nombre y tipo son obligatorios.' });
  }

  try {
    const result = await dbQuery.run(
      `INSERT INTO accounts (user_id, name, bank, type, last_four, color, initial_balance, credit_limit, cut_off_day, due_day, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activa', ?)`,
      [req.session.userId, name, bank, type, last_four, color || '#4F46E5', initial_balance || 0, credit_limit || 0, cut_off_day || null, due_day || null, notes]
    );
    await logActivity(req.session.userId, 'CREATE_ACCOUNT', `Cuenta creada: ${name}`, req);
    res.json({ id: result.id, message: 'Cuenta/tarjeta creada con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear cuenta.' });
  }
});

app.put('/api/accounts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, bank, type, last_four, color, initial_balance, credit_limit, cut_off_day, due_day, status, notes } = req.body;

  try {
    const existing = await dbQuery.get('SELECT id FROM accounts WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada.' });

    await dbQuery.run(
      `UPDATE accounts 
       SET name = ?, bank = ?, type = ?, last_four = ?, color = ?, initial_balance = ?, credit_limit = ?, cut_off_day = ?, due_day = ?, status = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
      [name, bank, type, last_four, color, initial_balance, credit_limit, cut_off_day, due_day, status, notes, id, req.session.userId]
    );

    await logActivity(req.session.userId, 'UPDATE_ACCOUNT', `Cuenta actualizada: ${name}`, req);
    res.json({ message: 'Cuenta/tarjeta actualizada con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar cuenta.' });
  }
});

app.delete('/api/accounts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await dbQuery.get('SELECT id, name FROM accounts WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada.' });

    // En lugar de borrar físicamente y perder históricos, archivar opcionalmente o borrar en cascada
    await dbQuery.run('DELETE FROM accounts WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    await logActivity(req.session.userId, 'DELETE_ACCOUNT', `Cuenta eliminada: ${existing.name}`, req);
    res.json({ message: 'Cuenta/tarjeta eliminada con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'No se puede eliminar la cuenta porque tiene transacciones asociadas.' });
  }
});


// ==========================================
// CATEGORÍAS Y SUBCATEGORÍAS
// ==========================================

app.get('/api/categories', requireAuth, async (req, res) => {
  try {
    const categories = await dbQuery.all('SELECT * FROM categories WHERE user_id = ? ORDER BY name ASC', [req.session.userId]);
    
    // Obtener subcategorías asociadas a cada una
    for (let cat of categories) {
      cat.subcategories = await dbQuery.all('SELECT * FROM subcategories WHERE category_id = ? ORDER BY name ASC', [cat.id]);
    }
    
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener categorías.' });
  }
});

app.post('/api/categories', requireAuth, async (req, res) => {
  const { name, icon, color, budget, description, subcategories } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });

  try {
    const result = await dbQuery.run(
      'INSERT INTO categories (user_id, name, icon, color, budget, description) VALUES (?, ?, ?, ?, ?, ?)',
      [req.session.userId, name, icon || 'tag', color || '#10B981', budget || 0, description]
    );
    const categoryId = result.id;

    // Crear subcategorías asociadas
    if (subcategories && Array.isArray(subcategories)) {
      for (let subName of subcategories) {
        if (subName.trim()) {
          await dbQuery.run('INSERT INTO subcategories (category_id, name) VALUES (?, ?)', [categoryId, subName.trim()]);
        }
      }
    }

    await logActivity(req.session.userId, 'CREATE_CATEGORY', `Categoría creada: ${name}`, req);
    res.json({ id: categoryId, message: 'Categoría y subcategorías creadas con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear categoría.' });
  }
});

app.put('/api/categories/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, icon, color, budget, status, description, subcategories } = req.body;

  try {
    const existing = await dbQuery.get('SELECT id FROM categories WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada.' });

    await dbQuery.run(
      'UPDATE categories SET name = ?, icon = ?, color = ?, budget = ?, status = ?, description = ? WHERE id = ? AND user_id = ?',
      [name, icon, color, budget, status, description, id, req.session.userId]
    );

    // Actualizar subcategorías: Borrar antiguas e insertar nuevas para simplificar
    await dbQuery.run('DELETE FROM subcategories WHERE category_id = ?', [id]);
    if (subcategories && Array.isArray(subcategories)) {
      for (let subName of subcategories) {
        if (subName.trim()) {
          await dbQuery.run('INSERT INTO subcategories (category_id, name) VALUES (?, ?)', [id, subName.trim()]);
        }
      }
    }

    await logActivity(req.session.userId, 'UPDATE_CATEGORY', `Categoría actualizada: ${name}`, req);
    res.json({ message: 'Categoría actualizada con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar categoría.' });
  }
});

app.delete('/api/categories/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await dbQuery.get('SELECT id, name FROM categories WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada.' });

    await dbQuery.run('DELETE FROM categories WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    await logActivity(req.session.userId, 'DELETE_CATEGORY', `Categoría eliminada: ${existing.name}`, req);
    res.json({ message: 'Categoría eliminada con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'No se puede eliminar porque existen transacciones en esta categoría.' });
  }
});


// ==========================================
// INGRESOS
// ==========================================

app.get('/api/incomes', requireAuth, async (req, res) => {
  const { monthConfigId } = req.query;
  if (!monthConfigId) return res.status(400).json({ error: 'ID de mes financiero requerido.' });

  try {
    const rows = await dbQuery.all(
      `SELECT i.*, c.name as category_name, a.name as account_name, a.color as account_color, r.filename as receipt_file
       FROM incomes i
       LEFT JOIN categories c ON i.category_id = c.id
       LEFT JOIN accounts a ON i.account_id = a.id
       LEFT JOIN receipts r ON r.transaction_type = 'income' AND r.transaction_id = i.id
       WHERE i.user_id = ? AND i.month_config_id = ?
       ORDER BY i.date DESC, i.id DESC`,
      [req.session.userId, monthConfigId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener ingresos.' });
  }
});

app.post('/api/incomes', requireAuth, async (req, res) => {
  const { month_config_id, date, amount, source, category_id, receipt_method, account_id, description, status, custom_tag, notes } = req.body;
  if (!month_config_id || !date || !amount || !source) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }

  try {
    const month = await dbQuery.get('SELECT is_closed FROM monthly_configs WHERE id = ? AND user_id = ?', [month_config_id, req.session.userId]);
    if (!month) return res.status(404).json({ error: 'Mes financiero no válido.' });
    if (month.is_closed) return res.status(400).json({ error: 'El mes financiero está cerrado.' });

    const result = await dbQuery.run(
      `INSERT INTO incomes (user_id, month_config_id, date, amount, source, category_id, receipt_method, account_id, description, status, custom_tag, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.session.userId, month_config_id, date, amount, source, category_id || null, receipt_method, account_id || null, description, status || 'recibido', custom_tag, notes]
    );

    // Si tiene cuenta asociada, sumar al balance
    if (account_id && status === 'recibido') {
      await dbQuery.run('UPDATE accounts SET initial_balance = initial_balance + ? WHERE id = ?', [amount, account_id]);
    }

    await logActivity(req.session.userId, 'CREATE_INCOME', `Ingreso registrado: ${source} ($${amount})`, req);
    res.json({ id: result.id, message: 'Ingreso registrado con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar ingreso.' });
  }
});

app.put('/api/incomes/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { date, amount, source, category_id, receipt_method, account_id, description, status, custom_tag, notes } = req.body;

  try {
    const oldInc = await dbQuery.get('SELECT * FROM incomes WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    if (!oldInc) return res.status(404).json({ error: 'Ingreso no encontrado.' });

    const month = await dbQuery.get('SELECT is_closed FROM monthly_configs WHERE id = ?', [oldInc.month_config_id]);
    if (month.is_closed) return res.status(400).json({ error: 'El mes financiero está cerrado.' });

    // Deshacer impacto en balance anterior
    if (oldInc.account_id && oldInc.status === 'recibido') {
      await dbQuery.run('UPDATE accounts SET initial_balance = initial_balance - ? WHERE id = ?', [oldInc.amount, oldInc.account_id]);
    }

    await dbQuery.run(
      `UPDATE incomes 
       SET date = ?, amount = ?, source = ?, category_id = ?, receipt_method = ?, account_id = ?, description = ?, status = ?, custom_tag = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
      [date, amount, source, category_id || null, receipt_method, account_id || null, description, status, custom_tag, notes, id, req.session.userId]
    );

    // Aplicar nuevo impacto en balance
    if (account_id && status === 'recibido') {
      await dbQuery.run('UPDATE accounts SET initial_balance = initial_balance + ? WHERE id = ?', [amount, account_id]);
    }

    await logActivity(req.session.userId, 'UPDATE_INCOME', `Ingreso actualizado: ${source} ($${amount})`, req);
    res.json({ message: 'Ingreso actualizado con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar ingreso.' });
  }
});

app.delete('/api/incomes/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const oldInc = await dbQuery.get('SELECT * FROM incomes WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    if (!oldInc) return res.status(404).json({ error: 'Ingreso no encontrado.' });

    const month = await dbQuery.get('SELECT is_closed FROM monthly_configs WHERE id = ?', [oldInc.month_config_id]);
    if (month.is_closed) return res.status(400).json({ error: 'El mes financiero está cerrado.' });

    // Deshacer balance
    if (oldInc.account_id && oldInc.status === 'recibido') {
      await dbQuery.run('UPDATE accounts SET initial_balance = initial_balance - ? WHERE id = ?', [oldInc.amount, oldInc.account_id]);
    }

    // Borrar archivos de comprobantes si los hay
    const file = await dbQuery.get("SELECT filename FROM receipts WHERE transaction_type = 'income' AND transaction_id = ?", [id]);
    if (file) {
      const filePath = path.join(uploadsDir, file.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await dbQuery.run("DELETE FROM receipts WHERE transaction_type = 'income' AND transaction_id = ?", [id]);
    }

    await dbQuery.run('DELETE FROM incomes WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    await logActivity(req.session.userId, 'DELETE_INCOME', `Ingreso eliminado: ${oldInc.source}`, req);
    res.json({ message: 'Ingreso eliminado con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar ingreso.' });
  }
});


// ==========================================
// GASTOS (CRUD EXTREMADAMENTE COMPLETO)
// ==========================================

app.get('/api/expenses', requireAuth, async (req, res) => {
  const { monthConfigId } = req.query;
  if (!monthConfigId) return res.status(400).json({ error: 'ID de mes financiero requerido.' });

  try {
    const rows = await dbQuery.all(
      `SELECT e.*, c.name as category_name, c.color as category_color, s.name as subcategory_name, 
              a.name as account_name, a.color as account_color, r.filename as receipt_file
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       LEFT JOIN subcategories s ON e.subcategory_id = s.id
       LEFT JOIN accounts a ON e.account_id = a.id
       LEFT JOIN receipts r ON r.transaction_type = 'expense' AND r.transaction_id = e.id
       WHERE e.user_id = ? AND e.month_config_id = ?
       ORDER BY e.date DESC, e.time DESC, e.id DESC`,
      [req.session.userId, monthConfigId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener gastos.' });
  }
});

app.post('/api/expenses', requireAuth, async (req, res) => {
  const {
    month_config_id, date, time, amount, title, description, category_id, subcategory_id,
    payment_method, account_id, expense_type, status, merchant, related_person, custom_tag,
    is_deducible, is_necessary, is_planned, is_recurring, notes, split_type, split_details
  } = req.body;

  if (!month_config_id || !date || !time || !amount || !title || !payment_method) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }

  // Regla inteligente: Si el método de pago requiere tarjeta, validar
  if ((payment_method === 'tarjeta_credito' || payment_method === 'tarjeta_debito') && !account_id) {
    return res.status(400).json({ error: 'Debe seleccionar qué tarjeta o cuenta utilizó para este pago con tarjeta.' });
  }

  try {
    const month = await dbQuery.get('SELECT is_closed FROM monthly_configs WHERE id = ? AND user_id = ?', [month_config_id, req.session.userId]);
    if (!month) return res.status(404).json({ error: 'Mes financiero no válido.' });
    if (month.is_closed) return res.status(400).json({ error: 'El mes financiero está cerrado.' });

    const result = await dbQuery.run(
      `INSERT INTO expenses (
        user_id, month_config_id, date, time, amount, title, description, category_id, subcategory_id,
        payment_method, account_id, expense_type, status, merchant, related_person, custom_tag,
        is_deducible, is_necessary, is_planned, is_recurring, notes, split_type, split_details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.userId, month_config_id, date, time, amount, title, description, category_id || null, subcategory_id || null,
        payment_method, account_id || null, expense_type || 'variable', status || 'pagado', merchant, related_person, custom_tag,
        is_deducible ? 1 : 0, is_necessary ? 1 : 0, is_planned ? 1 : 0, is_recurring ? 1 : 0, notes, split_type || 'simple',
        split_details ? JSON.stringify(split_details) : null
      ]
    );

    // Impacto de balance en la tarjeta/cuenta si está pagado
    if (account_id && status === 'pagado') {
      await dbQuery.run('UPDATE accounts SET initial_balance = initial_balance - ? WHERE id = ?', [amount, account_id]);
    }

    await logActivity(req.session.userId, 'CREATE_EXPENSE', `Gasto registrado: ${title} ($${amount})`, req);
    res.json({ id: result.id, message: 'Gasto registrado con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar gasto.' });
  }
});

app.put('/api/expenses/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const {
    date, time, amount, title, description, category_id, subcategory_id,
    payment_method, account_id, expense_type, status, merchant, related_person, custom_tag,
    is_deducible, is_necessary, is_planned, is_recurring, notes, split_type, split_details
  } = req.body;

  if ((payment_method === 'tarjeta_credito' || payment_method === 'tarjeta_debito') && !account_id) {
    return res.status(400).json({ error: 'Debe seleccionar una tarjeta o cuenta.' });
  }

  try {
    const oldExp = await dbQuery.get('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    if (!oldExp) return res.status(404).json({ error: 'Gasto no encontrado.' });

    const month = await dbQuery.get('SELECT is_closed FROM monthly_configs WHERE id = ?', [oldExp.month_config_id]);
    if (month.is_closed) return res.status(400).json({ error: 'El mes financiero está cerrado.' });

    // Deshacer balance anterior
    if (oldExp.account_id && oldExp.status === 'pagado') {
      await dbQuery.run('UPDATE accounts SET initial_balance = initial_balance + ? WHERE id = ?', [oldExp.amount, oldExp.account_id]);
    }

    await dbQuery.run(
      `UPDATE expenses SET 
        date = ?, time = ?, amount = ?, title = ?, description = ?, category_id = ?, subcategory_id = ?,
        payment_method = ?, account_id = ?, expense_type = ?, status = ?, merchant = ?, related_person = ?, custom_tag = ?,
        is_deducible = ?, is_necessary = ?, is_planned = ?, is_recurring = ?, notes = ?, split_type = ?, split_details = ?
       WHERE id = ? AND user_id = ?`,
      [
        date, time, amount, title, description, category_id || null, subcategory_id || null,
        payment_method, account_id || null, expense_type, status, merchant, related_person, custom_tag,
        is_deducible ? 1 : 0, is_necessary ? 1 : 0, is_planned ? 1 : 0, is_recurring ? 1 : 0, notes, split_type,
        split_details ? JSON.stringify(split_details) : null, id, req.session.userId
      ]
    );

    // Aplicar nuevo impacto en balance
    if (account_id && status === 'pagado') {
      await dbQuery.run('UPDATE accounts SET initial_balance = initial_balance - ? WHERE id = ?', [amount, account_id]);
    }

    await logActivity(req.session.userId, 'UPDATE_EXPENSE', `Gasto actualizado: ${title} ($${amount})`, req);
    res.json({ message: 'Gasto actualizado con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar gasto.' });
  }
});

app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const oldExp = await dbQuery.get('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    if (!oldExp) return res.status(404).json({ error: 'Gasto no encontrado.' });

    const month = await dbQuery.get('SELECT is_closed FROM monthly_configs WHERE id = ?', [oldExp.month_config_id]);
    if (month.is_closed) return res.status(400).json({ error: 'El mes financiero está cerrado.' });

    // Deshacer balance
    if (oldExp.account_id && oldExp.status === 'pagado') {
      await dbQuery.run('UPDATE accounts SET initial_balance = initial_balance + ? WHERE id = ?', [oldExp.amount, oldExp.account_id]);
    }

    // Eliminar archivo de comprobante si lo hay
    const file = await dbQuery.get("SELECT filename FROM receipts WHERE transaction_type = 'expense' AND transaction_id = ?", [id]);
    if (file) {
      const filePath = path.join(uploadsDir, file.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await dbQuery.run("DELETE FROM receipts WHERE transaction_type = 'expense' AND transaction_id = ?", [id]);
    }

    await dbQuery.run('DELETE FROM expenses WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    await logActivity(req.session.userId, 'DELETE_EXPENSE', `Gasto eliminado: ${oldExp.title}`, req);
    res.json({ message: 'Gasto eliminado con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar gasto.' });
  }
});


// ==========================================
// SUBIDA Y GESTIÓN DE COMPROBANTES
// ==========================================

app.post('/api/receipts/upload', requireAuth, upload.single('file'), async (req, res) => {
  const { transactionType, transactionId } = req.body;
  if (!req.file || !transactionType || !transactionId) {
    return res.status(400).json({ error: 'Debe proveer un archivo de comprobante y los metadatos de transacción.' });
  }

  try {
    // Validar existencia de la transacción
    let trans;
    if (transactionType === 'expense') {
      trans = await dbQuery.get('SELECT id FROM expenses WHERE id = ? AND user_id = ?', [transactionId, req.session.userId]);
    } else {
      trans = await dbQuery.get('SELECT id FROM incomes WHERE id = ? AND user_id = ?', [transactionId, req.session.userId]);
    }

    if (!trans) {
      // Eliminar el archivo subido si la transacción no existe
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Transacción no encontrada.' });
    }

    // Eliminar comprobante anterior de esa transacción si existía
    const existingFile = await dbQuery.get(
      'SELECT id, filename FROM receipts WHERE user_id = ? AND transaction_type = ? AND transaction_id = ?',
      [req.session.userId, transactionType, transactionId]
    );
    if (existingFile) {
      const oldPath = path.join(uploadsDir, existingFile.filename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      await dbQuery.run('DELETE FROM receipts WHERE id = ?', [existingFile.id]);
    }

    const result = await dbQuery.run(
      `INSERT INTO receipts (user_id, transaction_type, transaction_id, filename, original_name, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.session.userId, transactionType, transactionId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size]
    );

    await logActivity(req.session.userId, 'UPLOAD_RECEIPT', `Comprobante subido para ${transactionType} ID ${transactionId}.`, req);
    res.json({ id: result.id, filename: req.file.filename, message: 'Comprobante guardado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar comprobante.' });
  }
});

app.delete('/api/receipts', requireAuth, async (req, res) => {
  const { transactionType, transactionId } = req.body;
  if (!transactionType || !transactionId) {
    return res.status(400).json({ error: 'Transacción requerida.' });
  }

  try {
    const file = await dbQuery.get(
      'SELECT id, filename FROM receipts WHERE user_id = ? AND transaction_type = ? AND transaction_id = ?',
      [req.session.userId, transactionType, transactionId]
    );

    if (!file) {
      return res.status(404).json({ error: 'Comprobante no encontrado.' });
    }

    const filePath = path.join(uploadsDir, file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await dbQuery.run('DELETE FROM receipts WHERE id = ?', [file.id]);
    await logActivity(req.session.userId, 'DELETE_RECEIPT', `Comprobante eliminado de ${transactionType} ID ${transactionId}.`, req);
    res.json({ message: 'Comprobante eliminado con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar comprobante.' });
  }
});


// ==========================================
// METAS DE AHORRO
// ==========================================

app.get('/api/savings', requireAuth, async (req, res) => {
  try {
    const rows = await dbQuery.all('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY target_date ASC', [req.session.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener metas.' });
  }
});

app.post('/api/savings', requireAuth, async (req, res) => {
  const { name, target_amount, saved_amount, target_date, description, priority } = req.body;
  if (!name || !target_amount) return res.status(400).json({ error: 'Nombre y monto objetivo requeridos.' });

  try {
    await dbQuery.run(
      `INSERT INTO savings_goals (user_id, name, target_amount, saved_amount, target_date, description, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'en_progreso')`,
      [req.session.userId, name, target_amount, saved_amount || 0, target_date, description, priority || 'media']
    );
    await logActivity(req.session.userId, 'CREATE_SAVING', `Meta de ahorro creada: ${name}`, req);
    res.json({ message: 'Meta de ahorro creada con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear meta.' });
  }
});

app.put('/api/savings/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, target_amount, saved_amount, target_date, description, priority, status } = req.body;

  try {
    await dbQuery.run(
      `UPDATE savings_goals 
       SET name = ?, target_amount = ?, saved_amount = ?, target_date = ?, description = ?, priority = ?, status = ?
       WHERE id = ? AND user_id = ?`,
      [name, target_amount, saved_amount, target_date, description, priority, status, id, req.session.userId]
    );
    await logActivity(req.session.userId, 'UPDATE_SAVING', `Meta de ahorro actualizada: ${name}`, req);
    res.json({ message: 'Meta de ahorro actualizada con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar meta.' });
  }
});

app.delete('/api/savings/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await dbQuery.run('DELETE FROM savings_goals WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    res.json({ message: 'Meta de ahorro eliminada.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar meta.' });
  }
});


// ==========================================
// DEUDAS Y PAGOS
// ==========================================

app.get('/api/debts', requireAuth, async (req, res) => {
  try {
    const rows = await dbQuery.all('SELECT * FROM debts WHERE user_id = ? ORDER BY status DESC, due_date ASC', [req.session.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener deudas.' });
  }
});

app.post('/api/debts', requireAuth, async (req, res) => {
  const { name, lender, total_amount, paid_amount, start_date, due_date, installments_total, installments_paid, installment_value, frequency, payment_method, notes } = req.body;
  if (!name || !lender || !total_amount || !start_date) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para registrar la deuda.' });
  }

  try {
    await dbQuery.run(
      `INSERT INTO debts (user_id, name, lender, total_amount, paid_amount, start_date, due_date, installments_total, installments_paid, installment_value, frequency, payment_method, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
      [req.session.userId, name, lender, total_amount, paid_amount || 0, start_date, due_date, installments_total || 1, installments_paid || 0, installment_value, frequency || 'mensual', payment_method, notes]
    );
    await logActivity(req.session.userId, 'CREATE_DEBT', `Deuda registrada con: ${lender} (${name})`, req);
    res.json({ message: 'Deuda registrada con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar deuda.' });
  }
});

app.put('/api/debts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, lender, total_amount, paid_amount, start_date, due_date, installments_total, installments_paid, installment_value, frequency, payment_method, status, notes } = req.body;

  try {
    await dbQuery.run(
      `UPDATE debts 
       SET name = ?, lender = ?, total_amount = ?, paid_amount = ?, start_date = ?, due_date = ?, installments_total = ?, installments_paid = ?, installment_value = ?, frequency = ?, payment_method = ?, status = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
      [name, lender, total_amount, paid_amount, start_date, due_date, installments_total, installments_paid, installment_value, frequency, payment_method, status, notes, id, req.session.userId]
    );
    res.json({ message: 'Deuda actualizada con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar deudas.' });
  }
});

app.post('/api/debts/:id/pay', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { amount, paymentMethod, accountId, date, monthConfigId } = req.body;

  if (!amount) return res.status(400).json({ error: 'Monto de pago requerido.' });

  try {
    const debt = await dbQuery.get('SELECT * FROM debts WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    if (!debt) return res.status(404).json({ error: 'Deuda no encontrada.' });

    const newPaid = debt.paid_amount + parseFloat(amount);
    const newPaidInstallments = debt.installments_paid + 1;
    const newStatus = newPaid >= debt.total_amount ? 'pagado' : debt.status;

    await dbQuery.run(
      'UPDATE debts SET paid_amount = ?, installments_paid = ?, status = ? WHERE id = ?',
      [newPaid, newPaidInstallments, newStatus, id]
    );

    // Registrar como gasto del mes
    await dbQuery.run(
      `INSERT INTO expenses (user_id, month_config_id, date, time, amount, title, category_id, payment_method, account_id, expense_type, status, merchant, notes)
       VALUES (?, ?, ?, '12:00', ?, ?, NULL, ?, ?, 'deuda', 'pagado', ?, ?)`,
      [req.session.userId, monthConfigId, amount, `Pago Deuda: ${debt.name} (Cuota/Abono)`, paymentMethod, accountId || null, debt.lender, `Pago abonado a la deuda con ${debt.lender}.`]
    );

    // Afectar balance si está pagado
    if (accountId) {
      await dbQuery.run('UPDATE accounts SET initial_balance = initial_balance - ? WHERE id = ?', [amount, accountId]);
    }

    await logActivity(req.session.userId, 'PAY_DEBT', `Abono a deuda ${debt.name}: $${amount}`, req);
    res.json({ message: 'Pago registrado con éxito y reflejado en gastos mensuales.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar pago de deuda.' });
  }
});

app.delete('/api/debts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await dbQuery.run('DELETE FROM debts WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    res.json({ message: 'Deuda eliminada.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar deuda.' });
  }
});


// ==========================================
// GASTOS RECURRENTES
// ==========================================

app.get('/api/recurring', requireAuth, async (req, res) => {
  try {
    const rows = await dbQuery.all(
      `SELECT r.*, c.name as category_name, a.name as account_name
       FROM recurring_templates r
       LEFT JOIN categories c ON r.category_id = c.id
       LEFT JOIN accounts a ON r.account_id = a.id
       WHERE r.user_id = ?`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener gastos recurrentes.' });
  }
});

app.post('/api/recurring', requireAuth, async (req, res) => {
  const { name, amount, category_id, payment_method, account_id, frequency, next_due_date, notes } = req.body;
  if (!name || !amount || !frequency || !next_due_date) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }

  try {
    await dbQuery.run(
      `INSERT INTO recurring_templates (user_id, name, amount, category_id, payment_method, account_id, frequency, next_due_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?)`,
      [req.session.userId, name, amount, category_id || null, payment_method, account_id || null, frequency, next_due_date, notes]
    );
    res.json({ message: 'Plantilla de gasto recurrente programada.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear gasto recurrente.' });
  }
});

app.put('/api/recurring/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, amount, category_id, payment_method, account_id, frequency, next_due_date, status, notes } = req.body;

  try {
    await dbQuery.run(
      `UPDATE recurring_templates 
       SET name = ?, amount = ?, category_id = ?, payment_method = ?, account_id = ?, frequency = ?, next_due_date = ?, status = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
      [name, amount, category_id || null, payment_method, account_id || null, frequency, next_due_date, status, notes, id, req.session.userId]
    );
    res.json({ message: 'Gasto recurrente actualizado.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar.' });
  }
});

app.delete('/api/recurring/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await dbQuery.run('DELETE FROM recurring_templates WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    res.json({ message: 'Gasto recurrente programado eliminado.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar.' });
  }
});


// ==========================================
// CIERRE DE MES Y PROCESAMIENTO RECURRENTE
// ==========================================

app.post('/api/months/:id/close', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const month = await dbQuery.get('SELECT * FROM monthly_configs WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    if (!month) return res.status(404).json({ error: 'Mes no encontrado.' });
    if (month.is_closed) return res.status(400).json({ error: 'El mes ya está cerrado.' });

    // Cerrar mes actual
    await dbQuery.run('UPDATE monthly_configs SET is_closed = 1 WHERE id = ?', [id]);

    // Calcular mes siguiente
    let nextMonth = month.month + 1;
    let nextYear = month.year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    // Verificar si ya existe el mes siguiente
    const nextExists = await dbQuery.get(
      'SELECT id FROM monthly_configs WHERE user_id = ? AND month = ? AND year = ?',
      [req.session.userId, nextMonth, nextYear]
    );

    let nextMonthId;
    if (!nextExists) {
      // Calcular balance acumulado para pasar como inicial
      const expensesSum = await dbQuery.get('SELECT SUM(amount) as total FROM expenses WHERE month_config_id = ? AND status = "pagado"', [id]);
      const incomesSum = await dbQuery.get('SELECT SUM(amount) as total FROM incomes WHERE month_config_id = ? AND status = "recibido"', [id]);
      
      const totalExpenses = expensesSum.total || 0;
      const totalIncomes = incomesSum.total || 0;
      const finalBalance = month.initial_balance + totalIncomes - totalExpenses;

      // Crear nuevo mes copiando datos
      const result = await dbQuery.run(
        `INSERT INTO monthly_configs (user_id, month, year, initial_budget, initial_balance, saving_goal, currency, notes, cycle_start_day, cycle_end_day)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.session.userId, nextMonth, nextYear, month.initial_budget, finalBalance, month.saving_goal, month.currency, `Generado al cerrar mes anterior ${month.month}/${month.year}`, month.cycle_start_day, month.cycle_end_day]
      );
      nextMonthId = result.id;

      // Copiar presupuestos de categorías del usuario
      // (En SQLite las categorías son globales por usuario, por lo que heredan presupuesto configurado automáticamente en la tabla categories)

      // Procesar gastos recurrentes programados para el nuevo mes
      const recurring = await dbQuery.all('SELECT * FROM recurring_templates WHERE user_id = ? AND status = "activo"', [req.session.userId]);
      for (const rec of recurring) {
        const recDate = new Date(rec.next_due_date);
        // Si el gasto recurrente cae dentro del nuevo mes
        if (recDate.getMonth() + 1 === nextMonth && recDate.getFullYear() === nextYear) {
          // Registrar gasto
          await dbQuery.run(
            `INSERT INTO expenses (user_id, month_config_id, date, time, amount, title, category_id, payment_method, account_id, expense_type, status, notes, is_recurring)
             VALUES (?, ?, ?, '08:00', ?, ?, ?, ?, ?, 'recurrente', 'pendiente', ?, 1)`,
            [req.session.userId, nextMonthId, rec.next_due_date, rec.amount, rec.name, rec.category_id, rec.payment_method, rec.account_id, 'Generado automáticamente por planificador recurrente.']
          );

          // Actualizar próxima fecha de cobro según frecuencia
          let newDueDate = new Date(recDate);
          if (rec.frequency === 'mensual') {
            newDueDate.setMonth(newDueDate.getMonth() + 1);
          } else if (rec.frequency === 'semanal') {
            newDueDate.setDate(newDueDate.getDate() + 7);
          } else if (rec.frequency === 'quincenal') {
            newDueDate.setDate(newDueDate.getDate() + 15);
          } else if (rec.frequency === 'anual') {
            newDueDate.setFullYear(newDueDate.getFullYear() + 1);
          }
          await dbQuery.run('UPDATE recurring_templates SET next_due_date = ? WHERE id = ?', [newDueDate.toISOString().split('T')[0], rec.id]);
        }
      }
    }

    await logActivity(req.session.userId, 'CLOSE_MONTH', `Cierre de mes ${month.month}/${month.year}.`, req);
    res.json({ message: 'Mes cerrado correctamente y nuevo mes financiero inicializado.', nextMonthId });
  } catch (err) {
    res.status(500).json({ error: 'Error al realizar el cierre de mes.' });
  }
});


// ==========================================
// REPORTES, COMPARATIVAS Y ACTIVIDAD
// ==========================================

app.get('/api/activity', requireAuth, async (req, res) => {
  try {
    const rows = await dbQuery.all(
      'SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al recuperar historial de actividad.' });
  }
});

// Endpoint de Comparativa de meses
app.get('/api/months/compare', requireAuth, async (req, res) => {
  const { month1Id, month2Id } = req.query;
  if (!month1Id || !month2Id) return res.status(400).json({ error: 'Se requieren los IDs de ambos meses a comparar.' });

  try {
    const m1 = await dbQuery.get('SELECT * FROM monthly_configs WHERE id = ? AND user_id = ?', [month1Id, req.session.userId]);
    const m2 = await dbQuery.get('SELECT * FROM monthly_configs WHERE id = ? AND user_id = ?', [month2Id, req.session.userId]);
    
    if (!m1 || !m2) return res.status(404).json({ error: 'Uno o ambos meses no existen.' });

    // Métricas del mes 1
    const inc1 = await dbQuery.get('SELECT SUM(amount) as total FROM incomes WHERE month_config_id = ? AND status="recibido"', [month1Id]);
    const exp1 = await dbQuery.get('SELECT SUM(amount) as total FROM expenses WHERE month_config_id = ? AND status="pagado"', [month1Id]);

    // Métricas del mes 2
    const inc2 = await dbQuery.get('SELECT SUM(amount) as total FROM incomes WHERE month_config_id = ? AND status="recibido"', [month2Id]);
    const exp2 = await dbQuery.get('SELECT SUM(amount) as total FROM expenses WHERE month_config_id = ? AND status="pagado"', [month2Id]);

    res.json({
      month1: {
        meta: m1,
        incomes: inc1.total || 0,
        expenses: exp1.total || 0,
        balance: m1.initial_balance + (inc1.total || 0) - (exp1.total || 0)
      },
      month2: {
        meta: m2,
        incomes: inc2.total || 0,
        expenses: exp2.total || 0,
        balance: m2.initial_balance + (inc2.total || 0) - (exp2.total || 0)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al generar comparativa.' });
  }
});


// ==========================================
// EXPORTACIÓN Y BACKUP DE INFORMACIÓN
// ==========================================

app.get('/api/backup/export', requireAuth, async (req, res) => {
  try {
    const data = {
      user: await dbQuery.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [req.session.userId]),
      monthly_configs: await dbQuery.all('SELECT * FROM monthly_configs WHERE user_id = ?', [req.session.userId]),
      accounts: await dbQuery.all('SELECT * FROM accounts WHERE user_id = ?', [req.session.userId]),
      categories: await dbQuery.all('SELECT * FROM categories WHERE user_id = ?', [req.session.userId]),
      incomes: await dbQuery.all('SELECT * FROM incomes WHERE user_id = ?', [req.session.userId]),
      expenses: await dbQuery.all('SELECT * FROM expenses WHERE user_id = ?', [req.session.userId]),
      debts: await dbQuery.all('SELECT * FROM debts WHERE user_id = ?', [req.session.userId]),
      savings_goals: await dbQuery.all('SELECT * FROM savings_goals WHERE user_id = ?', [req.session.userId]),
      recurring_templates: await dbQuery.all('SELECT * FROM recurring_templates WHERE user_id = ?', [req.session.userId]),
      audit_logs: await dbQuery.all('SELECT * FROM audit_logs WHERE user_id = ?', [req.session.userId])
    };

    res.setHeader('Content-disposition', 'attachment; filename=respaldo_finanzas.json');
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Error al exportar base de datos.' });
  }
});

// Importar datos desde CSV (Gastos e Ingresos)
app.post('/api/backup/import', requireAuth, upload.single('file'), async (req, res) => {
  const { monthConfigId } = req.body;
  if (!req.file || !monthConfigId) {
    return res.status(400).json({ error: 'Archivo CSV y mes financiero destino requeridos.' });
  }

  try {
    const fileContent = fs.readFileSync(req.file.path, 'utf8');
    fs.unlinkSync(req.file.path); // Limpiar archivo temporal

    const lines = fileContent.split('\n');
    let importedExpenses = 0;
    let importedIncomes = 0;

    // Procesar líneas ignorando cabecera
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Dividir por comas, soportando comillas simples/dobles
      const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(col => col.replace(/^["']|["']$/g, '').trim());
      
      // Formato esperado: tipo(expense/income), fecha(YYYY-MM-DD), monto, titulo, categoria, metodo, notas
      const [type, date, amountStr, title, categoryName, method, notes] = cols;
      const amount = parseFloat(amountStr);

      if (!type || !date || isNaN(amount) || !title) continue;

      // Buscar categoría o asignar por defecto 'Otros'
      let cat = await dbQuery.get('SELECT id FROM categories WHERE name = ? AND user_id = ?', [categoryName, req.session.userId]);
      let categoryId = cat ? cat.id : null;

      if (type === 'expense') {
        await dbQuery.run(
          `INSERT INTO expenses (user_id, month_config_id, date, time, amount, title, category_id, payment_method, status, notes)
           VALUES (?, ?, ?, '12:00', ?, ?, ?, ?, 'pagado', ?)`,
          [req.session.userId, monthConfigId, date, amount, title, categoryId, method || 'efectivo', notes || 'Importado de CSV']
        );
        importedExpenses++;
      } else if (type === 'income') {
        await dbQuery.run(
          `INSERT INTO incomes (user_id, month_config_id, date, amount, source, category_id, receipt_method, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'recibido', ?)`,
          [req.session.userId, monthConfigId, date, amount, title, categoryId, method || 'transferencia', notes || 'Importado de CSV']
        );
        importedIncomes++;
      }
    }

    await logActivity(req.session.userId, 'IMPORT_CSV', `Importación CSV realizada: ${importedExpenses} gastos y ${importedIncomes} ingresos.`, req);
    res.json({ message: `Importación completada. Se importaron ${importedExpenses} gastos y ${importedIncomes} ingresos con éxito.` });
  } catch (err) {
    res.status(500).json({ error: 'Error al importar archivo CSV. Asegúrese del formato correcto.' });
  }
});


// Inicializar y encender el servidor
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`=== GESTOR DE FINANZAS PERSONALES CORRIENDO EN http://localhost:${PORT} ===`);
    });
  })
  .catch((err) => {
    console.error('Error al inicializar la base de datos:', err);
  });
