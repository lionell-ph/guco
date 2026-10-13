const { q } = require('../db');
const { YEAR_LEVELS } = require('./constants');
const { formatName } = require('./util');

/* Program / major / year level must match the lists staff manage. "" when fine, else a message. */
async function validateAcademic(program, major, yearLevel) {
  if (!program) return 'Choose your program.';
  const prog = (await q('SELECT id FROM programs WHERE name = ?', [program]))[0];
  if (!prog) return "That program isn't on the list. Choose another.";
  const majors = await q('SELECT name FROM program_majors WHERE program_id = ?', [prog.id]);
  if (majors.length && !majors.some(function (m) { return m.name === major; })) return 'Choose your major.';
  if (!yearLevel || YEAR_LEVELS.indexOf(yearLevel) === -1) return 'Choose your year level.';
  return '';
}

function studentOut(r) {
  const o = {
    email: r.email, lastName: r.last_name, firstName: r.first_name, middleName: r.middle_name, suffix: r.suffix,
    gender: r.gender, studentId: r.student_id, contact: r.contact, program: r.program, major: r.major, yearLevel: r.year_level
  };
  o.name = formatName(o);
  return o;
}

/* The signed-in user's own profile, in the shape the pages expect. */
async function profileFor(user) {
  const base = { email: user.email, role: user.role, lastName: '', firstName: '', middleName: '', suffix: '', gender: '', name: '',
                 studentId: '', contact: '', program: '', major: '', yearLevel: '' };
  if (user.role === 'student') {
    const r = (await q(
      'SELECT u.email, s.* FROM users u JOIN student_profiles s ON s.user_id = u.id WHERE u.id = ?', [user.id]))[0];
    return r ? Object.assign(base, studentOut(r)) : base;
  }
  const s = (await q('SELECT name FROM staff_profiles WHERE user_id = ?', [user.id]))[0];
  base.name = s ? s.name : '';
  return base;
}

module.exports = { validateAcademic, studentOut, profileFor };
