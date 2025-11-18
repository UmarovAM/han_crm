// ============================================
// РОУТЕР HAN CRM v3.1
// ============================================

/**
 * Роутер для защиты страниц по ролям
 * Автоматически проверяет права доступа при загрузке страницы
 */
const Router = {
  /**
   * Карта страниц и их требований к доступу
   */
  routes: {
    // Публичная страница (без проверки авторизации)
    '/login.html': {
      public: true,
      redirectIfAuth: CONFIG.ROUTES.DASHBOARD
    },
    
    // Защищённые страницы
    '/index.html': {
      requireAuth: true,
      redirect: CONFIG.ROUTES.DASHBOARD
    },
    
    '/pages/dashboard.html': {
      requireAuth: true,
      allowedRoles: ['admin', 'manager', 'cashier']
    },
    
    '/pages/sales.html': {
      requireAuth: true,
      allowedRoles: ['admin', 'manager', 'cashier'],
      requiredPermission: { module: 'sales', action: 'view' }
    },
    
    '/pages/clients.html': {
      requireAuth: true,
      allowedRoles: ['admin', 'manager', 'cashier'],
      requiredPermission: { module: 'clients', action: 'view' }
    },
    
    '/pages/products.html': {
      requireAuth: true,
      allowedRoles: ['admin', 'manager', 'cashier'],
      requiredPermission: { module: 'products', action: 'view' }
    },
    
    '/pages/production.html': {
      requireAuth: true,
      allowedRoles: ['admin', 'manager'],
      requiredPermission: { module: 'production', action: 'view' }
    },
    
    '/pages/writeoffs.html': {
      requireAuth: true,
      allowedRoles: ['admin', 'manager'],
      requiredPermission: { module: 'writeoffs', action: 'view' }
    },
    
    '/pages/stock.html': {
      requireAuth: true,
      allowedRoles: ['admin', 'manager', 'cashier'],
      requiredPermission: { module: 'stock', action: 'view' }
    },
    
    '/pages/reports.html': {
      requireAuth: true,
      allowedRoles: ['admin', 'manager'],
      requiredPermission: { module: 'reports', action: 'view' }
    }
  },
  
  /**
   * Получить текущий путь страницы
   * @returns {string}
   */
  getCurrentPath() {
    return window.location.pathname;
  },
  
  /**
   * Получить конфигурацию текущей страницы
   * @returns {Object|null}
   */
  getCurrentRoute() {
    const path = this.getCurrentPath();
    return this.routes[path] || null;
  },
  
  /**
   * Проверить доступ к текущей странице
   * @returns {boolean}
   */
  checkAccess() {
    const route = this.getCurrentRoute();
    
    // Если маршрут не определён - разрешаем (для статических файлов и т.д.)
    if (!route) {
      Utils.log('Router: Route not defined, allowing access');
      return true;
    }
    
    // Публичная страница
    if (route.public) {
      // Если авторизован и есть redirectIfAuth - редиректим
      if (route.redirectIfAuth && Auth.isAuthenticated()) {
        Utils.log('Router: Already authenticated, redirecting to', route.redirectIfAuth);
        this.navigate(route.redirectIfAuth);
        return false;
      }
      return true;
    }
    
    // Требуется авторизация
    if (route.requireAuth && !Auth.isAuthenticated()) {
      Utils.log('Router: Not authenticated, redirecting to login');
      this.navigate(CONFIG.ROUTES.LOGIN);
      return false;
    }
    
    // Проверка роли
    if (route.allowedRoles && !Auth.hasRole(route.allowedRoles)) {
      Utils.log('Router: Role not allowed, redirecting to dashboard');
      
      if (typeof Toast !== 'undefined') {
        Toast.error('У вас нет прав для доступа к этой странице');
      }
      
      this.navigate(CONFIG.ROUTES.DASHBOARD);
      return false;
    }
    
    // Проверка конкретного права
    if (route.requiredPermission) {
      const { module, action } = route.requiredPermission;
      
      if (!Auth.can(module, action)) {
        Utils.log('Router: Permission denied, redirecting to dashboard');
        
        if (typeof Toast !== 'undefined') {
          Toast.error('У вас нет прав для доступа к этой странице');
        }
        
        this.navigate(CONFIG.ROUTES.DASHBOARD);
        return false;
      }
    }
    
    // Если есть редирект - выполняем
    if (route.redirect) {
      Utils.log('Router: Redirecting to', route.redirect);
      this.navigate(route.redirect);
      return false;
    }
    
    Utils.log('Router: Access granted');
    return true;
  },
  
  /**
   * Навигация на другую страницу
   * @param {string} path - Путь
   */
  navigate(path) {
    window.location.href = path;
  },
  
  /**
   * Обновить текущую страницу
   */
  reload() {
    window.location.reload();
  },
  
  /**
   * Вернуться назад
   */
  back() {
    window.history.back();
  },
  
  /**
   * Инициализация роутера (вызывается при загрузке страницы)
   */
  init() {
    Utils.log('Router: Initializing...');
    
    // Проверяем доступ
    const hasAccess = this.checkAccess();
    
    if (hasAccess) {
      // Обновляем навигационное меню
      this.updateNavigation();
      
      // Отображаем информацию о пользователе
      this.updateUserInfo();
    }
    
    // Добавляем обработчик клика по кнопке выхода
    this.attachLogoutHandler();
    
    return hasAccess;
  },
  
  /**
   * Обновить навигационное меню (скрыть недоступные пункты)
   */
  updateNavigation() {
    if (!Auth.isAuthenticated()) return;
    
    const user = Auth.getUser();
    if (!user) return;
    
    // Скрываем/показываем пункты меню в зависимости от роли
    const menuItems = {
      'nav-sales': Auth.can('sales', 'view'),
      'nav-clients': Auth.can('clients', 'view'),
      'nav-products': Auth.can('products', 'view'),
      'nav-production': Auth.can('production', 'view'),
      'nav-writeoffs': Auth.can('writeoffs', 'view'),
      'nav-stock': Auth.can('stock', 'view'),
      'nav-reports': Auth.can('reports', 'view')
    };
    
    Object.keys(menuItems).forEach(menuId => {
      const menuElement = document.getElementById(menuId);
      if (menuElement) {
        menuElement.style.display = menuItems[menuId] ? '' : 'none';
      }
    });
    
    // Подсвечиваем активный пункт меню
    this.highlightActiveMenuItem();
  },
  
  /**
   * Подсветить активный пункт меню
   */
  highlightActiveMenuItem() {
    const currentPath = this.getCurrentPath();
    
    // Убираем активный класс со всех пунктов
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    
    // Добавляем активный класс к текущему пункту
    const activeLink = document.querySelector(`.nav-link[href="${currentPath}"]`);
    if (activeLink) {
      activeLink.classList.add('active');
    }
  },
  
  /**
   * Обновить информацию о пользователе в шапке
   */
  updateUserInfo() {
    if (!Auth.isAuthenticated()) return;
    
    const user = Auth.getUser();
    if (!user) return;
    
    // Имя пользователя
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) {
      userNameElement.textContent = user.name;
    }
    
    // Роль пользователя
    const userRoleElement = document.getElementById('user-role');
    if (userRoleElement) {
      userRoleElement.textContent = Auth.getRoleName(user.role);
    }
    
    // Логин пользователя
    const userLoginElement = document.getElementById('user-login');
    if (userLoginElement) {
      userLoginElement.textContent = user.login;
    }
  },
  
  /**
   * Привязать обработчик выхода
   */
  attachLogoutHandler() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        if (confirm('Вы действительно хотите выйти?')) {
          await Auth.logout();
        }
      });
    }
  },
  
  /**
   * Скрыть элемент, если нет права
   * @param {string} elementId - ID элемента
   * @param {string} module - Модуль
   * @param {string} action - Действие
   */
  hideIfNoPerm(elementId, module, action) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    if (!Auth.can(module, action)) {
      element.style.display = 'none';
    }
  },
  
  /**
   * Отключить элемент, если нет права
   * @param {string} elementId - ID элемента
   * @param {string} module - Модуль
   * @param {string} action - Действие
   */
  disableIfNoPerm(elementId, module, action) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    if (!Auth.can(module, action)) {
      element.disabled = true;
      element.title = 'У вас нет прав для этого действия';
    }
  }
};

// Заморозить объект
Object.freeze(Router);

// ============================================
// АВТОМАТИЧЕСКАЯ ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  Utils.log('=== HAN CRM v' + CONFIG.VERSION + ' ===');
  
  // Инициализируем роутер
  Router.init();
});