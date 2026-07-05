# AuraFinance - Gestor de Finanzas Personales Premium

AuraFinance es una aplicación web profesional, segura y moderna diseñada para llevar el control mensual absoluto de sus finanzas personales: presupuestos por categorías, ingresos, gastos detallados, cuentas y tarjetas, metas de ahorro, deudas, comprobantes adjuntos, análisis de métricas y gráficos interactivos.

## Características Clave
* **Seguridad Profesional**: Inicio de sesión seguro con contraseñas cifradas en `bcryptjs`, protección contra inyecciones SQL (sentencias preparadas), prevención de ataques XSS y cabeceras de seguridad robustas mediante Helmet.
* **Control Inteligente de Intentos de Login**: Bloqueo temporal automático de cuentas por 15 minutos tras 5 intentos fallidos consecutivas.
* **PIN de Acceso Interno**: PIN opcional de 4 dígitos para resguardar áreas sensibles (tarjetas, reportes, configuración) contra miradas indiscretas.
* **Modo Privacidad**: Oculte o desenfoque todos los saldos y montos sensibles de la pantalla con un solo clic.
* **Dashboard Premium Completo**: Gráficos interactivos de ingresos vs gastos, distribución por categoría y evolución de saldo diario mediante Chart.js.
* **Cierre de Mes Financiero**: Cierre períodos contables de forma segura, transfiriendo balances sobrantes al mes siguiente y recalculando gastos recurrentes planificados.
* **Gestión de Comprobantes**: Suba y asocie capturas o archivos PDF como justificantes para cada ingreso o gasto.
* **Importación y Exportación**: Exporte copias de respaldo en JSON o descargue sus registros en formato CSV. Importe transacciones desde archivos CSV con validación en vivo.

---

## Requisitos Previos
* **Node.js** (versión 18 o superior recomendada)
* **NPM** (incluido con Node.js)

---

## Instalación y Configuración

1. Abra una terminal en el directorio del proyecto:
   ```bash
   cd C:\Users\JOEL\.gemini\antigravity\scratch\personal-finance-dashboard
   ```

2. Instale todas las dependencias requeridas ejecutando:
   ```bash
   npm install
   ```

3. (Opcional) Verifique la base de datos local y los datos semilla ejecutando el script de validación:
   ```bash
   node test-api.js
   ```

---

## Cómo Iniciar la Aplicación

Inicie el servidor Express de desarrollo con recarga automática:
```bash
npm run dev
```
O inicie en modo de producción clásico:
```bash
npm start
```

Una vez que el servidor esté activo, abra su navegador web favorito y acceda a:
👉 [http://localhost:3000](http://localhost:3000)

---

## Datos de Acceso de Prueba (Semilla)
Para facilitar la evaluación inicial, la base de datos se crea con un usuario y transacciones realistas sembrados por defecto:

* **Correo Electrónico**: `admin@admin.com`
* **Contraseña**: `admin123`
* **PIN de Seguridad Interno**: `1234`

---

## Estructura de Importación de Archivo CSV
Para importar transacciones masivamente desde el módulo de configuración general, suba un archivo `.csv` con la siguiente estructura de columnas (sin incluir cabecera):

```csv
tipo, fecha, monto, titulo, categoria, metodo, notas
expense, 2026-07-02, 15.50, Almuerzo Ejecutivo, Alimentación, tarjeta_debito, restaurante local
income, 2026-07-03, 350.00, Trabajo Cliente Freelance, Ahorro, transferencia, desarrollo web
```
*(Los tipos permitidos son `expense` o `income`)*
