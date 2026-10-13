/* ==========================================================================
   GUCO sign-in, accounts and permissions (browser side).

   There are no passwords, accounts or roles in this file any more. Everything
   below asks the server (api.js), which checks the password against a bcrypt hash
   in MySQL and keeps the session in an HttpOnly cookie.

   - login.html sends the email + password to gucoAuthenticate().
   - The server answers with the account's ROLE ("student", "personnel" or "admin").
   - Every student page calls gucoRequireRole("student"); every staff page calls
     gucoRequireStaff(section). These redirects are a convenience: the server refuses
     the page and the data to anyone without the right role or permission anyway.
   ========================================================================== */

/* ---- The signed-in user ---- */
function gucoMe() { return gucoGet("/api/auth/me", { session: null }); }

/* { email, role } or null */
function gucoGetSession() { return gucoMe().session || null; }

function gucoSignOut() {
  gucoHttp("POST", "/api/auth/logout", {});
  gucoForget();
  window.location.href = "login.html";
}

function gucoHomeFor(role) {
  return (role === "admin" || role === "personnel") ? "admin-dashboard.html" : "student-home.html";
}

function gucoAccountPageFor(role) {
  return (role === "admin" || role === "personnel") ? "admin-account.html" : "student-account.html";
}

/* Call at the top of a protected page. role can be one role ("student") or,
   for pages shared by admin and personnel, an array (["admin","personnel"]). */
function gucoRequireRole(role) {
  var s = gucoGetSession();
  if (!s) { window.location.replace("login.html"); return; }
  var ok = Array.isArray(role) ? role.indexOf(s.role) !== -1 : s.role === role;
  if (!ok) window.location.replace(gucoHomeFor(s.role));
}

/* Call at the top of a staff page (admin-*.html). Pass the matching key from
   GUCO_PERMISSION_SECTIONS, e.g. gucoRequireStaff("holidays"); leave it out for pages
   open to any signed-in staff, like the Overview dashboard. */
function gucoRequireStaff(sectionKey) {
  var s = gucoGetSession();
  if (!s) { window.location.replace("login.html"); return; }
  if (s.role !== "admin" && s.role !== "personnel") { window.location.replace(gucoHomeFor(s.role)); return; }
  if (s.role === "personnel" && sectionKey && !gucoCan(sectionKey)) {
    window.location.replace("admin-dashboard.html");
  }
}

/* ---- Permissions ----
   Admin: every section. Personnel: only the sections the admin granted. Student: none. */
var GUCO_PERMISSION_SECTIONS = [
  { key: "requests",    label: "Requests",          desc: "View and respond to student session and document requests" },
  { key: "peers",       label: "Peer facilitators",  desc: "Manage the peer facilitator roster" },
  { key: "live",        label: "Live sessions",      desc: "Add streams and post replay links" },
  { key: "evaluations", label: "Evaluations",        desc: "View student evaluation responses" },
  { key: "programs",    label: "Programs",           desc: "Manage the list of academic programs" },
  { key: "holidays",    label: "Holidays",           desc: "Manage the holiday calendar used on request forms" },
  { key: "accounts",    label: "Account approvals",  desc: "Review student ID photos and approve or reject new accounts" }
];

/* New personnel start with just Requests -- the core of the job -- until the admin grants more. */
function gucoDefaultPermissions() {
  return { requests: true, peers: false, live: false, evaluations: false, programs: false, holidays: false, accounts: false };
}

/* Can the signed-in user open this section of the staff portal? */
function gucoCan(sectionKey) {
  var perms = gucoMe().permissions;
  return !!(perms && perms[sectionKey]);
}

/* ---- Password rules (creating or changing a password) ----
   At least 8 characters, with an uppercase letter, a lowercase letter, a number and a special character.
   (The server enforces the same rules; this only gives instant feedback while typing.) */
