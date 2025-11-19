// js/pages/production.js
// Логика страницы производства

import { auth } from '../core/auth.js';
import { productionService } from '../services/production.service.js';
import { productsService } from '../services/products.service.js';
import { Toast } from '../components/Toast.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs';

class ProductionPage {
  constructor() {
    // Проверка прав (только manager и admin)
    if (!auth.can('production.view')) {
      Toast.error('Нет доступа к производству');
      window.location.href = '/';
      return;
    }

    this.production = [];
    this.products = [];
    this.filters = {
      date_from: this.getDateWeekAgo(),
      date_to: this.getTodayDate(),
      shift: '',
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
      await this.loadProduction();
      await this.loadStatistics();
    } catch (error) {
      console.error('Init error:', error);
      Toast.error('Ошибка инициализации');
    }
  }

  // ========== НАСТРОЙКА ==========
  setupEventListeners() {
    // Автовыбор смены по текущему времени
    const hour = new Date().getHours();
    const shiftSelect = document.getElementById('productionShift');
    if (shiftSelect) {
      shiftSelect.value = (hour >= 8 && hour < 20) ? 'day' : 'night';
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
      this.populateProductSelects();
    } catch (error) {
      console.error('Load products error:', error);
      Toast.error('Ошибка загрузки товаров');
    }
  }

  populateProductSelects() {
    // Заполняем селекты товаров
    const productSelect = document.getElementById('productSelect');
    const productFilter = document.getElementById('productFilter');

    if (productSelect) {
      productSelect.innerHTML = '<option value="">Выберите товар</option>' +
        this.products.map(p => `
          <option value="${p.id}">${this.escapeHtml(p.name)}</option>
        `).join('');
    }

    if (productFilter) {
      productFilter.innerHTML = '<option value="">Все товары</option>' +
        this.products.map(p => `
          <option value="${p.id}">${this.escapeHtml(p.name)}</option>
        `).join('');
    }
  }

  async loadProduction() {
    try {
      this.showLoader();

      const result = await productionService.getProduction(this.filters);
      this.production = result || [];

      this.renderProduction();
    } catch (error) {
      console.error('Load production error:', error);
      Toast.error('Ошибка загрузки производства');
      this.showError();
    }
  }

  async loadStatistics() {
    try {
      const stats = await productionService.getStatistics(this.filters);
      
      document.getElementById('statTotal').textContent = stats.overall?.total_records || 0;
      document.getElementById('statQuantity').textContent = stats.overall?.total_quantity || 0;

      const dayShift = stats.by_shift?.find(s => s.shift === 'day');
      const nightShift = stats.by_shift?.find(s => s.shift === 'night');

      document.getElementById('statDay').textContent = dayShift?.total_quantity || 0;
      document.getElementById('statNight').textContent = nightShift?.total_quantity || 0;

    } catch (error) {
      console.error('Load statistics error:', error);
    }
  }

  // ========== ФИЛЬТРАЦИЯ ==========
  applyFilters() {
    this.filters.date_from = document.getElementById('dateFrom').value;
    this.filters.date_to = document.getElementById('dateTo').value;
    this.filters.shift = document.getElementById('shiftFilter').value;
    this.filters.product_id = document.getElementById('productFilter').value;

    this.loadProduction();
    this.loadStatistics();
  }

  resetFilters() {
    this.filters = {
      date_from: this.getDateWeekAgo(),
      date_to: this.getTodayDate(),
      shift: '',
      product_id: ''
    };

    this.initFilters();
    document.getElementById('shiftFilter').value = '';
    document.getElementById('productFilter').value = '';

    this.loadProduction();
    this.loadStatistics();
  }

