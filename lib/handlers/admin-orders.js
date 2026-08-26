const crypto = require('crypto');
const { getSql, readJson, requireAdmin, send } = require('./_db');
const { sendEmail } = require('./_email');

function normalizeOrderItems(items) {
  const parsed = typeof items === 'string' ? JSON.parse(items) : items;
  if (Array.isArray(parsed)) return { customer: {}, products: parsed };
  return {
    customer: parsed?.customer || {},
    products: Array.isArray(parsed?.products) ? parsed.products : []
  };
}

function normalizeOrder(order) {
  const details = normalizeOrderItems(order.items);
  return {
    id: order.id,
    orderNumber: order.razorpay_order_id,
    paymentId: order.razorpay_payment_id,
    amount: order.amount,
    shippingCharge: Number(order.shipping_charge || 0),
    status: order.status || 'open',
    customerEmail: order.customer_email,
    createdAt: order.created_at,
    customer: details.customer,
    products: details.products,
    reviewEmailSentAt: order.review_email_sent_at || null
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function siteBaseUrl(request) {
  const configured = String(process.env.PUBLIC_SITE_URL || process.env.SITE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const forwardedProto = String(request.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || 'nivarajewellery.com').split(',')[0].trim();
  return `${forwardedProto}://${host}`;
}

function buildReviewEmail({ customerName, orderNumber, reviewUrl, products }) {
  const firstName = String(customerName || '').trim().split(/\s+/)[0] || 'there';
  const productNames = products.slice(0, 4).map(product => escapeHtml(product.name || `Product ${product.id}`)).join(', ');
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#2d241f;max-width:620px;margin:auto">
      <div style="text-align:center;padding:18px 0 26px;font-family:Georgia,serif;font-size:24px;letter-spacing:3px">NIVARA JEWELLERY</div>
      <div style="background:#fffaf3;border:1px solid #eadfce;border-radius:18px;padding:32px">
        <p style="margin:0 0 8px;color:#9b6a2f;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Delivered with love</p>
        <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.15;margin:0 0 18px">How did you like your jewellery?</h1>
        <p>Hi ${escapeHtml(firstName)},</p>
        <p>We hope your Nivara order <strong>${escapeHtml(orderNumber || '')}</strong> reached you beautifully.</p>
        ${productNames ? `<p><strong>Your pieces:</strong> ${productNames}</p>` : ''}
        <p>Your review helps us improve and helps other customers choose with confidence.</p>
        <p style="margin:28px 0"><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#5d351c;color:#fff;text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:700">Write a product review</a></p>
        <p style="font-size:12px;color:#74685f">This review link is connected to your delivered order and should not be shared.</p>
      </div>
    </div>`;
}

async function ensureOrderColumns(sql) {
  await sql`alter table orders add column if not exists status text not null default 'open'`;
  await sql`alter table orders add column if not exists updated_at timestamptz not null default now()`;
  await sql`alter table orders add column if not exists shipping_charge integer not null default 0`;
  await sql`alter table orders add column if not exists review_email_sent_at timestamptz`;
  await sql`
    create table if not exists order_review_tokens (
      id serial primary key,
      order_id integer not null unique references orders(id) on delete cascade,
      token_hash text not null unique,
      sent_at timestamptz,
      used_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists product_reviews (
      id serial primary key,
      order_id integer not null references orders(id) on delete cascade,
      product_id integer not null,
      product_name text not null default '',
      customer_name text not null default '',
      rating integer not null check (rating between 1 and 5),
      review_text text not null default '',
      approved boolean not null default true,
      created_at timestamptz not null default now(),
      unique (order_id, product_id)
    )
  `;
  await sql`create index if not exists idx_product_reviews_approved on product_reviews(approved, created_at desc)`;
}

async function sendDeliveredReviewEmail(sql, request, order) {
  if (order.review_email_sent_at) return { sent: false, reason: 'already-sent' };

  const details = normalizeOrderItems(order.items);
  const email = String(order.customer_email || details.customer?.email || '').trim();
  if (!email) return { sent: false, reason: 'missing-email' };

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await sql`
    insert into order_review_tokens (order_id, token_hash)
    values (${order.id}, ${tokenHash})
    on conflict (order_id) do update set token_hash = excluded.token_hash
  `;

  const reviewUrl = `${siteBaseUrl(request)}/review.html?token=${encodeURIComponent(token)}`;
  const emailResult = await sendEmail({
    to: email,
    subject: 'How did you like your Nivara jewellery?',
    html: buildReviewEmail({
      customerName: details.customer?.name || '',
      orderNumber: order.razorpay_order_id,
      reviewUrl,
      products: details.products
    })
  });

  if (emailResult?.skipped) return { sent: false, reason: 'email-not-configured' };

  await sql`update order_review_tokens set sent_at = now() where order_id = ${order.id}`;
  await sql`update orders set review_email_sent_at = now() where id = ${order.id}`;
  return { sent: true };
}

module.exports = async function handler(request, response) {
  if (!requireAdmin(request, response)) return;

  try {
    const sql = getSql();
    await ensureOrderColumns(sql);

    if (request.method === 'GET') {
      const orders = await sql`
        select id, razorpay_order_id, razorpay_payment_id, amount, shipping_charge, status, customer_email, items, created_at, review_email_sent_at
        from orders
        where razorpay_payment_id is not null
        order by created_at desc
        limit 200
      `;

      const reportRows = await sql`
        select
          count(*) filter (where razorpay_payment_id is not null)::int as total_orders,
          coalesce(sum(amount) filter (where razorpay_payment_id is not null), 0)::int as total_sales,
          count(*) filter (where razorpay_payment_id is not null and status = 'open')::int as open_orders,
          count(*) filter (where razorpay_payment_id is not null and status = 'in_progress')::int as in_progress_orders,
          count(*) filter (where razorpay_payment_id is not null and status = 'delivered')::int as delivered_orders
        from orders
      `;
      const normalizedOrders = orders.map(normalizeOrder);
      const itemsSold = normalizedOrders.reduce((total, order) => {
        if (!order.paymentId) return total;
        return total + order.products.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      }, 0);

      return send(response, 200, {
        orders: normalizedOrders,
        report: { ...reportRows[0], items_sold: itemsSold }
      });
    }

    if (request.method === 'PATCH') {
      const body = await readJson(request);
      const id = Number(body.id);
      const status = String(body.status || '').trim();
      const allowed = ['open', 'in_progress', 'delivered'];

      if (!id || !allowed.includes(status)) {
        return send(response, 400, { error: 'Valid order id and status are required' });
      }

      const currentRows = await sql`
        select id, razorpay_order_id, razorpay_payment_id, customer_email, items, status, review_email_sent_at
        from orders
        where id = ${id}
        limit 1
      `;
      if (!currentRows.length) return send(response, 404, { error: 'Order not found' });
      const current = currentRows[0];

      await sql`
        update orders
        set status = ${status}, updated_at = now()
        where id = ${id}
      `;

      let reviewEmail = { sent: false };
      if (status === 'delivered' && !current.review_email_sent_at && current.razorpay_payment_id) {
        try {
          reviewEmail = await sendDeliveredReviewEmail(sql, request, current);
        } catch (emailError) {
          reviewEmail = { sent: false, error: emailError.message || 'Unable to send review email' };
        }
      }

      return send(response, 200, { ok: true, reviewEmail });
    }

    if (request.method === 'DELETE') {
      await sql`delete from orders`;
      return send(response, 200, { ok: true });
    }

    return send(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to load orders' });
  }
};
