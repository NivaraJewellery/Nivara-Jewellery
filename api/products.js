const { getSql, send } = require('./_db');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    return send(response, 405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const products = await sql`
      select p.id, p.name, p.type, p.category, p.price, p.stock, p.description, p.code, p.care, p.image,
        c.id as collection_id, c.slug as collection_slug, c.name as collection_name
      from products p
      left join collections c on c.id = p.collection_id
      where p.active = true
      order by p.id
    `;

    return send(response, 200, { products });
  } catch (error) {
    return send(response, 500, { error: 'Unable to load products' });
  }
};