  // ========== ОТОБРАЖЕНИЕ ==========
  renderProduction() {
    const tbody = document.getElementById('productionTableBody');
    if (!tbody) return;

    if (this.production.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <h3>Записи не найдены</h3>
              <p>Попробуйте изменить условия фильтрации</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.production.map(item => `
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
          <span class="shift-badge ${item.shift}">
            ${item.shift === 'day' ? '🌞 Дневная' : '🌙 Ночная'}
          </span>
        </td>
        <td>
          <span class="note-cell" title="${item.note || '—'}">
            ${item.note || '—'}
          </span>
        </td>
        <td>${item.user_name || '—'}</td>
        <td>
          <div class="action-buttons">
            ${auth.can('production.delete') ? `
              <button class="btn-icon danger" onclick="productionPage.deleteProduction(${item.id})" title="Удалить">
                🗑️
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ========== МОДАЛЬНЫЕ ОКНА ==========
  openCreateModal() {
    document.getElementById('productionForm').reset();
    
    // Автовыбор смены
    const hour = new Date().getHours();
    document.getElementById('productionShift').value = (hour >= 8 && hour < 20) ? 'day' : 'night';
    
    document.getElementById('productionModal').classList.add('show');
  }

  closeModal() {
    document.getElementById('productionModal').classList.remove('show');
  }

  async saveProduction() {
    try {
      const productId = document.getElementById('productSelect').value;
      const quantity = parseInt(document.getElementById('productionQuantity').value);
      const shift = document.getElementById('productionShift').value;
      const note = document.getElementById('productionNote').value.trim();

      if (!productId) {
        Toast.error('Выберите товар');
        return;
      }

      if (!quantity || quantity <= 0) {
        Toast.error('Укажите корректное количество');
        return;
      }

      const data = {
        product_id: parseInt(productId),
        quantity,
        shift,
        note
      };

      await productionService.createProduction(data);
      
      Toast.success(`Добавлено производство: ${quantity} шт`);
      
      this.closeModal();
      this.loadProduction();
      this.loadStatistics();

    } catch (error) {
      console.error('Save production error:', error);
      Toast.error(error.message || 'Ошибка сохранения');
    }
  }

  async deleteProduction(id) {
    if (!confirm('Удалить запись производства? Товар будет списан со склада.')) {
      return;
    }

    try {
      await productionService.deleteProduction(id);
      Toast.success('Запись удалена');
      this.loadProduction();
      this.loadStatistics();
    } catch (error) {
      console.error('Delete production error:', error);
      Toast.error(error.message || 'Ошибка удаления');
    }
  }

  // ========== ЭКСПОРТ ==========
  async exportToExcel() {
    try {
      Toast.info('Экспорт в Excel...');

      if (this.production.length === 0) {
        Toast.error('Нет данных для экспорта');
        return;
      }

      const data = this.production.map(p => ({
        'ID': p.id,
        'Дата и время': this.formatDateTime(p.created_at),
        'Товар': p.product_name,
        'Количество': p.quantity,
        'Смена': p.shift === 'day' ? 'Дневная' : 'Ночная',
        'Примечание': p.note || '',
        'Создал': p.user_name || ''
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      ws['!cols'] = [
        { wch: 5 },
        { wch: 20 },
        { wch: 40 },
        { wch: 12 },
        { wch: 12 },
        { wch: 30 },
        { wch: 20 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Производство');
      
      const filename = `production_${this.filters.date_from}_${this.filters.date_to}.xlsx`;
      XLSX.writeFile(wb, filename);

      Toast.success('Экспорт завершён');
    } catch (error) {
      console.error('Export error:', error);
      Toast.error('Ошибка экспорта');
    }
  }

  // ========== ВСПОМОГАТЕЛЬНЫЕ ==========
  showLoader() {
    const tbody = document.getElementById('productionTableBody');
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
    const tbody = document.getElementById('productionTableBody');
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

  getDateWeekAgo() {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Инициализация
let productionPage;
document.addEventListener('DOMContentLoaded', () => {
  productionPage = new ProductionPage();
  window.productionPage = productionPage;
});

export { productionPage };