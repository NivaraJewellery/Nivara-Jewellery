const postgres = require('postgres');

let sql;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!sql) {
    sql = postgres(process.env.DATABASE_URL, {
      ssl: 'require',
      max: 1
    });
  }

  return sql;
}

function send(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 2_000_000) request.destroy();
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function requireAdmin(request, response) {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const suppliedPassword = request.headers['x-admin-password'];

  if (!configuredPassword) {
    send(response, 500, { error: 'ADMIN_PASSWORD is not configured' });
    return false;
  }

  if (suppliedPassword !== configuredPassword) {
    send(response, 401, { error: 'Invalid admin password' });
    return false;
  }

  return true;
}

module.exports = {
  getSql,
  readJson,
  requireAdmin,
  send
};