var GUCO_PW_MIN = 8;
function gucoPasswordCheck(pw) {
  pw = String(pw || "");
  var c = {
    length: pw.length >= GUCO_PW_MIN,
    upper: /\p{Lu}/u.test(pw),
    lower: /\p{Ll}/u.test(pw),
    number: /\p{Nd}/u.test(pw),
    special: /[^\p{L}\p{N}\s]/u.test(pw)
  };
  c.ok = c.length && c.upper && c.lower && c.number && c.special;
  return c;
}
/* Returns "" when the password is fine, otherwise a message for the form. */
function gucoPasswordError(pw) {
  return gucoPasswordCheck(pw).ok ? "" :
    "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character (like ! @ # $ ?).";
}
/* Adds a live checklist under any password input marked data-pw-rules. */
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("input[data-pw-rules]").forEach(function (input) {
    var list = document.createElement("ul");
    list.className = "pw-rules";
    list.setAttribute("aria-live", "polite");
    var rules = [["length", "At least 8 characters"], ["upper", "One uppercase letter"], ["lower", "One lowercase letter"], ["number", "One number"], ["special", "One special character"]];
    rules.forEach(function (r) { var li = document.createElement("li"); li.setAttribute("data-rule", r[0]); li.textContent = r[1]; list.appendChild(li); });
    var host = input.closest(".field") || input.parentNode;
    host.appendChild(list);
    function update() {
      var untouched = input.dataset.pwOriginal !== undefined && input.value === input.dataset.pwOriginal;
      list.hidden = untouched;
      var c = gucoPasswordCheck(input.value);
      rules.forEach(function (r) {
        var li = list.querySelector('[data-rule="' + r[0] + '"]');
        li.classList.toggle("ok", !!c[r[0]]);
      });
    }
    input.addEventListener("input", update);
    input.addEventListener("pwrefresh", update);
    update();
  });
});

/* ---- Small input helpers shared by the forms ---- */
var GUCO_EMAIL_DOMAIN = "@bpsu.edu.ph";

function gucoIsBpsuEmail(email) {
  email = String(email || "").trim().toLowerCase();
  return email.length > GUCO_EMAIL_DOMAIN.length && email.slice(-GUCO_EMAIL_DOMAIN.length) === GUCO_EMAIL_DOMAIN;
}

/* Builds the "Last Name, First Name, Middle Initial Suffix" display name used throughout GUCO. */
function gucoFormatName(fields) {
  var last = (fields.lastName || "").trim();
  var first = (fields.firstName || "").trim();
  var middle = (fields.middleName || "").trim();
  var suffix = (fields.suffix || "").trim();
  var mi = middle ? middle.charAt(0).toUpperCase() + "." : "";
  var out = last;
  if (first) out += (out ? ", " : "") + first;
  if (mi) out += " " + mi;
  if (suffix) out += " " + suffix;
  return out;
}

/* Student ID format: 21-00000 (two digits, a dash, five digits). */
function gucoIsStudentId(id) { return /^\d{2}-\d{5}$/.test(String(id || "").trim()); }

/* Types the dash for the student: "2100123" becomes "21-00123". Call once per input. */
function gucoWireStudentIdInput(input) {
  if (!input) return;
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("maxlength", "8");
  input.addEventListener("input", function () {
    var d = input.value.replace(/\D/g, "").slice(0, 7);
    input.value = d.length > 2 ? d.slice(0, 2) + "-" + d.slice(2) : d;
  });
}

/* Mobile number: 09XXXXXXXXX (also accepts +639XXXXXXXXX, spaces or dashes).
   Returns the clean 09XXXXXXXXX form, or "" when it isn't a mobile number. */
function gucoCleanMobile(value) {
  var v = String(value || "").replace(/[\s\-()]/g, "");
  if (/^\+639\d{9}$/.test(v)) v = "0" + v.slice(3);
  else if (/^639\d{9}$/.test(v)) v = "0" + v.slice(2);
  return /^09\d{9}$/.test(v) ? v : "";
}

