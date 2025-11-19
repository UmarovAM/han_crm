// js/pages/products.js
// Логика страницы товаров

import { auth } from '../core/auth.js';
import { productsService } from '../services/products.service.js';
import { Toast } from '../components/Toast.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs';

class ProductsPage {
  constructor() {
    // Проверка прав
    if (!auth.can('products.view')) {
      Toast.error('Нет доступа к товарам');
      window.location.href = '/';
      return;
    }

    this.products = [];
    this.currentFilter = 'all';
    this.currentPage = 1;
    this.pageSize = 20;
    this.totalPages = 1;
    this.searchQuery = '';
    this.searchTimeout = null;

    this.init();
  }

  async init() {
    try {
      this.setupEventListeners();
      this.displayUserInfo();
      this.setupRoleBasedUI();
      await this.loadProducts();
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
          this.currentPage = 1;
          this.loadProducts();
        }, 300);
      });
    }

    // Фильтры
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentFilter = tab.dataset.filter;
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentPage = 1;
        this.loadProducts();
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

  // ========== ЗАГРУЗКА ТОВАРОВ ==========
  async loadProducts() {
    try {
      this.showLoader();

      const result = await productsService.getProducts({
        page: this.currentPage,
        page_size: this.pageSize,
        search: this.searchQuery,
        active_only: false
      });

      this.products = result.items || [];
      this.totalPages = Math.ceil((result.total || 0) / this.pageSize);

      this.filterProducts();
      this.renderProducts();
      this.renderPagination();
      this.updateStatistics();

    } catch (error) {
      console.error('Load products error:', error);
      Toast.error('Ошибка загрузки товаров');
      this.showError();
    }
  }

  filterProducts() {
    if (this.currentFilter === 'in-stock') {
      this.products = this.products.filter(p => p.quantity >= 10);
    } else if (this.currentFilter === 'low-stock') {
      this.products = this.products.filter(p => p.quantity > 0 && p.quantity < 10);
    } else if (this.currentFilter === 'out-of-stock') {
      this.products = this.products.filter(p => p.quantity === 0);
    }
  }

  // ========== ОТОБРАЖЕНИЕ ==========
  renderProducts() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    if (this.products.length === 0) {
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

    tbody.innerHTML = this.products.map(product => `
      <tr class="${product.is_active ? '' : 'inactive'}">
        <td>${product.id}</td>
        <td>
          <strong>${this.escapeHtml(product.name)}</strong>
        </td>
        <td>
          <span class="price-badge">${this.formatMoney(product.price)} сом</span>
        </td>
        <td>
          <strong style="font-size: 16px;">${product.quantity || 0}</strong>
        </td>
        <td>
          ${this.renderStockBadge(product.quantity)}
        </td>
        <td>
          ${this.formatDate(product.updated_at)}
        </td>
        <td>
          <div class="action-buttons">
            <button class="btn-icon" onclick="productsPage.viewDetails(${product.id})" title="Детали">
              👁️
            </button>
            ${auth.can('products.edit') ? `
              <button class="btn-icon" onclick="productsPage.openEditModal(${product.id})" title="Редактировать">
                ✏️
              </button>
              <button class="btn-icon" onclick="productsPage.openAdjustModal(${product.id})" title="Корректировка">
                📊
              </button>
            ` : ''}
            ${auth.can('products.delete') ? `
              <button class="btn-icon danger" onclick="productsPage.deleteProduct(${product.id})" title="Удалить">
                🗑️
              </button>
            ` : ''}
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

  renderPagination() {
    const container = document.getElementById('pagination');
    if (!container || this.totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    const pages = [];
    
    if (this.currentPage > 2) {
      pages.push(1);
      if (this.currentPage > 3) pages.push('...');
    }

    for (let i = Math.max(1, this.currentPage - 1); i <= Math.min(this.totalPages, this.currentPage + 1); i++) {
      pages.push(i);
    }

    if (this.currentPage < this.totalPages - 1) {
      if (this.currentPage < this.totalPages - 2) pages.push('...');
      pages.push(this.totalPages);
    }

    container.innerHTML = `
      <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} 
              onclick="productsPage.goToPage(${this.currentPage - 1})">
        ← Назад
      </button>
      ${pages.map(page => {
        if (page === '...') return `<span class="pagination-info">...</span>`;
        return `
          <button class="pagination-btn ${page === this.currentPage ? 'active' : ''}" 
                  onclick="productsPage.goToPage(${page})">
            ${page}
          </button>
        `;
      }).join('')}
      <button class="pagination-btn" ${this.currentPage === this.totalPages ? 'disabled' : ''} 
              onclick="productsPage.goToPage(${this.currentPage + 1})">
        Вперёд →
      </button>
    `;
  }

  goToPage(page) {
    this.currentPage = page;
    this.loadProducts();
  }

  async updateStatistics() {
    try {
      const result = await productsService.getProducts({ page_size: 10000 });
      const allProducts = result.items || [];

      const total = allProducts.length;
      const inStock = allProducts.filter(p => p.quantity >= 10).length;
      const lowStock = allProducts.filter(p => p.quantity > 0 && p.quantity < 10).length;
      const outOfStock = allProducts.filter(p => p.quantity === 0).length;

      document.getElementById('statTotal').textContent = total;
      document.getElementById('statInStock').textContent = inStock;
      document.getElementById('statLowStock').textContent = lowStock;
      document.getElementById('statOutOfStock').textContent = outOfStock;

      document.getElementById('countAll').textContent = total;
      document.getElementById('countInStock').textContent = inStock;
      document.getElementById('countLowStock').textContent = lowStock;
      document.getElementById('countOutOfStock').textContent = outOfStock;

    } catch (error) {
      console.error('Update statistics error:', error);
    }
  }

  // ========== МОДАЛЬНЫЕ ОКНА ==========
  openCreateModal() {
    document.getElementById('modalTitle').textContent = 'Добавить товар';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productIsActive').checked = true;
    document.getElementById('productModal').classList.add('show');
  }

  async openEditModal(id) {
    try {
      const product = await productsService.getProduct(id);
      
      document.getElementById('modalTitle').textContent = 'Редактировать товар';
      document.getElementById('productId').value = product.id;
      document.getElementById('productName').value = product.name;
      document.getElementById('productPrice').value = product.price;
      document.getElementById('productIsActive').checked = product.is_active;
      
      document.getElementById('productModal').classList.add('show');
    } catch (error) {
      console.error('Open edit modal error:', error);
      Toast.error('Ошибка загрузки данных товара');
    }
  }

  closeModal() {
    document.getElementById('productModal').classList.remove('show');
  }

  async saveProduct() {
    try {
      const id = document.getElementById('productId').value;
      const data = {
        name: document.getElementById('productName').value.trim(),
        price: parseFloat(document.getElementById('productPrice').value),
        is_active: document.getElementById('productIsActive').checked ? 1 : 0
      };

      if (!data.name) {
        Toast.error('Укажите название товара');
        return;
      }

      if (data.price < 0) {
        Toast.error('Цена не может быть отрицательной');
        return;
      }

      if (id) {
        await productsService.updateProduct(id, data);
        Toast.success('Товар обновлён');
      } else {
        await productsService.createProduct(data);
        Toast.success('Товар создан');
      }

      this.closeModal();
      this.loadProducts();
    } catch (error) {
      console.error('Save product error:', error);
      Toast.error(error.message || 'Ошибка сохранения');
    }
  }

  async deleteProduct(id) {
    if (!confirm('Удалить товар? Это действие нельзя отменить.')) {
      return;
    }

    try {
      await productsService.deleteProduct(id);
      Toast.success('Товар удалён');
      this.loadProducts();
    } catch (error) {
      console.error('Delete product error:', error);
      Toast.error(error.message || 'Ошибка удаления');
    }
  }

  // ========== КОРРЕКТИРОВКА ОСТАТКА ==========
  async openAdjustModal(id) {
    try {
      const product = await productsService.getProduct(id);
      
      document.getElementById('adjustProductId').value = product.id;
      document.getElementById('newQuantity').value = product.quantity;
      document.getElementById('adjustReason').value = '';
      
      document.getElementById('adjustProductInfo').innerHTML = `
        <h4>${this.escapeHtml(product.name)}</h4>
        <div class="stock-info">
          <span>Текущий остаток:</span>
          <strong class="highlight">${product.quantity} шт</strong>
        </div>
      `;
      
      document.getElementById('adjustStockModal').classList.add('show');
    } catch (error) {
      console.error('Open adjust modal error:', error);
      Toast.error('Ошибка загрузки данных');
    }
  }

  closeAdjustModal() {
    document.getElementById('adjustStockModal').classList.remove('show');
  }

  async confirmAdjust() {
    try {
      const productId = document.getElementById('adjustProductId').value;
      const newQuantity = parseInt(document.getElementById('newQuantity').value);
      const reason = document.getElementById('adjustReason').value.trim();

      if (newQuantity < 0) {
        Toast.error('Количество не может быть отрицательным');
        return;
      }

      if (!reason) {
        Toast.error('Укажите причину корректировки');
        return;
      }

      if (!confirm(`Установить новый остаток: ${newQuantity} шт?`)) {
        return;
      }

      await productsService.adjustStock(productId, { new_quantity: newQuantity, reason });
      
      Toast.success('Остаток скорректирован');
      this.closeAdjustModal();
      this.loadProducts();
    } catch (error) {
      console.error('Adjust error:', error);
      Toast.error(error.message || 'Ошибка корректировки');
    }
  }

  // ========== ДЕТАЛИ ТОВАРА ==========
  async viewDetails(id) {
    try {
      const product = await productsService.getProduct(id);
      
      document.getElementById('productDetailsTitle').textContent = product.name;
      document.getElementById('productDetailsContent').innerHTML = this.renderProductDetails(product);
      document.getElementById('productDetailsModal').classList.add('show');
    } catch (error) {
      console.error('View details error:', error);
      Toast.error('Ошибка загрузки деталей');
    }
  }

  renderProductDetails(product) {
    return `
      <div class="product-details-grid">
        <div class="detail-section">
          <h4>Основная информация</h4>
          <p><span class="detail-label">ID:</span> <span class="detail-value">${product.id}</span></p>
          <p><span class="detail-label">Название:</span> <span class="detail-value">${this.escapeHtml(product.name)}</span></p>
          <p><span class="detail-label">Цена:</span> <span class="detail-value">${this.formatMoney(product.price)} сом</span></p>
          <p><span class="detail-label">Остаток:</span> <span class="detail-value">${product.quantity || 0} шт</span></p>
          <p><span class="detail-label">Статус:</span> 
            <span class="status-badge ${product.is_active ? 'active' : 'inactive'}">
              ${product.is_active ? 'Активен' : 'Неактивен'}
            </span>
          </p>
        </div>

        <div class="detail-section">
          <h4>Складской учёт</h4>
          <p><span class="detail-label">Состояние:</span> ${this.renderStockBadge(product.quantity)}</p>
          <p><span class="detail-label">Создан:</span> <span class="detail-value">${this.formatDate(product.created_at)}</span></p>
          <p><span class="detail-label">Изменён:</span> <span class="detail-value">${this.formatDate(product.updated_at)}</span></p>
        </div>
      </div>

      ${product.movements && product.movements.length > 0 ? `
        <div class="movements-section">
          <h4>История движений (последние ${product.movements.length})</h4>
          <div class="movements-list">
            ${product.movements.map(m => `
              <div class="movement-item">
                <div class="movement-info">
                  <div class="movement-type">
                    <span class="movement-type-badge ${m.movement_type}">${this.getMovementTypeText(m.movement_type)}</span>
                  </div>
                  <div class="movement-date">${this.formatDate(m.created_at)}</div>
                  ${m.note ? `<div class="movement-note">${this.escapeHtml(m.note)}</div>` : ''}
                </div>
                <div>
                  <div class="movement-quantity ${parseInt(m.quantity_change) >= 0 ? 'increase' : 'decrease'}">
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
    document.getElementById('productDetailsModal').classList.remove('show');
  }

  // ========== ЭКСПОРТ ==========
  async exportToExcel() {
    try {
      Toast.info('Экспорт в Excel...');

      const result = await productsService.getProducts({ page_size: 10000 });
      const products = result.items || [];

      if (products.length === 0) {
        Toast.error('Нет данных для экспорта');
        return;
      }

      const data = products.map(p => ({
        'ID': p.id,
        'Название': p.name,
        'Цена': parseFloat(p.price),
        'Остаток': p.quantity || 0,
        'Статус': p.is_active ? 'Активен' : 'Неактивен',
        'Обновлён': this.formatDate(p.updated_at)
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      ws['!cols'] = [
        { wch: 5 },
        { wch: 40 },
        { wch: 12 },
        { wch: 12 },
        { wch: 10 },
        { wch: 20 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Товары');
      
      const filename = `products_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);

      Toast.success('Экспорт завершён');
    } catch (error) {
      console.error('Export error:', error);
      Toast.error('Ошибка экспорта');
    }
  }

  // ========== ВСПОМОГАТЕЛЬНЫЕ ==========
  showLoader() {
    const tbody = document.getElementById('productsTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center">
            <div class="loader"></div>
          </td>
        </tr>
      `;
    }
  }

  showError() {
    const tbody = document.getElementById('productsTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center">
            <div class="empty-state">
              <h3>Ошибка загрузки</h3>
              <p>Не удалось загрузить данные</p>
            </div>
          </td>
        </tr>
      `;
    }
  }

  formatMoney(amount) {
    return parseFloat(amount || 0).toFixed(2);
  }

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Инициализация
let productsPage;
document.addEventListener('DOMContentLoaded', () => {
  productsPage = new ProductsPage();
  window.productsPage = productsPage;
});

export { productsPage };