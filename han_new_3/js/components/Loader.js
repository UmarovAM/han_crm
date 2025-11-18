// ============================================
// LOADER - ИНДИКАТОР ЗАГРУЗКИ HAN CRM v3.1
// ============================================

/**
 * Глобальный индикатор загрузки (overlay на весь экран)
 * Использование: Loader.show(), Loader.hide()
 */
const Loader = {
  /**
   * Элемент лоадера
   */
  element: null,
  
  /**
   * Счётчик активных загрузок (для вложенных вызовов)
   */
  counter: 0,
  
  /**
   * Инициализация
   */
  init() {
    if (this.element) return;
    
    // Создаём overlay
    this.element = document.createElement('div');
    this.element.id = 'global-loader';
    this.element.className = 'loader-overlay';
    this.element.innerHTML = `
      <div class="loader-content">
        <div class="loader-spinner"></div>
        <div class="loader-text">Загрузка...</div>
      </div>
    `;
    
    document.body.appendChild(this.element);
    
    Utils.log('Loader: Initialized');
  },
  
  /**
   * Показать индикатор
   * @param {string} text - Текст загрузки (опционально)
   */
  show(text = 'Загрузка...') {
    // Инициализируем, если ещё не создан
    if (!this.element) {
      this.init();
    }
    
    // Увеличиваем счётчик
    this.counter++;
    
    // Обновляем текст
    const textElement = this.element.querySelector('.loader-text');
    if (textElement) {
      textElement.textContent = text;
    }
    
    // Показываем
    this.element.classList.add('loader-show');
    
    Utils.log('Loader: Show (counter:', this.counter, ')');
  },
  
  /**
   * Скрыть индикатор
   */
  hide() {
    if (!this.element) return;
    
    // Уменьшаем счётчик
    this.counter = Math.max(0, this.counter - 1);
    
    // Скрываем только если счётчик = 0
    if (this.counter === 0) {
      this.element.classList.remove('loader-show');
    }
    
    Utils.log('Loader: Hide (counter:', this.counter, ')');
  },
  
  /**
   * Принудительно скрыть (сбросить счётчик)
   */
  forceHide() {
    this.counter = 0;
    if (this.element) {
      this.element.classList.remove('loader-show');
    }
    Utils.log('Loader: Force hide');
  },
  
  /**
   * Обернуть async функцию в показ лоадера
   * @param {Function} asyncFn - Асинхронная функция
   * @param {string} text - Текст загрузки
   * @returns {Function}
   */
  wrap(asyncFn, text = 'Загрузка...') {
    return async (...args) => {
      this.show(text);
      try {
        const result = await asyncFn(...args);
        return result;
      } finally {
        this.hide();
      }
    };
  }
};

/**
 * Локальный лоадер (для конкретного элемента)
 * Использование: LocalLoader.show('#my-table'), LocalLoader.hide('#my-table')
 */
const LocalLoader = {
  /**
   * Показать лоадер внутри элемента
   * @param {string|HTMLElement} target - Селектор или элемент
   * @param {string} text - Текст загрузки
   */
  show(target, text = 'Загрузка...') {
    const element = typeof target === 'string' 
      ? document.querySelector(target) 
      : target;
    
    if (!element) {
      Utils.error('LocalLoader: Element not found', target);
      return;
    }
    
    // Проверяем, есть ли уже лоадер
    let loader = element.querySelector('.local-loader');
    
    if (!loader) {
      // Создаём лоадер
      loader = document.createElement('div');
      loader.className = 'local-loader';
      loader.innerHTML = `
        <div class="local-loader-content">
          <div class="local-loader-spinner"></div>
          <div class="local-loader-text">${Utils.escapeHtml(text)}</div>
        </div>
      `;
      
      // Делаем родителя relative, если он static
      const position = window.getComputedStyle(element).position;
      if (position === 'static') {
        element.style.position = 'relative';
      }
      
      element.appendChild(loader);
    } else {
      // Обновляем текст
      const textElement = loader.querySelector('.local-loader-text');
      if (textElement) {
        textElement.textContent = text;
      }
    }
    
    // Показываем
    setTimeout(() => {
      loader.classList.add('local-loader-show');
    }, 10);
  },
  
  /**
   * Скрыть локальный лоадер
   * @param {string|HTMLElement} target - Селектор или элемент
   */
  hide(target) {
    const element = typeof target === 'string' 
      ? document.querySelector(target) 
      : target;
    
    if (!element) return;
    
    const loader = element.querySelector('.local-loader');
    if (!loader) return;
    
    // Анимация скрытия
    loader.classList.remove('local-loader-show');
    
    // Удаляем через 300мс
    setTimeout(() => {
      if (loader.parentElement) {
        loader.parentElement.removeChild(loader);
      }
    }, 300);
  },
  
  /**
   * Обернуть async функцию
   * @param {string|HTMLElement} target
   * @param {Function} asyncFn
   * @param {string} text
   * @returns {Function}
   */
  wrap(target, asyncFn, text = 'Загрузка...') {
    return async (...args) => {
      this.show(target, text);
      try {
        const result = await asyncFn(...args);
        return result;
      } finally {
        this.hide(target);
      }
    };
  }
};

// Заморозить объекты
Object.freeze(Loader);
Object.freeze(LocalLoader);

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
  Loader.init();
});