const crypto = require('crypto');
const express = require('express');
const { q, tx } = require('../db');
const { REQUEST_TYPES, REQUEST_STATUSES, YEAR_LEVELS } = require('../lib/constants');
const U = require('../lib/util');
const audit = require('../lib/audit');
const { requireAuth, requireRole, requirePermission, can } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const COLUMNS =
  'r.*, e.filename AS ev_filename, e.uploaded_at AS ev_uploaded_at ' +
  'FROM requests r LEFT JOIN request_evidence e ON e.request_id = r.id ';

function out(r, withEvidence) {
  const meta = REQUEST_TYPES[r.type];
  const fullName = r.last_name + ', ' + r.first_name +
    (r.middle_name && r.middle_name !== 'N/A' ? ' ' + r.middle_name : '') +
    (r.suffix && r.suffix !== 'N/A' ? ' ' + r.suffix : '');
  const o = {
    ref: r.ref, type: r.type, label: meta ? meta.label : r.type, group: r.req_group,
    name: fullName, lastName: r.last_name, firstName: r.first_name, middleName: r.middle_name, suffix: r.suffix,
    studentId: r.student_id, accountEmail: r.account_email,
    program: r.program, major: r.major, yearLevel: r.year_level, contact: r.contact,
    preferred: r.preferred_date || '\u2014', notes: r.notes || '\u2014', status: r.status,
    submitted: U.manilaDateTime(r.submitted_at)
  };
  if (withEvidence && r.ev_filename) {
    o.evidence = { filename: r.ev_filename, uploadedAt: U.manilaDateTime(r.ev_uploaded_at), url: '/api/requests/' + encodeURIComponent(r.ref) + '/evidence' };
  }
  return o;
}

/* ---------- list: staff with the "requests" permission see all; a student sees only their own ---------- */
router.get('/', U.wrap(async function (req, res) {
  if (req.user.role === 'student') {
    const rows = await q('SELECT ' + COLUMNS + 'WHERE r.student_user_id = ? ORDER BY r.submitted_at DESC, r.id DESC', [req.user.id]);
    return res.json(rows.map(function (r) { return out(r, false); }));
  }
  if (!can(req.user, 'requests')) return res.status(403).json({ error: 'You do not have permission to view requests.' });
  const rows = await q('SELECT ' + COLUMNS + 'ORDER BY r.submitted_at DESC, r.id DESC');
  res.json(rows.map(function (r) { return out(r, true); }));
}));

/* ---------- is today / this date open for booking? (weekends, holidays and past dates are closed) ---------- */
async function closedReason(iso) {
  if (iso < U.todayManila()) return 'that date has already passed';
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay();
  const md = iso.slice(5);
  const h = (await q('SELECT name FROM holidays WHERE holiday_date = ? OR (is_yearly = 1 AND DATE_FORMAT(holiday_date, \'%m-%d\') = ?) LIMIT 1', [iso, md]))[0];
  if (h) return h.name;
  if (dow === 0 || dow === 6) return 'Weekend';
  return '';
}

function newRef(type) {
  return REQUEST_TYPES[type].code + '-' + U.todayManila().replace(/-/g, '') + '-' + (1000 + crypto.randomInt(9000));
}

/* ---------- a student submits a request ---------- */
router.post('/', requireRole('student'), U.wrap(async function (req, res) {
  const f = req.body || {};
  const fail = function (m, s) { return res.status(s || 400).json({ ok: false, error: m }); };
  const meta = REQUEST_TYPES[f.type];
  if (!meta) return fail('Unknown request type.');

  const prof = (await q('SELECT s.*, u.email FROM student_profiles s JOIN users u ON u.id = s.user_id WHERE s.user_id = ?', [req.user.id]))[0];
  if (!prof) return fail("We couldn't find your account.");

  const program = U.clip(f.program, 200), major = U.clip(f.major, 200) || 'N/A', yearLevel = U.clip(f.yearLevel, 20), contact = U.clip(f.contact, 60);
  if (!program || !yearLevel || !contact) return fail('Please fill in all required fields.');
  if (YEAR_LEVELS.indexOf(yearLevel) === -1) return fail('Choose your year level.');

  let preferred = null;
  if (f.preferred && f.preferred !== '\u2014') {
    if (!U.isIsoDate(f.preferred)) return fail('Choose a valid preferred date.');
    const why = await closedReason(f.preferred);
    if (why) return fail('That preferred date is no longer available (' + why + '). Please choose another date.');
    preferred = f.preferred;
  }
  let notes = U.clip(f.notes, 2000) || '\u2014';

  // One open session at a time, and finished requests must be evaluated before booking another of the same kind.
  if (meta.group === 'session') {
    const open = await q("SELECT ref FROM requests WHERE student_user_id = ? AND req_group = 'session' AND status <> 'done' LIMIT 1", [req.user.id]);
    if (open.length) return fail("You already have a session request that isn't completed yet. You can request another once it is completed.", 409);
  }
  const unrated = await q(
    "SELECT r.ref FROM requests r LEFT JOIN evaluations ev ON ev.request_ref = r.ref " +
    "WHERE r.student_user_id = ? AND r.req_group = ? AND r.status = 'done' AND ev.id IS NULL LIMIT 1", [req.user.id, meta.group]);
  if (unrated.length) return fail('Please evaluate your completed request (' + unrated[0].ref + ') before submitting a new one.', 409);

  // The name, student ID and account link come from the verified account, never from the browser.
  let ref = '', saved = false;
  for (let attempt = 0; attempt < 8 && !saved; attempt++) {
    ref = newRef(f.type);
    try {
      await q(
        'INSERT INTO requests (ref, type, req_group, student_user_id, account_email, student_id, last_name, first_name, middle_name, suffix, ' +
        'program, major, year_level, contact, preferred_date, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [ref, f.type, meta.group, req.user.id, prof.email, prof.student_id, prof.last_name, prof.first_name,
         prof.middle_name || 'N/A', prof.suffix || 'N/A', program, major, yearLevel, contact, preferred, notes]);
      saved = true;
    } catch (err) {
      if (!(err && err.code === 'ER_DUP_ENTRY')) throw err;   // reference collided: draw another number
    }
  }
  if (!saved) return fail('Could not create a reference number. Please try again.', 500);

  await audit(req, 'request_submitted', 'request', ref, f.type);
  const row = (await q('SELECT ' + COLUMNS + 'WHERE r.ref = ?', [ref]))[0];
  res.json({ ok: true, entry: out(row, false) });
}));

