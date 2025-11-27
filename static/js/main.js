// main.js limpio y estable: catálogo, tema y "Crea tu Jugo"

// ===== Fallback inicial de productos (si API no responde) =====
let products = [
  { id: 1, name: 'Verde Detox', price: 3990, image: '/static/imagenes/jugo_verde.png', description: 'Espinaca, manzana verde, pepino y limón.', stock: 10, category: 'detox', vendidos: 120 },
  { id: 2, name: 'Naranja Boost', price: 3990, image: '/static/imagenes/jugo_naranja.png', description: 'Naranja, zanahoria, jengibre y cúrcuma.', stock: 5, category: 'energia', vendidos: 180 },
  { id: 3, name: 'Rojo Pasión', price: 4290, image: '/static/imagenes/jugo_rojo.png', description: 'Betarraga, frutillas, manzana roja y menta.', stock: 0, category: 'antioxidante', vendidos: 95 },
  { id: 4, name: 'Amanecer Tropical', price: 4500, image: '/static/imagenes/jugo_tropical.png', description: 'Mango, piña, maracuyá y naranja.', stock: 15, category: 'energia', vendidos: 140 },
];

// ===== Helpers de storage con fallback =====
function safeStorageSetItem(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {
    try { sessionStorage.setItem(key, value); } catch (_) { /* noop */ }
  }
}
function safeStorageGetItem(key) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch (_) { /* noop */ }
  try { return sessionStorage.getItem(key); } catch (_) { return null; }
}
function safeStorageRemoveItem(key) {
  try { localStorage.removeItem(key); } catch (_) { /* noop */ }
  try { sessionStorage.removeItem(key); } catch (_) { /* noop */ }
}

// ===== Normaliza rutas de imágenes (compat /static) =====
function normalizeImagePath(path) {
  if (!path) return '/static/imagenes/jugo_tropical.png';
  if (path.startsWith('/static/')) return path;
  if (path.startsWith('/imagenes/')) return '/static' + path;
  if (path.startsWith('imagenes/')) return '/static/' + path;
  return '/static/imagenes/' + path;
}

// ===== Carga productos desde API (si disponible) =====
async function fetchProducts() {
  try {
    const body = await apiCall('/api/productos', 'GET');
    if (Array.isArray(body) && body.length) {
      products = body.map(p => ({
        id: p.id ?? p.productoId ?? 0,
        name: p.nombre ?? p.name ?? 'Producto',
        price: Number(p.precio ?? p.price ?? 0),
        image: normalizeImagePath(p.image ?? '/imagenes/jugo_tropical.png'),
        description: p.descripcion ?? p.description ?? '',
        stock: Number(p.stock ?? 0),
        category: (p.tipo ?? p.category ?? '').toString().toLowerCase(),
        vendidos: Number(p.vendidos ?? p.sales ?? 0)
      }));
    }
  } catch (err) {
    console.warn('No se pudo obtener productos del API. Usando fallback.', err.message);
  }
}

// ===== Render catálogo simple =====
function displayProducts(list) {
  const productList = document.getElementById('product-list');
  if (!productList) return;
  productList.innerHTML = '';

  if (!list || !list.length) {
    productList.innerHTML = '<div class="col-12 text-center py-5 text-muted">Sin resultados.</div>';
    return;
  }

  list.forEach(product => {
    const isOut = (product.stock ?? 0) === 0;
    const price = Number(product.price || 0);
    productList.innerHTML += `
      <div class="col-lg-4 col-md-6 mb-4">
        <div class="card h-100 card-product position-relative">
          ${isOut ? '<div class="out-of-stock-overlay"><span class="badge bg-danger fs-5">Agotado</span></div>' : ''}
          <a href="/app/producto/?id=${product.id}" class="text-decoration-none text-dark">
            <img src="${product.image}" class="card-img-top" alt="${product.name}">
          </a>
          <div class="card-body d-flex flex-column text-center">
            <h5 class="card-title mb-2">${product.name}</h5>
            <p class="fs-5 fw-bold text-success mb-3">$${price.toLocaleString('es-CL')}</p>
            <div class="mt-auto d-grid gap-2">
              <a class="btn btn-outline-secondary" href="/app/producto/?id=${product.id}"><i class="bi bi-eye"></i> Ver detalle</a>
              <button class="btn btn-primary" ${isOut ? 'disabled' : ''} onclick="addToCart(${product.id}, 1)"><i class="bi bi-cart-plus"></i> Agregar</button>
            </div>
          </div>
        </div>
      </div>`;
  });
}

