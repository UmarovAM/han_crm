// js/pages/writeoffs.js
// Логика страницы списаний

import { auth } from '../core/auth.js';
import { writeoffsService } from '../services/writeoffs.service.js';
import { productsService } from '../services/products.service.js';
import { Toast } from '../components/Toast.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs';

class WriteoffsPage {
  constructor() {
    // Проверка прав (только manager и admin)
    if (!auth.can('writeoffs.view')) {
      Toast.error('Нет доступа к списаниям');
      window.location.href = '/';
      return;
    }

    this.writeoffs = [];
    this.products = [];
    this.selectedProduct = null;
    this.searchTimeout = null;
    this.filters = {
      date_from: this.getDateMonthAgo(),
      date_to: this.getTodayDate(),
      type: '',
      product_id: ''
    };

    this.init();
  }

  async init() {
    try {
      this.setupEventListeners();
      this.displayUserInfo();
      this.setupRoleBasedUI();
      this.initFilters();
      await this.loadProducts();
      await this.loadWriteoffs();
      await this.loadStatistics();
    } catch (error) {
      console.error('Init error:', error);
      Toast.error('Ошибка инициализации');
    }
  }

  // ========== НАСТРОЙКА ==========
  setupEventListeners() {
    // Поиск товара
    const productSearch = document.getElementById('productSearch');
    if (productSearch) {
      productSearch.addEventListener('input', (e) => {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
          this.searchProducts(e.target.value);
        }, 300);
      });

      // Клик вне закрывает результаты
      document.addEventListener('click', (e) => {
        const wrapper = document.querySelector('.product-search-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
          this.hideSearchResults();
        }
      });
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

  initFilters() {
    document.getElementById('dateFrom').value = this.filters.date_from;
    document.getElementById('dateTo').value = this.filters.date_to;
  }

  // ========== ЗАГРУЗКА ДАННЫХ ==========
  async loadProducts() {
    try {
      const result = await productsService.getProducts({ 
        page_size: 1000,
        active_only: true 
      });
      this.products = result.items || [];
      this.populateProductFilter();
    } catch (error) {
      console.error('Load products error:', error);
      Toast.error('Ошибка загрузки товаров');
    }
  }

  populateProductFilter() {
    const productFilter = document.getElementById('productFilter');
    if (productFilter) {
      productFilter.innerHTML = '<option value="">Все товары</option>' +
        this.products.map(p => `
          <option value="${p.id}">${this.escapeHtml(p.name)}</option>
        `).join('');
    }
  }

  async loadWriteoffs() {
    try {
      this.showLoader();

      const result = await writeoffsService.getWriteoffs(this.filters);
      this.writeoffs = result.items || [];

      this.renderWriteoffs();
    } catch (error) {
      console.error('Load writeoffs error:', error);
      Toast.error('Ошибка загрузки списаний');
      this.showError();
    }
  }

  async loadStatistics() {
    try {
      const stats = await writeoffsService.getStatistics(this.filters);
      
      document.getElementById('statTotal').textContent = stats.overall?.total_records || 0;
      document.getElementById('statQuantity').textContent = stats.overall?.total_quantity || 0;

      const defect = stats.by_type?.find(t => t.type === 'defect');
      const expired = stats.by_type?.find(t => t.type === 'expired');

      document.getElementById('statDefect').textContent = defect?.total_quantity || 0;
      document.getElementById('statExpired').textContent = expired?.total_quantity || 0;

    } catch (error) {
      console.error('Load statistics error:', error);
    }
  }

  // ========== ПОИСК ТОВАРОВ ==========
  searchProducts(query) {
    if (!query || query.length < 2) {
      this.hideSearchResults();
      return;
    }

    const filtered = this.products.filter(p => 
      p.name.toLowerCase().includes(query.toLowerCase())
    );

    this.showSearchResults(filtered);
  }

