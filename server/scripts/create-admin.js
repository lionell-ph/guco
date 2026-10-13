/* Creates (or resets the password of) the administrator account:
     npm run admin:create -- admin@bpsu.edu.ph "GUCO Administrator"
   The password is asked for on the screen, so it never lands in your shell history.
   (It can also come from the ADMIN_PASSWORD environment variable.) */
const readline = require('readline');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { pool, q, tx } = require('../db');
const U = require('../lib/util');

function askHidden(prompt) {
  return new Promise(function (resolve) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = function (s) { if (s.indexOf(prompt) !== -1) process.stdout.write(s); };   // hide what is typed
    rl.question(prompt, function (answer) { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

(async function () {
  const email = U.cleanEmail(process.argv[2]);
  const name = U.clip(process.argv[3] || 'GUCO Administrator', 150);
  if (!U.isEmail(email)) { console.error('Usage: npm run admin:create -- <email> ["Full Name"]'); process.exit(1); }

  const password = process.env.ADMIN_PASSWORD || await askHidden('Password for ' + email + ': ');
  if (!U.passwordOk(password)) { console.error(U.PASSWORD_MESSAGE); process.exit(1); }
  const hash = await bcrypt.hash(password, config.bcryptRounds);

  const existing = (await q('SELECT id, role FROM users WHERE email = ?', [email]))[0];
  if (existing && existing.role !== 'admin') { console.error('That email already belongs to a ' + existing.role + ' account.'); process.exit(1); }

  await tx(async function (t) {
    let id;
    if (existing) {
      id = existing.id;
      await t.q('UPDATE users SET password_hash = ?, is_active = 1, token_version = token_version + 1, failed_logins = 0, locked_until = NULL WHERE id = ?', [hash, id]);
    } else {
      id = (await t.q("INSERT INTO users (email, password_hash, role) VALUES (?,?, 'admin')", [email, hash])).insertId;
    }
    await t.q('INSERT INTO staff_profiles (user_id, name) VALUES (?,?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [id, name]);
  });
  console.log(existing ? 'Administrator password reset for ' + email : 'Administrator created: ' + email);
  await pool.end();
})().catch(function (e) { console.error('admin:create failed: ' + e.message); process.exit(1); });
