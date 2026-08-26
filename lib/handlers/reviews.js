const crypto = require('crypto');
const { getSql, readJson, send } = require('./_db');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function normalizeItems(items) {
  const parsed = typeof items === 'string' ? JSON.parse(items) : items;
  if (Array.isArray(parsed)) return { customer: {}, products: parsed };
  return {
    customer: parsed?.customer || {},
    products: Array.isArray(parsed?.products) ? parsed.products : []
  };
}

module.exports = async function handler(request, response) {
  try {
    const sql = getSql();
    if (request.method === 'GET') {
      let token = String(request.query?.token || '').trim();
      if (!token) {
        try { token = String(new URL(request.url || '/', 'https://nivarajewellery.com').searchParams.get('token') || '').trim(); } catch (_) {}
      }

      if (!token) {
        const reviews = await sql`
          select id, product_id, product_name, customer_name, rating, review_text, created_at
          from product_reviews
          where approved = true
          order by created_at desc
          limit 12
        `;
        response.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return send(response, 200, { reviews });
      }

      const rows = await sql`
        select o.id, o.razorpay_order_id, o.items, o.customer_email, o.status
        from order_review_tokens t
        join orders o on o.id = t.order_id
        where t.token_hash = ${hashToken(token)}
        limit 1
      `;
      if (!rows.length) return send(response, 404, { error: 'This review link is invalid or has expired.' });

      const order = rows[0];
      if (order.status !== 'delivered') return send(response, 400, { error: 'Reviews are available after delivery.' });
      const details = normalizeItems(order.items);
      const existing = await sql`
        select product_id, rating, review_text
        from product_reviews
        where order_id = ${order.id}
      `;
      const existingByProduct = new Map(existing.map(review => [Number(review.product_id), review]));

      return send(response, 200, {
        order: {
          orderId: order.id,
          orderNumber: order.razorpay_order_id,
          customerName: details.customer?.name || '',
          products: details.products.map(product => ({
            id: Number(product.id),
            name: product.name || `Product ${product.id}`,
            image: product.image || '',
            alreadyReviewed: existingByProduct.has(Number(product.id)),
            review: existingByProduct.get(Number(product.id)) || null
          }))
        }
      });
    }

    if (request.method === 'POST') {
      const body = await readJson(request);
      const token = String(body.token || '').trim();
      const productId = Number(body.productId);
      const rating = Number(body.rating);
      const reviewText = String(body.reviewText || '').trim().slice(0, 1200);

      if (!token || !productId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        return send(response, 400, { error: 'A valid product, rating, and review link are required.' });
      }

      const rows = await sql`
        select o.id, o.items, o.status
        from order_review_tokens t
        join orders o on o.id = t.order_id
        where t.token_hash = ${hashToken(token)}
        limit 1
      `;
      if (!rows.length) return send(response, 404, { error: 'This review link is invalid or has expired.' });
      const order = rows[0];
      if (order.status !== 'delivered') return send(response, 400, { error: 'Reviews are available after delivery.' });

      const details = normalizeItems(order.items);
      const product = details.products.find(item => Number(item.id) === productId);
      if (!product) return send(response, 400, { error: 'That product is not part of this order.' });

      const customerName = String(details.customer?.name || 'Nivara customer').trim().slice(0, 120);

      const inserted = await sql`
        insert into product_reviews (order_id, product_id, product_name, customer_name, rating, review_text, approved)
        values (${order.id}, ${productId}, ${product.name || `Product ${productId}`}, ${customerName}, ${rating}, ${reviewText}, true)
        on conflict (order_id, product_id) do nothing
        returning id
      `;
      if (!inserted.length) return send(response, 409, { error: 'You have already reviewed this product for this order.' });

      await sql`
        update order_review_tokens
        set used_at = now()
        where order_id = ${order.id}
      `;

      return send(response, 200, { ok: true });
    }

    return send(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to process review' });
  }
};
