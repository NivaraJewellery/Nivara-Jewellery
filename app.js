let products = [];
let collections = [];
let cart = JSON.parse(localStorage.getItem('nivara-cart') || '[]');
let activeFilter = 'all';
let customer = JSON.parse(localStorage.getItem('nivara-customer') || 'null');
let pendingGuestDetails = null;
let imageViewerZoom = 1;
let imageViewerPan = { x: 0, y: 0 };
let imageViewerDrag = null;
let imageViewerImages = [];
let imageViewerIndex = 0;
let productPage = 1;
const CUSTOMER_SESSION_MS = 30 * 60 * 1000;
const PRODUCTS_PER_PAGE = 8;
const WHATSAPP_ORDER_NUMBER = '917899890736';

const formatPrice = value => `Rs. ${Number(value).toLocaleString('en-IN')}`;
const productsNode = document.getElementById('products');
const collectionsNode = document.getElementById('collectionsList');
const productPaginationNode = document.getElementById('productPagination');

function saveCustomer(customerData) {
  const previousEmail = customer?.email;
  customer = customerData;
  if (previousEmail && previousEmail !== customerData.email) {
    clearCart();
  }
  localStorage.setItem('nivara-customer', JSON.stringify(customerData));
  localStorage.setItem('nivara-customer-session', String(Date.now()));
  renderCustomerMenu();
}

function clearCustomerSession(message) {
  localStorage.removeItem('nivara-customer');
  localStorage.removeItem('nivara-customer-session');
  customer = null;
  renderCustomerMenu();
  if (message) showToast(message);
}

function isCustomerSessionExpired() {
  if (!customer) return false;
  const lastSeen = Number(localStorage.getItem('nivara-customer-session') || 0);
  return !lastSeen || Date.now() - lastSeen > CUSTOMER_SESSION_MS;
}

function refreshCustomerSession() {
  if (customer) localStorage.setItem('nivara-customer-session', String(Date.now()));
}

function ensureActiveCustomerSession() {
  if (!isCustomerSessionExpired()) {
    refreshCustomerSession();
    return true;
  }
  clearCart();
  clearCustomerSession('Session expired. Please login again.');
  return false;
}

function hasCompleteCheckoutProfile(customerData) {
  const address = customerData?.address || {};
  return Boolean(customerData?.phone && customerData?.phoneVerified && address.line1 && address.city && address.state && address.pincode);
}

function clearCart() {
  cart = [];
  localStorage.removeItem('nivara-cart');
  renderCart();
}

async function accountRequest(payload) {
  const response = await fetch('/api/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Account request failed');
  return data;
}

async function loadProducts() {
  try {
    const [productResponse, collectionResponse] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/collections')
    ]);
    const productData = await productResponse.json();
    const collectionData = await collectionResponse.json();
    if (!productResponse.ok) throw new Error(productData.error || 'Unable to load products');
    products = productData.products;
    collections = collectionResponse.ok ? collectionData.collections : [];
  } catch (error) {
    const fallback = await fetch('products.json');
    products = await fallback.json();
    collections = buildFallbackCollections(products);
  }

  cart = cart
    .map(item => {
      const product = products.find(entry => entry.id === item.id);
      return product ? { ...product, quantity: Math.min(item.quantity, product.stock) } : null;
    })
    .filter(item => item && item.quantity > 0);

  renderFilters();
  renderCollections();
  renderCart();
}

function buildFallbackCollections(sourceProducts) {
  const counts = {};
  sourceProducts.forEach(product => {
    const key = product.type || 'necklace';
    counts[key] = counts[key] || { name: product.category || friendlyLabel(key), slug: key, image: product.image, product_count: 0 };
    counts[key].product_count++;
  });
  return Object.values(counts);
}

