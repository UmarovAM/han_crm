// js/router.js
// Роутинг с защитой по ролям

import { AuthService } from './services/auth.service.js';
import { CONFIG } from './config.js';

// Импорт страниц
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { SalesPage } from './pages/SalesPage.js';
import { ClientsPage } from './pages/ClientsPage.js';
import { ProductsPage } from './pages/ProductsPage.js';
import { ProductionPage } from './pages/ProductionPage.js';
import { WriteoffsPage } from './pages/WriteoffsPage.js';
import { StockPage } from './pages/StockPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { UsersPage } from './pages/UsersPage.js';

export class Router {
  constructor() {
    this.routes = this.defineRoutes();
    this.currentPage = null;
    
    // Слушаем изменения hash
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('load', () => this.handleRoute());
  }

  /**
   * Определение маршрутов
   */
  defineRoutes() {
    return {
      '/login': {
        page: LoginPage,
        title: 'Вход',
        requireAuth: false
      },
      '/': {
        page: DashboardPage,
        title: 'Главная',
        requireAuth: true,
        roles: ['admin', 'manager', 'cashier']
      },
      '/sales': {
        page: SalesPage,
        title: 'Продажи',
        requireAuth: true,
        roles: ['admin', 'manager', 'cashier']
      },
      '/clients': {
        page: ClientsPage,
        title: 'Клиенты',
        requireAuth: true,
        roles: ['admin', 'manager', 'cashier']
      },
      '/products': {
        page: ProductsPage,
        title: 'Товары',
        requireAuth: true,
        roles: ['admin', 'manager', 'cashier']
      },
      '/production': {
        page: ProductionPage,
        title: 'Производство',
        requireAuth: true,
        roles: ['admin', 'manager']
      },
      '/writeoffs': {
        page: WriteoffsPage,
        title: 'Списания',
        requireAuth: true,
        roles: ['admin', 'manager']
      },
      '/stock': {
        page: StockPage,
        title: 'Склад',
        requireAuth: true,
        roles: ['admin', 'manager', 'cashier']
      },
      '/reports': {
        page: ReportsPage,
        title: 'Отчёты',
        requireAuth: true,
        roles: ['admin', 'manager']
      },
      '/users': {
        page: UsersPage,
        title: 'Пользователи',
        requireAuth: true,
        roles: ['admin']
      }
    };
  }

  /**
   * Обработка маршрута
   */
  async handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const route = this.routes[hash] || this.routes['/'];

    // Проверка авторизации
    if (route.requireAuth) {
      if (!AuthService.isAuthenticated()) {
        this.navigate('/login');
        return;
      }

      // Проверка истечения сессии
      if (AuthService.isSessionExpired()) {
        await AuthService.logout();
        this.navigate('/login');
        return;
      }

      // Проверка ролей
      if (route.roles && !AuthService.hasRole(route.roles)) {
        this.navigate('/');
        return;
      }
    } else {
      // Если уже авторизован, редиректим с /login на главную
      if (hash === '/login' && AuthService.isAuthenticated()) {
        this.navigate('/');
        return;
      }
    }

    // Отрисовка страницы
    this.renderPage(route);
  }

  /**
   * Отрисовка страницы
   */
  renderPage(route) {
    const appContainer = document.getElementById('app');
    
    // Очищаем контейнер
    appContainer.innerHTML = '';
    
    // Обновляем заголовок
    document.title = `${route.title} — HAN CRM`;
    
    // Отрисовываем навигацию (если авторизован)
    if (route.requireAuth) {
      this.renderNavigation();
    }
    
    // Создаём и отрисовываем страницу
    if (this.currentPage && this.currentPage.destroy) {
      this.currentPage.destroy();
    }
    
    this.currentPage = new route.page();
    this.currentPage.render();
  }

  /**
   * Отрисовка навигации
   */
  renderNavigation() {
    const user = AuthService.getUser();
    const navContainer = document.getElementById('navigation');
    
    if (!navContainer) return;

    const menuItems = [
      { path: '/', icon: 'fa-home', label: 'Главная', roles: ['admin', 'manager', 'cashier'] },
      { path: '/sales', icon: 'fa-shopping-cart', label: 'Продажи', roles: ['admin', 'manager', 'cashier'] },
      { path: '/clients', icon: 'fa-users', label: 'Клиенты', roles: ['admin', 'manager', 'cashier'] },
      { path: '/products', icon: 'fa-box', label: 'Товары', roles: ['admin', 'manager', 'cashier'] },
      { path: '/production', icon: 'fa-industry', label: 'Производство', roles: ['admin', 'manager'] },
      { path: '/writeoffs', icon: 'fa-trash-alt', label: 'Списания', roles: ['admin', 'manager'] },
      { path: '/stock', icon: 'fa-warehouse', label: 'Склад', roles: ['admin', 'manager', 'cashier'] },
      { path: '/reports', icon: 'fa-chart-bar', label: 'Отчёты', roles: ['admin', 'manager'] },
      { path: '/users', icon: 'fa-user-shield', label: 'Пользователи', roles: ['admin'] }
    ];

    const visibleItems = menuItems.filter(item => 
      !item.roles || AuthService.hasRole(item.roles)
    );

    navContainer.innerHTML = `
      <nav class="navbar">
        <div class="navbar-brand">
          <i class="fas fa-seedling"></i>
          <span>HAN CRM</span>
        </div>
        <ul class="navbar-menu">
          ${visibleItems.map(item => `
            <li>
              <a href="#${item.path}" class="nav-link ${window.location.hash === `#${item.path}` ? 'active' : ''}">
                <i class="fas ${item.icon}"></i>
                <span>${item.label}</span>
              </a>
            </li>
          `).join('')}
        </ul>
        <div class="navbar-user">
          <span class="user-name">${user.name}</span>
          <span class="user-role">${this.getRoleLabel(user.role)}</span>
          <button onclick="handleLogout()" class="btn-logout">
            <i class="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </nav>
    `;
  }

  /**
   * Получить метку роли
   */
  getRoleLabel(role) {
    const labels = {
      admin: 'Администратор',
      manager: 'Менеджер',
      cashier: 'Кассир'
    };
    return labels[role] || role;
  }

  /**
   * Навигация программно
   */
  navigate(path) {
    window.location.hash = path;
  }
}

// Глобальная функция для выхода (используется в навигации)
window.handleLogout = async () => {
  if (confirm('Выйти из системы?')) {
    await AuthService.logout();
  }
};

// Экспортируем единственный экземпляр
export const router = new Router();