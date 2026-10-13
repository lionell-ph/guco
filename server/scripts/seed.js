/* Loads the starter programs and Philippine holidays into an EMPTY database:  npm run db:seed
   (Tables that already contain rows are left alone.) */
const { pool, q, tx } = require('../db');
const defaults = require('../data/defaults');

(async function () {
  const progCount = (await q('SELECT COUNT(*) AS n FROM programs'))[0].n;
  if (!progCount) {
    await tx(async function (t) {
      let order = 1;
      for (const p of defaults.programs) {
        const r = await t.q('INSERT INTO programs (name, level, sort_order) VALUES (?,?,?)', [p.name, p.level, order++]);
        let i = 0;
        for (const m of p.majors) await t.q('INSERT INTO program_majors (program_id, name, sort_order) VALUES (?,?,?)', [r.insertId, m, i++]);
      }
    });
    console.log('Added ' + defaults.programs.length + ' programs.');
  } else console.log('Programs already present - skipped.');

  const holCount = (await q('SELECT COUNT(*) AS n FROM holidays'))[0].n;
  if (!holCount) {
    await tx(async function (t) {
      for (const h of defaults.holidays) {
        await t.q('INSERT INTO holidays (holiday_date, name, type, is_yearly) VALUES (?,?,?,?)', [h.date, h.name, h.type, h.yearly ? 1 : 0]);
      }
    });
    console.log('Added ' + defaults.holidays.length + ' holidays.');
  } else console.log('Holidays already present - skipped.');

  await pool.end();
})().catch(function (e) { console.error('db:seed failed: ' + e.message); process.exit(1); });
