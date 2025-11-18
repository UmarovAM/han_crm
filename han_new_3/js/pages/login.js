// js/pages/LoginPage.js
// Страница авторизации

import { AuthService } from '../services/auth.service.js';
import { Toast } from '../components/Toast.js';
import { router } from '../router.js';

export class LoginPage {
  render() {
    const app = document.getElementById('app');
    
    app.innerHTML = `
      <div class="login-page">
        <div class="login-container">
          <div class="login-card">
            <div class="login-header">
              <i class="fas fa-seedling"></i>
              <h1>HAN Seeds CRM</h1>
              <p>Система управления продажами</p>
            </div>
            
            <form id="loginForm" class="login-form">
              <div class="form-group">
                <label>
                  <i class="fas fa-user"></i>
                  Логин
                </label>
                <input 
                  type="text" 
                  id="loginInput" 
                  class="form-control" 
                  placeholder="Введите логин"
                  required
                  autocomplete="username"
                />
              </div>
              
              <div class="form-group">
                <label>
                  <i class="fas fa-lock"></i>
                  Пароль
                </label>
                <input 
                  type="password" 
                  id="passwordInput" 
                  class="form-control" 
                  placeholder="Введите пароль"
                  required
                  autocomplete="current-password"
                />
              </div>
              
              <button type="submit" class="btn btn-primary btn-block" id="loginBtn">
                <i class="fas fa-sign-in-alt"></i>
                Войти
              </button>
            </form>
            
            <div class="login-footer">
              <p class="text-muted">© 2024 HAN Seeds</p>
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
    
    // Фокус на первом поле
    document.getElementById('loginInput').focus();
  }

  attachEventListeners() {
    const form = document.getElementById('loginForm');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });
  }

  async handleLogin() {
    const loginInput = document.getElementById('loginInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    
    const login = loginInput.value.trim();
    const password = passwordInput.value;
    
    if (!login || !password) {
      Toast.warning('Заполните все поля');
      return;
    }

    try {
      // Блокируем кнопку
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Вход...';
      
      const user = await AuthService.login(login, password);
      
      Toast.success(`Добро пожаловать, ${user.name}!`);
      
      // Редирект на главную
      setTimeout(() => {
        router.navigate('/');
      }, 500);
      
    } catch (error) {
      Toast.error(error.message || 'Ошибка авторизации');
      
      // Разблокируем кнопку
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти';
      
      // Очищаем пароль
      passwordInput.value = '';
      passwordInput.focus();
    }
  }

  destroy() {
    // Cleanup если нужен
  }
}