function friendlyLabel(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function renderFilters() {
  const filtersNode = document.querySelector('.filters');
  if (!filtersNode) return;
  const collectionFilters = collections.length ? collections.map(collection => [collection.slug, collection.name]) : [];
  const productFilters = [...new Map(products
    .filter(product => product.type)
    .map(product => [product.collection_slug || product.type, product.collection_name || product.category || friendlyLabel(product.type)]))];
  const filters = collectionFilters.length ? collectionFilters : productFilters;
  filtersNode.innerHTML = [
    '<button class="filter active" data-filter="all">All</button>',
    ...filters.map(([type, label]) => `<button class="filter" data-filter="${type}">${friendlyLabel(label)}</button>`)
  ].join('');
}

function renderCollections() {
  if (!collectionsNode) return;
  collectionsNode.innerHTML = collections.map(collection => `
    <a href="#shop" class="category" data-collection-filter="${collection.slug}">
      <img src="${collection.image || 'assets/logo.png'}" alt="${collection.name}" loading="lazy" />
      <b>${collection.name}</b>
      <small>${collection.product_count || 0} piece${Number(collection.product_count) === 1 ? '' : 's'}</small>
    </a>
  `).join('');
}
function getStockLabel(product) {
  if (!product.stock) return 'Out of stock';
  if (product.stock === 1) return 'Only 1 left';
  return 'In stock';
}

function getVisibleProducts() {
  return activeFilter === 'all' ? products : products.filter(product => product.type === activeFilter || product.collection_slug === activeFilter);
}

function renderProductPagination(totalProducts) {
  if (!productPaginationNode) return;
  const totalPages = Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_PAGE));
  productPage = Math.min(productPage, totalPages);
  productPaginationNode.innerHTML = totalPages > 1 ? `
    <button type="button" data-product-page="prev" ${productPage === 1 ? 'disabled' : ''}>Previous</button>
    <span>Page ${productPage} of ${totalPages}</span>
    <button type="button" data-product-page="next" ${productPage === totalPages ? 'disabled' : ''}>Next</button>
  ` : '';
}

function renderProducts() {
  const visible = getVisibleProducts();
  const totalPages = Math.max(1, Math.ceil(visible.length / PRODUCTS_PER_PAGE));
  productPage = Math.min(productPage, totalPages);
  const pageProducts = visible.slice((productPage - 1) * PRODUCTS_PER_PAGE, productPage * PRODUCTS_PER_PAGE);

  productsNode.innerHTML = pageProducts.map(product => {
    const isOutOfStock = product.stock === 0;
    const cartItem = cart.find(item => item.id === product.id);
    const hoverImage = product.image_2 || product.image;
    return `
      <article class="product">
        <div class="product-image">
          <button class="product-photo-button" type="button" data-view-image="${product.id}" aria-label="View ${product.name} image">
            <img class="product-photo" src="${product.image}" data-main-image="${product.image}" data-hover-image="${hoverImage}" alt="${product.name}" loading="lazy" />
          </button>
          <span class="product-tag ${isOutOfStock ? 'product-tag-sold' : ''}">${getStockLabel(product)}</span>
        </div>
        <div class="product-info">
          <div>
            <h3>${product.name}</h3>
            <p>${product.description}</p>
            <small>Code ${product.code} - ${isOutOfStock ? 'Out of stock' : `${product.stock} available`}</small>
          </div>
          <strong class="price">${formatPrice(product.price)}</strong>
        </div>
        ${cartItem ? `
          <div class="quantity-stepper product-stepper">
            <button data-decrease="${product.id}" aria-label="Remove one ${product.name}">-</button>
            <span>${cartItem.quantity}</span>
            <button data-increase="${product.id}" aria-label="Add one more ${product.name}" ${cartItem.quantity >= product.stock ? 'disabled' : ''}>+</button>
          </div>
        ` : isOutOfStock
          ? `<button class="add-button notify-button" data-notify="${product.id}" aria-label="Notify me when ${product.name} is back in stock">Notify me</button>`
          : `<button class="add-button" data-add="${product.id}" aria-label="Add ${product.name} to bag">Add to bag</button>`}
      </article>
    `;
  }).join('');
  renderProductPagination(visible.length);
}

