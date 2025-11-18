// js/pages/sales.js
// Логика страницы продаж + корзина

import { auth } from '../core/auth.js';
import { clientsService } from '../services/clients.service.js';
import { productsService } from '../services/products.service.js';
import { salesService } from '../services/sales.service.js';
import { Cart } from '../components/Cart.js';
import { Toast } from '../components/Toast.js';
import { Print } from '../components/Print.js';

class SalesPage {
  constructor() {
    // Проверка прав доступа
    if (!auth.can('sales.create')) {
      Toast.error('Нет доступа к продажам');
      window.location.href = '/';
      return;
    }

    this.cart = new Cart();
    this.selectedClient = null;
    this.products = [];
    this.clients = [];
    this.clientSearchTimeout = null;

    this.init();
  }

  async init() {
    try {
      this.setupEventListeners();
      await this.loadProducts();
      this.renderProducts();
      this.updateCartDisplay();
    } catch (error) {
      console.error('Init error:', error);
      Toast.error('Ошибка инициализации страницы');
    }
  }

  // ========== НАСТРОЙКА СОБЫТИЙ ==========
  setupEventListeners() {
    // Поиск клиента
    const clientSearch = document.getElementById('clientSearch');
    if (clientSearch) {
      clientSearch.addEventListener('input', (e) => this.handleClientSearch(e.target.value));
      clientSearch.addEventListener('focus', () => {
        if (clientSearch.value.length >= 2) {
          this.handleClientSearch(clientSearch.value);
        }
      });
    }

    // Очистка поиска клиента
    const clientClearBtn = document.getElementById('clientClearBtn');
    if (clientClearBtn) {
      clientClearBtn.addEventListener('click', () => this.clearClientSelection());
    }

    // Поиск товара
    const productSearch = document.getElementById('productSearch');
    if (productSearch) {
      productSearch.addEventListener('input', (e) => this.filterProducts(e.target.value));
    }

    // Оплата
    const paidInput = document.getElementById('paidAmount');
    if (paidInput) {
      paidInput.addEventListener('input', () => this.updateCalculation());
    }

    // Быстрые суммы
    document.querySelectorAll('.quick-amount-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const amount = parseFloat(btn.dataset.amount);
        document.getElementById('paidAmount').value = amount;
        this.updateCalculation();
      });
    });

    // Использование переплаты
    const useOverpaymentCheckbox = document.getElementById('useOverpayment');
    if (useOverpaymentCheckbox) {
      useOverpaymentCheckbox.addEventListener('change', () => this.updateCalculation());
    }

    // Кнопка продажи
    const sellBtn = document.getElementById('sellBtn');
    if (sellBtn) {
      sellBtn.addEventListener('click', () => this.createSale());
    }

    // Кнопка очистки корзины
    const clearCartBtn = document.getElementById('clearCartBtn');
    if (clearCartBtn) {
      clearCartBtn.addEventListener('click', () => this.clearCart());
    }

    // Клик вне выпадающего списка клиентов
    document.addEventListener('click', (e) => {
      const clientBlock = document.querySelector('.client-block');
      const dropdown = document.getElementById('clientDropdown');
      if (dropdown && clientBlock && !clientBlock.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    // События корзины
    this.cart.on('add', () => this.updateCartDisplay());
    this.cart.on('update', () => this.updateCartDisplay());
    this.cart.on('remove', () => this.updateCartDisplay());
    this.cart.on('clear', () => this.updateCartDisplay());
  }

  // ========== ЗАГРУЗКА ТОВАРОВ ==========
  async loadProducts() {
    try {
      const result = await productsService.getProducts({ 
        active_only: true,
        page_size: 1000 
      });
      this.products = result.items || [];
    } catch (error) {
      console.error('Load products error:', error);
      Toast.error('Ошибка загрузки товаров');
    }
  }

  // ========== ОТОБРАЖЕНИЕ ТОВАРОВ ==========
  renderProducts(filterText = '') {
    const container = document.getElementById('productsGrid');
    if (!container) return;

    const filtered = filterText 
      ? this.products.filter(p => 
          p.name.toLowerCase().includes(filterText.toLowerCase())
        )
      : this.products;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">
          ${filterText ? 'Товары не найдены' : 'Нет доступных товаров'}
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(product => `
      <div class="product-card ${product.quantity === 0 ? 'out-of-stock' : ''}" 
           data-id="${product.id}"
           onclick="salesPage.addToCart(${product.id})">
        <div class="product-name">${this.escapeHtml(product.name)}</div>
        <div class="product-price">${this.formatMoney(product.price)} сом</div>
        <div class="product-stock ${product.quantity < 10 ? 'low' : ''} ${product.quantity === 0 ? 'out' : ''}">
          ${product.quantity === 0 ? 'Нет в наличии' : `Остаток: ${product.quantity}`}
        </div>
      </div>
    `).join('');
  }

  filterProducts(text) {
    this.renderProducts(text);
  }

  // ========== ПОИСК КЛИЕНТОВ ==========
  async handleClientSearch(query) {
    clearTimeout(this.clientSearchTimeout);

    if (query.length < 2) {
      this.hideClientDropdown();
      return;
    }

    this.clientSearchTimeout = setTimeout(async () => {
      try {
        const result = await clientsService.searchClients(query);
        this.clients = result.items || [];
        this.showClientDropdown();
      } catch (error) {
        console.error('Client search error:', error);
        Toast.error('Ошибка поиска клиентов');
      }
    }, 300);
  }

  showClientDropdown() {
    const dropdown = document.getElementById('clientDropdown');
    if (!dropdown) return;

    if (this.clients.length === 0) {
      dropdown.innerHTML = '<div style="padding: 12px; color: #999; text-align: center;">Клиенты не найдены</div>';
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = this.clients.map(client => `
      <div class="client-option" data-id="${client.id}">
        <div class="client-option-name">${this.escapeHtml(client.name)}</div>
        ${client.phone ? `<div class="client-option-phone">${this.escapeHtml(client.phone)}</div>` : ''}
        ${client.current_overpayment > 0 ? `
          <div class="client-option-balance positive">
            Переплата: ${this.formatMoney(client.current_overpayment)} сом
          </div>
        ` : ''}
      </div>
    `).join('');

    // Добавляем обработчики
    dropdown.querySelectorAll('.client-option').forEach(option => {
      option.addEventListener('click', () => {
        const clientId = parseInt(option.dataset.id);
        this.selectClient(clientId);
      });
    });

    dropdown.style.display = 'block';
  }

  hideClientDropdown() {
    const dropdown = document.getElementById('clientDropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
    }
  }

  async selectClient(clientId) {
    try {
      this.selectedClient = this.clients.find(c => c.id === clientId);
      
      if (!this.selectedClient) {
        // Загружаем полные данные клиента
        this.selectedClient = await clientsService.getClient(clientId);
      }

      this.displaySelectedClient();
      this.hideClientDropdown();
      this.updateCalculation();

      // Очищаем поле поиска
      const clientSearch = document.getElementById('clientSearch');
      if (clientSearch) {
        clientSearch.value = '';
      }
    } catch (error) {
      console.error('Select client error:', error);
      Toast.error('Ошибка выбора клиента');
    }
  }

  displaySelectedClient() {
    const container = document.getElementById('selectedClientInfo');
    if (!container || !this.selectedClient) return;

    container.innerHTML = `
      <h4>${this.escapeHtml(this.selectedClient.name)}</h4>
      ${this.selectedClient.phone ? `<p>📱 ${this.escapeHtml(this.selectedClient.phone)}</p>` : ''}
      ${this.selectedClient.address ? `<p>📍 ${this.escapeHtml(this.selectedClient.address)}</p>` : ''}
      ${parseFloat(this.selectedClient.current_overpayment || 0) > 0 ? `
        <div class="client-balance positive">
          💰 Переплата: ${this.formatMoney(this.selectedClient.current_overpayment)} сом
        </div>
      ` : ''}
    `;
    container.style.display = 'block';

    // Показываем чекбокс использования переплаты если есть переплата
    const overpaymentWrapper = document.getElementById('useOverpaymentWrapper');
    if (overpaymentWrapper) {
      if (parseFloat(this.selectedClient.current_overpayment || 0) > 0) {
        overpaymentWrapper.style.display = 'block';
      } else {
        overpaymentWrapper.style.display = 'none';
        document.getElementById('useOverpayment').checked = false;
      }
    }
  }

  clearClientSelection() {
    this.selectedClient = null;
    
    const selectedInfo = document.getElementById('selectedClientInfo');
    if (selectedInfo) {
      selectedInfo.style.display = 'none';
    }

    const clientSearch = document.getElementById('clientSearch');
    if (clientSearch) {
      clientSearch.value = '';
    }

    const overpaymentWrapper = document.getElementById('useOverpaymentWrapper');
    if (overpaymentWrapper) {
      overpaymentWrapper.style.display = 'none';
      document.getElementById('useOverpayment').checked = false;
    }

    this.hideClientDropdown();
    this.updateCalculation();
  }

  // ========== КОРЗИНА ==========
  addToCart(productId) {
    const product = this.products.find(p => p.id === productId);
    
    if (!product) {
      Toast.error('Товар не найден');
      return;
    }

    if (product.quantity === 0) {
      Toast.error('Товар закончился на складе');
      return;
    }

    const currentQty = this.cart.getItemQuantity(productId);
    if (currentQty >= product.quantity) {
      Toast.error(`Недостаточно товара на складе (доступно: ${product.quantity})`);
      return;
    }

    this.cart.addItem({
      id: product.id,
      name: product.name,
      price: parseFloat(product.price),
      available: product.quantity
    });

    Toast.success('Товар добавлен в корзину');
  }

  updateCartDisplay() {
    this.renderCartItems();
    this.updateCartTotals();
    this.updateCalculation();
  }

  renderCartItems() {
    const container = document.getElementById('cartItems');
    if (!container) return;

    const items = this.cart.getItems();

    if (items.length === 0) {
      container.innerHTML = `
        <div class="cart-empty">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
          </svg>
          <p>Корзина пуста</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${this.escapeHtml(item.name)}</div>
          <div class="cart-item-price">${this.formatMoney(item.price)} сом</div>
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="salesPage.cart.decreaseQuantity(${item.id})" ${item.quantity <= 1 ? 'disabled' : ''}>−</button>
          <span class="cart-item-qty">${item.quantity}</span>
          <button class="qty-btn" onclick="salesPage.cart.increaseQuantity(${item.id})" ${item.quantity >= item.available ? 'disabled' : ''}>+</button>
        </div>
        <div class="cart-item-subtotal">${this.formatMoney(item.quantity * item.price)} сом</div>
        <button class="cart-item-remove" onclick="salesPage.cart.removeItem(${item.id})">✕</button>
      </div>
    `).join('');
  }

  updateCartTotals() {
    const total = this.cart.getTotal();
    
    const totalEl = document.getElementById('cartTotal');
    if (totalEl) {
      totalEl.textContent = `${this.formatMoney(total)} сом`;
    }
  }

  updateCalculation() {
    const total = this.cart.getTotal();
    let paid = parseFloat(document.getElementById('paidAmount')?.value || 0);

    // Проверяем использование переплаты
    const useOverpayment = document.getElementById('useOverpayment')?.checked;
    let overpaymentUsed = 0;

    if (useOverpayment && this.selectedClient) {
      const availableOverpayment = parseFloat(this.selectedClient.current_overpayment || 0);
      overpaymentUsed = Math.min(availableOverpayment, Math.max(0, total - paid));
    }

    const totalPaid = paid + overpaymentUsed;
    const debt = Math.max(0, total - totalPaid);
    const change = Math.max(0, totalPaid - total);

    // Отображаем расчёт
    const calcInfo = document.getElementById('calculationInfo');
    if (calcInfo) {
      calcInfo.innerHTML = `
        <div>
          <span class="label">Всего к оплате:</span>
          <span class="value">${this.formatMoney(total)} сом</span>
        </div>
        ${overpaymentUsed > 0 ? `
          <div>
            <span class="label">Использована переплата:</span>
            <span class="value overpayment">−${this.formatMoney(overpaymentUsed)} сом</span>
          </div>
        ` : ''}
        <div>
          <span class="label">Внесено:</span>
          <span class="value">${this.formatMoney(paid)} сом</span>
        </div>
        ${debt > 0 ? `
          <div>
            <span class="label">Долг:</span>
            <span class="value debt">${this.formatMoney(debt)} сом</span>
          </div>
        ` : ''}
        ${change > 0 ? `
          <div>
            <span class="label">Сдача:</span>
            <span class="value overpayment">${this.formatMoney(change)} сом</span>
          </div>
        ` : ''}
      `;
    }

    // Активность кнопки продажи
    const sellBtn = document.getElementById('sellBtn');
    if (sellBtn) {
      const canSell = this.cart.getItems().length > 0 && this.selectedClient;
      sellBtn.disabled = !canSell;
    }
  }

  clearCart() {
    if (this.cart.getItems().length === 0) return;

    if (confirm('Очистить корзину?')) {
      this.cart.clear();
      Toast.info('Корзина очищена');
    }
  }

  // ========== СОЗДАНИЕ ПРОДАЖИ ==========
  async createSale() {
    if (!this.selectedClient) {
      Toast.error('Выберите клиента');
      return;
    }

    const items = this.cart.getItems();
    if (items.length === 0) {
      Toast.error('Корзина пуста');
      return;
    }

    const paid = parseFloat(document.getElementById('paidAmount')?.value || 0);

    // Подтверждение
    const total = this.cart.getTotal();
    if (!confirm(`Продать на сумму ${this.formatMoney(total)} сом?`)) {
      return;
    }

    try {
      const saleData = {
        client_id: this.selectedClient.id,
        items: items.map(item => ({
          product_id: item.id,
          quantity: item.quantity,
          price: item.price
        })),
        paid: paid
      };

      const result = await salesService.createSale(saleData);
      
      Toast.success(`Продажа №${result.receipt_number} создана`);

      // Печать чека
      if (confirm('Распечатать чек?')) {
        Print.printReceipt(result);
      }

      // Очистка
      this.cart.clear();
      this.clearClientSelection();
      document.getElementById('paidAmount').value = '';
      
      // Перезагружаем товары (обновились остатки)
      await this.loadProducts();
      this.renderProducts();

    } catch (error) {
      console.error('Create sale error:', error);
      Toast.error(error.message || 'Ошибка создания продажи');
    }
  }

  // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
  formatMoney(amount) {
    return parseFloat(amount || 0).toFixed(2);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Инициализация
let salesPage;
document.addEventListener('DOMContentLoaded', () => {
  salesPage = new SalesPage();
  
  // Делаем доступным глобально для onclick в HTML
  window.salesPage = salesPage;
});

export { salesPage };