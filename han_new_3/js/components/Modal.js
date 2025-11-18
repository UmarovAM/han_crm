// ============================================
// MODAL - МОДАЛЬНЫЕ ОКНА HAN CRM v3.1
// ============================================

/**
 * Система модальных окон
 * Поддерживает вложенные модалки, кастомные кнопки, формы
 */
const Modal = {
  /**
   * Массив открытых модалок (стек)
   */
  stack: [],
  
  /**
   * Создать модальное окно
   * @param {Object} options - Опции модалки
   * @returns {Object} - API модалки
   */
  create(options = {}) {
    const defaults = {
      title: 'Модальное окно',
      content: '',
      size: 'medium', // small, medium, large, xlarge
      buttons: [
        { text: 'Закрыть', class: 'btn-secondary', onClick: null }
      ],
      closeOnEscape: true,
      closeOnBackdrop: true,
      onOpen: null,
      onClose: null
    };
    
    const config = { ...defaults, ...options };
    
    // Создаём элементы
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    
    const modal = document.createElement('div');
    modal.className = `modal modal-${config.size}`;
    
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">${Utils.escapeHtml(config.title)}</h3>
          <button class="modal-close" type="button">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          ${config.content}
        </div>
        <div class="modal-footer">
          ${this._renderButtons(config.buttons)}
        </div>
      </div>
    `;
    
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    
    // API модалки
    const modalAPI = {
      element: modal,
      backdrop: backdrop,
      config: config,
      
      /**
       * Открыть модалку
       */
      open() {
        // Добавляем в стек
        Modal.stack.push(this);
        
        // Блокируем скролл body
        document.body.style.overflow = 'hidden';
        
        // Анимация появления
        setTimeout(() => {
          backdrop.classList.add('modal-show');
        }, 10);
        
        // Callback
        if (config.onOpen) {
          config.onOpen(this);
        }
        
        Utils.log('Modal: Opened', config.title);
        
        return this;
      },
      
      /**
       * Закрыть модалку
       */
      close() {
        // Убираем из стека
        const index = Modal.stack.indexOf(this);
        if (index > -1) {
          Modal.stack.splice(index, 1);
        }
        
        // Если это последняя модалка - разблокируем скролл
        if (Modal.stack.length === 0) {
          document.body.style.overflow = '';
        }
        
        // Анимация скрытия
        backdrop.classList.remove('modal-show');
        
        // Удаляем из DOM
        setTimeout(() => {
          if (backdrop.parentElement) {
            backdrop.parentElement.removeChild(backdrop);
          }
        }, CONFIG.MODAL_ANIMATION_DURATION);
        
        // Callback
        if (config.onClose) {
          config.onClose(this);
        }
        
        Utils.log('Modal: Closed', config.title);
        
        return this;
      },
      
      /**
       * Обновить заголовок
       * @param {string} title
       */
      setTitle(title) {
        const titleElement = modal.querySelector('.modal-title');
        if (titleElement) {
          titleElement.textContent = title;
        }
        return this;
      },
      
      /**
       * Обновить содержимое
       * @param {string} content
       */
      setContent(content) {
        const bodyElement = modal.querySelector('.modal-body');
        if (bodyElement) {
          bodyElement.innerHTML = content;
        }
        return this;
      },
      
      /**
       * Получить элемент из тела модалки
       * @param {string} selector
       * @returns {HTMLElement}
       */
      find(selector) {
        return modal.querySelector(selector);
      },
      
      /**
       * Показать лоадер в модалке
       */
      showLoader() {
        LocalLoader.show(modal.querySelector('.modal-body'));
        return this;
      },
      
      /**
       * Скрыть лоадер
       */
      hideLoader() {
        LocalLoader.hide(modal.querySelector('.modal-body'));
        return this;
      }
    };
    
    // Обработчики событий
    
    // Кнопка закрытия
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => modalAPI.close());
    
    // Клик по backdrop
    if (config.closeOnBackdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          modalAPI.close();
        }
      });
    }
    
    // Escape
    if (config.closeOnEscape) {
      const escapeHandler = (e) => {
        if (e.key === 'Escape' && Modal.stack[Modal.stack.length - 1] === modalAPI) {
          modalAPI.close();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    }
    
    // Обработчики кнопок
    config.buttons.forEach((btn, index) => {
      const btnElement = modal.querySelector(`[data-modal-btn="${index}"]`);
      if (btnElement && btn.onClick) {
        btnElement.addEventListener('click', () => {
          btn.onClick(modalAPI);
        });
      }
    });
    
    return modalAPI;
  },
  
  /**
   * Рендер кнопок
   * @private
   */
  _renderButtons(buttons) {
    return buttons.map((btn, index) => {
      const btnClass = btn.class || 'btn-secondary';
      const btnText = Utils.escapeHtml(btn.text);
      return `<button class="btn ${btnClass}" data-modal-btn="${index}" type="button">${btnText}</button>`;
    }).join('');
  },
  
  /**
   * Быстрое подтверждение
   * @param {string} message - Текст вопроса
   * @param {Object} options - Дополнительные опции
   * @returns {Promise<boolean>}
   */
  confirm(message, options = {}) {
    return new Promise((resolve) => {
      const modal = this.create({
        title: options.title || 'Подтверждение',
        content: `<p>${Utils.escapeHtml(message)}</p>`,
        size: options.size || 'small',
        buttons: [
          {
            text: options.cancelText || 'Отмена',
            class: 'btn-secondary',
            onClick: (m) => {
              m.close();
              resolve(false);
            }
          },
          {
            text: options.confirmText || 'Подтвердить',
            class: options.confirmClass || 'btn-primary',
            onClick: (m) => {
              m.close();
              resolve(true);
            }
          }
        ]
      });
      
      modal.open();
    });
  },
  
  /**
   * Быстрый alert
   * @param {string} message
   * @param {Object} options
   * @returns {Promise<void>}
   */
  alert(message, options = {}) {
    return new Promise((resolve) => {
      const modal = this.create({
        title: options.title || 'Внимание',
        content: `<p>${Utils.escapeHtml(message)}</p>`,
        size: options.size || 'small',
        buttons: [
          {
            text: options.okText || 'ОК',
            class: 'btn-primary',
            onClick: (m) => {
              m.close();
              resolve();
            }
          }
        ]
      });
      
      modal.open();
    });
  },
  
  /**
   * Модалка с формой
   * @param {Object} options
   * @returns {Promise<Object>} - Данные формы или null если отменено
   */
  form(options = {}) {
    return new Promise((resolve) => {
      // Генерируем HTML формы
      const formHTML = `
        <form id="modal-form" class="modal-form">
          ${options.fields.map(field => this._renderField(field)).join('')}
        </form>
      `;
      
      const modal = this.create({
        title: options.title || 'Форма',
        content: formHTML,
        size: options.size || 'medium',
        buttons: [
          {
            text: 'Отмена',
            class: 'btn-secondary',
            onClick: (m) => {
              m.close();
              resolve(null);
            }
          },
          {
            text: options.submitText || 'Сохранить',
            class: 'btn-primary',
            onClick: (m) => {
              const form = m.find('#modal-form');
              if (form.checkValidity()) {
                const data = this._getFormData(form);
                m.close();
                resolve(data);
              } else {
                form.reportValidity();
              }
            }
          }
        ],
        onOpen: (m) => {
          // Автофокус на первое поле
          const firstInput = m.find('input, select, textarea');
          if (firstInput) {
            firstInput.focus();
          }
        }
      });
      
      modal.open();
    });
  },
  
  /**
   * Рендер поля формы
   * @private
   */
  _renderField(field) {
    const id = `field-${Utils.generateId()}`;
    const required = field.required ? 'required' : '';
    const value = field.value || '';
    
    let input = '';
    
    switch (field.type) {
      case 'text':
      case 'email':
      case 'tel':
      case 'number':
      case 'date':
        input = `<input type="${field.type}" id="${id}" name="${field.name}" 
                  value="${Utils.escapeHtml(value)}" ${required} 
                  class="form-control" ${field.placeholder ? `placeholder="${Utils.escapeHtml(field.placeholder)}"` : ''}>`;
        break;
        
      case 'textarea':
        input = `<textarea id="${id}" name="${field.name}" ${required} 
                  class="form-control" rows="${field.rows || 3}" 
                  ${field.placeholder ? `placeholder="${Utils.escapeHtml(field.placeholder)}"` : ''}>${Utils.escapeHtml(value)}</textarea>`;
        break;
        
      case 'select':
        input = `<select id="${id}" name="${field.name}" ${required} class="form-control">
                  ${field.options.map(opt => 
                    `<option value="${Utils.escapeHtml(opt.value)}" ${opt.value === value ? 'selected' : ''}>
                      ${Utils.escapeHtml(opt.label)}
                    </option>`
                  ).join('')}
                </select>`;
        break;
    }
    
    return `
      <div class="form-group">
        <label for="${id}">${Utils.escapeHtml(field.label)}${field.required ? ' <span class="text-danger">*</span>' : ''}</label>
        ${input}
      </div>
    `;
  },
  
  /**
   * Получить данные формы
   * @private
   */
  _getFormData(form) {
    const formData = new FormData(form);
    const data = {};
    
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
    
    return data;
  },
  
  /**
   * Закрыть все модалки
   */
  closeAll() {
    [...this.stack].forEach(modal => modal.close());
  }
};

// Заморозить объект
Object.freeze(Modal);