function renderCart() {
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTitleCount').textContent = `(${count})`;
  document.getElementById('cartSubtotal').textContent = formatPrice(subtotal);
  document.getElementById('cartEmpty').style.display = cart.length ? 'none' : 'block';
  document.getElementById('cartItems').innerHTML = cart.map(item => `
    <div class="cart-item">
      <img class="cart-photo" src="${item.image}" alt="${item.name}" />
      <div>
        <h3>${item.name}</h3>
        <p>${formatPrice(item.price)}</p>
        ${item.care ? `<details class="care-details"><summary>Care instructions</summary><p>${item.care}</p></details>` : ''}
        <div class="bag-stepper">
          <button data-decrease="${item.id}" aria-label="Remove one ${item.name}">-</button>
          <span>${item.quantity}</span>
          <button data-increase="${item.id}" aria-label="Add one more ${item.name}">+</button>
        </div>
        <button data-remove="${item.id}">Remove all</button>
      </div>
      <strong>${formatPrice(item.price * item.quantity)}</strong>
    </div>
  `).join('');
  localStorage.setItem('nivara-cart', JSON.stringify(cart));
  renderProducts();
}

function buildWhatsAppOrderMessage() {
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const lines = [
    'Hello Nivara Jewellery,',
    '',
    'I would like to place this order:',
    '',
    ...cart.map((item, index) => `${index + 1}. ${item.name} - Qty: ${item.quantity} - ${formatPrice(item.price * item.quantity)}`),
    '',
    `Total: ${formatPrice(subtotal)}`,
    '',
    'Customer details:',
    'Name:',
    'Phone:',
    'Shipping address:'
  ];
  return lines.join('\n');
}

function continueOrderOnWhatsApp() {
  if (!cart.length) return showToast('Your bag is empty');
  const message = encodeURIComponent(buildWhatsAppOrderMessage());
  window.open(`https://wa.me/${WHATSAPP_ORDER_NUMBER}?text=${message}`, '_blank', 'noopener');
}

async function requestStockNotification(productId) {
  const product = products.find(item => item.id === productId);
  if (!product) return;

  const email = prompt(`Enter your email. We will notify you when ${product.name} is back in stock.`, customer?.email || '');
  if (!email) return;

  try {
    const response = await fetch('/api/notify-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        customer_name: customer?.name || '',
        email
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save notify request');
    showToast('Done. We will notify you when it is back in stock.', 'success');
  } catch (error) {
    showToast(error.message);
  }
}

function updateImageViewerZoom() {
  const photo = document.getElementById('imageViewerPhoto');
  photo.style.transform = `translate(${imageViewerPan.x}px, ${imageViewerPan.y}px) scale(${imageViewerZoom})`;
  document.getElementById('imageZoomLevel').textContent = `${Math.round(imageViewerZoom * 100)}%`;
  const zoomSlider = document.getElementById('imageZoomSlider');
  if (zoomSlider) zoomSlider.value = String(imageViewerZoom);
}

function setImageViewerZoom(nextZoom) {
  imageViewerZoom = Math.min(3, Math.max(1, nextZoom));
  if (imageViewerZoom === 1) imageViewerPan = { x: 0, y: 0 };
  updateImageViewerZoom();
}

function getProductImages(product) {
  return [product.image, product.image_2, product.image_3]
    .map(image => String(image || '').trim())
    .filter(Boolean);
}

function setImageViewerImage(index) {
  if (!imageViewerImages.length) return;
  imageViewerIndex = (index + imageViewerImages.length) % imageViewerImages.length;
  const photo = document.getElementById('imageViewerPhoto');
  photo.src = imageViewerImages[imageViewerIndex];
  imageViewerZoom = 1;
  imageViewerPan = { x: 0, y: 0 };
  updateImageViewerZoom();

  const counter = document.getElementById('imageViewerCount');
  if (counter) counter.textContent = `${imageViewerIndex + 1}/${imageViewerImages.length}`;

  const previous = document.getElementById('imageViewerPrev');
  const next = document.getElementById('imageViewerNext');
  if (previous) previous.disabled = imageViewerImages.length < 2;
  if (next) next.disabled = imageViewerImages.length < 2;
}

function openImageViewer(productId) {
  const product = products.find(item => item.id === productId);
  if (!product) return;
  imageViewerImages = getProductImages(product);
  imageViewerIndex = 0;
  imageViewerZoom = 1;
  imageViewerPan = { x: 0, y: 0 };
  imageViewerDrag = null;
  const modal = document.getElementById('imageViewer');
  const photo = document.getElementById('imageViewerPhoto');
  photo.alt = product.name;
  modal.hidden = false;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  setImageViewerImage(0);
}

function closeImageViewer() {
  const modal = document.getElementById('imageViewer');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.hidden = true;
  document.getElementById('imageViewerPhoto').src = '';
  imageViewerImages = [];
  imageViewerIndex = 0;
  imageViewerDrag = null;
}

function addToCart(id) {
  const product = products.find(item => item.id === id);
  if (!product || product.stock === 0) return showToast('This item is out of stock');

  const existing = cart.find(item => item.id === id);
  if (existing) {
    if (existing.quantity >= product.stock) return showToast(`Only ${product.stock} available for ${product.name}`);
    existing.quantity++;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  renderCart();
  showToast(`${product.name} added to your bag`, 'success');
}

function changeQuantity(id, delta) {
  const product = products.find(item => item.id === id);
  const existing = cart.find(item => item.id === id);
  if (!product || !existing) return;

  const nextQuantity = existing.quantity + delta;
  if (nextQuantity <= 0) {
    cart = cart.filter(item => item.id !== id);
  } else if (nextQuantity <= product.stock) {
    existing.quantity = nextQuantity;
  } else {
    showToast(`Only ${product.stock} available for ${product.name}`);
  }

  renderCart();
}

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  window.clearTimeout(toast.hideTimer);
  toast.textContent = message;
  toast.classList.toggle('toast-success', type === 'success');
  toast.classList.add('show');
  toast.hideTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.textContent = '';
  }, 2600);
}

