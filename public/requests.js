/* ==========================================================================
   GUCO data layer (browser side).

   Requests, peers, live sessions, evaluations, programs and holidays all live in the
   MySQL database behind the server. These functions keep the same names the pages
   already use, but every one of them now calls the API (see api.js) instead of
   reading or writing the browser's storage. The only thing kept in the browser is each staff member's Gmail-or-Mail-app choice on the Requests page.
   ========================================================================== */

const REQUEST_TYPES = {
  facetoface:  { label: "Face to face",  group: "session",  tag: "In person", code: "FF" },
  academic:    { label: "Academic",      group: "session",  tag: "Coursework", code: "AC" },
  followup:    { label: "Follow up",     group: "session",  tag: "Continuing", code: "FU" },
  peer:        { label: "Peer support session", group: "session", tag: "Peer support", code: "PS" },
  online:      { label: "Online counseling", group: "session", tag: "Online", code: "OL" },
  goodmoral:   { label: "Good moral certificate", group: "document", tag: "Document", code: "GM" },
  returning:   { label: "Academic counseling — returning student", group: "document", tag: "Returning student", code: "RS" },
  failing:     { label: "Academic counseling — last semester", group: "document", tag: "Failing grades", code: "LS" },
  exittransfer:{ label: "Exit interview — transfer / shift / drop", group: "document", tag: "Transfer / shift / drop", code: "ET" },
  exitgrad:    { label: "Exit interview — graduating", group: "document", tag: "Graduating", code: "EG" }
};

/* ---- proof a session actually happened, required before a session request
   can be marked Completed. Document/interview requests don't need this --
   they're processed by the office directly, not a live session. ---- */
const GUCO_EVIDENCE_KIND = {
  facetoface: "photo",       // in person -> a photo
  academic:   "photo",
  followup:   "photo",
  peer:       "photo",
  online:     "screenshot"   // online -> a screenshot of the call
};

/* "photo" | "screenshot" | null (no evidence needed -- document/interview requests) */
function gucoEvidenceKind(type) {
  return GUCO_EVIDENCE_KIND[type] || null;
}

/* ==========================================================================
   Requests
   ========================================================================== */

/* Staff with the Requests permission get every request; a student gets only their own. */
function gucoGetRequests() { return gucoGet("/api/requests", []); }

/* A student submits a request. The server assigns the reference number and takes the name and
   student ID from the verified account. Pass { type, program, major, yearLevel, contact, preferred, notes }.
   Returns { ok:true, entry } (entry.ref is the new reference number) or { ok:false, error }. */
function gucoSaveRequest(entry) {
  var r = gucoSend("POST", "/api/requests", entry, { silent: true });
  return r.ok ? { ok: true, entry: r.data.entry } : { ok: false, error: r.error };
}

/* Staff: change a request's status. Returns the updated request, or null when the server refused. */
function gucoUpdateRequestStatus(ref, status) {
  var r = gucoSend("PATCH", "/api/requests/" + encodeURIComponent(ref) + "/status", { status: status });
  return r.ok ? r.data.entry : null;
}

/* Staff: mark a counseling/peer session Completed with its proof image.
   Returns the updated request; throws an Error (with the server's message) when it can't be saved. */
function gucoCompleteRequestWithEvidence(ref, dataUrl, filename) {
  var r = gucoSend("POST", "/api/requests/" + encodeURIComponent(ref) + "/complete",
    { dataUrl: dataUrl, filename: filename }, { silent: true });
  if (!r.ok) throw new Error(r.error);
  return r.data.entry;
}

/* ==========================================================================
   Peer facilitators
   ========================================================================== */
function gucoGetPeers() { return gucoGet("/api/peers", []); }

function gucoSavePeer(entry) {
  var r = gucoSend("POST", "/api/peers", entry);
  return r.ok ? r.data.entry : null;
}

function gucoUpdatePeerStatus(id, status) { return gucoUpdatePeer(id, { status: status }); }

function gucoDeletePeer(id) { gucoSend("DELETE", "/api/peers/" + encodeURIComponent(id)); }

/* Edit any fields of a saved peer (used to change duty days / hours from the roster table). */
function gucoUpdatePeer(id, fields) {
  var r = gucoSend("PATCH", "/api/peers/" + encodeURIComponent(id), fields);
  return r.ok ? r.data.entry : null;
}

/* ---- peer duty days & hours ----
   Duty days are picked from these weekday chips (add "Sat" here if peers ever cover Saturdays).
   They are still stored as one text value, "Mon, Wed", so older data and the student pages keep working. */