/* Reads an image File and returns a Promise of a resized JPEG data URL
   (longest side <= maxSide), so photos stay small. Rejects with a message. */
function gucoResizeImage(file, maxSide, quality) {
  return new Promise(function (resolve, reject) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) { reject("Choose a JPG, PNG or WebP photo."); return; }
    if (file.size > 8 * 1024 * 1024) { reject("That photo is over 8 MB. Choose a smaller one."); return; }
    var reader = new FileReader();
    reader.onerror = function () { reject("Couldn't read that file. Try another photo."); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { reject("That file isn't a usable image."); };
      img.onload = function () {
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality || 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ==========================================================================
   Sign in
   ========================================================================== */

/* Resolves to:
     { email, role }                       signed in (the server has set the session cookie)
     { blocked: "pending" }                correct password, but staff haven't approved the ID yet
     { blocked: "rejected", reason }       the account was rejected
     { error: "..." }                      locked out / rate limited
     null                                  wrong email or password */
function gucoAuthenticate(email, password) {
  return fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    credentials: "same-origin",
    body: JSON.stringify({ email: String(email || "").trim(), password: String(password || "") })
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      gucoForget();
      if (res.status === 401) return null;
      if (!res.ok) return { error: data.error || "Something went wrong. Please try again." };
      return data;
    });
  });
}

/* ==========================================================================
   Student sign-up and account approval (school-ID check)

   A new student account starts as "pending" and can't sign in. The student attaches
   photos of the front and back of their school ID; staff with the "accounts"
   permission compare it with the details typed in, then approve or reject.
   The ID photos are deleted from the database as soon as the decision is made.
   ========================================================================== */

/* fields: { lastName, firstName, middleName, suffix, gender, studentId, contact, program, major,
             yearLevel, email, password, idFront, idBack }.  Returns { ok:true } or { ok:false, error }. */