function renderCustomerMenu() {
  const userIcon = document.getElementById('userMenuToggle');
  const accountLink = document.getElementById('accountLink');
  if (!userIcon) return;
  userIcon.classList.toggle('logged-in', Boolean(customer));
  userIcon.textContent = customer ? String(customer.name || customer.email || 'N').trim().charAt(0).toUpperCase() : 'N';
  userIcon.title = customer ? `Logged in as ${customer.name || customer.email}` : 'Login or signup';
  if (accountLink) {
    accountLink.textContent = customer ? 'My Account' : 'Account';
    accountLink.href = customer ? '#profile' : 'account.html';
  }
}

function fillProfileForm(customerData) {
  const form = document.getElementById('profileForm');
  const address = customerData.address || {};
  form.elements.name.value = customerData.name || '';
  form.elements.email.value = customerData.email || '';
  form.elements.phone.value = customerData.phone || '';
  form.elements.line1.value = address.line1 || '';
  form.elements.line2.value = address.line2 || '';
  form.elements.city.value = address.city || '';
  form.elements.state.value = address.state || '';
  form.elements.pincode.value = address.pincode || '';
}

async function openProfile() {
  if (!customer) {
    window.location.href = 'account.html';
    return;
  }

  try {
    const data = await accountRequest({ action: 'profile-get', customer });
    saveCustomer(data.customer);
    fillProfileForm(data.customer);
    document.getElementById('otpForm').hidden = true;
    const modal = document.getElementById('profileModal');
    modal.hidden = false;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  } catch (error) {
    showToast(error.message);
  }
}

