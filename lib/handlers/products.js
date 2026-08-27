const { getSql, send } = require('./_db');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    return send(response, 405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    await sql`alter table products add column if not exists image_2 text`;
    await sql`alter table products add column if not exists image_3 text`;

    const products = await sql`
      select p.id, p.name, p.type, p.category, p.price, p.stock, p.description, p.code, p.care, p.image, p.image_2, p.image_3,
        c.id as collection_id, c.slug as collection_slug, c.name as collection_name
      from products p
      left join collections c on c.id = p.collection_id
      where p.active = true
      order by p.id
    `;

    return send(response, 200, { products });
  } catch (error) {
    return send(response, 500, { error: 'Unable to load products' });
.product-skeleton {
  pointer-events: none;
}

.product-skeleton .skeleton-image,
.product-skeleton .skeleton-line,
.product-skeleton .skeleton-button {
  background: linear-gradient(
    90deg,
    #f2eadf 25%,
    #fffaf2 50%,
    #f2eadf 75%
  );
  background-size: 200% 100%;
  animation: nivaraSkeleton 1.4s infinite;
}

.skeleton-image {
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  margin-bottom: 18px;
}

.skeleton-line {
  height: 13px;
  border-radius: 20px;
  margin: 10px 4px;
}

.skeleton-title {
  width: 72%;
  height: 17px;
}

.skeleton-short {
  width: 48%;
}

.skeleton-button {
  width: 145px;
  height: 48px;
  border-radius: 30px;
  margin: 28px auto 0;
}

@keyframes nivaraSkeleton {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
  }
};
