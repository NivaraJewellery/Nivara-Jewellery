const params = new URLSearchParams(window.location.search);
const token = params.get('token') || '';
const productsNode = document.getElementById('reviewProducts');
const messageNode = document.getElementById('reviewMessage');
const introNode = document.getElementById('reviewIntro');

function showMessage(message, type = '') {
  messageNode.textContent = message;
  messageNode.className = `review-message ${type}`.trim();
}

function starsMarkup(productId, current = 0) {
  return `<div class="star-picker" role="radiogroup" aria-label="Rating">
    ${[5,4,3,2,1].map(value => `<input type="radio" id="star-${productId}-${value}" name="rating-${productId}" value="${value}" ${Number(current) === value ? 'checked' : ''}><label for="star-${productId}-${value}" title="${value} star${value === 1 ? '' : 's'}">★</label>`).join('')}
  </div>`;
}

async function submitReview(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const rating = Number(new FormData(form).get(`rating-${form.dataset.productId}`));
  if (!rating) return showMessage('Please choose a star rating.', 'error');

  button.disabled = true;
  button.textContent = 'Submitting...';
  try {
    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        productId: Number(form.dataset.productId),
        rating,
        reviewText: form.elements.reviewText.value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to submit review.');
    form.innerHTML = '<div class="review-thank-you">✓ Thank you. Your review has been submitted.</div>';
    showMessage('Thank you for sharing your experience.', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
    button.disabled = false;
    button.textContent = 'Submit review';
  }
}

async function loadReviewOrder() {
  if (!token) return showMessage('This review link is incomplete.', 'error');
  try {
    const response = await fetch(`/api/reviews?token=${encodeURIComponent(token)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load your order.');

    introNode.textContent = `${data.order.customerName ? `${data.order.customerName}, t` : 'T'}ell us what you think about the pieces from order ${data.order.orderNumber || ''}.`;
    productsNode.innerHTML = data.order.products.map(product => `
      <article class="review-product">
        ${product.image ? `<img src="${product.image}" alt="${product.name}">` : ''}
        <div class="review-product-body">
          <h2>${product.name}</h2>
          ${product.alreadyReviewed ? `
            <div class="already-reviewed"><strong>${'★'.repeat(Number(product.review?.rating || 0))}${'☆'.repeat(5 - Number(product.review?.rating || 0))}</strong><p>${product.review?.review_text || 'Review submitted.'}</p><small>Thank you — you already reviewed this product.</small></div>
          ` : `
            <form data-product-id="${product.id}">
              <label>Your rating</label>
              ${starsMarkup(product.id)}
              <label>Tell us about the product<textarea name="reviewText" maxlength="1200" rows="4" placeholder="Quality, finish, fit, packaging, or anything you loved..."></textarea></label>
              <button type="submit">Submit review</button>
            </form>
          `}
        </div>
      </article>
    `).join('');
    productsNode.querySelectorAll('form').forEach(form => form.addEventListener('submit', submitReview));
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

loadReviewOrder();
