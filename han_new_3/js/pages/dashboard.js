// /js/pages/dashboard.js
// Главная страница (Dashboard)

import { checkAuth } from '../core/auth.js';
import { api } from '../core/api.js';
import { showToast } from '../components/Toast.js';
import { formatMoney, formatDate, formatTime } from '../utils.js';

class Dashboard {
    constructor() {
        this.user = null;
        this.init();
    }

    async init() {
        // Проверка авторизации
        this.user = checkAuth();
        if (!this.user) {
            window.location.href = '../login.html';
            return;
        }

        // Отображаем имя пользователя
        this.renderUserInfo();
        
        // Показываем/скрываем элементы по ролям
        this.applyRoleVisibility();
        
        // Запускаем часы
        this.startClock();
        
        // Загружаем данные
        await this.loadDashboard();
    }

    renderUserInfo() {
        const userNameEl = document.getElementById('userName');
        const userNameTitleEl = document.getElementById('userNameTitle');
        
        if (userNameEl) userNameEl.textContent = this.user.name;
        if (userNameTitleEl) userNameTitleEl.textContent = this.user.name;
    }

    applyRoleVisibility() {
        const role = this.user.role;
        
        document.querySelectorAll('[data-role]').forEach(el => {
            const allowedRoles = el.getAttribute('data-role').split(',');
            if (!allowedRoles.includes(role)) {
                el.style.display = 'none';
            }
        });
    }

    startClock() {
        const updateClock = () => {
            const now = new Date();
            
            const dateEl = document.getElementById('currentDate');
            const timeEl = document.getElementById('currentTime');
            
            if (dateEl) {
                dateEl.textContent = formatDate(now.toISOString());
            }
            
            if (timeEl) {
                timeEl.textContent = formatTime(now.toISOString());
            }
        };
        
        updateClock();
        setInterval(updateClock, 1000);
    }

    async loadDashboard() {
        try {
            // Загружаем все данные параллельно
            const [
                summaryData,
                recentSalesData,
                debtorsData,
                stockData
            ] = await Promise.all([
                this.loadSummary(),
                this.loadRecentSales(),
                this.loadDebtors(),
                this.loadLowStock()
            ]);

            // Рендерим всё
            this.renderSummary(summaryData);
            this.renderRecentSales(recentSalesData);
            this.renderDebtors(debtorsData);
            this.renderLowStock(stockData);

        } catch (error) {
            console.error('Dashboard load error:', error);
            showToast('Ошибка загрузки данных', 'error');
        }
    }

