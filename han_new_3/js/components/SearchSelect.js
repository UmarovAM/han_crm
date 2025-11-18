// ============================================
// SEARCHSELECT - ПОИСК С ВЫБОРОМ HAN CRM v3.1
// ============================================

/**
 * Компонент поиска и выбора (для клиентов, товаров)
 * Использует live-поиск с подсказками
 */
class SearchSelect {
  constructor(inputId, options = {}) {
    this.input = document.getElementById(inputId);
    if (!this.input) {
      throw new Error(`Input #${inputId} not found`);
    }
    
    this.options = {
      placeholder: 'Начните вводить...',
      minChars: 2,
      debounceDelay: CONFIG.DEBOUNCE_DELAY,
      onSearch: null, // Async функция поиска (query) => Promise<results[]>
      onSelect: null, // Callback при выборе (item) => void
      displayKey: 'name', // Ключ для отображения
      valueKey: 'id',     // Ключ значения
      renderItem: null,   // Кастомный рендер элемента списка
      emptyMessage: 'Ничего не найдено',
      clearable: true,
      ...options
    };
    
    this.selectedItem = null;
    this.isOpen = false;
    this.results = [];
    
    this.init();
  }
  
  /**
   * Инициализация
   */
  init() {
    // Устанавливаем placeholder
    this.input.placeholder = this.options.placeholder;
    
    // Создаём wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'search-select';
    
    // Оборачиваем input
    this.input.parentNode.insertBefore(this.wrapper, this.input);
    this.wrapper.appendChild(this.input);
    
    // Создаём dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'search-select-dropdown';
    this.wrapper.appendChild(this.dropdown);
    
    // Кнопка очистки (если разрешено)
    if (this.options.clearable) {
      this.clearBtn = document.createElement('button');
      this.clearBtn.className = 'search-select-clear';
      this.clearBtn.type = 'button';
      this.clearBtn.innerHTML = '<i class="fas fa-times"></i>';
      this.clearBtn.style.display = 'none';
      this.wrapper.appendChild(this.clearBtn);
      
      this.clearBtn.addEventListener('click', () => {
        this.clear();
      });
    }
    
    this.attachEvents();
  }
  
  /**
   * Привязка событий
   */
  attachEvents() {
    // Ввод текста
    this.input.addEventListener('input', Utils.debounce(async (e) => {
      const query = e.target.value.trim();
      
      if (query.length < this.options.minChars) {
        this.close();
        return;
      }
      
      await this.search(query);
    }, this.options.debounceDelay));
    
    // Фокус
    this.input.addEventListener('focus', () => {
      if (this.results.length > 0) {
        this.open();
      }
    });
    
    // Клик вне компонента
    document.addEventListener('click', (e) => {
      if (!this.wrapper.contains(e.target)) {
        this.close();
      }
    });
    
    // Клик по элементу списка
    this.dropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.search-select-item');
      if (item) {
        const index = parseInt(item.dataset.index);
        this.select(this.results[index]);
      }
    });
    
    // Навигация стрелками
    this.input.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      
      const items = this.dropdown.querySelectorAll('.search-select-item');
      let currentIndex = -1;
      
      items.forEach((item, i) => {
        if (item.classList.contains('active')) {
          currentIndex = i;
        }
      });
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, items.length - 1);
        this.highlightItem(items, nextIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = Math.max(currentIndex - 1, 0);
        this.highlightItem(items, prevIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentIndex >= 0) {
          this.select(this.results[currentIndex]);
        }
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
  }
  
  /**
   * Выполнить поиск
   */
  async search(query) {
    if (!this.options.onSearch) {
      Utils.error('SearchSelect: onSearch callback not provided');
      return;
    }
    
    try {
      // Показываем индикатор загрузки
      this.showLoading();
      
      // Выполняем поиск
      const results = await this.options.onSearch(query);
      
      this.results = results || [];
      this.renderResults();
      this.open();
      
    } catch (error) {
      Utils.error('SearchSelect: Search error', error);
      this.results = [];
      this.renderResults();
    }
  }
  
  /**
   * Отрисовка результатов
   */
  renderResults() {
    if (this.results.length === 0) {
      this.dropdown.innerHTML = `
        <div class="search-select-empty">
          ${this.options.emptyMessage}
        </div>
      `;
      return;
    }
    
    let html = '';
    
    this.results.forEach((item, index) => {
      if (this.options.renderItem) {
        html += `<div class="search-select-item" data-index="${index}">
                  ${this.options.renderItem(item)}
                </div>`;
      } else {
        const display = item[this.options.displayKey];
        html += `<div class="search-select-item" data-index="${index}">
                  ${Utils.escapeHtml(display)}
                </div>`;
      }
    });
    
    this.dropdown.innerHTML = html;
  }
  
  /**
   * Показать loading
   */
  showLoading() {
    this.dropdown.innerHTML = `
      <div class="search-select-loading">
        <i class="fas fa-spinner fa-spin"></i> Поиск...
      </div>
    `;
    this.open();
  }
  
  /**
   * Открыть dropdown
   */
  open() {
    this.isOpen = true;
    this.dropdown.classList.add('show');
  }
  
  /**
   * Закрыть dropdown
   */
  close() {
    this.isOpen = false;
    this.dropdown.classList.remove('show');
  }
  
  /**
   * Выделить элемент в списке
   */
  highlightItem(items, index) {
    items.forEach(item => item.classList.remove('active'));
    if (items[index]) {
      items[index].classList.add('active');
      items[index].scrollIntoView({ block: 'nearest' });
    }
  }
  
  /**
   * Выбрать элемент
   */
  select(item) {
    this.selectedItem = item;
    
    // Обновляем input
    const display = item[this.options.displayKey];
    this.input.value = display;
    
    // Показываем кнопку очистки
    if (this.clearBtn) {
      this.clearBtn.style.display = '';
    }
    
    // Блокируем input (чтобы нельзя было редактировать)
    this.input.readOnly = true;
    
    // Закрываем dropdown
    this.close();
    
    // Callback
    if (this.options.onSelect) {
      this.options.onSelect(item);
    }
    
    Utils.log('SearchSelect: Selected', item);
  }
  
  /**
   * Очистить выбор
   */
  clear() {
    this.selectedItem = null;
    this.input.value = '';
    this.input.readOnly = false;
    
    if (this.clearBtn) {
      this.clearBtn.style.display = 'none';
    }
    
    this.results = [];
    this.close();
    
    // Фокус на input
    this.input.focus();
    
    Utils.log('SearchSelect: Cleared');
  }
  
  /**
   * Получить выбранный элемент
   */
  getValue() {
    return this.selectedItem ? this.selectedItem[this.options.valueKey] : null;
  }
  
  /**
   * Получить весь выбранный объект
   */
  getSelectedItem() {
    return this.selectedItem;
  }
  
  /**
   * Установить значение программно
   */
  setValue(item) {
    this.select(item);
  }
  
  /**
   * Проверка: выбран ли элемент
   */
  hasValue() {
    return this.selectedItem !== null;
  }
  
  /**
   * Включить/выключить
   */
  setEnabled(enabled) {
    this.input.disabled = !enabled;
    
    if (!enabled) {
      this.close();
    }
  }
  
  /**
   * Уничтожить компонент
   */
  destroy() {
    // Удаляем wrapper
    this.input.parentNode.insertBefore(this.input, this.wrapper);
    this.wrapper.parentNode.removeChild(this.wrapper);
  }
}