const GUCO_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// Reads "Mon, Wed", "Monday/Wednesday", "Mon-Fri" ... into a list of weekday chips, in week order.
function gucoParseDays(str) {
  const found = [];
  function add(d) { if (d && found.indexOf(d) < 0) found.push(d); }
  function match(tok) {
    tok = String(tok).toLowerCase();
    return GUCO_WEEKDAYS.find(function(w){ return tok.length >= 3 && tok.slice(0, 3) === w.toLowerCase(); });
  }
  String(str || "").replace(/\s*[-\u2013]\s*/g, "-").split(/[,\/&;\s]+|\band\b/i).forEach(function(tok){
    if (!tok) return;
    const range = tok.split("-");
    if (range.length === 2 && match(range[0]) && match(range[1])) {
      const a = GUCO_WEEKDAYS.indexOf(match(range[0])), b = GUCO_WEEKDAYS.indexOf(match(range[1]));
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) add(GUCO_WEEKDAYS[i]);
    } else {
      add(match(tok));
    }
  });
  return GUCO_WEEKDAYS.filter(function(d){ return found.indexOf(d) >= 0; });
}

// Days to show for a peer: the weekday chips, or the original text if it can't be read as weekdays.
function gucoPeerDayList(p) {
  const list = gucoParseDays(p.days);
  if (list.length) return list;
  const raw = String(p.days || "").trim();
  return raw ? [raw] : [];
}

// "13:30" -> "1:30 PM"
function gucoFormatTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  if (!m) return "";
  let h = +m[1];
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return h + ":" + m[2] + " " + ap;
}

// "9:00 AM \u2013 12:00 PM", or "" when no hours were set.
function gucoPeerHours(p) {
  if (!p.timeFrom || !p.timeTo) return "";
  return gucoFormatTime(p.timeFrom) + " \u2013 " + gucoFormatTime(p.timeTo);
}

// Builds "Last, First M.I., Suffix" from the split name fields. Falls back to
// the old single "name" field for any peer saved before the split existed.
function gucoPeerFullName(p) {
  const last = (p.lastName || "").trim();
  const first = (p.firstName || "").trim();
  if (!last && !first) return p.name || "";
  const mi = (p.middleInitial || "").trim().replace(/\.+$/, "");
  const suffix = (p.suffix || "").trim();
  let out = last;
  if (first) out += (out ? ", " : "") + first;
  if (mi) out += " " + mi + ".";
  if (suffix) out += ", " + suffix;
  return out;
}

/* ==========================================================================
   Live sessions & replays
   ========================================================================== */
function gucoGetLiveSessions() { return gucoGet("/api/live", []); }

function gucoSaveLiveSession(entry) {
  var r = gucoSend("POST", "/api/live", entry);
  return r.ok ? r.data.entry : null;
}

/* status: "scheduled" (ongoing) or "done" (replay posted) */
function gucoUpdateLiveSessionStatus(id, status) {
  return gucoSend("PATCH", "/api/live/" + encodeURIComponent(id) + "/status", { status: status }).ok;
}

function gucoDeleteLiveSession(id) { gucoSend("DELETE", "/api/live/" + encodeURIComponent(id)); }

/* ---- evaluation QR codes (posted by staff from Live sessions; a session can have more than one) ---- */
function gucoGetEvalQrs() { return gucoGet("/api/live/qrs", []); }

/* Always adds a new QR code rather than replacing an existing one. Returns false if it couldn't be saved. */
function gucoSaveEvalQr(entry) {
  return gucoSend("POST", "/api/live/qrs", entry, { silent: true }).ok;
}

function gucoDeleteEvalQr(id) { gucoSend("DELETE", "/api/live/qrs/" + encodeURIComponent(id)); }

/* Change just the label shown to students, without re-uploading the image. Returns false if not found. */
function gucoUpdateEvalQrLabel(id, label) {
  return gucoSend("PATCH", "/api/live/qrs/" + encodeURIComponent(id), { label: label }).ok;
}

/* ==========================================================================
   Evaluations
   ========================================================================== */

/* Staff with the Evaluations permission get every response; a student gets only their own. */
function gucoGetEvaluations() { return gucoGet("/api/evaluations", []); }