// ===== Filtro por categoría (catálogo) =====
function filterProducts(event, category) {
  if (event && event.preventDefault) event.preventDefault();
  const cat = (category || 'all').toString().toLowerCase();
  const filtered = (cat === 'all') ? products : products.filter(p => (p.category || '') === cat);
  displayProducts(filtered);
  try {
    const links = document.querySelectorAll('#filters-container a');
    links.forEach(l => l.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
  } catch (_) { /* noop */ }
}

// ===== Búsqueda (navbar) =====
function searchProducts() {
  const input = document.getElementById('search-input');
  const q = (input?.value || '').trim().toLowerCase();
  const onCatalog = window.location.pathname.includes('/catalogo/');
  if (onCatalog) {
    const result = products.filter(p => p.name.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q));
    displayProducts(result);
  } else {
    window.location.href = `/app/catalogo/?search=${encodeURIComponent(q)}`;
  }
}

// ===== Helpers de ordenamiento/filtrado integrados =====
function getSortOption() {
  const sel = document.getElementById('sort-select');
  return sel ? sel.value : 'vendidos_desc';
}

function getActiveCategory() {
  try {
    const active = document.querySelector('#filters-container .list-group-item.active');
    if (!active) return 'all';
    const t = active.textContent.toLowerCase();
    if (t.includes('detox')) return 'detox';
    if (t.includes('energ')) return 'energia';
    if (t.includes('antioxid')) return 'antioxidante';
    return 'all';
  } catch (_) { return 'all'; }
}

function applyCatalogView() {
  let list = [...products];
  const q = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  const cat = getActiveCategory();
  const sort = getSortOption();

  if (cat !== 'all') list = list.filter(p => (p.category || '') === cat);
  if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q));

  switch (sort) {
    case 'price_asc':
      list.sort((a,b) => (a.price||0) - (b.price||0));
      break;
    case 'price_desc':
      list.sort((a,b) => (b.price||0) - (a.price||0));
      break;
    case 'name_asc':
      list.sort((a,b) => (a.name||'').localeCompare(b.name||''));
      break;
    case 'name_desc':
      list.sort((a,b) => (b.name||'').localeCompare(a.name||''));
      break;
    case 'vendidos_desc':
    default:
      list.sort((a,b) => (b.vendidos||0) - (a.vendidos||0));
      break;
  }

  const resultsLabel = document.getElementById('results-label');
  if (resultsLabel) resultsLabel.textContent = `Resultados (${list.length})`;

  displayProducts(list);
}

// ===== Detalle de producto =====
function displayProductDetails() {
  const params = new URLSearchParams(window.location.search);
  const productId = parseInt(params.get('id'));
  const product = products.find(p => p.id === productId);
  const container = document.getElementById('product-detail-container');
  if (!product || !container) {
    if (container) container.innerHTML = '<p class="text-center">Producto no encontrado.</p>';
    return;
  }
  const isOut = (product.stock ?? 0) === 0;
  document.getElementById('product-image').src = product.image;
  document.getElementById('product-name').textContent = product.name;
  document.getElementById('product-price').textContent = `$${Number(product.price||0).toLocaleString('es-CL')}`;
  document.getElementById('product-description').textContent = product.description || '';
  document.getElementById('product-stock').innerHTML = isOut ? '<span class="badge bg-danger">Agotado</span>' : `<span class="badge bg-success">En Stock (${product.stock} unidades)</span>`;
  const btn = document.getElementById('add-to-cart-btn');
  if (btn) {
    if (isOut) {
      btn.disabled = true;
      btn.textContent = 'Producto Agotado';
    } else {
      btn.onclick = () => {
        const qty = parseInt(document.getElementById('quantity-input').value) || 1;
        addToCart(product.id, qty);
      };
    }
  }
}

// ===== Cart helpers (fallback local si no hay sesión) =====
function getCart() {
  try {
    return JSON.parse(safeStorageGetItem('cart') || '[]');
  } catch (_) { return []; }
}
function saveCart(c) { safeStorageSetItem('cart', JSON.stringify(c||[])); }

