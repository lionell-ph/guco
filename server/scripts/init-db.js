/* Creates the database and every table:  npm run db:init
   Uses DB_ADMIN_USER / DB_ADMIN_PASSWORD (a MySQL account allowed to CREATE) when set, else DB_USER / DB_PASSWORD. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async function () {
  const env = process.env;
  const dbName = env.DB_NAME || 'guco';
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) { console.error('DB_NAME may only contain letters, numbers and underscores.'); process.exit(1); }

  let sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');
  sql = sql.replace(/CREATE DATABASE[\s\S]*?;/, '').replace(/^USE\s+\w+;/m, '');

  const conn = await mysql.createConnection({
    host: env.DB_HOST || '127.0.0.1',
    port: parseInt(env.DB_PORT || '3306', 10),
    user: env.DB_ADMIN_USER || env.DB_USER,
    password: env.DB_ADMIN_PASSWORD !== undefined ? env.DB_ADMIN_PASSWORD : (env.DB_PASSWORD || ''),
    multipleStatements: true
  });
  try {
    await conn.query('CREATE DATABASE IF NOT EXISTS `' + dbName + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await conn.query('USE `' + dbName + '`');
    await conn.query(sql);
    console.log('Database "' + dbName + '" is ready.');
  } finally {
    await conn.end();
  }
})().catch(function (e) { console.error('db:init failed: ' + e.message); process.exit(1); });
