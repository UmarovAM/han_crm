// ============================================
// WRITEOFFS SERVICE - HAN CRM v3.1
// ============================================

/**
 * Сервис для работы со списаниями
 * Соответствует /api/writeoffs.php
 */
const WriteOffsService = {
  /**
   * Получить журнал списаний
   * @param {Object} params - { page, page_size, date_from, date_to, product_id, type }
   * @returns {Promise<Object>}
   */
  async getList(params = {}) {
    const defaultParams = {
      action: 'index',
      page: 1,
      page_size: CONFIG.DEFAULT_PAGE_SIZE
    };
    
    return await API.get('writeoffs.php', { ...defaultParams, ...params });
  },
  
  /**
   * Получить одно списание
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async getById(id) {
    return await API.get('writeoffs.php', {
      action: 'show',
      id: id
    });
  },
  
  /**
   * Создать списание
   * @param {Object} data - { product_id, quantity, type, reason }
   * @returns {Promise<Object>}
   */
  async create(data) {
    return await API.post('writeoffs.php?action=create', data);
  },
  
  /**
   * Удалить списание (только admin)
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async delete(id) {
    return await API.delete(`writeoffs.php?action=delete&id=${id}`);
  },
  
  /**
   * Получить статистику списаний
   * @param {Object} params - { date_from, date_to }
   * @returns {Promise<Object>}
   */
  async getStats(params = {}) {
    const response = await API.get('writeoffs.php', {
      action: 'stats',
      ...params
    });
    
    return response.data || {};
  },
  
  /**
   * Получить топ товаров по списаниям
   * @param {Object} params - { limit, date_from, date_to }
   * @returns {Promise<Array>}
   */
  async getTopProducts(params = {}) {
    const response = await API.get('writeoffs.php', {
      action: 'top-products',
      limit: 10,
      ...params
    });
    
    return response.data?.products || [];
  },
  
  /**
   * Экспорт списаний в Excel
   * @param {Object} filters
   * @returns {Promise<void>}
   */
  async exportToExcel(filters = {}) {
    await API.downloadFile(
      `writeoffs.php?action=export&${new URLSearchParams(filters).toString()}`,
      `${CONFIG.EXCEL_FILENAME_PREFIX}WriteOffs_${Utils.formatDate(new Date(), 'YYYY-MM-DD')}.csv`
    );
    
    Toast.success('Экспорт завершён');
  },
  
  /**
   * Валидация данных списания
   * @param {Object} data
   * @returns {Object}
   */
  validate(data) {
    const errors = {};
    
    // Товар обязателен
    if (!data.product_id) {
      errors.product_id = 'Выберите товар';
    }
    
    // Количество обязательно и > 0
    if (!data.quantity || data.quantity <= 0) {
      errors.quantity = 'Укажите корректное количество';
    }
    
    // Тип обязателен
    if (!data.type) {
      errors.type = 'Выберите тип списания';
    }
    
    // Проверяем валидность типа
    const validTypes = Object.values(CONFIG.WRITEOFF_TYPES);
    if (data.type && !validTypes.includes(data.type)) {
      errors.type = 'Некорректный тип списания';
    }
    
    // Причина обязательна
    if (!data.reason || data.reason.trim().length < 3) {
      errors.reason = 'Укажите причину списания (минимум 3 символа)';
    }
    
    return {
      valid: Object.keys(errors).length === 0,
      errors: errors
    };
  },
  
  /**
   * Форматирование для отправки
   * @param {Object} data
   * @returns {Object}
   */
  formatForSubmit(data) {
    return {
      product_id: parseInt(data.product_id),
      quantity: parseInt(data.quantity),
      type: data.type,
      reason: data.reason.trim()
    };
  },
  
  /**
   * Получить название типа списания
   * @param {string} type
   * @returns {string}
   */
  getTypeName(type) {
    return CONFIG.WRITEOFF_TYPE_NAMES[type] || type;
  }
};

// Заморозить объект
Object.freeze(WriteOffsService);