// js/pages/stock.js
// Логика страницы склада

import { auth } from '../core/auth.js';
import { stockService } from '../services/stock.service.js';
import { Toast } from '../components/Toast.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs';

class StockPage {
  constructor() {
    // Проверка прав (только manager и admin)
    if (!auth.can('products.view')) {
      Toast.error('Нет доступа к складу');
      window.location.href = '/';
      return;
    }

    this.stock = [];
    this.movements = [];
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.searchTimeout = null;

    this.init();
  }

  async init() {
    try {
      this.setupEventListeners();
      this.displayUserInfo();
      this.setupRoleBasedUI();
      await this.loadStock();
      await this.loadMovements();
    } catch (error) {
      console.error('Init error:', error);
      Toast.error('Ошибка инициализации');
    }
  }

  // ========== НАСТРОЙКА ==========
  setupEventListeners() {
    // Поиск
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
          this.searchQuery = e.target.value;
          this.renderStock();
        }, 300);
      });
    }

    // Фильтры
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentFilter = tab.dataset.filter;
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.renderStock();
      });
    });
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

  // ========== ЗАГРУЗКА ДАННЫХ ==========
  async loadStock() {
    try {
      this.showLoader('stockTableBody');

      const result = await stockService.getAllStock();
      this.stock = result.items || [];

      this.renderStock();
      this.updateStatistics();

    } catch (error) {
      console.error('Load stock error:', error);
      Toast.error('Ошибка загрузки остатков');
      this.showError('stockTableBody');
    }
  }

  async loadMovements() {
    try {
      this.showLoader('movementsTableBody');

      const result = await stockService.getMovements({ limit: 100 });
      this.movements = result || [];

      this.renderMovements();

    } catch (error) {
      console.error('Load movements error:', error);
      Toast.error('Ошибка загрузки движений');
      this.showError('movementsTableBody');
    }
  }

  // ========== ОТОБРАЖЕНИЕ ==========
  renderStock() {
    const tbody = document.getElementById('stockTableBody');
    if (!tbody) return;

    let filtered = [...this.stock];

    // Фильтр по поиску
    if (this.searchQuery) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }

    // Фильтр по статусу
    if (this.currentFilter === 'in-stock') {
      filtered = filtered.filter(item => item.quantity >= 10);
    } else if (this.currentFilter === 'low-stock') {
      filtered = filtered.filter(item => item.quantity > 0 && item.quantity < 10);
    } else if (this.currentFilter === 'out-of-stock') {
      filtered = filtered.filter(item => item.quantity === 0);
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
              </svg>
              <h3>Товары не найдены</h3>
              <p>Попробуйте изменить условия поиска</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(item => `
      <tr>
        <td>${item.id}</td>
        <td>
          <strong>${this.escapeHtml(item.name)}</strong>
        </td>
        <td>
          <span style="font-weight: 600; color: #2563eb;">
            ${this.formatMoney(item.price)} сом
          </span>
        </td>
        <td>
          <span class="quantity-display">${item.quantity || 0}</span>
        </td>
        <td>
          ${this.renderStockBadge(item.quantity)}
        </td>
        <td>
          ${item.updated_at ? this.formatDate(item.updated_at) : '—'}
        </td>
        <td>
          <div class="action-buttons">
            <button class="btn-icon" onclick="stockPage.viewDetails(${item.id})" title="Детали">
              👁️
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  renderStockBadge(quantity) {
    if (quantity === 0) {
      return '<span class="stock-badge out-of-stock">Нет в наличии</span>';
    } else if (quantity < 10) {
      return '<span class="stock-badge low-stock">Мало</span>';
    } else {
      return '<span class="stock-badge in-stock">В наличии</span>';
    }
  }

  renderMovements() {
    const tbody = document.getElementById('movementsTableBody');
    if (!tbody) return;

    if (this.movements.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <h3>Движений нет</h3>
              <p>История движений пуста</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.movements.map(m => `
      <tr>
        <td>${this.formatDateTime(m.created_at)}</td>
        <td>
          <strong>${this.escapeHtml(m.product_name)}</strong>
        </td>
        <td>
          <span class="movement-badge ${m.movement_type}">
            ${this.getMovementTypeText(m.movement_type)}
          </span>
        </td>
        <td>
          <span class="quantity-change ${parseInt(m.quantity_change) >= 0 ? 'increase' : 'decrease'}">
            ${parseInt(m.quantity_change) >= 0 ? '+' : ''}${m.quantity_change}
          </span>
        </td>
        <td>
          <strong>${m.quantity_after}</strong>
        </td>
        <td>
          <span style="font-size: 13px; color: #666;">
            ${m.note || '—'}
          </span>
        </td>
        <td>${m.user_name || '—'}</td>
      </tr>
    `).join('');
  }

  updateStatistics() {
    const total = this.stock.length;
    const inStock = this.stock.filter(s => s.quantity >= 10).length;
    const lowStock = this.stock.filter(s => s.quantity > 0 && s.quantity < 10).length;
    const outOfStock = this.stock.filter(s => s.quantity === 0).length;
    const totalQuantity = this.stock.reduce((sum, s) => sum + (s.quantity || 0), 0);

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statInStock').textContent = inStock;
    document.getElementById('statLowStock').textContent = lowStock;
    document.getElementById('statTotalQuantity').textContent = totalQuantity;

    document.getElementById('countAll').textContent = total;
    document.getElementById('countInStock').textContent = inStock;
    document.getElementById('countLowStock').textContent = lowStock;
    document.getElementById('countOutOfStock').textContent = outOfStock;
  }

  // ========== ДЕТАЛИ ТОВАРА ==========
  async viewDetails(productId) {
    try {
      const result = await stockService.getProductStock(productId);
      
      document.getElementById('stockDetailsTitle').textContent = result.product_name;
      document.getElementById('stockDetailsContent').innerHTML = this.renderStockDetails(result);
      document.getElementById('stockDetailsModal').classList.add('show');
    } catch (error) {
      console.error('View details error:', error);
      Toast.error('Ошибка загрузки деталей');
    }
  }

  renderStockDetails(data) {
    return `
      <div class="stock-details-grid">
        <div class="detail-section">
          <h4>Информация о товаре</h4>
          <p><span class="detail-label">ID:</span> <span class="detail-value">${data.product_id}</span></p>
          <p><span class="detail-label">Название:</span> <span class="detail-value">${this.escapeHtml(data.product_name)}</span></p>
          <p><span class="detail-label">Цена:</span> <span class="detail-value">${this.formatMoney(data.price)} сом</span></p>
          <p><span class="detail-label">Остаток:</span> <span class="detail-value">${data.quantity} шт</span></p>
        </div>

        <div class="detail-section">
          <h4>Складской учёт</h4>
          <p><span class="detail-label">Статус:</span> ${this.renderStockBadge(data.quantity)}</p>
        </div>
      </div>

      ${data.movements && data.movements.length > 0 ? `
        <div class="movements-history">
          <h4>История движений (последние ${data.movements.length})</h4>
          <div class="movements-list">
            ${data.movements.map(m => `
              <div class="movement-item">
                <div class="movement-info">
                  <div class="movement-type-text">
                    <span class="movement-badge ${m.movement_type}">${this.getMovementTypeText(m.movement_type)}</span>
                  </div>
                  <div class="movement-date">${this.formatDateTime(m.created_at)}</div>
                  ${m.note ? `<div class="movement-note">${this.escapeHtml(m.note)}</div>` : ''}
                </div>
                <div class="movement-values">
                  <div class="movement-change ${parseInt(m.quantity_change) >= 0 ? 'increase' : 'decrease'}">
                    ${parseInt(m.quantity_change) >= 0 ? '+' : ''}${m.quantity_change}
                  </div>
                  <div class="movement-after">Остаток: ${m.quantity_after}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  closeDetailsModal() {
    document.getElementById('stockDetailsModal').classList.remove('show');
  }

  // ========== СВЕРКА ОСТАТКОВ ==========
  async showReconciliation() {
    try {
      document.getElementById('reconciliationContent').innerHTML = '<div class="loader"></div>';
      document.getElementById('reconciliationModal').classList.add('show');

      const result = await stockService.reconciliation();

      document.getElementById('reconciliationContent').innerHTML = this.renderReconciliation(result);
    } catch (error) {
      console.error('Reconciliation error:', error);
      Toast.error('Ошибка сверки остатков');
    }
  }

  renderReconciliation(data) {
    const hasDiscrepancies = data.discrepancies && data.discrepancies.length > 0;

    return `
      <div class="reconciliation-info">
        <h4>Результаты сверки остатков</h4>
        <p>Проверка целостности данных складского учёта</p>
      </div>

      <div class="reconciliation-status ${hasDiscrepancies ? 'error' : 'ok'}">
        ${hasDiscrepancies ? `
          <h4>⚠️ Обнаружены расхождения!</h4>
          <p>Найдено расхождений: ${data.discrepancies_count}</p>
        ` : `
          <h4>✅ Расхождений не обнаружено</h4>
          <p>Все остатки соответствуют истории движений</p>
        `}
      </div>

      ${hasDiscrepancies ? `
        <h4 style="margin-bottom: 15px;">Список расхождений:</h4>
        ${data.discrepancies.map(d => `
          <div class="discrepancy-item">
            <h5>${this.escapeHtml(d.name)}</h5>
            <p style="font-size: 12px; color: #999;">ID: ${d.id}</p>
            <div class="discrepancy-values">
              <div>
                <div style="font-size: 12px; color: #666;">Текущий остаток:</div>
                <span>${d.current_stock}</span>
              </div>
              <div>
                <div style="font-size: 12px; color: #666;">Расчётный остаток:</div>
                <span>${d.calculated_stock}</span>
              </div>
              <div>
                <div style="font-size: 12px; color: #666;">Разница:</div>
                <span class="discrepancy-difference">${d.difference}</span>
              </div>
            </div>
          </div>
        `).join('')}
      ` : ''}
    `;
  }

  closeReconciliationModal() {
    document.getElementById('reconciliationModal').classList.remove('show');
  }

  // ========== ЭКСПОРТ ==========
  async exportToExcel() {
    try {
      Toast.info('Экспорт в Excel...');

      if (this.stock.length === 0) {
        Toast.error('Нет данных для экспорта');
        return;
      }

      const data = this.stock.map(s => ({
        'ID': s.id,
        'Название': s.name,
        'Цена': parseFloat(s.price),
        'Остаток': s.quantity || 0,
        'Статус': s.quantity === 0 ? 'Нет' : (s.quantity < 10 ? 'Мало' : 'В наличии')
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      ws['!cols'] = [
        { wch: 5 },
        { wch: 40 },
        { wch: 12 },
        { wch: 12 },
        { wch: 15 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Остатки');
      
      const filename = `stock_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);

      Toast.success('Экспорт завершён');
    } catch (error) {
      console.error('Export error:', error);
      Toast.error('Ошибка экспорта');
    }
  }

  // ========== ВСПОМОГАТЕЛЬНЫЕ ==========
  showLoader(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (tbody) {
      const colspan = tbody.closest('table').querySelectorAll('th').length;
      tbody.innerHTML = `
        <tr>
          <td colspan="${colspan}" class="text-center">
            <div class="loader"></div>
          </td>
        </tr>
      `;
    }
  }

  showError(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (tbody) {
      const colspan = tbody.closest('table').querySelectorAll('th').length;
      tbody.innerHTML = `
        <tr>
          <td colspan="${colspan}" class="text-center">
            <div class="empty-state">
              <h3>Ошибка загрузки</h3>
              <p>Не удалось загрузить данные</p>
            </div>
          </td>
        </tr>
      `;
    }
  }

  getMovementTypeText(type) {
    const types = {
      'production': 'Производство',
      'sale': 'Продажа',
      'adjustment': 'Корректировка',
      'writeoff': 'Списание',
      'return': 'Возврат'
    };
    return types[type] || type;
  }

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

  formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Инициализация
let stockPage;
document.addEventListener('DOMContentLoaded', () => {
  stockPage = new StockPage();
  window.stockPage = stockPage;
});

export { stockPage };