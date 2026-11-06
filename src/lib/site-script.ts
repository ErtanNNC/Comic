/**
 * JavaScript injected into the in-app browser (Keşfet tab).
 *
 * It doesn't depend on the site's markup: it finds Google Drive file IDs anywhere in
 * the page (iframes, links, data attributes, the URL itself) and guesses the episode
 * list as the largest group of sibling links that point to the same site. For "download
 * the whole series" it follows the pager (`/page/N/`) and fetches every episode page
 * from inside the WebView (same origin, so no CORS), then reports back.
 *
 * Kept as a plain string: Hermes release builds don't keep function source text.
 */
export const SITE_SCRIPT = String.raw`
(function () {
  if (window.__panel) return;
  var DRIVE_RE = /(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^"'\s]*?&(?:amp;)?)?id=)([A-Za-z0-9_-]{20,})/g;

  function post(msg) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
  }
  function text(el) { return (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim(); }

  function driveIds(html) {
    var out = [], seen = {}, m;
    DRIVE_RE.lastIndex = 0;
    while ((m = DRIVE_RE.exec(html))) { if (!seen[m[1]]) { seen[m[1]] = 1; out.push(m[1]); } }
    return out;
  }

  function pageTitle(doc) {
    var h1 = doc.querySelector('h1');
    return text(h1) || (doc.title || '').split(/\s+[|–-]\s+/)[0].trim();
  }

  // Episode-like links: same host, not nav/pager/category/tag/author/feed links.
  function isEpisodeHref(u) {
    if (u.host !== location.host) return false;
    var p = u.pathname;
    if (p === '/' || /\/(category|tag|author|page|feed|wp-|comments|search|kullanim|gizlilik|iletisim)/i.test(p)) return false;
    return /^\/\d{4}\/\d{2}\/(\d{2}\/)?[^\/]+\/?$/.test(p) || /\/(bolum|chapter|sayi|seri)[^\/]*\/?$/i.test(p);
  }

  function signature(el) {
    var parts = [];
    for (var i = 0; el && i < 3; i++, el = el.parentElement) parts.push(el.tagName + '.' + (el.getAttribute('class') || '').trim().split(/\s+/).sort().join('.'));
    return parts.join('<');
  }

  var listSignature = null;

  // True when every episode link inside el points at href.
  function onlyHref(el, href, base) {
    var as = el.querySelectorAll('a[href]');
    for (var i = 0; i < as.length; i++) {
      var u; try { u = new URL(as[i].getAttribute('href'), base); } catch (e) { continue; }
      if (isEpisodeHref(u) && u.origin + u.pathname !== href) return false;
    }
    return true;
  }

  // The episode list is the container holding the most episode links (sidebars,
  // headers and widgets excluded). Later pages prefer the same container shape.
  function episodeLinks(doc, base) {
    var anchors = Array.prototype.slice.call(doc.querySelectorAll('a[href]')).filter(function (a) {
      return !a.closest('aside, footer, nav, header, [class*="sidebar"], [class*="widget"], [id*="sidebar"]');
    });
    var groups = new Map();
    anchors.forEach(function (a) {
      var u; try { u = new URL(a.getAttribute('href'), base); } catch (e) { return; }
      if (!isEpisodeHref(u)) return;
      // Climb to the row that holds this episode (cover, title and "Oku" links all
      // point to the same URL); the row's parent is the list.
      var href0 = u.origin + u.pathname, item = a;
      while (item.parentElement && item.parentElement !== doc.body && onlyHref(item.parentElement, href0, base)) item = item.parentElement;
      var box = item.parentElement;
      if (!box) return;
      var g = groups.get(box);
      if (!g) { g = []; groups.set(box, g); }
      var href = href0;
      if (!g.some(function (x) { return x.url === href; })) {
        var t = text(a) || a.getAttribute('title') || '';
        if (!t) { var row = a.closest('li,article,tr,div'); t = text(row).slice(0, 140); }
        g.push({ url: href, title: t });
      }
    });
    var best = [], bestBox = null, sameShape = null;
    groups.forEach(function (g, box) {
      if (g.length > best.length) { best = g; bestBox = box; }
      if (listSignature && signature(box) === listSignature && (!sameShape || g.length > sameShape.length)) sameShape = g;
    });
    if (sameShape) return sameShape;
    if (best.length < 2) return [];
    if (!listSignature) listSignature = signature(bestBox);
    return best;
  }

  function isSeriesPage() {
    return /\/(category|seri|series|manga|comic|kategori)\//i.test(location.pathname);
  }

  function pagerUrls(doc, base) {
    var max = 1, tmpl = null;
    doc.querySelectorAll('a[href]').forEach(function (a) {
      var m = (a.getAttribute('href') || '').match(/^(.*\/page\/)(\d+)\/?(\?.*)?$/);
      if (m) { var n = +m[2]; if (n > max) max = n; tmpl = m[1]; }
    });
    var urls = [];
    if (tmpl) for (var i = 2; i <= Math.min(max, 60); i++) urls.push(new URL(tmpl + i + '/', base).href);
    return urls;
  }

  function scan() {
    var ids = driveIds(location.href + ' ' + document.documentElement.innerHTML);
    var eps = ids.length || !isSeriesPage() ? [] : episodeLinks(document, location.href);
    post({ type: 'page', url: location.href, title: pageTitle(document), driveIds: ids, episodeCount: eps.length, hasPager: pagerUrls(document, location.href).length > 0 });
  }

  async function fetchDoc(url) {
    var res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var html = await res.text();
    return { html: html, doc: new DOMParser().parseFromString(html, 'text/html') };
  }

  async function collectSeries() {
    try {
      var series = pageTitle(document);
      var eps = episodeLinks(document, location.href);
      var seen = {}; eps.forEach(function (e) { seen[e.url] = 1; });
      var pages = pagerUrls(document, location.href);
      for (var i = 0; i < pages.length; i++) {
        post({ type: 'progress', phase: 'list', done: i + 1, total: pages.length });
        try {
          var r = await fetchDoc(pages[i]);
          episodeLinks(r.doc, pages[i]).forEach(function (e) { if (!seen[e.url]) { seen[e.url] = 1; eps.push(e); } });
        } catch (e) { break; }
      }
      var items = [], failed = 0;
      for (var k = 0; k < eps.length; k++) {
        post({ type: 'progress', phase: 'episodes', done: k + 1, total: eps.length });
        try {
          var d = await fetchDoc(eps[k].url);
          var id = driveIds(d.html)[0];
          if (id) items.push({ driveId: id, title: pageTitle(d.doc) || eps[k].title, url: eps[k].url });
          else failed++;
        } catch (e) { failed++; }
      }
      post({ type: 'collected', series: series, items: items, failed: failed });
    } catch (e) {
      post({ type: 'error', message: String(e && e.message || e) });
    }
  }

  window.__panel = { scan: scan, collectSeries: collectSeries };
  scan();
  // Players are often injected late (lazy iframes); rescan for a few seconds.
  var n = 0, t = setInterval(function () { scan(); if (++n >= 5) clearInterval(t); }, 1200);
})();
true;
`;
