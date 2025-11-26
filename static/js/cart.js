/**
 * Módulo de Carrito - Gestión completa del carrito de compras con API
 * Integración con backend para persistencia de datos
 */

const Cart = {
    /**
     * Agregar producto al carrito
     * @param {number} productId - ID del producto
     * @param {number} quantity - Cantidad a agregar
     * @returns {Promise<Object>} Respuesta del servidor
     */
    async addItem(productId, quantity = 1, options = {}) {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            mostrarNotificacion('Debes iniciar sesión para agregar productos al carrito', 'warning');
            return null;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/carrito/items`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    productoId: productId,
                    cantidad: quantity,
                    ...(options.personalizacion ? { personalizacion: options.personalizacion } : {})
                })
            });

            const data = await response.json();

            if (response.ok && data.body) {
                mostrarNotificacion('Producto agregado al carrito', 'success');
                this.updateCartBadge();
                return data.body;
            } else {
                const errorMsg = data.body?.error || data.error || 'Error al agregar al carrito';
                mostrarNotificacion(errorMsg, 'error');
                return null;
            }
        } catch (error) {
            console.error('Error al agregar al carrito:', error);
            mostrarNotificacion('Error de conexión', 'error');
            return null;
        }
    },

    /**
     * Sincroniza items locales con el carrito persistente del servidor.
     * Útil cuando el usuario agrega productos como invitado y luego inicia sesión.
     * @param {Array} localItems - Items guardados en localStorage
     * @returns {Promise<Array>} Lista de items persistidos en el servidor
     */
    async ensureServerCart(localItems = []) {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            return [];
        }

        try {
            let serverItems = await this.getItems();
            if (serverItems && serverItems.length > 0) {
                return serverItems;
            }

            if (!Array.isArray(localItems) || localItems.length === 0) {
                return [];
            }

            for (const item of localItems) {
                const productId = item.product_id ?? item.productId ?? (typeof item.id === 'number' ? item.id : null);
                if (!productId || productId <= 0) {
                    continue;
                }
                const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
                try {
                    await this.addItem(productId, quantity);
                } catch (syncError) {
                    console.warn('No se pudo sincronizar un item local', syncError);
                }
            }

            serverItems = await this.getItems();
            if (serverItems.length > 0) {
                try {
                    localStorage.removeItem('cart');
                } catch (_) {
                    /* noop */
                }
            }
            return serverItems;
        } catch (error) {
            console.error('Error sincronizando carrito con el servidor:', error);
            return [];
        }
    },

    /**
     * Obtener todos los items del carrito
     * @returns {Promise<Array>} Lista de items del carrito
     */
    async getItems() {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            return [];
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/carrito`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                return data.body || [];
            }
            return [];
        } catch (error) {
            console.error('Error al obtener carrito:', error);
            return [];
        }
    },

    /**
     * Actualizar cantidad de un item
     * @param {number} itemId - ID del item en el carrito
     * @param {number} quantity - Nueva cantidad
     * @returns {Promise<Object>} Respuesta del servidor
     */
    async updateItem(itemId, quantity) {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            mostrarNotificacion('Debes iniciar sesión', 'warning');
            return null;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/carrito/items/${itemId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    cantidad: quantity
                })
            });

            const data = await response.json();

            if (response.ok && data.body) {
                mostrarNotificacion('Cantidad actualizada', 'success');
                return data.body;
            } else {
                const errorMsg = data.body?.error || data.error || 'Error al actualizar';
                mostrarNotificacion(errorMsg, 'error');
                return null;
            }
        } catch (error) {
            console.error('Error al actualizar item:', error);
            mostrarNotificacion('Error de conexión', 'error');
            return null;
        }
    },

    /**
     * Eliminar item del carrito
     * @param {number} itemId - ID del item a eliminar
     * @returns {Promise<boolean>} True si se eliminó correctamente
     */
    async removeItem(itemId) {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            mostrarNotificacion('Debes iniciar sesión', 'warning');
            return false;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/carrito/items/${itemId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                mostrarNotificacion('Producto eliminado del carrito', 'success');
                this.updateCartBadge();
                return true;
            } else {
                const data = await response.json();
                mostrarNotificacion(data.error || 'Error al eliminar', 'error');
                return false;
            }
        } catch (error) {
            console.error('Error al eliminar item:', error);
            mostrarNotificacion('Error de conexión', 'error');
            return false;
        }
    },

    /**
     * Crear pedido a partir del carrito actual
     * @param {string} email - Email del usuario
     * @returns {Promise<Object>} Datos del pedido creado
     */
    async createOrder(orderData) {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            mostrarNotificacion('Debes iniciar sesión', 'warning');
            return null;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/pedidos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(orderData)
            });

            const data = await response.json();

            if (response.ok && data.body) {
                mostrarNotificacion('Pedido creado exitosamente', 'success');
                this.updateCartBadge();
                return data.body;
            } else {
                const errorMsg = data.body?.error || data.error || 'Error al crear pedido';
                mostrarNotificacion(errorMsg, 'error');
                return null;
            }
        } catch (error) {
            console.error('Error al crear pedido:', error);
            mostrarNotificacion('Error de conexión', 'error');
            return null;
        }
    },

    /**
     * Calcular el total del carrito
     * @param {Array} items - Lista de items del carrito
     * @returns {number} Total calculado
     */
    calculateTotal(items) {
        return items.reduce((total, item) => total + (item.price * item.quantity), 0);
    },

    /**
     * Actualizar el badge del carrito con la cantidad de items
     */
    async updateCartBadge() {
        const items = await this.getItems();
        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
        
        const badge = document.querySelector('.cart-badge');
        if (badge) {
            if (totalItems > 0) {
                badge.textContent = totalItems;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    },

    /**
     * Renderizar items del carrito en la página
     * @param {string} containerId - ID del contenedor donde renderizar
     */
    async renderCartItems(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const items = await this.getItems();

        if (items.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <h4>Tu carrito está vacío</h4>
                    <p class="text-muted">Agrega productos desde el catálogo</p>
                    <a href="/app/catalogo/" class="btn btn-primary mt-3">Ver Catálogo</a>
                </div>
            `;
            return;
        }

        let html = '';
        items.forEach(item => {
            html += `
                <div class="cart-item mb-3 p-3 border rounded" data-item-id="${item.id}">
                    <div class="row align-items-center">
                        <div class="col-md-2">
                            <img src="${item.image}" alt="${item.name}" class="img-fluid rounded">
                        </div>
                        <div class="col-md-4">
                            <h5>${item.name}</h5>
                            <p class="text-muted mb-0">$${item.price.toLocaleString()}</p>
                        </div>
                        <div class="col-md-3">
                            <div class="input-group">
                                <button class="btn btn-outline-secondary btn-decrease" data-item-id="${item.id}">-</button>
                                <input type="number" class="form-control text-center quantity-input" 
                                       value="${item.quantity}" min="1" max="99" 
                                       data-item-id="${item.id}">
                                <button class="btn btn-outline-secondary btn-increase" data-item-id="${item.id}">+</button>
                            </div>
                        </div>
                        <div class="col-md-2 text-end">
                            <strong>$${(item.price * item.quantity).toLocaleString()}</strong>
                        </div>
                        <div class="col-md-1 text-end">
                            <button class="btn btn-danger btn-sm btn-remove" data-item-id="${item.id}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Agregar event listeners
        this.attachCartEventListeners();

        // Actualizar total
        this.updateCartTotal(items);
    },

    /**
     * Adjuntar event listeners a los botones del carrito
     */
    attachCartEventListeners() {
        // Botones de aumentar cantidad
        document.querySelectorAll('.btn-increase').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = parseInt(e.target.dataset.itemId);
                const input = document.querySelector(`.quantity-input[data-item-id="${itemId}"]`);
                const newQuantity = parseInt(input.value) + 1;
                
                const result = await this.updateItem(itemId, newQuantity);
                if (result) {
                    input.value = newQuantity;
                    this.renderCartItems('cart-items-container');
                }
            });
        });

        // Botones de disminuir cantidad
        document.querySelectorAll('.btn-decrease').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = parseInt(e.target.dataset.itemId);
                const input = document.querySelector(`.quantity-input[data-item-id="${itemId}"]`);
                const newQuantity = Math.max(1, parseInt(input.value) - 1);
                
                const result = await this.updateItem(itemId, newQuantity);
                if (result) {
                    input.value = newQuantity;
                    this.renderCartItems('cart-items-container');
                }
            });
        });

        // Inputs de cantidad manual
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('change', async (e) => {
                const itemId = parseInt(e.target.dataset.itemId);
                const newQuantity = Math.max(1, parseInt(e.target.value) || 1);
                
                const result = await this.updateItem(itemId, newQuantity);
                if (result) {
                    e.target.value = newQuantity;
                    this.renderCartItems('cart-items-container');
                }
            });
        });

        // Botones de eliminar
        document.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = parseInt(e.target.dataset.itemId);
                const success = await this.removeItem(itemId);
                if (success) {
                    this.renderCartItems('cart-items-container');
                }
            });
        });
    },

    /**
     * Actualizar el total del carrito en la página
     * @param {Array} items - Lista de items del carrito
     */
    updateCartTotal(items) {
        const total = this.calculateTotal(items);
        const totalElement = document.getElementById('cart-total');
        if (totalElement) {
            totalElement.textContent = `$${total.toLocaleString()}`;
        }
    }
};

// Inicializar badge del carrito al cargar la página
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Cart.updateCartBadge());
} else {
    Cart.updateCartBadge();
}
