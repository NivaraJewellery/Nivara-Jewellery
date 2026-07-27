const { getSql, readJson, requireAdmin, send } = require('./_db');

function normalizeProduct(body) {
  return {
    name: String(body.name || '').trim(),
    category: String(body.category || 'Necklace').trim(),
    type: String(body.type || body.category || 'necklace').trim().toLowerCase(),
    price: Math.max(0, Number(body.price) || 0),
    stock: Math.max(0, Number(body.stock) || 0),
    description: String(body.description || '').trim(),
    code: String(body.code || '').trim(),
    care: String(body.care || '').trim(),
    image: String(body.image || '').trim(),
    collectionId: Number(body.collection_id) || null
  };
}

module.exports = async function handler(request, response) {
  if (!requireAdmin(request, response)) return;

  try {
    const sql = getSql();

    if (request.method === 'GET') {
      const products = await sql`
        select id, name, type, category, price, stock, description, code, care, image, collection_id, active
        from products
        where active = true
        order by id
      `;
      return send(response, 200, { products });
    }

    if (request.method === 'POST') {
      const body = await readJson(request);
      const product = normalizeProduct(body);

      if (!product.name) {
        return send(response, 400, { error: 'Product name is required' });
      }

      if (!product.image) {
        return send(response, 400, { error: 'Product image path is required' });
      }

      const created = await sql`
        insert into products (name, category, type, price, stock, description, code, care, image, collection_id, active)
        values (${product.name}, ${product.category}, ${product.type}, ${product.price}, ${product.stock}, ${product.description}, ${product.code}, ${product.care}, ${product.image}, ${product.collectionId}, true)
        returning id, name, type, category, price, stock, description, code, care, image, collection_id, active
      `;

      return send(response, 201, { product: created[0] });
    }

    if (request.method === 'PATCH') {
      const body = await readJson(request);
      if (Array.isArray(body.products)) {
        let updatedCount = 0;

        for (const row of body.products) {
          const id = Number(row.id);
          const code = String(row.code || '').trim();
          const hasStock = Object.prototype.hasOwnProperty.call(row, 'stock') && Number.isFinite(Number(row.stock));
          const hasPrice = Object.prototype.hasOwnProperty.call(row, 'price') && Number.isFinite(Number(row.price));
          const hasImage = Boolean(String(row.image || '').trim());
          const hasCategory = Boolean(String(row.category || '').trim());
          const hasCollection = Object.prototype.hasOwnProperty.call(row, 'collection_id');
          const stock = Math.max(0, Number(row.stock) || 0);
          const price = Math.max(0, Number(row.price) || 0);
          const image = String(row.image || '').trim();
          const category = String(row.category || '').trim();
          const type = String(row.type || category || '').trim().toLowerCase();
          const collectionId = Number(row.collection_id) || null;

          if (!id && !code) continue;

          const updated = await sql`
            update products
            set stock = ${hasStock ? stock : sql`stock`},
                price = ${hasPrice ? price : sql`price`},
                image = ${hasImage ? image : sql`image`},
                category = ${hasCategory ? category : sql`category`},
                type = ${hasCategory ? type : sql`type`},
                collection_id = ${hasCollection ? collectionId : sql`collection_id`},
                updated_at = now()
            where active = true and (${id ? sql`id = ${id}` : sql`false`} or ${code ? sql`code = ${code}` : sql`false`})
            returning id
          `;
          updatedCount += updated.length;
        }

        return send(response, 200, { updated: updatedCount });
      }

      const id = Number(body.id);
      const hasStock = Object.prototype.hasOwnProperty.call(body, 'stock');
      const hasPrice = Object.prototype.hasOwnProperty.call(body, 'price');
      const hasImage = Object.prototype.hasOwnProperty.call(body, 'image');
      const hasCategory = Object.prototype.hasOwnProperty.call(body, 'category');
      const hasCollection = Object.prototype.hasOwnProperty.call(body, 'collection_id');
      const stock = Math.max(0, Number(body.stock) || 0);
      const price = Math.max(0, Number(body.price) || 0);
      const image = String(body.image || '').trim();
      const category = String(body.category || '').trim();
      const type = String(body.type || category || '').trim().toLowerCase();
      const collectionId = Number(body.collection_id) || null;

      if (!id) {
        return send(response, 400, { error: 'Product id is required' });
      }

      const updated = await sql`
        update products
        set stock = ${hasStock ? stock : sql`stock`},
            price = ${hasPrice ? price : sql`price`},
            image = ${hasImage ? image : sql`image`},
            category = ${hasCategory ? category : sql`category`},
            type = ${hasCategory ? type : sql`type`},
            collection_id = ${hasCollection ? collectionId : sql`collection_id`},
            updated_at = now()
        where id = ${id}
        returning id, name, type, category, price, stock, description, code, care, image, collection_id, active
      `;

      if (!updated.length) {
        return send(response, 404, { error: 'Product not found' });
      }

      return send(response, 200, { product: updated[0] });
    }

    if (request.method === 'DELETE') {
      const body = await readJson(request);
      const id = Number(body.id);

      if (!id) {
        return send(response, 400, { error: 'Product id is required' });
      }

      await sql`
        update products
        set active = false, updated_at = now()
        where id = ${id}
      `;

      return send(response, 200, { ok: true });
    }

    return send(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to update products' });
  }
};
