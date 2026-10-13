const express = require('express');
const { q } = require('../db');
const U = require('../lib/util');
const audit = require('../lib/audit');
const { requireAuth, requirePermission, can } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function out(r) {
  return {
    id: String(r.id), lastName: r.last_name, firstName: r.first_name, middleInitial: r.middle_initial, suffix: r.suffix,
    program: r.program, year: r.year, days: r.days, timeFrom: r.time_from || '', timeTo: r.time_to || '',
    photo: r.photo || '', status: r.status
  };
}

/* Students (and staff without the "peers" permission) see only active peers; peer managers see everyone. */
router.get('/', U.wrap(async function (req, res) {
  const all = can(req.user, 'peers');
  const rows = await q('SELECT * FROM peers ' + (all ? '' : "WHERE status = 'active' ") + 'ORDER BY id DESC');
  res.json(rows.map(out));
}));

function readFields(f, partial) {
  const v = {}, err = [];
  const set = function (col, val) { v[col] = val; };
  if (!partial || f.lastName !== undefined)  set('last_name', U.clip(f.lastName, 80));
  if (!partial || f.firstName !== undefined) set('first_name', U.clip(f.firstName, 80));
  if (f.middleInitial !== undefined) set('middle_initial', U.clip(f.middleInitial, 5));
  if (f.suffix !== undefined)        set('suffix', U.clip(f.suffix, 20));
  if (f.program !== undefined)       set('program', U.clip(f.program, 200));
  if (f.year !== undefined)          set('year', U.clip(f.year, 30));
  if (f.days !== undefined)          set('days', U.clip(f.days, 80));
  ['timeFrom', 'timeTo'].forEach(function (k) {
    if (f[k] === undefined) return;
    const t = String(f[k] || '').trim();
    if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) err.push('Enter a valid time.');
    set(k === 'timeFrom' ? 'time_from' : 'time_to', t || null);
  });
  if (f.photo !== undefined) {
    if (f.photo && !U.isImageDataUrl(f.photo, 700000)) err.push('Choose a smaller JPG, PNG or WebP photo.');
    set('photo', f.photo || null);
  }
  if (f.status !== undefined) {
    if (f.status !== 'pending' && f.status !== 'active') err.push('Unknown status.');
    set('status', f.status);
  }
  if ((v.last_name === '' ) || (v.first_name === '')) err.push('Enter the peer\u2019s last and first name.');
  return { v: v, err: err[0] || '' };
}

router.post('/', requirePermission('peers'), U.wrap(async function (req, res) {
  const r = readFields(req.body || {}, false);
  if (r.err) return res.status(400).json({ ok: false, error: r.err });
  const cols = Object.keys(r.v);
  const res2 = await q('INSERT INTO peers (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')',
    cols.map(function (c) { return r.v[c]; }));
  await audit(req, 'peer_added', 'peer', res2.insertId);
  res.json({ ok: true, entry: out((await q('SELECT * FROM peers WHERE id = ?', [res2.insertId]))[0]) });
}));

router.patch('/:id', requirePermission('peers'), U.wrap(async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const r = readFields(req.body || {}, true);
  if (r.err) return res.status(400).json({ ok: false, error: r.err });
  const cols = Object.keys(r.v);
  if (!cols.length) return res.status(400).json({ ok: false, error: 'Nothing to change.' });
  const done = await q('UPDATE peers SET ' + cols.map(function (c) { return c + ' = ?'; }).join(', ') + ' WHERE id = ?',
    cols.map(function (c) { return r.v[c]; }).concat([id]));
  if (!done.affectedRows) return res.status(404).json({ ok: false, error: 'Peer not found.' });
  await audit(req, 'peer_updated', 'peer', id, cols.join(','));
  res.json({ ok: true, entry: out((await q('SELECT * FROM peers WHERE id = ?', [id]))[0]) });
}));

router.delete('/:id', requirePermission('peers'), U.wrap(async function (req, res) {
  const id = parseInt(req.params.id, 10);
  await q('DELETE FROM peers WHERE id = ?', [id]);
  await audit(req, 'peer_deleted', 'peer', id);
  res.json({ ok: true });
}));

module.exports = router;
