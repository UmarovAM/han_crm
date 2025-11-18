// ============================================
// PRODUCTION SERVICE - HAN CRM v3.1
// ============================================

/**
 * Сервис для работы с производством
 * Соответствует /api/production.php
 */
const ProductionService = {
  /**
   * Получить журнал производства
   * @param {Object} filters - { date_from, date_to, shift, product_id }
   * @returns {Promise<Array>}
   */
  async getList(filters = {}) {
    const response = await API.get('production.php', {
      action: 'index',
      ...filters
    });
    
    return response.data || [];
  },
  
  /**
   * Создать запись производства
   * @param {Object} data - { product_id, quantity, shift, note }
   * @returns {Promise<Object>}
   */
  async create(data) {
    return await API.post('production.php?action=create', data);
  },
  
  /**
   * Удалить запись производства (только admin)
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async delete(id) {
    return await API.delete(`production.php?action=delete&id=${id}`);
  },
  
  /**
   * Получить статистику производства
   * @param {Object} params - { date_from, date_to }
   * @returns {Promise<Object>}
   */
  async getStats(params = {}) {
    const response = await API.get('production.php', {
      action: 'stats',
      ...params
    });
    
    return response.data || {};
  },
  
  /**
   * Валидация данных производства
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
    
    // Смена обязательна
    if (!data.shift) {
      errors.shift = 'Выберите смену';
    }
    
    // Проверяем валидность смены
    const validShifts = Object.values(CONFIG.PRODUCTION_SHIFTS);
    if (data.shift && !validShifts.includes(data.shift)) {
      errors.shift = 'Некорректная смена';
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
      shift: data.shift,
      note: data.note?.trim() || null
    };
  },
  
  /**
   * Получить название смены
   * @param {string} shift
   * @returns {string}
   */
  getShiftName(shift) {
    return CONFIG.PRODUCTION_SHIFT_NAMES[shift] || shift;
  },
  
  /**
   * Экспорт производства в Excel
   * @param {Object} filters
   * @returns {Promise<void>}
   */
  async exportToExcel(filters = {}) {
    const filename = `${CONFIG.EXCEL_FILENAME_PREFIX}Production_${Utils.formatDate(new Date(), 'YYYY-MM-DD')}.csv`;
    
    // Получаем данные
    const production = await this.getList(filters);
    
    if (production.length === 0) {
      Toast.warning('Нет данных для экспорта');
      return;
    }
    
    // Формируем CSV
    const headers = ['ID', 'Дата', 'Товар', 'Количество', 'Смена', 'Примечание', 'Пользователь'];
    const rows = production.map(record => [
      record.id,
      Utils.formatDate(record.created_at, CONFIG.DATE_TIME_FORMAT),
      record.product_name,
      record.quantity,
      this.getShiftName(record.shift),
      record.note || '',
      record.user_name || ''
    ]);
    
    let csv = '\uFEFF'; // UTF-8 BOM
    csv += headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });
    
    Utils.downloadFile(csv, filename, 'text/csv;charset=utf-8;');
    Toast.success('Экспорт завершён');
  }
};

// Заморозить объект
Object.freeze(ProductionService);