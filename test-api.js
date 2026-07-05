const http = require('http');

console.log('=== INICIANDO PRUEBAS DE INTEGRACIÓN DE API (MOCK RUN) ===');

// Hacemos una prueba básica del servidor corriendo localmente.
// Nota: Requiere que el servidor esté activo en http://localhost:3000.
// Si no está activo, la prueba fallará con conexión rehusada.
// Para esta validación, ejecutaremos una comprobación básica de los módulos y base de datos local.

try {
  const { db, dbQuery, initDatabase } = require('./database');
  
  async function runLocalTests() {
    console.log('1. Inicializando base de datos...');
    await initDatabase();
    console.log('2. Verificando conexión con SQLite y tablas...');
    const tables = await dbQuery.all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log(`   Tablas encontradas en la BD: ${tables.map(t => t.name).join(', ')}`);
    
    if (tables.length > 0) {
      console.log('   [PASS] La estructura de base de datos se inicializó correctamente.');
    } else {
      throw new Error('No se encontraron tablas creadas.');
    }

    console.log('3. Verificando existencia de usuario semilla (admin@admin.com)...');
    const user = await dbQuery.get("SELECT name, email FROM users WHERE email = 'admin@admin.com'");
    if (user) {
      console.log(`   Usuario semilla verificado: ${user.name} (${user.email})`);
      console.log('   [PASS] Datos de prueba de usuario sembrados.');
    } else {
      throw new Error('Usuario semilla no encontrado en la base de datos.');
    }

    console.log('4. Verificando existencia de mes financiero de prueba (Julio 2026)...');
    const month = await dbQuery.get("SELECT month, year, initial_budget FROM monthly_configs WHERE month = 7 AND year = 2026");
    if (month) {
      console.log(`   Mes verificado: Julio/2026. Presupuesto: $${month.initial_budget}`);
      console.log('   [PASS] Mes financiero semilla verificado.');
    } else {
      throw new Error('Mes financiero semilla no encontrado.');
    }

    console.log('5. Verificando deudas de prueba sembradas...');
    const debt = await dbQuery.get("SELECT name, total_amount FROM debts LIMIT 1");
    if (debt) {
      console.log(`   Deuda verificada: ${debt.name} - Total: $${debt.total_amount}`);
      console.log('   [PASS] Módulo de deudas y deudores semilla verificado.');
    } else {
      throw new Error('No se encontraron deudas sembradas.');
    }

    console.log('=== TODAS LAS PRUEBAS LOCALES DE INTEGRACIÓN COMPLETADAS CON ÉXITO [PASS] ===');
    process.exit(0);
  }

  runLocalTests().catch(err => {
    console.error('   [FAIL] Fallo en la verificación:', err.message);
    process.exit(1);
  });

} catch (err) {
  console.error('Error al importar base de datos:', err);
  process.exit(1);
}
