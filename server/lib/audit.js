const { q } = require('../db');

/* Writes one audit row. Never throws: a logging problem must not break the request. */
async function audit(req, action, entity, entityId, detail, userId) {
  try {
    const uid = userId !== undefined ? userId : (req && req.user ? req.user.id : null);
    await q('INSERT INTO audit_log (user_id, action, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?)',
      [uid, action, entity || null, entityId == null ? null : String(entityId), detail ? String(detail).slice(0, 500) : null,
       req && req.ip ? String(req.ip).slice(0, 45) : null]);
  } catch (e) {
    console.error('audit log failed:', e.message);
  }
}
module.exports = audit;
