/* Programs (with majors) and holidays: the lists staff maintain and the request forms read. */
const express = require('express');
const { q, tx } = require('../db');
const { PROGRAM_LEVELS, HOLIDAY_TYPES } = require('../lib/constants');
const defaults = require('../data/defaults');
const U = require('../lib/util');
const audit = require('../lib/audit');
const { requireAuth, requirePermission } = require('../middleware/auth');

/* =================== PROGRAMS =================== */
const programs = express.Router();

async function loadPrograms() {
  const progs = await q('SELECT * FROM programs ORDER BY sort_order, id');
  const majors = await q('SELECT program_id, name FROM program_majors ORDER BY sort_order, id');
  return progs.map(function (p) {
    return {
      id: String(p.id), name: p.name, level: p.level,
      majors: majors.filter(function (m) { return m.program_id === p.id; }).map(function (m) { return m.name; })
    };
  });
}

function readMajors(input) {
  const seen = {}, list = [];
  (Array.isArray(input) ? input : []).forEach(function (m) {
    const name = U.clip(m, 200);
    if (name && !seen[name.toLowerCase()]) { seen[name.toLowerCase()] = true; list.push(name); }
  });
  return list;
}

async function insertProgram(t, p, order) {
  const r = await t.q('INSERT INTO programs (name, level, sort_order) VALUES (?,?,?)', [p.name, p.level, order]);
  let i = 0;
  for (const m of p.majors) await t.q('INSERT INTO program_majors (program_id, name, sort_order) VALUES (?,?,?)', [r.insertId, m, i++]);
  return r.insertId;
}

// Public: the sign-up form needs the list before anyone is signed in.
programs.get('/', U.wrap(async function (req, res) { res.json(await loadPrograms()); }));

programs.post('/', requirePermission('programs'), U.wrap(async function (req, res) {
  const f = req.body || {};
  const name = U.clip(f.name, 200);
  if (!name) return res.status(400).json({ ok: false, error: 'Enter the program name.' });
  if (PROGRAM_LEVELS.indexOf(f.level) === -1) return res.status(400).json({ ok: false, error: 'Choose a level.' });
  let id;
  try {
    id = await tx(async function (t) {
      const max = (await t.q('SELECT COALESCE(MAX(sort_order), 0) AS m FROM programs'))[0].m;
      return insertProgram(t, { name: name, level: f.level, majors: readMajors(f.majors) }, max + 1);
    });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'That program is already on the list.' });
    throw err;
  }
  await audit(req, 'program_added', 'program', id, name);
  res.json({ ok: true, entry: (await loadPrograms()).filter(function (p) { return p.id === String(id); })[0] });
}));

programs.patch('/:id', requirePermission('programs'), U.wrap(async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const f = req.body || {};
  if (!(await q('SELECT id FROM programs WHERE id = ?', [id])).length) return res.status(404).json({ ok: false, error: 'Program not found.' });
  if (f.level !== undefined && PROGRAM_LEVELS.indexOf(f.level) === -1) return res.status(400).json({ ok: false, error: 'Choose a level.' });
  if (f.name !== undefined && !U.clip(f.name, 200)) return res.status(400).json({ ok: false, error: 'Enter the program name.' });
  try {
    await tx(async function (t) {
      if (f.name !== undefined) await t.q('UPDATE programs SET name = ? WHERE id = ?', [U.clip(f.name, 200), id]);
      if (f.level !== undefined) await t.q('UPDATE programs SET level = ? WHERE id = ?', [f.level, id]);
      if (f.majors !== undefined) {
        await t.q('DELETE FROM program_majors WHERE program_id = ?', [id]);
        let i = 0;
        for (const m of readMajors(f.majors)) await t.q('INSERT INTO program_majors (program_id, name, sort_order) VALUES (?,?,?)', [id, m, i++]);
      }
    });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'That program is already on the list.' });
    throw err;
  }
  await audit(req, 'program_updated', 'program', id);
  res.json({ ok: true, entry: (await loadPrograms()).filter(function (p) { return p.id === String(id); })[0] });
}));

