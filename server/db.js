const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true,          // DATE / DATETIME come back as plain strings (no timezone surprises)
  decimalNumbers: true,
  multipleStatements: false   // one statement per query: blocks stacked-query injection
});

// Every connection works in UTC, so CURRENT_TIMESTAMP / UTC_TIMESTAMP() agree everywhere.
pool.pool.on('connection', function (conn) { conn.query("SET time_zone = '+00:00'"); });

function clean(params) {
  return (params || []).map(function (p) { return p === undefined ? null : p; });
}

/* Run one parameterised statement. Returns rows for SELECT, or the result header
   (insertId, affectedRows) for INSERT / UPDATE / DELETE. */
async function q(sql, params) {
  const [rows] = await pool.execute(sql, clean(params));
  return rows;
}

/* Run several statements atomically: tx(async t => { await t.q(...); ... }) */
async function tx(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work({
      q: async function (sql, params) { const [rows] = await conn.execute(sql, clean(params)); return rows; }
    });
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, q, tx };
