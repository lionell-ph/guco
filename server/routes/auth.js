const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { q, tx } = require('../db');
const audit = require('../lib/audit');
const { sendMail } = require('../lib/mailer');
const { YEAR_LEVELS, EMAIL_DOMAIN } = require('../lib/constants');
const U = require('../lib/util');
const { issueSession, clearSession, requireAuth } = require('../middleware/auth');
const { profileFor, validateAcademic } = require('../lib/profiles');

const router = express.Router();
const wrap = U.wrap;

// Compared against when the email is unknown, so "no such user" and "wrong password" take equally long.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.bcryptRounds);

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' } });
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-up attempts. Please try again later.' } });
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { ok: true } });

/* ---------- who am I? (always 200, so "signed out" is not an error) ---------- */
router.get('/me', wrap(async function (req, res) {
  if (!req.user) return res.json({ session: null });
  res.json({
    session: { email: req.user.email, role: req.user.role },
    permissions: req.user.permissions,
    profile: await profileFor(req.user)
  });
}));

/* ---------- sign in ---------- */
router.post('/login', loginLimiter, wrap(async function (req, res) {
  const email = U.cleanEmail(req.body && req.body.email);
  const password = String((req.body && req.body.password) || '');
  const bad = function () { return res.status(401).json({ error: 'Incorrect email or password.' }); };
  if (!email || !password || password.length > 200) return bad();

  const rows = await q(
    'SELECT u.*, sp.approval_status, sp.reject_reason FROM users u ' +
    'LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.email = ?', [email]);
  const u = rows[0];

  if (u && u.locked_until && U.toDate(u.locked_until) > new Date()) {
    return res.status(429).json({ error: 'Too many failed attempts. Please wait ' + config.login.lockMinutes + ' minutes and try again.' });
  }

  const match = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !u.is_active || !match) {
    if (u && u.is_active) {
      await q('UPDATE users SET locked_until = IF(failed_logins + 1 >= ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), locked_until), ' +
              'failed_logins = IF(failed_logins + 1 >= ?, 0, failed_logins + 1) WHERE id = ?',
        [config.login.maxFailures, config.login.lockMinutes, config.login.maxFailures, u.id]);
    }
    await audit(req, 'login_failed', 'user', u ? u.id : null, email, u ? u.id : null);
    return bad();
  }

  // Correct password. A student whose ID has not been approved gets an explanation, not a session.
  if (u.role === 'student' && u.approval_status === 'pending') return res.json({ blocked: 'pending' });
  if (u.role === 'student' && u.approval_status === 'rejected') return res.json({ blocked: 'rejected', reason: u.reject_reason || '' });

  await q('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?', [u.id]);
  issueSession(res, u);
  await audit(req, 'login', 'user', u.id, null, u.id);
  res.json({ email: u.email, role: u.role });
}));

router.post('/logout', function (req, res) {
  clearSession(res);
  res.json({ ok: true });
});

