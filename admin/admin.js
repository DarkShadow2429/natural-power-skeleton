const adminProducts = [
    { id: 1, name: 'Verde Detox', price: 3990, stock: 10, image: '../imagenes/jugo_verde.png' },
    { id: 2, name: 'Naranja Boost', price: 3990, stock: 5, image: '../imagenes/jugo_naranja.png' },
    { id: 3, name: 'Rojo Pasión', price: 4290, stock: 0, image: '../imagenes/jugo_rojo.png' },
    { id: 4, name: 'Amanecer Tropical', price: 4500, stock: 15, image: '../imagenes/jugo_tropical.png' },
];

const adminUsers = [
    { id: 101, name: 'Ana Contreras', email: 'ana.c@email.com', registered: '2025-09-10', status: 'Activo' },
    { id: 102, name: 'Carlos Díaz', email: 'carlos.d@email.com', registered: '2025-09-15', status: 'Activo' },
    { id: 103, name: 'Benja Mallea', email: 'benja.mallea@email.com', registered: '2025-09-20', status: 'Activo' },
    { id: 104, name: 'Daniela Soto', email: 'daniela.s@email.com', registered: '2025-10-01', status: 'Bloqueado' },
];

const dashboardStats = {
    revenue: 569500,
    orders: 42,
    newUsers: 5,
};

document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split("/").pop();
    
    if (currentPage === 'index.html' || currentPage === '') displayDashboardStats();
    if (currentPage === 'productos.html') displayProductTable();
    if (currentPage === 'usuarios.html') displayUserTable();
});

function displayDashboardStats() {
    document.getElementById('stats-revenue').textContent = `$${dashboardStats.revenue.toLocaleString('es-CL')}`;
    document.getElementById('stats-orders').textContent = dashboardStats.orders;
    document.getElementById('stats-users').textContent = dashboardStats.newUsers;
}

function displayProductTable() {
    const tableBody = document.getElementById('product-table-body');
    tableBody.innerHTML = '';
    adminProducts.forEach(p => {
        tableBody.innerHTML += `
            <tr>
                <td><img src="${p.image}" alt="${p.name}" width="50"></td>
                <td class="align-middle">${p.name}</td>
                <td class="align-middle">$${p.price.toLocaleString('es-CL')}</td>
                <td class="align-middle">${p.stock}</td>
                <td class="align-middle">
                    <button class="btn btn-secondary btn-sm" onclick="openEditModal(${p.id})">Editar</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">Eliminar</button>
                </td>
            </tr>
        `;
    });
}

function saveProduct(event) {
    event.preventDefault();
    const newProduct = {
        id: Math.max(...adminProducts.map(p => p.id)) + 1,
        name: document.getElementById('product-name').value,
        price: parseInt(document.getElementById('product-price').value),
        stock: parseInt(document.getElementById('product-stock').value),
        image: '../imagenes/jugo_tropical.png'
    };
    adminProducts.push(newProduct);
    displayProductTable();
    showToast(`Producto "${newProduct.name}" añadido`);
    event.target.reset();
}

function deleteProduct(productId) {
    if (confirm('¿Estás seguro de que quieres eliminar este producto?')) {
        const index = adminProducts.findIndex(p => p.id === productId);
        if (index > -1) {
            const productName = adminProducts[index].name;
            adminProducts.splice(index, 1);
            displayProductTable();
            showToast(`Producto "${productName}" eliminado`, 'error');
        }
    }
}

function openEditModal(productId) {
    const product = adminProducts.find(p => p.id === productId);
    if (!product) return;

    document.getElementById('edit-product-id').value = product.id;
    document.getElementById('edit-product-name').value = product.name;
    document.getElementById('edit-product-price').value = product.price;
    document.getElementById('edit-product-stock').value = product.stock;

    const editModal = new bootstrap.Modal(document.getElementById('editProductModal'));
    editModal.show();
}

function updateProduct(event) {
    event.preventDefault();

    const productId = parseInt(document.getElementById('edit-product-id').value);
    const productIndex = adminProducts.findIndex(p => p.id === productId);

    if (productIndex > -1) {
        adminProducts[productIndex].name = document.getElementById('edit-product-name').value;
        adminProducts[productIndex].price = parseInt(document.getElementById('edit-product-price').value);
        adminProducts[productIndex].stock = parseInt(document.getElementById('edit-product-stock').value);

        displayProductTable();

        const editModalEl = document.getElementById('editProductModal');
        const modalInstance = bootstrap.Modal.getInstance(editModalEl);
        modalInstance.hide();
        
        showToast('¡Producto actualizado con éxito!');
    }
}

function displayUserTable() {
    const tableBody = document.getElementById('user-table-body');
    tableBody.innerHTML = '';
    adminUsers.forEach(u => {
        const statusBadge = u.status === 'Activo' ? 'bg-success' : 'bg-danger';
        tableBody.innerHTML += `
            <tr>
                <td class="align-middle">${u.id}</td>
                <td class="align-middle">${u.name}</td>
                <td class="align-middle">${u.email}</td>
                <td class="align-middle"><span class="badge ${statusBadge}">${u.status}</span></td>
                <td class="align-middle">
                    <button class="btn btn-info btn-sm text-white" onclick="showToast('Viendo historial del usuario ${u.id}')">Ver Historial</button>
                    <button class="btn btn-warning btn-sm" onclick="toggleUserStatus(${u.id})">${u.status === 'Activo' ? 'Bloquear' : 'Activar'}</button>
                </td>
            </tr>
        `;
    });
}

function toggleUserStatus(userId) {
    const user = adminUsers.find(u => u.id === userId);
    if(user) {
        user.status = user.status === 'Activo' ? 'Bloqueado' : 'Activo';
        displayUserTable();
        showToast(`Estado del usuario ${user.name} actualizado.`);
    }
}

function showToast(message, type = 'success') {
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