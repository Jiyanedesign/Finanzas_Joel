const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'finance.db');
const db = new sqlite3.Database(dbPath);

// Habilitar claves foráneas
db.run('PRAGMA foreign_keys = ON;');

// Helper para envolver consultas en promesas
const dbQuery = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  exec(sql) {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

async function initDatabase() {
  // Crear tablas
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      security_pin TEXT,
      failed_login_attempts INTEGER DEFAULT 0,
      lock_until TEXT,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS monthly_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      initial_budget REAL NOT NULL DEFAULT 0.0,
      initial_balance REAL NOT NULL DEFAULT 0.0,
      saving_goal REAL NOT NULL DEFAULT 0.0,
      currency TEXT NOT NULL DEFAULT '$',
      notes TEXT,
      cycle_start_day INTEGER DEFAULT 1,
      cycle_end_day INTEGER DEFAULT 28,
      is_closed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      bank TEXT,
      type TEXT NOT NULL,
      last_four TEXT,
      color TEXT DEFAULT '#4F46E5',
      initial_balance REAL DEFAULT 0.0,
      credit_limit REAL DEFAULT 0.0,
      cut_off_day INTEGER,
      due_day INTEGER,
      status TEXT DEFAULT 'activa',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT 'tag',
      color TEXT DEFAULT '#10B981',
      budget REAL DEFAULT 0.0,
      status TEXT DEFAULT 'activa',
      description TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month_config_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      amount REAL NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      category_id INTEGER,
      subcategory_id INTEGER,
      payment_method TEXT NOT NULL,
      account_id INTEGER,
      expense_type TEXT DEFAULT 'variable',
      status TEXT DEFAULT 'pagado',
      merchant TEXT,
      related_person TEXT,
      custom_tag TEXT,
      is_deducible INTEGER DEFAULT 0,
      is_necessary INTEGER DEFAULT 1,
      is_planned INTEGER DEFAULT 1,
      is_recurring INTEGER DEFAULT 0,
      notes TEXT,
      split_type TEXT DEFAULT 'simple',
      split_details TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(month_config_id) REFERENCES monthly_configs(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY(subcategory_id) REFERENCES subcategories(id) ON DELETE SET NULL,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS incomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month_config_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      source TEXT NOT NULL,
      category_id INTEGER,
      receipt_method TEXT,
      account_id INTEGER,
      description TEXT,
      status TEXT DEFAULT 'recibido',
      custom_tag TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(month_config_id) REFERENCES monthly_configs(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      transaction_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recurring_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      category_id INTEGER,
      payment_method TEXT NOT NULL,
      account_id INTEGER,
      frequency TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      status TEXT DEFAULT 'activo',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      lender TEXT NOT NULL,
      total_amount REAL NOT NULL,
      paid_amount REAL DEFAULT 0.0,
      start_date TEXT NOT NULL,
      due_date TEXT,
      installments_total INTEGER DEFAULT 1,
      installments_paid INTEGER DEFAULT 0,
      installment_value REAL,
      frequency TEXT DEFAULT 'mensual',
      payment_method TEXT,
      status TEXT DEFAULT 'pendiente',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      saved_amount REAL DEFAULT 0.0,
      target_date TEXT,
      description TEXT,
      priority TEXT DEFAULT 'media',
      status TEXT DEFAULT 'en_progreso',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Sembrar datos de prueba si la base de datos está vacía
  const userCount = await dbQuery.get('SELECT COUNT(*) as count FROM users');
  if (userCount.count === 0) {
    console.log('Base de datos vacía. Sembrando datos iniciales...');
    
    // Crear usuario por defecto: admin@admin.com / admin123
    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash('admin123', salt);
    const resultUser = await dbQuery.run(
      'INSERT INTO users (name, email, password_hash, security_pin) VALUES (?, ?, ?, ?)',
      ['Joel Administrador', 'admin@admin.com', passHash, '1234']
    );
    const userId = resultUser.id;

    // Crear cuentas/tarjetas por defecto
    const accountsData = [
      { name: 'Efectivo Personal', bank: 'N/A', type: 'efectivo', last_four: null, color: '#F59E0B', initial_balance: 150.0 },
      { name: 'Cuenta Ahorros Pichincha', bank: 'Banco Pichincha', type: 'cuenta_bancaria', last_four: '4567', color: '#3B82F6', initial_balance: 1200.0 },
      { name: 'Tarjeta Visa Gold', bank: 'Banco Pichincha', type: 'tarjeta_credito', last_four: '9876', color: '#EF4444', initial_balance: 0.0, credit_limit: 2000.0, cut_off_day: 15, due_day: 5 },
      { name: 'Billetera Digital Deuna', bank: 'Banco Pichincha', type: 'billetera_digital', last_four: null, color: '#10B981', initial_balance: 50.0 }
    ];

    const accountIds = {};
    for (const acc of accountsData) {
      const res = await dbQuery.run(
        `INSERT INTO accounts (user_id, name, bank, type, last_four, color, initial_balance, credit_limit, cut_off_day, due_day)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, acc.name, acc.bank, acc.type, acc.last_four, acc.color, acc.initial_balance, acc.credit_limit || 0, acc.cut_off_day || null, acc.due_day || null]
      );
      accountIds[acc.name] = res.id;
    }

    // Crear categorías por defecto
    const categoriesData = [
      { name: 'Alimentación', icon: 'utensils', color: '#EF4444', budget: 200.0, subs: ['Supermercado', 'Restaurantes', 'Cafés'] },
      { name: 'Transporte', icon: 'car', color: '#3B82F6', budget: 80.0, subs: ['Gasolina', 'Taxi/Uber', 'Mantenimiento'] },
      { name: 'Vivienda', icon: 'home', color: '#10B981', budget: 450.0, subs: ['Alquiler', 'Servicios básicos', 'Internet', 'Reparaciones'] },
      { name: 'Entretenimiento', icon: 'film', color: '#F59E0B', budget: 80.0, subs: ['Cine', 'Suscripciones', 'Salidas'] },
      { name: 'Salud', icon: 'heart', color: '#EC4899', budget: 50.0, subs: ['Medicinas', 'Consultas', 'Seguro'] },
      { name: 'Educación', icon: 'book', color: '#8B5CF6', budget: 100.0, subs: ['Cursos', 'Libros', 'Materiales'] },
      { name: 'Ahorro', icon: 'piggy-bank', color: '#06B6D4', budget: 150.0, subs: ['Fondo Emergencia', 'Inversiones'] }
    ];

    const categoryIds = {};
    for (const cat of categoriesData) {
      const res = await dbQuery.run(
        'INSERT INTO categories (user_id, name, icon, color, budget) VALUES (?, ?, ?, ?, ?)',
        [userId, cat.name, cat.icon, cat.color, cat.budget]
      );
      categoryIds[cat.name] = res.id;

      for (const sub of cat.subs) {
        await dbQuery.run('INSERT INTO subcategories (category_id, name) VALUES (?, ?)', [res.id, sub]);
      }
    }

    // Crear mes financiero por defecto: Julio 2026
    const resMonth = await dbQuery.run(
      `INSERT INTO monthly_configs (user_id, month, year, initial_budget, initial_balance, saving_goal, currency, notes, cycle_start_day, cycle_end_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, 7, 2026, 1200.0, 1400.0, 200.0, '$', 'Planificación financiera para el mes de Julio.', 1, 31]
    );
    const monthConfigId = resMonth.id;

    // Obtener IDs de subcategorías para sembrar transacciones específicas
    const subSuper = await dbQuery.get("SELECT s.id FROM subcategories s JOIN categories c ON s.category_id = c.id WHERE c.name = 'Alimentación' AND s.name = 'Supermercado'");
    const subAlquiler = await dbQuery.get("SELECT s.id FROM subcategories s JOIN categories c ON s.category_id = c.id WHERE c.name = 'Vivienda' AND s.name = 'Alquiler'");
    const subInternet = await dbQuery.get("SELECT s.id FROM subcategories s JOIN categories c ON s.category_id = c.id WHERE c.name = 'Vivienda' AND s.name = 'Internet'");
    const subGasolina = await dbQuery.get("SELECT s.id FROM subcategories s JOIN categories c ON s.category_id = c.id WHERE c.name = 'Transporte' AND s.name = 'Gasolina'");
    const subNetflix = await dbQuery.get("SELECT s.id FROM subcategories s JOIN categories c ON s.category_id = c.id WHERE c.name = 'Entretenimiento' AND s.name = 'Suscripciones'");

    // Crear ingresos de prueba
    const incomesData = [
      { date: '2026-07-01', amount: 1500.0, source: 'Sueldo Mensual', method: 'Transferencia', accName: 'Cuenta Ahorros Pichincha', desc: 'Pago mensual de nómina principal', status: 'recibido' },
      { date: '2026-07-10', amount: 250.0, source: 'Proyecto Freelance', method: 'Transferencia', accName: 'Cuenta Ahorros Pichincha', desc: 'Desarrollo de landing page para cliente', status: 'recibido' },
      { date: '2026-07-15', amount: 40.0, source: 'Reembolso Cena', method: 'Billetera Digital', accName: 'Billetera Digital Deuna', desc: 'Reembolso por parte de amigos', status: 'recibido' }
    ];

    for (const inc of incomesData) {
      await dbQuery.run(
        `INSERT INTO incomes (user_id, month_config_id, date, amount, source, receipt_method, account_id, description, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, monthConfigId, inc.date, inc.amount, inc.source, inc.method, accountIds[inc.accName], inc.desc, inc.status]
      );
    }

    // Crear gastos de prueba
    const expensesData = [
      { date: '2026-07-01', time: '09:00', amount: 400.0, title: 'Alquiler Departamento', category: 'Vivienda', subId: subAlquiler ? subAlquiler.id : null, method: 'transferencia_bancaria', accName: 'Cuenta Ahorros Pichincha', type: 'fijo', status: 'pagado', merchant: 'Propietario Juan', tag: 'personal', desc: 'Pago mensual de alquiler del departamento', is_necessary: 1, is_planned: 1 },
      { date: '2026-07-03', time: '14:30', amount: 85.50, title: 'Compra Semanal Supermercado', category: 'Alimentación', subId: subSuper ? subSuper.id : null, method: 'tarjeta_debito', accName: 'Cuenta Ahorros Pichincha', type: 'variable', status: 'pagado', merchant: 'Supermaxi', tag: 'familia', desc: 'Frutas, verduras, carnes y abarrotes', is_necessary: 1, is_planned: 1 },
      { date: '2026-07-05', time: '18:00', amount: 25.00, title: 'Tanqueada Combustible', category: 'Transporte', subId: subGasolina ? subGasolina.id : null, method: 'efectivo', accName: 'Efectivo Personal', type: 'variable', status: 'pagado', merchant: 'Gasolinera Primax', tag: 'personal', desc: 'Combustible súper para el auto', is_necessary: 1, is_planned: 1 },
      { date: '2026-07-06', time: '08:00', amount: 40.00, title: 'Servicio de Internet Fibra', category: 'Vivienda', subId: subInternet ? subInternet.id : null, method: 'tarjeta_credito', accName: 'Tarjeta Visa Gold', type: 'fijo', status: 'pagado', merchant: 'Netlife', tag: 'servicios', desc: 'Mensualidad internet hogar 100Mbps', is_necessary: 1, is_planned: 1 },
      { date: '2026-07-12', time: '20:15', amount: 12.99, title: 'Mensualidad Netflix', category: 'Entretenimiento', subId: subNetflix ? subNetflix.id : null, method: 'tarjeta_credito', accName: 'Tarjeta Visa Gold', type: 'recurrente', status: 'pagado', merchant: 'Netflix', tag: 'suscripciones', desc: 'Plan Familiar Netflix HD', is_necessary: 0, is_planned: 1 }
    ];

    for (const exp of expensesData) {
      await dbQuery.run(
        `INSERT INTO expenses (user_id, month_config_id, date, time, amount, title, category_id, subcategory_id, payment_method, account_id, expense_type, status, merchant, custom_tag, description, is_necessary, is_planned)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, monthConfigId, exp.date, exp.time, exp.amount, exp.title, categoryIds[exp.category], exp.subId, exp.method, accountIds[exp.accName], exp.type, exp.status, exp.merchant, exp.tag, exp.desc, exp.is_necessary, exp.is_planned]
      );
    }

    // Registrar deudas de prueba
    await dbQuery.run(
      `INSERT INTO debts (user_id, name, lender, total_amount, paid_amount, start_date, due_date, installments_total, installments_paid, installment_value, frequency, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, 'Préstamo Auto', 'Banco Pichincha', 5000.0, 1500.0, '2026-01-10', '2027-12-10', 24, 6, 220.0, 'mensual', 'pendiente', 'Préstamo para compra de auto usado. Cuotas mensuales debito automático.']
    );

    // Registrar metas de ahorro de prueba
    await dbQuery.run(
      `INSERT INTO savings_goals (user_id, name, target_amount, saved_amount, target_date, description, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, 'Fondo de Emergencia', 2000.0, 800.0, '2026-12-31', 'Tener 3 meses de gastos cubiertos ante cualquier imprevisto.', 'alta', 'en_progreso']
    );
    await dbQuery.run(
      `INSERT INTO savings_goals (user_id, name, target_amount, saved_amount, target_date, description, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, 'Viaje Fin de Año', 1500.0, 300.0, '2026-12-15', 'Ahorro para vacaciones de navidad con la familia.', 'media', 'en_progreso']
    );

    // Registrar gastos recurrentes de prueba
    await dbQuery.run(
      `INSERT INTO recurring_templates (user_id, name, amount, category_id, payment_method, account_id, frequency, next_due_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, 'Suscripción Spotify Duo', 8.99, categoryIds['Entretenimiento'], 'tarjeta_credito', accountIds['Tarjeta Visa Gold'], 'mensual', '2026-08-01', 'activo', 'Música sin anuncios. Debito automático.']
    );

    // Registrar auditoría inicial
    await dbQuery.run(
      "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, 'SEED_DATABASE', 'Datos de prueba y configuraciones iniciales sembrados con éxito.', '127.0.0.1')",
      [userId]
    );

    console.log('Sembrado de datos finalizado con éxito.');
  }
}

module.exports = {
  db,
  dbQuery,
  initDatabase
};
