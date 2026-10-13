/* Live sessions & replay hub, plus the evaluation QR codes attached to each session. */
const express = require('express');
const { q } = require('../db');
const U = require('../lib/util');
const audit = require('../lib/audit');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function sessionOut(r) {
  return { id: String(r.id), title: r.title, details: r.details, link: r.link, date: r.session_date, status: r.status };
}
function qrOut(r) {
  return {
    id: String(r.id), sessionId: String(r.session_id), type: r.qr_type, label: r.label, image: r.image, resultsLink: r.results_link,
    sessionTitle: r.title || '', sessionDate: r.session_date || '', saved: U.manilaDate(r.created_at)
  };
}

/* ---------- sessions ---------- */
router.get('/', U.wrap(async function (req, res) {
  res.json((await q('SELECT * FROM live_sessions ORDER BY created_at DESC, id DESC')).map(sessionOut));
}));

router.post('/', requirePermission('live'), U.wrap(async function (req, res) {
  const f = req.body || {};
  const title = U.clip(f.title, 200), details = U.clip(f.details, 5000);
  const link = U.safeLink(f.link || '#', true);
  if (!title || !details) return res.status(400).json({ ok: false, error: 'Add a title and details.' });
  if (link === null) return res.status(400).json({ ok: false, error: 'The link must start with https:// or http://.' });
  const date = U.clip(f.date, 60);
  const r = await q('INSERT INTO live_sessions (title, details, link, session_date, created_by) VALUES (?,?,?,?,?)',
    [title, details, link || '#', date, req.user.id]);
  await audit(req, 'live_added', 'live_session', r.insertId, title);
  res.json({ ok: true, entry: sessionOut((await q('SELECT * FROM live_sessions WHERE id = ?', [r.insertId]))[0]) });
}));

router.patch('/:id/status', requirePermission('live'), U.wrap(async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const status = req.body && req.body.status;
  if (status !== 'scheduled' && status !== 'done') return res.status(400).json({ ok: false, error: 'Unknown status.' });
  const r = await q('UPDATE live_sessions SET status = ? WHERE id = ?', [status, id]);
  if (!r.affectedRows) return res.status(404).json({ ok: false, error: 'Session not found.' });
  res.json({ ok: true });
}));

router.delete('/:id', requirePermission('live'), U.wrap(async function (req, res) {
  const id = parseInt(req.params.id, 10);
  await q('DELETE FROM live_sessions WHERE id = ?', [id]);      // its QR codes go with it (ON DELETE CASCADE)
  await audit(req, 'live_deleted', 'live_session', id);
  res.json({ ok: true });
}));

/* ---------- evaluation QR codes ---------- */
router.get('/qrs', U.wrap(async function (req, res) {
  const rows = await q('SELECT e.*, s.title, s.session_date FROM eval_qrs e JOIN live_sessions s ON s.id = e.session_id ORDER BY e.created_at DESC, e.id DESC');
  res.json(rows.map(qrOut));
}));

router.post('/qrs', requirePermission('live'), U.wrap(async function (req, res) {
  const f = req.body || {};
  const sessionId = parseInt(f.sessionId, 10);
  if (!(await q('SELECT id FROM live_sessions WHERE id = ?', [sessionId])).length) return res.status(404).json({ ok: false, error: 'Session not found.' });
  if (!U.isImageDataUrl(f.image, 2500000)) return res.status(400).json({ ok: false, error: 'Attach a PNG, JPG or WebP image of the QR code.' });
  const results = U.safeLink(f.resultsLink, false);
  if (results === null) return res.status(400).json({ ok: false, error: 'The results link must start with https:// or http://.' });
  const r = await q('INSERT INTO eval_qrs (session_id, qr_type, label, image, results_link) VALUES (?,?,?,?,?)',
    [sessionId, U.clip(f.type, 30), U.clip(f.label, 200), f.image, results]);
  res.json({ ok: true, id: String(r.insertId) });
}));

router.patch('/qrs/:id', requirePermission('live'), U.wrap(async function (req, res) {
  const r = await q('UPDATE eval_qrs SET label = ? WHERE id = ?', [U.clip(req.body && req.body.label, 200), parseInt(req.params.id, 10)]);
  res.json({ ok: !!r.affectedRows });
}));

router.delete('/qrs/:id', requirePermission('live'), U.wrap(async function (req, res) {
  await q('DELETE FROM eval_qrs WHERE id = ?', [parseInt(req.params.id, 10)]);
  res.json({ ok: true });
}));

module.exports = router;