programs.delete('/:id', requirePermission('programs'), U.wrap(async function (req, res) {
  const id = parseInt(req.params.id, 10);
  await q('DELETE FROM programs WHERE id = ?', [id]);
  await audit(req, 'program_deleted', 'program', id);
  res.json({ ok: true });
}));

// Back to the starter list that ships with the system.
programs.post('/reset', requirePermission('programs'), U.wrap(async function (req, res) {
  await tx(async function (t) {
    await t.q('DELETE FROM programs');
    let order = 1;
    for (const p of defaults.programs) await insertProgram(t, p, order++);
  });
  await audit(req, 'programs_reset', 'program', null);
  res.json({ ok: true, list: await loadPrograms() });
}));

/* =================== HOLIDAYS =================== */
const holidays = express.Router();
holidays.use(requireAuth);

function holidayOut(r) {
  return { id: String(r.id), date: r.holiday_date, name: r.name, type: r.type, yearly: !!r.is_yearly };
}
function readHoliday(f, partial) {
  const v = {};
  if (!partial || f.date !== undefined) {
    if (!U.isIsoDate(f.date)) return { err: 'Choose a valid date.' };
    v.holiday_date = f.date;
  }
  if (!partial || f.name !== undefined) {
    const name = U.clip(f.name, 150);
    if (!name) return { err: 'Enter the holiday name.' };
    v.name = name;
  }
  if (!partial || f.type !== undefined) {
    if (HOLIDAY_TYPES.indexOf(f.type) === -1) return { err: 'Choose a holiday type.' };
    v.type = f.type;
  }
  if (!partial || f.yearly !== undefined) v.is_yearly = f.yearly ? 1 : 0;
  return { v: v };
}

holidays.get('/', U.wrap(async function (req, res) {
  res.json((await q('SELECT * FROM holidays ORDER BY holiday_date, id')).map(holidayOut));
}));

holidays.post('/', requirePermission('holidays'), U.wrap(async function (req, res) {
  const r = readHoliday(req.body || {}, false);
  if (r.err) return res.status(400).json({ ok: false, error: r.err });
  const cols = Object.keys(r.v);
  const ins = await q('INSERT INTO holidays (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')',
    cols.map(function (c) { return r.v[c]; }));
  await audit(req, 'holiday_added', 'holiday', ins.insertId, r.v.name);
  res.json({ ok: true, entry: holidayOut((await q('SELECT * FROM holidays WHERE id = ?', [ins.insertId]))[0]) });
}));

holidays.patch('/:id', requirePermission('holidays'), U.wrap(async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const r = readHoliday(req.body || {}, true);
  if (r.err) return res.status(400).json({ ok: false, error: r.err });
  const cols = Object.keys(r.v);
  if (!cols.length) return res.status(400).json({ ok: false, error: 'Nothing to change.' });
  const done = await q('UPDATE holidays SET ' + cols.map(function (c) { return c + ' = ?'; }).join(', ') + ' WHERE id = ?',
    cols.map(function (c) { return r.v[c]; }).concat([id]));
  if (!done.affectedRows) return res.status(404).json({ ok: false, error: 'Holiday not found.' });
  await audit(req, 'holiday_updated', 'holiday', id);
  res.json({ ok: true, entry: holidayOut((await q('SELECT * FROM holidays WHERE id = ?', [id]))[0]) });
}));

holidays.delete('/:id', requirePermission('holidays'), U.wrap(async function (req, res) {
  const id = parseInt(req.params.id, 10);
  await q('DELETE FROM holidays WHERE id = ?', [id]);
  await audit(req, 'holiday_deleted', 'holiday', id);
  res.json({ ok: true });
}));

holidays.post('/reset', requirePermission('holidays'), U.wrap(async function (req, res) {
  await tx(async function (t) {
    await t.q('DELETE FROM holidays');
    for (const h of defaults.holidays) {
      await t.q('INSERT INTO holidays (holiday_date, name, type, is_yearly) VALUES (?,?,?,?)', [h.date, h.name, h.type, h.yearly ? 1 : 0]);
    }
  });
  await audit(req, 'holidays_reset', 'holiday', null);
  res.json({ ok: true });
}));

module.exports = { programs: programs, holidays: holidays, loadPrograms: loadPrograms };
