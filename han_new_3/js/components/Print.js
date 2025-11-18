// ============================================
// PRINT - ПЕЧАТЬ ЧЕКОВ HAN CRM v3.1
// ============================================

/**
 * Модуль печати чеков
 * Открывает отдельное окно с чистым шаблоном и печатает
 */
const Print = {
  /**
   * Напечатать чек
   * @param {Object} sale - Данные продажи
   */
  printReceipt(sale) {
    if (!sale) {
      Toast.error('Нет данных для печати');
      return;
    }
    
    // Генерируем HTML чека
    const html = this.generateReceiptHTML(sale);
    
    // Открываем окно печати
    this.openPrintWindow(html);
  },
  
  /**
   * Сгенерировать HTML чека
   * @param {Object} sale
   * @returns {string}
   */
  generateReceiptHTML(sale) {
    const date = Utils.formatDate(sale.created_at, CONFIG.DATE_TIME_FORMAT);
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Чек №${sale.receipt_number}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.4;
      padding: 10mm;
      width: 80mm;
    }
    
    .receipt {
      width: 100%;
    }
    
    .receipt-header {
      text-align: center;
      margin-bottom: 10px;
      border-bottom: 1px dashed #000;
      padding-bottom: 10px;
    }
    
    .receipt-header h1 {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .receipt-info {
      margin-bottom: 10px;
      font-size: 11px;
    }
    
    .receipt-info div {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
    }
    
    .receipt-items {
      margin-bottom: 10px;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      padding: 10px 0;
    }
    
    .receipt-item {
      margin-bottom: 8px;
    }
    
    .receipt-item-name {
      font-weight: bold;
      margin-bottom: 2px;
    }
    
    .receipt-item-details {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
    }
    
    .receipt-total {
      margin-bottom: 10px;
    }
    
    .receipt-total div {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
      font-size: 12px;
    }
    
    .receipt-total-main {
      font-size: 14px !important;
      font-weight: bold;
      padding-top: 5px;
      border-top: 1px solid #000;
    }
    
    .receipt-footer {
      text-align: center;
      font-size: 11px;
      margin-top: 15px;
      padding-top: 10px;
      border-top: 1px dashed #000;
    }
    
    @media print {
      body {
        padding: 0;
      }
      
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <!-- Шапка -->
    <div class="receipt-header">
      <h1>${CONFIG.COMPANY.NAME}</h1>
      <div>${CONFIG.COMPANY.FULL_NAME}</div>
      <div>${CONFIG.COMPANY.ADDRESS}</div>
      <div>${CONFIG.COMPANY.PHONE}</div>
    </div>
    
    <!-- Информация о чеке -->
    <div class="receipt-info">
      <div>
        <span>Чек №:</span>
        <strong>${sale.receipt_number}</strong>
      </div>
      <div>
        <span>Дата:</span>
        <span>${date}</span>
      </div>
      <div>
        <span>Клиент:</span>
        <span>${Utils.escapeHtml(sale.client_name)}</span>
      </div>
      ${sale.client_phone ? `
      <div>
        <span>Телефон:</span>
        <span>${Utils.escapeHtml(sale.client_phone)}</span>
      </div>
      ` : ''}
      <div>
        <span>Кассир:</span>
        <span>${Utils.escapeHtml(sale.created_by_name || 'Система')}</span>
      </div>
    </div>
    
    <!-- Товары -->
    <div class="receipt-items">
      ${this.renderReceiptItems(sale.items)}
    </div>
    
    <!-- Итого -->
    <div class="receipt-total">
      <div>
        <span>Сумма:</span>
        <span>${Utils.formatMoney(sale.total)}</span>
      </div>
      ${sale.paid > 0 ? `
      <div>
        <span>Оплачено:</span>
        <span>${Utils.formatMoney(sale.paid)}</span>
      </div>
      ` : ''}
      ${sale.debt > 0 ? `
      <div style="color: #d9534f;">
        <span>Долг:</span>
        <strong>${Utils.formatMoney(sale.debt)}</strong>
      </div>
      ` : ''}
      ${sale.new_overpayment > 0 ? `
      <div style="color: #5cb85c;">
        <span>Переплата:</span>
        <strong>${Utils.formatMoney(sale.new_overpayment)}</strong>
      </div>
      ` : ''}
    </div>
    
    <!-- Подвал -->
    <div class="receipt-footer">
      <div>Спасибо за покупку!</div>
      <div style="margin-top: 5px;">HAN CRM v${CONFIG.VERSION}</div>
    </div>
  </div>
  
  <script>
    // Автоматическая печать при загрузке
    window.onload = function() {
      window.print();
      
      // Закрыть окно после печати (через задержку)
      setTimeout(function() {
        window.close();
      }, ${CONFIG.PRINT_AUTO_CLOSE_DELAY});
    };
  </script>
</body>
</html>
    `;
  },
  
  /**
   * Рендер товаров в чеке
   * @param {Array} items
   * @returns {string}
   */
  renderReceiptItems(items) {
    if (!items || items.length === 0) {
      return '<div>Нет товаров</div>';
    }
    
    return items.map(item => `
      <div class="receipt-item">
        <div class="receipt-item-name">${Utils.escapeHtml(item.product_name || item.name)}</div>
        <div class="receipt-item-details">
          <span>${item.quantity} шт × ${Utils.formatMoney(item.price, false)}</span>
          <strong>${Utils.formatMoney(item.quantity * item.price)}</strong>
        </div>
      </div>
    `).join('');
  },
  
  /**
   * Открыть окно печати
   * @param {string} html
   */
  openPrintWindow(html) {
    // Открываем новое окно
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    if (!printWindow) {
      Toast.error('Не удалось открыть окно печати. Проверьте настройки браузера.');
      return;
    }
    
    // Записываем HTML
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Фокус на окне печати
    printWindow.focus();
    
    Utils.log('Print: Receipt opened');
  },
  
  /**
   * Печать отчёта (общая функция)
   * @param {string} title - Заголовок отчёта
   * @param {string} content - HTML содержимое
   */
  printReport(title, content) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${Utils.escapeHtml(title)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: Arial, sans-serif;
      font-size: 12px;
      padding: 20px;
    }
    
    h1 {
      font-size: 18px;
      margin-bottom: 20px;
      text-align: center;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    
    th {
      background-color: #f5f5f5;
      font-weight: bold;
    }
    
    .print-footer {
      margin-top: 30px;
      text-align: center;
      font-size: 10px;
      color: #666;
    }
    
    @media print {
      body {
        padding: 0;
      }
      
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <h1>${Utils.escapeHtml(title)}</h1>
  ${content}
  <div class="print-footer">
    Дата печати: ${Utils.formatDate(new Date(), CONFIG.DATE_TIME_FORMAT)} | 
    HAN CRM v${CONFIG.VERSION}
  </div>
  
  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() {
        window.close();
      }, ${CONFIG.PRINT_AUTO_CLOSE_DELAY});
    };
  </script>
</body>
</html>
    `;
    
    this.openPrintWindow(html);
  }
};

// Заморозить объект
Object.freeze(Print);