async function addToCart(productId, quantity = 1) {
  try {
    if (window.Cart && typeof Cart.addItem === 'function') {
      const resp = await Cart.addItem(productId, quantity);
      if (resp) showToast('Producto agregado al carrito', 'success');
      updateCartCounter();
      return;
    }
  } catch (_) { /* fallback abajo */ }

  // Fallback local (invitado)
  const p = products.find(x => x.id === productId);
  if (!p) return;
  const cart = getCart();
  const idx = cart.findIndex(i => i.id === productId);
  if (idx >= 0) cart[idx].quantity += quantity; else cart.push({ id: p.id, name: p.name, price: p.price, image: p.image, description: p.description, quantity });
  saveCart(cart);
  showToast('Producto agregado al carrito', 'success');
  updateCartCounter();
}

async function updateCartCounter() {
  try {
    if (window.Cart && typeof Cart.getItems === 'function') {
      const items = await Cart.getItems();
      const total = items.reduce((s, it) => s + (it.quantity||0), 0);
      const badge = document.querySelector('#cart-counter, .cart-badge');
      if (badge) { badge.textContent = total; badge.style.display = total > 0 ? 'inline-block' : 'none'; }
      return;
    }
  } catch (_) { /* noop */ }
  const items = getCart();
  const total = items.reduce((s, it) => s + (it.quantity||0), 0);
  const badge = document.querySelector('#cart-counter, .cart-badge');
  if (badge) { badge.textContent = total; badge.style.display = total > 0 ? 'inline-block' : 'none'; }
}

// ===== Crea tu Jugo =====
const juiceBuilderData = {
  bases: [
    { name: 'Jugo de Naranja', price: 1500 },
    { name: 'Agua Purificada', price: 1000 },
    { name: 'Leche de Almendras', price: 1800 },
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
    { name: 'Zanahoria', price: 300 },
  ],
  maxIngredients: 4,
};

function initializeJuiceBuilder() {
  const basesContainer = document.getElementById('bases-container');
  const ingredientsContainer = document.getElementById('ingredients-container');
  const form = document.getElementById('juice-builder-form');
  if (!basesContainer || !ingredientsContainer || !form) return;

  basesContainer.innerHTML = '';
  ingredientsContainer.innerHTML = '';

  juiceBuilderData.bases.forEach((base, i) => {
    basesContainer.innerHTML += `<div class="form-check">
      <input class="form-check-input" type="radio" name="base" id="base-${i}" value="${base.price}" data-name="${base.name}" required>
      <label class="form-check-label" for="base-${i}">${base.name} <span class="text-muted">(+$${base.price.toLocaleString('es-CL')})</span></label>
    </div>`;
  });

  juiceBuilderData.ingredients.forEach((ing, i) => {
    ingredientsContainer.innerHTML += `<div class="col-md-6"><div class="form-check">
      <input class="form-check-input ingredient-check" type="checkbox" value="${ing.price}" data-name="${ing.name}" id="ingredient-${i}">
      <label class="form-check-label" for="ingredient-${i}">${ing.name} <span class="text-muted">(+$${ing.price.toLocaleString('es-CL')})</span></label>
    </div></div>`;
  });

  form.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(inp => inp.addEventListener('change', updateCustomJuicePrice));
  updateCustomJuicePrice();
}

function updateCustomJuicePrice() {
  let totalPrice = 0;
  const selectedBase = document.querySelector('input[name="base"]:checked');
  const summaryBase = document.getElementById('summary-base');
  if (selectedBase) { totalPrice += parseInt(selectedBase.value); if (summaryBase) summaryBase.textContent = selectedBase.dataset.name; }
  else if (summaryBase) { summaryBase.textContent = 'No seleccionada'; }

  const selectedIngredients = document.querySelectorAll('.ingredient-check:checked');
  const summaryIngredients = document.getElementById('summary-ingredients');
  if (summaryIngredients) summaryIngredients.innerHTML = '';
  selectedIngredients.forEach(ing => {
    totalPrice += parseInt(ing.value);
    if (summaryIngredients) { const li = document.createElement('li'); li.textContent = ing.dataset.name; summaryIngredients.appendChild(li); }
  });
  if (summaryIngredients && selectedIngredients.length === 0) summaryIngredients.innerHTML = '<li>Ninguno seleccionado</li>';

  const all = document.querySelectorAll('.ingredient-check');
  if (selectedIngredients.length >= juiceBuilderData.maxIngredients) {
    all.forEach(c => { if (!c.checked) c.disabled = true; });
  } else {
    all.forEach(c => { c.disabled = false; });
  }

  const totalEl = document.getElementById('total-price');
  if (totalEl) totalEl.textContent = `$${totalPrice.toLocaleString('es-CL')}`;
}

