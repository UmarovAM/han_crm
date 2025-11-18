// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ HAN CRM v3.1
// ============================================

const Utils = {
  /**
   * Форматирование даты
   * @param {string|Date} date - Дата для форматирования
   * @param {string} format - Формат (по умолчанию из CONFIG)
   * @returns {string} Отформатированная дата
   */
  formatDate(date, format = CONFIG.DATE_FORMAT) {
    if (!date) return '';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return format
      .replace('DD', day)
      .replace('MM', month)
      .replace('YYYY', year)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  },
  
  /**
   * Форматирование суммы (с валютой)
   * @param {number} amount - Сумма
   * @param {boolean} showCurrency - Показывать валюту
   * @returns {string}
   */
  formatMoney(amount, showCurrency = true) {
    if (amount === null || amount === undefined) return '0';
    
    const formatted = Number(amount).toLocaleString('ru-RU', {
      minimumFractionDigits: CONFIG.CURRENCY_DECIMALS,
      maximumFractionDigits: CONFIG.CURRENCY_DECIMALS
    });
    
    return showCurrency ? `${formatted} ${CONFIG.CURRENCY}` : formatted;
  },
  
  /**
   * Форматирование числа
   * @param {number} value - Число
   * @param {number} decimals - Знаков после запятой
   * @returns {string}
   */
  formatNumber(value, decimals = 0) {
    if (value === null || value === undefined) return '0';
    
    return Number(value).toLocaleString('ru-RU', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  },
  
  /**
   * Debounce функция (задержка вызова)
   * @param {Function} func - Функция для вызова
   * @param {number} delay - Задержка в мс
   * @returns {Function}
   */
  debounce(func, delay = CONFIG.DEBOUNCE_DELAY) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  },
  
  /**
   * Throttle функция (ограничение частоты вызова)
   * @param {Function} func - Функция
   * @param {number} limit - Лимит в мс
   * @returns {Function}
   */
  throttle(func, limit = 1000) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },
  
  /**
   * Экранирование HTML
   * @param {string} text - Текст
   * @returns {string}
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  /**
   * Получить параметры из URL
   * @returns {Object}
   */
  getUrlParams() {
    const params = {};
    const searchParams = new URLSearchParams(window.location.search);
    for (const [key, value] of searchParams) {
      params[key] = value;
    }
    return params;
  },
  
  /**
   * Установить параметры в URL (без перезагрузки)
   * @param {Object} params - Параметры
   */
  setUrlParams(params) {
    const url = new URL(window.location);
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
        url.searchParams.set(key, params[key]);
      } else {
        url.searchParams.delete(key);
      }
    });
    window.history.replaceState({}, '', url);
  },
  
  /**
   * Копировать текст в буфер обмена
   * @param {string} text - Текст
   * @returns {Promise<void>}
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // Fallback для старых браузеров
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    }
  },
  
  /**
   * Скачать файл
   * @param {Blob|string} data - Данные
   * @param {string} filename - Имя файла
   * @param {string} mimeType - MIME тип
   */
  downloadFile(data, filename, mimeType = 'text/plain') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
  
  /**
   * Валидация email
   * @param {string} email
   * @returns {boolean}
   */
  isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },
  
  /**
   * Валидация телефона (Кыргызстан: +996...)
   * @param {string} phone
   * @returns {boolean}
   */
  isValidPhone(phone) {
    const re = /^\+996\s?\d{3}\s?\d{3}\s?\d{3}$/;
    return re.test(phone);
  },
  
  /**
   * Форматирование телефона
   * @param {string} phone
   * @returns {string}
   */
  formatPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('996')) {
      return `+996 ${cleaned.slice(3, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9, 12)}`;
    }
    return phone;
  },
  
  /**
   * Генерация случайного ID
   * @returns {string}
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },
  
  /**
   * Проверка: пустой объект?
   * @param {Object} obj
   * @returns {boolean}
   */
  isEmpty(obj) {
    return Object.keys(obj).length === 0;
  },
  
  /**
   * Глубокое клонирование объекта
   * @param {*} obj
   * @returns {*}
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },
  
  /**
   * Логирование (только если DEBUG включен)
   * @param {...any} args
   */
  log(...args) {
    if (CONFIG.DEBUG) {
      console.log('[HAN CRM]', ...args);
    }
  },
  
  /**
   * Логирование ошибок
   * @param {...any} args
   */
  error(...args) {
    console.error('[HAN CRM ERROR]', ...args);
  },
  
  /**
   * Задержка (промис)
   * @param {number} ms - Миллисекунды
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * Получить статус товара на складе
   * @param {number} quantity - Количество
   * @returns {string} - Статус (из CONFIG.STOCK_STATUS)
   */
  getStockStatus(quantity) {
    if (quantity === 0) return CONFIG.STOCK_STATUS.OUT_OF_STOCK;
    if (quantity < CONFIG.LOW_STOCK_THRESHOLD) return CONFIG.STOCK_STATUS.LOW_STOCK;
    return CONFIG.STOCK_STATUS.IN_STOCK;
  },
  
  /**
   * Получить цвет для статуса товара
   * @param {number} quantity
   * @returns {string} - HEX цвет
   */
  getStockColor(quantity) {
    const status = this.getStockStatus(quantity);
    return CONFIG.STOCK_STATUS_COLORS[status];
  },
  
  /**
   * Округление числа до N знаков
   * @param {number} value - Число
   * @param {number} decimals - Знаков после запятой
   * @returns {number}
   */
  round(value, decimals = 2) {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  },
  
  /**
   * Сортировка массива объектов по полю
   * @param {Array} array - Массив
   * @param {string} field - Поле для сортировки
   * @param {string} order - 'asc' или 'desc'
   * @returns {Array}
   */
  sortBy(array, field, order = 'asc') {
    return array.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  },
  
  /**
   * Группировка массива по полю
   * @param {Array} array - Массив
   * @param {string} field - Поле для группировки
   * @returns {Object}
   */
  groupBy(array, field) {
    return array.reduce((result, item) => {
      const key = item[field];
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(item);
      return result;
    }, {});
  },
  
  /**
   * Получить текущую дату в формате YYYY-MM-DD (для input[type="date"])
   * @returns {string}
   */
  getCurrentDate() {
    return new Date().toISOString().split('T')[0];
  },
  
  /**
   * Получить первый день текущего месяца (YYYY-MM-DD)
   * @returns {string}
   */
  getFirstDayOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  },
  
  /**
   * Конвертация даты из DD.MM.YYYY в YYYY-MM-DD
   * @param {string} date - Дата в формате DD.MM.YYYY
   * @returns {string} - Дата в формате YYYY-MM-DD
   */
  convertDateToISO(date) {
    if (!date) return '';
    const parts = date.split('.');
    if (parts.length !== 3) return date;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  },
  
  /**
   * Конвертация даты из YYYY-MM-DD в DD.MM.YYYY
   * @param {string} date - Дата в формате YYYY-MM-DD
   * @returns {string} - Дата в формате DD.MM.YYYY
   */
  convertDateFromISO(date) {
    if (!date) return '';
    const parts = date.split('-');
    if (parts.length !== 3) return date;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
};

// Заморозить объект
Object.freeze(Utils);