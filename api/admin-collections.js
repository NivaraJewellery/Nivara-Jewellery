const { getSql, readJson, requireAdmin, send } = require('./_db');

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeCollection(body) {
  return {
    id: Number(body.id) || 0,
    name: String(body.name || '').trim(),
    icon: String(body.icon || '◇').trim()
  };
}

module.exports = async function handler(request, response) {
  if (!requireAdmin(request, response)) return;

  try {
    const sql = getSql();

    if (request.method === 'GET') {
      const collections = await sql`
        select id, name, slug, icon, active
        from collections
        order by id
      `;
      return send(response, 200, { collections });
    }

    if (request.method === 'POST') {
      const collection = normalizeCollection(await readJson(request));

      if (!collection.name) return send(response, 400, { error: 'Collection name is required' });

      const created = await sql`
        insert into collections (name, slug, icon, active)
        values (${collection.name}, ${slugify(collection.name)}, ${collection.icon}, true)
        on conflict (slug) do update set active = true, name = excluded.name, icon = excluded.icon
        returning id, name, slug, icon, active
      `;

      return send(response, 201, { collection: created[0] });
    }

    if (request.method === 'PATCH') {
      const collection = normalizeCollection(await readJson(request));

      if (!collection.id || !collection.name) {
        return send(response, 400, { error: 'Collection id and name are required' });
      }

      const updated = await sql`
        update collections
        set name = ${collection.name},
            slug = ${slugify(collection.name)},
            icon = ${collection.icon},
            active = true
        where id = ${collection.id}
        returning id, name, slug, icon, active
      `;

      if (!updated.length) return send(response, 404, { error: 'Collection not found' });
      return send(response, 200, { collection: updated[0] });
    }

    return send(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to update collections' });
  }
};