async function addCustomJuiceToCart(event) {
  if (event) event.preventDefault();
  const selectedBase = document.querySelector('input[name="base"]:checked');
  if (!selectedBase) { showToast('Por favor, elige una base.', 'error'); return; }

  const selectedIngredients = Array.from(document.querySelectorAll('.ingredient-check:checked'));
  let totalPrice = parseInt(selectedBase.value);
  const ingredientNames = selectedIngredients.map(i => i.dataset.name);
  selectedIngredients.forEach(i => totalPrice += parseInt(i.value));

  const customDescription = ingredientNames.length ? `${selectedBase.dataset.name} con ${ingredientNames.join(', ')}` : `${selectedBase.dataset.name}`;
  const token = safeStorageGetItem('auth_token');

  try {
    if (token) {
      await apiCall('/api/carrito/items', 'POST', {
        productoId: -1,
        cantidad: 1,
        personalizacion: { customName: 'Jugo Personalizado', customDescription, customPrice: totalPrice }
      });
      showToast('Jugo personalizado añadido al carrito', 'success');
      updateCartCounter();
      setTimeout(() => window.location.href = '/app/carrito/', 500);
    } else {
      const cart = getCart();
      cart.push({ id: `custom-${Date.now()}`, name: 'Jugo Personalizado', price: totalPrice, image: '/static/imagenes/jugo_tropical.png', description: customDescription, quantity: 1 });
      saveCart(cart);
      showToast('Jugo personalizado añadido al carrito', 'success');
      updateCartCounter();
      setTimeout(() => window.location.href = '/app/carrito/', 500);
    }
  } catch (e) {
    console.error(e);
    showToast('Error al añadir el jugo', 'error');
  }
}

// ===== Tema claro/oscuro (botón en navbar) =====
(function setupThemeToggle() {
  try {
    const saved = safeStorageGetItem('theme') || 'dark';
    document.body.setAttribute('data-theme', saved);
    const navbar = document.querySelector('.navbar .container, .navbar .container-fluid');
    if (navbar && !document.getElementById('themeToggleBtn')) {
      const btn = document.createElement('button');
      btn.id = 'themeToggleBtn';
      btn.className = 'btn theme-toggle ms-2';
      btn.type = 'button';
      btn.textContent = saved === 'light' ? 'Tema Oscuro' : 'Tema Claro';
      btn.addEventListener('click', () => {
        const current = document.body.getAttribute('data-theme') || 'dark';
        const next = current === 'light' ? 'dark' : 'light';
        document.body.setAttribute('data-theme', next);
        safeStorageSetItem('theme', next);
        btn.textContent = next === 'light' ? 'Tema Oscuro' : 'Tema Claro';
      });
      navbar.appendChild(btn);
    }
  } catch (_) { /* noop */ }
})();

// ===== Toast simple (compat con auth.js) =====
function showToast(message, type = 'info') {
  try {
    if (typeof mostrarNotificacion === 'function') {
      const map = { info: 'info', success: 'success', error: 'error', warning: 'warning' };
      return mostrarNotificacion(message, map[type] || 'info');
    }
  } catch (_) { /* noop */ }
  console.log(`[Toast:${type}]`, message);
}

// ===== Inicialización por página =====
document.addEventListener('DOMContentLoaded', async () => {
  updateCartCounter();

  const path = window.location.pathname;
  const onInicio = path.includes('/inicio/');
  const onCatalogo = path.includes('/catalogo/');
  const onProducto = path.includes('/producto/');
  const onCreaTuJugo = path.includes('/crea-tu-jugo/');

  if (onInicio || onCatalogo) {
    await fetchProducts();
    const params = new URLSearchParams(window.location.search);
    const q = (params.get('search') || '').trim().toLowerCase();
    if (q) {
      const input = document.getElementById('search-input');
      if (input) input.value = q;
    }
    applyCatalogView();
    const sel = document.getElementById('sort-select');
    if (sel) sel.addEventListener('change', applyCatalogView);
  }
  if (onProducto) {
    await fetchProducts();
    displayProductDetails();
  }
  if (onCreaTuJugo) {
    initializeJuiceBuilder();
  }
});

// Exponer funciones usadas en HTML
window.filterProducts = filterProducts;
window.searchProducts = searchProducts;
window.addToCart = addToCart;
window.addCustomJuiceToCart = addCustomJuiceToCart;