/* ---------- student sign-up (account starts as "pending" until staff verify the ID) ---------- */
router.post('/signup', signupLimiter, wrap(async function (req, res) {
  const f = req.body || {};
  const email = U.cleanEmail(f.email);
  const fail = function (msg, status) { return res.status(status || 400).json({ ok: false, error: msg }); };

  const lastName = U.clip(f.lastName, 80), firstName = U.clip(f.firstName, 80);
  if (!lastName || !firstName) return fail('Enter your last and first name.');
  const gender = U.clip(f.gender, 30);
  if (!gender) return fail('Please select a gender.');
  const studentId = U.clip(f.studentId, 8);
  if (!U.isStudentId(studentId)) return fail('Enter your student ID in this format: 21-00000.');
  if (!U.isBpsuEmail(email) || !U.isEmail(email)) return fail('Use your BPSU email address (name@bpsu.edu.ph).');
  const contact = U.cleanMobile(f.contact);
  if (!contact) return fail('Enter a valid mobile number, like 09123456789.');
  const program = U.clip(f.program, 200), major = U.clip(f.major, 200), yearLevel = U.clip(f.yearLevel, 20);
  const acadErr = await validateAcademic(program, major, yearLevel);
  if (acadErr) return fail(acadErr);
  if (!U.passwordOk(f.password)) return fail(U.PASSWORD_MESSAGE);
  if (!U.isImageDataUrl(f.idFront, 2500000) || !U.isImageDataUrl(f.idBack, 2500000)) {
    return fail('Attach a photo of the front and the back of your school ID.');
  }

  const middleName = U.clip(f.middleName, 80), suffix = U.clip(f.suffix, 20);
  const hash = await bcrypt.hash(String(f.password), config.bcryptRounds);

  try {
    await tx(async function (t) {
      const existing = (await t.q(
        'SELECT u.id, u.role, sp.approval_status FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.email = ?',
        [email]))[0];

      if (existing && existing.role !== 'student') throw U.httpError(409, 'This email is registered to office staff. Contact GUCO if this is a mistake.');
      if (existing && existing.approval_status === 'pending') throw U.httpError(409, 'This email already has an account waiting for approval. GUCO will review it soon.');
      if (existing && existing.approval_status !== 'rejected') throw U.httpError(409, 'An account with this email already exists. Try signing in instead.');

      const taken = await t.q(
        "SELECT user_id FROM student_profiles WHERE student_id = ? AND approval_status <> 'rejected' AND user_id <> ?",
        [studentId, existing ? existing.id : 0]);
      if (taken.length) throw U.httpError(409, 'That student ID is already used by another account. Check the number, or contact GUCO if it is yours.');

      let userId;
      if (existing) {   // a rejected applicant signs up again with the same email: reuse the row
        userId = existing.id;
        await t.q('UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_logins = 0, locked_until = NULL WHERE id = ?', [hash, userId]);
        await t.q('DELETE FROM student_profiles WHERE user_id = ?', [userId]);
        await t.q('DELETE FROM student_id_photos WHERE user_id = ?', [userId]);
      } else {
        const r = await t.q("INSERT INTO users (email, password_hash, role) VALUES (?,?, 'student')", [email, hash]);
        userId = r.insertId;
      }
      await t.q(
        'INSERT INTO student_profiles (user_id, student_id, last_name, first_name, middle_name, suffix, gender, contact, program, major, year_level) ' +
        'VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [userId, studentId, lastName, firstName, middleName, suffix, gender, contact, program, major || 'N/A', yearLevel]);
      await t.q('INSERT INTO student_id_photos (user_id, front, back) VALUES (?,?,?)', [userId, f.idFront, f.idBack]);
    });
  } catch (err) {
    if (err instanceof U.HttpError) return fail(err.message, err.status);
    if (err && err.code === 'ER_DUP_ENTRY') return fail('That email or student ID is already registered.', 409);
    throw err;
  }
  await audit(req, 'signup', 'student', studentId, email, null);
  res.json({ ok: true });
}));

/* ---------- forgot / reset password (emailed one-time link) ---------- */
router.post('/forgot', forgotLimiter, wrap(async function (req, res) {
  const email = U.cleanEmail(req.body && req.body.email);
  res.json({ ok: true });       // the same answer whether or not the email is registered
  if (!U.isEmail(email)) return;

  try {
    const u = (await q('SELECT id, is_active FROM users WHERE email = ?', [email]))[0];
    if (!u || !u.is_active) return;
    const recent = await q('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)', [u.id]);
    if (recent[0].n >= config.reset.maxPerHour) return;            // quietly rate-limited

    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await q('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [u.id]);   // older links stop working
    await q('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))',
      [u.id, hash, config.reset.minutes]);

    const link = config.appUrl + '/reset-password.html?token=' + token;
    await sendMail({
      to: email,
      subject: 'Reset your GUCO password',
      text: 'Hello,\n\nWe received a request to reset the password of your GUCO account.\n\n' + link +
            '\n\nThis link works once and expires in ' + config.reset.minutes + ' minutes. If you did not ask for this, ignore this email; your password stays the same.\n\n' +
            'Guidance and Counseling Office\nBataan Peninsula State University, Main Campus',
      html: '<p>Hello,</p><p>We received a request to reset the password of your GUCO account.</p>' +
            '<p><a href="' + link + '">Set a new password</a></p>' +
            '<p>This link works once and expires in ' + config.reset.minutes + ' minutes. If you did not ask for this, ignore this email; your password stays the same.</p>' +
            '<p>Guidance and Counseling Office<br>Bataan Peninsula State University, Main Campus</p>'
    });
    await audit(req, 'password_reset_requested', 'user', u.id, null, u.id);
  } catch (err) {
    console.error('forgot-password failed:', err.message);          // never reveal this to the caller
  }
}));

const resendLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { ok: true } });

