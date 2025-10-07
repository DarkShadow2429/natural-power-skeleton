const products = [
    { id: 1, name: 'Verde Detox', price: 3990, image: 'imagenes/jugo_verde.png', description: 'Una mezcla purificante de espinaca, manzana verde, pepino y un toque de limón. Ideal para empezar tu día.', stock: 10, category: 'detox' },
    { id: 2, name: 'Naranja Boost', price: 3990, image: 'imagenes/jugo_naranja.png', description: 'Un shot de energía y vitamina C con naranja, zanahoria, jengibre y cúrcuma. Tu mejor aliado contra el cansancio.', stock: 5, category: 'energia' },
    { id: 3, name: 'Rojo Pasión', price: 4290, image: 'imagenes/jugo_rojo.png', description: 'Poder antioxidante con betarraga, frutillas frescas, manzana roja y un toque de menta.', stock: 0, category: 'antioxidante' },
    { id: 4, name: 'Amanecer Tropical', price: 4500, image: 'imagenes/jugo_tropical.png', description: 'Viaja al trópico con esta mezcla de mango, piña, maracuyá y un toque de naranja. Pura dulzura natural.', stock: 15, category: 'energia' },
];

const orderHistory = [
    { id: 'NP-1024', date: '2025-09-15', total: 8580, status: 'Entregado', items: [{name: 'Rojo Pasión', quantity: 2, price: 4290}] },
    { id: 'NP-1025', date: '2025-09-28', total: 7980, status: 'Entregado', items: [{name: 'Verde Detox', quantity: 1, price: 3990}, {name: 'Naranja Boost', quantity: 1, price: 3990}] },
    { id: 'NP-1026', date: '2025-10-04', total: 12870, status: 'En camino', items: [{name: 'Rojo Pasión', quantity: 3, price: 4290}] },
    { id: 'NP-1027', date: '2025-10-05', total: 3990, status: 'Recibido', items: [{name: 'Verde Detox', quantity: 1, price: 3990}] } // <-- PEDIDO NUEVO PARA PROBAR
];

document.addEventListener('DOMContentLoaded', () => {
    updateCartCounter();
    updateUserUI();

    const currentPage = window.location.pathname.split("/").pop();

    if (currentPage === 'catalogo.html') {
        const params = new URLSearchParams(window.location.search);
        const searchTerm = params.get('search');

        if (searchTerm) {
            // Si hay un término de búsqueda en la URL, lo filtramos
            document.getElementById('search-input').value = searchTerm;
            searchProducts();
        } else {
            // Si no, mostramos todos los productos
            displayProducts(products);
        }
    } else if (currentPage === 'index.html' || currentPage === '') {
        displayProducts(products);
    }
    
    if (currentPage === 'carrito.html') {
        displayCartItems();
    }
    if (currentPage === 'producto.html') {
        displayProductDetails();
    }
    if (currentPage === 'checkout.html') {
        displayCheckoutSummary();
    }
    if (currentPage === 'cuenta.html') {
        displayOrderHistory();
        displayUserProfile();
        displayUserPoints();
    }
    if (currentPage === 'crea-tu-jugo.html') {
        initializeJuiceBuilder();
    }
});

function login(event) {
    event.preventDefault();
    const user = { name: 'Benja Mallea', email: 'benja.mallea@email.com', address: 'Av. Siempreviva 742', city: 'Santiago' };
    localStorage.setItem('currentUser', JSON.stringify(user));
    const modalElement = document.getElementById('loginModal');
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    modalInstance.hide();
    updateUserUI();
}

function logout() { localStorage.removeItem('currentUser'); window.location.href = 'index.html'; }

function updateUserUI() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    const guestActions = document.getElementById('guest-actions');
    const userActions = document.getElementById('user-actions');
    if(guestActions && userActions){
        if (user) {
            guestActions.style.display = 'none';
            userActions.style.display = 'flex';
            document.getElementById('user-dropdown-name').textContent = user.name;
        } else {
            guestActions.style.display = 'flex';
            userActions.style.display = 'none';
        }
    }
}

function getCart() { return JSON.parse(localStorage.getItem('cart')) || []; }
function saveCart(cart) { localStorage.setItem('cart', JSON.stringify(cart)); updateCartCounter(); }

