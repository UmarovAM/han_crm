// js/pages/clients.js
// Логика страницы клиентов

import { auth } from '../core/auth.js';
import { clientsService } from '../services/clients.service.js';
import { Toast } from '../components/Toast.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs';

class ClientsPage {
  constructor() {
    // Проверка прав
    if (!auth.can('clients.view')) {
      Toast.error('Нет доступа к клиентам');
      window.location.href = '/';
      return;
    }

    this.clients = [];
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
      await this.loadClients();
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
          this.loadClients();
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
        this.loadClients();
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

    // Скрываем элементы по ролям
    document.querySelectorAll('[data-role]').forEach(el => {
      const allowedRoles = el.dataset.role.split(',');
      if (!allowedRoles.includes(user.role)) {
        el.style.display = 'none';
      }
    });
  }

  // ========== ЗАГРУЗКА КЛИЕНТОВ ==========
  async loadClients() {
    try {
      this.showLoader();

      let result;

      if (this.currentFilter === 'debtors') {
        result = await clientsService.getDebtors();
        result = { items: result, total: result.length };
      } else if (this.currentFilter === 'overpayments') {
        result = await clientsService.getOverpayments();
        result = { items: result, total: result.length };
      } else {
        result = await clientsService.getClients({
          page: this.currentPage,
          page_size: this.pageSize,
          search: this.searchQuery
        });
      }

      this.clients = result.items || [];
      this.totalPages = Math.ceil((result.total || 0) / this.pageSize);

      this.renderClients();
      this.renderPagination();
      this.updateCounts();

    } catch (error) {
      console.error('Load clients error:', error);
      Toast.error('Ошибка загрузки клиентов');
      this.showError();
    }
  }

