const jwt = require('jsonwebtoken');
const config = require('../config');
const { q } = require('../db');
const { PERMISSION_SECTIONS } = require('../lib/constants');
const { httpError } = require('../lib/util');

function cookieOptions() {
  return {
    httpOnly: true,                 // JavaScript on the page can never read the session token
    sameSite: 'lax',
    secure: config.isProd,          // HTTPS only in production
    path: '/',
    maxAge: config.sessionHours * 3600 * 1000
  };
}

function issueSession(res, user) {
  const token = jwt.sign({ ver: user.token_version }, config.jwtSecret, {
    algorithm: 'HS256', subject: String(user.id), expiresIn: config.sessionHours + 'h'
  });
  res.cookie(config.cookieName, token, cookieOptions());
}

function clearSession(res) {
  const o = cookieOptions(); delete o.maxAge;
  res.clearCookie(config.cookieName, o);
}

/* Runs on every request: turns the cookie into req.user (or null). The role and the
   permissions always come from the database, never from the token. */
async function loadUser(req, res, next) {
  req.user = null;
  const token = req.cookies && req.cookies[config.cookieName];
  if (!token) return next();
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }); }
  catch (e) { return next(); }

  try {
    const rows = await q(
      'SELECT u.id, u.email, u.role, u.is_active, u.token_version, sp.approval_status ' +
      'FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = ?', [payload.sub]);
    const u = rows[0];
    if (!u || !u.is_active || u.token_version !== payload.ver) return next();
    if (u.role === 'student' && u.approval_status !== 'approved') return next();

    const permissions = {};
    if (u.role === 'admin') {
      PERMISSION_SECTIONS.forEach(function (s) { permissions[s] = true; });
    } else if (u.role === 'personnel') {
      PERMISSION_SECTIONS.forEach(function (s) { permissions[s] = false; });
      const granted = await q('SELECT section FROM personnel_permissions WHERE user_id = ?', [u.id]);
      granted.forEach(function (r) { permissions[r.section] = true; });
    }
    req.user = { id: u.id, email: u.email, role: u.role, permissions: permissions };
    next();
  } catch (err) { next(err); }
}

function requireAuth(req, res, next) {
  if (!req.user) return next(httpError(401, 'Please sign in.'));
  next();
}
function requireRole() {
  const roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.user) return next(httpError(401, 'Please sign in.'));
    if (roles.indexOf(req.user.role) === -1) return next(httpError(403, 'You do not have access to this.'));
    next();
  };
}
function isStaff(user) { return !!user && (user.role === 'admin' || user.role === 'personnel'); }
function can(user, section) { return !!user && isStaff(user) && !!user.permissions[section]; }

/* Staff only, and (for personnel) only if the admin granted this section. */
function requirePermission(section) {
  return function (req, res, next) {
    if (!req.user) return next(httpError(401, 'Please sign in.'));
    if (!can(req.user, section)) return next(httpError(403, 'You do not have permission to do this.'));
    next();
  };
}
function requireStaff(req, res, next) {
  if (!req.user) return next(httpError(401, 'Please sign in.'));
  if (!isStaff(req.user)) return next(httpError(403, 'Staff only.'));
  next();
}

/* CSRF defence in depth (the cookie is already SameSite=Lax): every write must carry a custom
   header that a cross-site form cannot send, and an Origin (when sent) must be this site. */
function csrfGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') return next(httpError(403, 'Request blocked.'));
  const origin = req.get('Origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) { /* bad origin */ }
    if (host !== req.get('Host')) return next(httpError(403, 'Request blocked.'));
  }
  next();
}

module.exports = {
  issueSession, clearSession, loadUser, requireAuth, requireRole, requireStaff,
  requirePermission, csrfGuard, isStaff, can
};
