require('dotenv').config();

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function need(name) {
  if (!env[name]) {
    console.error('Missing required setting ' + name + '. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  return env[name];
}

const jwtSecret = need('JWT_SECRET');
if (jwtSecret.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters long.');
  process.exit(1);
}

module.exports = {
  isProd,
  port: parseInt(env.PORT || '3000', 10),
  appUrl: (env.APP_URL || 'http://localhost:' + (env.PORT || 3000)).replace(/\/+$/, ''),
  trustProxy: env.TRUST_PROXY === '1',
  db: {
    host: env.DB_HOST || '127.0.0.1',
    port: parseInt(env.DB_PORT || '3306', 10),
    user: need('DB_USER'),
    password: env.DB_PASSWORD || '',
    database: need('DB_NAME')
  },
  jwtSecret,
  sessionHours: parseInt(env.SESSION_HOURS || '8', 10),
  cookieName: 'guco_token',
  bcryptRounds: 12,
  login: { maxFailures: 5, lockMinutes: 15 },
  reset: { minutes: 60, maxPerHour: 3 },
  smtp: {
    host: env.SMTP_HOST || '',
    port: parseInt(env.SMTP_PORT || '587', 10),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'GUCO BPSU <guidance_mc@bpsu.edu.ph>'
  }
};