function gucoSignUpStudent(fields) {
  var r = gucoSend("POST", "/api/auth/signup", fields, { silent: true });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

function gucoPendingAccounts()  { return gucoGet("/api/accounts/pending", []); }
function gucoReviewedAccounts() { return gucoGet("/api/accounts/reviewed", []); }

/* { front, back } data URLs for one pending student (staff with "accounts" permission only). */
function gucoGetIds(email) {
  return gucoGet("/api/accounts/" + encodeURIComponent(String(email || "").toLowerCase()) + "/ids", null);
}

/* decision: "approved" | "rejected". opts: { reason } (optional, rejected only). */
function gucoReviewAccount(email, decision, opts) {
  var r = gucoSend("POST", "/api/accounts/" + encodeURIComponent(String(email || "").toLowerCase()) + "/review",
    { decision: decision, reason: (opts && opts.reason) || "" }, { silent: true });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/* ==========================================================================
   Password reset by emailed link
   ========================================================================== */

/* Always answers { ok:true }, whether or not the email is registered, so nobody can use this
   to find out which emails have accounts. The server emails a one-time link when it is. */
function gucoRequestPasswordReset(email) {
  gucoSend("POST", "/api/auth/forgot", { email: String(email || "").trim() }, { silent: true });
  return { ok: true };
}

/* Is this emailed link still good (known, unused, not expired)? */
function gucoResetLinkValid(token) {
  var r = gucoHttp("GET", "/api/auth/reset/validate?token=" + encodeURIComponent(token || ""));
  return !!(r.ok && r.data && r.data.valid);
}

/* Returns { ok:true } or { ok:false, error }. The link works once. */
function gucoResetPasswordWithToken(token, newPassword) {
  var r = gucoSend("POST", "/api/auth/reset", { token: token, password: newPassword }, { silent: true });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/* Returns a Promise of { ok:true } or { ok:false, error }. The server checks the current password first. */
function gucoChangePassword(email, currentPassword, newPassword) {
  var r = gucoSend("POST", "/api/auth/change-password", { currentPassword: currentPassword, newPassword: newPassword }, { silent: true });
  return Promise.resolve(r.ok ? { ok: true } : { ok: false, error: r.error });
}

/* ==========================================================================
   Personnel accounts (admin only). Passwords are sent once and stored only as a hash.
   ========================================================================== */
function gucoGetPersonnel() { return gucoGet("/api/personnel", []); }

/* fields: { name, email, password, permissions }.  Returns { ok, entry } or { ok:false, error }. */
function gucoSavePersonnel(fields) {
  var r = gucoSend("POST", "/api/personnel", fields, { silent: true });
  return r.ok ? { ok: true, entry: r.data.entry } : { ok: false, error: r.error };
}

/* changes: any of { name, password, status, permissions }.  Returns { ok, entry } or { ok:false, error }. */
function gucoUpdatePersonnel(id, changes) {
  var r = gucoSend("PATCH", "/api/personnel/" + encodeURIComponent(id), changes, { silent: true });
  return r.ok ? { ok: true, entry: r.data.entry } : { ok: false, error: r.error };
}

function gucoDeletePersonnel(id) {
  return gucoSend("DELETE", "/api/personnel/" + encodeURIComponent(id), {}).ok;
}

/* ==========================================================================
   Profile pictures and "My account"
   ========================================================================== */

/* The signed-in user's own picture (a small square JPEG data URL) or null. */
function gucoGetAvatar(email) {
  var s = gucoGetSession();
  if (!s || String(email || "").toLowerCase() !== s.email) return null;
  var a = gucoGet("/api/profile/avatar", { image: null });
  return a.image || null;
}

function gucoSetAvatar(email, dataUrl) {
  return gucoSend("PUT", "/api/profile/avatar", { image: dataUrl }, { silent: true }).ok;
}

function gucoRemoveAvatar(email) {
  gucoSend("DELETE", "/api/profile/avatar");
}

/* Returns { email, role, lastName, firstName, middleName, suffix, gender, name,
   studentId, contact, program, major, yearLevel } (blank when unknown). Only the signed-in
   user's own profile is available. */
function gucoGetProfile(email, role) {
  var me = gucoMe();
  var blank = { email: String(email || "").toLowerCase(), role: role, lastName: "", firstName: "", middleName: "", suffix: "", gender: "",
                name: "", studentId: "", contact: "", program: "", major: "", yearLevel: "" };
  if (me.session && me.profile && me.session.email === blank.email) return Object.assign(blank, me.profile);
  return blank;
}

/* Friendly "First M. Last Suffix" for headings; falls back to a plain name or "". */
function gucoDisplayName(profile) {
  if (profile.firstName || profile.lastName) {
    var mi = profile.middleName ? profile.middleName.trim().charAt(0).toUpperCase() + "." : "";
    return [profile.firstName, mi, profile.lastName, profile.suffix].filter(Boolean).join(" ");
  }
  var n = profile.name || "";
  if (n.indexOf(",") !== -1) {           // "Last, First M." (personnel convention)
    var parts = n.split(",");
    return (parts.slice(1).join(",").trim() + " " + parts[0].trim()).trim();
  }
  return n;
}

/* The letter shown in the round avatar when there is no photo. */
function gucoInitialFor(email, role) {
  var p = gucoGetProfile(email, role);
  var base = p.firstName || gucoDisplayName(p) || String(email || "");
  return (base.trim().charAt(0) || "?").toUpperCase();
}

/* fields (student): { gender, contact, program, major, yearLevel }  (name and student ID are locked)
   fields (personnel / admin): { name }.  Returns { ok:true } or { ok:false, error }. */
function gucoUpdateProfile(email, role, fields) {
  var r = gucoSend("PUT", "/api/profile", fields, { silent: true });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
