// ============================================
// DATATABLE - ТАБЛИЦА С ПАГИНАЦИЕЙ HAN CRM v3.1
// ============================================

/**
 * Универсальная таблица с:
 * - Пагинацией
 * - Сортировкой
 * - Поиском
 * - Фильтрами
 * - Экспортом в Excel
 */
class DataTable {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container #${containerId} not found`);
    }
    
    // Настройки по умолчанию
    this.options = {
      columns: [], // { key, label, sortable, render }
      data: [],
      pageSize: CONFIG.DEFAULT_PAGE_SIZE,
      currentPage: 1,
      totalItems: 0,
      sortBy: null,
      sortOrder: 'asc',
      searchable: true,
      searchPlaceholder: 'Поиск...',
      onSearch: null, // Callback для серверного поиска
      onSort: null,   // Callback для серверной сортировки
      onPageChange: null, // Callback при смене страницы
      actions: [],    // Действия для строк
      exportable: true,
      exportFilename: 'export',
      emptyMessage: 'Нет данных',
      loading: false,
      ...options
    };
    
    this.init();
  }
  
  /**
   * Инициализация
   */
  init() {
    this.render();
    this.attachEvents();
  }
  
  /**
   * Отрисовка таблицы
   */
  render() {
    this.container.innerHTML = `
      <div class="datatable">
        ${this.renderToolbar()}
        ${this.renderTable()}
        ${this.renderPagination()}
      </div>
    `;
  }
  
  /**
   * Toolbar (поиск, экспорт)
   */
  renderToolbar() {
    let html = '<div class="datatable-toolbar">';
    
    // Поиск
    if (this.options.searchable) {
      html += `
        <div class="datatable-search">
          <input type="text" 
                 class="form-control" 
                 placeholder="${this.options.searchPlaceholder}" 
                 id="${this.container.id}-search">
        </div>
      `;
    }
    
    // Экспорт
    if (this.options.exportable) {
      html += `
        <button class="btn btn-secondary" id="${this.container.id}-export">
          <i class="fas fa-file-excel"></i> Экспорт Excel
        </button>
      `;
    }
    
    html += '</div>';
    return html;
  }
  
  /**
   * Таблица
   */
  renderTable() {
    let html = '<div class="datatable-wrapper">';
    
    if (this.options.loading) {
      html += '<div class="datatable-loading">Загрузка...</div>';
    } else if (this.options.data.length === 0) {
      html += `<div class="datatable-empty">${this.options.emptyMessage}</div>`;
    } else {
      html += '<table class="datatable-table">';
      html += this.renderHeader();
      html += this.renderBody();
      html += '</table>';
    }
    
    html += '</div>';
    return html;
  }
  
  /**
   * Заголовок таблицы
   */
  renderHeader() {
    let html = '<thead><tr>';
    
    this.options.columns.forEach(col => {
      const sortable = col.sortable !== false;
      const isSorted = this.options.sortBy === col.key;
      const sortIcon = isSorted 
        ? (this.options.sortOrder === 'asc' ? '↑' : '↓')
        : '';
      
      html += `
        <th class="${sortable ? 'sortable' : ''} ${isSorted ? 'sorted' : ''}" 
            data-key="${col.key}">
          ${col.label} ${sortIcon}
        </th>
      `;
    });
    
    // Колонка для действий
    if (this.options.actions.length > 0) {
      html += '<th class="datatable-actions-col">Действия</th>';
    }
    
    html += '</tr></thead>';
    return html;
  }
  
  /**
   * Тело таблицы
   */
  renderBody() {
    let html = '<tbody>';
    
    this.options.data.forEach((row, index) => {
      html += '<tr>';
      
      this.options.columns.forEach(col => {
        const value = row[col.key];
        const displayValue = col.render 
          ? col.render(value, row, index)
          : Utils.escapeHtml(value || '');
        
        html += `<td>${displayValue}</td>`;
      });
      
      // Действия
      if (this.options.actions.length > 0) {
        html += `<td class="datatable-actions">${this.renderActions(row, index)}</td>`;
      }
      
      html += '</tr>';
    });
    
    html += '</tbody>';
    return html;
  }
  
  /**
   * Кнопки действий для строки
   */
  renderActions(row, index) {
    return this.options.actions.map(action => {
      // Проверка видимости кнопки
      if (action.visible && !action.visible(row)) {
        return '';
      }
      
      const className = action.class || 'btn-sm btn-secondary';
      const icon = action.icon ? `<i class="${action.icon}"></i>` : '';
      const text = action.text || '';
      
      return `
        <button class="btn ${className}" 
                data-action="${action.name}" 
                data-index="${index}">
          ${icon} ${text}
        </button>
      `;
    }).join(' ');
  }
  
  /**
   * Пагинация
   */
  renderPagination() {
    const totalPages = Math.ceil(this.options.totalItems / this.options.pageSize);
    
    if (totalPages <= 1) return '';
    
    let html = '<div class="datatable-pagination">';
    
    // Информация о записях
    const start = (this.options.currentPage - 1) * this.options.pageSize + 1;
    const end = Math.min(start + this.options.pageSize - 1, this.options.totalItems);
    
    html += `<div class="pagination-info">
               Показано ${start}-${end} из ${this.options.totalItems}
             </div>`;
    
    // Кнопки пагинации
    html += '<div class="pagination-buttons">';
    
    // Первая страница
    html += `<button class="btn btn-sm ${this.options.currentPage === 1 ? 'disabled' : ''}" 
                     data-page="1" ${this.options.currentPage === 1 ? 'disabled' : ''}>
              <i class="fas fa-angle-double-left"></i>
             </button>`;
    
    // Предыдущая
    html += `<button class="btn btn-sm ${this.options.currentPage === 1 ? 'disabled' : ''}" 
                     data-page="${this.options.currentPage - 1}" 
                     ${this.options.currentPage === 1 ? 'disabled' : ''}>
              <i class="fas fa-angle-left"></i>
             </button>`;
    
    // Номера страниц
    const pages = this.getPageNumbers(this.options.currentPage, totalPages);
    pages.forEach(page => {
      if (page === '...') {
        html += '<span class="pagination-ellipsis">...</span>';
      } else {
        html += `<button class="btn btn-sm ${page === this.options.currentPage ? 'active' : ''}" 
                         data-page="${page}">
                  ${page}
                 </button>`;
      }
    });
    
    // Следующая
    html += `<button class="btn btn-sm ${this.options.currentPage === totalPages ? 'disabled' : ''}" 
                     data-page="${this.options.currentPage + 1}" 
                     ${this.options.currentPage === totalPages ? 'disabled' : ''}>
              <i class="fas fa-angle-right"></i>
             </button>`;
    
    // Последняя
    html += `<button class="btn btn-sm ${this.options.currentPage === totalPages ? 'disabled' : ''}" 
                     data-page="${totalPages}" 
                     ${this.options.currentPage === totalPages ? 'disabled' : ''}>
              <i class="fas fa-angle-double-right"></i>
             </button>`;
    
    html += '</div></div>';
    
    return html;
  }
  
  /**
   * Получить номера страниц для отображения
   */
  getPageNumbers(current, total) {
    const delta = 2; // Показывать по 2 страницы по бокам
    const pages = [];
    
    for (let i = 1; i <= total; i++) {
      if (
        i === 1 || 
        i === total || 
        (i >= current - delta && i <= current + delta)
      ) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    
    return pages;
  }
  
  /**
   * Привязка событий
   */
  attachEvents() {
    // Поиск
    const searchInput = this.container.querySelector(`#${this.container.id}-search`);
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        this.handleSearch(e.target.value);
      }, CONFIG.DEBOUNCE_DELAY));
    }
    
    // Сортировка
    this.container.addEventListener('click', (e) => {
      const th = e.target.closest('th.sortable');
      if (th) {
        this.handleSort(th.dataset.key);
      }
    });
    
    // Пагинация
    this.container.addEventListener('click', (e) => {
      const pageBtn = e.target.closest('[data-page]');
      if (pageBtn && !pageBtn.disabled) {
        this.handlePageChange(parseInt(pageBtn.dataset.page));
      }
    });
    
    // Действия
    this.container.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        const actionName = actionBtn.dataset.action;
        const index = parseInt(actionBtn.dataset.index);
        const row = this.options.data[index];
        
        const action = this.options.actions.find(a => a.name === actionName);
        if (action && action.onClick) {
          action.onClick(row, index);
        }
      }
    });
    
    // Экспорт
    const exportBtn = this.container.querySelector(`#${this.container.id}-export`);
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportToExcel();
      });
    }
  }
  
  /**
   * Обработка поиска
   */
  handleSearch(query) {
    if (this.options.onSearch) {
      this.options.onSearch(query);
    }
  }
  
  /**
   * Обработка сортировки
   */
  handleSort(key) {
    // Переключаем направление, если уже отсортировано по этому полю
    if (this.options.sortBy === key) {
      this.options.sortOrder = this.options.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.options.sortBy = key;
      this.options.sortOrder = 'asc';
    }
    
    if (this.options.onSort) {
      this.options.onSort(this.options.sortBy, this.options.sortOrder);
    } else {
      // Локальная сортировка
      this.sortLocally();
      this.render();
    }
  }
  
  /**
   * Локальная сортировка
   */
  sortLocally() {
    const key = this.options.sortBy;
    const order = this.options.sortOrder;
    
    this.options.data.sort((a, b) => {
      let aVal = a[key];
      let bVal = b[key];
      
      // Приводим к числам, если возможно
      if (!isNaN(aVal) && !isNaN(bVal)) {
        aVal = Number(aVal);
        bVal = Number(bVal);
      }
      
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }
  
  /**
   * Смена страницы
   */
  handlePageChange(page) {
    this.options.currentPage = page;
    
    if (this.options.onPageChange) {
      this.options.onPageChange(page);
    } else {
      this.render();
    }
  }
  
  /**
   * Обновить данные таблицы
   */
  setData(data, totalItems = null) {
    this.options.data = data;
    this.options.totalItems = totalItems !== null ? totalItems : data.length;
    this.render();
    this.attachEvents();
  }
  
  /**
   * Показать загрузку
   */
  showLoading() {
    this.options.loading = true;
    this.render();
  }
  
  /**
   * Скрыть загрузку
   */
  hideLoading() {
    this.options.loading = false;
  }
  
  /**
   * Экспорт в Excel
   */
  exportToExcel() {
    // Подготовка данных
    const headers = this.options.columns.map(col => col.label);
    const rows = this.options.data.map(row => {
      return this.options.columns.map(col => {
        const value = row[col.key];
        return col.render ? col.render(value, row) : value;
      });
    });
    
    // Создаём CSV
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });
    
    // Скачиваем
    const filename = `${this.options.exportFilename}_${Utils.formatDate(new Date(), 'YYYY-MM-DD')}.csv`;
    Utils.downloadFile(csv, filename, 'text/csv;charset=utf-8;');
    
    Toast.success('Экспорт завершён');
  }
}