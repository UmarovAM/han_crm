// ============================================
// CART - КОРЗИНА ПОКУПОК HAN CRM v3.1
// ============================================

/**
 * Корзина для страницы продаж
 * Сохраняется в localStorage
 */
class Cart {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container #${containerId} not found`);
    }
    
    this.options = {
      onUpdate: null,    // Callback при изменении корзины
      maxItems: CONFIG.MAX_CART_ITEMS,
      saveToStorage: true, // Автосохранение в localStorage
      ...options
    };
    
    this.items = [];
    this.loadFromStorage();
    this.init();
  }
  
  /**
   * Инициализация
   */
  init() {
    this.render();
  }
  
  /**
   * Загрузить из localStorage
   */
  loadFromStorage() {
    if (this.options.saveToStorage) {
      this.items = Storage.getCart() || [];
      Utils.log('Cart: Loaded from storage', this.items.length, 'items');
    }
  }
  
  /**
   * Сохранить в localStorage
   */
  saveToStorage() {
    if (this.options.saveToStorage) {
      Storage.setCart(this.items);
    }
  }
  
  /**
   * Добавить товар в корзину
   */
  addItem(product, quantity = 1) {
    // Проверяем лимит
    if (this.items.length >= this.options.maxItems) {
      Toast.warning(`Максимум ${this.options.maxItems} товаров в корзине`);
      return false;
    }
    
    // Проверяем, есть ли уже в корзине
    const existingIndex = this.items.findIndex(item => item.id === product.id);
    
    if (existingIndex >= 0) {
      // Увеличиваем количество
      this.items[existingIndex].quantity += quantity;
      Toast.info('Количество обновлено');
    } else {
      // Добавляем новый товар
      this.items.push({
        id: product.id,
        name: product.name,
        price: parseFloat(product.price),
        quantity: quantity,
        total: parseFloat(product.price) * quantity
      });
      Toast.success('Товар добавлен в корзину');
    }
    
    this.update();
    return true;
  }
  
  /**
   * Удалить товар из корзины
   */
  removeItem(productId) {
    const index = this.items.findIndex(item => item.id === productId);
    
    if (index >= 0) {
      this.items.splice(index, 1);
      this.update();
      Toast.info('Товар удалён из корзины');
      return true;
    }
    
    return false;
  }
  
  /**
   * Обновить количество товара
   */
  updateQuantity(productId, quantity) {
    const item = this.items.find(item => item.id === productId);
    
    if (!item) return false;
    
    // Проверяем количество
    if (quantity < CONFIG.MIN_PRODUCT_QUANTITY) {
      Toast.error(`Минимальное количество: ${CONFIG.MIN_PRODUCT_QUANTITY}`);
      return false;
    }
    
    if (quantity > CONFIG.MAX_PRODUCT_QUANTITY) {
      Toast.error(`Максимальное количество: ${CONFIG.MAX_PRODUCT_QUANTITY}`);
      return false;
    }
    
    // Обновляем
    item.quantity = quantity;
    item.total = item.price * quantity;
    
    this.update();
    return true;
  }
  
  /**
   * Обновить цену товара
   */
  updatePrice(productId, price) {
    const item = this.items.find(item => item.id === productId);
    
    if (!item) return false;
    
    item.price = parseFloat(price);
    item.total = item.price * item.quantity;
    
    this.update();
    return true;
  }
  
  /**
   * Очистить корзину
   */
  clear() {
    this.items = [];
    this.update();
    Toast.info('Корзина очищена');
  }
  
  /**
   * Получить все товары
   */
  getItems() {
    return this.items;
  }
  
  /**
   * Получить общую сумму
   */
  getTotal() {
    return this.items.reduce((sum, item) => sum + item.total, 0);
  }
  
  /**
   * Получить количество товаров
   */
  getCount() {
    return this.items.length;
  }
  
  /**
   * Проверка: пуста ли корзина
   */
  isEmpty() {
    return this.items.length === 0;
  }
  
  /**
   * Обновление (перерисовка + callback + сохранение)
   */
  update() {
    this.render();
    this.saveToStorage();
    
    if (this.options.onUpdate) {
      this.options.onUpdate(this);
    }
  }
  
  /**
   * Отрисовка корзины
   */
  render() {
    if (this.isEmpty()) {
      this.container.innerHTML = `
        <div class="cart-empty">
          <i class="fas fa-shopping-cart"></i>
          <p>Корзина пуста</p>
        </div>
      `;
      return;
    }
    
    let html = '<div class="cart-items">';
    
    this.items.forEach(item => {
      html += this.renderItem(item);
    });
    
    html += '</div>';
    html += this.renderTotal();
    html += this.renderActions();
    
    this.container.innerHTML = html;
    this.attachEvents();
  }
  
  /**
   * Отрисовка одного товара
   */
  renderItem(item) {
    return `
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item-name">${Utils.escapeHtml(item.name)}</div>
        <div class="cart-item-controls">
          <input type="number" 
                 class="cart-item-quantity form-control" 
                 value="${item.quantity}" 
                 min="${CONFIG.MIN_PRODUCT_QUANTITY}"
                 max="${CONFIG.MAX_PRODUCT_QUANTITY}"
                 data-id="${item.id}">
          <span class="cart-item-x">×</span>
          <input type="number" 
                 class="cart-item-price form-control" 
                 value="${item.price.toFixed(2)}" 
                 step="0.01"
                 min="0"
                 data-id="${item.id}">
          <span class="cart-item-eq">=</span>
          <div class="cart-item-total">${Utils.formatMoney(item.total)}</div>
          <button class="btn btn-sm btn-danger cart-item-remove" data-id="${item.id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }
  
  /**
   * Отрисовка итого
   */
  renderTotal() {
    return `
      <div class="cart-total">
        <div class="cart-total-label">ИТОГО:</div>
        <div class="cart-total-value">${Utils.formatMoney(this.getTotal())}</div>
      </div>
    `;
  }
  
  /**
   * Кнопки действий
   */
  renderActions() {
    return `
      <div class="cart-actions">
        <button class="btn btn-secondary btn-block" id="cart-clear">
          <i class="fas fa-trash"></i> Очистить корзину
        </button>
      </div>
    `;
  }
  
  /**
   * Привязка событий
   */
  attachEvents() {
    // Изменение количества
    this.container.querySelectorAll('.cart-item-quantity').forEach(input => {
      input.addEventListener('change', (e) => {
        const productId = parseInt(e.target.dataset.id);
        const quantity = parseInt(e.target.value);
        this.updateQuantity(productId, quantity);
      });
    });
    
    // Изменение цены
    this.container.querySelectorAll('.cart-item-price').forEach(input => {
      input.addEventListener('change', (e) => {
        const productId = parseInt(e.target.dataset.id);
        const price = parseFloat(e.target.value);
        this.updatePrice(productId, price);
      });
    });
    
    // Удаление товара
    this.container.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const productId = parseInt(e.target.closest('button').dataset.id);
        this.removeItem(productId);
      });
    });
    
    // Очистить корзину
    const clearBtn = this.container.querySelector('#cart-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        const confirmed = await Modal.confirm('Очистить корзину?');
        if (confirmed) {
          this.clear();
        }
      });
    }
  }
  
  /**
   * Валидация перед продажей
   */
  validate() {
    if (this.isEmpty()) {
      Toast.error('Корзина пуста');
      return false;
    }
    
    // Проверяем корректность количества и цен
    for (const item of this.items) {
      if (item.quantity < CONFIG.MIN_PRODUCT_QUANTITY || item.quantity > CONFIG.MAX_PRODUCT_QUANTITY) {
        Toast.error(`Некорректное количество для товара "${item.name}"`);
        return false;
      }
      
      if (item.price <= 0) {
        Toast.error(`Некорректная цена для товара "${item.name}"`);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Получить данные для отправки на сервер
   */
  getDataForSubmit() {
    return this.items.map(item => ({
      product_id: item.id,
      quantity: item.quantity,
      price: item.price
    }));
  }
}