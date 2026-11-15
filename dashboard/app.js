// Token Launch Radar — dashboard app. Plain JS, no dependencies.
// Data comes from window.BOARD (compact arrays written by main.ts):
// [slug, name, rank, implied, tvl, change_7d, category, chains joined by "|",
//  age_days, category_multiple, watchlistFlag]
(function () {
  'use strict';
  var BOARD = window.BOARD || [];
  var META = window.BOARD_META || { as_of: '', rows: BOARD.length };

  function toObj(a) {
    return { slug: a[0], name: a[1], rank: a[2], implied: a[3], tvl: a[4], change: a[5], category: a[6], chains: a[7] ? a[7].split('|') : [], age: a[8], mult: a[9], watch: a[10] === 1 };
  }
  var rows = BOARD.map(toObj);

  function $(id) { return document.getElementById(id); }
  var tbody = $('rows'), detailEl = $('detail'), countEl = $('count');
  var qEl = $('q'), catEl = $('category'), chainEl = $('chain'), watchEl = $('watchlist'), sortEl = $('sort');
  var currentDetail = '';

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
    return '$' + n;
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (!days) return '—';
    if (days < 365) return days + 'd';
    return (days / 365.25).toFixed(1) + 'y';
  }

  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) === -1) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) === -1) chains.push(c); });
  });
  cats.sort(); chains.sort();
  cats.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; catEl.appendChild(o); });
  chains.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; chainEl.appendChild(o); });

  function stateFromHash() {
    var h = window.location.hash || '';
    var s = { q: '', category: '', chain: '', watch: false, sort: 'rank', detail: '' };
    if (h.indexOf('#detail/') === 0) { s.detail = decodeURIComponent(h.slice(8)); return s; }
    h.replace(/^#/, '').split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv.length !== 2) return;
      var k = kv[0], v = decodeURIComponent(kv[1].replace(/\+/g, ' '));
      if (k === 'q') s.q = v;
      else if (k === 'category') s.category = v;
      else if (k === 'chain') s.chain = v;
      else if (k === 'watchlist') s.watch = v === '1';
      else if (k === 'sort') s.sort = v;
    });
    return s;
  }

  function hashFromState(s) {
    if (s.detail) return '#detail/' + encodeURIComponent(s.detail);
    var parts = [];
    if (s.q) parts.push('q=' + encodeURIComponent(s.q));
    if (s.category) parts.push('category=' + encodeURIComponent(s.category));
    if (s.chain) parts.push('chain=' + encodeURIComponent(s.chain));
    if (s.watch) parts.push('watchlist=1');
    if (s.sort && s.sort !== 'rank') parts.push('sort=' + encodeURIComponent(s.sort));
    return parts.length ? '#' + parts.join('&') : '#';
  }

  function currentState() {
    return { q: qEl.value, category: catEl.value, chain: chainEl.value, watch: watchEl.checked, sort: sortEl.value, detail: currentDetail };
  }

  function filtered(s) {
    var q = s.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (s.watch && !r.watch) return false;
      if (s.category && r.category !== s.category) return false;
      if (s.chain && r.chains.indexOf(s.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = s.sort || 'rank';
    list.sort(function (a, b) {
      if (key === 'implied') return b.implied - a.implied;
      if (key === 'tvl') return b.tvl - a.tvl;
      if (key === 'change_7d') return (b.change || 0) - (a.change || 0);
      if (key === 'age') return b.age - a.age;
      return a.rank - b.rank;
    });
    return list;
  }

  function showDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) { detailEl.hidden = true; detailEl.innerHTML = ''; return; }
    var growth = 1 + 0.5 * clamp(r.change === null || r.change === undefined ? 0 : r.change, -50, 100) / 100;
    var ageF = 1 + 0.04 * Math.min(r.age / 365.25, 5);
    var steps = window.farmStepsFor ? window.farmStepsFor({ slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl }) : [];
    var stepsHtml = steps.map(function (st) { return '<li>' + esc(st) + '</li>'; }).join('');
    detailEl.innerHTML =
      '<h2>' + esc(r.name) + ' <span class="slug">' + esc(r.slug) + '</span></h2>' +
      '<p class="meta">Rank #' + r.rank + ' · ' + esc(r.category || '—') + ' · ' + esc(r.chains.join(', ')) + (r.watch ? ' · ★ Watchlist' : '') + '</p>' +
      '<p>This protocol records no token.</p>' +
      '<dl>' +
      '<dt>Implied value</dt><dd>' + fmtUsd(r.implied) + '</dd>' +
      '<dt>TVL</dt><dd>' + fmtUsd(r.tvl) + '</dd>' +
      '<dt>7d change</dt><dd>' + fmtPct(r.change) + '</dd>' +
      '<dt>Age</dt><dd>' + r.age + ' days</dd>' +
      '<dt>Category multiple</dt><dd>' + r.mult + '</dd>' +
      '</dl>' +
      '<p class="model">Model: TVL × category multiple × growth × age = implied — ' + fmtUsd(r.tvl) + ' × ' + r.mult + ' × ' + growth.toFixed(3) + ' × ' + ageF.toFixed(3) + ' = ' + fmtUsd(r.implied) + '</p>' +
      '<h3>Farm steps</h3><ol>' + stepsHtml + '</ol>' +
      '<p><a href="#">← Back to board</a></p>';
    detailEl.hidden = false;
  }

  function render(s) {
    var list = filtered(s);
    var html = '';
    list.forEach(function (r) {
      var chainsTxt = r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '');
      html += '<tr data-slug="' + esc(r.slug) + '"' + (r.watch ? ' class="watch"' : '') + '><td>' + r.rank + (r.watch ? ' ★' : '') + '</td><td>' + esc(r.name) + '<span class="slug">' + esc(r.slug) + '</span></td><td>' + esc(r.category || '—') + '</td><td>' + esc(chainsTxt) + '</td><td>' + fmtUsd(r.tvl) + '</td><td class="' + (r.change > 0 ? 'up' : r.change < 0 ? 'down' : '') + '">' + fmtPct(r.change) + '</td><td>' + fmtUsd(r.implied) + '</td><td>' + fmtAge(r.age) + '</td></tr>';
    });
    tbody.innerHTML = html || '<tr><td colspan="8">No protocols match the filters.</td></tr>';
    countEl.textContent = 'Showing ' + list.length + ' of ' + rows.length + ' protocols · snapshot ' + META.as_of;
    if (s.detail) showDetail(s.detail);
    else { detailEl.hidden = true; detailEl.innerHTML = ''; }
  }

  function applyFromHash() {
    var s = stateFromHash();
    qEl.value = s.q; catEl.value = s.category; chainEl.value = s.chain; watchEl.checked = s.watch; sortEl.value = s.sort || 'rank';
    currentDetail = s.detail || '';
    render({ q: s.q, category: s.category, chain: s.chain, watch: s.watch, sort: s.sort || 'rank', detail: currentDetail });
  }

  function onControl() {
    var s = currentState();
    s.detail = '';
    currentDetail = '';
    try { window.history.replaceState(null, '', hashFromState(s)); } catch (e) { /* ignore */ }
    render(s);
  }

  [qEl, catEl, chainEl, watchEl, sortEl].forEach(function (el) {
    el.addEventListener('input', onControl);
    el.addEventListener('change', onControl);
  });
  tbody.addEventListener('click', function (ev) {
    var tr = ev.target.closest ? ev.target.closest('tr[data-slug]') : null;
    if (!tr) return;
    currentDetail = tr.getAttribute('data-slug');
    var s = currentState(); s.detail = currentDetail;
    try { window.history.replaceState(null, '', hashFromState(s)); } catch (e) { /* ignore */ }
    render(s);
    detailEl.scrollIntoView();
  });
  detailEl.addEventListener('click', function (ev) {
    if (ev.target.tagName === 'A') { ev.preventDefault(); currentDetail = ''; onControl(); }
  });
  window.addEventListener('hashchange', applyFromHash);

  var asofEl = $('asof');
  if (asofEl) asofEl.textContent = META.as_of || '';
  var rowsEl = $('rowcount');
  if (rowsEl) rowsEl.textContent = String(rows.length);
  applyFromHash();
})();
