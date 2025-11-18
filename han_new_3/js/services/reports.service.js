// ============================================
// REPORTS SERVICE - HAN CRM v3.1
// ============================================

/**
 * Сервис для работы с отчётами
 * Соответствует /api/reports.php
 */
const ReportsService = {
  /**
   * Получить сводный отчёт
   * @param {Object} params - { date_from, date_to }
   * @returns {Promise<Object>}
   */
  async getSummary(params = {}) {
    const response = await API.get('reports.php', {
      action: 'summary',
      ...params
    });
    
    return response.data || {};
  },
  
  /**
   * Отчёт по должникам
   * @returns {Promise<Array>}
   */
  async getDebtors() {
    const response = await API.get('reports.php', {
      action: 'debtors'
    });
    
    return response.data || [];
  },
  
  /**
   * Отчёт по переплатам
   * @returns {Promise<Array>}
   */
  async getOverpayments() {
    const response = await API.get('reports.php', {
      action: 'overpayments'
    });
    
    return response.data || [];
  },
  
  /**
   * Отчёт по складу
   * @returns {Promise<Object>}
   */
  async getStock() {
    const response = await API.get('reports.php', {
      action: 'stock'
    });
    
    return response.data || {};
  },
  
  /**
   * Детальный отчёт по продажам
   * @param {Object} params - { date_from, date_to }
   * @returns {Promise<Object>}
   */
  async getSalesReport(params = {}) {
    const response = await API.get('reports.php', {
      action: 'sales',
      ...params
    });
    
    return response.data || {};
  },
  
  /**
   * Детальный отчёт по платежам
   * @param {Object} params - { date_from, date_to }
   * @returns {Promise<Object>}
   */
  async getPaymentsReport(params = {}) {
    const response = await API.get('reports.php', {
      action: 'payments',
      ...params
    });
    
    return response.data || {};
  },
  
  /**
   * Экспорт отчёта
   * @param {string} type - Тип отчёта (sales, debtors, stock)
   * @param {Object} params - Параметры фильтрации
   * @returns {Promise<void>}
   */
  async export(type, params = {}) {
    const filename = `${CONFIG.EXCEL_FILENAME_PREFIX}Report_${type}_${Utils.formatDate(new Date(), 'YYYY-MM-DD')}.csv`;
    
    await API.downloadFile(
      `reports.php?action=export&type=${type}&${new URLSearchParams(params).toString()}`,
      filename
    );
    
    Toast.success('Экспорт завершён');
  },
  
  /**
   * Печать отчёта
   * @param {string} title - Заголовок отчёта
   * @param {Object} data - Данные отчёта
   * @param {string} type - Тип отчёта (для форматирования)
   */
  printReport(title, data, type = 'generic') {
    let html = '';
    
    switch (type) {
      case 'summary':
        html = this.formatSummaryReport(data);
        break;
        
      case 'sales':
        html = this.formatSalesReport(data);
        break;
        
      case 'debtors':
        html = this.formatDebtorsReport(data);
        break;
        
      case 'stock':
        html = this.formatStockReport(data);
        break;
        
      default:
        html = '<p>Неизвестный тип отчёта</p>';
    }
    
    Print.printReport(title, html);
  },
  
  /**
   * Форматирование сводного отчёта для печати
   * @private
   */
  formatSummaryReport(data) {
    return `
      <div class="report-section">
        <h2>Период: ${data.period?.date_from} - ${data.period?.date_to}</h2>
        
        <h3>Продажи</h3>
        <table>
          <tr>
            <td>Количество продаж:</td>
            <td><strong>${data.sales?.total_sales || 0}</strong></td>
          </tr>
          <tr>
            <td>Общая сумма:</td>
            <td><strong>${Utils.formatMoney(data.sales?.total_amount || 0)}</strong></td>
          </tr>
          <tr>
            <td>Средний чек:</td>
            <td><strong>${Utils.formatMoney(data.sales?.avg_sale || 0)}</strong></td>
          </tr>
        </table>
        
        <h3>Платежи</h3>
        <table>
          <tr>
            <td>Количество платежей:</td>
            <td><strong>${data.payments?.total_payments || 0}</strong></td>
          </tr>
          <tr>
            <td>Общая сумма:</td>
            <td><strong>${Utils.formatMoney(data.payments?.total_amount || 0)}</strong></td>
          </tr>
        </table>
        
        <h3>Долги и переплаты</h3>
        <table>
          <tr>
            <td>Должников:</td>
            <td><strong>${data.debtors?.total_debtors || 0}</strong></td>
          </tr>
          <tr>
            <td>Общий долг:</td>
            <td><strong>${Utils.formatMoney(data.debtors?.total_debt || 0)}</strong></td>
          </tr>
          <tr>
            <td>Клиентов с переплатой:</td>
            <td><strong>${data.overpayments?.total_clients || 0}</strong></td>
          </tr>
          <tr>
            <td>Общая переплата:</td>
            <td><strong>${Utils.formatMoney(data.overpayments?.total_overpayment || 0)}</strong></td>
          </tr>
        </table>
      </div>
    `;
  },
  
  /**
   * Форматирование отчёта по продажам для печати
   * @private
   */
  formatSalesReport(data) {
    let html = '<div class="report-section">';
    
    // По дням
    if (data.by_day && data.by_day.length > 0) {
      html += '<h3>Продажи по дням</h3>';
      html += '<table><thead><tr><th>Дата</th><th>Кол-во</th><th>Сумма</th></tr></thead><tbody>';
      
      data.by_day.forEach(row => {
        html += `<tr>
          <td>${Utils.formatDate(row.date)}</td>
          <td>${row.sales_count}</td>
          <td>${Utils.formatMoney(row.total_amount)}</td>
        </tr>`;
      });
      
      html += '</tbody></table>';
    }
    
    // По клиентам
    if (data.by_client && data.by_client.length > 0) {
      html += '<h3>Топ клиенты</h3>';
      html += '<table><thead><tr><th>Клиент</th><th>Продаж</th><th>Сумма</th></tr></thead><tbody>';
      
      data.by_client.slice(0, 10).forEach(row => {
        html += `<tr>
          <td>${Utils.escapeHtml(row.client_name)}</td>
          <td>${row.sales_count}</td>
          <td>${Utils.formatMoney(row.total_amount)}</td>
        </tr>`;
      });
      
      html += '</tbody></table>';
    }
    
    html += '</div>';
    return html;
  },
  
  /**
   * Форматирование отчёта по должникам для печати
   * @private
   */
  formatDebtorsReport(data) {
    if (!data || data.length === 0) {
      return '<p>Нет должников</p>';
    }
    
    let html = '<table><thead><tr><th>Клиент</th><th>Телефон</th><th>Продаж</th><th>Долг</th></tr></thead><tbody>';
    
    data.forEach(row => {
      html += `<tr>
        <td>${Utils.escapeHtml(row.client_name)}</td>
        <td>${Utils.escapeHtml(row.client_phone || '')}</td>
        <td>${row.sales_count}</td>
        <td><strong>${Utils.formatMoney(row.total_debt)}</strong></td>
      </tr>`;
    });
    
    html += '</tbody></table>';
    
    // Итого
    const totalDebt = data.reduce((sum, row) => sum + parseFloat(row.total_debt), 0);
    html += `<p style="margin-top: 20px; font-size: 14px;"><strong>Общий долг: ${Utils.formatMoney(totalDebt)}</strong></p>`;
    
    return html;
  },
  
  /**
   * Форматирование отчёта по складу для печати
   * @private
   */
  formatStockReport(data) {
    let html = '<div class="report-section">';
    
    // Статистика
    if (data.statistics) {
      html += '<h3>Статистика</h3>';
      html += '<table>';
      html += `<tr><td>Всего товаров:</td><td><strong>${data.statistics.total_products || 0}</strong></td></tr>`;
      html += `<tr><td>Нет в наличии:</td><td><strong>${data.statistics.out_of_stock_count || 0}</strong></td></tr>`;
      html += `<tr><td>Мало на складе:</td><td><strong>${data.statistics.low_stock_count || 0}</strong></td></tr>`;
      html += `<tr><td>В наличии:</td><td><strong>${data.statistics.in_stock_count || 0}</strong></td></tr>`;
      html += '</table>';
    }
    
    // Товары с низким остатком
    if (data.low_stock && data.low_stock.length > 0) {
      html += '<h3>Товары с низким остатком</h3>';
      html += '<table><thead><tr><th>Товар</th><th>Цена</th><th>Остаток</th></tr></thead><tbody>';
      
      data.low_stock.forEach(item => {
        html += `<tr>
          <td>${Utils.escapeHtml(item.name)}</td>
          <td>${Utils.formatMoney(item.price)}</td>
          <td><strong style="color: #ffc107;">${item.quantity}</strong></td>
        </tr>`;
      });
      
      html += '</tbody></table>';
    }
    
    html += '</div>';
    return html;
  },
  
  /**
   * Получить даты по умолчанию для фильтров
   * @returns {Object} - { date_from, date_to }
   */
  getDefaultDateRange() {
    return {
      date_from: Utils.getFirstDayOfMonth(),
      date_to: Utils.getCurrentDate()
    };
  }
};

// Заморозить объект
Object.freeze(ReportsService);