  // ========== ОТОБРАЖЕНИЕ ==========
  renderClients() {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;

    if (this.clients.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="empty-state">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
              </svg>
              <h3>Клиенты не найдены</h3>
              <p>Попробуйте изменить условия поиска</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.clients.map(client => `
      <tr>
        <td>${client.id}</td>
        <td>
          <strong>${this.escapeHtml(client.name)}</strong>
        </td>
        <td>${client.phone ? this.escapeHtml(client.phone) : '—'}</td>
        <td>${client.address ? this.escapeHtml(client.address) : '—'}</td>
        <td>
          ${this.renderDebt(client)}
        </td>
        <td>
          ${this.renderOverpayment(client)}
        </td>
        <td>${client.total_sales || 0}</td>
        <td>
          <span class="status-badge ${client.is_active ? 'active' : 'inactive'}">
            ${client.is_active ? 'Активен' : 'Неактивен'}
          </span>
        </td>
        <td>
          <div class="action-buttons">
            <button class="btn-icon" onclick="clientsPage.viewDetails(${client.id})" title="Детали">
              👁️
            </button>
            ${auth.can('clients.edit') ? `
              <button class="btn-icon" onclick="clientsPage.openEditModal(${client.id})" title="Редактировать">
                ✏️
              </button>
            ` : ''}
            ${auth.can('overpayments.withdraw') && parseFloat(client.total_overpayment || client.current_overpayment || 0) > 0 ? `
              <button class="btn-icon success" onclick="clientsPage.openWithdrawModal(${client.id})" title="Выдать переплату">
                💰
              </button>
            ` : ''}
            ${auth.can('clients.delete') ? `
              <button class="btn-icon danger" onclick="clientsPage.deleteClient(${client.id})" title="Удалить">
                🗑️
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  renderDebt(client) {
    const debt = parseFloat(client.total_debt || 0);
    if (debt > 0) {
      return `<span class="finance-badge debt">${this.formatMoney(debt)} сом</span>`;
    }
    return `<span class="finance-badge zero">—</span>`;
  }

  renderOverpayment(client) {
    const overpayment = parseFloat(client.total_overpayment || client.current_overpayment || 0);
    if (overpayment > 0) {
      return `<span class="finance-badge overpayment">${this.formatMoney(overpayment)} сом</span>`;
    }
    return `<span class="finance-badge zero">—</span>`;
  }

  renderPagination() {
    const container = document.getElementById('pagination');
    if (!container || this.totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    const pages = [];
    
    // Первая страница
    if (this.currentPage > 2) {
      pages.push(1);
      if (this.currentPage > 3) {
        pages.push('...');
      }
    }

    // Текущая и соседние
    for (let i = Math.max(1, this.currentPage - 1); i <= Math.min(this.totalPages, this.currentPage + 1); i++) {
      pages.push(i);
    }

    // Последняя страница
    if (this.currentPage < this.totalPages - 1) {
      if (this.currentPage < this.totalPages - 2) {
        pages.push('...');
      }
      pages.push(this.totalPages);
    }

    container.innerHTML = `
      <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} 
              onclick="clientsPage.goToPage(${this.currentPage - 1})">
        ← Назад
      </button>
      ${pages.map(page => {
        if (page === '...') {
          return `<span class="pagination-info">...</span>`;
        }
        return `
          <button class="pagination-btn ${page === this.currentPage ? 'active' : ''}" 
                  onclick="clientsPage.goToPage(${page})">
            ${page}
          </button>
        `;
      }).join('')}
      <button class="pagination-btn" ${this.currentPage === this.totalPages ? 'disabled' : ''} 
              onclick="clientsPage.goToPage(${this.currentPage + 1})">
        Вперёд →
      </button>
    `;
  }

  goToPage(page) {
    this.currentPage = page;
    this.loadClients();
  }

  async updateCounts() {
    try {
      // Общее количество
      const allResult = await clientsService.getClients({ page_size: 1 });
      document.getElementById('countAll').textContent = allResult.total || 0;

      // Должники
      const debtors = await clientsService.getDebtors();
      document.getElementById('countDebtors').textContent = debtors.length || 0;

      // Переплаты
      const overpayments = await clientsService.getOverpayments();
      document.getElementById('countOverpayments').textContent = overpayments.length || 0;
    } catch (error) {
      console.error('Update counts error:', error);
    }
  }

  // ========== МОДАЛЬНЫЕ ОКНА ==========
  openCreateModal() {
    document.getElementById('modalTitle').textContent = 'Добавить клиента';
    document.getElementById('clientForm').reset();
    document.getElementById('clientId').value = '';
    document.getElementById('clientIsActive').checked = true;
    document.getElementById('clientModal').classList.add('show');
  }

  async openEditModal(id) {
    try {
      const client = await clientsService.getClient(id);
      
      document.getElementById('modalTitle').textContent = 'Редактировать клиента';
      document.getElementById('clientId').value = client.id;
      document.getElementById('clientName').value = client.name;
      document.getElementById('clientPhone').value = client.phone || '';
      document.getElementById('clientAddress').value = client.address || '';
      document.getElementById('clientIsActive').checked = client.is_active;
      
      document.getElementById('clientModal').classList.add('show');
    } catch (error) {
      console.error('Open edit modal error:', error);
      Toast.error('Ошибка загрузки данных клиента');
    }
  }

  closeModal() {
    document.getElementById('clientModal').classList.remove('show');
  }

  async saveClient() {
    try {
      const id = document.getElementById('clientId').value;
      const data = {
        name: document.getElementById('clientName').value.trim(),
        phone: document.getElementById('clientPhone').value.trim(),
        address: document.getElementById('clientAddress').value.trim(),
        is_active: document.getElementById('clientIsActive').checked ? 1 : 0
      };

      if (!data.name) {
        Toast.error('Укажите название клиента');
        return;
      }

      if (id) {
        await clientsService.updateClient(id, data);
        Toast.success('Клиент обновлён');
      } else {
        await clientsService.createClient(data);
        Toast.success('Клиент создан');
      }

      this.closeModal();
      this.loadClients();
    } catch (error) {
      console.error('Save client error:', error);
      Toast.error(error.message || 'Ошибка сохранения');
    }
  }

  async deleteClient(id) {
    if (!confirm('Удалить клиента? Это действие нельзя отменить.')) {
      return;
    }

    try {
      await clientsService.deleteClient(id);
      Toast.success('Клиент удалён');
      this.loadClients();
    } catch (error) {
      console.error('Delete client error:', error);
      Toast.error(error.message || 'Ошибка удаления');
    }
  }

  // ========== ДЕТАЛИ КЛИЕНТА ==========
  async viewDetails(id) {
    try {
      const client = await clientsService.getClient(id);
      
      document.getElementById('clientDetailsTitle').textContent = client.name;
      document.getElementById('clientDetailsContent').innerHTML = this.renderClientDetails(client);
      document.getElementById('clientDetailsModal').classList.add('show');
    } catch (error) {
      console.error('View details error:', error);
      Toast.error('Ошибка загрузки деталей');
    }
  }

  renderClientDetails(client) {
    return `
      <div class="client-details-grid">
        <div class="detail-section">
          <h4>Основная информация</h4>
          <p><span class="detail-label">ID:</span> <span class="detail-value">${client.id}</span></p>
          <p><span class="detail-label">Название:</span> <span class="detail-value">${this.escapeHtml(client.name)}</span></p>
          <p><span class="detail-label">Телефон:</span> <span class="detail-value">${client.phone || '—'}</span></p>
          <p><span class="detail-label">Адрес:</span> <span class="detail-value">${client.address || '—'}</span></p>
          <p><span class="detail-label">Статус:</span> 
            <span class="status-badge ${client.is_active ? 'active' : 'inactive'}">
              ${client.is_active ? 'Активен' : 'Неактивен'}
            </span>
          </p>
        </div>

        <div class="detail-section">
          <h4>Финансы</h4>
          <p><span class="detail-label">Переплата:</span> 
            <span class="detail-value" style="color: #059669">
              ${this.formatMoney(client.current_overpayment || 0)} сом
            </span>
          </p>
          <p><span class="detail-label">Всего продаж:</span> <span class="detail-value">${client.recent_sales?.length || 0}</span></p>
        </div>
      </div>

      ${client.overpayment_history && client.overpayment_history.length > 0 ? `
        <div class="history-section">
          <h4>История переплат</h4>
          <div class="history-list">
            ${client.overpayment_history.map(h => `
              <div class="history-item">
                <div class="history-item-header">
                  <span class="history-item-type">${this.getOverpaymentTypeText(h.type)}</span>
                  <span class="history-item-date">${this.formatDate(h.created_at)}</span>
                </div>
                <div class="history-item-amount ${parseFloat(h.amount) >= 0 ? 'positive' : 'negative'}">
                  ${parseFloat(h.amount) >= 0 ? '+' : ''}${this.formatMoney(h.amount)} сом
                </div>
                ${h.note ? `<div class="history-item-note">${this.escapeHtml(h.note)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  closeDetailsModal() {
    document.getElementById('clientDetailsModal').classList.remove('show');
  }

  // ========== ВЫДАЧА ПЕРЕПЛАТЫ ==========
  async openWithdrawModal(id) {
    try {
      const client = await clientsService.getClient(id);
      
      document.getElementById('withdrawClientId').value = client.id;
      document.getElementById('withdrawAmount').value = '';
      document.getElementById('withdrawAmount').max = client.current_overpayment;
      document.getElementById('withdrawNote').value = '';
      
      document.getElementById('withdrawClientInfo').innerHTML = `
        <h4>${this.escapeHtml(client.name)}</h4>
        <p class="highlight">Доступная переплата: ${this.formatMoney(client.current_overpayment)} сом</p>
      `;
      
      document.getElementById('withdrawModal').classList.add('show');
    } catch (error) {
      console.error('Open withdraw modal error:', error);
      Toast.error('Ошибка загрузки данных');
    }
  }

  closeWithdrawModal() {
    document.getElementById('withdrawModal').classList.remove('show');
  }

  async confirmWithdraw() {
    try {
      const clientId = document.getElementById('withdrawClientId').value;
      const amount = parseFloat(document.getElementById('withdrawAmount').value);
      const note = document.getElementById('withdrawNote').value.trim();

      if (!amount || amount <= 0) {
        Toast.error('Укажите корректную сумму');
        return;
      }

      if (!confirm(`Выдать ${this.formatMoney(amount)} сом наличными?`)) {
        return;
      }

      await clientsService.withdrawOverpayment(clientId, { amount, note });
      
      Toast.success('Переплата выдана');
      this.closeWithdrawModal();
      this.loadClients();
    } catch (error) {
      console.error('Withdraw error:', error);
      Toast.error(error.message || 'Ошибка выдачи');
    }
  }

  // ========== ЭКСПОРТ ==========
  async exportToExcel() {
    try {
      Toast.info('Экспорт в Excel...');

      // Загружаем все данные без пагинации
      const result = await clientsService.getClients({ page_size: 10000 });
      const clients = result.items || [];

      if (clients.length === 0) {
        Toast.error('Нет данных для экспорта');
        return;
      }

      // Подготовка данных
      const data = clients.map(c => ({
        'ID': c.id,
        'Название': c.name,
        'Телефон': c.phone || '',
        'Адрес': c.address || '',
        'Долг': parseFloat(c.total_debt || 0),
        'Переплата': parseFloat(c.total_overpayment || c.current_overpayment || 0),
        'Всего продаж': c.total_sales || 0,
        'Статус': c.is_active ? 'Активен' : 'Неактивен'
      }));

      // Создание книги Excel
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      // Автоширина колонок
      const colWidths = [
        { wch: 5 },  // ID
        { wch: 30 }, // Название
        { wch: 15 }, // Телефон
        { wch: 30 }, // Адрес
        { wch: 12 }, // Долг
        { wch: 12 }, // Переплата
        { wch: 12 }, // Продажи
        { wch: 10 }  // Статус
      ];
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Клиенты');
      
      // Скачивание
      const filename = `clients_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);

      Toast.success('Экспорт завершён');
    } catch (error) {
      console.error('Export error:', error);
      Toast.error('Ошибка экспорта');
    }
  }

  // ========== ВСПОМОГАТЕЛЬНЫЕ ==========
  showLoader() {
    const tbody = document.getElementById('clientsTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center">
            <div class="loader"></div>
          </td>
        </tr>
      `;
    }
  }

  showError() {
    const tbody = document.getElementById('clientsTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center">
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

  getOverpaymentTypeText(type) {
    const types = {
      'created': '➕ Создана',
      'withdrawn': '💸 Выдана',
      'adjusted': '🔄 Корректировка'
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
let clientsPage;
document.addEventListener('DOMContentLoaded', () => {
  clientsPage = new ClientsPage();
  window.clientsPage = clientsPage;
});

export { clientsPage };