/* entry: { service, rating, comment, ref }.  Returns { ok:true } or { ok:false, error }. */
function gucoSaveEvaluation(entry) {
  var r = gucoSend("POST", "/api/evaluations", entry, { silent: true });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/* Has this specific session request already been evaluated? Used to require
   an evaluation before a student can book another session. */
function gucoIsRequestEvaluated(ref) {
  return gucoGetEvaluations().some(function (e) { return e.ref === ref; });
}

/* This student's completed sessions/requests that still need an evaluation, oldest first.
   loggedInEmail should already be lowercased. Pass group ("session" or "document") to scope
   the check to just that kind of request -- each request-page tab enforces its own gate so
   an unanswered document evaluation doesn't block booking a new counseling session and vice versa. */
function gucoPendingEvaluations(loggedInEmail, group) {
  if (!loggedInEmail) return [];
  return gucoGetRequests().filter(function (item) {
    return (!group || item.group === group) &&
      item.status === "done" &&
      item.accountEmail && item.accountEmail.toLowerCase() === loggedInEmail &&
      !gucoIsRequestEvaluated(item.ref);
  }).reverse();
}

/* One open session at a time: the student's counseling/peer session request that is still
   Pending or Scheduled (not yet Completed), or null. Document and interview requests are not limited. */
function gucoOpenSessionRequest(loggedInEmail, studentId) {
  var email = String(loggedInEmail || "").toLowerCase();
  var sid = String(studentId || "").trim();
  if (!email && !sid) return null;
  return gucoGetRequests().filter(function (item) {
    return item.group === "session" && item.status !== "done" &&
      ((email && item.accountEmail && item.accountEmail.toLowerCase() === email) ||
       (sid && item.studentId && item.studentId === sid));
  }).reverse()[0] || null;   // oldest open one
}

/* Live satisfaction averages, computed by the database: { perService:[{service,avg,count}], overallAvg, total } */
function gucoEvalStats() {
  return gucoGet("/api/evaluations/stats", { perService: [], overallAvg: 0, total: 0 });
}

/* ==========================================================================
   Programs (editable by staff on admin-programs.html)
   Each program: { id, name, level, majors: [ "Major 1", ... ] }
   ========================================================================== */
const GUCO_PROGRAM_LEVELS = ["Undergraduate", "Post-graduate", "Graduate"];
const GUCO_YEAR_LEVELS = ["1st year", "2nd year", "3rd year", "4th year", "5th year"];

function gucoGetPrograms() { return gucoGet("/api/programs", []); }

function gucoSaveProgram(entry) {
  var r = gucoSend("POST", "/api/programs", entry);
  return r.ok ? r.data.entry : null;
}

function gucoUpdateProgram(id, fields) {
  var r = gucoSend("PATCH", "/api/programs/" + encodeURIComponent(id), fields);
  return r.ok ? r.data.entry : null;
}

function gucoDeleteProgram(id) { gucoSend("DELETE", "/api/programs/" + encodeURIComponent(id)); }

/* Back to the starter list that ships with the system. */
function gucoResetPrograms() {
  var r = gucoSend("POST", "/api/programs/reset", {});
  return r.ok ? r.data.list : gucoGetPrograms();
}

/* ==========================================================================
   Holidays (editable by staff on admin-holidays.html)
   Each holiday: { id, date: "YYYY-MM-DD", name, type, yearly: true|false }
   - yearly:true  -> the same month/day is closed every year (e.g. Dec 25)
   - yearly:false -> only that exact date (e.g. Holy Week, which moves each year)
   Weekends are always closed and are NOT stored. The student request form greys out
   weekends + every date in this list.
   ========================================================================== */
const GUCO_HOLIDAY_TYPES = ["Regular holiday", "Special non-working day", "Local holiday", "Office closure"];

function gucoGetHolidays() { return gucoGet("/api/holidays", []); }

function gucoSaveHoliday(entry) {
  var r = gucoSend("POST", "/api/holidays", entry);
  return r.ok ? r.data.entry : null;
}

function gucoUpdateHoliday(id, fields) {
  var r = gucoSend("PATCH", "/api/holidays/" + encodeURIComponent(id), fields);
  return r.ok ? r.data.entry : null;
}

function gucoDeleteHoliday(id) { gucoSend("DELETE", "/api/holidays/" + encodeURIComponent(id)); }

function gucoResetHolidays() {
  gucoSend("POST", "/api/holidays/reset", {});
  return gucoGetHolidays();
}

/* iso = "YYYY-MM-DD". Returns the holiday entry that closes that date, or null. */
function gucoHolidayOn(iso) {
  var md = String(iso).slice(5);
  return gucoGetHolidays().find(function (h) {
    return h.date === iso || (h.yearly && String(h.date).slice(5) === md);
  }) || null;
}

/* Why a date can't be booked: a holiday name, "Weekend", or "" when the date is open.
   (Past dates are handled by the date picker itself.) */
function gucoClosedReason(iso) {
  var p = String(iso).split("-");
  if (p.length !== 3) return "";
  var dow = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
  var h = gucoHolidayOn(iso);
  if (h) return h.name;
  if (dow === 0 || dow === 6) return "Weekend";
  return "";
}

/* ---- Facebook video embed ----
   Turns a public Facebook video / live / replay / reel link into the URL of Facebook's own
   embeddable player, or "" if the link can't be embedded (short fb.watch links, page or post
   links, private videos are never embeddable, but those can't be detected from the link alone). */
function gucoFbEmbedUrl(link) {
  let u;
  try { u = new URL(String(link || "").trim()); } catch (e) { return ""; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "";
  const host = u.hostname.toLowerCase().replace(/^(www|m|web|mbasic)\./, "");
  if (host !== "facebook.com") return "";
  const path = u.pathname;
  const isVideo =
    /\/videos\//.test(path) ||
    /^\/reel\//.test(path) ||
    /^\/share\/(v|r)\//.test(path) ||
    (/^\/watch\/?$/.test(path) && !!u.searchParams.get("v")) ||
    (/^\/video\.php$/.test(path) && !!u.searchParams.get("v"));
  if (!isVideo) return "";
  const canonical = "https://www.facebook.com" + path + u.search;
  return "https://www.facebook.com/plugins/video.php?href=" + encodeURIComponent(canonical) + "&show_text=false&width=560";
}