/* ---------- staff: change a request's status ---------- */
router.patch('/:ref/status', requirePermission('requests'), U.wrap(async function (req, res) {
  const status = req.body && req.body.status;
  if (REQUEST_STATUSES.indexOf(status) === -1) return res.status(400).json({ ok: false, error: 'Unknown status.' });
  const row = (await q('SELECT ' + COLUMNS + 'WHERE r.ref = ?', [req.params.ref]))[0];
  if (!row) return res.status(404).json({ ok: false, error: 'Request not found.' });

  // A counseling / peer session needs proof it happened before it can be marked Completed.
  const kind = REQUEST_TYPES[row.type].evidence;
  if (status === 'done' && kind && !row.ev_filename) {
    return res.status(409).json({ ok: false, error: 'Upload proof of the session before marking it Completed.' });
  }
  await q('UPDATE requests SET status = ?, completed_at = ?, handled_by = ? WHERE id = ?',
    [status, status === 'done' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null, req.user.id, row.id]);
  await audit(req, 'request_status', 'request', row.ref, row.status + ' -> ' + status);
  const fresh = (await q('SELECT ' + COLUMNS + 'WHERE r.ref = ?', [row.ref]))[0];
  res.json({ ok: true, entry: out(fresh, true) });
}));

/* ---------- staff: complete a session request with its proof image ---------- */
router.post('/:ref/complete', requirePermission('requests'), U.wrap(async function (req, res) {
  const row = (await q('SELECT id, ref, type FROM requests WHERE ref = ?', [req.params.ref]))[0];
  if (!row) return res.status(404).json({ ok: false, error: 'Request not found.' });
  if (!REQUEST_TYPES[row.type].evidence) return res.status(400).json({ ok: false, error: 'This request type does not need proof.' });
  const dataUrl = req.body && req.body.dataUrl;
  if (!U.isImageDataUrl(dataUrl, 4000000)) return res.status(400).json({ ok: false, error: 'Attach a JPG, PNG or WebP image under about 3 MB.' });
  const filename = U.clip(req.body.filename, 255) || 'evidence';

  await tx(async function (t) {
    await t.q('INSERT INTO request_evidence (request_id, filename, image, uploaded_by) VALUES (?,?,?,?) ' +
              'ON DUPLICATE KEY UPDATE filename = VALUES(filename), image = VALUES(image), uploaded_by = VALUES(uploaded_by), uploaded_at = UTC_TIMESTAMP()',
      [row.id, filename, dataUrl, req.user.id]);
    await t.q("UPDATE requests SET status = 'done', completed_at = UTC_TIMESTAMP(), handled_by = ? WHERE id = ?", [req.user.id, row.id]);
  });
  await audit(req, 'request_completed', 'request', row.ref);
  const fresh = (await q('SELECT ' + COLUMNS + 'WHERE r.ref = ?', [row.ref]))[0];
  res.json({ ok: true, entry: out(fresh, true) });
}));

/* ---------- staff: view the proof image ---------- */
router.get('/:ref/evidence', requirePermission('requests'), U.wrap(async function (req, res) {
  const r = (await q('SELECT e.image FROM request_evidence e JOIN requests r ON r.id = e.request_id WHERE r.ref = ?', [req.params.ref]))[0];
  if (!r) return res.status(404).end();
  const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(r.image);
  if (!m) return res.status(404).end();
  res.set({ 'Content-Type': m[1], 'Cache-Control': 'private, no-store' });
  res.send(Buffer.from(m[2], 'base64'));
}));

module.exports = router;