async function sendVerificationEmail(userId, email, firstName) {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await q('UPDATE email_verifications SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [userId]);
  await q('INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?,?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR))', [userId, hash]);
  const link = config.appUrl + '/api/auth/verify-email?token=' + token;
  await sendMail({
    to: email,
    subject: 'Verify your GUCO account',
    text: 'Hello ' + firstName + ',\n\nThanks for signing up for GUCO. Click this link to verify your BPSU email and activate your account:\n\n' + link +
          '\n\nThe link works once and expires in 24 hours. If you did not sign up, ignore this email.\n\nGuidance and Counseling Office\nBataan Peninsula State University, Main Campus',
    html: '<p>Hello ' + firstName.replace(/[&<>"']/g, '') + ',</p><p>Thanks for signing up for GUCO. Click the link below to verify your BPSU email and activate your account.</p>' +
          '<p><a href="' + link + '">Verify my email</a></p><p>The link works once and expires in 24 hours. If you did not sign up, ignore this email.</p>' +
          '<p>Guidance and Counseling Office<br>Bataan Peninsula State University, Main Campus</p>'
  });
}

async function findValidReset(token) {
  if (!/^[0-9a-f]{64}$/.test(String(token || ''))) return null;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const rows = await q('SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()', [hash]);
  return rows[0] || null;
}

router.get('/reset/validate', wrap(async function (req, res) {
  res.json({ valid: !!(await findValidReset(req.query.token)) });
}));

router.post('/reset', wrap(async function (req, res) {
  const token = String((req.body && req.body.token) || '');
  const password = String((req.body && req.body.password) || '');
  const rec = await findValidReset(token);
  if (!rec) return res.status(400).json({ ok: false, error: 'This reset link has expired or was already used. Request a new one.' });
  if (!U.passwordOk(password)) return res.status(400).json({ ok: false, error: U.PASSWORD_MESSAGE });

  const hash = await bcrypt.hash(password, config.bcryptRounds);
  await tx(async function (t) {
    await t.q('UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_logins = 0, locked_until = NULL WHERE id = ?', [hash, rec.user_id]);
    await t.q('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [rec.user_id]);
  });
  await audit(req, 'password_reset', 'user', rec.user_id, null, rec.user_id);
  res.json({ ok: true });
}));

/* ---------- change my own password (signed in) ---------- */
router.post('/change-password', requireAuth, wrap(async function (req, res) {
  const current = String((req.body && req.body.currentPassword) || '');
  const next = String((req.body && req.body.newPassword) || '');
  const u = (await q('SELECT id, password_hash, token_version FROM users WHERE id = ?', [req.user.id]))[0];
  if (!u || !(await bcrypt.compare(current, u.password_hash))) return res.status(400).json({ ok: false, error: "Your current password isn't right." });
  if (!U.passwordOk(next)) return res.status(400).json({ ok: false, error: U.PASSWORD_MESSAGE });
  if (next === current) return res.status(400).json({ ok: false, error: 'Choose a password different from your current one.' });

  const hash = await bcrypt.hash(next, config.bcryptRounds);
  await q('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, u.id]);   // signs out every other device
  issueSession(res, { id: u.id, token_version: u.token_version + 1 });                                           // ...but keeps this one
  await audit(req, 'password_changed', 'user', u.id);
  res.json({ ok: true });
}));

module.exports = router;
