let products = [];
let collections = [];
let orders = [];
let report = {};
let adminPassword = sessionStorage.getItem('nivara-admin-password') || '';
let orderPage = 1;
const ORDERS_PER_PAGE = 8;

const loginPanel = document.getElementById('loginPanel');
const adminPanel = document.getElementById('adminPanel');
const stockList = document.getElementById('stockList');
const collectionSelect = document.getElementById('collectionSelect');
const collectionList = document.getElementById('collectionList');
const orderList = document.getElementById('orderList');
const orderPagination = document.getElementById('orderPagination');
const reportGrid = document.getElementById('reportGrid');

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-password': adminPassword
  };
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

function showAdmin() {
  loginPanel.hidden = true;
  adminPanel.hidden = false;
}

function showLogin() {
  loginPanel.hidden = false;
  adminPanel.hidden = true;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadProducts() {
  const [productData, collectionData, orderData] = await Promise.all([
    apiRequest('/api/admin-products'),
    apiRequest('/api/admin-collections'),
    apiRequest('/api/admin-orders')
  ]);
  products = productData.products;
  collections = collectionData.collections;
  orders = orderData.orders || [];
  report = orderData.report || {};
  renderCollectionOptions();
  renderCollectionList();
  renderStockList();
  renderReport();
  renderOrders();
}

function renderCollectionOptions() {
  collectionSelect.innerHTML = '<option value="">No collection</option>' + collections
    .filter(collection => collection.active)
    .map(collection => `<option value="${collection.id}">${collection.name}</option>`)
    .join('');
}

function renderCollectionList() {
  if (!collectionList) return;
  const activeCollections = collections.filter(collection => collection.active);
  collectionList.innerHTML = activeCollections.length ? activeCollections.map(collection => `
    <article class="collection-card">
      <input value="${collection.name || ''}" data-collection-name="${collection.id}" aria-label="Collection name" />
      <input value="${collection.icon || '◇'}" data-collection-icon="${collection.id}" aria-label="Collection icon" />
      <button type="button" data-save-collection="${collection.id}">Save collection</button>
    </article>
  `).join('') : '<p class="muted-text">No collections yet.</p>';
}

function renderProductCollectionOptions(product) {
  return '<option value="">No collection</option>' + collections
    .filter(collection => collection.active)
    .map(collection => `<option value="${collection.id}" ${Number(product.collection_id) === Number(collection.id) ? 'selected' : ''}>${collection.name}</option>`)
    .join('');
}

function showFirstRunMessage(message) {
  products = [];
  stockList.innerHTML = `<section class="admin-note">${message}. Click <strong>Initialize database</strong> to create the tables and import your first products.</section>`;
}

function isMissingDatabaseTable(error) {
  return error.message.toLowerCase().includes('relation "products" does not exist') ||
    error.message.toLowerCase().includes('relation "collections" does not exist') ||
    error.message.toLowerCase().includes('relation "orders" does not exist');
}

function renderStockList() {
  stockList.innerHTML = products.map(product => `
    <article class="stock-card ${product.active ? '' : 'stock-card-hidden'}">
      <img src="${product.image}" alt="${product.name}" />
      <div>
        <h2>${product.name}</h2>
        <p>Code ${product.code || '-'} · ${product.active ? 'Visible' : 'Removed'} · Rs. ${Number(product.price).toLocaleString('en-IN')}</p>
        <label class="image-path-field">Image path
          <input value="${product.image || ''}" data-image-input="${product.id}" placeholder="assets/products/example.jpg" />
        </label>
        <label class="image-path-field">Collection
          <select data-product-collection="${product.id}">
            ${renderProductCollectionOptions(product)}
          </select>
        </label>
        <label class="image-path-field">Category
          <input value="${product.category || ''}" data-category-input="${product.id}" placeholder="Necklace" />
        </label>
        <div class="stock-number">
          <input type="number" min="0" value="${product.stock}" data-stock-input="${product.id}" />
          <span>${product.stock ? `${product.stock} available` : 'Out of stock'}</span>
        </div>
        <div class="stock-controls">
          <button data-save-stock="${product.id}">Save stock</button>
          <button data-save-image="${product.id}">Save image</button>
          <button data-save-category="${product.id}">Save category</button>
          <button data-sold-out="${product.id}">Sold out</button>
          <button data-remove-product="${product.id}">Remove</button>
        </div>
      </div>
    </article>
  `).join('');
}

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
}

