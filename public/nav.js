// Sidebar behaviour, shared across every page (student site and staff portal):
//  - "Menu" button that collapses/expands the sidebar on small screens
//  - the "Counseling" submenu (Session requests / Documents & interviews),
//    which expands inline under its parent link
document.addEventListener('DOMContentLoaded', function () {
  // ---- signed-in chip: opens "My account", shows the photo (or initial) ----
  var sess = (typeof gucoGetSession === 'function') ? gucoGetSession() : null;
  var chip = document.querySelector('.sidebar .user-chip');
  if (chip && sess && sess.email) {
    // turn the plain chip into a link to the right account page
    var link = document.createElement('a');
    link.className = 'user-chip user-chip-link';
    link.href = (typeof gucoAccountPageFor === 'function') ? gucoAccountPageFor(sess.role) : 'student-account.html';
    link.setAttribute('aria-label', 'Open my account');
    link.innerHTML = chip.innerHTML +
      '<svg class="chip-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
    chip.parentNode.replaceChild(link, chip);
    if (window.location.pathname.split('/').pop() === link.getAttribute('href')) link.classList.add('active');

    var chipEmail = link.querySelector('#user-email');
    if (chipEmail) chipEmail.textContent = sess.email;
    var roleLabel = link.querySelector('.user-role');
    if (roleLabel) roleLabel.textContent = 'My account';
    var av = link.querySelector('.user-avatar');
    if (av) {
      var photo = (typeof gucoGetAvatar === 'function') ? gucoGetAvatar(sess.email) : null;
      if (photo) {
        av.textContent = '';
        var img = document.createElement('img');
        img.src = photo; img.alt = '';
        av.appendChild(img);
        av.classList.add('has-photo');
      } else {
        av.textContent = (typeof gucoInitialFor === 'function') ? gucoInitialFor(sess.email, sess.role) : sess.email.charAt(0).toUpperCase();
      }
    }
    var badge = document.getElementById('portal-badge');
    if (badge) badge.textContent = sess.role === 'personnel' ? 'Personnel portal' : 'Admin portal';
  }

  // ---- hide sidebar links a personnel wasn't granted (admin sees everything) ----
  if (sess && sess.role === 'personnel' && typeof gucoCan === 'function') {
    document.querySelectorAll('.main-nav-links a[data-perm], .site-footer-links a[data-perm]').forEach(function (a) {
      var key = a.getAttribute('data-perm');
      var allowed = key === 'admin-only' ? false : gucoCan(key);
      if (!allowed) a.style.display = 'none';
    });
  }

  // ---- pending-accounts badge on "Account approvals" ----
  var pendBadge = document.getElementById('nav-pending-badge');
  if (pendBadge && sess && typeof gucoCan === 'function' && typeof gucoPendingAccounts === 'function' && gucoCan('accounts')) {
    var pn = gucoPendingAccounts().length;
    pendBadge.textContent = pn;
    pendBadge.hidden = pn === 0;
  }

  // ---- hotline card (student pages): on desktop the full-width crisis strip is
  //      hidden by CSS and the same numbers live in the sidebar instead ----
  var strip = document.querySelector('.crisis-strip');
  var navEl = document.querySelector('.sidebar nav.main-nav');
  if (strip && navEl && strip.nextElementSibling && strip.nextElementSibling.classList.contains('app-shell')) {
    var card = document.createElement('div');
    card.className = 'sidebar-hotline';
    card.innerHTML = '<strong>In crisis right now?</strong>' +
      '<p>NCMH Crisis Hotline, free and confidential, 24/7.</p>' +
      '<div class="hotline-nums"></div>';
    var nums = card.querySelector('.hotline-nums');
    strip.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
      var l = document.createElement('a');
      l.className = 'hotline-num';
      l.href = a.getAttribute('href');
      l.textContent = a.textContent;
      nums.appendChild(l);
    });
    var chip = navEl.querySelector('.user-chip');
    navEl.insertBefore(card, chip || null);
  }

  // ---- mobile menu toggle ----
  var sidebar = document.querySelector('.sidebar');
  var toggle = document.querySelector('.sidebar-toggle');
  if (sidebar && toggle) {
    toggle.addEventListener('click', function () {
      var open = sidebar.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? 'Close' : 'Menu';
    });
  }

  // ---- Counseling submenu ----
  var items = document.querySelectorAll('.nav-item[data-dropdown]');
  if (!items.length) return;

  items.forEach(function (item) {
    var link = item.querySelector(':scope > a');
    var caret = item.querySelector('.nav-caret');

    // Keep the submenu open on pages that belong to it (counseling + request forms)
    if (link && link.classList.contains('active')) item.classList.add('open');

    // Highlight the current sub-page on student-requests.html (?tab=sessions is the default)
    if (window.location.pathname.split('/').pop() === 'student-requests.html') {
      var tab = new URLSearchParams(window.location.search).get('tab') || 'sessions';
      item.querySelectorAll('.nav-dropdown a').forEach(function (a) {
        if (a.getAttribute('href').indexOf('tab=' + tab) !== -1) a.classList.add('active');
      });
    }

    if (caret) {
      caret.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        item.classList.toggle('open');
      });
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      items.forEach(function (item) {
        var link = item.querySelector(':scope > a');
        if (!(link && link.classList.contains('active'))) item.classList.remove('open');
      });
    }
  });
});

/* Data tables on phones: copy each column header onto its cells so the CSS can
   show them as "Label: value" cards. Re-runs whenever a page redraws a table. */
(function labelDataTables() {
  function label(table) {
    var headRow = [].slice.call(table.querySelectorAll('tr')).filter(function (r) { return r.querySelector('th'); })[0];
    if (!headRow) return;
    var names = [].slice.call(headRow.children).map(function (th) { return th.textContent.trim(); });
    [].slice.call(table.querySelectorAll('tr')).forEach(function (r) {
      [].slice.call(r.children).forEach(function (c, i) {
        if (c.tagName === 'TD' && c.getAttribute('data-label') !== (names[i] || '')) c.setAttribute('data-label', names[i] || '');
      });
    });
  }
  function all() { document.querySelectorAll('table.data').forEach(label); }
  function start() {
    all();
    var pending = false;
    var mo = new MutationObserver(function () {
      if (pending) return; pending = true;
      requestAnimationFrame(function () { pending = false; all(); });
    });
    document.querySelectorAll('table.data').forEach(function (t) { mo.observe(t, { childList: true, subtree: true }); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
