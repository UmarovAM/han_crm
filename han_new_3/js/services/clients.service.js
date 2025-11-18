// ============================================
// CLIENTS SERVICE - HAN CRM v3.1
// ============================================

/**
 * Сервис для работы с клиентами
 * Соответствует /api/clients.php
 */
const ClientsService = {
  /**
   * Получить список клиентов с пагинацией
   * @param {Object} params - { page, page_size, search }
   * @returns {Promise<Object>}
   */
  async getList(params = {}) {
    const defaultParams = {
      action: 'index',
      page: 1,
      page_size: CONFIG.DEFAULT_PAGE_SIZE
    };
    
    return await API.get('clients.php', { ...defaultParams, ...params });
  },
  
  /**
   * Получить одного клиента
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async getById(id) {
    return await API.get('clients.php', {
      action: 'show',
      id: id
    });
  },
  
  /**
   * Создать клиента
   * @param {Object} data - { name, phone, address }
   * @returns {Promise<Object>}
   */
  async create(data) {
    return await API.post('clients.php?action=create', data);
  },
  
  /**
   * Обновить клиента
   * @param {number} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async update(id, data) {
    return await API.put(`clients.php?action=update&id=${id}`, data);
  },
  
  /**
   * Удалить клиента
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async delete(id) {
    return await API.delete(`clients.php?action=delete&id=${id}`);
  },
  
  /**
   * Поиск клиентов (для SearchSelect)
   * @param {string} query - Поисковый запрос
   * @returns {Promise<Array>}
   */
  async search(query) {
    const response = await API.get('clients.php', {
      action: 'index',
      search: query,
      page_size: 20
    });
    
    // Возвращаем массив items
    return response.data?.items || [];
  },
  
  /**
   * Получить список должников
   * @returns {Promise<Array>}
   */
  async getDebtors() {
    const response = await API.get('clients.php', {
      action: 'debtors'
    });
    
    return response.data || [];
  },
  
  /**
   * Получить клиентов с переплатами
   * @returns {Promise<Array>}
   */
  async getOverpayments() {
    const response = await API.get('clients.php', {
      action: 'overpayments'
    });
    
    return response.data || [];
  },
  
  /**
   * Выдать переплату наличными
   * @param {number} id - ID клиента
   * @param {number} amount - Сумма
   * @param {string} note - Примечание
   * @returns {Promise<Object>}
   */
  async withdrawOverpayment(id, amount, note = '') {
    return await API.post(`clients.php?action=withdraw-overpayment&id=${id}`, {
      amount: amount,
      note: note
    });
  },
  
  /**
   * Пересчитать баланс клиента
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async recalculateBalance(id) {
    return await API.post(`clients.php?action=recalculate-balance&id=${id}`);
  },
  
  /**
   * Экспорт клиентов в Excel
   * @returns {Promise<void>}
   */
  async exportToExcel() {
    const filename = `${CONFIG.EXCEL_FILENAME_PREFIX}Clients_${Utils.formatDate(new Date(), 'YYYY-MM-DD')}.csv`;
    
    // Получаем всех клиентов
    const response = await API.get('clients.php', {
      action: 'index',
      page_size: 10000 // Большой лимит для экспорта
    });
    
    const clients = response.data?.items || [];
    
    if (clients.length === 0) {
      Toast.warning('Нет данных для экспорта');
      return;
    }
    
    // Формируем CSV
    const headers = ['ID', 'Имя', 'Телефон', 'Адрес', 'Переплата', 'Долг', 'Количество продаж'];
    const rows = clients.map(client => [
      client.id,
      client.name,
      client.phone || '',
      client.address || '',
      client.total_overpayment || 0,
      client.total_debt || 0,
      client.total_sales || 0
    ]);
    
    // Создаём CSV
    let csv = '\uFEFF'; // UTF-8 BOM для Excel
    csv += headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });
    
    // Скачиваем
    Utils.downloadFile(csv, filename, 'text/csv;charset=utf-8;');
    Toast.success('Экспорт завершён');
  },
  
  /**
   * Валидация данных клиента
   * @param {Object} data
   * @returns {Object} - { valid: boolean, errors: {} }
   */
  validate(data) {
    const errors = {};
    
    // Имя обязательно
    if (!data.name || data.name.trim().length < 2) {
      errors.name = 'Имя должно содержать минимум 2 символа';
    }
    
    // Телефон (если указан)
    if (data.phone && !Utils.isValidPhone(data.phone)) {
      errors.phone = 'Некорректный формат телефона (+996 XXX XXX XXX)';
    }
    
    return {
      valid: Object.keys(errors).length === 0,
      errors: errors
    };
  },
  
  /**
   * Форматирование данных клиента перед отправкой
   * @param {Object} data
   * @returns {Object}
   */
  formatForSubmit(data) {
    return {
      name: data.name?.trim(),
      phone: data.phone?.trim() || null,
      address: data.address?.trim() || null,
      is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
    };
  }
};

// Заморозить объект
Object.freeze(ClientsService);