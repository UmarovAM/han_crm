// ============================================
// SALES SERVICE - HAN CRM v3.1
// ============================================

/**
 * Сервис для работы с продажами
 * Соответствует /api/sales.php
 */
const SalesService = {
  /**
   * Получить список продаж
   * @param {Object} params - { page, page_size, date_from, date_to, client_id, receipt_number, has_debt }
   * @returns {Promise<Object>}
   */
  async getList(params = {}) {
    const defaultParams = {
      action: 'index',
      page: 1,
      page_size: CONFIG.DEFAULT_PAGE_SIZE
    };
    
    return await API.get('sales.php', { ...defaultParams, ...params });
  },
  
  /**
   * Получить одну продажу
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async getById(id) {
    return await API.get('sales.php', {
      action: 'show',
      id: id
    });
  },
  
  /**
   * Создать продажу
   * @param {Object} data - { client_id, items: [{ product_id, quantity, price }], paid }
   * @returns {Promise<Object>}
   */
  async create(data) {
    return await API.post('sales.php?action=create', data);
  },
  
  /**
   * Удалить продажу
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async delete(id) {
    return await API.delete(`sales.php?action=delete&id=${id}`);
  },
  
  /**
   * Получить статистику продаж
   * @param {Object} params - { date_from, date_to }
   * @returns {Promise<Object>}
   */
  async getStats(params = {}) {
    const response = await API.get('sales.php', {
      action: 'stats',
      ...params
    });
    
    return response.data || {};
  },
  
  /**
   * Поиск продаж по номеру чека
   * @param {string} receiptNumber
   * @returns {Promise<Array>}
   */
  async searchByReceipt(receiptNumber) {
    const response = await API.get('sales.php', {
      action: 'index',
      receipt_number: receiptNumber,
      page_size: 10
    });
    
    return response.data?.items || [];
  },
  
  /**
   * Получить продажи клиента
   * @param {number} clientId
   * @param {Object} params
   * @returns {Promise<Array>}
   */
  async getByClient(clientId, params = {}) {
    const response = await API.get('sales.php', {
      action: 'index',
      client_id: clientId,
      page_size: 100,
      ...params
    });
    
    return response.data?.items || [];
  },
  
  /**
   * Получить продажи с долгом
   * @returns {Promise<Array>}
   */
  async getSalesWithDebt() {
    const response = await API.get('sales.php', {
      action: 'index',
      has_debt: true,
      page_size: 1000
    });
    
    return response.data?.items || [];
  },
  
  /**
   * Валидация данных продажи
   * @param {Object} data - { client_id, items, paid }
   * @returns {Object}
   */
  validate(data) {
    const errors = {};
    
    // Клиент обязателен
    if (!data.client_id) {
      errors.client_id = 'Выберите клиента';
    }
    
    // Товары обязательны
    if (!data.items || data.items.length === 0) {
      errors.items = 'Добавьте товары в корзину';
    }
    
    // Проверяем каждый товар
    if (data.items && data.items.length > 0) {
      data.items.forEach((item, index) => {
        if (!item.product_id) {
          errors[`item_${index}_product`] = 'Не указан товар';
        }
        if (!item.quantity || item.quantity < CONFIG.MIN_PRODUCT_QUANTITY) {
          errors[`item_${index}_quantity`] = 'Некорректное количество';
        }
        if (item.price === undefined || item.price < 0) {
          errors[`item_${index}_price`] = 'Некорректная цена';
        }
      });
    }
    
    // Оплата должна быть >= 0
    if (data.paid === undefined || data.paid < 0) {
      errors.paid = 'Укажите сумму оплаты';
    }
    
    return {
      valid: Object.keys(errors).length === 0,
      errors: errors
    };
  },
  
  /**
   * Рассчитать итоги продажи
   * @param {Array} items - Товары из корзины
   * @param {number} paid - Оплачено
   * @returns {Object} - { total, debt, overpayment }
   */
  calculateTotals(items, paid) {
    // Общая сумма
    const total = items.reduce((sum, item) => {
      return sum + (item.quantity * item.price);
    }, 0);
    
    // Долг
    const debt = Math.max(0, total - paid);
    
    // Переплата
    const overpayment = Math.max(0, paid - total);
    
    return {
      total: Utils.round(total, 2),
      debt: Utils.round(debt, 2),
      overpayment: Utils.round(overpayment, 2)
    };
  },
  
  /**
   * Форматирование для отправки
   * @param {Object} data
   * @returns {Object}
   */
  formatForSubmit(data) {
    return {
      client_id: parseInt(data.client_id),
      items: data.items.map(item => ({
        product_id: parseInt(item.product_id || item.id),
        quantity: parseInt(item.quantity),
        price: parseFloat(item.price)
      })),
      paid: parseFloat(data.paid) || 0
    };
  },
  
  /**
   * Экспорт продаж в Excel
   * @param {Object} filters
   * @returns {Promise<void>}
   */
  async exportToExcel(filters = {}) {
    const filename = `${CONFIG.EXCEL_FILENAME_PREFIX}Sales_${Utils.formatDate(new Date(), 'YYYY-MM-DD')}.csv`;
    
    // Получаем продажи
    const response = await API.get('sales.php', {
      action: 'index',
      page_size: 10000,
      ...filters
    });
    
    const sales = response.data?.items || [];
    
    if (sales.length === 0) {
      Toast.warning('Нет данных для экспорта');
      return;
    }
    
    // Формируем CSV
    const headers = ['Номер чека', 'Дата', 'Клиент', 'Телефон', 'Сумма', 'Оплачено', 'Долг', 'Переплата', 'Кассир'];
    const rows = sales.map(sale => [
      sale.receipt_number,
      Utils.formatDate(sale.created_at, CONFIG.DATE_TIME_FORMAT),
      sale.client_name,
      sale.client_phone || '',
      sale.total,
      sale.paid,
      sale.debt,
      sale.new_overpayment,
      sale.created_by || ''
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
Object.freeze(SalesService);