function addToCart(productId, quantity = 1) {
    const cart = getCart();
    const product = products.find(p => p.id === productId);
    if (product.stock === 0) {
        showToast('Este producto está agotado.', 'error');
        return;
    }
    const existingProductIndex = cart.findIndex(item => item.id === productId);
    if (existingProductIndex > -1) {
        cart[existingProductIndex].quantity += quantity;
    } else {
        cart.push({ ...product, quantity: quantity });
    }
    saveCart(cart);
    showToast('¡Producto añadido al carrito!');
}

function updateCartCounter() {
    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const counter = document.getElementById('cart-counter');
    if (counter) {
        counter.textContent = totalItems;
        counter.style.display = totalItems > 0 ? 'inline-block' : 'none';
    }
}

function displayProducts(productsToDisplay) {
    const productList = document.getElementById('product-list');
    if (!productList) return;
    productList.innerHTML = '';
    productsToDisplay.forEach(product => {
        const isOutOfStock = product.stock === 0;
        productList.innerHTML += `<div class="col-lg-4 col-md-6 mb-4"><div class="card h-100 card-product"><a href="producto.html?id=${product.id}" class="text-decoration-none text-dark">${isOutOfStock ? `<div class="out-of-stock-overlay"><span class="badge bg-danger fs-5">Agotado</span></div>` : ''}<img src="${product.image}" class="card-img-top" alt="${product.name}"><div class="card-body text-center"><h5 class="card-title">${product.name}</h5><p class="fs-4 fw-bold text-success mb-1">$${product.price.toLocaleString('es-CL')}</p></div></a></div></div>`;
    });
}

function displayProductDetails() {
    const params = new URLSearchParams(window.location.search);
    const productId = parseInt(params.get('id'));
    const product = products.find(p => p.id === productId);
    if (!product) {
        document.getElementById('product-detail-container').innerHTML = `<p class="text-center">Producto no encontrado.</p>`;
        return;
    }
    const isOutOfStock = product.stock === 0;
    document.getElementById('product-image').src = product.image;
    document.getElementById('product-name').textContent = product.name;
    document.getElementById('product-price').textContent = `$${product.price.toLocaleString('es-CL')}`;
    document.getElementById('product-description').textContent = product.description;
    document.getElementById('product-stock').innerHTML = isOutOfStock ? `<span class="badge bg-danger">Agotado</span>` : `<span class="badge bg-success">En Stock (${product.stock} unidades)</span>`;
    const addButton = document.getElementById('add-to-cart-btn');
    if (isOutOfStock) {
        addButton.disabled = true;
        addButton.textContent = 'Producto Agotado';
    } else {
        addButton.onclick = () => {
            const quantity = parseInt(document.getElementById('quantity-input').value);
            addToCart(product.id, quantity);
        };
    }
}

function displayCartItems() {
    const cart = getCart();
    const cartItemsContainer = document.getElementById('cart-items');
    const cartSummaryContainer = document.getElementById('cart-summary');
    if (!cartItemsContainer) return;
    cartItemsContainer.innerHTML = '';
    let subtotal = 0;
    
    // Leemos el descuento que podríamos haber guardado
    const discount = JSON.parse(localStorage.getItem('discount')) || { code: '', amount: 0 };

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<tr><td colspan="6" class="text-center py-5"><h3>Tu carrito está vacío</h3><a href="catalogo.html" class="btn btn-primary mt-2">Explorar Jugos</a></td></tr>';
        cartSummaryContainer.style.display = 'none';
        return;
    }
    
    cartSummaryContainer.style.display = 'block';
    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        cartItemsContainer.innerHTML += `<tr><td><img src="${item.image}" alt="${item.name}" style="width: 80px;"></td><td class="align-middle"><strong>${item.name}</strong><br><small class="text-muted">${item.description || ''}</small></td><td class="align-middle">$${item.price.toLocaleString('es-CL')}</td><td class="align-middle"><input type="number" class="form-control" value="${item.quantity}" min="1" onchange="updateQuantity('${item.id}', this.value)" style="width: 70px;"></td><td class="align-middle">$${itemTotal.toLocaleString('es-CL')}</td><td class="align-middle"><button class="btn btn-danger btn-sm" onclick="removeFromCart('${item.id}')"><i class="bi bi-trash-fill"></i></button></td></tr>`;
    });

    const total = subtotal - discount.amount;

    document.getElementById('subtotal').textContent = `$${subtotal.toLocaleString('es-CL')}`;
    document.getElementById('discount-amount').textContent = `-$${discount.amount.toLocaleString('es-CL')}`;
    document.getElementById('total').textContent = `$${total.toLocaleString('es-CL')}`;

    // Si hay un descuento aplicado, lo mostramos
    if (discount.amount > 0) {
        document.getElementById('discount-row').style.display = 'flex';
        document.getElementById('coupon-code-applied').textContent = `Cupón "${discount.code}" aplicado.`;
    }
}

