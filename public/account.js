/* My account page (student-account.html and admin-account.html share this file).
   Details, profile photo and change-password all go through the helpers in auth.js. */
(function () {
  var sess = gucoGetSession();
  if (!sess) return;                       // the page's own role check already redirects
  var role = sess.role, email = sess.email;
  var isStudent = role === "student";
  function $(id) { return document.getElementById(id); }

  function say(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "acct-msg" + (kind ? " " + kind : "");
  }

  /* ---------- fill the page ---------- */
  var profile = gucoGetProfile(email, role);

  function refreshHeader() {
    var p = gucoGetProfile(email, role);
    var shown = gucoDisplayName(p);
    $("acct-title").textContent = shown || "Your account";
    $("acct-sub").textContent = email;
    var initial = gucoInitialFor(email, role);
    var photo = gucoGetAvatar(email);
    var big = $("acct-avatar");
    big.textContent = "";
    if (photo) { var im = document.createElement("img"); im.src = photo; im.alt = "Your profile photo"; big.appendChild(im); }
    else big.textContent = initial;
    $("photo-remove").hidden = !photo;
    // keep the sidebar chip in step
    var chipAv = document.querySelector(".sidebar .user-chip .user-avatar");
    if (chipAv) {
      chipAv.textContent = "";
      if (photo) { var im2 = document.createElement("img"); im2.src = photo; im2.alt = ""; chipAv.appendChild(im2); }
      else chipAv.textContent = initial;
    }
  }

  /* ---------- student-only: program / major / year level dropdowns ---------- */
  var programs = [];
  function opt(value, label, extra) {
    var o = document.createElement("option"); o.value = value; o.textContent = label;
    return Object.assign(o, extra || {});
  }
  function fillMajors(programName, chosenMajor) {
    var p = programs.filter(function (x) { return x.name === programName; })[0];
    var sel = $("a-major"); sel.innerHTML = "";
    var has = !!(p && p.majors.length);
    if (has) {
      sel.appendChild(opt("", "Choose a major", { disabled: true, selected: true }));
      p.majors.forEach(function (m) { sel.appendChild(opt(m, m)); });
      if (chosenMajor && p.majors.indexOf(chosenMajor) !== -1) sel.value = chosenMajor;
    }
    $("a-major-field").style.display = has ? "block" : "none";
  }
  if (isStudent) {
    programs = gucoGetPrograms();
    var ps = $("a-program");
    ps.appendChild(opt("", "Choose a program", { disabled: true, selected: true }));
    GUCO_PROGRAM_LEVELS.forEach(function (level) {
      var inLevel = programs.filter(function (p) { return p.level === level; });
      if (!inLevel.length) return;
      var g = document.createElement("optgroup"); g.label = level;
      inLevel.forEach(function (p) { g.appendChild(opt(p.name, p.name)); });
      ps.appendChild(g);
    });
    $("a-year").appendChild(opt("", "Choose a year level", { disabled: true, selected: true }));
    GUCO_YEAR_LEVELS.forEach(function (y) { $("a-year").appendChild(opt(y, y)); });
    ps.addEventListener("change", function () { fillMajors(ps.value, ""); });
    gucoWireStudentIdInput($("a-sid"));
  }

  function fillForm() {
    var p = gucoGetProfile(email, role);
    $("a-email").value = email;
    if (isStudent) {
      $("a-lname").value = p.lastName; $("a-fname").value = p.firstName; $("a-mname").value = p.middleName;
      $("a-suffix").value = p.suffix; $("a-gender").value = p.gender;
      $("a-sid").value = p.studentId; $("a-contact").value = p.contact;
      // program/year may be blank (older accounts) or no longer on the admin's list
      var known = programs.some(function (x) { return x.name === p.program; });
      $("a-program").value = known ? p.program : "";
      fillMajors(known ? p.program : "", p.major);
      $("a-year").value = GUCO_YEAR_LEVELS.indexOf(p.yearLevel) !== -1 ? p.yearLevel : "";
      // Name and student ID match the ID card staff approved: locked once a student ID is on file.
      var locked = !!p.studentId;
      ["a-lname", "a-fname", "a-mname", "a-sid"].forEach(function (id) { $(id).readOnly = locked; });
      $("a-suffix").disabled = locked;
      $("a-sid-note").textContent = locked
        ? "Your name and student ID match your school ID, so they can't be changed here. Contact GUCO to correct them."
        : "Add your student ID once. After that it is locked to match your school ID.";
    } else {
      $("a-name").value = p.name;
    }
  }
  fillForm();
  refreshHeader();

  /* ---------- personal details ---------- */
  $("details-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var fields = isStudent
      ? { lastName: $("a-lname").value, firstName: $("a-fname").value, middleName: $("a-mname").value,
          suffix: $("a-suffix").value, gender: $("a-gender").value,
          studentId: $("a-sid").value, contact: $("a-contact").value,
          program: $("a-program").value, major: $("a-major-field").style.display === "none" ? "" : $("a-major").value,
          yearLevel: $("a-year").value }
      : { name: $("a-name").value };
    var res = gucoUpdateProfile(email, role, fields);
    if (!res.ok) { say($("details-msg"), res.error, "err"); return; }
    fillForm(); refreshHeader();
    say($("details-msg"), "Details saved.", "ok");
  });
  $("details-cancel").addEventListener("click", function () { fillForm(); say($("details-msg"), ""); });

  /* ---------- profile photo ---------- */
  var MAX_BYTES = 2 * 1024 * 1024;
  $("photo-input").addEventListener("change", function () {
    var file = this.files && this.files[0];
    this.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { say($("photo-msg"), "Choose a JPG, PNG or WebP image.", "err"); return; }
    if (file.size > MAX_BYTES) { say($("photo-msg"), "That photo is over 2 MB. Choose a smaller one.", "err"); return; }
    var reader = new FileReader();
    reader.onerror = function () { say($("photo-msg"), "Couldn't read that file. Try another photo.", "err"); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { say($("photo-msg"), "That file isn't a usable image.", "err"); };
      img.onload = function () {
        var size = 256, c = document.createElement("canvas");
        c.width = size; c.height = size;
        var side = Math.min(img.width, img.height);           // centered square crop
        var sx = (img.width - side) / 2, sy = (img.height - side) / 2;
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        var ok = gucoSetAvatar(email, c.toDataURL("image/jpeg", 0.85));
        if (!ok) { say($("photo-msg"), "Couldn't save the photo. Try a smaller image.", "err"); return; }
        refreshHeader();
        say($("photo-msg"), "Photo updated.", "ok");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  $("photo-remove").addEventListener("click", function () {
    gucoRemoveAvatar(email);
    refreshHeader();
    say($("photo-msg"), "Photo removed.", "ok");
  });

  /* ---------- change password ---------- */
  document.querySelectorAll(".pass-toggle[data-toggle-for]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = $(btn.getAttribute("data-toggle-for"));
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-pressed", show ? "true" : "false");
    });
  });

  $("pw-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var cur = $("p-cur").value, nw = $("p-new").value, nw2 = $("p-new2").value;
    if (!cur) { say($("pw-msg"), "Enter your current password.", "err"); return; }
    var ruleErr = gucoPasswordError(nw);
    if (ruleErr) { say($("pw-msg"), ruleErr, "err"); return; }
    if (nw !== nw2) { say($("pw-msg"), "The new passwords don't match.", "err"); return; }
    gucoChangePassword(email, cur, nw).then(function (res) {
      if (!res.ok) { say($("pw-msg"), res.error, "err"); return; }
      ["p-cur", "p-new", "p-new2"].forEach(function (id) { var i = $(id); i.value = ""; i.type = "password"; });
      document.querySelectorAll(".pass-toggle[data-toggle-for]").forEach(function (b) { b.textContent = "Show"; b.setAttribute("aria-pressed", "false"); });
      $("p-new").dispatchEvent(new Event("pwrefresh"));
      say($("pw-msg"), "Password updated. Use it the next time you sign in.", "ok");
    });
  });
})();
