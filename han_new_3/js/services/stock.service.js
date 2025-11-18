// ============================================
// STOCK SERVICE - HAN CRM v3.1
// ============================================

/**
 * Сервис для работы со складом
 * Соответствует /api/stock.php
 */
const StockService = {
  /**
   * Получить все остатки
   * @returns {Promise<Object>}
   */
  async getAll() {
    const response = await API.get('stock.php', {
      action: 'index'
    });
    
    return response.data || {};
  },
  
  /**
   * Получить остаток товара
   * @param {number} productId
   * @returns {Promise<Object>}
   */
  async getByProduct(productId) {
    return await API.get('stock.php', {
      action: 'show',
      id: productId
    });
  },
  
  /**
   * Корректировка остатка
   * @param {number} productId
   * @param {Object} data - { new_quantity, reason }
   * @returns {Promise<Object>}
   */
  async adjust(productId, data) {
    return await API.post(`stock.php?action=adjust&id=${productId}`, data);
  },
  
  /**
   * Получить движения товаров
   * @param {Object} params - { product_id, limit }
   * @returns {Promise<Array>}
   */
  async getMovements(params = {}) {
    const response = await API.get('stock.php', {
      action: 'movements',
      limit: 100,
      ...params
    });
    
    return response.data || [];
  },
  
  /**
   * Получить статистику движений
   * @param {Object} params - { date_from, date_to }
   * @returns {Promise<Object>}
   */
  async getMovementStats(params = {}) {
    const response = await API.get('stock.php', {
      action: 'movement-stats',
      ...params
    });
    
    return response.data || {};
  },
  
  /**
   * Получить товары с низким остатком
   * @param {number} threshold - Порог (по умолчанию из CONFIG)
   * @returns {Promise<Object>}
   */
  async getLowStock(threshold = CONFIG.LOW_STOCK_THRESHOLD) {
    const response = await API.get('stock.php', {
      action: 'low-stock',
      threshold: threshold
    });
    
    return response.data || {};
  },
  
  /**
   * Получить товары без движения
   * @param {number} days - Количество дней
   * @returns {Promise<Object>}
   */
  async getDormantProducts(days = 30) {
    const response = await API.get('stock.php', {
      action: 'dormant',
      days: days
    });
    
    return response.data || {};
  },
  
  /**
   * Сверка остатков (проверка целостности)
   * @returns {Promise<Object>}
   */
  async reconciliation() {
    const response = await API.get('stock.php', {
      action: 'reconciliation'
    });
    
    return response.data || {};
  },
  
  /**
   * Массовая корректировка (только admin)
   * @param {Array} adjustments - [{ product_id, new_quantity, reason }, ...]
   * @returns {Promise<Object>}
   */
  async massAdjust(adjustments) {
    return await API.post('stock.php?action=mass-adjust', {
      adjustments: adjustments
    });
  },
  
  /**
   * Валидация данных корректировки
   * @param {Object} data
   * @returns {Object}
   */
  validateAdjustment(data) {
    const errors = {};
    
    // Новое количество обязательно и >= 0
    if (data.new_quantity === undefined || data.new_quantity === null || data.new_quantity < 0) {
      errors.new_quantity = 'Укажите корректное количество';
    }
    
    // Причина обязательна
    if (!data.reason || data.reason.trim().length < 3) {
      errors.reason = 'Укажите причину корректировки (минимум 3 символа)';
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
  formatAdjustmentForSubmit(data) {
    return {
      new_quantity: parseInt(data.new_quantity),
      reason: data.reason.trim()
    };
  },
  
  /**
   * Экспорт остатков в Excel
   * @returns {Promise<void>}
   */
  async exportToExcel() {
    const filename = `${CONFIG.EXCEL_FILENAME_PREFIX}Stock_${Utils.formatDate(new Date(), 'YYYY-MM-DD')}.csv`;
    
    // Получаем остатки
    const response = await this.getAll();
    const stock = response.items || [];
    
    if (stock.length === 0) {
      Toast.warning('Нет данных для экспорта');
      return;
    }
    
    // Формируем CSV
    const headers = ['ID', 'Товар', 'Цена', 'Остаток', 'Статус'];
    const rows = stock.map(item => {
      const status = ProductsService.getStockStatus(item.quantity);
      return [
        item.id,
        item.name,
        item.price,
        item.quantity,
        status.label
      ];
    });
    
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
Object.freeze(StockService);