function updateQuantity(productId, newQuantity) {
    let cart = getCart();
    const itemIndex = cart.findIndex(item => item.id == productId);
    if (itemIndex > -1) {
        cart[itemIndex].quantity = parseInt(newQuantity);
        if (cart[itemIndex].quantity < 1) {
            cart.splice(itemIndex, 1);
        }
    }
    saveCart(cart);
    displayCartItems();
}

function removeFromCart(productId) {
    let cart = getCart();
    cart = cart.filter(item => item.id != productId);
    saveCart(cart);
    displayCartItems();
}

function displayCheckoutSummary() {
    const cart = getCart();
    const summaryContainer = document.getElementById('checkout-summary-items');
    const totalContainer = document.getElementById('checkout-total');
    let total = 0;
    summaryContainer.innerHTML = '';
    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        summaryContainer.innerHTML += `<li class="list-group-item d-flex justify-content-between lh-sm"><div><h6 class="my-0">${item.name}</h6><small class="text-muted">Cantidad: ${item.quantity}</small></div><span class="text-muted">$${itemTotal.toLocaleString('es-CL')}</span></li>`;
    });
    totalContainer.textContent = `$${total.toLocaleString('es-CL')}`;
}

function completePurchase(event) {
    event.preventDefault();
    showToast('¡Gracias por tu compra! Tu pedido ha sido recibido y está en preparación.');
    localStorage.removeItem('cart');
    window.location.href = 'cuenta.html';
}

function displayOrderHistory() {
    const historyContainer = document.getElementById('order-history');
    if (!historyContainer) return;
    historyContainer.innerHTML = '';
    if (orderHistory.length === 0) {
        historyContainer.innerHTML = '<p>Aún no tienes pedidos.</p>';
        return;
    }
    orderHistory.slice().reverse().forEach(order => {
        let statusBadgeClass = 'bg-secondary';
        if (order.status === 'Entregado') statusBadgeClass = 'bg-success';
        if (order.status === 'En camino') statusBadgeClass = 'bg-info';
        if (order.status === 'Recibido') statusBadgeClass = 'bg-primary';
        if (order.status === 'Cancelado') statusBadgeClass = 'bg-danger';

        // Lógica para añadir el botón de cancelar solo si el estado es "Recibido"
        const cancelButtonHTML = order.status === 'Recibido'
            ? `<button class="btn btn-danger btn-sm ms-2" onclick="cancelOrder('${order.id}')">Cancelar Pedido</button>`
            : '';

        historyContainer.innerHTML += `
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between flex-wrap">
                    <div><strong>Pedido:</strong> ${order.id}</div>
                    <div><strong>Fecha:</strong> ${order.date}</div>
                    <div><strong>Total:</strong> $${order.total.toLocaleString('es-CL')}</div>
                </div>
                <div class="card-body">
                    <p class="mb-2">
                        <strong>Estado:</strong> <span class="badge ${statusBadgeClass}">${order.status}</span>
                    </p>
                    <a class="btn btn-outline-secondary btn-sm" data-bs-toggle="collapse" href="#collapse${order.id}">Ver Detalle</a>
                    ${cancelButtonHTML}
                    <div class="collapse mt-3" id="collapse${order.id}">
                        <ul class="list-group">
                            ${order.items.map(item => `<li class="list-group-item d-flex justify-content-between"><span>${item.name} (x${item.quantity})</span> <span>$${(item.price * item.quantity).toLocaleString('es-CL')}</span></li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    });
}

function displayUserProfile() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (user && document.getElementById('profile-name')) {
        document.getElementById('profile-name').value = user.name;
        document.getElementById('profile-email').value = user.email;
        document.getElementById('profile-address').value = user.address || '';
        document.getElementById('profile-city').value = user.city || '';
    }
}