    async loadSummary() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const response = await api.get('/reports.php', {
                action: 'summary',
                date_from: today,
                date_to: today
            });
            return response.data;
        } catch (error) {
            console.error('Summary error:', error);
            return null;
        }
    }

    async loadRecentSales() {
        try {
            const response = await api.get('/sales.php', {
                action: 'index',
                page: 1,
                page_size: 5
            });
            return response.data;
        } catch (error) {
            console.error('Recent sales error:', error);
            return null;
        }
    }

    async loadDebtors() {
        try {
            const response = await api.get('/clients.php', {
                action: 'debtors'
            });
            
            // Берём топ-5 должников
            const debtors = response.data || [];
            return debtors.slice(0, 5);
        } catch (error) {
            console.error('Debtors error:', error);
            return [];
        }
    }

    async loadLowStock() {
        try {
            const response = await api.get('/stock.php', {
                action: 'low-stock',
                threshold: 10
            });
            
            // Берём топ-5 товаров
            const products = response.data || [];
            return products.slice(0, 5);
        } catch (error) {
            console.error('Low stock error:', error);
            return [];
        }
    }

    renderSummary(data) {
        if (!data) return;

        // Продажи сегодня
        const todaySales = data.sales?.today_total || 0;
        const todaySalesCount = data.sales?.today_count || 0;
        
        document.getElementById('statTodaySales').textContent = formatMoney(todaySales);
        document.getElementById('statTodaySalesCount').textContent = `${todaySalesCount} чеков`;

        // Платежи сегодня
        const todayPayments = data.payments?.today_total || 0;
        const todayPaymentsCount = data.payments?.today_count || 0;
        
        document.getElementById('statTodayPayments').textContent = formatMoney(todayPayments);
        document.getElementById('statTodayPaymentsCount').textContent = `${todayPaymentsCount} платежей`;

        // Склад
        const stockTotal = data.stock?.total_products || 0;
        const stockLow = data.stock?.low_stock_count || 0;
        
        document.getElementById('statStockTotal').textContent = stockTotal;
        document.getElementById('statStockLow').textContent = `${stockLow} требуют внимания`;

        // Долги
        const debtTotal = data.debtors?.total_debt || 0;
        const debtCount = data.debtors?.debtors_count || 0;
        
        document.getElementById('statDebtTotal').textContent = formatMoney(debtTotal);
        document.getElementById('statDebtCount').textContent = `${debtCount} должников`;
    }

    renderRecentSales(data) {
        const container = document.getElementById('recentSales');
        
        if (!data || !data.items || data.items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📦</div>
                    <div class="empty-state-text">Продаж сегодня нет</div>
                    <div class="empty-state-hint">Создайте первую продажу</div>
                </div>
            `;
            return;
        }

        const html = data.items.map(sale => {
            const isPaid = parseFloat(sale.debt) === 0;
            const statusClass = isPaid ? 'paid' : 'debt';
            const statusText = isPaid ? 'Оплачено' : `Долг: ${formatMoney(sale.debt)}`;

            return `
                <div class="sale-item">
                    <div class="sale-info">
                        <div class="sale-receipt">Чек №${sale.receipt_number}</div>
                        <div class="sale-client">${sale.client_name}</div>
                        <div class="sale-time">${formatTime(sale.created_at)}</div>
                    </div>
                    <div class="sale-amount">
                        <div class="sale-total">${formatMoney(sale.total)}</div>
                        <span class="sale-status ${statusClass}">${statusText}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    renderDebtors(debtors) {
        const container = document.getElementById('topDebtors');
        
        if (!debtors || debtors.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <div class="empty-state-text">Должников нет</div>
                    <div class="empty-state-hint">Все клиенты оплатили счета</div>
                </div>
            `;
            return;
        }

        const html = debtors.map(debtor => {
            return `
                <div class="debtor-item">
                    <div class="debtor-info">
                        <div class="debtor-name">${debtor.client_name}</div>
                        <div class="debtor-phone">${debtor.client_phone || '—'}</div>
                        <div class="debtor-sales">${debtor.sales_count} продаж</div>
                    </div>
                    <div class="debtor-debt">${formatMoney(debtor.total_debt)}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    renderLowStock(products) {
        const container = document.getElementById('lowStockProducts');
        
        if (!products || products.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <div class="empty-state-text">Все товары в наличии</div>
                    <div class="empty-state-hint">Товаров с низким остатком нет</div>
                </div>
            `;
            return;
        }

        const html = products.map(product => {
            const qty = parseInt(product.quantity);
            let qtyClass = 'low';
            let qtyLabel = 'Мало!';
            
            if (qty === 0) {
                qtyClass = 'low';
                qtyLabel = 'Нет на складе';
            } else if (qty <= 5) {
                qtyClass = 'low';
                qtyLabel = 'Критически мало';
            } else if (qty <= 10) {
                qtyClass = 'medium';
                qtyLabel = 'Требует внимания';
            }

            return `
                <div class="stock-item">
                    <div class="stock-info">
                        <div class="stock-name">${product.name}</div>
                        <div class="stock-price">${formatMoney(product.price)}</div>
                    </div>
                    <div class="stock-quantity">
                        <div class="quantity-value ${qtyClass}">${qty}</div>
                        <div class="quantity-label">${qtyLabel}</div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});