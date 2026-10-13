const express = require('express');
const { q } = require('../db');
const U = require('../lib/util');
const audit = require('../lib/audit');
const { requireAuth } = require('../middleware/auth');
const { validateAcademic, profileFor } = require('../lib/profiles');

const router = express.Router();
router.use(requireAuth);

/* ---------- my details ---------- */
router.put('/', U.wrap(async function (req, res) {
  const f = req.body || {};
  const user = req.user;
  const fail = function (msg) { return res.status(400).json({ ok: false, error: msg }); };

  if (user.role === 'student') {
    const cur = (await q('SELECT * FROM student_profiles WHERE user_id = ?', [user.id]))[0];
    if (!cur) return fail("We couldn't find your account.");
    // Name, student ID, middle name and suffix match the ID card staff approved: only GUCO can change them.
    if (!f.gender) return fail('Please select a gender.');
    const contact = U.cleanMobile(f.contact);
    if (!contact) return fail('Enter a valid mobile number, like 09123456789.');
    const program = U.clip(f.program, 200), major = U.clip(f.major, 200), yearLevel = U.clip(f.yearLevel, 20);
    const err = await validateAcademic(program, major, yearLevel);
    if (err) return fail(err);
    await q('UPDATE student_profiles SET gender = ?, contact = ?, program = ?, major = ?, year_level = ? WHERE user_id = ?',
      [U.clip(f.gender, 30), contact, program, major || 'N/A', yearLevel, user.id]);
    return res.json({ ok: true });
  }

  const name = U.clip(f.name, 150);
  if (!name) return fail('Enter your name.');
  await q('INSERT INTO staff_profiles (user_id, name) VALUES (?,?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [user.id, name]);
  res.json({ ok: true });
}));

/* ---------- profile picture ---------- */
router.get('/avatar', U.wrap(async function (req, res) {
  const r = (await q('SELECT image FROM user_avatars WHERE user_id = ?', [req.user.id]))[0];
  res.json({ image: r ? r.image : null });
}));

router.put('/avatar', U.wrap(async function (req, res) {
  const image = req.body && req.body.image;
  if (!U.isImageDataUrl(image, 700000)) return res.status(400).json({ ok: false, error: 'Choose a smaller JPG, PNG or WebP photo.' });
  await q('INSERT INTO user_avatars (user_id, image) VALUES (?,?) ON DUPLICATE KEY UPDATE image = VALUES(image)', [req.user.id, image]);
  res.json({ ok: true });
}));

router.delete('/avatar', U.wrap(async function (req, res) {
  await q('DELETE FROM user_avatars WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
}));

module.exports = router;