const juiceBuilderData = {
    bases: [
        { name: 'Jugo de Naranja', price: 1500 },
        { name: 'Agua Purificada', price: 1000 },
        { name: 'Leche de Almendras', price: 1800 }
    ],
    ingredients: [
        { name: 'Frutilla', price: 500 },
        { name: 'Plátano', price: 400 },
        { name: 'Mango', price: 700 },
        { name: 'Espinaca', price: 300 },
        { name: 'Piña', price: 600 },
        { name: 'Jengibre', price: 200 },
        { name: 'Chía', price: 250 },
        { name: 'Maracuyá', price: 700 },
        { name: 'Menta', price: 150 },
        { name: 'Pepino', price: 200 },
        { name: 'Manzana Verde', price: 400 },
        { name: 'Zanahoria', price: 300 }
    ],
    maxIngredients: 4
};

function initializeJuiceBuilder() {
    const basesContainer = document.getElementById('bases-container');
    const ingredientsContainer = document.getElementById('ingredients-container');
    
    if (!basesContainer) return;

    juiceBuilderData.bases.forEach((base, index) => {
        basesContainer.innerHTML += `<div class="form-check"><input class="form-check-input" type="radio" name="base" id="base-${index}" value="${base.price}" data-name="${base.name}" required><label class="form-check-label" for="base-${index}">${base.name} <span class="text-muted">(+$${base.price.toLocaleString('es-CL')})</span></label></div>`;
    });

    juiceBuilderData.ingredients.forEach((ingredient, index) => {
        ingredientsContainer.innerHTML += `<div class="col-md-6"><div class="form-check"><input class="form-check-input ingredient-check" type="checkbox" value="${ingredient.price}" data-name="${ingredient.name}" id="ingredient-${index}"><label class="form-check-label" for="ingredient-${index}">${ingredient.name} <span class="text-muted">(+$${ingredient.price.toLocaleString('es-CL')})</span></label></div></div>`;
    });
    
    document.querySelectorAll('#juice-builder-form input').forEach(input => {
        input.addEventListener('change', updateCustomJuicePrice);
    });
}

function updateCustomJuicePrice() {
    let totalPrice = 0;
    const selectedBase = document.querySelector('input[name="base"]:checked');
    const summaryBase = document.getElementById('summary-base');
    if (selectedBase) {
        totalPrice += parseInt(selectedBase.value);
        summaryBase.textContent = selectedBase.dataset.name;
    } else {
        summaryBase.textContent = 'No seleccionada';
    }

    const selectedIngredients = document.querySelectorAll('.ingredient-check:checked');
    const summaryIngredients = document.getElementById('summary-ingredients');
    summaryIngredients.innerHTML = '';
    
    selectedIngredients.forEach(ingredient => {
        totalPrice += parseInt(ingredient.value);
        const li = document.createElement('li');
        li.textContent = ingredient.dataset.name;
        summaryIngredients.appendChild(li);
    });
    
    if (selectedIngredients.length === 0) {
        summaryIngredients.innerHTML = '<li>Ninguno seleccionado</li>';
    }

    const allIngredients = document.querySelectorAll('.ingredient-check');
    if (selectedIngredients.length >= juiceBuilderData.maxIngredients) {
        allIngredients.forEach(checkbox => {
            if (!checkbox.checked) {
                checkbox.disabled = true;
            }
        });
    } else {
        allIngredients.forEach(checkbox => {
            checkbox.disabled = false;
        });
    }

    document.getElementById('total-price').textContent = `$${totalPrice.toLocaleString('es-CL')}`;
}

function addCustomJuiceToCart(event) {
    event.preventDefault();
    const selectedBase = document.querySelector('input[name="base"]:checked');
    if (!selectedBase) {
        showToast('Por favor, elige una base.', 'error');
        return;
    }
    
    const selectedIngredients = document.querySelectorAll('.ingredient-check:checked');
    let totalPrice = parseInt(selectedBase.value);
    let ingredientNames = [];

    selectedIngredients.forEach(ingredient => {
        totalPrice += parseInt(ingredient.value);
        ingredientNames.push(ingredient.dataset.name);
    });

    const customJuice = {
        id: `custom-${Date.now()}`,
        name: 'Jugo Personalizado',
        price: totalPrice,
        image: 'imagenes/jugo_tropical.png',
        description: `${selectedBase.dataset.name} con ${ingredientNames.join(', ')}`,
        quantity: 1
    };
    
    const cart = getCart();
    cart.push(customJuice);
    saveCart(cart);
    
    showToast('Jugo personalizado añadido al carrito');
    window.location.href = 'carrito.html';
}