function closeProfile() {
  const modal = document.getElementById('profileModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.hidden = true;
}

async function openOrders() {
  if (!customer) {
    window.location.href = 'account.html';
    return;
  }

  const list = document.getElementById('ordersList');
  list.innerHTML = '<p>Loading your orders...</p>';
  const modal = document.getElementById('ordersModal');
  modal.hidden = false;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  try {
    const data = await accountRequest({ action: 'orders', customer });
    list.innerHTML = data.orders.length ? data.orders.map(order => `
      <div class="order-card">
        <strong>${formatPrice(order.amount)}</strong>
        <small>${new Date(order.created_at).toLocaleString('en-IN')} - ${order.razorpay_payment_id || 'Payment pending'}</small>
      </div>
    `).join('') : '<p>No orders yet. Your first sparkle is waiting.</p>';
  } catch (error) {
    list.innerHTML = `<p>${error.message}</p>`;
  }
}

function closeOrders() {
  const modal = document.getElementById('ordersModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.hidden = true;
}

function normalizeOrderDetails(order) {
  const details = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
  if (Array.isArray(details)) return { customer: {}, products: details };
  return {
    customer: details?.customer || {},
    products: Array.isArray(details?.products) ? details.products : []
  };
}

function renderOrderCard(order) {
  const details = normalizeOrderDetails(order);
  const products = details.products;
  const address = details.customer.shippingAddress || details.customer.billingAddress || 'Not available';
  const orderDate = new Date(order.created_at);
  const deliveryDate = new Date(orderDate);
  deliveryDate.setDate(deliveryDate.getDate() + 7);

  return `
    <details class="order-card" open>
      <summary>
        <strong>${formatPrice(order.amount)}</strong>
        <small>${order.razorpay_order_id || 'Order'} - ${order.razorpay_payment_id || 'Payment pending'}</small>
      </summary>
      <dl class="order-detail-grid">
        <div><dt>Order number</dt><dd>${order.razorpay_order_id || '-'}</dd></div>
        <div><dt>Order date</dt><dd>${orderDate.toLocaleDateString('en-IN')}</dd></div>
        <div><dt>Payment method</dt><dd>Razorpay</dd></div>
        <div><dt>Estimated delivery</dt><dd>${deliveryDate.toLocaleDateString('en-IN')}</dd></div>
      </dl>
      <div class="order-detail-block">
        <h3>Items ordered</h3>
        ${products.length ? `<ul>${products.map(item => `<li>${item.name || `Product ${item.id}`} x ${item.quantity} - ${formatPrice(item.price || 0)}</li>`).join('')}</ul>` : '<p>No item details found.</p>'}
      </div>
      <div class="order-detail-block">
        <h3>Delivery address</h3>
        <p>${address}</p>
      </div>
    </details>
  `;
}

async function openOrders() {
  if (!customer) {
    window.location.href = 'account.html';
    return;
  }

  const list = document.getElementById('ordersList');
  list.innerHTML = '<p>Loading your orders...</p>';
  const modal = document.getElementById('ordersModal');
  modal.hidden = false;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  try {
    const data = await accountRequest({ action: 'orders', customer });
    list.innerHTML = data.orders.length ? data.orders.map(renderOrderCard).join('') : '<p>No orders yet. Your first sparkle is waiting.</p>';
  } catch (error) {
    list.innerHTML = `<p>${error.message}</p>`;
  }
}

function openGuestCheckout() {
  const modal = document.getElementById('guestCheckoutModal');
  modal.hidden = false;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeGuestCheckout() {
  const modal = document.getElementById('guestCheckoutModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.hidden = true;
}

function openCart() {
  document.getElementById('cartPanel').classList.add('open');
  document.getElementById('overlay').classList.add('open');
  document.getElementById('cartPanel').setAttribute('aria-hidden', 'false');
}

function closeCart() {
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('cartPanel').setAttribute('aria-hidden', 'true');
}

document.addEventListener('click', event => {
  const add = event.target.closest('[data-add]');
  const increase = event.target.closest('[data-increase]');
  const decrease = event.target.closest('[data-decrease]');
  const remove = event.target.closest('[data-remove]');
  const viewImage = event.target.closest('[data-view-image]');
  const notify = event.target.closest('[data-notify]');
  if (add) addToCart(Number(add.dataset.add));
  if (increase) changeQuantity(Number(increase.dataset.increase), 1);
  if (decrease) changeQuantity(Number(decrease.dataset.decrease), -1);
  if (viewImage) openImageViewer(Number(viewImage.dataset.viewImage));
  if (notify) requestStockNotification(Number(notify.dataset.notify));
  if (remove) {
    cart = cart.filter(item => item.id !== Number(remove.dataset.remove));
    renderCart();
  }
});

document.addEventListener('mouseover', event => {
  const photo = event.target.closest('.product-photo');
  if (!photo || !photo.dataset.hoverImage || photo.dataset.hoverImage === photo.dataset.mainImage) return;
  photo.src = photo.dataset.hoverImage;
});

document.addEventListener('mouseout', event => {
  const photo = event.target.closest('.product-photo');
  if (!photo || !photo.dataset.mainImage) return;
  photo.src = photo.dataset.mainImage;
});

document.addEventListener('click', event => {
  const toggle = event.target.closest('#userMenuToggle');
  const dropdown = document.getElementById('userDropdown');

  if (toggle) {
    if (!ensureActiveCustomerSession()) return;
    if (!customer) {
      window.location.href = 'account.html';
      return;
    }
    dropdown.hidden = !dropdown.hidden;
    return;
  }

  if (!event.target.closest('#userMenu')) dropdown.hidden = true;
  if (event.target.closest('[data-profile-open]')) {
    dropdown.hidden = true;
    openProfile();
  }
  if (event.target.closest('[data-orders-open]')) {
    dropdown.hidden = true;
    openOrders();
  }
  if (event.target.closest('[data-logout]')) {
    clearCustomerSession();
    dropdown.hidden = true;
    clearCart();
    showToast('Logged out and bag cleared');
  }
});

document.getElementById('accountLink').addEventListener('click', event => {
  if (!ensureActiveCustomerSession()) return;
  if (!customer) return;
  event.preventDefault();
  openProfile();
});

document.addEventListener('click', event => {
  const collection = event.target.closest('[data-collection-filter]');
  if (!collection) return;
  activeFilter = collection.dataset.collectionFilter;
  productPage = 1;
  document.querySelectorAll('.filter').forEach(filter => filter.classList.toggle('active', false));
  renderProducts();
});

document.addEventListener('click', event => {
  const filter = event.target.closest('.filter');
  if (!filter) return;
  activeFilter = filter.dataset.filter;
  productPage = 1;
  document.querySelectorAll('.filter').forEach(button => button.classList.toggle('active', button === filter));
  renderProducts();
});

document.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-product-page]');
  if (!pageButton) return;
  productPage += pageButton.dataset.productPage === 'next' ? 1 : -1;
  renderProducts();
  document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('cartToggle').addEventListener('click', openCart);
document.getElementById('cartClose').addEventListener('click', closeCart);
document.getElementById('overlay').addEventListener('click', closeCart);
document.getElementById('continueShopping').addEventListener('click', closeCart);
document.getElementById('guestCheckoutClose').addEventListener('click', closeGuestCheckout);
document.getElementById('imageViewerClose').addEventListener('click', closeImageViewer);
document.getElementById('imageViewer').addEventListener('click', event => {
  if (event.target.id === 'imageViewer') closeImageViewer();
});
document.getElementById('imageZoomSlider').addEventListener('input', event => {
  setImageViewerZoom(Number(event.target.value));
});
document.getElementById('imageZoomReset').addEventListener('click', () => {
  imageViewerZoom = 1;
  imageViewerPan = { x: 0, y: 0 };
  updateImageViewerZoom();
});
document.getElementById('imageViewerPrev')?.addEventListener('click', () => {
  setImageViewerImage(imageViewerIndex - 1);
});
document.getElementById('imageViewerNext')?.addEventListener('click', () => {
  setImageViewerImage(imageViewerIndex + 1);
});
document.getElementById('imageViewerPhoto').addEventListener('wheel', event => {
  event.preventDefault();
  setImageViewerZoom(imageViewerZoom + (event.deltaY < 0 ? 0.12 : -0.12));
}, { passive: false });
document.getElementById('imageViewerPhoto').addEventListener('pointerdown', event => {
  if (imageViewerZoom <= 1) return;
  imageViewerDrag = {
    startX: event.clientX,
    startY: event.clientY,
    panX: imageViewerPan.x,
    panY: imageViewerPan.y
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.classList.add('is-dragging');
});
document.getElementById('imageViewerPhoto').addEventListener('pointermove', event => {
  if (!imageViewerDrag) return;
  imageViewerPan = {
    x: imageViewerDrag.panX + event.clientX - imageViewerDrag.startX,
    y: imageViewerDrag.panY + event.clientY - imageViewerDrag.startY
  };
  updateImageViewerZoom();
});
document.getElementById('imageViewerPhoto').addEventListener('pointerup', event => {
  imageViewerDrag = null;
  event.currentTarget.classList.remove('is-dragging');
});
document.getElementById('imageViewerPhoto').addEventListener('pointercancel', event => {
  imageViewerDrag = null;
  event.currentTarget.classList.remove('is-dragging');
});
document.getElementById('toast').addEventListener('click', event => {
  event.currentTarget.classList.remove('show');
  event.currentTarget.textContent = '';
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  closeCart();
  closeGuestCheckout();
  closeProfile();
  closeOrders();
  closeImageViewer();
  document.getElementById('userDropdown').hidden = true;
});

document.querySelector('.menu-button').addEventListener('click', event => {
  const navigation = document.getElementById('navigation');
  navigation.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', navigation.classList.contains('open'));
});

async function startCheckout() {
  if (!cart.length) return showToast('Your bag is empty');
  showToast('Secure checkout is temporarily disabled. Please continue on WhatsApp.');
}

document.getElementById('checkoutButton')?.addEventListener('click', startCheckout);
document.getElementById('whatsappCheckoutButton')?.addEventListener('click', continueOrderOnWhatsApp);
document.getElementById('profileClose').addEventListener('click', closeProfile);
document.getElementById('ordersClose').addEventListener('click', closeOrders);

document.getElementById('guestCheckoutForm').addEventListener('change', event => {
  if (!event.target.matches('[name="sameBilling"]')) return;
  document.getElementById('billingAddressWrap').hidden = event.target.checked;
});

document.getElementById('guestCheckoutForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  pendingGuestDetails = {
    name: form.elements.name.value.trim(),
    email: form.elements.email.value.trim().toLowerCase(),
    phone: form.elements.phone.value.trim(),
    shippingAddress: form.elements.shippingAddress.value.trim(),
    billingAddress: form.elements.sameBilling.checked ? form.elements.shippingAddress.value.trim() : form.elements.billingAddress.value.trim()
  };
  if (!pendingGuestDetails.billingAddress) return showToast('Billing address is required');
  closeGuestCheckout();
  continueOrderOnWhatsApp();
});

document.getElementById('resendProfileOtp').addEventListener('click', async () => {
  const form = document.getElementById('profileForm');
  try {
    await accountRequest({
      action: 'resend-phone-otp',
      customer,
      phone: form.elements.phone.value
    });
    showToast('OTP resent', 'success');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('profileForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    action: 'profile-update',
    customer,
    name: form.elements.name.value,
    phone: form.elements.phone.value,
    address: {
      line1: form.elements.line1.value,
      line2: form.elements.line2.value,
      city: form.elements.city.value,
      state: form.elements.state.value,
      pincode: form.elements.pincode.value
    }
  };

  try {
    const data = await accountRequest(payload);
    saveCustomer(data.customer);
    if (data.otpRequired) {
      document.getElementById('otpForm').hidden = false;
      showToast('OTP sent to your email', 'success');
    } else {
      showToast('Profile updated', 'success');
      closeProfile();
    }
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('otpForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const data = await accountRequest({
      action: 'verify-phone',
      customer,
      otp: event.currentTarget.elements.otp.value
    });
    saveCustomer(data.customer);
    fillProfileForm(data.customer);
    document.getElementById('otpForm').hidden = true;
    showToast('Mobile number verified', 'success');
    closeProfile();
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener('click', refreshCustomerSession);
document.addEventListener('keydown', refreshCustomerSession);
if (isCustomerSessionExpired()) {
  clearCart();
  clearCustomerSession();
}
renderCustomerMenu();
loadProducts();



