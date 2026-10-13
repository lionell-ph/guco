/* ==========================================================================
   api.js - how the pages talk to the GUCO server (which stores everything in MySQL).

   Loaded before auth.js and requests.js on every page.

   The pages were written to read and save data with plain function calls
   (gucoGetPeers() returns the list, gucoSavePeer(...) saves). To keep every page
   working exactly as before, these helpers make the same calls to the server
   synchronously. Each page only ever asks for a few small lists, so this is fast
   on a campus network.
     gucoGet(url, fallback)       - read (cached for the life of the page)
     gucoSend(method, url, body)  - write; clears the cache so the next read is fresh
   Nothing sensitive is kept in the browser: the session lives in an HttpOnly cookie
   the page cannot read, and who may do what is decided by the server, not by this code.
   ========================================================================== */

var GUCO_CACHE = {};
var GUCO_PUBLIC_PAGES = ["login.html", "signup.html", "forgot-password.html", "reset-password.html", "index.html", ""];

function gucoOnPublicPage() {
  var page = window.location.pathname.split("/").pop();
  return GUCO_PUBLIC_PAGES.indexOf(page) !== -1;
}

/* One request. Returns { ok, status, data, error }. Never throws. */
function gucoHttp(method, url, body) {
  var xhr = new XMLHttpRequest();
  try {
    xhr.open(method, url, false);
    xhr.setRequestHeader("Accept", "application/json");
    if (method !== "GET") {
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");   // required by the server on every write
    }
    xhr.send(body === undefined ? null : JSON.stringify(body));
  } catch (e) {
    return { ok: false, status: 0, data: null, error: "Can't reach the server. Check your connection and try again." };
  }
  var data = null;
  try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (e2) { /* not JSON */ }
  var ok = xhr.status >= 200 && xhr.status < 300;
  if (xhr.status === 401 && !gucoOnPublicPage()) {      // the session ended: back to sign-in
    window.location.replace("login.html");
  }
  return {
    ok: ok, status: xhr.status, data: data,
    error: ok ? "" : ((data && data.error) || "Something went wrong. Please try again.")
  };
}

function gucoGet(url, fallback) {
  if (Object.prototype.hasOwnProperty.call(GUCO_CACHE, url)) return GUCO_CACHE[url];
  var r = gucoHttp("GET", url);
  var value = r.ok && r.data !== null ? r.data : fallback;
  if (r.ok || r.status === 403 || r.status === 401) GUCO_CACHE[url] = value;   // don't remember network failures
  return value;
}

/* opts.silent = true when the caller shows the error itself; otherwise a failed save is announced. */
function gucoSend(method, url, body, opts) {
  var r = gucoHttp(method, url, body === undefined ? {} : body);
  GUCO_CACHE = {};
  if (!r.ok && !(opts && opts.silent) && r.status !== 401) window.alert(r.error);
  return r;
}

function gucoForget() { GUCO_CACHE = {}; }
