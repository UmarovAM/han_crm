// js/pages/reports.js
// Логика страницы отчётов

import { auth } from '../core/auth.js';
import { reportsService } from '../services/reports.service.js';
import { Toast } from '../components/Toast.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs';

class ReportsPage {
  constructor() {
    // Проверка прав (только manager и admin)
    if (!auth.can('reports.view')) {
      Toast.error('Нет доступа к отчётам');
      window.location.href = '/';
      return;
    }

    this.currentTab = 'sales';
    this.period = {
      type: 'today',
      date_from: this.getTodayDate(),
      date_to: this.getTodayDate()
    };
    this.reportData = null;

    this.init();
  }

  async init() {
    try {
      this.displayUserInfo();
      this.setupRoleBasedUI();
      await this.loadReports();
    } catch (error) {
      console.error('Init error:', error);
      Toast.error('Ошибка инициализации');
    }
  }

  displayUserInfo() {
    const user = auth.getUser();
    const userName = document.getElementById('userName');
    if (userName && user) {
      userName.textContent = user.name;
    }
  }

  setupRoleBasedUI() {
    const user = auth.getUser();
    if (!user) return;

    document.querySelectorAll('[data-role]').forEach(el => {
      const allowedRoles = el.dataset.role.split(',');
      if (!allowedRoles.includes(user.role)) {
        el.style.display = 'none';
      }
    });
  }

  // ========== УПРАВЛЕНИЕ ПЕРИОДОМ ==========
  selectPeriod(type) {
    this.period.type = type;

    // Обновляем активную кнопку
    document.querySelectorAll('.period-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.period === type);
    });

