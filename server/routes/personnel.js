/* Personnel (staff) accounts and their section permissions. Admin only. */
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { q, tx } = require('../db');
const { PERMISSION_SECTIONS } = require('../lib/constants');
const U = require('../lib/util');
const audit = require('../lib/audit');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

function permsOut(list) {
  const p = {};
  PERMISSION_SECTIONS.forEach(function (s) { p[s] = list.indexOf(s) !== -1; });
  return p;
}

async function loadAll(onlyId) {
  const rows = await q(
    "SELECT u.id, u.email, u.is_active, COALESCE(sp.name, '') AS name FROM users u " +
    "LEFT JOIN staff_profiles sp ON sp.user_id = u.id WHERE u.role = 'personnel'" + (onlyId ? ' AND u.id = ?' : '') + ' ORDER BY u.id',
    onlyId ? [onlyId] : []);
  const perms = await q('SELECT user_id, section FROM personnel_permissions');
  return rows.map(function (r) {
    const mine = perms.filter(function (p) { return p.user_id === r.id; }).map(function (p) { return p.section; });
    return { id: String(r.id), name: r.name, email: r.email, status: r.is_active ? 'active' : 'disabled', permissions: permsOut(mine) };
  });
}

function wantedPermissions(input) {
  const out = [];
  PERMISSION_SECTIONS.forEach(function (s) { if (input && input[s] === true) out.push(s); });
  return out;
}

router.get('/', U.wrap(async function (req, res) { res.json(await loadAll()); }));

router.post('/', U.wrap(async function (req, res) {
  const f = req.body || {};
  const name = U.clip(f.name, 150), email = U.cleanEmail(f.email), password = String(f.password || '');
  const fail = function (m, s) { return res.status(s || 400).json({ ok: false, error: m }); };
  if (!name || !email || !password) return fail('Please fill in the last name, first name, email and a password.');
  if (!U.isEmail(email)) return fail('Enter a valid email address.');
  if (!U.passwordOk(password)) return fail(U.PASSWORD_MESSAGE);
  const perms = f.permissions ? wantedPermissions(f.permissions) : ['requests'];   // new personnel start with Requests only

  const hash = await bcrypt.hash(password, config.bcryptRounds);
  let id;
  try {
    id = await tx(async function (t) {
      const r = await t.q("INSERT INTO users (email, password_hash, role) VALUES (?,?, 'personnel')", [email, hash]);
      await t.q('INSERT INTO staff_profiles (user_id, name) VALUES (?,?)', [r.insertId, name]);
      for (const s of perms) await t.q('INSERT INTO personnel_permissions (user_id, section) VALUES (?,?)', [r.insertId, s]);
      return r.insertId;
    });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return fail("There's already an account with that email.", 409);
    throw err;
  }
  await audit(req, 'personnel_created', 'user', id, email);
  res.json({ ok: true, entry: (await loadAll(id))[0] });
}));

router.patch('/:id', U.wrap(async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const f = req.body || {};
  const fail = function (m, s) { return res.status(s || 400).json({ ok: false, error: m }); };
  const u = (await q("SELECT id FROM users WHERE id = ? AND role = 'personnel'", [id]))[0];
  if (!u) return fail('Account not found.', 404);

  let password = null;
  if (typeof f.password === 'string' && f.password !== '') {
    if (!U.passwordOk(f.password)) return fail(U.PASSWORD_MESSAGE);
    password = await bcrypt.hash(f.password, config.bcryptRounds);
  }
  if (f.status !== undefined && f.status !== 'active' && f.status !== 'disabled') return fail('Unknown status.');
  const name = f.name !== undefined ? U.clip(f.name, 150) : null;
  if (f.name !== undefined && !name) return fail('Enter a name.');

  await tx(async function (t) {
    if (name !== null) await t.q('INSERT INTO staff_profiles (user_id, name) VALUES (?,?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [id, name]);
    if (password) await t.q('UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_logins = 0, locked_until = NULL WHERE id = ?', [password, id]);
    if (f.status !== undefined) {
      await t.q('UPDATE users SET is_active = ?, token_version = token_version + 1 WHERE id = ?', [f.status === 'active' ? 1 : 0, id]);
    }
    if (f.permissions) {
      await t.q('DELETE FROM personnel_permissions WHERE user_id = ?', [id]);
      for (const s of wantedPermissions(f.permissions)) await t.q('INSERT INTO personnel_permissions (user_id, section) VALUES (?,?)', [id, s]);
    }
  });
  await audit(req, 'personnel_updated', 'user', id, Object.keys(f).filter(function (k) { return k !== 'password'; }).join(',') + (password ? ',password' : ''));
  res.json({ ok: true, entry: (await loadAll(id))[0] });
}));

router.delete('/:id', U.wrap(async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const r = await q("DELETE FROM users WHERE id = ? AND role = 'personnel'", [id]);
  if (!r.affectedRows) return res.status(404).json({ ok: false, error: 'Account not found.' });
  await audit(req, 'personnel_deleted', 'user', id);
  res.json({ ok: true });
}));

module.exports = router;
