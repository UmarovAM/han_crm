// ============================================
// КОНФИГУРАЦИЯ HAN CRM v3.1
// ============================================

const CONFIG = {
  // API настройки
  API_BASE_URL: '/api', // Базовый URL для API
  API_TIMEOUT: 30000,   // Таймаут запросов (30 сек)
  
  // Авторизация
  AUTH_TOKEN_KEY: 'han_crm_token',
  AUTH_USER_KEY: 'han_crm_user',
  SESSION_CHECK_INTERVAL: 300000, // 5 минут
  
  // Пагинация
  DEFAULT_PAGE_SIZE: 50,
  PAGE_SIZE_OPTIONS: [20, 50, 100, 200],
  
  // Форматы
  DATE_FORMAT: 'DD.MM.YYYY',
  DATE_TIME_FORMAT: 'DD.MM.YYYY HH:mm',
  CURRENCY: 'сом',
  CURRENCY_DECIMALS: 2,
  
  // UI
  TOAST_DURATION: 3000,
  TOAST_SUCCESS_DURATION: 2000,
  TOAST_ERROR_DURATION: 5000,
  MODAL_ANIMATION_DURATION: 300,
  DEBOUNCE_DELAY: 300,
  PRINT_AUTO_CLOSE_DELAY: 500,
  
  // Экспорт
  EXCEL_FILENAME_PREFIX: 'HAN_CRM_',
  
  // Лимиты
  MAX_CART_ITEMS: 50,
  MIN_PRODUCT_QUANTITY: 1,
  MAX_PRODUCT_QUANTITY: 10000,
  LOW_STOCK_THRESHOLD: 10,
  
  // Роли
  ROLES: {
    ADMIN: 'admin',
    MANAGER: 'manager',
    CASHIER: 'cashier'
  },
  
  ROLE_NAMES: {
    admin: 'Администратор',
    manager: 'Менеджер',
    cashier: 'Кассир'
  },
  
  // Типы списаний
  WRITEOFF_TYPES: {
    DEFECT: 'defect',
    EXPIRED: 'expired',
    DAMAGE: 'damage',
    OTHER: 'other'
  },
  
  WRITEOFF_TYPE_NAMES: {
    defect: 'Брак',
    expired: 'Истёк срок',
    damage: 'Повреждение',
    other: 'Другое'
  },
  
  // Смены
  PRODUCTION_SHIFTS: {
    DAY: 'day',
    NIGHT: 'night'
  },
  
  PRODUCTION_SHIFT_NAMES: {
    day: 'Дневная',
    night: 'Ночная'
  },
  
  // Способы оплаты
  PAYMENT_METHODS: {
    CASH: 'cash',
    CARD: 'card',
    TRANSFER: 'transfer',
    OVERPAYMENT: 'overpayment'
  },
  
  PAYMENT_METHOD_NAMES: {
    cash: 'Наличные',
    card: 'Карта',
    transfer: 'Перевод',
    overpayment: 'Переплата'
  },
  
  // Маршруты
  ROUTES: {
    LOGIN: '/login.html',
    DASHBOARD: '/pages/dashboard.html',
    SALES: '/pages/sales.html',
    CLIENTS: '/pages/clients.html',
    PRODUCTS: '/pages/products.html',
    PRODUCTION: '/pages/production.html',
    WRITEOFFS: '/pages/writeoffs.html',
    STOCK: '/pages/stock.html',
    REPORTS: '/pages/reports.html'
  },
  
  // Режим отладки
  DEBUG: true,
  VERSION: '3.1.0',
  
  // Информация о компании
  COMPANY: {
    NAME: 'ХАН',
    FULL_NAME: 'Компания ХАН',
    ADDRESS: 'г. Бишкек, Кыргызстан',
    PHONE: '+996 XXX XXX XXX',
    EMAIL: 'info@han.kg'
  }
};

Object.freeze(CONFIG);