  showSearchResults(products) {
    const container = document.getElementById('productSearchResults');
    if (!container) return;

    if (products.length === 0) {
      container.innerHTML = '<div style="padding: 12px; color: #999; text-align: center;">Товары не найдены</div>';
      container.classList.add('show');
      return;
    }

    container.innerHTML = products.map(p => `
      <div class="search-result-item" data-id="${p.id}">
        <div class="search-result-name">${this.escapeHtml(p.name)}</div>
        <div class="search-result-info">
          <span>${this.formatMoney(p.price)} сом</span>
          <span class="search-result-stock ${p.quantity < 10 ? 'low' : ''} ${p.quantity === 0 ? 'out' : ''}">
            Остаток: ${p.quantity}
          </span>
        </div>
      </div>
    `).join('');

    // Добавляем обработчики
    container.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const productId = parseInt(item.dataset.id);
        this.selectProduct(productId);
      });
    });

    container.classList.add('show');
  }

  hideSearchResults() {
    const container = document.getElementById('productSearchResults');
    if (container) {
      container.classList.remove('show');
    }
  }

  selectProduct(productId) {
    this.selectedProduct = this.products.find(p => p.id === productId);
    
    if (!this.selectedProduct) return;

    // Скрываем поиск, показываем выбранный товар
    document.getElementById('productSearch').style.display = 'none';
    this.hideSearchResults();

    const infoContainer = document.getElementById('selectedProductInfo');
    if (infoContainer) {
      infoContainer.innerHTML = `
        <h4>${this.escapeHtml(this.selectedProduct.name)}</h4>
        <p>Цена: ${this.formatMoney(this.selectedProduct.price)} сом</p>
        <p class="${this.selectedProduct.quantity === 0 ? 'stock-warning' : ''}">
          Остаток: ${this.selectedProduct.quantity} шт
        </p>
        <button class="btn btn-secondary btn-sm" onclick="writeoffsPage.clearProductSelection()">
          Изменить товар
        </button>
      `;
      infoContainer.style.display = 'block';
    }

    // Устанавливаем максимум для количества
    const quantityInput = document.getElementById('writeoffQuantity');
    if (quantityInput) {
      quantityInput.max = this.selectedProduct.quantity;
      quantityInput.value = '';
    }
  }

  clearProductSelection() {
    this.selectedProduct = null;
    document.getElementById('productSearch').style.display = 'block';
    document.getElementById('productSearch').value = '';
    document.getElementById('selectedProductInfo').style.display = 'none';
    document.getElementById('writeoffQuantity').value = '';
  }

  // ========== ФИЛЬТРАЦИЯ ==========
  applyFilters() {
    this.filters.date_from = document.getElementById('dateFrom').value;
    this.filters.date_to = document.getElementById('dateTo').value;
    this.filters.type = document.getElementById('typeFilter').value;
    this.filters.product_id = document.getElementById('productFilter').value;

    this.loadWriteoffs();
    this.loadStatistics();
  }

  resetFilters() {
    this.filters = {
      date_from: this.getDateMonthAgo(),
      date_to: this.getTodayDate(),
      type: '',
      product_id: ''
    };

    this.initFilters();
    document.getElementById('typeFilter').value = '';
    document.getElementById('productFilter').value = '';

    this.loadWriteoffs();
    this.loadStatistics();
  }

  // ========== ОТОБРАЖЕНИЕ ==========
  renderWriteoffs() {
    const tbody = document.getElementById('writeoffsTableBody');
    if (!tbody) return;

    if (this.writeoffs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
              <h3>Списаний не найдено</h3>
              <p>Попробуйте изменить условия фильтрации</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.writeoffs.map(item => `
      <tr>
        <td>${item.id}</td>
        <td>${this.formatDateTime(item.created_at)}</td>
        <td>
          <strong>${this.escapeHtml(item.product_name)}</strong>
        </td>
        <td>
          <span class="quantity-cell">${item.quantity}</span>
        </td>
        <td>
          <span class="type-badge ${item.type}">
            ${this.getTypeText(item.type)}
          </span>
        </td>
        <td>
          <span class="reason-cell" title="${this.escapeHtml(item.reason)}">
            ${this.escapeHtml(item.reason)}
          </span>
        </td>
        <td>${item.user_name || '—'}</td>
        <td>
          <div class="action-buttons">
            ${auth.can('writeoffs.delete') && auth.getUser().role === 'admin' ? `
              <button class="btn-icon danger" onclick="writeoffsPage.deleteWriteoff(${item.id})" title="Отменить">
                ↩️
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ========== МОДАЛЬНЫЕ ОКНА ==========
  openCreateModal() {
    document.getElementById('writeoffForm').reset();
    this.clearProductSelection();
    document.getElementById('writeoffModal').classList.add('show');
  }

  closeModal() {
    document.getElementById('writeoffModal').classList.remove('show');
  }

  async saveWriteoff() {
    try {
      if (!this.selectedProduct) {
        Toast.error('Выберите товар');
        return;
      }

      const quantity = parseInt(document.getElementById('writeoffQuantity').value);
      const type = document.getElementById('writeoffType').value;
      const reason = document.getElementById('writeoffReason').value.trim();

      if (!quantity || quantity <= 0) {
        Toast.error('Укажите корректное количество');
        return;
      }

      if (quantity > this.selectedProduct.quantity) {
        Toast.error(`Недостаточно товара на складе (доступно: ${this.selectedProduct.quantity})`);
        return;
      }

      if (!type) {
        Toast.error('Выберите тип списания');
        return;
      }

      if (!reason) {
        Toast.error('Укажите причину списания');
        return;
      }

      if (!confirm(`Списать ${quantity} шт товара "${this.selectedProduct.name}"?`)) {
        return;
      }

      const data = {
        product_id: this.selectedProduct.id,
        quantity,
        type,
        reason
      };

      await writeoffsService.createWriteoff(data);
      
      Toast.success(`Списано: ${quantity} шт`);
      
      this.closeModal();
      this.loadWriteoffs();
      this.loadStatistics();

    } catch (error) {
      console.error('Save writeoff error:', error);
      Toast.error(error.message || 'Ошибка сохранения');
    }
  }

  async deleteWriteoff(id) {
    if (!confirm('Отменить списание? Товар будет возвращён на склад.')) {
      return;
    }

    try {
      await writeoffsService.deleteWriteoff(id);
      Toast.success('Списание отменено');
      this.loadWriteoffs();
      this.loadStatistics();
    } catch (error) {
      console.error('Delete writeoff error:', error);
      Toast.error(error.message || 'Ошибка удаления');
    }
  }

  // ========== ЭКСПОРТ ==========
  async exportToExcel() {
    try {
      Toast.info('Экспорт в Excel...');

      if (this.writeoffs.length === 0) {
        Toast.error('Нет данных для экспорта');
        return;
      }

      const data = this.writeoffs.map(w => ({
        'ID': w.id,
        'Дата и время': this.formatDateTime(w.created_at),
        'Товар': w.product_name,
        'Количество': w.quantity,
        'Тип': this.getTypeText(w.type),
        'Причина': w.reason,
        'Создал': w.user_name || ''
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      ws['!cols'] = [
        { wch: 5 },
        { wch: 20 },
        { wch: 40 },
        { wch: 12 },
        { wch: 15 },
        { wch: 40 },
        { wch: 20 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Списания');
      
      const filename = `writeoffs_${this.filters.date_from}_${this.filters.date_to}.xlsx`;
      XLSX.writeFile(wb, filename);

      Toast.success('Экспорт завершён');
    } catch (error) {
      console.error('Export error:', error);
      Toast.error('Ошибка экспорта');
    }
  }

  // ========== ВСПОМОГАТЕЛЬНЫЕ ==========
  showLoader() {
    const tbody = document.getElementById('writeoffsTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center">
            <div class="loader"></div>
          </td>
        </tr>
      `;
    }
  }

  showError() {
    const tbody = document.getElementById('writeoffsTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center">
            <div class="empty-state">
              <h3>Ошибка загрузки</h3>
              <p>Не удалось загрузить данные</p>
            </div>
          </td>
        </tr>
      `;
    }
  }

  getTypeText(type) {
    const types = {
      'defect': '❌ Брак',
      'expired': '⏰ Просрочка',
      'damage': '📦 Повреждение',
      'other': '📝 Другое'
    };
    return types[type] || type;
  }

  formatMoney(amount) {
    return parseFloat(amount || 0).toFixed(2);
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

  getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  getDateMonthAgo() {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Инициализация
let writeoffsPage;
document.addEventListener('DOMContentLoaded', () => {
  writeoffsPage = new WriteoffsPage();
  window.writeoffsPage = writeoffsPage;
});

export { writeoffsPage };