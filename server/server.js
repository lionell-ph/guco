const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { pool } = require('./db');
const { loadUser, csrfGuard, isStaff, can } = require('./middleware/auth');
const { HttpError } = require('./lib/util');
const catalog = require('./routes/catalog');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],          // the pages use inline <script> blocks
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ['https://www.facebook.com', 'https://web.facebook.com'],   // Facebook Live / replay embeds
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      ...(config.isProd ? { upgradeInsecureRequests: [] } : {})
    }
  }
}));
app.use(cookieParser());
app.use(express.json({ limit: '6mb' }));      // ID / proof photos travel as small base64 images
app.use(loadUser);

/* ---------- API ---------- */
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' } }));
app.use('/api', function (req, res, next) { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', csrfGuard);

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/profile',     require('./routes/profile'));
app.use('/api/accounts',    require('./routes/accounts'));
app.use('/api/personnel',   require('./routes/personnel'));
app.use('/api/requests',    require('./routes/requests'));
app.use('/api/peers',       require('./routes/peers'));
app.use('/api/live',        require('./routes/live'));
app.use('/api/evaluations', require('./routes/evaluations'));
app.use('/api/programs',    catalog.programs);
app.use('/api/holidays',    catalog.holidays);
app.use('/api', function (req, res) { res.status(404).json({ error: 'Not found.' }); });

/* ---------- page guards: the server decides who may even load a page ---------- */
const STAFF_PAGE_SECTION = {
  'admin-requests.html': 'requests', 'admin-peers.html': 'peers', 'admin-live.html': 'live',
  'admin-evaluations.html': 'evaluations', 'admin-programs.html': 'programs',
  'admin-holidays.html': 'holidays', 'admin-approvals.html': 'accounts'
};
app.use(function (req, res, next) {
  const page = path.basename(req.path);
  const u = req.user;
  if (/^admin-.*\.html$/.test(page)) {
    if (!u) return res.redirect('/login.html');
    if (!isStaff(u)) return res.redirect('/student-home.html');
    if (page === 'admin-personnel.html' && u.role !== 'admin') return res.redirect('/admin-dashboard.html');
    const section = STAFF_PAGE_SECTION[page];
    if (section && !can(u, section)) return res.redirect('/admin-dashboard.html');
  } else if (/^student-.*\.html$/.test(page)) {
    if (!u) return res.redirect('/login.html');
    if (u.role !== 'student') return res.redirect('/admin-dashboard.html');
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));

/* ---------- errors ---------- */
app.use(function (err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ ok: false, error: err.message });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'That upload is too large. Try a smaller photo.' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Bad request.' });
  console.error(err);
  res.status(500).json({ ok: false, error: 'Something went wrong on our side. Please try again.' });
});

(async function start() {
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    console.error('Cannot reach MySQL: ' + e.message + '\nCheck DB_* in .env, and that you ran: npm run db:init');
    process.exit(1);
  }
  app.listen(config.port, function () { console.log('GUCO is running at ' + config.appUrl + ' (port ' + config.port + ')'); });
})();