function renderReport() {
  reportGrid.innerHTML = [
    ['Total orders', report.total_orders || 0],
    ['Open orders', report.open_orders || 0],
    ['In progress', report.in_progress_orders || 0],
    ['Delivered', report.delivered_orders || 0],
    ['Items sold', report.items_sold || 0],
    ['Sales total', formatPrice(report.total_sales || 0)]
  ].map(([label, value]) => `<article class="report-card"><span>${label}</span><strong>${value}</strong></article>`).join('');
}

function renderOrders() {
  const totalPages = Math.max(1, Math.ceil(orders.length / ORDERS_PER_PAGE));
  orderPage = Math.min(orderPage, totalPages);
  const visibleOrders = orders.slice((orderPage - 1) * ORDERS_PER_PAGE, orderPage * ORDERS_PER_PAGE);

  orderList.innerHTML = visibleOrders.length ? visibleOrders.map(order => {
    const products = order.products || [];
    const customer = order.customer || {};
    const address = customer.shippingAddress || customer.billingAddress || 'No address saved';
    return `
      <article class="admin-order-card">
        <div>
          <h3>${order.orderNumber || 'Order'}</h3>
          <p>${new Date(order.createdAt).toLocaleString('en-IN')} · ${formatPrice(order.amount)} · ${order.paymentId || 'Payment pending'}</p>
          <p><strong>${customer.name || order.customerEmail || 'Customer'}</strong> · ${customer.phone || 'No phone'} · ${order.customerEmail || customer.email || 'No email'}</p>
          <p>${address}</p>
          <ul>${products.map(item => `<li>${item.name || `Product ${item.id}`} x ${item.quantity}</li>`).join('')}</ul>
        </div>
        <div class="order-status-controls">
          <select data-order-status="${order.id}">
            <option value="open" ${order.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="in_progress" ${order.status === 'in_progress' ? 'selected' : ''}>In progress</option>
            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
          </select>
          <button data-save-order-status="${order.id}">Save status</button>
        </div>
      </article>
    `;
  }).join('') : '<p class="muted-text">No orders yet.</p>';

  orderPagination.innerHTML = orders.length > ORDERS_PER_PAGE ? `
    <button type="button" data-order-page="prev" ${orderPage === 1 ? 'disabled' : ''}>Previous</button>
    <span>Page ${orderPage} of ${totalPages} · showing latest ${ORDERS_PER_PAGE}</span>
    <button type="button" data-order-page="next" ${orderPage === totalPages ? 'disabled' : ''}>Next</button>
  ` : '';
}

document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  adminPassword = document.getElementById('adminPassword').value;
  sessionStorage.setItem('nivara-admin-password', adminPassword);

  try {
    await loadProducts();
    showAdmin();
    showToast('Logged in');
  } catch (error) {
    if (isMissingDatabaseTable(error)) {
      showAdmin();
      showFirstRunMessage('Database is connected, but the required tables are not created yet');
      showToast('Please initialize database');
      return;
    }

    sessionStorage.removeItem('nivara-admin-password');
    adminPassword = '';
    showToast(error.message);
  }
});

document.getElementById('logoutButton').addEventListener('click', () => {
  sessionStorage.removeItem('nivara-admin-password');
  adminPassword = '';
  showLogin();
});

