// ============================================
// PAYMENTS SERVICE - HAN CRM v3.1
// ============================================

/**
 * Сервис для работы с платежами
 * Соответствует /api/payments.php
 */
const PaymentsService = {
  /**
   * Получить платежи по продаже
   * @param {number} saleId
   * @returns {Promise<Array>}
   */
  async getBySale(saleId) {
    const response = await API.get('payments.php', {
      action: 'index',
      sale_id: saleId
    });
    
    return response.data || [];
  },
  
  /**
   * Создать платёж
   * @param {Object} data - { sale_id, amount, payment_method, note }
   * @returns {Promise<Object>}
   */
  async create(data) {
    return await API.post('payments.php?action=create', data);
  },
  
  /**
   * Удалить платёж (только для admin)
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async delete(id) {
    return await API.delete(`payments.php?action=delete&id=${id}`);
  },
  
  /**
   * Получить статистику платежей
   * @param {Object} params - { date_from, date_to }
   * @returns {Promise<Object>}
   */
  async getStats(params = {}) {
    const response = await API.get('payments.php', {
      action: 'stats',
      ...params
    });
    
    return response.data || {};
  },
  
  /**
   * Валидация данных платежа
   * @param {Object} data
   * @returns {Object}
   */
  validate(data) {
    const errors = {};
    
    // ID продажи обязателен
    if (!data.sale_id) {
      errors.sale_id = 'Не указана продажа';
    }
    
    // Сумма обязательна и > 0
    if (!data.amount || data.amount <= 0) {
      errors.amount = 'Укажите корректную сумму';
    }
    
    // Способ оплаты обязателен
    if (!data.payment_method) {
      errors.payment_method = 'Выберите способ оплаты';
    }
    
    // Проверяем, что способ оплаты валиден
    const validMethods = Object.values(CONFIG.PAYMENT_METHODS);
    if (data.payment_method && !validMethods.includes(data.payment_method)) {
      errors.payment_method = 'Некорректный способ оплаты';
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
      sale_id: parseInt(data.sale_id),
      amount: parseFloat(data.amount),
      payment_method: data.payment_method,
      note: data.note?.trim() || null
    };
  },
  
  /**
   * Получить название способа оплаты
   * @param {string} method
   * @returns {string}
   */
  getPaymentMethodName(method) {
    return CONFIG.PAYMENT_METHOD_NAMES[method] || method;
  }
};

// Заморозить объект
Object.freeze(PaymentsService);