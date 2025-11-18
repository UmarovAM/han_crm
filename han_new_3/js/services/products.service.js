// ============================================
// PRODUCTS SERVICE - HAN CRM v3.1
// ============================================

/**
 * Сервис для работы с товарами
 * Соответствует /api/products.php
 */
const ProductsService = {
  /**
   * Получить список товаров
   * @param {Object} params - { page, page_size, search, active_only }
   * @returns {Promise<Object>}
   */
  async getList(params = {}) {
    const defaultParams = {
      action: 'index',
      page: 1,
      page_size: CONFIG.DEFAULT_PAGE_SIZE
    };
    
    return await API.get('products.php', { ...defaultParams, ...params });
  },
  
  /**
   * Получить один товар
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async getById(id) {
    return await API.get('products.php', {
      action: 'show',
      id: id
    });
  },
  
  /**
   * Создать товар
   * @param {Object} data - { name, price, is_active }
   * @returns {Promise<Object>}
   */
  async create(data) {
    return await API.post('products.php?action=create', data);
  },
  
  /**
   * Обновить товар
   * @param {number} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async update(id, data) {
    return await API.put(`products.php?action=update&id=${id}`, data);
  },
  
  /**
   * Удалить товар
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async delete(id) {
    return await API.delete(`products.php?action=delete&id=${id}`);
  },
  
  /**
   * Массовое обновление цен
   * @param {Array} updates - [{ id, price }, ...]
   * @returns {Promise<Object>}
   */
  async updatePrices(updates) {
    return await API.put('products.php?action=update-prices', updates);
  },
  
  /**
   * Поиск товаров (для SearchSelect)
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async search(query) {
    const response = await API.get('products.php', {
      action: 'index',
      search: query,
      active_only: true,
      page_size: 20
    });
    
    return response.data?.items || [];
  },
  
  /**
   * Получить остатки на складе
   * @returns {Promise<Array>}
   */
  async getStock() {
    const response = await API.get('products.php', {
      action: 'stock'
    });
    
    return response.data || [];
  },
  
  /**
   * Корректировка остатка товара
   * @param {number} id
   * @param {number} newQuantity
   * @param {string} reason
   * @returns {Promise<Object>}
   */
  async adjustStock(id, newQuantity, reason) {
    return await API.post(`products.php?action=adjust-stock&id=${id}`, {
      new_quantity: newQuantity,
      reason: reason
    });
  },
  
  /**
   * Списать товар
   * @param {Object} data - { product_id, quantity, type, reason }
   * @returns {Promise<Object>}
   */
  async writeOff(data) {
    return await API.post('products.php?action=writeoff', data);
  },
  
  /**
   * Получить журнал списаний
   * @param {Object} filters - { date_from, date_to, product_id, type }
   * @returns {Promise<Array>}
   */
  async getWriteOffs(filters = {}) {
    const response = await API.get('products.php', {
      action: 'writeoffs',
      ...filters
    });
    
    return response.data || [];
  },
  
  /**
   * Экспорт товаров в Excel
   * @returns {Promise<void>}
   */
  async exportToExcel() {
    const filename = `${CONFIG.EXCEL_FILENAME_PREFIX}Products_${Utils.formatDate(new Date(), 'YYYY-MM-DD')}.csv`;
    
    // Получаем все товары
    const response = await API.get('products.php', {
      action: 'index',
      page_size: 10000
    });
    
    const products = response.data?.items || [];
    
    if (products.length === 0) {
      Toast.warning('Нет данных для экспорта');
      return;
    }
    
    // Формируем CSV
    const headers = ['ID', 'Название', 'Цена', 'Остаток', 'Статус'];
    const rows = products.map(product => [
      product.id,
      product.name,
      product.price,
      product.quantity || 0,
      product.is_active ? 'Активен' : 'Неактивен'
    ]);
    
    let csv = '\uFEFF'; // UTF-8 BOM
    csv += headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });
    
    Utils.downloadFile(csv, filename, 'text/csv;charset=utf-8;');
    Toast.success('Экспорт завершён');
  },
  
  /**
   * Валидация данных товара
   * @param {Object} data
   * @returns {Object}
   */
  validate(data) {
    const errors = {};
    
    // Название обязательно
    if (!data.name || data.name.trim().length < 2) {
      errors.name = 'Название должно содержать минимум 2 символа';
    }
    
    // Цена обязательна и должна быть >= 0
    if (data.price === undefined || data.price === null || data.price < 0) {
      errors.price = 'Укажите корректную цену';
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
      name: data.name?.trim(),
      price: parseFloat(data.price) || 0,
      is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
    };
  },
  
  /**
   * Получить статус товара на складе (по количеству)
   * @param {number} quantity
   * @returns {Object} - { status, label, color }
   */
  getStockStatus(quantity) {
    const status = Utils.getStockStatus(quantity);
    
    return {
      status: status,
      label: CONFIG.STOCK_STATUS_NAMES[status],
      color: CONFIG.STOCK_STATUS_COLORS[status]
    };
  }
};

// Заморозить объект
Object.freeze(ProductsService);