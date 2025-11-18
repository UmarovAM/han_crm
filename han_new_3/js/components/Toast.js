// ============================================
// TOAST - УВЕДОМЛЕНИЯ HAN CRM v3.1
// ============================================

/**
 * Система всплывающих уведомлений
 * Использование: Toast.success('Сохранено!'), Toast.error('Ошибка!')
 */
const Toast = {
  /**
   * Контейнер для уведомлений (создаётся автоматически)
   */
  container: null,
  
  /**
   * Инициализация (создание контейнера)
   */
  init() {
    if (this.container) return;
    
    // Создаём контейнер
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
    
    Utils.log('Toast: Initialized');
  },
  
  /**
   * Показать уведомление
   * @param {string} message - Текст сообщения
   * @param {string} type - Тип: success, error, warning, info
   * @param {number} duration - Длительность показа (мс)
   */
  show(message, type = 'info', duration = null) {
    // Инициализируем контейнер, если ещё не создан
    if (!this.container) {
      this.init();
    }
    
    // Определяем длительность по типу
    if (!duration) {
      duration = type === 'error' 
        ? CONFIG.TOAST_ERROR_DURATION 
        : type === 'success'
          ? CONFIG.TOAST_SUCCESS_DURATION
          : CONFIG.TOAST_DURATION;
    }
    
    // Создаём элемент уведомления
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Иконка в зависимости от типа
    const icons = {
      success: '<i class="fas fa-check-circle"></i>',
      error: '<i class="fas fa-exclamation-circle"></i>',
      warning: '<i class="fas fa-exclamation-triangle"></i>',
      info: '<i class="fas fa-info-circle"></i>'
    };
    
    toast.innerHTML = `
      <div class="toast-icon">${icons[type]}</div>
      <div class="toast-message">${Utils.escapeHtml(message)}</div>
      <button class="toast-close" onclick="Toast.close(this.parentElement)">
        <i class="fas fa-times"></i>
      </button>
    `;
    
    // Добавляем в контейнер
    this.container.appendChild(toast);
    
    // Анимация появления
    setTimeout(() => {
      toast.classList.add('toast-show');
    }, 10);
    
    // Автоматическое скрытие
    const timeoutId = setTimeout(() => {
      this.close(toast);
    }, duration);
    
    // Сохраняем ID таймаута для возможности отмены
    toast.dataset.timeoutId = timeoutId;
    
    return toast;
  },
  
  /**
   * Закрыть уведомление
   * @param {HTMLElement} toast - Элемент уведомления
   */
  close(toast) {
    if (!toast) return;
    
    // Отменяем таймаут автозакрытия
    if (toast.dataset.timeoutId) {
      clearTimeout(parseInt(toast.dataset.timeoutId));
    }
    
    // Анимация скрытия
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    
    // Удаляем из DOM через 300мс
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  },
  
  /**
   * Успешное уведомление
   * @param {string} message
   * @param {number} duration
   */
  success(message, duration = null) {
    return this.show(message, 'success', duration);
  },
  
  /**
   * Ошибка
   * @param {string} message
   * @param {number} duration
   */
  error(message, duration = null) {
    return this.show(message, 'error', duration);
  },
  
  /**
   * Предупреждение
   * @param {string} message
   * @param {number} duration
   */
  warning(message, duration = null) {
    return this.show(message, 'warning', duration);
  },
  
  /**
   * Информация
   * @param {string} message
   * @param {number} duration
   */
  info(message, duration = null) {
    return this.show(message, 'info', duration);
  },
  
  /**
   * Закрыть все уведомления
   */
  closeAll() {
    if (!this.container) return;
    
    const toasts = this.container.querySelectorAll('.toast');
    toasts.forEach(toast => this.close(toast));
  },
  
  /**
   * Уведомление из ответа API (автоматически определяет тип)
   * @param {Object} response - Ответ от API
   */
  fromResponse(response) {
    if (response.success) {
      const message = response.message || 'Операция выполнена успешно';
      this.success(message);
    } else {
      const message = response.error?.message || response.message || 'Произошла ошибка';
      this.error(message);
    }
  },
  
  /**
   * Уведомление из ошибки
   * @param {Error|APIError} error
   */
  fromError(error) {
    const message = error.message || 'Произошла неизвестная ошибка';
    this.error(message);
  }
};

// Заморозить объект
Object.freeze(Toast);

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
  Toast.init();
});