    // Показываем/скрываем кастомный период
    const customPeriod = document.getElementById('customPeriod');
    if (type === 'custom') {
      customPeriod.style.display = 'flex';
      document.getElementById('dateFrom').value = this.period.date_from;
      document.getElementById('dateTo').value = this.period.date_to;
    } else {
      customPeriod.style.display = 'none';
      this.setPeriodDates(type);
      this.loadReports();
    }
  }

  setPeriodDates(type) {
    const today = new Date();
    let dateFrom, dateTo;

    switch (type) {
      case 'today':
        dateFrom = dateTo = this.getTodayDate();
        break;
      case 'week':
        dateFrom = this.getDateDaysAgo(7);
        dateTo = this.getTodayDate();
        break;
      case 'month':
        dateFrom = this.getDateDaysAgo(30);
        dateTo = this.getTodayDate();
        break;
    }

    this.period.date_from = dateFrom;
    this.period.date_to = dateTo;
    this.updatePeriodDisplay();
  }

  applyCustomPeriod() {
    this.period.date_from = document.getElementById('dateFrom').value;
    this.period.date_to = document.getElementById('dateTo').value;
    
    if (!this.period.date_from || !this.period.date_to) {
      Toast.error('Укажите период');
      return;
    }

    this.updatePeriodDisplay();
    this.loadReports();
  }

  updatePeriodDisplay() {
    const display = document.getElementById('periodDisplay');
    if (this.period.type === 'today') {
      display.textContent = 'Сегодня';
    } else if (this.period.type === 'week') {
      display.textContent = 'Последние 7 дней';
    } else if (this.period.type === 'month') {
      display.textContent = 'Последние 30 дней';
    } else {
      display.textContent = `${this.formatDate(this.period.date_from)} — ${this.formatDate(this.period.date_to)}`;
    }
  }

  // ========== ЗАГРУЗКА ОТЧЁТОВ ==========
  async loadReports() {
    try {
      this.reportData = await reportsService.getSummary(this.period);
      
      this.renderSummary();
      this.renderCurrentTab();
    } catch (error) {
      console.error('Load reports error:', error);
      Toast.error('Ошибка загрузки отчётов');
    }
  }

  // ========== ОТОБРАЖЕНИЕ СВОДКИ ==========
  renderSummary() {
    const data = this.reportData;
    
    // Продажи
    document.getElementById('statSalesAmount').textContent = 
      `${this.formatMoney(data.sales?.total_amount || 0)} сом`;
    document.getElementById('statSalesCount').textContent = 
      `${data.sales?.sales_count || 0} чеков`;

    // Платежи
    document.getElementById('statPaymentsAmount').textContent = 
      `${this.formatMoney(data.payments?.total_amount || 0)} сом`;
    document.getElementById('statPaymentsCount').textContent = 
      `${data.payments?.total_payments || 0} платежей`;

    // Долги
    document.getElementById('statDebtAmount').textContent = 
      `${this.formatMoney(data.debtors?.total_debt || 0)} сом`;
    document.getElementById('statDebtCount').textContent = 
      `${data.debtors?.total_debtors || 0} должников`;

    // Переплаты
    document.getElementById('statOverpaymentAmount').textContent = 
      `${this.formatMoney(data.overpayments?.total_overpayment || 0)} сом`;
    document.getElementById('statOverpaymentCount').textContent = 
      `${data.overpayments?.total_clients || 0} клиентов`;
  }

  // ========== ВКЛАДКИ ==========
  switchTab(tab) {
    this.currentTab = tab;

    // Обновляем активную вкладку
    document.querySelectorAll('.report-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    });

    this.renderCurrentTab();
  }

  async renderCurrentTab() {
    switch (this.currentTab) {
      case 'sales':
        await this.renderSalesReport();
        break;
      case 'clients':
        await this.renderClientsReport();
        break;
      case 'products':
        await this.renderProductsReport();
        break;
      case 'stock':
        await this.renderStockReport();
        break;
    }
  }

  // ========== ОТЧЁТ ПО ПРОДАЖАМ ==========
  async renderSalesReport() {
    try {
      const salesData = await reportsService.getSalesReport(this.period);

      // Динамика по дням
      const byDayBody = document.getElementById('salesByDayBody');
      if (salesData.by_day && salesData.by_day.length > 0) {
        byDayBody.innerHTML = salesData.by_day.map(day => `
          <tr>
            <td>${this.formatDate(day.date)}</td>
            <td>${day.sales_count}</td>
            <td>${this.formatMoney(day.total_amount)} сом</td>
            <td>${this.formatMoney(day.total_paid)} сом</td>
            <td class="${day.total_debt > 0 ? 'amount-negative' : 'amount-neutral'}">
              ${this.formatMoney(day.total_debt)} сом
            </td>
            <td>${this.formatMoney(day.avg_sale)} сом</td>
          </tr>
        `).join('');
      } else {
        byDayBody.innerHTML = '<tr><td colspan="6" class="empty-state"><h4>Нет данных</h4></td></tr>';
      }

      // Топ товары
      const topProductsBody = document.getElementById('topProductsBody');
      if (salesData.by_product && salesData.by_product.length > 0) {
        topProductsBody.innerHTML = salesData.by_product.slice(0, 10).map((product, index) => `
          <tr>
            <td>${index + 1}</td>
            <td><strong>${this.escapeHtml(product.product_name)}</strong></td>
            <td>${product.total_quantity}</td>
            <td>${this.formatMoney(product.total_amount)} сом</td>
            <td>${this.formatMoney(product.avg_price)} сом</td>
          </tr>
        `).join('');
      } else {
        topProductsBody.innerHTML = '<tr><td colspan="5" class="empty-state"><h4>Нет данных</h4></td></tr>';
      }
    } catch (error) {
      console.error('Render sales report error:', error);
    }
  }

  // ========== ОТЧЁТ ПО КЛИЕНТАМ ==========
  async renderClientsReport() {
    try {
      const salesData = await reportsService.getSalesReport(this.period);
      const debtorsData = await reportsService.getDebtorsReport();

      // Топ клиенты
      const topClientsBody = document.getElementById('topClientsBody');
      if (salesData.by_client && salesData.by_client.length > 0) {
        topClientsBody.innerHTML = salesData.by_client.slice(0, 10).map((client, index) => `
          <tr>
            <td>${index + 1}</td>
            <td><strong>${this.escapeHtml(client.client_name)}</strong></td>
            <td>${client.sales_count}</td>
            <td>${this.formatMoney(client.total_amount)} сом</td>
            <td>${this.formatMoney(client.total_paid)} сом</td>
            <td class="${client.total_debt > 0 ? 'amount-negative' : 'amount-neutral'}">
              ${this.formatMoney(client.total_debt)} сом
            </td>
          </tr>
        `).join('');
      } else {
        topClientsBody.innerHTML = '<tr><td colspan="6" class="empty-state"><h4>Нет данных</h4></td></tr>';
      }

      // Должники
      const debtorsBody = document.getElementById('debtorsBody');
      if (debtorsData && debtorsData.length > 0) {
        debtorsBody.innerHTML = debtorsData.map(debtor => `
          <tr>
            <td><strong>${this.escapeHtml(debtor.client_name)}</strong></td>
            <td>${debtor.client_phone || '—'}</td>
            <td>${debtor.sales_count}</td>
            <td class="amount-negative">${this.formatMoney(debtor.total_debt)} сом</td>
          </tr>
        `).join('');
      } else {
        debtorsBody.innerHTML = '<tr><td colspan="4" class="empty-state"><h4>Должников нет</h4></td></tr>';
      }
    } catch (error) {
      console.error('Render clients report error:', error);
    }
  }

  // ========== ОТЧЁТ ПО ТОВАРАМ ==========
  async renderProductsReport() {
    try {
      const salesData = await reportsService.getSalesReport(this.period);

      const productsSalesBody = document.getElementById('productsSalesBody');
      if (salesData.by_product && salesData.by_product.length > 0) {
        productsSalesBody.innerHTML = salesData.by_product.map(product => `
          <tr>
            <td><strong>${this.escapeHtml(product.product_name)}</strong></td>
            <td>${product.total_quantity}</td>
            <td>${this.formatMoney(product.total_amount)} сом</td>
            <td>${this.formatMoney(product.avg_price)} сом</td>
            <td>${product.sales_count}</td>
          </tr>
        `).join('');
      } else {
        productsSalesBody.innerHTML = '<tr><td colspan="5" class="empty-state"><h4>Нет данных</h4></td></tr>';
      }
    } catch (error) {
      console.error('Render products report error:', error);
    }
  }

  // ========== ОТЧЁТ ПО СКЛАДУ ==========
  async renderStockReport() {
    try {
      const stockData = await reportsService.getStockReport();

      // Статистика
      document.getElementById('stockTotal').textContent = stockData.total_products || 0;
      document.getElementById('stockInStock').textContent = stockData.in_stock || 0;
      document.getElementById('stockLowStock').textContent = stockData.low_stock || 0;
      document.getElementById('stockOutOfStock').textContent = stockData.out_of_stock || 0;

      // Товары требующие внимания
      const lowStockBody = document.getElementById('lowStockBody');
      const needAttention = [
        ...(stockData.out_of_stock_items || []),
        ...(stockData.low_stock_items || [])
      ];

      if (needAttention.length > 0) {
        lowStockBody.innerHTML = needAttention.map(item => `
          <tr>
            <td><strong>${this.escapeHtml(item.name)}</strong></td>
            <td>${item.quantity}</td>
            <td>
              ${item.quantity === 0 
                ? '<span class="stock-badge out-of-stock">Нет в наличии</span>'
                : '<span class="stock-badge low-stock">Мало</span>'}
            </td>
            <td>${this.formatMoney(item.price)} сом</td>
          </tr>
        `).join('');
      } else {
        lowStockBody.innerHTML = '<tr><td colspan="4" class="empty-state"><h4>Все товары в наличии</h4></td></tr>';
      }
    } catch (error) {
      console.error('Render stock report error:', error);
    }
  }

  // ========== ЭКСПОРТ И ПЕЧАТЬ ==========
  async exportToExcel() {
    try {
      Toast.info('Экспорт в Excel...');

      const wb = XLSX.utils.book_new();

      // Лист: Сводка
      const summaryData = [
        ['Период', `${this.period.date_from} — ${this.period.date_to}`],
        [],
        ['Показатель', 'Значение'],
        ['Продажи (сумма)', this.formatMoney(this.reportData.sales?.total_amount || 0)],
        ['Продажи (количество)', this.reportData.sales?.sales_count || 0],
        ['Платежи (сумма)', this.formatMoney(this.reportData.payments?.total_amount || 0)],
        ['Долги', this.formatMoney(this.reportData.debtors?.total_debt || 0)],
        ['Переплаты', this.formatMoney(this.reportData.overpayments?.total_overpayment || 0)]
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Сводка');

      const filename = `report_${this.period.date_from}_${this.period.date_to}.xlsx`;
      XLSX.writeFile(wb, filename);

      Toast.success('Экспорт завершён');
    } catch (error) {
      console.error('Export error:', error);
      Toast.error('Ошибка экспорта');
    }
  }

  printReport() {
    window.print();
  }

  // ========== ВСПОМОГАТЕЛЬНЫЕ ==========
  formatMoney(amount) {
    return parseFloat(amount || 0).toFixed(2);
  }

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  getDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Инициализация
let reportsPage;
document.addEventListener('DOMContentLoaded', () => {
  reportsPage = new ReportsPage();
  window.reportsPage = reportsPage;
});

export { reportsPage };