function filterProducts(event, category) {
    event.preventDefault();

    let filteredProducts;
    if (category === 'all') {
        filteredProducts = products;
    } else {
        filteredProducts = products.filter(product => product.category === category);
    }

    displayProducts(filteredProducts);

    const filterLinks = document.querySelectorAll('#filters-container a');
    filterLinks.forEach(link => {
        link.classList.remove('active');
    });
    event.target.classList.add('active');
}

function openRecoverModal(event) {
    event.preventDefault();
    const loginModalEl = document.getElementById('loginModal');
    const loginModalInstance = bootstrap.Modal.getInstance(loginModalEl);
    loginModalInstance.hide();
    const recoverModal = new bootstrap.Modal(document.getElementById('recoverModal'));
    recoverModal.show();
}

function handlePasswordRecovery(event) {
    event.preventDefault();
    document.getElementById('recover-step-1').style.display = 'none';
    document.getElementById('recover-step-2').style.display = 'block';
}

function displayUserPoints() {
    const pointsContainer = document.getElementById('user-points');
    if (!pointsContainer) return;

    const totalSpent = orderHistory.reduce((sum, order) => sum + order.total, 0);
    const totalPoints = Math.floor(totalSpent / 100);

    pointsContainer.textContent = totalPoints;
}
// (US-09) ---
function cancelOrder(orderId) {
    if (confirm('¿Estás seguro de que quieres cancelar este pedido? Esta acción no se puede deshacer.')) {
        const orderIndex = orderHistory.findIndex(order => order.id === orderId);
        if (orderIndex > -1) {
            // Cambiamos el estado del pedido a "Cancelado"
            orderHistory[orderIndex].status = 'Cancelado';
            // Volvemos a dibujar el historial para que se actualice la vista
            displayOrderHistory();
            alert(`El pedido ${orderId} ha sido cancelado.`);
        }
    }
}
    // ---  SIMULAR CUPONES (US-18) ---
function applyCoupon() {
    const couponInput = document.getElementById('coupon-input');
    const couponCode = couponInput.value.trim().toUpperCase();
    
    // Aquí simulamos un cupón válido
    if (couponCode === 'NATURAL10') {
        const cart = getCart();
        let subtotal = 0;
        cart.forEach(item => {
            subtotal += item.price * item.quantity;
        });

        // Calculamos un 10% de descuento
        const discountAmount = Math.round(subtotal * 0.10);

        // Guardamos el descuento en la memoria del navegador
        localStorage.setItem('discount', JSON.stringify({ code: couponCode, amount: discountAmount }));

        // Volvemos a dibujar el carrito para que se vea el descuento
        displayCartItems();

    } else {
        alert('El cupón ingresado no es válido o ha expirado.');
        // Limpiamos cualquier descuento previo si el cupón es inválido
        localStorage.removeItem('discount');
        displayCartItems();
    }
}

    if (couponCode === 'NATURAL10') {
        const cart = getCart();
        let subtotal = 0;
        cart.forEach(item => {
            subtotal += item.price * item.quantity;
        });

        // Calculamos un 10% de descuento
        const discountAmount = Math.round(subtotal * 0.10);
        
        // Guardamos el descuento en la memoria del navegador
        localStorage.setItem('discount', JSON.stringify({ code: couponCode, amount: discountAmount }));
        
        // Volvemos a dibujar el carrito para que se vea el descuento
        displayCartItems();
        
    } else {
        alert('El cupón ingresado no es válido o ha expirado.');
        // Limpiamos cualquier descuento previo si el cupón es inválido
        localStorage.removeItem('discount');
        displayCartItems();
    }
// --- LÓGICA PARA LA BARRA DE BÚSQUEDA ---
function searchProducts() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const currentPage = window.location.pathname.split("/").pop();

    // Si estamos en la página del catálogo, filtramos en vivo
    if (currentPage === 'catalogo.html') {
        const filteredProducts = products.filter(product => 
            product.name.toLowerCase().includes(searchTerm)
        );
        displayProducts(filteredProducts);
    } else {
        // Si estamos en otra página, redirigimos al catálogo con el término de búsqueda
        window.location.href = `catalogo.html?search=${searchTerm}`;
    }
}function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    
    const iconClass = type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill';
    
    toast.innerHTML = `<i class="bi ${iconClass} toast-icon"></i> ${message}`;
    
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        });
    }, 3000);
}