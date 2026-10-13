/* Student account approval (school-ID check). Needs the "accounts" permission. */
const express = require('express');
const { q, tx } = require('../db');
const U = require('../lib/util');
const audit = require('../lib/audit');
const { requirePermission } = require('../middleware/auth');
const { studentOut } = require('../lib/profiles');

const router = express.Router();
router.use(requirePermission('accounts'));

const SELECT =
  'SELECT u.id AS uid, u.email, s.*, rv.email AS reviewer_email ' +
  'FROM student_profiles s JOIN users u ON u.id = s.user_id LEFT JOIN users rv ON rv.id = s.reviewed_by ';

function accountOut(r) {
  const o = studentOut(r);
  o.status = r.approval_status;
  o.createdAt = U.millis(r.created_at);
  o.reviewedAt = r.reviewed_at ? U.millis(r.reviewed_at) : 0;
  o.reviewedBy = r.reviewer_email || '';
  o.rejectReason = r.reject_reason || '';
  return o;
}

router.get('/pending', U.wrap(async function (req, res) {
  const rows = await q(SELECT + "WHERE s.approval_status = 'pending' ORDER BY s.created_at ASC");
  res.json(rows.map(accountOut));
}));

router.get('/reviewed', U.wrap(async function (req, res) {
  const rows = await q(SELECT + 'WHERE s.reviewed_at IS NOT NULL ORDER BY s.reviewed_at DESC LIMIT 200');
  res.json(rows.map(accountOut));
}));

router.get('/:email/ids', U.wrap(async function (req, res) {
  const email = U.cleanEmail(req.params.email);
  const r = (await q('SELECT p.front, p.back FROM student_id_photos p JOIN users u ON u.id = p.user_id WHERE u.email = ?', [email]))[0];
  await audit(req, 'id_photos_viewed', 'student', email);
  res.set('Cache-Control', 'private, no-store');
  res.json(r ? { front: r.front, back: r.back } : { front: '', back: '' });
}));

/* body: { decision: "approved" | "rejected", reason? }  - the ID photos are deleted once decided. */
router.post('/:email/review', U.wrap(async function (req, res) {
  const email = U.cleanEmail(req.params.email);
  const decision = req.body && req.body.decision;
  if (decision !== 'approved' && decision !== 'rejected') return res.status(400).json({ ok: false, error: 'Unknown decision.' });
  const reason = decision === 'rejected' ? U.clip(req.body.reason, 500) : '';

  const done = await tx(async function (t) {
    const st = (await t.q(
      "SELECT s.user_id FROM student_profiles s JOIN users u ON u.id = s.user_id WHERE u.email = ? AND s.approval_status = 'pending'", [email]))[0];
    if (!st) return false;
    await t.q('UPDATE student_profiles SET approval_status = ?, reviewed_at = UTC_TIMESTAMP(), reviewed_by = ?, reject_reason = ? WHERE user_id = ?',
      [decision, req.user.id, reason, st.user_id]);
    await t.q('DELETE FROM student_id_photos WHERE user_id = ?', [st.user_id]);
    return true;
  });
  if (!done) return res.status(409).json({ ok: false, error: "That account isn't waiting for approval any more." });
  await audit(req, 'account_' + decision, 'student', email, reason);
  res.json({ ok: true });
}));

module.exports = router;