document.getElementById('initializeDb').addEventListener('click', async () => {
  try {
    await apiRequest('/api/admin-init', { method: 'POST', body: '{}' });
    await loadProducts();
    showToast('Database initialized');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('refreshOrders').addEventListener('click', async () => {
  try {
    await loadProducts();
    showToast('Orders refreshed');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('productForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const product = Object.fromEntries(formData.entries());
  const selectedCollection = collections.find(collection => collection.id === Number(product.collection_id));
  if (selectedCollection) {
    product.category = selectedCollection.name;
    product.type = selectedCollection.slug;
  }

  try {
    await apiRequest('/api/admin-products', {
      method: 'POST',
      body: JSON.stringify(product)
    });
    form.reset();
    form.category.value = 'Necklace';
    form.type.value = 'necklace';
    form.image.value = '';
    await loadProducts();
    showToast('Product added');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('collectionForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const collection = Object.fromEntries(new FormData(form).entries());

  try {
    await apiRequest('/api/admin-collections', {
      method: 'POST',
      body: JSON.stringify(collection)
    });
    form.reset();
    form.icon.value = '◇';
    await loadProducts();
    showToast('Collection added');
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener('click', async event => {
  const saveButton = event.target.closest('[data-save-stock]');
  const saveImageButton = event.target.closest('[data-save-image]');
  const saveCategoryButton = event.target.closest('[data-save-category]');
  const soldOutButton = event.target.closest('[data-sold-out]');
  const removeButton = event.target.closest('[data-remove-product]');
  const saveOrderStatusButton = event.target.closest('[data-save-order-status]');
  const saveCollectionButton = event.target.closest('[data-save-collection]');
  const orderPageButton = event.target.closest('[data-order-page]');

  try {
    if (orderPageButton) {
      orderPage += orderPageButton.dataset.orderPage === 'next' ? 1 : -1;
      renderOrders();
      return;
    }

    if (saveCollectionButton) {
      const id = Number(saveCollectionButton.dataset.saveCollection);
      const name = document.querySelector(`[data-collection-name="${id}"]`).value.trim();
      const icon = document.querySelector(`[data-collection-icon="${id}"]`).value.trim() || '◇';
      if (!name) return showToast('Collection name is required');
      await apiRequest('/api/admin-collections', {
        method: 'PATCH',
        body: JSON.stringify({ id, name, icon })
      });
      await loadProducts();
      showToast('Collection updated');
    }

    if (saveButton) {
      if (!confirm('Save the stock quantity for this product?')) return;
      const id = Number(saveButton.dataset.saveStock);
      const input = document.querySelector(`[data-stock-input="${id}"]`);
      await apiRequest('/api/admin-products', {
        method: 'PATCH',
        body: JSON.stringify({ id, stock: Number(input.value) || 0 })
      });
      await loadProducts();
      showToast('Stock updated');
    }

    if (saveImageButton) {
      if (!confirm('Save the image path for this product?')) return;
      const id = Number(saveImageButton.dataset.saveImage);
      const input = document.querySelector(`[data-image-input="${id}"]`);
      await apiRequest('/api/admin-products', {
        method: 'PATCH',
        body: JSON.stringify({ id, image: input.value.trim() })
      });
      await loadProducts();
      showToast('Image updated');
    }

    if (saveCategoryButton) {
      if (!confirm('Save the category for this product?')) return;
      const id = Number(saveCategoryButton.dataset.saveCategory);
      const input = document.querySelector(`[data-category-input="${id}"]`);
      const collectionInput = document.querySelector(`[data-product-collection="${id}"]`);
      const collectionId = Number(collectionInput?.value) || null;
      const collection = collections.find(item => Number(item.id) === collectionId);
      const category = input.value.trim() || collection?.name || 'Necklace';
      const type = collection?.slug || slugify(category);
      await apiRequest('/api/admin-products', {
        method: 'PATCH',
        body: JSON.stringify({ id, category, type, collection_id: collectionId })
      });
      await loadProducts();
      showToast('Category updated');
    }

    if (soldOutButton) {
      if (!confirm('Mark this product as sold out?')) return;
      await apiRequest('/api/admin-products', {
        method: 'PATCH',
        body: JSON.stringify({ id: Number(soldOutButton.dataset.soldOut), stock: 0 })
      });
      await loadProducts();
      showToast('Marked sold out');
    }

    if (removeButton) {
      if (!confirm('Remove this product from the shop?')) return;
      await apiRequest('/api/admin-products', {
        method: 'DELETE',
        body: JSON.stringify({ id: Number(removeButton.dataset.removeProduct) })
      });
      await loadProducts();
      showToast('Product removed from shop');
    }

    if (saveOrderStatusButton) {
      const id = Number(saveOrderStatusButton.dataset.saveOrderStatus);
      const select = document.querySelector(`[data-order-status="${id}"]`);
      await apiRequest('/api/admin-orders', {
        method: 'PATCH',
        body: JSON.stringify({ id, status: select.value })
      });
      await loadProducts();
      showToast('Order status updated');
    }
  } catch (error) {
    showToast(error.message);
  }
});

if (adminPassword) {
  loadProducts()
    .then(showAdmin)
    .catch(error => {
      if (isMissingDatabaseTable(error)) {
        showAdmin();
        showFirstRunMessage('Database is connected, but the required tables are not created yet');
        return;
      }
      showLogin();
    });
} else {
  showLogin();
}
