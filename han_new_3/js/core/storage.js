// ============================================
// РАБОТА С LOCALSTORAGE HAN CRM v3.1
// ============================================

/**
 * Обёртка для безопасной работы с localStorage
 * Автоматически сериализует/десериализует JSON
 * Обрабатывает ошибки
 */
const Storage = {
  /**
   * Сохранить значение
   * @param {string} key - Ключ
   * @param {*} value - Значение (будет сериализовано в JSON)
   * @returns {boolean} - Успешно ли сохранено
   */
  set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
      Utils.log(`Storage: saved "${key}"`);
      return true;
    } catch (error) {
      Utils.error('Storage.set error:', error);
      return false;
    }
  },
  
  /**
   * Получить значение
   * @param {string} key - Ключ
   * @param {*} defaultValue - Значение по умолчанию, если ключ не найден
   * @returns {*} - Десериализованное значение или defaultValue
   */
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      
      if (item === null) {
        return defaultValue;
      }
      
      return JSON.parse(item);
    } catch (error) {
      Utils.error('Storage.get error:', error);
      return defaultValue;
    }
  },
  
  /**
   * Удалить значение
   * @param {string} key - Ключ
   * @returns {boolean}
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
      Utils.log(`Storage: removed "${key}"`);
      return true;
    } catch (error) {
      Utils.error('Storage.remove error:', error);
      return false;
    }
  },
  
  /**
   * Очистить всё хранилище
   * @returns {boolean}
   */
  clear() {
    try {
      localStorage.clear();
      Utils.log('Storage: cleared all');
      return true;
    } catch (error) {
      Utils.error('Storage.clear error:', error);
      return false;
    }
  },
  
  /**
   * Проверить наличие ключа
   * @param {string} key - Ключ
   * @returns {boolean}
   */
  has(key) {
    return localStorage.getItem(key) !== null;
  },
  
  /**
   * Получить все ключи
   * @returns {string[]}
   */
  keys() {
    return Object.keys(localStorage);
  },
  
  /**
   * Получить размер хранилища (приблизительно, в байтах)
   * @returns {number}
   */
  size() {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length + key.length;
      }
    }
    return total;
  },
  
  /**
   * Проверка доступности localStorage
   * @returns {boolean}
   */
  isAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (error) {
      return false;
    }
  },
  
  // ============================================
  // СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ HAN CRM
  // ============================================
  
  /**
   * Сохранить токен авторизации
   * @param {string} token
   */
  setAuthToken(token) {
    return this.set(CONFIG.AUTH_TOKEN_KEY, token);
  },
  
  /**
   * Получить токен авторизации
   * @returns {string|null}
   */
  getAuthToken() {
    return this.get(CONFIG.AUTH_TOKEN_KEY);
  },
  
  /**
   * Удалить токен авторизации
   */
  removeAuthToken() {
    return this.remove(CONFIG.AUTH_TOKEN_KEY);
  },
  
  /**
   * Сохранить данные пользователя
   * @param {Object} user - Объект пользователя
   */
  setUser(user) {
    return this.set(CONFIG.AUTH_USER_KEY, user);
  },
  
  /**
   * Получить данные пользователя
   * @returns {Object|null}
   */
  getUser() {
    return this.get(CONFIG.AUTH_USER_KEY);
  },
  
  /**
   * Удалить данные пользователя
   */
  removeUser() {
    return this.remove(CONFIG.AUTH_USER_KEY);
  },
  
  /**
   * Очистить все данные авторизации
   */
  clearAuth() {
    this.removeAuthToken();
    this.removeUser();
    Utils.log('Storage: cleared auth data');
  },
  
  /**
   * Сохранить настройки пользователя (размер страницы и т.д.)
   * @param {Object} settings
   */
  setUserSettings(settings) {
    return this.set('han_crm_user_settings', settings);
  },
  
  /**
   * Получить настройки пользователя
   * @returns {Object}
   */
  getUserSettings() {
    return this.get('han_crm_user_settings', {
      pageSize: CONFIG.DEFAULT_PAGE_SIZE,
      theme: 'light' // для будущего использования
    });
  },
  
  /**
   * Сохранить корзину (для кассира)
   * @param {Array} cartItems
   */
  setCart(cartItems) {
    return this.set('han_crm_cart', cartItems);
  },
  
  /**
   * Получить корзину
   * @returns {Array}
   */
  getCart() {
    return this.get('han_crm_cart', []);
  },
  
  /**
   * Очистить корзину
   */
  clearCart() {
    return this.remove('han_crm_cart');
  },
  
  /**
   * Сохранить последние фильтры (для отчётов и т.д.)
   * @param {string} page - Название страницы
   * @param {Object} filters - Объект фильтров
   */
  setFilters(page, filters) {
    const key = `han_crm_filters_${page}`;
    return this.set(key, filters);
  },
  
  /**
   * Получить последние фильтры
   * @param {string} page - Название страницы
   * @returns {Object}
   */
  getFilters(page) {
    const key = `han_crm_filters_${page}`;
    return this.get(key, {});
  }
};

// Заморозить объект
Object.freeze(Storage);

// Проверить доступность при загрузке
if (!Storage.isAvailable()) {
  Utils.error('LocalStorage недоступен! Некоторые функции могут не работать.');
}