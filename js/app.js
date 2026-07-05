/* ==========================================================================
   AuraFinance - LÓGICA PRINCIPAL DEL FRONTEND (SPA)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // ESTADO GLOBAL DE LA APLICACIÓN
  // ==========================================
  const state = {
    user: null,
    months: [],
    activeMonthId: null,
    activeMonthConfig: null,
    categories: [],
    accounts: [],
    incomes: [],
    expenses: [],
    debts: [],
    savings: [],
    recurring: [],
    privacyMode: false,
    selectedCalDate: new Date(),
    charts: {} // Almacena instancias de Chart.js
  };

  // Helper para obtener detalles visuales y traducción del tipo de cuenta
  function getAccountTypeDetails(type) {
    switch (type) {
      case 'cuenta_bancaria':
        return { label: 'Cuenta Bancaria', icon: 'landmark' };
      case 'tarjeta_debito':
        return { label: 'Tarjeta de Débito', icon: 'credit-card' };
      case 'tarjeta_credito':
      case 'credito':
        return { label: 'Tarjeta de Crédito', icon: 'credit-card' };
      case 'billetera_digital':
        return { label: 'Billetera Digital', icon: 'smartphone' };
      case 'efectivo':
        return { label: 'Efectivo', icon: 'coins' };
      case 'debito':
        return { label: 'Débito / Ahorros', icon: 'wallet' };
      default:
        return { label: (type || 'OTRO').toUpperCase().replace('_', ' '), icon: 'wallet' };
    }
  }

  // ==========================================
  // SELECTORES DE ELEMENTOS PRINCIPALES
  // ==========================================
  const els = {
    authContainer: document.getElementById('auth-container'),
    appContainer: document.getElementById('app-container'),
    mainContent: document.getElementById('main-content'),
    sidebar: document.getElementById('sidebar'),
    btnToggleMenu: document.getElementById('btn-toggle-menu'),
    
    // Auth Views
    loginView: document.getElementById('auth-view-login'),
    registerView: document.getElementById('auth-view-register'),
    recoverView: document.getElementById('auth-view-recover'),
    
    // Auth Forms
    formLogin: document.getElementById('form-login'),
    formRegister: document.getElementById('form-register'),
    formRecover: document.getElementById('form-recover'),
    
    // View containers
    views: document.querySelectorAll('.app-view'),
    navItems: document.querySelectorAll('.nav-item'),
    
    // Selectores del Header
    headerMonthSelect: document.getElementById('header-month-select'),
    btnPrivacyMode: document.getElementById('btn-privacy-mode'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    btnNotifications: document.getElementById('btn-notifications'),
    notificationsDropdown: document.getElementById('notifications-dropdown'),
    notificationsList: document.getElementById('notifications-list'),
    notifBadge: document.getElementById('notif-badge'),
    
    // Modal PIN y Comprobantes
    pinPromptDialog: document.getElementById('pin-prompt-dialog'),
    formVerifyPinPrompt: document.getElementById('form-verify-pin-prompt'),
    pinInputPrompt: document.getElementById('pin-input-prompt'),
    btnCancelPinPrompt: document.getElementById('btn-cancel-pin-prompt'),
    
    uploadReceiptDialog: document.getElementById('upload-receipt-dialog'),
    formUploadReceipt: document.getElementById('form-upload-receipt'),
    receiptFileInput: document.getElementById('receipt-file-input'),
    btnCancelReceiptDialog: document.getElementById('btn-cancel-receipt-dialog'),
    fileDragLabel: document.getElementById('file-drag-label'),
    
    transactionDetailDialog: document.getElementById('transaction-detail-dialog'),
    detailDialogBody: document.getElementById('detail-dialog-body'),
    btnCloseDetailDialog: document.getElementById('btn-close-detail-dialog'),
    
    debtPayDialog: document.getElementById('debt-pay-dialog'),
    formDebtPay: document.getElementById('form-debt-pay'),
    btnCancelDebtPay: document.getElementById('btn-cancel-debt-pay')
  };

  // ==========================================
  // ENRUTADOR DEL LADO DEL CLIENTE (SPA)
  // ==========================================
  function router() {
    const hash = window.location.hash || '#dashboard';
    
    // Si no está autenticado, forzar pantalla de login/registro/recuperación
    if (!state.user) {
      els.appContainer.classList.add('hidden');
      els.authContainer.classList.remove('hidden');
      
      if (hash === '#register') {
        showAuthView('register');
      } else if (hash === '#recover') {
        showAuthView('recover');
      } else {
        showAuthView('login');
      }
      return;
    }

    // Usuario autenticado, mostrar contenedor principal
    els.authContainer.classList.add('hidden');
    els.appContainer.classList.remove('hidden');
    
    // Desactivar todas las vistas y clases activas
    els.views.forEach(v => v.classList.remove('active-view'));
    els.navItems.forEach(n => n.classList.remove('active'));

    // Mapear hash a ID de sección
    let targetViewId = 'view-dashboard';
    let targetNavId = 'nav-dashboard';

    if (hash === '#config-mes') { targetViewId = 'view-config-mes'; targetNavId = 'nav-config-mes'; }
    else if (hash === '#ingresos') { targetViewId = 'view-ingresos'; targetNavId = 'nav-ingresos'; }
    else if (hash === '#gastos') { targetViewId = 'view-gastos'; targetNavId = 'nav-gastos'; }
    else if (hash === '#tarjetas') { targetViewId = 'view-tarjetas'; targetNavId = 'nav-tarjetas'; }
    else if (hash === '#categorias') { targetViewId = 'view-categorias'; targetNavId = 'nav-categorias'; }
    else if (hash === '#recurrentes') { targetViewId = 'view-recurrentes'; targetNavId = 'nav-recurrentes'; }
    else if (hash === '#deudas') { targetViewId = 'view-deudas'; targetNavId = 'nav-deudas'; }
    else if (hash === '#metas') { targetViewId = 'view-metas'; targetNavId = 'nav-metas'; }
    else if (hash === '#calendario') { targetViewId = 'view-calendario'; targetNavId = 'nav-calendario'; }
    else if (hash === '#comprobantes') { targetViewId = 'view-comprobantes'; targetNavId = 'nav-comprobantes'; }
    else if (hash === '#reportes') { targetViewId = 'view-reportes'; targetNavId = 'nav-reportes'; }
    else if (hash === '#actividad') { targetViewId = 'view-actividad'; targetNavId = 'nav-actividad'; }
    else if (hash === '#configuracion') { targetViewId = 'view-configuracion'; targetNavId = 'nav-configuracion'; }

    // Proteger secciones sensibles si hay un PIN configurado
    if (state.user.hasPin && ['view-tarjetas', 'view-deudas', 'view-configuracion', 'view-reportes'].includes(targetViewId)) {
      // Verificar si ya fue verificado este PIN en la sesión actual
      if (!sessionStorage.getItem('pin_verified')) {
        promptForPIN(() => {
          // Callback éxito
          sessionStorage.setItem('pin_verified', 'true');
          activateView(targetViewId, targetNavId);
        }, () => {
          // Callback cancelación
          window.location.hash = '#dashboard';
        });
        return;
      }
    }

    activateView(targetViewId, targetNavId);
  }

  function activateView(viewId, navId) {
    const viewEl = document.getElementById(viewId);
    const navEl = document.getElementById(navId);
    if (viewEl) viewEl.classList.add('active-view');
    if (navEl) navEl.classList.add('active');
    
    // Cargar información de la vista específica
    triggerViewLoad(viewId);
    
    // Cerrar sidebar en móvil al cambiar de vista
    els.sidebar.classList.remove('open');
  }

  function showAuthView(viewName) {
    els.loginView.classList.add('hidden');
    els.registerView.classList.add('hidden');
    els.recoverView.classList.add('hidden');

    if (viewName === 'register') els.registerView.classList.remove('hidden');
    else if (viewName === 'recover') els.recoverView.classList.remove('hidden');
    else els.loginView.classList.remove('hidden');
  }

  // Escuchar cambios de ruta
  window.addEventListener('hashchange', router);

  // ==========================================
  // MANEJO DE PIN DE SEGURIDAD (DIÁLOGO)
  // ==========================================
  let pinSuccessCallback = null;
  let pinCancelCallback = null;

  function promptForPIN(onSuccess, onCancel) {
    pinSuccessCallback = onSuccess;
    pinCancelCallback = onCancel;
    
    document.getElementById('pin-error-msg').classList.add('hidden');
    els.pinInputPrompt.value = '';
    els.pinPromptDialog.classList.remove('hidden');
    els.pinInputPrompt.focus();
  }

  els.formVerifyPinPrompt.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = els.pinInputPrompt.value;
    
    try {
      const res = await apiCall('/api/auth/verify-pin', 'POST', { pin });
      if (res.success) {
        els.pinPromptDialog.classList.add('hidden');
        if (pinSuccessCallback) pinSuccessCallback();
      }
    } catch (err) {
      const errBanner = document.getElementById('pin-error-msg');
      errBanner.textContent = err.error || 'PIN incorrecto.';
      errBanner.classList.remove('hidden');
    }
  });

  els.btnCancelPinPrompt.addEventListener('click', () => {
    els.pinPromptDialog.classList.add('hidden');
    if (pinCancelCallback) pinCancelCallback();
  });

  // ==========================================
  // CONFIGURACIÓN DE APIS (LLAMADAS AJAX)
  // ==========================================
  function sanitizeTypes(data) {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) {
      return data.map(item => sanitizeTypes(item));
    }
    if (typeof data === 'object') {
      const numericKeys = [
        'id', 'user_id', 'month_config_id', 'category_id', 'subcategory_id', 'account_id', 'transaction_id',
        'month', 'year', 'initial_budget', 'initial_balance', 'saving_goal', 'amount', 'total_amount',
        'paid_amount', 'saved_amount', 'target_amount', 'installment_value', 'credit_limit', 'file_size',
        'cycle_start_day', 'cycle_end_day', 'cut_off_day', 'due_day', 'installments_total', 'installments_paid'
      ];
      const result = {};
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          let val = data[key];
          if (numericKeys.includes(key) && val !== null && val !== '') {
            result[key] = Number(val);
          } else if (typeof val === 'object') {
            result[key] = sanitizeTypes(val);
          } else {
            result[key] = val;
          }
        }
      }
      return result;
    }
    return data;
  }

  async function apiCall(url, method = 'GET', data = null, isMultipart = false) {
    let phpUrl = '/api/index.php';
    let action = '';
    let params = [];

    // Parsear rutas estilo Express a acciones PHP
    if (url.startsWith('/api/auth/register')) action = 'register';
    else if (url.startsWith('/api/auth/login')) action = 'login';
    else if (url.startsWith('/api/auth/logout')) action = 'logout';
    else if (url.startsWith('/api/auth/me')) action = 'me';
    else if (url.startsWith('/api/auth/verify-pin')) action = 'verify-pin';
    else if (url.startsWith('/api/auth/change-pin')) action = 'change-pin';
    else if (url.startsWith('/api/auth/change-password')) action = 'change-password';
    else if (url.startsWith('/api/auth/recover-password')) action = 'recover-password';
    else if (url.startsWith('/api/auth/update-profile')) action = 'update-profile';
    else if (url.startsWith('/api/months/compare')) {
      action = 'compare_months';
      const q = url.split('?')[1];
      if (q) params.push(q);
    }
    else if (url.startsWith('/api/months/')) {
      const parts = url.split('/');
      const id = parts[3];
      if (parts[4] === 'close') {
        action = 'close_month';
      } else {
        action = 'update_month';
      }
      params.push(`id=${id}`);
    }
    else if (url.startsWith('/api/months')) {
      action = method === 'POST' ? 'create_month' : 'get_months';
    }
    else if (url.startsWith('/api/accounts/')) {
      const id = url.split('/')[3];
      action = method === 'DELETE' ? 'delete_account' : 'update_account';
      params.push(`id=${id}`);
    }
    else if (url.startsWith('/api/accounts')) {
      action = method === 'POST' ? 'create_account' : 'get_accounts';
    }
    else if (url.startsWith('/api/categories/')) {
      const id = url.split('/')[3];
      action = method === 'DELETE' ? 'delete_category' : 'update_category';
      params.push(`id=${id}`);
    }
    else if (url.startsWith('/api/categories')) {
      action = method === 'POST' ? 'create_category' : 'get_categories';
    }
    else if (url.startsWith('/api/incomes/')) {
      const id = url.split('/')[3];
      action = method === 'DELETE' ? 'delete_income' : 'update_income';
      params.push(`id=${id}`);
    }
    else if (url.startsWith('/api/incomes')) {
      action = method === 'POST' ? 'create_income' : 'get_incomes';
      const q = url.split('?')[1];
      if (q) params.push(q);
    }
    else if (url.startsWith('/api/expenses/')) {
      const id = url.split('/')[3];
      action = method === 'DELETE' ? 'delete_expense' : 'update_expense';
      params.push(`id=${id}`);
    }
    else if (url.startsWith('/api/expenses')) {
      action = method === 'POST' ? 'create_expense' : 'get_expenses';
      const q = url.split('?')[1];
      if (q) params.push(q);
    }
    else if (url.startsWith('/api/receipts/upload')) action = 'upload_receipt';
    else if (url.startsWith('/api/receipts')) action = 'delete_receipt';
    else if (url.startsWith('/api/savings/')) {
      const id = url.split('/')[3];
      action = method === 'DELETE' ? 'delete_saving' : 'update_saving';
      params.push(`id=${id}`);
    }
    else if (url.startsWith('/api/savings')) {
      action = method === 'POST' ? 'create_saving' : 'get_savings';
    }
    else if (url.startsWith('/api/debts/')) {
      const parts = url.split('/');
      const id = parts[3];
      if (parts[4] === 'pay') {
        action = 'pay_debt';
      } else {
        action = method === 'DELETE' ? 'delete_debt' : 'update_debt';
      }
      params.push(`id=${id}`);
    }
    else if (url.startsWith('/api/debts')) {
      action = method === 'POST' ? 'create_debt' : 'get_debts';
    }
    else if (url.startsWith('/api/recurring/')) {
      const id = url.split('/')[3];
      action = method === 'DELETE' ? 'delete_recurring' : 'update_recurring';
      params.push(`id=${id}`);
    }
    else if (url.startsWith('/api/recurring')) {
      action = method === 'POST' ? 'create_recurring' : 'get_recurring';
    }
    else if (url.startsWith('/api/activity')) action = 'get_activity';
    else if (url.startsWith('/api/backup/export')) action = 'export_backup';
    else if (url.startsWith('/api/backup/import')) action = 'import_backup';

    // Armar URL con la accion de consulta de PHP
    params.unshift(`action=${action}`);
    phpUrl += '?' + params.join('&');

    // Forzar el metodo POST si se suben archivos (en PHP la subida requiere POST nativo)
    const options = {
      method: isMultipart ? 'POST' : method,
      headers: {}
    };

    if (data && !isMultipart) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(data);
    } else if (data && isMultipart) {
      options.body = data;
    }

    const response = await fetch(phpUrl, options);
    
    if (response.status === 410) {
      state.user = null;
      sessionStorage.clear();
      router();
      throw new Error('Sesión expirada');
    }

    const result = await response.json();
    if (!response.ok) {
      throw result;
    }
    return sanitizeTypes(result);
  }

  // ==========================================
  // LOGIN / REGISTRO / SEGURIDAD EVENTOS
  // ==========================================
  
  // Login
  els.formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error-msg');
    
    errorEl.classList.add('hidden');
    try {
      const res = await apiCall('/api/auth/login', 'POST', { email, password });
      state.user = res.user;
      
      // Inicializar app
      await bootstrapApp();
      window.location.hash = '#dashboard';
      router();
    } catch (err) {
      errorEl.textContent = err.error || 'Error al iniciar sesión.';
      errorEl.classList.remove('hidden');
    }
  });

  // Mostrar / Ocultar Password en Login
  document.getElementById('btn-login-toggle-pass').addEventListener('click', () => {
    const passInput = document.getElementById('login-password');
    const icon = document.querySelector('#btn-login-toggle-pass i');
    if (passInput.type === 'password') {
      passInput.type = 'text';
      icon.setAttribute('data-lucide', 'eye-off');
    } else {
      passInput.type = 'password';
      icon.setAttribute('data-lucide', 'eye');
    }
    lucide.createIcons();
  });

  // Registro
  els.formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const errEl = document.getElementById('register-error-msg');
    const succEl = document.getElementById('register-success-msg');
    
    errEl.classList.add('hidden');
    succEl.classList.add('hidden');

    try {
      const res = await apiCall('/api/auth/register', 'POST', { name, email, password });
      succEl.textContent = res.message;
      succEl.classList.remove('hidden');
      els.formRegister.reset();
      setTimeout(() => {
        window.location.hash = '#login';
      }, 1500);
    } catch (err) {
      errEl.textContent = err.error || 'Error al registrar usuario.';
      errEl.classList.remove('hidden');
    }
  });

  // Recuperar contraseña
  els.formRecover.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('rec-email-field').value;
    const pin = document.getElementById('rec-pin-field').value;
    const newPassword = document.getElementById('rec-new-pass').value;
    const errEl = document.getElementById('recover-error-msg');
    const succEl = document.getElementById('recover-success-msg');
    
    errEl.classList.add('hidden');
    succEl.classList.add('hidden');

    try {
      const res = await apiCall('/api/auth/recover-password', 'POST', { email, pin, newPassword });
      succEl.textContent = res.message;
      succEl.classList.remove('hidden');
      els.formRecover.reset();
      setTimeout(() => {
        window.location.hash = '#login';
      }, 2000);
    } catch (err) {
      errEl.textContent = err.error || 'PIN o correo incorrectos.';
      errEl.classList.remove('hidden');
    }
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
      await apiCall('/api/auth/logout', 'POST');
    } catch (e) {}
    state.user = null;
    sessionStorage.clear();
    window.location.hash = '#login';
    router();
  });

  // Alternar Menu Lateral en Móvil
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  function openSidebar() {
    els.sidebar.classList.add('open');
    if (sidebarOverlay) sidebarOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    els.sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  els.btnToggleMenu.addEventListener('click', () => {
    if (els.sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }

  // Cerrar sidebar al seleccionar un ítem de navegación en móvil
  els.navItems.forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 900) closeSidebar();
    });
  });

  // ==========================================
  // MODO PRIVACIDAD E HIDE VALORES
  // ==========================================
  els.btnPrivacyMode.addEventListener('click', () => {
    state.privacyMode = !state.privacyMode;
    localStorage.setItem('privacy_mode', state.privacyMode ? 'true' : 'false');
    applyPrivacyMode();
  });

  function applyPrivacyMode() {
    const icon = document.getElementById('privacy-icon');
    const sensitiveElements = document.querySelectorAll('.amount-sensitive');
    
    if (state.privacyMode) {
      icon.setAttribute('data-lucide', 'eye-off');
      sensitiveElements.forEach(el => el.classList.add('privacy-masked'));
      els.btnPrivacyMode.classList.add('active');
    } else {
      icon.setAttribute('data-lucide', 'eye');
      sensitiveElements.forEach(el => el.classList.remove('privacy-masked'));
      els.btnPrivacyMode.classList.remove('active');
    }
    lucide.createIcons();
  }

  // ==========================================
  // CONFIGURACIÓN DE MODO OSCURO
  // ==========================================
  els.btnThemeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode', !isDark);
    localStorage.setItem('theme_dark', isDark ? 'true' : 'false');
    updateThemeIcon(isDark);
    refreshCharts(); // Rehacer gráficos con colores de tema corregidos
  });

  function updateThemeIcon(isDark) {
    const icon = document.getElementById('theme-icon');
    if (isDark) {
      icon.setAttribute('data-lucide', 'sun');
    } else {
      icon.setAttribute('data-lucide', 'moon');
    }
    lucide.createIcons();
  }

  // ==========================================
  // BOOTSTRAP: INICIALIZAR LA APLICACIÓN
  // ==========================================
  async function bootstrapApp() {
    // Cargar Tema
    const cachedTheme = localStorage.getItem('theme_dark') === 'true';
    document.body.classList.toggle('dark-mode', cachedTheme);
    document.body.classList.toggle('light-mode', !cachedTheme);
    updateThemeIcon(cachedTheme);

    // Cargar Modo Privacidad
    state.privacyMode = localStorage.getItem('privacy_mode') === 'true';
    
    // Mostrar información visual del usuario en el Sidebar
    if (state.user) {
      document.getElementById('sidebar-user-name').textContent = state.user.name;
      document.getElementById('sidebar-avatar').textContent = state.user.name.charAt(0).toUpperCase();
    }

    // Obtener datos iniciales del usuario
    await loadUserConfigs();
  }

  async function loadUserConfigs() {
    try {
      // Cargar configuraciones del mes
      state.months = await apiCall('/api/months');
      
      if (state.months.length > 0) {
        // Rellenar selector de meses
        populateMonthSelector();
        
        // Cargar mes más reciente por defecto si no hay activo
        if (!state.activeMonthId) {
          state.activeMonthId = state.months[0].id;
          state.activeMonthConfig = state.months[0];
        } else {
          state.activeMonthConfig = state.months.find(m => m.id === state.activeMonthId);
        }
        els.headerMonthSelect.value = state.activeMonthId;
      } else {
        // Redirigir a configuración de mes para crear el primero
        window.location.hash = '#config-mes';
      }

      // Cargar categorías y cuentas globales
      state.categories = await apiCall('/api/categories');
      state.accounts = await apiCall('/api/accounts');
      
      // Poblar formularios con categorías y cuentas
      populateFormSelectors();
      
      // Aplicar privacidad
      applyPrivacyMode();
    } catch (err) {
      console.error('Error al inicializar configuraciones:', err);
    }
  }

  function populateMonthSelector() {
    els.headerMonthSelect.innerHTML = '';
    const compSelector1 = document.getElementById('compare-month-1');
    const compSelector2 = document.getElementById('compare-month-2');
    
    if (compSelector1) compSelector1.innerHTML = '';
    if (compSelector2) compSelector2.innerHTML = '';

    state.months.forEach(m => {
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const optText = `${monthNames[m.month - 1]} ${m.year} ${m.is_closed ? '(Cerrado)' : ''}`;
      
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = optText;
      els.headerMonthSelect.appendChild(opt);

      // Selectores de comparativa
      if (compSelector1 && compSelector2) {
        const opt1 = opt.cloneNode(true);
        const opt2 = opt.cloneNode(true);
        compSelector1.appendChild(opt1);
        compSelector2.appendChild(opt2);
      }
    });
  }

  function populateFormSelectors() {
    const catsSelects = [
      document.getElementById('inc-category'),
      document.getElementById('exp-category'),
      document.getElementById('rec-category'),
      document.getElementById('filter-exp-category')
    ];
    const accsSelects = [
      document.getElementById('inc-account'),
      document.getElementById('exp-account'),
      document.getElementById('rec-account'),
      document.getElementById('debt-pay-account')
    ];

    catsSelects.forEach(sel => {
      if (!sel) return;
      const isFilter = sel.id.startsWith('filter');
      sel.innerHTML = isFilter ? '<option value="">Todas las Categorías</option>' : '<option value="">Ninguna</option>';
      state.categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        sel.appendChild(opt);
      });
    });

    accsSelects.forEach(sel => {
      if (!sel) return;
      sel.innerHTML = '<option value="">Seleccionar cuenta...</option>';
      state.accounts.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.name} (${a.type.replace('_', ' ')}) - $${Number(a.initial_balance).toFixed(2)}`;
        sel.appendChild(opt);
      });
    });

    // Poblar selector de cuenta padre (para vincular tarjetas)
    const parentAccSelect = document.getElementById('acc-parent-id');
    if (parentAccSelect) {
      parentAccSelect.innerHTML = '<option value="">Ninguna (Cuenta/Tarjeta Independiente)</option>';
      state.accounts.forEach(a => {
        // Solo vincular a cuentas que no sean de crédito
        if (a.type !== 'credito' && a.type !== 'tarjeta_credito') {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = `${a.name} (${getAccountTypeDetails(a.type).label})`;
          parentAccSelect.appendChild(opt);
        }
      });
    }
  }

  // Cambio de mes financiero activo
  els.headerMonthSelect.addEventListener('change', async (e) => {
    state.activeMonthId = parseInt(e.target.value);
    state.activeMonthConfig = state.months.find(m => m.id === state.activeMonthId);
    
    // Recargar datos y refrescar vista activa
    await loadMonthData();
    router();
  });

  async function loadMonthData() {
    if (!state.activeMonthId) return;
    try {
      state.incomes = await apiCall(`/api/incomes?monthConfigId=${state.activeMonthId}`);
      state.expenses = await apiCall(`/api/expenses?monthConfigId=${state.activeMonthId}`);
      state.debts = await apiCall('/api/debts');
      state.savings = await apiCall('/api/savings');
      state.recurring = await apiCall('/api/recurring');
      
      // Recargar saldo y cuentas actualizados
      state.accounts = await apiCall('/api/accounts');
      populateFormSelectors();
      
      // Procesar alertas inteligentes
      processSmartAlerts();
    } catch (err) {
      console.error('Error al cargar datos del mes:', err);
    }
  }

  // ==========================================
  // LOGICA CARGA DE VISTAS (SPA DETALLES)
  // ==========================================
  async function triggerViewLoad(viewId) {
    if (!state.activeMonthId && viewId !== 'view-config-mes') {
      window.location.hash = '#config-mes';
      return;
    }

    // Asegurarse de tener cargados los datos del mes antes de pintar la pantalla
    await loadMonthData();

    switch (viewId) {
      case 'view-dashboard':
        renderDashboard();
        break;
      case 'view-config-mes':
        renderConfigMes();
        break;
      case 'view-ingresos':
        renderIngresos();
        break;
      case 'view-gastos':
        renderGastos();
        break;
      case 'view-tarjetas':
        renderTarjetas();
        break;
      case 'view-categorias':
        renderCategorias();
        break;
      case 'view-recurrentes':
        renderRecurrentes();
        break;
      case 'view-deudas':
        renderDeudas();
        break;
      case 'view-metas':
        renderSavings();
        break;
      case 'view-calendario':
        renderCalendario();
        break;
      case 'view-comprobantes':
        renderComprobantes();
        break;
      case 'view-reportes':
        renderReportes();
        break;
      case 'view-actividad':
        renderActividad();
        break;
      case 'view-configuracion':
        renderConfiguracion();
        break;
    }
    
    // Aplicar privacidad después de pintar cualquier vista
    applyPrivacyMode();
  }

  // ==========================================
  // PANTALLA: DASHBOARD
  // ==========================================
  function renderDashboard() {
    const initialBudget = state.activeMonthConfig.initial_budget;
    const totalIncomes = state.incomes.reduce((acc, i) => i.status === 'recibido' ? acc + i.amount : acc, 0);
    const totalExpenses = state.expenses.reduce((acc, e) => e.status === 'pagado' ? acc + e.amount : acc, 0);
    const pendingExpenses = state.expenses.reduce((acc, e) => e.status === 'pendiente' ? acc + e.amount : acc, 0);
    const cashPayments = state.expenses.reduce((acc, e) => (e.status === 'pagado' && e.payment_method === 'efectivo') ? acc + e.amount : acc, 0);
    
    const availableBalance = state.activeMonthConfig.initial_balance + totalIncomes - totalExpenses;
    const savingGoal = state.activeMonthConfig.saving_goal;
    const savingsSaved = state.savings.reduce((acc, s) => acc + s.saved_amount, 0);
    
    // Safe-to-Spend (Dinero Libre de Culpa)
    const safeToSpend = availableBalance - pendingExpenses - savingGoal;

    // KPI UI Updates
    document.getElementById('kpi-initial-budget').textContent = formatCurrency(initialBudget);
    document.getElementById('kpi-total-incomes').textContent = formatCurrency(totalIncomes);
    document.getElementById('kpi-total-expenses').textContent = formatCurrency(totalExpenses);
    document.getElementById('kpi-available-balance').textContent = formatCurrency(availableBalance);
    
    // Set Safe-to-Spend KPI Card values
    const safeToSpendEl = document.getElementById('kpi-safe-to-spend');
    const safeToSpendStatus = document.getElementById('kpi-safe-to-spend-status');
    if (safeToSpendEl) {
      safeToSpendEl.textContent = formatCurrency(safeToSpend);
      if (safeToSpend > 0) {
        safeToSpendStatus.textContent = "Libre de deudas y ahorros";
        safeToSpendStatus.style.color = "#10B981";
      } else if (safeToSpend === 0) {
        safeToSpendStatus.textContent = "En el límite justo del mes";
        safeToSpendStatus.style.color = "var(--text-muted)";
      } else {
        safeToSpendStatus.textContent = "Presupuesto del mes comprometido";
        safeToSpendStatus.style.color = "var(--color-danger)";
      }
    }
    
    // Secondary KPIs
    document.getElementById('kpi-month-saving').textContent = formatCurrency(savingsSaved);
    document.getElementById('kpi-pending-expenses').textContent = formatCurrency(pendingExpenses);
    document.getElementById('kpi-cash-payments').textContent = formatCurrency(cashPayments);

    // Progreso del presupuesto usado
    const expensePct = initialBudget > 0 ? Math.min(100, (totalExpenses / initialBudget) * 100) : 0;
    const progressBar = document.getElementById('kpi-expense-progress');
    progressBar.style.width = `${expensePct}%`;
    document.getElementById('kpi-expense-pct').textContent = `${Number(expensePct).toFixed(0)}% usado`;
    
    if (expensePct > 90) progressBar.style.backgroundColor = 'var(--color-danger)';
    else if (expensePct > 75) progressBar.style.backgroundColor = 'var(--color-warning)';
    else progressBar.style.backgroundColor = 'var(--color-primary)';

    // Income Pct
    const incomePct = initialBudget > 0 ? (totalIncomes / initialBudget) * 100 : 0;
    document.getElementById('kpi-income-pct').textContent = `${Number(incomePct).toFixed(0)}% del presupuesto mensual`;

    // Tarjeta más usada
    const cardUsage = {};
    state.expenses.forEach(e => {
      if (e.account_id && e.account_name) {
        cardUsage[e.account_name] = (cardUsage[e.account_name] || 0) + e.amount;
      }
    });
    let topCard = 'Ninguna';
    let maxCardAmt = 0;
    for (const card in cardUsage) {
      if (cardUsage[card] > maxCardAmt) {
        maxCardAmt = cardUsage[card];
        topCard = card;
      }
    }
    document.getElementById('kpi-top-card').textContent = topCard;

    // Categoría más consumida
    const catUsage = {};
    state.expenses.forEach(e => {
      if (e.category_name) {
        catUsage[e.category_name] = (catUsage[e.category_name] || 0) + e.amount;
      }
    });
    let topCat = 'Ninguna';
    let maxCatAmt = 0;
    for (const cat in catUsage) {
      if (catUsage[cat] > maxCatAmt) {
        maxCatAmt = catUsage[cat];
        topCat = cat;
      }
    }
    document.getElementById('kpi-top-category').textContent = topCat;

    // Promedio Diario basado en tiempo transcurrido real
    const now = new Date();
    const activeMonth = state.activeMonthConfig.month;
    const activeYear = state.activeMonthConfig.year;
    const daysInMonth = getDaysInMonth(activeMonth, activeYear);
    
    let elapsedDays = daysInMonth;
    if (now.getFullYear() === activeYear && (now.getMonth() + 1) === activeMonth) {
      elapsedDays = now.getDate();
    } else if (now.getFullYear() < activeYear || (now.getFullYear() === activeYear && (now.getMonth() + 1) < activeMonth)) {
      elapsedDays = 0; // Periodo futuro
    }
    const currentDay = elapsedDays > 0 ? elapsedDays : 1;
    const realDailyAverage = totalExpenses / currentDay;
    const projectedExpenses = realDailyAverage * daysInMonth;
    
    document.getElementById('kpi-daily-average').textContent = formatCurrency(realDailyAverage);

    // Calcular desviación y proyecciones
    const timeProgress = (currentDay / daysInMonth) * 100;
    const budgetProgress = initialBudget > 0 ? (totalExpenses / initialBudget) * 100 : 0;

    // Microahorros acumulados estimados por redondeo
    let potentialRoundupSavings = 0;
    state.expenses.forEach(e => {
      if (e.status === 'pagado') {
        const amt = Number(e.amount);
        const rounded = Math.ceil(amt);
        potentialRoundupSavings += (rounded - amt);
      }
    });

    // Pintar Panel Inteligente de Asistente Aura
    const auraContainer = document.getElementById('aura-insights-container');
    if (auraContainer) {
      auraContainer.innerHTML = '';
      
      // Insight 1: Proyección de Fin de Mes
      const cardProj = document.createElement('div');
      cardProj.className = 'aura-insight-item';
      cardProj.style.background = 'var(--bg-card)';
      cardProj.style.padding = '1rem';
      cardProj.style.borderRadius = 'var(--radius-sm)';
      cardProj.style.border = '1px solid var(--border-color)';
      
      let projText = '';
      let projIcon = '';
      let projColor = '';
      if (projectedExpenses > initialBudget) {
        const diff = projectedExpenses - initialBudget;
        projText = `<strong>Riesgo de Sobregasto</strong>: Al ritmo actual de gasto ($${formatCurrency(realDailyAverage)}/día), terminarás el mes con un gasto proyectado de <strong>${formatCurrency(projectedExpenses)}</strong>, superando tu presupuesto inicial por <strong>${formatCurrency(diff)}</strong>.`;
        projIcon = 'trending-up';
        projColor = 'var(--color-danger)';
      } else {
        const savings = initialBudget - projectedExpenses;
        projText = `<strong>Presupuesto Saludable</strong>: Tu proyección para fin de mes es de <strong>${formatCurrency(projectedExpenses)}</strong>, lo que te permitirá ahorrar <strong>${formatCurrency(savings)}</strong> de tu presupuesto original de <strong>${formatCurrency(initialBudget)}</strong>.`;
        projIcon = 'trending-down';
        projColor = 'var(--color-success)';
      }
      
      cardProj.innerHTML = `
        <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
          <div style="background: ${projColor}15; color: ${projColor}; padding: 0.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <i data-lucide="${projIcon}" style="width: 18px; height: 18px;"></i>
          </div>
          <div>
            <h4 style="margin: 0 0 0.25rem 0; font-family: var(--font-headings); font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Proyección Mensual</h4>
            <p style="margin: 0; font-size: 0.8rem; line-height: 1.4; color: var(--text-muted);">${projText}</p>
          </div>
        </div>
      `;
      auraContainer.appendChild(cardProj);
      
      // Insight 2: Desviación del Ciclo
      const cardDev = document.createElement('div');
      cardDev.className = 'aura-insight-item';
      cardDev.style.background = 'var(--bg-card)';
      cardDev.style.padding = '1rem';
      cardDev.style.borderRadius = 'var(--radius-sm)';
      cardDev.style.border = '1px solid var(--border-color)';
      
      let devText = '';
      let devIcon = '';
      let devColor = '';
      if (budgetProgress > timeProgress + 15) {
        devText = `<strong>Consumo Acelerado</strong>: Has consumido el <strong>${Number(budgetProgress).toFixed(0)}%</strong> de tu presupuesto en solo el <strong>${Number(timeProgress).toFixed(0)}%</strong> del tiempo mensual. Moderar los gastos variables es una excelente recomendación.`;
        devIcon = 'alert-triangle';
        devColor = 'var(--color-warning)';
      } else if (budgetProgress <= timeProgress + 15 && budgetProgress > timeProgress) {
        devText = `<strong>Gasto Estable</strong>: Tu ritmo de gasto está ligeramente por encima de la media del tiempo transcurrido (consumido: <strong>${Number(budgetProgress).toFixed(0)}%</strong>, tiempo: <strong>${Number(timeProgress).toFixed(0)}%</strong>). Vas por buen camino, mantente atento.`;
        devIcon = 'info';
        devColor = 'var(--color-primary)';
      } else {
        devText = `<strong>Excelente Control</strong>: Tu ritmo de gasto está por debajo del promedio del tiempo transcurrido (consumido: <strong>${Number(budgetProgress).toFixed(0)}%</strong>, tiempo transcurrido: <strong>${Number(timeProgress).toFixed(0)}%</strong>). ¡Sigue así!`;
        devIcon = 'check-circle';
        devColor = 'var(--color-success)';
      }
      
      cardDev.innerHTML = `
        <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
          <div style="background: ${devColor}15; color: ${devColor}; padding: 0.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <i data-lucide="${devIcon}" style="width: 18px; height: 18px;"></i>
          </div>
          <div>
            <h4 style="margin: 0 0 0.25rem 0; font-family: var(--font-headings); font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Desviación del Ciclo</h4>
            <p style="margin: 0; font-size: 0.8rem; line-height: 1.4; color: var(--text-muted);">${devText}</p>
          </div>
        </div>
      `;
      auraContainer.appendChild(cardDev);

      // Insight 3: Tip de Microahorros
      const cardSavingsTip = document.createElement('div');
      cardSavingsTip.className = 'aura-insight-item';
      cardSavingsTip.style.background = 'var(--bg-card)';
      cardSavingsTip.style.padding = '1rem';
      cardSavingsTip.style.borderRadius = 'var(--radius-sm)';
      cardSavingsTip.style.border = '1px solid var(--border-color)';
      
      cardSavingsTip.innerHTML = `
        <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
          <div style="background: #E0F2FE; color: #0284C7; padding: 0.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <i data-lucide="piggy-bank" style="width: 18px; height: 18px;"></i>
          </div>
          <div>
            <h4 style="margin: 0 0 0.25rem 0; font-family: var(--font-headings); font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Ahorro de Redondeo</h4>
            <p style="margin: 0; font-size: 0.8rem; line-height: 1.4; color: var(--text-muted);">
              <strong>Redondeo de Gastos</strong>: Si redondeas cada uno de tus gastos de este mes al siguiente dólar, habrías acumulado un total de <strong>${formatCurrency(potentialRoundupSavings)}</strong> de ahorro pasivo adicional.
            </p>
          </div>
        </div>
      `;
      auraContainer.appendChild(cardSavingsTip);

      lucide.createIcons();
    }

    // Pintar Regla de Oro 50/30/20
    renderRule503020(initialBudget, totalIncomes);

    // Pintar Gráficos
    drawDashboardCharts();
  }

  function renderRule503020(initialBudget, totalIncomes) {
    const ruleBase = totalIncomes > 0 ? totalIncomes : initialBudget;

    const target50 = ruleBase * 0.50;
    const target30 = ruleBase * 0.30;
    const target20 = ruleBase * 0.20;

    let spent50 = 0;
    let spent30 = 0;
    let spent20 = 0;

    state.expenses.forEach(e => {
      if (e.status === 'pagado') {
        const cat = state.categories.find(c => c.id === e.category_id);
        const type = cat ? cat.rule_type : 'deseo';
        
        if (type === 'necesidad') {
          spent50 += e.amount;
        } else if (type === 'ahorro') {
          spent20 += e.amount;
        } else {
          spent30 += e.amount;
        }
      }
    });

    const pct50 = target50 > 0 ? Math.min(100, (spent50 / target50) * 100) : 0;
    const pct30 = target30 > 0 ? Math.min(100, (spent30 / target30) * 100) : 0;
    const pct20 = target20 > 0 ? Math.min(100, (spent20 / target20) * 100) : 0;

    const el50t = document.getElementById('rule-50-target-pct');
    const el30t = document.getElementById('rule-30-target-pct');
    const el20t = document.getElementById('rule-20-target-pct');

    if (el50t) el50t.textContent = `Límite: ${formatCurrency(target50)}`;
    if (el30t) el30t.textContent = `Límite: ${formatCurrency(target30)}`;
    if (el20t) el20t.textContent = `Objetivo: ${formatCurrency(target20)}`;

    const el50s = document.getElementById('rule-50-spent');
    const el30s = document.getElementById('rule-30-spent');
    const el20s = document.getElementById('rule-20-spent');

    if (el50s) el50s.textContent = formatCurrency(spent50);
    if (el30s) el30s.textContent = formatCurrency(spent30);
    if (el20s) el20s.textContent = formatCurrency(spent20);

    const el50p = document.getElementById('rule-50-percent');
    const el30p = document.getElementById('rule-30-percent');
    const el20p = document.getElementById('rule-20-percent');

    if (el50p) el50p.textContent = `${((spent50 / (target50 || 1)) * 100).toFixed(0)}%`;
    if (el30p) el30p.textContent = `${((spent30 / (target30 || 1)) * 100).toFixed(0)}%`;
    if (el20p) el20p.textContent = `${((spent20 / (target20 || 1)) * 100).toFixed(0)}%`;

    const p50 = document.getElementById('rule-50-progress');
    const p30 = document.getElementById('rule-30-progress');
    const p20 = document.getElementById('rule-20-progress');

    if (p50) {
      p50.style.width = `${pct50}%`;
      p50.style.backgroundColor = spent50 > target50 ? 'var(--color-danger)' : '#3B82F6';
    }
    if (p30) {
      p30.style.width = `${pct30}%`;
      p30.style.backgroundColor = spent30 > target30 ? 'var(--color-danger)' : '#F59E0B';
    }
    if (p20) {
      p20.style.width = `${pct20}%`;
      p20.style.backgroundColor = spent20 >= target20 ? 'var(--color-success)' : '#10B981';
    }

    let advice = '';
    if (spent50 > target50) {
      advice = '⚠️ <strong>Necesidades Elevadas:</strong> Tus gastos obligatorios superan el 50% recomendado. Considera revisar contratos de servicios, alquiler o compras fijas para liberar flujo.';
    } else if (spent30 > target30) {
      advice = '⚠️ <strong>Deseos Excedidos:</strong> Tus consumos variables de entretenimiento o compras superan el 30%. Moderar salidas a restaurantes o pausar suscripciones digitales ayudará a equilibrarlo.';
    } else if (spent20 < target20) {
      advice = '🌱 <strong>Bajo Ahorro:</strong> Aún no logras destinar el 20% de tus ingresos a deudas, inversión o fondos de emergencia. Utiliza el simulador de microahorros para acumular capital pasivo.';
    } else {
      advice = '🌟 <strong>¡Salud Financiera Excelente!</strong> Tus gastos están en perfecta sintonía con la regla de oro 50/30/20. Sigue administrándote de este modo.';
    }
    const adviceEl = document.getElementById('rule-503020-advice');
    if (adviceEl) adviceEl.innerHTML = advice;
  }

  // Gráficos con Chart.js
  function drawDashboardCharts() {
    // 1. Gráfico Ingresos vs Gastos Acumulados
    const ctxFlow = document.getElementById('chart-income-expense').getContext('2d');
    destroyChart('flow');
    
    state.charts.flow = new Chart(ctxFlow, {
      type: 'bar',
      data: {
        labels: ['Presupuesto', 'Ingresos', 'Gastos'],
        datasets: [{
          data: [
            state.activeMonthConfig.initial_budget,
            state.incomes.reduce((acc, i) => i.status === 'recibido' ? acc + i.amount : acc, 0),
            state.expenses.reduce((acc, e) => e.status === 'pagado' ? acc + e.amount : acc, 0)
          ],
          backgroundColor: ['#4F46E5', '#10B981', '#EF4444'],
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });

    // 2. Gráfico Gastos por Categoría
    const ctxCat = document.getElementById('chart-expenses-category').getContext('2d');
    destroyChart('category');
    
    const catMap = {};
    state.expenses.forEach(e => {
      if (e.status === 'pagado') {
        const catName = e.category_name || 'Sin Categoría';
        catMap[catName] = (catMap[catName] || 0) + e.amount;
      }
    });

    state.charts.category = new Chart(ctxCat, {
      type: 'doughnut',
      data: {
        labels: Object.keys(catMap),
        datasets: [{
          data: Object.values(catMap),
          backgroundColor: ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#6B7280']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { boxWidth: 12 } } }
      }
    });

    // 3. Gráfico Fijos vs Variables
    const ctxType = document.getElementById('chart-fixed-variable').getContext('2d');
    destroyChart('type');
    
    const fixed = state.expenses.reduce((acc, e) => (e.status === 'pagado' && e.expense_type === 'fijo') ? acc + e.amount : acc, 0);
    const variable = state.expenses.reduce((acc, e) => (e.status === 'pagado' && e.expense_type === 'variable') ? acc + e.amount : acc, 0);
    
    state.charts.type = new Chart(ctxType, {
      type: 'pie',
      data: {
        labels: ['Gastos Fijos', 'Gastos Variables'],
        datasets: [{
          data: [fixed, variable],
          backgroundColor: ['#3B82F6', '#F59E0B']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });

    // 4. Saldo diario acumulado
    const ctxBalance = document.getElementById('chart-daily-balance').getContext('2d');
    destroyChart('balance');
    
    const days = getDaysInMonth(state.activeMonthConfig.month, state.activeMonthConfig.year);
    const labels = Array.from({ length: days }, (_, i) => i + 1);
    
    let currentBalance = state.activeMonthConfig.initial_balance;
    const dailyBalances = [];
    
    for (let day = 1; day <= days; day++) {
      const dayStr = `${state.activeMonthConfig.year}-${String(state.activeMonthConfig.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      const dayIncomes = state.incomes.reduce((acc, i) => (i.status === 'recibido' && i.date === dayStr) ? acc + i.amount : acc, 0);
      const dayExpenses = state.expenses.reduce((acc, e) => (e.status === 'pagado' && e.date === dayStr) ? acc + e.amount : acc, 0);
      
      currentBalance += dayIncomes - dayExpenses;
      dailyBalances.push(currentBalance);
    }

    state.charts.balance = new Chart(ctxBalance, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Saldo Disponible',
          data: dailyBalances,
          borderColor: '#4F46E5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: false } }
      }
    });
  }

  function destroyChart(name) {
    if (state.charts[name]) {
      state.charts[name].destroy();
      delete state.charts[name];
    }
  }

  function refreshCharts() {
    if (window.location.hash === '#dashboard' || !window.location.hash) {
      drawDashboardCharts();
    }
  }

  // ==========================================
  // CONFIGURACIÓN DEL MES (VISTA 2)
  // ==========================================
  function renderConfigMes() {
    const form = els.formLogin; // Se usará form-config-mes
    const formConfig = document.getElementById('form-config-mes');
    const tableBody = document.querySelector('#table-months-config tbody');
    
    // Limpiar formulario y precargar mes actual si existe
    formConfig.reset();
    document.getElementById('month-config-id-field').value = '';
    
    if (state.activeMonthConfig) {
      document.getElementById('month-config-id-field').value = state.activeMonthConfig.id;
      document.getElementById('config-month').value = state.activeMonthConfig.month;
      document.getElementById('config-year').value = state.activeMonthConfig.year;
      document.getElementById('config-budget').value = state.activeMonthConfig.initial_budget;
      document.getElementById('config-balance').value = state.activeMonthConfig.initial_balance;
      document.getElementById('config-saving').value = state.activeMonthConfig.saving_goal;
      document.getElementById('config-currency').value = state.activeMonthConfig.currency;
      document.getElementById('config-cycle-start').value = state.activeMonthConfig.cycle_start_day;
      document.getElementById('config-cycle-end').value = state.activeMonthConfig.cycle_end_day;
      document.getElementById('config-notes').value = state.activeMonthConfig.notes;
    } else {
      // Autocompletar con mes/año actual
      const now = new Date();
      document.getElementById('config-month').value = now.getMonth() + 1;
      document.getElementById('config-year').value = now.getFullYear();
      document.getElementById('config-currency').value = '$';
      document.getElementById('config-cycle-start').value = 1;
      document.getElementById('config-cycle-end').value = 28;
    }

    // Cargar tabla de meses
    tableBody.innerHTML = '';
    state.months.forEach(m => {
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${monthNames[m.month - 1]} ${m.year}</strong></td>
        <td>$${Number(m.initial_budget).toFixed(2)}</td>
        <td>$${Number(m.initial_balance).toFixed(2)}</td>
        <td>$${Number(m.saving_goal).toFixed(2)}</td>
        <td>${m.currency}</td>
        <td><span class="badge-premium ${m.is_closed ? 'cancelado' : 'pagado'}">${m.is_closed ? 'Cerrado' : 'Abierto'}</span></td>
        <td>
          <button class="btn-action-table btn-select-month" data-id="${m.id}" title="Seleccionar Mes"><i data-lucide="check"></i></button>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    // Delegación de eventos en tabla meses
    document.querySelectorAll('.btn-select-month').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        state.activeMonthId = id;
        state.activeMonthConfig = state.months.find(m => m.id === id);
        els.headerMonthSelect.value = id;
        await loadMonthData();
        renderConfigMes();
        alertSuccess('Mes financiero cambiado correctamente.');
      });
    });

    lucide.createIcons();
  }

  // Formulario configuración mes submit
  document.getElementById('form-config-mes').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('month-config-id-field').value;
    const data = {
      month: parseInt(document.getElementById('config-month').value),
      year: parseInt(document.getElementById('config-year').value),
      initial_budget: parseFloat(document.getElementById('config-budget').value),
      initial_balance: parseFloat(document.getElementById('config-balance').value),
      saving_goal: parseFloat(document.getElementById('config-saving').value),
      currency: document.getElementById('config-currency').value,
      cycle_start_day: parseInt(document.getElementById('config-cycle-start').value),
      cycle_end_day: parseInt(document.getElementById('config-cycle-end').value),
      notes: document.getElementById('config-notes').value
    };

    try {
      if (id) {
        // Actualizar
        await apiCall(`/api/months/${id}`, 'PUT', data);
        alertSuccess('Configuración de mes actualizada.');
      } else {
        // Crear
        const res = await apiCall('/api/months', 'POST', data);
        state.activeMonthId = res.id;
        alertSuccess('Nuevo mes financiero creado con éxito.');
      }
      await loadUserConfigs();
      await loadMonthData();
      renderConfigMes();
    } catch (err) {
      alertError(err.error || 'Error al guardar configuración.');
    }
  });

  // Cerrar Mes Financiero
  document.getElementById('btn-close-month-action').addEventListener('click', async () => {
    if (!state.activeMonthId) return;
    if (state.activeMonthConfig.is_closed) {
      alertError('Este mes ya está cerrado.');
      return;
    }
    
    if (confirm('¿Está seguro de cerrar el mes financiero? Se bloqueará la edición y se generará el mes siguiente copiando los presupuestos y procesando los cobros recurrentes.')) {
      try {
        const res = await apiCall(`/api/months/${state.activeMonthId}/close`, 'POST');
        alertSuccess(res.message);
        
        // Asignar el mes siguiente como activo
        if (res.nextMonthId) {
          state.activeMonthId = res.nextMonthId;
        }
        await loadUserConfigs();
        await loadMonthData();
        renderConfigMes();
      } catch (err) {
        alertError(err.error || 'Error al cerrar el mes.');
      }
    }
  });

  // ==========================================
  // INGRESOS (VISTA 3)
  // ==========================================
  function renderIngresos() {
    const form = document.getElementById('form-income');
    const tableBody = document.querySelector('#table-incomes tbody');
    
    form.reset();
    document.getElementById('income-id-field').value = '';
    document.getElementById('income-form-title').textContent = 'Registrar Nuevo Ingreso';
    
    // Autocompletar fecha con el día actual
    document.getElementById('inc-date').value = new Date().toISOString().split('T')[0];

    // Pintar tabla
    tableBody.innerHTML = '';
    
    // Aplicar filtros locales de estado y buscador
    const search = document.getElementById('search-incomes').value.toLowerCase();
    const statusFilter = document.getElementById('filter-inc-status').value;

    const filtered = state.incomes.filter(i => {
      const matchSearch = i.source.toLowerCase().includes(search) || (i.description && i.description.toLowerCase().includes(search));
      const matchStatus = statusFilter === '' || i.status === statusFilter;
      return matchSearch && matchStatus;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" class="text-center">No se encontraron ingresos registrados en este mes.</td></tr>';
      return;
    }

    filtered.forEach(i => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDate(i.date)}</td>
        <td><strong>${i.source}</strong><br><small class="text-muted">${i.description || 'Sin descripción'}</small></td>
        <td><span class="badge-premium" style="background-color: var(--color-primary-light); color: var(--color-primary);">${i.category_name || 'Global'}</span></td>
        <td><span style="color: ${i.account_color || 'inherit'}; font-weight: 600;">${i.account_name || 'Efectivo'}</span></td>
        <td>${i.receipt_method}</td>
        <td><strong class="text-success amount-sensitive">$${Number(i.amount).toFixed(2)}</strong></td>
        <td><span class="badge-premium ${i.status}">${i.status}</span></td>
        <td>
          <div class="action-buttons-cell">
            <button class="btn-action-table btn-edit-income" data-id="${i.id}" title="Editar"><i data-lucide="edit-3"></i></button>
            <button class="btn-action-table btn-receipt-income" data-id="${i.id}" data-file="${i.receipt_file || ''}" title="Comprobante"><i data-lucide="${i.receipt_file ? 'file-check' : 'file-warning'}"></i></button>
            <button class="btn-action-table delete btn-delete-income" data-id="${i.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    // Delegación eventos CRUD
    document.querySelectorAll('.btn-edit-income').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        const inc = state.incomes.find(i => i.id === id);
        if (inc) {
          document.getElementById('income-id-field').value = inc.id;
          document.getElementById('inc-date').value = inc.date;
          document.getElementById('inc-amount').value = inc.amount;
          document.getElementById('inc-source').value = inc.source;
          document.getElementById('inc-category').value = inc.category_id || '';
          document.getElementById('inc-method').value = inc.receipt_method;
          document.getElementById('inc-account').value = inc.account_id || '';
          document.getElementById('inc-status').value = inc.status;
          document.getElementById('inc-tag').value = inc.custom_tag || '';
          document.getElementById('inc-desc').value = inc.description || '';
          document.getElementById('income-form-title').textContent = 'Editar Ingreso';
          
          // Desplazar al formulario
          document.getElementById('card-form-income').scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    document.querySelectorAll('.btn-receipt-income').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        const file = e.currentTarget.getAttribute('data-file');
        openReceiptDialog('income', id, file);
      });
    });

    document.querySelectorAll('.btn-delete-income').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('¿Está seguro de eliminar este registro de ingreso? Esto afectará los balances de cuenta asociados.')) {
          const id = parseInt(e.currentTarget.getAttribute('data-id'));
          try {
            await apiCall(`/api/incomes/${id}`, 'DELETE');
            alertSuccess('Ingreso eliminado con éxito.');
            await loadMonthData();
            renderIngresos();
          } catch (err) {
            alertError(err.error || 'Error al eliminar ingreso.');
          }
        }
      });
    });

    lucide.createIcons();
    applyPrivacyMode();
  }

  // Formulario ingreso Submit
  document.getElementById('form-income').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('income-id-field').value;
    const data = {
      month_config_id: state.activeMonthId,
      date: document.getElementById('inc-date').value,
      amount: parseFloat(document.getElementById('inc-amount').value),
      source: document.getElementById('inc-source').value,
      category_id: document.getElementById('inc-category').value || null,
      receipt_method: document.getElementById('inc-method').value,
      account_id: document.getElementById('inc-account').value || null,
      status: document.getElementById('inc-status').value,
      custom_tag: document.getElementById('inc-tag').value,
      description: document.getElementById('inc-desc').value
    };

    try {
      if (id) {
        await apiCall(`/api/incomes/${id}`, 'PUT', data);
        alertSuccess('Ingreso actualizado con éxito.');
      } else {
        await apiCall('/api/incomes', 'POST', data);
        alertSuccess('Ingreso guardado con éxito.');
      }
      await loadMonthData();
      renderIngresos();
    } catch (err) {
      alertError(err.error || 'Error al guardar ingreso.');
    }
  });

  document.getElementById('btn-cancel-income').addEventListener('click', () => {
    renderIngresos();
  });

  // Filtros interactivos ingresos
  document.getElementById('search-incomes').addEventListener('input', renderIngresos);
  document.getElementById('filter-inc-status').addEventListener('change', renderIngresos);

  // ==========================================
  // GASTOS (VISTA 4 - CRUD EXTREMADAMENTE COMPLETO)
  // ==========================================
  function renderGastos() {
    const form = document.getElementById('form-expense');
    const tableBody = document.querySelector('#table-expenses tbody');
    
    form.reset();
    document.getElementById('expense-id-field').value = '';
    document.getElementById('expense-form-title').textContent = 'Registrar Nuevo Gasto';
    document.getElementById('split-options-container').classList.add('hidden');
    
    // Autocompletar fecha y hora
    const now = new Date();
    document.getElementById('exp-date').value = now.toISOString().split('T')[0];
    document.getElementById('exp-time').value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    // Filtros de búsqueda avanzados
    const search = document.getElementById('filter-exp-search').value.toLowerCase();
    const catFilter = document.getElementById('filter-exp-category').value;
    const methodFilter = document.getElementById('filter-exp-method').value;
    const typeFilter = document.getElementById('filter-exp-type').value;
    const receiptFilter = document.getElementById('filter-exp-receipt').value;
    const startDate = document.getElementById('filter-exp-start-date').value;
    const endDate = document.getElementById('filter-exp-end-date').value;

    const filtered = state.expenses.filter(e => {
      const matchSearch = e.title.toLowerCase().includes(search) || (e.merchant && e.merchant.toLowerCase().includes(search)) || (e.description && e.description.toLowerCase().includes(search));
      const matchCat = catFilter === '' || String(e.category_id) === catFilter;
      const matchMethod = methodFilter === '' || e.payment_method === methodFilter;
      const matchType = typeFilter === '' || e.expense_type === typeFilter;
      const matchReceipt = receiptFilter === '' || (receiptFilter === 'con' ? !!e.receipt_file : !e.receipt_file);
      
      let matchDate = true;
      if (startDate) matchDate = matchDate && e.date >= startDate;
      if (endDate) matchDate = matchDate && e.date <= endDate;
      
      return matchSearch && matchCat && matchMethod && matchType && matchReceipt && matchDate;
    });

    document.getElementById('expenses-count-badge').textContent = `${filtered.length} transacciones encontradas`;

    tableBody.innerHTML = '';
    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No se encontraron gastos con los filtros aplicados.</td></tr>';
      return;
    }

    filtered.forEach(e => {
      const tr = document.createElement('tr');
      
      // Indicador de alertas
      let receiptBadge = `<i data-lucide="file-warning" class="text-danger" title="Sin Comprobante"></i>`;
      if (e.receipt_file) {
        receiptBadge = `<i data-lucide="file-check" class="text-success" title="Comprobante cargado"></i>`;
      }

      tr.innerHTML = `
        <td>${formatDate(e.date)} <span class="text-muted">${e.time}</span></td>
        <td>
          <strong>${e.title}</strong><br>
          <small class="text-muted">${e.merchant || 'Sin Comercio'} ${e.custom_tag ? '• #' + e.custom_tag : ''}</small>
        </td>
        <td>
          <span class="badge-premium" style="background-color: ${e.category_color || 'var(--color-border)'}22; color: ${e.category_color || 'var(--color-text)'};">
            ${e.category_name || 'Sin Categoría'}
          </span>
        </td>
        <td>
          <span style="color: ${e.account_color || 'inherit'}; font-weight: 600;">${e.account_name || 'Efectivo'}</span><br>
          <small class="text-muted">${e.payment_method.replace('_', ' ')}</small>
        </td>
        <td><strong class="text-danger amount-sensitive">$${Number(e.amount).toFixed(2)}</strong></td>
        <td class="text-center">${receiptBadge}</td>
        <td>
          <div class="action-buttons-cell">
            <button class="btn-action-table btn-detail-expense" data-id="${e.id}" title="Detalle"><i data-lucide="eye"></i></button>
            <button class="btn-action-table btn-edit-expense" data-id="${e.id}" title="Editar"><i data-lucide="edit-3"></i></button>
            <button class="btn-action-table btn-receipt-expense" data-id="${e.id}" data-file="${e.receipt_file || ''}" title="Comprobante"><i data-lucide="upload-cloud"></i></button>
            <button class="btn-action-table delete btn-delete-expense" data-id="${e.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    // Eventos de tabla CRUD
    document.querySelectorAll('.btn-detail-expense').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const id = parseInt(ev.currentTarget.getAttribute('data-id'));
        openTransactionDetail('expense', id);
      });
    });

    document.querySelectorAll('.btn-edit-expense').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const id = parseInt(ev.currentTarget.getAttribute('data-id'));
        const exp = state.expenses.find(x => x.id === id);
        if (exp) {
          document.getElementById('expense-id-field').value = exp.id;
          document.getElementById('exp-date').value = exp.date;
          document.getElementById('exp-time').value = exp.time;
          document.getElementById('exp-amount').value = exp.amount;
          document.getElementById('exp-title').value = exp.title;
          document.getElementById('exp-category').value = exp.category_id || '';
          
          // Cargar subcategorías de la categoría y seleccionar
          loadFormSubcategories(exp.category_id, exp.subcategory_id);

          document.getElementById('exp-method').value = exp.payment_method;
          document.getElementById('exp-account').value = exp.account_id || '';
          document.getElementById('exp-type').value = exp.expense_type;
          document.getElementById('exp-status').value = exp.status;
          document.getElementById('exp-merchant').value = exp.merchant || '';
          document.getElementById('exp-tag').value = exp.custom_tag || '';
          
          document.getElementById('exp-is-deducible').checked = exp.is_deducible === 1;
          document.getElementById('exp-is-necessary').checked = exp.is_necessary === 1;
          document.getElementById('exp-is-planned').checked = exp.is_planned === 1;
          
          document.getElementById('exp-notes').value = exp.notes || '';

          // Manejo del Split
          document.getElementById('exp-split-type').value = exp.split_type;
          if (exp.split_type !== 'simple') {
            document.getElementById('split-options-container').classList.remove('hidden');
            const details = exp.split_details ? JSON.parse(exp.split_details) : {};
            document.getElementById('exp-split-person').value = exp.related_person || '';
            document.getElementById('exp-split-share').value = details.share || '';
          }

          document.getElementById('expense-form-title').textContent = 'Editar Gasto';
          document.getElementById('card-form-expense').scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    document.querySelectorAll('.btn-receipt-expense').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const id = parseInt(ev.currentTarget.getAttribute('data-id'));
        const file = ev.currentTarget.getAttribute('data-file');
        openReceiptDialog('expense', id, file);
      });
    });

    document.querySelectorAll('.btn-delete-expense').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        if (confirm('¿Está seguro de eliminar este registro de gasto? Se devolverá el balance a la cuenta correspondiente.')) {
          const id = parseInt(ev.currentTarget.getAttribute('data-id'));
          try {
            await apiCall(`/api/expenses/${id}`, 'DELETE');
            alertSuccess('Gasto eliminado con éxito.');
            await loadMonthData();
            renderGastos();
          } catch (err) {
            alertError(err.error || 'Error al eliminar gasto.');
          }
        }
      });
    });

    lucide.createIcons();
    applyPrivacyMode();
  }

  // Cargar subcategorías en formulario dinámicamente al cambiar categoría
  document.getElementById('exp-category').addEventListener('change', (e) => {
    loadFormSubcategories(e.target.value);
    
    // Regla inteligente: Alertar si el presupuesto de la categoría se excede
    checkCategoryBudgetLimit(e.target.value);
  });

  function loadFormSubcategories(categoryId, selectedSubId = null) {
    const subSel = document.getElementById('exp-subcategory');
    subSel.innerHTML = '<option value="">Ninguna subcategoría</option>';
    
    const cat = state.categories.find(c => String(c.id) === String(categoryId));
    if (cat && cat.subcategories) {
      cat.subcategories.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.id;
        opt.textContent = sub.name;
        if (selectedSubId && String(sub.id) === String(selectedSubId)) {
          opt.selected = true;
        }
        subSel.appendChild(opt);
      });
    }
  }

  // Regla Inteligente: sugerir categoría en base al comercio ingresado
  document.getElementById('exp-merchant').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const catSelect = document.getElementById('exp-category');
    
    // Reglas básicas
    if (val.includes('supermaxi') || val.includes('comisariato') || val.includes('tienda') || val.includes('despensa')) {
      const match = state.categories.find(c => c.name === 'Alimentación');
      if (match) {
        catSelect.value = match.id;
        loadFormSubcategories(match.id);
      }
    } else if (val.includes('uber') || val.includes('gasolinera') || val.includes('primax') || val.includes('terpel') || val.includes('taxi')) {
      const match = state.categories.find(c => c.name === 'Transporte');
      if (match) {
        catSelect.value = match.id;
        loadFormSubcategories(match.id);
      }
    } else if (val.includes('netflix') || val.includes('spotify') || val.includes('cine') || val.includes('restaurante')) {
      const match = state.categories.find(c => c.name === 'Entretenimiento');
      if (match) {
        catSelect.value = match.id;
        loadFormSubcategories(match.id);
      }
    }
  });

  // Mostrar / Ocultar opciones de split
  document.getElementById('btn-toggle-split').addEventListener('click', () => {
    document.getElementById('split-options-container').classList.toggle('hidden');
  });

  // Enviar formulario Gasto
  document.getElementById('form-expense').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('expense-id-field').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const title = document.getElementById('exp-title').value;
    const paymentMethod = document.getElementById('exp-method').value;
    const accountId = document.getElementById('exp-account').value;

    // Regla Inteligente: Gasto alto (>100) requiere comprobante de forma recomendada
    if (amount > 100 && !id && !confirm('Este gasto supera los $100.00. ¿Desea guardarlo y adjuntar comprobante ahora?')) {
      return;
    }

    const data = {
      month_config_id: state.activeMonthId,
      date: document.getElementById('exp-date').value,
      time: document.getElementById('exp-time').value,
      amount,
      title,
      category_id: document.getElementById('exp-category').value || null,
      subcategory_id: document.getElementById('exp-subcategory').value || null,
      payment_method: paymentMethod,
      account_id: accountId || null,
      expense_type: document.getElementById('exp-type').value,
      status: document.getElementById('exp-status').value,
      merchant: document.getElementById('exp-merchant').value,
      custom_tag: document.getElementById('exp-tag').value,
      is_deducible: document.getElementById('exp-is-deducible').checked,
      is_necessary: document.getElementById('exp-is-necessary').checked,
      is_planned: document.getElementById('exp-is-planned').checked,
      notes: document.getElementById('exp-notes').value,
      split_type: document.getElementById('exp-split-type').value,
      related_person: document.getElementById('exp-split-person').value,
      split_details: {
        share: parseFloat(document.getElementById('exp-split-share').value) || 0
      }
    };

    try {
      let res;
      if (id) {
        res = await apiCall(`/api/expenses/${id}`, 'PUT', data);
        alertSuccess('Gasto actualizado con éxito.');
      } else {
        res = await apiCall('/api/expenses', 'POST', data);
        alertSuccess('Gasto registrado con éxito.');
      }
      
      await loadMonthData();
      renderGastos();

      // Si es un gasto nuevo, abrir diálogo de subir comprobante si fue solicitado
      if (!id && amount > 100 && res.id) {
        openReceiptDialog('expense', res.id, '');
      }
    } catch (err) {
      alertError(err.error || 'Error al registrar gasto.');
    }
  });

  document.getElementById('btn-cancel-expense').addEventListener('click', () => {
    renderGastos();
  });

  // Filtros en vivo
  document.getElementById('filter-exp-search').addEventListener('input', renderGastos);
  document.getElementById('filter-exp-category').addEventListener('change', renderGastos);
  document.getElementById('filter-exp-method').addEventListener('change', renderGastos);
  document.getElementById('filter-exp-type').addEventListener('change', renderGastos);
  document.getElementById('filter-exp-receipt').addEventListener('change', renderGastos);
  document.getElementById('filter-exp-start-date').addEventListener('change', renderGastos);
  document.getElementById('filter-exp-end-date').addEventListener('change', renderGastos);
  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    document.getElementById('filter-exp-search').value = '';
    document.getElementById('filter-exp-category').value = '';
    document.getElementById('filter-exp-method').value = '';
    document.getElementById('filter-exp-type').value = '';
    document.getElementById('filter-exp-receipt').value = '';
    document.getElementById('filter-exp-start-date').value = '';
    document.getElementById('filter-exp-end-date').value = '';
    renderGastos();
  });

  // ==========================================
  // TARJETAS Y CUENTAS (VISTA 5)
  // ==========================================
  function renderTarjetas() {
    const form = document.getElementById('form-account');
    const container = document.getElementById('accounts-cards-container');
    
    form.reset();
    document.getElementById('account-id-field').value = '';
    if (document.getElementById('group-acc-parent')) {
      document.getElementById('group-acc-parent').style.display = 'none';
    }
    if (document.getElementById('acc-text-color')) {
      document.getElementById('acc-text-color').value = '#FFFFFF';
    }
    container.innerHTML = '';

    if (state.accounts.length === 0) {
      container.innerHTML = '<p class="text-center full-width">No tiene cuentas o tarjetas registradas. Añada la primera usando el formulario.</p>';
      return;
    }

    // Separar en cuentas base (no credito) y tarjetas de credito
    const baseAccounts = state.accounts.filter(a => a.type !== 'credito' && a.type !== 'tarjeta_credito');
    const creditCards = state.accounts.filter(a => a.type === 'credito' || a.type === 'tarjeta_credito');

    // Crear dos secciones principales en el contenedor
    const mainSection = document.createElement('div');
    mainSection.className = 'accounts-section-group';
    mainSection.style.width = '100%';
    mainSection.innerHTML = '<h3 class="section-group-title" style="margin-bottom: 1rem; color: var(--text-primary); font-family: var(--font-headings); font-weight: 700;">Cuentas Bancarias, Billeteras y Efectivo</h3>';
    
    const baseGrid = document.createElement('div');
    baseGrid.className = 'accounts-visual-list';
    mainSection.appendChild(baseGrid);
    container.appendChild(mainSection);

    // Pintar las cuentas base
    baseAccounts.forEach(a => {
      const activeBalance = a.initial_balance;
      const lastFourStr = a.last_four ? `•••• •••• •••• ${a.last_four}` : 'CUENTA VIRTUAL';

      const cardWrapper = document.createElement('div');
      cardWrapper.className = 'account-card-wrapper';
      cardWrapper.style.display = 'flex';
      cardWrapper.style.flexDirection = 'column';
      cardWrapper.style.gap = '1rem';

      const card = document.createElement('div');
      card.className = 'bank-card-premium';
      card.style.background = `linear-gradient(135deg, ${a.color}, ${lightenColor(a.color, -20)})`;
      card.style.color = a.text_color || '#FFFFFF';
      
      const typeDetails = getAccountTypeDetails(a.type);
      card.innerHTML = `
        <div class="card-top" style="color: ${a.text_color || '#FFFFFF'}">
          <div style="display: flex; flex-direction: column; text-align: left;">
            <span class="card-bank-name" style="font-weight: 700; font-size: 1.1rem; line-height: 1.2;">${a.name}</span>
            <span style="font-size: 0.75rem; opacity: 0.8;">${a.bank || 'Efectivo/Digital'}</span>
          </div>
          <span class="card-type-chip" style="align-self: flex-start; background-color: ${a.text_color === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}; border: 1px solid ${a.text_color || '#FFFFFF'}; color: ${a.text_color || '#FFFFFF'}; display: flex; align-items: center; gap: 0.25rem;">
            <i data-lucide="${typeDetails.icon}" class="icon-small" style="width: 12px; height: 12px;"></i>
            ${typeDetails.label}
          </span>
        </div>
        <div class="card-middle" style="color: ${a.text_color || '#FFFFFF'}">
          <span class="card-balance-label" style="color: ${a.text_color || '#FFFFFF'}; opacity: 0.85;">Saldo Estimado</span>
          <span class="card-balance-val amount-sensitive">$${Number(activeBalance).toFixed(2)}</span>
        </div>
        <div class="card-bottom" style="color: ${a.text_color || '#FFFFFF'}">
          <span class="card-number">${lastFourStr}</span>
          <div class="card-actions-row">
            <button class="btn-card-action btn-edit-card" data-id="${a.id}" title="Editar" style="background-color: ${a.text_color === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}; color: ${a.text_color || '#FFFFFF'}"><i data-lucide="edit-2"></i></button>
            <button class="btn-card-action btn-delete-card" data-id="${a.id}" title="Eliminar" style="background-color: ${a.text_color === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}; color: ${a.text_color || '#FFFFFF'}"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      `;
      cardWrapper.appendChild(card);

      // Buscar si tiene tarjetas de crédito/débito asociadas
      const linkedCards = creditCards.filter(c => c.parent_account_id === a.id);
      if (linkedCards.length > 0) {
        const linkedContainer = document.createElement('div');
        linkedContainer.className = 'linked-cards-container';
        linkedContainer.style.paddingLeft = '1.5rem';
        linkedContainer.style.borderLeft = '3px dashed var(--accent-color)';
        linkedContainer.style.display = 'flex';
        linkedContainer.style.flexDirection = 'column';
        linkedContainer.style.gap = '0.75rem';
        linkedContainer.style.marginTop = '0.5rem';

        const label = document.createElement('div');
        label.style.fontSize = '0.75rem';
        label.style.fontWeight = 'bold';
        label.style.textTransform = 'uppercase';
        label.style.color = 'var(--text-muted)';
        label.innerHTML = '💳 Tarjetas Vinculadas:';
        linkedContainer.appendChild(label);

        linkedCards.forEach(c => {
          const cBalance = c.initial_balance;
          const cLastFour = c.last_four ? `•••• •••• •••• ${c.last_four}` : 'TARJETA';

          const cCard = document.createElement('div');
          cCard.className = 'bank-card-premium';
          cCard.style.height = '145px'; // Un poco más pequeña para denotar subordinación
          cCard.style.background = `linear-gradient(135deg, ${c.color}, ${lightenColor(c.color, -20)})`;
          cCard.style.color = c.text_color || '#FFFFFF';
          cCard.style.padding = '1rem';
          
          const cTypeDetails = getAccountTypeDetails(c.type);
          cCard.innerHTML = `
            <div class="card-top" style="color: ${c.text_color || '#FFFFFF'}">
              <div style="display: flex; flex-direction: column; text-align: left;">
                <span class="card-bank-name" style="font-weight: 700; font-size: 0.95rem; line-height: 1.2;">${c.name}</span>
                <span style="font-size: 0.65rem; opacity: 0.8;">${c.bank || 'Tarjeta'}</span>
              </div>
              <span class="card-type-chip" style="align-self: flex-start; background-color: ${c.text_color === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}; border: 1px solid ${c.text_color || '#FFFFFF'}; color: ${c.text_color || '#FFFFFF'}; font-size: 0.6rem; padding: 0.15rem 0.4rem; display: flex; align-items: center; gap: 0.2rem;">
                <i data-lucide="${cTypeDetails.icon}" class="icon-small" style="width: 10px; height: 10px;"></i>
                ${cTypeDetails.label}
              </span>
            </div>
            <div class="card-middle" style="color: ${c.text_color || '#FFFFFF'}; margin: 0.35rem 0;">
              <span class="card-balance-label" style="font-size: 0.65rem; opacity: 0.85;">Consumo Realizado</span>
              <span class="card-balance-val amount-sensitive" style="font-size: 1.2rem;">$${Number(cBalance).toFixed(2)}</span>
            </div>
            <div class="card-bottom" style="color: ${c.text_color || '#FFFFFF'}">
              <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.1rem;">
                <span class="card-number" style="font-size: 0.8rem;">${cLastFour}</span>
                <div style="font-size: 0.65rem; opacity: 0.85; display: flex; align-items: center; gap: 0.2rem;">
                  <i data-lucide="link" style="width: 9px; height: 9px;"></i>
                  <span>Fondo: <strong>${a.name}</strong></span>
                </div>
              </div>
              <div class="card-actions-row">
                <button class="btn-card-action btn-edit-card" data-id="${c.id}" title="Editar" style="background-color: ${c.text_color === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}; color: ${c.text_color || '#FFFFFF'}; width: 26px; height: 26px;"><i data-lucide="edit-2" style="width: 12px; height: 12px;"></i></button>
                <button class="btn-card-action btn-delete-card" data-id="${c.id}" title="Eliminar" style="background-color: ${c.text_color === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}; color: ${c.text_color || '#FFFFFF'}; width: 26px; height: 26px;"><i data-lucide="trash-2" style="width: 12px; height: 12px;"></i></button>
              </div>
            </div>
          `;
          linkedContainer.appendChild(cCard);
        });
        cardWrapper.appendChild(linkedContainer);
      }

      baseGrid.appendChild(cardWrapper);
    });

    // Ahora, pintar las tarjetas de crédito independientes (no asociadas a ninguna cuenta)
    const independentCards = creditCards.filter(c => !c.parent_account_id);
    if (independentCards.length > 0) {
      const creditSection = document.createElement('div');
      creditSection.className = 'accounts-section-group';
      creditSection.style.width = '100%';
      creditSection.style.marginTop = '3rem';
      creditSection.innerHTML = '<h3 class="section-group-title" style="margin-bottom: 1rem; color: var(--text-primary); font-family: var(--font-headings); font-weight: 700;">Tarjetas de Crédito Independientes</h3>';
      
      const creditGrid = document.createElement('div');
      creditGrid.className = 'accounts-visual-list';
      creditSection.appendChild(creditGrid);
      container.appendChild(creditSection);

      independentCards.forEach(c => {
        const activeBalance = c.initial_balance;
        const lastFourStr = c.last_four ? `•••• •••• •••• ${c.last_four}` : 'CUENTA VIRTUAL';

        const card = document.createElement('div');
        card.className = 'bank-card-premium';
        card.style.background = `linear-gradient(135deg, ${c.color}, ${lightenColor(c.color, -20)})`;
        card.style.color = c.text_color || '#FFFFFF';
        
        const typeDetails = getAccountTypeDetails(c.type);
        card.innerHTML = `
          <div class="card-top" style="color: ${c.text_color || '#FFFFFF'}">
            <div style="display: flex; flex-direction: column; text-align: left;">
              <span class="card-bank-name" style="font-weight: 700; font-size: 1.1rem; line-height: 1.2;">${c.name}</span>
              <span style="font-size: 0.75rem; opacity: 0.8;">${c.bank || 'Tarjeta de Crédito'}</span>
            </div>
            <span class="card-type-chip" style="align-self: flex-start; background-color: ${c.text_color === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}; border: 1px solid ${c.text_color || '#FFFFFF'}; color: ${c.text_color || '#FFFFFF'}; display: flex; align-items: center; gap: 0.25rem;">
              <i data-lucide="${typeDetails.icon}" class="icon-small" style="width: 12px; height: 12px;"></i>
              ${typeDetails.label}
            </span>
          </div>
          <div class="card-middle" style="color: ${c.text_color || '#FFFFFF'}">
            <span class="card-balance-label" style="color: ${c.text_color || '#FFFFFF'}; opacity: 0.85;">Consumo Realizado</span>
            <span class="card-balance-val amount-sensitive">$${Number(activeBalance).toFixed(2)}</span>
          </div>
          <div class="card-bottom" style="color: ${c.text_color || '#FFFFFF'}">
            <span class="card-number">${lastFourStr}</span>
            <div class="card-actions-row">
              <button class="btn-card-action btn-edit-card" data-id="${c.id}" title="Editar" style="background-color: ${c.text_color === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}; color: ${c.text_color || '#FFFFFF'}"><i data-lucide="edit-2"></i></button>
              <button class="btn-card-action btn-delete-card" data-id="${c.id}" title="Eliminar" style="background-color: ${c.text_color === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}; color: ${c.text_color || '#FFFFFF'}"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
        `;
        creditGrid.appendChild(card);
      });
    }

    // Eventos tarjetas
    document.querySelectorAll('.btn-edit-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        const a = state.accounts.find(x => x.id === id);
        if (a) {
          document.getElementById('account-id-field').value = a.id;
          document.getElementById('acc-name').value = a.name;
          document.getElementById('acc-bank').value = a.bank || '';
          document.getElementById('acc-type').value = a.type;
          document.getElementById('acc-last-four').value = a.last_four || '';
          document.getElementById('acc-balance').value = a.initial_balance;
          document.getElementById('acc-limit').value = a.credit_limit || 0;
          document.getElementById('acc-cut-day').value = a.cut_off_day || '';
          document.getElementById('acc-due-day').value = a.due_day || '';
          document.getElementById('acc-color').value = a.color;
          if (document.getElementById('acc-text-color')) {
            document.getElementById('acc-text-color').value = a.text_color || '#FFFFFF';
          }
          if (document.getElementById('acc-parent-id')) {
            document.getElementById('acc-parent-id').value = a.parent_account_id || '';
          }
          document.getElementById('acc-status').value = a.status;
          document.getElementById('acc-notes').value = a.notes || '';
          
          if (document.getElementById('group-acc-parent')) {
            const isCard = a.type === 'credito' || a.type === 'tarjeta_credito' || a.type === 'tarjeta_debito';
            document.getElementById('group-acc-parent').style.display = isCard ? 'block' : 'none';
          }
          
          form.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    document.querySelectorAll('.btn-delete-card').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('¿Está seguro de eliminar esta cuenta? Las transacciones que la referencien quedarán sin cuenta asociada.')) {
          const id = parseInt(e.currentTarget.getAttribute('data-id'));
          try {
            await apiCall(`/api/accounts/${id}`, 'DELETE');
            alertSuccess('Cuenta eliminada con éxito.');
            await loadMonthData();
            renderTarjetas();
          } catch (err) {
            alertError(err.error || 'Error al eliminar la cuenta.');
          }
        }
      });
    });

    lucide.createIcons();
    applyPrivacyMode();
  }

  document.getElementById('form-account').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('account-id-field').value;
    const parentIdField = document.getElementById('acc-parent-id');
    const textColorField = document.getElementById('acc-text-color');
    const data = {
      name: document.getElementById('acc-name').value,
      bank: document.getElementById('acc-bank').value,
      type: document.getElementById('acc-type').value,
      last_four: document.getElementById('acc-last-four').value,
      initial_balance: parseFloat(document.getElementById('acc-balance').value),
      credit_limit: parseFloat(document.getElementById('acc-limit').value) || 0,
      cut_off_day: parseInt(document.getElementById('acc-cut-day').value) || null,
      due_day: parseInt(document.getElementById('acc-due-day').value) || null,
      color: document.getElementById('acc-color').value,
      text_color: textColorField ? textColorField.value : '#FFFFFF',
      parent_account_id: parentIdField && parentIdField.value !== '' ? parseInt(parentIdField.value) : null,
      status: document.getElementById('acc-status').value,
      notes: document.getElementById('acc-notes').value
    };

    try {
      if (id) {
        await apiCall(`/api/accounts/${id}`, 'PUT', data);
        alertSuccess('Cuenta/Tarjeta actualizada con éxito.');
      } else {
        await apiCall('/api/accounts', 'POST', data);
        alertSuccess('Cuenta/Tarjeta creada con éxito.');
      }
      await loadMonthData();
      renderTarjetas();
    } catch (err) {
      alertError(err.error || 'Error al guardar cuenta.');
    }
  });

  document.getElementById('btn-cancel-account').addEventListener('click', () => {
    renderTarjetas();
  });

  document.getElementById('acc-type').addEventListener('change', (e) => {
    const parentGroup = document.getElementById('group-acc-parent');
    if (parentGroup) {
      const val = e.target.value;
      parentGroup.style.display = (val === 'credito' || val === 'tarjeta_credito' || val === 'tarjeta_debito') ? 'block' : 'none';
    }
  });

  // ==========================================
  // CATEGORÍAS (VISTA 6)
  // ==========================================
  function renderCategorias() {
    const form = document.getElementById('form-category');
    const container = document.getElementById('categories-list-container');
    
    form.reset();
    document.getElementById('category-id-field').value = '';
    container.innerHTML = '';

    if (state.categories.length === 0) {
      container.innerHTML = '<p class="text-center full-width">No hay categorías configuradas.</p>';
      return;
    }

    state.categories.forEach(c => {
      // Calcular gastos en esta categoría
      const spent = state.expenses.reduce((acc, e) => (e.status === 'pagado' && e.category_id === c.id) ? acc + e.amount : acc, 0);
      const budget = c.budget || 0;
      const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
      const available = Math.max(0, budget - spent);

      const card = document.createElement('div');
      card.className = 'cat-progress-card';
      
      let alertMsg = '';
      if (spent > budget && budget > 0) {
        alertMsg = `<div class="cat-limit-alert"><i data-lucide="alert-triangle" class="icon-small"></i> ¡Límite excedido por $${(spent - Number(budget)).toFixed(2)}!</div>`;
      } else if (pct >= 90 && budget > 0) {
        alertMsg = `<div class="cat-limit-alert" style="color: var(--color-warning);"><i data-lucide="alert-circle" class="icon-small"></i> ¡Cerca del límite (más del 90%)!</div>`;
      }

      const subNames = c.subcategories ? c.subcategories.map(s => s.name).join(', ') : '';

      card.innerHTML = `
        <div class="cat-progress-header">
          <div class="cat-info-title">
            <div class="cat-icon-wrap" style="background-color: ${c.color};">
              <i data-lucide="${c.icon || 'tag'}"></i>
            </div>
            <div>
              <span>${c.name}</span><br>
              <small class="text-muted">${subNames || 'Sin subcategorías'}</small>
            </div>
          </div>
          <div class="action-buttons-cell">
            <button class="btn-action-table btn-edit-cat" data-id="${c.id}" title="Editar"><i data-lucide="edit-3"></i></button>
            <button class="btn-action-table delete btn-delete-cat" data-id="${c.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
        
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: ${pct}%; background-color: ${pct >= 100 ? 'var(--color-danger)' : pct >= 90 ? 'var(--color-warning)' : c.color};"></div>
        </div>
        
        <div class="cat-values-calc">
          <span>Gastado: <strong class="amount-sensitive">$${Number(spent).toFixed(2)}</strong></span>
          <span>Presupuesto: $${Number(budget).toFixed(2)}</span>
        </div>
        ${alertMsg}
      `;
      container.appendChild(card);
    });

    // Eventos categorías
    document.querySelectorAll('.btn-edit-cat').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        const c = state.categories.find(x => x.id === id);
        if (c) {
          document.getElementById('category-id-field').value = c.id;
          document.getElementById('cat-name').value = c.name;
          document.getElementById('cat-budget').value = c.budget;
          document.getElementById('cat-icon').value = c.icon || 'tag';
          document.getElementById('cat-color').value = c.color;
          document.getElementById('cat-rule-type').value = c.rule_type || 'deseo';
          document.getElementById('cat-subs').value = c.subcategories ? c.subcategories.map(s => s.name).join(', ') : '';
          
          form.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    document.querySelectorAll('.btn-delete-cat').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('¿Está seguro de eliminar esta categoría? Se desvincularán las transacciones históricas.')) {
          const id = parseInt(e.currentTarget.getAttribute('data-id'));
          try {
            await apiCall(`/api/categories/${id}`, 'DELETE');
            alertSuccess('Categoría eliminada.');
            await loadMonthData();
            renderCategorias();
          } catch (err) {
            alertError(err.error || 'Error al eliminar categoría.');
          }
        }
      });
    });

    lucide.createIcons();
    applyPrivacyMode();
  }

  document.getElementById('form-category').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('category-id-field').value;
    const subsStr = document.getElementById('cat-subs').value;
    const subcategories = subsStr ? subsStr.split(',').map(s => s.trim()).filter(s => s) : [];

    const data = {
      name: document.getElementById('cat-name').value,
      budget: parseFloat(document.getElementById('cat-budget').value) || 0,
      icon: document.getElementById('cat-icon').value,
      color: document.getElementById('cat-color').value,
      rule_type: document.getElementById('cat-rule-type').value,
      subcategories
    };

    try {
      if (id) {
        await apiCall(`/api/categories/${id}`, 'PUT', data);
        alertSuccess('Categoría actualizada con éxito.');
      } else {
        await apiCall('/api/categories', 'POST', data);
        alertSuccess('Categoría creada con éxito.');
      }
      await loadUserConfigs();
      await loadMonthData();
      renderCategorias();
    } catch (err) {
      alertError(err.error || 'Error al guardar categoría.');
    }
  });

  document.getElementById('btn-cancel-category').addEventListener('click', () => {
    renderCategorias();
  });

  // ==========================================
  // GASTOS RECURRENTES (VISTA 7)
  // ==========================================
  function renderRecurrentes() {
    const form = document.getElementById('form-recurring');
    const tableBody = document.querySelector('#table-recurring tbody');
    
    form.reset();
    document.getElementById('recurring-id-field').value = '';
    
    tableBody.innerHTML = '';
    if (state.recurring.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" class="text-center">No hay gastos programados recurrentes.</td></tr>';
      return;
    }

    state.recurring.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${r.name}</strong></td>
        <td><strong class="text-danger amount-sensitive">$${Number(r.amount).toFixed(2)}</strong></td>
        <td>${r.category_name || 'Sin Categoría'}</td>
        <td>${r.account_name || 'Efectivo'} <br><small class="text-muted">${r.payment_method.replace('_', ' ')}</small></td>
        <td><span class="badge-premium parcial">${r.frequency}</span></td>
        <td>${formatDate(r.next_due_date)}</td>
        <td><span class="badge-premium ${r.status === 'activo' ? 'pagado' : 'cancelado'}">${r.status}</span></td>
        <td>
          <div class="action-buttons-cell">
            <button class="btn-action-table btn-edit-rec" data-id="${r.id}" title="Editar"><i data-lucide="edit-3"></i></button>
            <button class="btn-action-table delete btn-delete-rec" data-id="${r.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    document.querySelectorAll('.btn-edit-rec').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        const r = state.recurring.find(x => x.id === id);
        if (r) {
          document.getElementById('recurring-id-field').value = r.id;
          document.getElementById('rec-name').value = r.name;
          document.getElementById('rec-amount').value = r.amount;
          document.getElementById('rec-category').value = r.category_id || '';
          document.getElementById('rec-method').value = r.payment_method;
          document.getElementById('rec-account').value = r.account_id || '';
          document.getElementById('rec-frequency').value = r.frequency;
          document.getElementById('rec-date').value = r.next_due_date;
          
          form.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    document.querySelectorAll('.btn-delete-rec').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('¿Está seguro de eliminar esta regla de gasto recurrente? No afectará los gastos ya creados.')) {
          const id = parseInt(e.currentTarget.getAttribute('data-id'));
          try {
            await apiCall(`/api/recurring/${id}`, 'DELETE');
            alertSuccess('Gasto recurrente programado eliminado.');
            await loadMonthData();
            renderRecurrentes();
          } catch (err) {
            alertError(err.error || 'Error al eliminar.');
          }
        }
      });
    });

    lucide.createIcons();
    applyPrivacyMode();
  }

  document.getElementById('form-recurring').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('recurring-id-field').value;
    const data = {
      name: document.getElementById('rec-name').value,
      amount: parseFloat(document.getElementById('rec-amount').value),
      category_id: document.getElementById('rec-category').value || null,
      payment_method: document.getElementById('rec-method').value,
      account_id: document.getElementById('rec-account').value || null,
      frequency: document.getElementById('rec-frequency').value,
      next_due_date: document.getElementById('rec-date').value
    };

    try {
      if (id) {
        await apiCall(`/api/recurring/${id}`, 'PUT', data);
        alertSuccess('Gasto recurrente actualizado.');
      } else {
        await apiCall('/api/recurring', 'POST', data);
        alertSuccess('Gasto recurrente programado con éxito.');
      }
      await loadMonthData();
      renderRecurrentes();
    } catch (err) {
      alertError(err.error || 'Error al guardar programación.');
    }
  });

  document.getElementById('btn-cancel-recurring').addEventListener('click', () => {
    renderRecurrentes();
  });

  // ==========================================
  // DEUDAS Y PAGOS (VISTA 8)
  // ==========================================
  function renderDeudas() {
    const form = document.getElementById('form-debt');
    const tableBody = document.querySelector('#table-debts tbody');
    
    form.reset();
    document.getElementById('debt-id-field').value = '';
    document.getElementById('debt-start-date').value = new Date().toISOString().split('T')[0];

    // Totales
    const total = state.debts.reduce((acc, d) => acc + d.total_amount, 0);
    const paid = state.debts.reduce((acc, d) => acc + d.paid_amount, 0);
    const pending = Math.max(0, total - paid);

    document.getElementById('debt-summary-total').textContent = formatCurrency(total);
    document.getElementById('debt-summary-paid').textContent = formatCurrency(paid);
    document.getElementById('debt-summary-pending').textContent = formatCurrency(pending);

    tableBody.innerHTML = '';
    if (state.debts.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" class="text-center">No hay deudas activas registradas.</td></tr>';
      return;
    }

    state.debts.forEach(d => {
      const remaining = Math.max(0, d.total_amount - d.paid_amount);
      const pct = d.total_amount > 0 ? Math.min(100, (d.paid_amount / d.total_amount) * 100) : 0;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${d.name}</strong><br><small class="text-muted">Acreedor: ${d.lender}</small></td>
        <td>$${Number(d.total_amount).toFixed(2)}</td>
        <td><span class="text-success">$${Number(d.paid_amount).toFixed(2)}</span></td>
        <td><strong class="text-danger amount-sensitive">$${Number(remaining).toFixed(2)}</strong></td>
        <td>
          <div class="progress-bar-container" style="width: 100px;">
            <div class="progress-bar" style="width: ${pct}%; background-color: var(--color-success);"></div>
          </div>
          <small class="text-muted">${Number(pct).toFixed(0)}% cubierto</small>
        </td>
        <td>${d.due_date ? formatDate(d.due_date) : 'N/A'}</td>
        <td><span class="badge-premium ${d.status}">${d.status}</span></td>
        <td>
          <div class="action-buttons-cell">
            <button class="btn-action-table btn-pay-debt" data-id="${d.id}" title="Abonar Pago"><i data-lucide="hand-coins"></i></button>
            <button class="btn-action-table btn-edit-debt" data-id="${d.id}" title="Editar"><i data-lucide="edit-3"></i></button>
            <button class="btn-action-table delete btn-delete-debt" data-id="${d.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    document.querySelectorAll('.btn-pay-debt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        openDebtPayDialog(id);
      });
    });

    document.querySelectorAll('.btn-edit-debt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        const d = state.debts.find(x => x.id === id);
        if (d) {
          document.getElementById('debt-id-field').value = d.id;
          document.getElementById('debt-name').value = d.name;
          document.getElementById('debt-lender').value = d.lender;
          document.getElementById('debt-total').value = d.total_amount;
          document.getElementById('debt-paid').value = d.paid_amount;
          document.getElementById('debt-start-date').value = d.start_date;
          document.getElementById('debt-due-date').value = d.due_date || '';
          document.getElementById('debt-installments-total').value = d.installments_total;
          document.getElementById('debt-installments-paid').value = d.installments_paid;
          document.getElementById('debt-installment-val').value = d.installment_value || '';
          
          form.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    document.querySelectorAll('.btn-delete-debt').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('¿Está seguro de eliminar esta deuda? No se borrarán los abonos registrados como gastos.')) {
          const id = parseInt(e.currentTarget.getAttribute('data-id'));
          try {
            await apiCall(`/api/debts/${id}`, 'DELETE');
            alertSuccess('Deuda eliminada.');
            await loadMonthData();
            renderDeudas();
          } catch (err) {
            alertError(err.error || 'Error al eliminar.');
          }
        }
      });
    });

    lucide.createIcons();
    applyPrivacyMode();
  }

  document.getElementById('form-debt').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('debt-id-field').value;
    const data = {
      name: document.getElementById('debt-name').value,
      lender: document.getElementById('debt-lender').value,
      total_amount: parseFloat(document.getElementById('debt-total').value),
      paid_amount: parseFloat(document.getElementById('debt-paid').value) || 0,
      start_date: document.getElementById('debt-start-date').value,
      due_date: document.getElementById('debt-due-date').value || null,
      installments_total: parseInt(document.getElementById('debt-installments-total').value) || 1,
      installments_paid: parseInt(document.getElementById('debt-installments-paid').value) || 0,
      installment_value: parseFloat(document.getElementById('debt-installment-val').value) || null,
      notes: ''
    };

    try {
      if (id) {
        await apiCall(`/api/debts/${id}`, 'PUT', data);
        alertSuccess('Deuda actualizada.');
      } else {
        await apiCall('/api/debts', 'POST', data);
        alertSuccess('Deuda registrada.');
      }
      await loadMonthData();
      renderDeudas();
    } catch (err) {
      alertError(err.error || 'Error al registrar.');
    }
  });

  document.getElementById('btn-cancel-debt').addEventListener('click', () => {
    renderDeudas();
  });

  // Diálogo Abono Deuda
  function openDebtPayDialog(debtId) {
    const d = state.debts.find(x => x.id === debtId);
    if (!d) return;
    
    document.getElementById('debt-pay-error').classList.add('hidden');
    document.getElementById('debt-pay-id').value = debtId;
    document.getElementById('debt-pay-amount').value = d.installment_value || '';
    
    // Poblar select de cuentas
    const accSelect = document.getElementById('debt-pay-account');
    accSelect.innerHTML = '<option value="">Seleccionar cuenta...</option>';
    state.accounts.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = `${a.name} ($${Number(a.initial_balance).toFixed(2)})`;
      accSelect.appendChild(opt);
    });

    els.debtPayDialog.classList.remove('hidden');
  }

  els.formDebtPay.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('debt-pay-id').value;
    const data = {
      amount: parseFloat(document.getElementById('debt-pay-amount').value),
      paymentMethod: document.getElementById('debt-pay-method').value,
      accountId: document.getElementById('debt-pay-account').value || null,
      monthConfigId: state.activeMonthId,
      date: new Date().toISOString().split('T')[0]
    };

    try {
      await apiCall(`/api/debts/${id}/pay`, 'POST', data);
      els.debtPayDialog.classList.add('hidden');
      alertSuccess('Abono registrado con éxito.');
      await loadMonthData();
      renderDeudas();
    } catch (err) {
      const errBanner = document.getElementById('debt-pay-error');
      errBanner.textContent = err.error || 'Error al procesar pago.';
      errBanner.classList.remove('hidden');
    }
  });

  els.btnCancelDebtPay.addEventListener('click', () => {
    els.debtPayDialog.classList.add('hidden');
  });

  // ==========================================
  // METAS DE AHORRO Y METAS (VISTA 9)
  // ==========================================
  function renderSavings() {
    const form = document.getElementById('form-saving-goal');
    const container = document.getElementById('goals-list-container');
    
    form.reset();
    document.getElementById('saving-goal-id-field').value = '';
    container.innerHTML = '';

    if (state.savings.length === 0) {
      container.innerHTML = '<p class="text-center full-width">No tiene metas financieras creadas.</p>';
      return;
    }

    state.savings.forEach(s => {
      const remaining = Math.max(0, s.target_amount - s.saved_amount);
      const pct = s.target_amount > 0 ? Math.min(100, (s.saved_amount / s.target_amount) * 100) : 0;
      
      const card = document.createElement('div');
      card.className = 'cat-progress-card';
      card.innerHTML = `
        <div class="cat-progress-header">
          <div class="cat-info-title">
            <div class="cat-icon-wrap" style="background-color: var(--color-primary);">
              <i data-lucide="piggy-bank"></i>
            </div>
            <div>
              <span>${s.name}</span><br>
              <small class="text-muted">Prioridad: ${s.priority} | Vence: ${s.target_date ? formatDate(s.target_date) : 'N/A'}</small>
            </div>
          </div>
          <div class="action-buttons-cell">
            <button class="btn-action-table btn-edit-goal" data-id="${s.id}" title="Editar"><i data-lucide="edit-3"></i></button>
            <button class="btn-action-table delete btn-delete-goal" data-id="${s.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
        
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: ${pct}%; background-color: var(--color-success);"></div>
        </div>
        
        <div class="cat-values-calc">
          <span>Ahorrado: <strong class="amount-sensitive">$${Number(s.saved_amount).toFixed(2)}</strong></span>
          <span>Objetivo: $${Number(s.target_amount).toFixed(2)}</span>
        </div>
        <div class="text-muted" style="font-size: 0.75rem; margin-top: 0.5rem;">${s.description || 'Sin descripción'}</div>
      `;
      container.appendChild(card);
    });

    // Eventos metas
    document.querySelectorAll('.btn-edit-goal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        const s = state.savings.find(x => x.id === id);
        if (s) {
          document.getElementById('saving-goal-id-field').value = s.id;
          document.getElementById('goal-name').value = s.name;
          document.getElementById('goal-target').value = s.target_amount;
          document.getElementById('goal-saved').value = s.saved_amount;
          document.getElementById('goal-date').value = s.target_date || '';
          document.getElementById('goal-priority').value = s.priority;
          document.getElementById('goal-desc').value = s.description || '';
          
          form.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    document.querySelectorAll('.btn-delete-goal').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('¿Está seguro de eliminar esta meta?')) {
          const id = parseInt(e.currentTarget.getAttribute('data-id'));
          try {
            await apiCall(`/api/savings/${id}`, 'DELETE');
            alertSuccess('Meta eliminada.');
            await loadMonthData();
            renderSavings();
          } catch (err) {
            alertError(err.error || 'Error al eliminar.');
          }
        }
      });
    });

    initSavingsMódulos();
    lucide.createIcons();
    applyPrivacyMode();
  }

  function initSavingsMódulos() {
    // 1. Redondeo / Microahorros
    let totalRoundup = 0;
    let varExpensesCount = 0;
    state.expenses.forEach(e => {
      if (e.status === 'pagado' && e.expense_type === 'variable') {
        const amt = Number(e.amount);
        const nextDolar = Math.ceil(amt);
        const diff = nextDolar - amt;
        if (diff > 0) {
          totalRoundup += diff;
          varExpensesCount++;
        }
      }
    });

    const valEl = document.getElementById('micro-savings-val');
    const countEl = document.getElementById('micro-savings-count');
    if (valEl) valEl.textContent = formatCurrency(totalRoundup);
    if (countEl) countEl.textContent = `${varExpensesCount} gastos variables analizados`;

    const roundupGoalSelect = document.getElementById('roundup-target-goal');
    if (roundupGoalSelect) {
      roundupGoalSelect.innerHTML = '<option value="">Seleccione una meta...</option>';
      state.savings.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (Progreso: ${formatCurrency(s.saved_amount)} / ${formatCurrency(s.target_amount)})`;
        roundupGoalSelect.appendChild(opt);
      });
    }

    const formApply = document.getElementById('form-apply-roundup');
    if (formApply) {
      const newFormApply = formApply.cloneNode(true);
      formApply.parentNode.replaceChild(newFormApply, formApply);
      
      newFormApply.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const goalId = parseInt(newFormApply.querySelector('#roundup-target-goal').value);
        if (!goalId) {
          alertError('Por favor seleccione una meta.');
          return;
        }
        if (totalRoundup <= 0) {
          alertError('No hay microahorros acumulados este mes para aplicar.');
          return;
        }
        const targetGoal = state.savings.find(s => s.id === goalId);
        if (targetGoal) {
          const newSaved = Number(targetGoal.saved_amount) + totalRoundup;
          const updatedData = {
            name: targetGoal.name,
            target_amount: targetGoal.target_amount,
            saved_amount: newSaved,
            target_date: targetGoal.target_date,
            description: targetGoal.description,
            priority: targetGoal.priority,
            status: targetGoal.status
          };
          try {
            await apiCall(`/api/savings/${targetGoal.id}`, 'PUT', updatedData);
            alertSuccess(`¡Microahorros aplicados! Se depositaron ${formatCurrency(totalRoundup)} a la meta "${targetGoal.name}".`);
            await loadMonthData();
            renderSavings();
          } catch (err) {
            alertError(err.error || 'Error al aplicar ahorro.');
          }
        }
      });
    }

    // 2. Calculadora de Interés Compuesto
    const sliders = ['calc-initial-range', 'calc-monthly-range', 'calc-rate-range', 'calc-years-range'];
    sliders.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        // Clonar para quitar listeners viejos
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        newEl.addEventListener('input', updateCompoundInterestChart);
      }
    });

    updateCompoundInterestChart();
  }

  function updateCompoundInterestChart() {
    const pEl = document.getElementById('calc-initial-range');
    const pmtEl = document.getElementById('calc-monthly-range');
    const rateEl = document.getElementById('calc-rate-range');
    const yearsEl = document.getElementById('calc-years-range');

    if (!pEl || !pmtEl || !rateEl || !yearsEl) return;

    const P = parseFloat(pEl.value);
    const PMT = parseFloat(pmtEl.value);
    const annualRate = parseFloat(rateEl.value) / 100;
    const years = parseInt(yearsEl.value);

    document.getElementById('calc-initial-val').textContent = formatCurrency(P);
    document.getElementById('calc-monthly-val').textContent = `${formatCurrency(PMT)} / mes`;
    document.getElementById('calc-rate-val').textContent = `${rateEl.value}% anual`;
    document.getElementById('calc-years-val').textContent = `${years} años`;

    const labels = [];
    const principalData = [];
    const interestData = [];

    const n = 12; // compounded monthly
    const r_n = annualRate / n;

    for (let y = 1; y <= years; y++) {
      labels.push(`Año ${y}`);
      const totalMonths = y * 12;
      
      const principalInvested = P + (PMT * totalMonths);
      principalData.push(principalInvested);

      let totalBalance = P * Math.pow(1 + r_n, totalMonths);
      if (r_n > 0) {
        totalBalance += PMT * ((Math.pow(1 + r_n, totalMonths) - 1) / r_n);
      } else {
        totalBalance += PMT * totalMonths;
      }

      const accumulatedInterest = Math.max(0, totalBalance - principalInvested);
      interestData.push(accumulatedInterest);
    }

    const canvas = document.getElementById('chart-compound-interest');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    destroyChart('compound');

    state.charts.compound = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Capital Invertido',
            data: principalData,
            backgroundColor: 'rgba(99, 102, 241, 0.2)',
            borderColor: '#6366F1',
            fill: true,
            tension: 0.3
          },
          {
            label: 'Interés Acumulado',
            data: interestData,
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            borderColor: '#10B981',
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true }
        }
      }
    });
  }

  document.getElementById('form-saving-goal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('saving-goal-id-field').value;
    const data = {
      name: document.getElementById('goal-name').value,
      target_amount: parseFloat(document.getElementById('goal-target').value),
      saved_amount: parseFloat(document.getElementById('goal-saved').value) || 0,
      target_date: document.getElementById('goal-date').value || null,
      priority: document.getElementById('goal-priority').value,
      description: document.getElementById('goal-desc').value
    };

    try {
      if (id) {
        await apiCall(`/api/savings/${id}`, 'PUT', data);
        alertSuccess('Meta de ahorro actualizada.');
      } else {
        await apiCall('/api/savings', 'POST', data);
        alertSuccess('Meta de ahorro guardada.');
      }
      await loadMonthData();
      renderSavings();
    } catch (err) {
      alertError(err.error || 'Error al guardar.');
    }
  });

  document.getElementById('btn-cancel-goal').addEventListener('click', () => {
    renderSavings();
  });

  // ==========================================
  // CALENDARIO FINANCIERO (VISTA 10)
  // ==========================================
  function renderCalendario() {
    const grid = document.getElementById('calendar-grid-body');
    const label = document.getElementById('calendar-month-year-label');
    grid.innerHTML = '';
    
    const year = state.selectedCalDate.getFullYear();
    const month = state.selectedCalDate.getMonth(); // 0 a 11
    
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    label.textContent = `${monthNames[month]} ${year}`;

    // Pintar nombres de días
    const daysName = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    daysName.forEach(name => {
      const header = document.createElement('div');
      header.className = 'calendar-day-header';
      header.textContent = name;
      grid.appendChild(header);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Días vacíos iniciales
    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell empty';
      grid.appendChild(cell);
    }

    // Rellenar días del mes
    for (let day = 1; day <= totalDays; day++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.setAttribute('data-day', day);
      
      const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Calcular transacciones de este día
      const dayIncomes = state.incomes.filter(i => i.date === dayStr);
      const dayExpenses = state.expenses.filter(e => e.date === dayStr);
      
      const incTotal = dayIncomes.reduce((acc, i) => acc + i.amount, 0);
      const expTotal = dayExpenses.reduce((acc, e) => acc + e.amount, 0);

      let indicators = '';
      if (incTotal > 0) indicators += `<span class="indicator-inc">+${Number(incTotal).toFixed(0)}</span>`;
      if (expTotal > 0) indicators += `<span class="indicator-exp">-${Number(expTotal).toFixed(0)}</span>`;

      cell.innerHTML = `
        <span class="day-num">${day}</span>
        <div class="day-indicators">${indicators}</div>
      `;

      cell.addEventListener('click', () => {
        // Seleccionar celda activa
        document.querySelectorAll('.calendar-cell').forEach(c => c.classList.remove('active-day'));
        cell.classList.add('active-day');
        
        showCalendarDayDetails(dayStr, dayIncomes, dayExpenses);
      });

      grid.appendChild(cell);
    }
  }

  function showCalendarDayDetails(dateStr, incomes, expenses) {
    const list = document.getElementById('cal-day-movements-list');
    document.getElementById('cal-selected-day-text').textContent = `Movimientos del ${formatDate(dateStr)}`;
    list.innerHTML = '';

    if (incomes.length === 0 && expenses.length === 0) {
      list.innerHTML = '<p class="text-muted">No hay transacciones registradas este día.</p>';
      return;
    }

    incomes.forEach(i => {
      const div = document.createElement('div');
      div.className = 'cal-day-item income';
      div.innerHTML = `
        <div>
          <strong>${i.source}</strong> (Ingreso)<br>
          <small class="text-muted">${i.receipt_method} -> ${i.account_name || 'Efectivo'}</small>
        </div>
        <span class="text-success amount-sensitive">+$${Number(i.amount).toFixed(2)}</span>
      `;
      list.appendChild(div);
    });

    expenses.forEach(e => {
      const div = document.createElement('div');
      div.className = 'cal-day-item expense';
      div.innerHTML = `
        <div>
          <strong>${e.title}</strong> (Gasto)<br>
          <small class="text-muted">${e.payment_method.replace('_', ' ')} (${e.account_name || 'Efectivo'})</small>
        </div>
        <span class="text-danger amount-sensitive">-$${Number(e.amount).toFixed(2)}</span>
      `;
      list.appendChild(div);
    });

    applyPrivacyMode();
  }

  document.getElementById('btn-cal-prev').addEventListener('click', () => {
    state.selectedCalDate.setMonth(state.selectedCalDate.getMonth() - 1);
    renderCalendario();
  });

  document.getElementById('btn-cal-next').addEventListener('click', () => {
    state.selectedCalDate.setMonth(state.selectedCalDate.getMonth() + 1);
    renderCalendario();
  });

  // ==========================================
  // COMPROBANTES Y RECIBOS (VISTA 11)
  // ==========================================
  function renderComprobantes() {
    const container = document.getElementById('receipts-gallery-container');
    const filter = document.getElementById('filter-receipt-type').value;
    container.innerHTML = '';

    const list = [];
    
    // Recopilar de los gastos e ingresos
    state.expenses.forEach(e => {
      if (e.receipt_file) {
        list.push({
          type: 'expense',
          transId: e.id,
          title: e.title,
          amount: e.amount,
          date: e.date,
          filename: e.receipt_file
        });
      }
    });

    state.incomes.forEach(i => {
      if (i.receipt_file) {
        list.push({
          type: 'income',
          transId: i.id,
          title: i.source,
          amount: i.amount,
          date: i.date,
          filename: i.receipt_file
        });
      }
    });

    const filtered = list.filter(r => filter === '' || r.type === filter);

    if (filtered.length === 0) {
      container.innerHTML = '<p class="text-center full-width">No se encontraron comprobantes cargados.</p>';
      return;
    }

    filtered.forEach(r => {
      const isPdf = r.filename.endsWith('.pdf');
      const preview = isPdf 
        ? `<div class="receipt-pdf-icon"><i data-lucide="file-text" style="width:48px;height:48px;"></i><span>PDF</span></div>`
        : `<img src="/uploads/${r.filename}" alt="${r.title}">`;

      const card = document.createElement('div');
      card.className = 'receipt-card';
      card.innerHTML = `
        <div class="receipt-preview">${preview}</div>
        <div class="receipt-info-body">
          <div>
            <span class="receipt-info-title">${r.title}</span><br>
            <small class="text-muted">${formatDate(r.date)} | ${r.type === 'expense' ? 'Gasto' : 'Ingreso'}</small>
          </div>
          <div class="receipt-actions">
            <a href="/uploads/${r.filename}" target="_blank" class="btn-primary-premium full-width" style="padding:0.4rem;font-size:0.75rem;"><i data-lucide="external-link"></i> Ver</a>
            <button class="btn-danger-premium btn-delete-receipt" data-type="${r.type}" data-id="${r.transId}" style="padding:0.4rem;font-size:0.75rem;"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    document.querySelectorAll('.btn-delete-receipt').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('¿Está seguro de eliminar este comprobante?')) {
          const type = e.currentTarget.getAttribute('data-type');
          const id = parseInt(e.currentTarget.getAttribute('data-id'));
          try {
            await apiCall('/api/receipts', 'DELETE', { transactionType: type, transactionId: id });
            alertSuccess('Comprobante eliminado.');
            await loadMonthData();
            renderComprobantes();
          } catch (err) {
            alertError(err.error || 'Error al eliminar.');
          }
        }
      });
    });

    lucide.createIcons();
  }

  document.getElementById('filter-receipt-type').addEventListener('change', renderComprobantes);

  // Subida de Comprobante Modal Flow
  function openReceiptDialog(type, transId, filename) {
    document.getElementById('upload-receipt-error').classList.add('hidden');
    document.getElementById('receipt-trans-type').value = type;
    document.getElementById('receipt-trans-id').value = transId;
    document.getElementById('receipt-file-input').value = '';
    
    const dragLabel = document.getElementById('file-drag-label');
    dragLabel.innerHTML = `<i data-lucide="upload-cloud" class="drag-icon"></i> <span>Haga clic o arrastre aquí para subir</span>`;
    
    if (filename) {
      dragLabel.innerHTML += `<div class="text-success" style="font-size:0.8rem;margin-top:0.5rem;"><i data-lucide="file-check"></i> Ya existe un archivo: ${filename}</div>`;
    }

    els.uploadReceiptDialog.classList.remove('hidden');
    lucide.createIcons();
  }

  els.btnCancelReceiptDialog.addEventListener('click', () => {
    els.uploadReceiptDialog.classList.add('hidden');
  });

  els.receiptFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      document.getElementById('file-drag-label').querySelector('span').textContent = `Archivo seleccionado: ${e.target.files[0].name}`;
    }
  });

  els.formUploadReceipt.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('receipt-trans-type').value;
    const id = document.getElementById('receipt-trans-id').value;
    const fileInput = els.receiptFileInput;
    
    if (fileInput.files.length === 0) return;

    const formData = new FormData();
    formData.append('transactionType', type);
    formData.append('transactionId', id);
    formData.append('file', fileInput.files[0]);

    try {
      await apiCall('/api/receipts/upload', 'POST', formData, true);
      els.uploadReceiptDialog.classList.add('hidden');
      alertSuccess('Comprobante subido y vinculado correctamente.');
      
      // Recargar datos y refrescar la pantalla correspondiente
      await loadMonthData();
      if (window.location.hash === '#comprobantes') renderComprobantes();
      else if (window.location.hash === '#gastos') renderGastos();
      else if (window.location.hash === '#ingresos') renderIngresos();
    } catch (err) {
      const errBanner = document.getElementById('upload-receipt-error');
      errBanner.textContent = err.error || 'Error al subir archivo.';
      errBanner.classList.remove('hidden');
    }
  });

  // ==========================================
  // REPORTES Y COMPARATIVA (VISTA 12)
  // ==========================================
  function renderReportes() {
    const m = state.activeMonthConfig;
    const totalIncomes = state.incomes.reduce((acc, i) => i.status === 'recibido' ? acc + i.amount : acc, 0);
    const totalExpenses = state.expenses.reduce((acc, e) => e.status === 'pagado' ? acc + e.amount : acc, 0);
    const balance = m.initial_balance + totalIncomes - totalExpenses;

    document.getElementById('rep-initial-balance').textContent = formatCurrency(m.initial_balance);
    document.getElementById('rep-total-incomes').textContent = `+$${Number(totalIncomes).toFixed(2)}`;
    document.getElementById('rep-total-expenses').textContent = `-$${Number(totalExpenses).toFixed(2)}`;
    document.getElementById('rep-net-balance').textContent = formatCurrency(balance);

    // Informe Categorías
    const catDiv = document.getElementById('report-categories-distribution');
    catDiv.innerHTML = '';
    
    const catMap = {};
    state.expenses.forEach(e => {
      if (e.status === 'pagado') {
        catMap[e.category_name || 'Sin Categoría'] = (catMap[e.category_name || 'Sin Categoría'] || 0) + e.amount;
      }
    });

    const tableCat = document.createElement('table');
    tableCat.className = 'report-table';
    for (const c in catMap) {
      const pct = totalExpenses > 0 ? (catMap[c] / totalExpenses) * 100 : 0;
      tableCat.innerHTML += `
        <tr><td>${c}:</td><td>$${Number(catMap[c]).toFixed(2)} (${Number(pct).toFixed(1)}%)</td></tr>
      `;
    }
    catDiv.appendChild(tableCat);

    // Cuentas
    const accDiv = document.getElementById('report-accounts-usage');
    accDiv.innerHTML = '';
    const tableAcc = document.createElement('table');
    tableAcc.className = 'report-table';
    state.accounts.forEach(a => {
      tableAcc.innerHTML += `
        <tr><td>${a.name}:</td><td>Saldo final estimado: $${Number(a.initial_balance).toFixed(2)}</td></tr>
      `;
    });
    accDiv.appendChild(tableAcc);

    // Generar recomendaciones de inteligencia artificial financiera
    const recDiv = document.getElementById('report-recommendations');
    const savingGoal = m.saving_goal;
    const actualSaving = totalIncomes - totalExpenses;
    
    let recommendations = '<ul>';
    if (actualSaving < savingGoal) {
      recommendations += `<li>⚠️ Su balance de ahorro actual ($${Number(actualSaving).toFixed(2)}) es menor a su meta de ahorro mensual de $${Number(savingGoal).toFixed(2)}.</li>`;
    } else {
      recommendations += `<li>🎉 ¡Excelente! Ha cubierto su meta de ahorro establecida para este mes.</li>`;
    }

    // Buscar si hay categorías sobrepasadas
    state.categories.forEach(c => {
      const spent = state.expenses.reduce((acc, e) => (e.status === 'pagado' && e.category_id === c.id) ? acc + e.amount : acc, 0);
      if (spent > c.budget && c.budget > 0) {
        recommendations += `<li>📉 Ha excedido el presupuesto en la categoría <strong>${c.name}</strong> por $${(spent - Number(c.budget)).toFixed(2)}. Considere recortar gastos variables.</li>`;
      }
    });

    // Validar comprobantes faltantes
    const missingReceipts = state.expenses.filter(e => e.amount > 20 && !e.receipt_file).length;
    if (missingReceipts > 0) {
      recommendations += `<li>📎 Tiene ${missingReceipts} transacciones mayores a $20.00 sin comprobantes fiscales o recibos. Adjúntelos para auditorías deducibles.</li>`;
    }

    recommendations += '</ul>';
    recDiv.innerHTML = recommendations;

    applyPrivacyMode();
  }

  // Imprimir Reporte
  document.getElementById('btn-print-report').addEventListener('click', () => {
    window.print();
  });

  // Exportar respaldo de base de datos
  document.getElementById('btn-export-backup').addEventListener('click', () => {
    window.location.href = '/api/backup/export';
  });

  // Comparar meses
  document.getElementById('btn-compare-action').addEventListener('click', async () => {
    const m1 = document.getElementById('compare-month-1').value;
    const m2 = document.getElementById('compare-month-2').value;
    const resDiv = document.getElementById('comparison-results');
    resDiv.innerHTML = '';
    resDiv.classList.remove('hidden');

    try {
      const res = await apiCall(`/api/months/compare?month1Id=${m1}&month2Id=${m2}`);
      
      const monNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const text1 = `${monNames[res.month1.meta.month - 1]} ${res.month1.meta.year}`;
      const text2 = `${monNames[res.month2.meta.month - 1]} ${res.month2.meta.year}`;

      resDiv.innerHTML = `
        <div class="card-premium">
          <h3>${text1} (Principal)</h3>
          <p>Presupuesto: $${Number(res.month1.meta.initial_budget).toFixed(2)}</p>
          <p class="text-success">Ingresos: $${Number(res.month1.incomes).toFixed(2)}</p>
          <p class="text-danger">Gastos: $${Number(res.month1.expenses).toFixed(2)}</p>
          <p><strong>Balance: $${Number(res.month1.balance).toFixed(2)}</strong></p>
        </div>
        <div class="card-premium">
          <h3>${text2} (Contraste)</h3>
          <p>Presupuesto: $${Number(res.month2.meta.initial_budget).toFixed(2)}</p>
          <p class="text-success">Ingresos: $${Number(res.month2.incomes).toFixed(2)}</p>
          <p class="text-danger">Gastos: $${Number(res.month2.expenses).toFixed(2)}</p>
          <p><strong>Balance: $${Number(res.month2.balance).toFixed(2)}</strong></p>
        </div>
      `;
    } catch (err) {
      alertError(err.error || 'Error al comparar meses.');
    }
  });

  // ==========================================
  // BITÁCORA DE ACTIVIDAD (VISTA 13)
  // ==========================================
  async function renderActividad() {
    const tableBody = document.querySelector('#table-audit-logs tbody');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Cargando bitácora de auditoría...</td></tr>';
    
    try {
      const logs = await apiCall('/api/activity');
      tableBody.innerHTML = '';
      if (logs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center">No hay actividad registrada.</td></tr>';
        return;
      }
      
      logs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${formatDate(l.created_at)}</td>
          <td><strong>${l.action}</strong></td>
          <td>${l.details}</td>
          <td><code>${l.ip_address}</code></td>
        `;
        tableBody.appendChild(tr);
      });
    } catch (err) {
      tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error al recuperar bitácora.</td></tr>';
    }
  }

  // ==========================================
  // CONFIGURACIÓN GENERAL (VISTA 14)
  // ==========================================
  function renderConfiguracion() {
    document.getElementById('profile-name').value = state.user.name;
    document.getElementById('profile-email').value = state.user.email;
    document.getElementById('settings-security-pin').value = '';
  }

  // Guardar Perfil
  document.getElementById('form-profile-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('profile-name').value;
    const email = document.getElementById('profile-email').value;

    try {
      const res = await apiCall('/api/auth/update-profile', 'POST', { name, email });
      alertSuccess(res.message);
      state.user.name = name;
      state.user.email = email;
      
      // Actualizar sidebar
      document.getElementById('sidebar-user-name').textContent = name;
      document.getElementById('sidebar-avatar').textContent = name.charAt(0).toUpperCase();
    } catch (err) {
      alertError(err.error || 'Error al actualizar perfil.');
    }
  });

  // Cambiar Contraseña
  document.getElementById('form-change-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('change-pass-curr').value;
    const newPassword = document.getElementById('change-pass-new').value;

    try {
      await apiCall('/api/auth/change-password', 'POST', { currentPassword, newPassword });
      alertSuccess('Contraseña cambiada con éxito.');
      document.getElementById('form-change-password').reset();
    } catch (err) {
      alertError(err.error || 'Error al cambiar contraseña.');
    }
  });

  // Cambiar PIN de seguridad
  document.getElementById('form-pin-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('settings-security-pin').value;

    try {
      await apiCall('/api/auth/change-pin', 'POST', { pin });
      alertSuccess('Configuración de PIN de seguridad actualizada.');
      state.user.hasPin = !!pin;
      document.getElementById('form-pin-settings').reset();
    } catch (err) {
      alertError(err.error || 'Error al actualizar PIN.');
    }
  });

  // Importar CSV
  document.getElementById('form-import-csv').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('import-csv-file');
    if (fileInput.files.length === 0) return;

    const formData = new FormData();
    formData.append('monthConfigId', state.activeMonthId);
    formData.append('file', fileInput.files[0]);

    try {
      const res = await apiCall('/api/backup/import', 'POST', formData, true);
      alertSuccess(res.message);
      fileInput.value = '';
      await loadMonthData();
    } catch (err) {
      alertError(err.error || 'Error al importar archivo CSV.');
    }
  });

  // ==========================================
  // VISTAS DE DIÁLOGOS DE DETALLE Y EXCEPCIONES
  // ==========================================
  async function openTransactionDetail(type, id) {
    els.detailDialogBody.innerHTML = 'Cargando...';
    els.transactionDetailDialog.classList.remove('hidden');

    const exp = state.expenses.find(x => x.id === id);
    if (!exp) return;

    const splitText = exp.split_type !== 'simple' 
      ? `<strong>Compartido:</strong> Persona: ${exp.related_person || 'N/A'}, Detalle: ${exp.split_details || ''}` 
      : 'No';

    els.detailDialogBody.innerHTML = `
      <div class="detail-row"><span class="detail-label">Título:</span><span class="detail-val">${exp.title}</span></div>
      <div class="detail-row"><span class="detail-label">Comercio:</span><span class="detail-val">${exp.merchant || 'Sin Comercio'}</span></div>
      <div class="detail-row"><span class="detail-label">Monto:</span><span class="detail-val text-danger">$${Number(exp.amount).toFixed(2)}</span></div>
      <div class="detail-row"><span class="detail-label">Fecha/Hora:</span><span class="detail-val">${formatDate(exp.date)} ${exp.time}</span></div>
      <div class="detail-row"><span class="detail-label">Categoría:</span><span class="detail-val">${exp.category_name || 'Sin Categoría'}</span></div>
      <div class="detail-row"><span class="detail-label">Subcategoría:</span><span class="detail-val">${exp.subcategory_name || 'Ninguna'}</span></div>
      <div class="detail-row"><span class="detail-label">Método Pago:</span><span class="detail-val">${exp.payment_method.replace('_', ' ')}</span></div>
      <div class="detail-row"><span class="detail-label">Cuenta/Tarjeta:</span><span class="detail-val">${exp.account_name || 'Efectivo'}</span></div>
      <div class="detail-row"><span class="detail-label">Tipo:</span><span class="detail-val">${exp.expense_type}</span></div>
      <div class="detail-row"><span class="detail-label">Estado:</span><span class="detail-val">${exp.status}</span></div>
      <div class="detail-row"><span class="detail-label">¿Deducible?:</span><span class="detail-val">${exp.is_deducible === 1 ? 'Sí' : 'No'}</span></div>
      <div class="detail-row"><span class="detail-label">¿Necesario?:</span><span class="detail-val">${exp.is_necessary === 1 ? 'Sí' : 'No'}</span></div>
      <div class="detail-row"><span class="detail-label">¿Planificado?:</span><span class="detail-val">${exp.is_planned === 1 ? 'Sí' : 'No'}</span></div>
      <div class="detail-row"><span class="detail-label">¿Dividido?:</span><span class="detail-val">${splitText}</span></div>
      <div class="detail-row"><span class="detail-label">Notas:</span><span class="detail-val">${exp.notes || 'Ninguna'}</span></div>
    `;

    applyPrivacyMode();
  }

  els.btnCloseDetailDialog.addEventListener('click', () => {
    els.transactionDetailDialog.classList.add('hidden');
  });

  // ==========================================
  // NOTIFICACIONES Y ALERTAS DE SISTEMA (BANNER)
  // ==========================================
  function processSmartAlerts() {
    const list = els.notificationsList;
    const badge = els.notifBadge;
    const banner = document.getElementById('dashboard-alerts');
    
    list.innerHTML = '';
    if (banner) banner.innerHTML = '';
    
    let alerts = [];

    // 1. Alerta de Presupuesto General
    const totalExpenses = state.expenses.reduce((acc, e) => e.status === 'pagado' ? acc + e.amount : acc, 0);
    const budget = state.activeMonthConfig.initial_budget;
    const pct = budget > 0 ? (totalExpenses / budget) * 100 : 0;
    
    if (pct >= 90) {
      alerts.push({ type: 'danger', icon: 'alert-triangle', text: `¡Crítico! Ha consumido el ${Number(pct).toFixed(0)}% del presupuesto mensual disponible.` });
    } else if (pct >= 75) {
      alerts.push({ type: 'warning', icon: 'alert-circle', text: `Cuidado: Ha superado el ${Number(pct).toFixed(0)}% de su presupuesto mensual.` });
    }

    // 2. Alerta de Comprobantes Faltantes en montos altos
    const missing = state.expenses.filter(e => e.amount > 20 && !e.receipt_file);
    if (missing.length > 0) {
      alerts.push({ type: 'warning', icon: 'file-warning', text: `Tiene ${missing.length} gastos mayores a $20 sin comprobante adjunto.` });
    }

    // 3. Alertas por Categoría
    state.categories.forEach(c => {
      const spent = state.expenses.reduce((acc, e) => (e.status === 'pagado' && e.category_id === c.id) ? acc + e.amount : acc, 0);
      if (spent > c.budget && c.budget > 0) {
        alerts.push({ type: 'danger', icon: 'zap', text: `¡Sobrepasado! Gastó $${Number(spent).toFixed(0)} en ${c.name} (Límite: $${Number(c.budget).toFixed(0)}).` });
      }
    });

    // Pintar alertas
    if (alerts.length === 0) {
      list.innerHTML = '<div class="empty-notif">No hay alertas financieras activas.</div>';
      badge.classList.add('hidden');
      return;
    }

    badge.classList.remove('hidden');

    alerts.forEach(a => {
      // Poblar Dropdown Header
      const item = document.createElement('div');
      item.className = `alert-notif-item ${a.type}`;
      item.innerHTML = `<i data-lucide="${a.icon}"></i> <span>${a.text}</span>`;
      list.appendChild(item);

      // Poblar Banner de Dashboard
      if (banner) {
        const div = document.createElement('div');
        div.className = `smart-alert ${a.type}`;
        div.innerHTML = `
          <div class="smart-alert-content">
            <i data-lucide="${a.icon}"></i>
            <span>${a.text}</span>
          </div>
          <button class="btn-close-alert" onclick="this.parentElement.remove()"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
        `;
        banner.appendChild(div);
      }
    });

    lucide.createIcons();
  }

  // Regla Inteligente: check de límite presupuesto en formulario
  function checkCategoryBudgetLimit(categoryId) {
    const c = state.categories.find(x => String(x.id) === String(categoryId));
    if (c && c.budget > 0) {
      const spent = state.expenses.reduce((acc, e) => (e.status === 'pagado' && e.category_id === c.id) ? acc + e.amount : acc, 0);
      if (spent >= c.budget) {
        alertError(`⚠️ Atención: Ya ha consumido el 100% de la categoría ${c.name}.`);
      }
    }
  }

  // Notificaciones campana click toggle
  els.btnNotifications.addEventListener('click', (e) => {
    e.stopPropagation();
    els.notificationsDropdown.classList.toggle('hidden');
  });
  
  document.addEventListener('click', () => {
    els.notificationsDropdown.classList.add('hidden');
  });

  // ==========================================
  // BOTONES ACCIÓN RÁPIDA DE DASHBOARD
  // ==========================================
  document.getElementById('quick-add-expense').addEventListener('click', () => {
    window.location.hash = '#gastos';
  });
  document.getElementById('quick-add-income').addEventListener('click', () => {
    window.location.hash = '#ingresos';
  });
  document.getElementById('quick-upload-receipt').addEventListener('click', () => {
    window.location.hash = '#comprobantes';
  });
  document.getElementById('quick-view-cards').addEventListener('click', () => {
    window.location.hash = '#tarjetas';
  });

  // ==========================================
  // HELPERS GENERALES
  // ==========================================
  function formatCurrency(val) {
    const symbol = state.activeMonthConfig ? state.activeMonthConfig.currency : '$';
    return `${symbol}${Number(val).toFixed(2)}`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function getDaysInMonth(month, year) {
    return new Date(year, month, 0).getDate();
  }

  function lightenColor(color, percent) {
    // Helper básico de gradiente oscurecedor
    return color;
  }

  // Banners de Alerta Visual Temporales
  function alertSuccess(msg) {
    // Simular un banner Toast flotante premium en esquina superior
    showToast(msg, 'success');
  }

  function alertError(msg) {
    showToast(msg, 'danger');
  }

  function showToast(msg, type) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast-notification';
      toast.style.position = 'fixed';
      toast.style.top = '20px';
      toast.style.right = '20px';
      toast.style.padding = '1rem 1.5rem';
      toast.style.borderRadius = '8px';
      toast.style.zIndex = '500';
      toast.style.fontWeight = '600';
      toast.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)';
      toast.style.transition = 'all 0.3s ease';
      document.body.appendChild(toast);
    }
    
    toast.textContent = msg;
    if (type === 'success') {
      toast.style.backgroundColor = '#10B981';
      toast.style.color = '#fff';
    } else {
      toast.style.backgroundColor = '#EF4444';
      toast.style.color = '#fff';
    }
    
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
    }, 3000);
  }

  function initCommandPalette() {
    const dialog = document.getElementById('command-palette-dialog');
    const input = document.getElementById('command-search-input');
    const results = document.getElementById('command-palette-results');
    const btnOpen = document.getElementById('btn-open-search');

    if (!dialog || !input || !results) return;

    function openPalette() {
      dialog.classList.remove('hidden');
      input.value = '';
      renderResults('');
      setTimeout(() => input.focus(), 50);
    }

    function closePalette() {
      dialog.classList.add('hidden');
    }

    if (btnOpen) {
      // Remover listeners anteriores
      const newBtn = btnOpen.cloneNode(true);
      btnOpen.parentNode.replaceChild(newBtn, btnOpen);
      newBtn.addEventListener('click', openPalette);
    }

    // Atajo de teclado global
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
      }
      if (e.key === 'Escape') {
        closePalette();
      }
    };
    window.removeEventListener('keydown', handleKey);
    window.addEventListener('keydown', handleKey);

    // Cerrar al hacer clic fuera del card
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        closePalette();
      }
    });

    input.addEventListener('input', (e) => {
      renderResults(e.target.value.trim());
    });

    const navItems = [
      { text: '📊 Ver Dashboard (Resumen General)', hash: '#dashboard' },
      { text: '⚙️ Configurar Periodo Mensual', hash: '#config-mes' },
      { text: '📈 Gestionar Ingresos', hash: '#ingresos' },
      { text: '📉 Registrar Gastos del Mes', hash: '#gastos' },
      { text: '💳 Administrar Cuentas y Tarjetas', hash: '#tarjetas' },
      { text: '🏷️ Configurar Categorías de Gastos', hash: '#categorias' },
      { text: '🔄 Planificar Gastos Recurrentes', hash: '#recurrentes' },
      { text: '💸 Controlar Deudas y Préstamos', hash: '#deudas' },
      { text: '🐷 Metas de Ahorro y Simulador', hash: '#metas' },
      { text: '📅 Ver Calendario de Vencimientos', hash: '#calendario' },
      { text: '📁 Cargar Comprobantes y PDF', hash: '#comprobantes' },
      { text: '📊 Generar Reportes y Análisis PDF', hash: '#reportes' }
    ];

    function renderResults(query) {
      results.innerHTML = '';
      
      // Comandos rápidos
      if (query.startsWith('+') && query.length > 1) {
        const val = parseFloat(query.substring(1));
        if (!isNaN(val)) {
          const div = document.createElement('div');
          div.className = 'command-item';
          div.style.padding = '0.6rem 0.8rem';
          div.style.borderRadius = 'var(--radius-sm)';
          div.style.cursor = 'pointer';
          div.style.fontSize = '0.85rem';
          div.style.color = 'var(--text-primary)';
          div.style.display = 'flex';
          div.style.alignItems = 'center';
          div.style.gap = '0.5rem';
          div.innerHTML = `<strong>➕ Registrar Ingreso:</strong> Depositar $${val.toFixed(2)}`;
          div.addEventListener('click', () => {
            closePalette();
            window.location.hash = '#ingresos';
            setTimeout(() => {
              const amountField = document.getElementById('inc-amount');
              if (amountField) {
                amountField.value = val;
                amountField.focus();
              }
            }, 150);
          });
          results.appendChild(div);
        }
      }

      if (query.startsWith('-') && query.length > 1) {
        const val = parseFloat(query.substring(1));
        if (!isNaN(val)) {
          const div = document.createElement('div');
          div.className = 'command-item';
          div.style.padding = '0.6rem 0.8rem';
          div.style.borderRadius = 'var(--radius-sm)';
          div.style.cursor = 'pointer';
          div.style.fontSize = '0.85rem';
          div.style.color = 'var(--text-primary)';
          div.style.display = 'flex';
          div.style.alignItems = 'center';
          div.style.gap = '0.5rem';
          div.innerHTML = `<strong>➖ Registrar Gasto:</strong> Retirar $${val.toFixed(2)}`;
          div.addEventListener('click', () => {
            closePalette();
            window.location.hash = '#gastos';
            setTimeout(() => {
              const amountField = document.getElementById('exp-amount');
              if (amountField) {
                amountField.value = val;
                amountField.focus();
              }
            }, 150);
          });
          results.appendChild(div);
        }
      }

      const filtered = navItems.filter(item => 
        item.text.toLowerCase().includes(query.toLowerCase())
      );

      if (filtered.length === 0 && results.children.length === 0) {
        results.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 1rem;">No se encontraron resultados.</div>';
        return;
      }

      filtered.forEach(item => {
        const div = document.createElement('div');
        div.className = 'command-item';
        div.style.padding = '0.6rem 0.8rem';
        div.style.borderRadius = 'var(--radius-sm)';
        div.style.cursor = 'pointer';
        div.style.fontSize = '0.85rem';
        div.style.color = 'var(--text-primary)';
        div.style.transition = 'background 0.15s ease';
        div.textContent = item.text;
        
        div.addEventListener('mouseenter', () => {
          div.style.background = 'rgba(99, 102, 241, 0.1)';
        });
        div.addEventListener('mouseleave', () => {
          div.style.background = 'transparent';
        });

        div.addEventListener('click', () => {
          closePalette();
          window.location.hash = item.hash;
        });
        results.appendChild(div);
      });
      lucide.createIcons();
    }
  }

  // ==========================================
  // INICIO AL CARGAR PAGINA
  // ==========================================
  apiCall('/api/auth/me')
    .then(res => {
      state.user = res.user;
      bootstrapApp().then(() => {
        initCommandPalette();
        router();
      });
    })
    .catch(() => {
      state.user = null;
      router();
    });

  // Registro de Service Worker para PWA (offline e instalación)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('PWA Service Worker registrado con éxito:', reg.scope))
        .catch(err => console.warn('Error al registrar PWA Service Worker:', err));
    });
  }
});
