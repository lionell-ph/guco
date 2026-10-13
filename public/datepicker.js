/* ==========================================================================
   GUCO — date picker that greys out weekends, holidays, past dates and
   the first few days from today (no same-day booking).

   A normal <input type="date"> can't disable individual days, so this draws
   its own small calendar. It needs requests.js loaded first (for
   gucoClosedReason, which reads the holiday list staff edit on
   admin-holidays.html).

   Usage:
     <input type="text" id="preferred-display" readonly>   <- what the student sees
     <input type="hidden" id="preferred">                  <- holds "YYYY-MM-DD"
     gucoDatePicker({ display: ..., hidden: ... });
   ========================================================================== */
(function () {
  /* The first N days starting today can't be booked (today + the next N-1 days), so a
     student can't book a same-day session. The earliest bookable day is today + N.
     Change this number to adjust the notice period. */
  var MIN_LEAD_DAYS = 3;
  var TOO_SOON = "Too soon";

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];
  var DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  var DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  var CSS = [
    ".gdp-wrap{position:relative;}",
    ".gdp-display{cursor:pointer;padding-right:38px !important;",
    "  background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23800020' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E\") !important;",
    "  background-repeat:no-repeat !important;background-position:right 12px center !important;background-size:18px !important;}",
    ".gdp-pop{position:absolute;z-index:50;top:calc(100% + 6px);left:0;width:300px;max-width:calc(100vw - 32px);",
    "  background:var(--cream-light);border:1px solid var(--line);border-radius:6px;padding:14px;",
    "  box-shadow:0 10px 28px rgba(128,0,32,.16);}",
    ".gdp-pop[hidden]{display:none;}",
    ".gdp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}",
    ".gdp-title{font-family:var(--font-heading);font-size:1.02rem;color:var(--maroon-deep);}",
    ".gdp-nav{width:30px;height:30px;border:1px solid var(--line);border-radius:6px;background:var(--cream);",
    "  color:var(--maroon);font-size:1rem;line-height:1;cursor:pointer;}",
    ".gdp-nav:hover:not(:disabled){background:var(--maroon);color:var(--cream);}",
    ".gdp-nav:disabled{opacity:.35;cursor:not-allowed;}",
    ".gdp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}",
    ".gdp-dow{text-align:center;font-size:.66rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;",
    "  color:var(--maroon);padding:4px 0;}",
    ".gdp-day{position:relative;height:36px;border:1px solid transparent;border-radius:6px;background:transparent;",
    "  font-family:var(--font-body);font-size:.86rem;color:var(--ink);cursor:pointer;padding:0;}",
    ".gdp-day:hover:not(:disabled){background:var(--cream-deep);border-color:var(--line);}",
    ".gdp-day:focus-visible{outline:2px solid var(--maroon);outline-offset:1px;}",
    ".gdp-day.today{border-color:var(--maroon);}",
    ".gdp-day.selected,.gdp-day.selected:hover{background:var(--maroon);border-color:var(--maroon);color:var(--yellow);}",
    ".gdp-day:disabled{color:#B5AC98;cursor:not-allowed;text-decoration:line-through;text-decoration-color:rgba(181,172,152,.7);}",
    ".gdp-day.holiday:disabled{color:var(--maroon);opacity:.55;text-decoration:none;}",
    ".gdp-day.holiday:disabled::after{content:\"\";position:absolute;left:50%;bottom:4px;width:4px;height:4px;",
    "  margin-left:-2px;border-radius:50%;background:var(--rose);}",
    ".gdp-blank{height:36px;}",
    ".gdp-foot{margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-size:.72rem;",
    "  color:var(--ink-soft);line-height:1.5;}",
    ".gdp-foot .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--maroon);",
    "  opacity:.6;margin-right:5px;vertical-align:middle;}",
    ".gdp-hint{min-height:1.2em;margin-top:6px;font-size:.72rem;color:var(--maroon);}",
    ".gdp-clear{margin-top:8px;padding:0;border:none;background:none;font-size:.74rem;color:var(--maroon);",
    "  text-decoration:underline;cursor:pointer;}"
  ].join("\n");

  function injectCSS() {
    if (document.getElementById("gdp-css")) return;
    var s = document.createElement("style");
    s.id = "gdp-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function pad(n) { return String(n).padStart(2, "0"); }
  function toISO(y, m, d) { return y + "-" + pad(m + 1) + "-" + pad(d); }
  function todayISO() {
    var t = new Date();
    return toISO(t.getFullYear(), t.getMonth(), t.getDate());
  }
  function parseISO(iso) {
    var p = String(iso).split("-");
    return { y: +p[0], m: +p[1] - 1, d: +p[2] };
  }
  function pretty(iso) {
    var p = parseISO(iso);
    var dow = new Date(p.y, p.m, p.d).getDay();
    return DAYS_LONG[dow] + ", " + MONTHS[p.m] + " " + p.d + ", " + p.y;
  }

  function tip(reason) {
    return reason === TOO_SOON ? "Too soon — please book at least " + MIN_LEAD_DAYS + " days ahead" : reason;
  }

  /* ISO date N days from today (local time). */
  function leadCutoffISO() {
    var t = new Date();
    var c = new Date(t.getFullYear(), t.getMonth(), t.getDate() + MIN_LEAD_DAYS);
    return toISO(c.getFullYear(), c.getMonth(), c.getDate());
  }

  /* "" when the date can be booked, otherwise the reason it can't. */
  function unavailableReason(iso) {
    if (iso < todayISO()) return "Past date";
    if (iso < leadCutoffISO()) return TOO_SOON;
    return typeof gucoClosedReason === "function" ? gucoClosedReason(iso) : "";
  }

  window.gucoDateReason = unavailableReason;

  window.gucoDatePicker = function (opts) {
    injectCSS();
    var display = opts.display;
    var hidden = opts.hidden;
    var wrap = display.parentNode;
    wrap.classList.add("gdp-wrap");
    display.classList.add("gdp-display");
    display.readOnly = true;
    display.setAttribute("aria-haspopup", "dialog");
    display.setAttribute("aria-expanded", "false");

    var pop = document.createElement("div");
    pop.className = "gdp-pop";
    pop.hidden = true;
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Choose a preferred date");
    wrap.appendChild(pop);

    var hint = document.createElement("div");
    hint.className = "gdp-hint";
    hint.setAttribute("aria-live", "polite");
    wrap.appendChild(hint);

    var now = new Date();
    var viewY = now.getFullYear();
    var viewM = now.getMonth();

    function setValue(iso) {
      hidden.value = iso || "";
      display.value = iso ? pretty(iso) : "";
      hint.textContent = "";
    }

    function render() {
      var first = new Date(viewY, viewM, 1).getDay();
      var count = new Date(viewY, viewM + 1, 0).getDate();
      var today = todayISO();
      var minY = now.getFullYear(), minM = now.getMonth();
      var atMin = viewY < minY || (viewY === minY && viewM <= minM);

      var html = "<div class=\"gdp-head\">" +
        "<button type=\"button\" class=\"gdp-nav\" data-nav=\"-1\" aria-label=\"Previous month\"" + (atMin ? " disabled" : "") + ">&lsaquo;</button>" +
        "<span class=\"gdp-title\">" + MONTHS[viewM] + " " + viewY + "</span>" +
        "<button type=\"button\" class=\"gdp-nav\" data-nav=\"1\" aria-label=\"Next month\">&rsaquo;</button>" +
        "</div><div class=\"gdp-grid\">";

      DAYS.forEach(function (d) { html += "<div class=\"gdp-dow\">" + d + "</div>"; });
      for (var i = 0; i < first; i++) html += "<div class=\"gdp-blank\"></div>";

      for (var d = 1; d <= count; d++) {
        var iso = toISO(viewY, viewM, d);
        var reason = unavailableReason(iso);
        var cls = "gdp-day";
        if (iso === today) cls += " today";
        if (iso === hidden.value) cls += " selected";
        var isHoliday = reason && reason !== "Weekend" && reason !== "Past date" && reason !== TOO_SOON;
        if (isHoliday) cls += " holiday";
        html += "<button type=\"button\" class=\"" + cls + "\" data-date=\"" + iso + "\"" +
          (reason ? " disabled title=\"" + tip(reason).replace(/"/g, "&quot;") + "\"" : "") +
          " aria-label=\"" + pretty(iso) + (reason ? " — unavailable (" + tip(reason).replace(/"/g, "&quot;") + ")" : "") + "\">" + d + "</button>";
      }
      html += "</div>" +
        "<div class=\"gdp-foot\"><span class=\"dot\"></span>Holidays, weekends, past dates and the next " + MIN_LEAD_DAYS + " days can't be picked. Hover a marked day to see why.</div>" +
        (hidden.value ? "<button type=\"button\" class=\"gdp-clear\" data-clear=\"1\">Clear date</button>" : "");
      pop.innerHTML = html;
    }

    /* First day that can actually be booked (skips the notice period, weekends, holidays). */
    function firstBookable() {
      var t = new Date();
      for (var i = MIN_LEAD_DAYS; i < MIN_LEAD_DAYS + 90; i++) {
        var c = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i);
        if (!unavailableReason(toISO(c.getFullYear(), c.getMonth(), c.getDate()))) {
          return { y: c.getFullYear(), m: c.getMonth() };
        }
      }
      return null;
    }

    function open() {
      if (hidden.value) {
        var p = parseISO(hidden.value);
        viewY = p.y; viewM = p.m;
      } else {
        var f = firstBookable();
        if (f) { viewY = f.y; viewM = f.m; }
      }
      render();
      pop.hidden = false;
      display.setAttribute("aria-expanded", "true");
    }
    function close() {
      pop.hidden = true;
      display.setAttribute("aria-expanded", "false");
    }

    display.addEventListener("click", function () { if (pop.hidden) open(); else close(); });
    display.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        if (pop.hidden) open();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        setValue("");
      }
    });

    pop.addEventListener("click", function (e) {
      var nav = e.target.closest("[data-nav]");
      if (nav) {
        viewM += +nav.getAttribute("data-nav");
        if (viewM < 0) { viewM = 11; viewY--; }
        if (viewM > 11) { viewM = 0; viewY++; }
        render();
        return;
      }
      if (e.target.closest("[data-clear]")) { setValue(""); close(); display.focus(); return; }
      var day = e.target.closest("[data-date]");
      if (day && !day.disabled) {
        setValue(day.getAttribute("data-date"));
        close();
        display.focus();
      }
    });

    document.addEventListener("click", function (e) {
      // composedPath, not contains(): clicking "next month" re-draws the popup, so e.target is already detached by now
      var path = e.composedPath ? e.composedPath() : [];
      if (!pop.hidden && path.indexOf(wrap) === -1) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !pop.hidden) { close(); display.focus(); }
    });

    return {
      /* "" if the chosen date is fine (or empty), otherwise the reason it isn't.
         Re-checked at submit in case staff changed the holiday list after the date was picked. */
      check: function () { return hidden.value ? unavailableReason(hidden.value) : ""; },
      showHint: function (msg) { hint.textContent = msg || ""; },
      clear: function () { setValue(""); }
    };
  };
})();
