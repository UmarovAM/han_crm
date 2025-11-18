// ============================================
// АВТОРИЗАЦИЯ И РОЛИ HAN CRM v3.1
// ============================================

/**
 * Система авторизации и управления правами доступа
 * Соответствует backend permissions
 */
const Auth = {
  // Матрица прав доступа (соответствует backend)
  PERMISSIONS: {
    admin: {
      sales: { view: true, create: true, delete: true },
      clients: { view: true, create: true, edit: true, delete: true },
      products: { view: true, create: true, edit: true, delete: true },
      production: { view: true, create: true, delete: true },
      writeoffs: { view: true, create: true, delete: true },
      payments: { view: true, create: true, delete: true },
      stock: { view: true, edit: true },
      reports: { view: true, export: true },
      users: { view: true, create: true, edit: true, delete: true },
      overpayments: { withdraw: true }
    },
    
    manager: {
      sales: { view: true, create: true, delete: false },
      clients: { view: true, create: true, edit: true, delete: false },
      products: { view: true, create: true, edit: true, delete: false },
      production: { view: true, create: true, delete: false },
      writeoffs: { view: true, create: true, delete: false },
      payments: { view: true, create: true, delete: false },
      stock: { view: true, edit: true },
      reports: { view: true, export: true },
      users: { view: false, create: false, edit: false, delete: false },
      overpayments: { withdraw: false }
    },
    
    cashier: {
      sales: { view: true, create: true, delete: false },
      clients: { view: true, create: false, edit: false, delete: false },
      products: { view: true, create: false, edit: false, delete: false },
      production: { view: false, create: false, delete: false },
      writeoffs: { view: false, create: false, delete: false },
      payments: { view: true, create: true, delete: false },
      stock: { view: true, edit: false },
      reports: { view: false, export: false },
      users: { view: false, create: false, edit: false, delete: false },
      overpayments: { withdraw: false }
    }
  },
  
  /**
   * Авторизация пользователя
   * @param {string} login
   * @param {string} password
   * @returns {Promise<Object>} - Данные пользователя
   */
  async login(login, password) {
    try {
      // Отправляем запрос на backend
      const response = await API.post('auth.php?action=login', {
        login,
        password
      });
      
      // Backend возвращает: { success: true, data: { user: {...}, session_id: "..." } }
      if (response.success && response.data) {
        const { user, session_id } = response.data;
        
        // Сохраняем токен и данные пользователя
        Storage.setAuthToken(session_id);
        Storage.setUser(user);
        
        Utils.log('Auth: Login successful', user);
        
        // Запускаем проверку сессии
        this.startSessionCheck();
        
        return user;
      }
      
      throw new Error('Неверный ответ сервера');
      
    } catch (error) {
      Utils.error('Auth: Login failed', error);
      throw error;
    }
  },
  
  /**
   * Выход из системы
   */
  async logout() {
    try {
      // Пытаемся уведомить backend
      try {
        await API.post('auth.php?action=logout');
      } catch (e) {
        // Игнорируем ошибку, всё равно чистим локальные данные
      }
      
      // Останавливаем проверку сессии
      this.stopSessionCheck();
      
      // Очищаем хранилище
      Storage.clearAuth();
      
      Utils.log('Auth: Logout successful');
      
      // Перенаправляем на страницу входа
      window.location.href = CONFIG.ROUTES.LOGIN;
      
    } catch (error) {
      Utils.error('Auth: Logout error', error);
      
      // В любом случае чистим и редиректим
      Storage.clearAuth();
      window.location.href = CONFIG.ROUTES.LOGIN;
    }
  },
  
  /**
   * Проверка авторизации
   * @returns {boolean}
   */
  isAuthenticated() {
    const token = Storage.getAuthToken();
    const user = Storage.getUser();
    
    return !!(token && user);
  },
  
  /**
   * Получить текущего пользователя
   * @returns {Object|null}
   */
  getUser() {
    return Storage.getUser();
  },
  
  /**
   * Получить роль текущего пользователя
   * @returns {string|null}
   */
  getUserRole() {
    const user = this.getUser();
    return user ? user.role : null;
  },
  
  /**
   * Проверка роли пользователя
   * @param {string|string[]} allowedRoles - Разрешённая роль или массив ролей
   * @returns {boolean}
   */
  hasRole(allowedRoles) {
    const userRole = this.getUserRole();
    if (!userRole) return false;
    
    if (Array.isArray(allowedRoles)) {
      return allowedRoles.includes(userRole);
    }
    
    return userRole === allowedRoles;
  },
  
  /**
   * Проверка права доступа
   * @param {string} module - Модуль (например: 'sales', 'clients')
   * @param {string} action - Действие (например: 'view', 'create', 'edit', 'delete')
   * @returns {boolean}
   */
  can(module, action) {
    const userRole = this.getUserRole();
    if (!userRole) return false;
    
    const permissions = this.PERMISSIONS[userRole];
    if (!permissions) return false;
    
    const modulePermissions = permissions[module];
    if (!modulePermissions) return false;
    
    return modulePermissions[action] === true;
  },
  
  /**
   * Проверка доступа к странице
   * @param {string} page - Название страницы
   * @returns {boolean}
   */
  canAccessPage(page) {
    const userRole = this.getUserRole();
    if (!userRole) return false;
    
    // Admin имеет доступ ко всем страницам
    if (userRole === CONFIG.ROLES.ADMIN) return true;
    
    // Карта доступа к страницам по ролям
    const pageAccess = {
      dashboard: ['admin', 'manager', 'cashier'],
      sales: ['admin', 'manager', 'cashier'],
      clients: ['admin', 'manager', 'cashier'],
      products: ['admin', 'manager', 'cashier'],
      production: ['admin', 'manager'],
      writeoffs: ['admin', 'manager'],
      stock: ['admin', 'manager', 'cashier'],
      reports: ['admin', 'manager']
    };
    
    const allowedRoles = pageAccess[page];
    if (!allowedRoles) return false;
    
    return allowedRoles.includes(userRole);
  },
  
  /**
   * Проверить сессию на сервере
   * @returns {Promise<boolean>}
   */
  async verifySession() {
    try {
      const response = await API.get('auth.php?action=verify');
      
      if (response.success && response.data) {
        // Обновляем данные пользователя (на случай изменений)
        Storage.setUser(response.data.user);
        return true;
      }
      
      return false;
      
    } catch (error) {
      Utils.error('Auth: Session verification failed', error);
      return false;
    }
  },
  
  /**
   * Периодическая проверка сессии
   */
  sessionCheckInterval: null,
  
  startSessionCheck() {
    // Останавливаем предыдущий интервал (если был)
    this.stopSessionCheck();
    
    // Запускаем новый
    this.sessionCheckInterval = setInterval(async () => {
      Utils.log('Auth: Checking session...');
      
      const isValid = await this.verifySession();
      
      if (!isValid) {
        Utils.log('Auth: Session expired');
        this.logout();
      }
    }, CONFIG.SESSION_CHECK_INTERVAL);
  },
  
  stopSessionCheck() {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
  },
  
  /**
   * Требовать авторизацию (для использования на страницах)
   * Если не авторизован - редирект на логин
   */
  requireAuth() {
    if (!this.isAuthenticated()) {
      Utils.log('Auth: Not authenticated, redirecting to login');
      window.location.href = CONFIG.ROUTES.LOGIN;
      return false;
    }
    return true;
  },
  
  /**
   * Требовать определённую роль
   * Если роль не подходит - редирект на dashboard или показать ошибку
   * @param {string|string[]} allowedRoles
   */
  requireRole(allowedRoles) {
    if (!this.requireAuth()) return false;
    
    if (!this.hasRole(allowedRoles)) {
      Utils.log('Auth: Insufficient permissions', allowedRoles);
      
      // Показываем ошибку (если Toast уже загружен)
      if (typeof Toast !== 'undefined') {
        Toast.error('У вас нет прав для доступа к этой странице');
      } else {
        alert('У вас нет прав для доступа к этой странице');
      }
      
      // Редирект на dashboard через секунду
      setTimeout(() => {
        window.location.href = CONFIG.ROUTES.DASHBOARD;
      }, 1000);
      
      return false;
    }
    
    return true;
  },
  
  /**
   * Требовать право доступа
   * @param {string} module
   * @param {string} action
   * @returns {boolean}
   */
  requirePermission(module, action) {
    if (!this.requireAuth()) return false;
    
    if (!this.can(module, action)) {
      Utils.log('Auth: Permission denied', module, action);
      
      if (typeof Toast !== 'undefined') {
        Toast.error('У вас нет прав для выполнения этого действия');
      } else {
        alert('У вас нет прав для выполнения этого действия');
      }
      
      return false;
    }
    
    return true;
  },
  
  /**
   * Получить название роли для отображения
   * @param {string} role
   * @returns {string}
   */
  getRoleName(role) {
    return CONFIG.ROLE_NAMES[role] || role;
  }
};

// Заморозить объект
Object.freeze(Auth);