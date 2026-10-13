const express = require('express');
const { q } = require('../db');
const U = require('../lib/util');
const audit = require('../lib/audit');
const { requireAuth, requireRole, can } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function out(r) {
  return {
    id: String(r.id), service: r.service, rating: r.rating, comment: r.comment || '\u2014',
    ref: r.request_ref || null, submitted: U.manilaDateTime(r.submitted_at)
  };
}

/* Staff with the "evaluations" permission read every response (without who wrote it);
   a student only gets their own, which is what the "evaluate before booking again" rule needs. */
router.get('/', U.wrap(async function (req, res) {
  if (req.user.role === 'student') {
    const rows = await q('SELECT * FROM evaluations WHERE student_user_id = ? ORDER BY submitted_at DESC, id DESC', [req.user.id]);
    return res.json(rows.map(out));
  }
  if (!can(req.user, 'evaluations')) return res.status(403).json({ error: 'You do not have permission to view evaluations.' });
  const rows = await q('SELECT * FROM evaluations ORDER BY submitted_at DESC, id DESC');
  res.json(rows.map(out));
}));

/* Live satisfaction averages, computed by the database. Open to any signed-in user (it is only counts and averages, no names or comments). */
router.get('/stats', U.wrap(async function (req, res) {
  const per = await q('SELECT service, AVG(rating) AS avg, COUNT(*) AS count FROM evaluations GROUP BY service ORDER BY service');
  const all = (await q('SELECT AVG(rating) AS avg, COUNT(*) AS total FROM evaluations'))[0];
  res.json({
    perService: per.map(function (r) { return { service: r.service, avg: Number(r.avg), count: Number(r.count) }; }),
    overallAvg: all.total ? Number(all.avg) : 0,
    total: Number(all.total)
  });
}));

router.post('/', requireRole('student'), U.wrap(async function (req, res) {
  const f = req.body || {};
  const fail = function (m, s) { return res.status(s || 400).json({ ok: false, error: m }); };
  const service = U.clip(f.service, 120);
  const rating = Number(f.rating);
  if (!service || !Number.isInteger(rating) || rating < 1 || rating > 5) return fail('Choose a service and a rating from 1 to 5.');
  const comment = U.clip(f.comment, 2000) || '\u2014';

  let ref = null;
  if (f.ref) {
    const r = (await q('SELECT ref, status FROM requests WHERE ref = ? AND student_user_id = ?', [String(f.ref), req.user.id]))[0];
    if (!r) return fail("We couldn't find that request.", 404);
    if (r.status !== 'done') return fail('You can evaluate a request once it is completed.', 409);
    ref = r.ref;
  }
  try {
    await q('INSERT INTO evaluations (service, rating, comment, request_ref, student_user_id) VALUES (?,?,?,?,?)',
      [service, rating, comment, ref, req.user.id]);
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return fail('You have already evaluated that request.', 409);
    throw err;
  }
  await audit(req, 'evaluation_submitted', 'evaluation', ref || '-');
  res.json({ ok: true });
}));

module.exports = router;
