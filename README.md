# AuraFinance - Gestor de Finanzas Personales Premium (PHP & MySQL)

AuraFinance es una aplicación web profesional, segura, responsiva y premium diseñada para llevar el control mensual de sus finanzas: presupuestos por categorías, ingresos, gastos detallados, cuentas y tarjetas, metas de ahorro, deudas, comprobantes adjuntos y gráficos interactivos.

Esta versión está construida en **PHP 8.x** y **MySQL**, lo que garantiza compatibilidad nativa e instantánea con todos los planes de hosting de **Hostinger** (compartido y VPS) sin requerir servicios en segundo plano ni consolas Node.js.

---

## Estructura del Proyecto
* **`api/config.php`**: Credenciales de la base de datos MySQL (Host, DB Name, User, Password).
* **`api/db_connect.php`**: Inicialización del conector seguro PDO con sentencias preparadas contra inyecciones SQL.
* **`api/setup.php`**: Instalador web automático de tablas y semillas de base de datos.
* **`api/index.php`**: Enrutador principal que procesa de forma segura todas las APIs (auth, CRUDs, carga de comprobantes, reportes).
* **`public/`**: Frontend (HTML5, CSS3, JS Vanilla SPA, Chart.js).

---

## 🛠️ PASO A PASO: Configuración de Base de Datos y Despliegue en Hostinger

Siga estos pasos sencillos para subir y arrancar su aplicación en Hostinger:

### Paso 1: Crear la Base de Datos MySQL en Hostinger
1. Inicie sesión en su panel de Hostinger (**hPanel**).
2. En el menú izquierdo, diríjase a **Bases de datos** -> **Bases de datos MySQL**.
3. En la sección **Crear una nueva base de datos MySQL y usuario**:
   * **Nombre de la base de datos**: Escriba un nombre (ejemplo: `finanzas`). El nombre completo tendrá un prefijo generado por Hostinger (ejemplo: `u123456_finanzas`).
   * **Nombre de usuario MySQL**: Escriba un usuario (ejemplo: `joel`). El usuario completo tendrá prefijo (ejemplo: `u123456_joel`).
   * **Contraseña**: Genere una contraseña segura y cópiela.
4. Haga clic en **Crear**. Anote estos datos en un lugar seguro.

### Paso 2: Configurar las Credenciales en el Código
Abra el archivo [api/config.php](file:///C:/Users/JOEL/.gemini/antigravity/scratch/personal-finance-dashboard/api/config.php) de su proyecto y reemplace las constantes con los datos creados en el Paso 1:

```php
define('DB_HOST', '127.0.0.1'); // Hostinger suele usar localhost o 127.0.0.1
define('DB_NAME', 'u123456_finanzas'); // Tu nombre completo de base de datos
define('DB_USER', 'u123456_joel');     // Tu usuario completo de base de datos
define('DB_PASS', 'TU_CONTRASEÑA_CREADA');
```

### Paso 3: Subir el Código a Hostinger
* **Opción A (Git Auto-Deploy - Recomendado)**:
  1. En hPanel, vaya a **Sitios Web** -> **Git**.
  2. Ingrese la URL de su repositorio de GitHub: `https://github.com/Jiyanedesign/Finanzas_Joel.git`.
  3. Indique la rama principal: `main`.
  4. Haga clic en **Crear**.
  5. En la sección de Auto-Despliegue, copie la **URL del Webhook** y configúrela en su panel de GitHub (dentro de su repositorio, vaya a *Settings* -> *Webhooks* -> *Add Webhook* -> pegue en *Payload URL* -> guarde). Ahora, cada vez que haga `git push`, Hostinger actualizará la aplicación.
* **Opción B (Administrador de Archivos)**:
  1. Descargue el proyecto como un archivo `.zip`.
  2. En hPanel, vaya a **Archivos** -> **Administrador de Archivos**.
  3. Suba el archivo `.zip` dentro de la carpeta `public_html` y extráigalo ahí mismo.

### Paso 4: Ejecutar el Instalador Web Automático (Crear Tablas)
Una vez que el código esté arriba y configurado, abra su navegador web favorito y acceda a la siguiente ruta de instalación:
👉 **`https://tudominio.com/api/setup.php`** (o `http://localhost/api/setup.php` si prueba localmente en XAMPP/WampServer).

Esta página:
1. Creará automáticamente las 13 tablas relacionales en tu base de datos MySQL de Hostinger.
2. Sembrará los datos y transacciones iniciales de prueba para que puedas empezar inmediatamente.

---

## 🔑 Credenciales por Defecto de Prueba
* **Usuario/Email**: `admin@admin.com`
* **Contraseña**: `admin123`
* **PIN de seguridad interno**: `1234`
*(Modifique estas credenciales en la pestaña Ajustes tras iniciar sesión por primera vez).*
