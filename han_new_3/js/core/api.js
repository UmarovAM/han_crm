// ============================================
// HTTP-КЛИЕНТ ДЛЯ API HAN CRM v3.1
// ============================================

/**
 * Базовый HTTP-клиент для взаимодействия с backend API
 * Автоматически добавляет токен, обрабатывает ошибки
 */
const API = {
  /**
   * Выполнить HTTP-запрос
   * @param {string} endpoint - Путь к эндпоинту (например: 'sales.php?action=index')
   * @param {Object} options - Опции fetch
   * @returns {Promise<Object>} - Ответ от сервера
   */
  async request(endpoint, options = {}) {
    const url = `${CONFIG.API_BASE_URL}/${endpoint}`;
    
    // Настройки по умолчанию
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: CONFIG.API_TIMEOUT
    };
    
    // Добавляем токен авторизации (если есть)
    const token = Storage.getAuthToken();
    if (token) {
      defaultOptions.headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Объединяем опции
    const finalOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...(options.headers || {})
      }
    };
    
    Utils.log('API Request:', options.method || 'GET', url, finalOptions);
    
    try {
      // Создаём контроллер для таймаута
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);
      
      // Выполняем запрос
      const response = await fetch(url, {
        ...finalOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Парсим ответ как JSON
      let data;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // Если не JSON (например, CSV для экспорта)
        data = await response.text();
      }
      
      Utils.log('API Response:', response.status, data);
      
      // Обработка ошибок HTTP
      if (!response.ok) {
        // Если 401 - токен истёк, разлогиниваем
        if (response.status === 401) {
          Utils.log('API: Unauthorized - logging out');
          
          // Импортируем Auth только когда нужно (избегаем circular dependency)
          if (typeof Auth !== 'undefined') {
            Auth.logout();
          }
        }
        
        // Формируем ошибку из ответа сервера
        const errorMessage = data.error?.message || data.message || 'Ошибка сервера';
        throw new APIError(errorMessage, response.status, data);
      }
      
      // Проверяем, что backend вернул success: true
      if (typeof data === 'object' && data.success === false) {
        const errorMessage = data.error?.message || data.message || 'Неизвестная ошибка';
        throw new APIError(errorMessage, response.status, data);
      }
      
      return data;
      
    } catch (error) {
      // Обработка ошибок сети
      if (error.name === 'AbortError') {
        Utils.error('API: Request timeout');
        throw new APIError('Превышено время ожидания ответа от сервера', 0);
      }
      
      if (error instanceof APIError) {
        throw error;
      }
      
      Utils.error('API: Network error', error);
      throw new APIError('Ошибка соединения с сервером', 0, error);
    }
  },
  
  /**
   * GET-запрос
   * @param {string} endpoint
   * @param {Object} params - Query-параметры
   * @returns {Promise<Object>}
   */
  async get(endpoint, params = {}) {
    // Добавляем параметры в URL
    const queryString = new URLSearchParams(params).toString();
    const fullEndpoint = queryString ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}${queryString}` : endpoint;
    
    return this.request(fullEndpoint, {
      method: 'GET'
    });
  },
  
  /**
   * POST-запрос
   * @param {string} endpoint
   * @param {Object} data - Данные для отправки
   * @returns {Promise<Object>}
   */
  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  
  /**
   * PUT-запрос
   * @param {string} endpoint
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },
  
  /**
   * DELETE-запрос
   * @param {string} endpoint
   * @returns {Promise<Object>}
   */
  async delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE'
    });
  },
  
  /**
   * Скачать файл (для экспорта)
   * @param {string} endpoint
   * @param {string} filename - Имя файла для сохранения
   * @returns {Promise<void>}
   */
  async downloadFile(endpoint, filename) {
    const url = `${CONFIG.API_BASE_URL}/${endpoint}`;
    
    const token = Storage.getAuthToken();
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error('Ошибка загрузки файла');
      }
      
      const blob = await response.blob();
      Utils.downloadFile(blob, filename, blob.type);
      
    } catch (error) {
      Utils.error('API: File download error', error);
      throw new APIError('Ошибка скачивания файла', 0, error);
    }
  },
  
  /**
   * Загрузить файл (для будущего использования)
   * @param {string} endpoint
   * @param {File} file
   * @param {Object} additionalData
   * @returns {Promise<Object>}
   */
  async uploadFile(endpoint, file, additionalData = {}) {
    const formData = new FormData();
    formData.append('file', file);
    
    // Добавляем дополнительные данные
    Object.keys(additionalData).forEach(key => {
      formData.append(key, additionalData[key]);
    });
    
    const url = `${CONFIG.API_BASE_URL}/${endpoint}`;
    
    const token = Storage.getAuthToken();
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        const errorMessage = data.error?.message || 'Ошибка загрузки файла';
        throw new APIError(errorMessage, response.status, data);
      }
      
      return data;
      
    } catch (error) {
      Utils.error('API: File upload error', error);
      throw error instanceof APIError ? error : new APIError('Ошибка загрузки файла', 0, error);
    }
  }
};

/**
 * Кастомный класс ошибки для API
 */
class APIError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

// Заморозить объект
Object.freeze(API);