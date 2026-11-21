/* Phase 2: Tabs (Heute · Woche · Verlauf · Analyse · Material), Heute-Kaart, Wochenring, Form-Ampel, Schong.
   Liest NËMMEN den Dag-Raster vun der Säit (#tab-woche) an data/shoes.json, kee Strava, keng Gesondheetsdonnéeën im Klaren.
   Wichteg: Sync-Muster am HTML (`<div class="day `, `<span class="day-name">`) net änneren – hei nëmme gelies. */
(function () {
  var TABS = ['heute', 'woche', 'verlauf', 'analyse', 'material', 'alles'];
  var MON = ['Jan.', 'Feb.', 'Mäerz', 'Abr.', 'Mee', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  var WD = ['Sonndeg', 'Méindeg', 'Dënschdeg', 'Mëttwoch', 'Donneschdeg', 'Freideg', 'Samschdeg'];
  var SHORT = { 'Méindeg': 'Mé', 'Dënschdeg': 'Dë', 'Mëttwoch': 'Më', 'Donneschdeg': 'Do', 'Freideg': 'Fr', 'Samschdeg': 'Sa', 'Sonndeg': 'So' };
  function $(id) { return document.getElementById(id); }
  function num(v, d) { return (v == null ? '—' : v.toFixed(d).replace('.', ',')); }

  // ---- Tabs ----
  function cur() { var h = (location.hash || '').slice(1); if (h === 'formular') return 'material'; return TABS.indexOf(h) < 0 ? 'heute' : h; }
  function showTab() {
    var t = cur();
    TABS.forEach(function (x) { if (x !== 'analyse') document.body.classList.toggle('tab-' + x, x === t); });
    [].forEach.call(document.querySelectorAll('#bnav a'), function (a) {
      if (a.dataset.tab === t) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (t === 'verlauf' || t === 'alles') { var d = $('statsDetails'); if (d && !d.open) d.open = true; }
    if ((location.hash || '') === '#formular') {            // Knäppchen "Resultat / Krank agi" op Heute
      var fd = $('formDetails'); if (fd) { fd.open = true; setTimeout(function () { fd.scrollIntoView({ block: 'start' }); }, 50); }
    }   // Grafik gëtt erëscht beim Opmaachen gezeechent
  }
  window.addEventListener('hashchange', function () { showTab(); if ((location.hash || '') !== '#formular') window.scrollTo(0, 0); });
  showTab();

  // ---- Dag-Raster liesen ----
  function cards() { return [].slice.call(document.querySelectorAll('#tab-woche .days > .day')); }
  function info(c) {
    var sum = c.querySelector('.result-done .result-summary'), off = c.querySelector('.result-off');
    var s = '';
    if (sum) { var cl = sum.cloneNode(true); [].forEach.call(cl.querySelectorAll('.chev'), function (x) { x.remove(); }); s = cl.textContent.replace(/\s+/g, ' ').trim(); }
    var note = c.querySelector('.result-done .result-note');
    return {
      name: c.querySelector('.day-name').textContent.trim(),
      type: c.querySelector('.type') ? c.querySelector('.type').textContent.trim() : '',
      css: /\btype-(\w+)/.exec(c.querySelector('.type') ? c.querySelector('.type').className : '') ,
      desc: (c.querySelector('.desc') ? c.querySelector('.desc').textContent : '').trim(),
      done: !!sum, doneText: s, doneNote: note ? note.textContent.split('\n')[0].trim() : '',
      off: !!off, offText: off ? off.textContent.trim() : '',
      rest: c.classList.contains('rescht')
    };
  }
  function ymd(d) { return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }
  function statValue(label) {
    var r = null;
    [].forEach.call(document.querySelectorAll('#tab-verlauf .stat'), function (s) {
      var l = s.querySelector('.label'); if (l && l.textContent.replace(/\s+/g, ' ').trim() === label && !r) r = s.querySelector('.value').textContent.trim();
    });
    return r;
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  // ---- Heute ----
  function render(week) {
    var root = $('heute'); if (!root) return;
    var cs = cards().map(info);
    var now = new Date(), tIdx = -1;
    if (week && week.days) week.days.forEach(function (d, i) { if (d.date === ymd(now)) tIdx = i; });
    else { cs.forEach(function (c, i) { if (c.name === WD[now.getDay()]) tIdx = i; }); }
    var html = $('formDetails') ? '<a class="hd-form" href="#formular">Resultat oder Krank / Ausgelooss aginn</a>' : '';
    if (tIdx < 0 || !cs[tIdx]) {
      html += '<div class="card hd"><div class="hd-top"><span class="hd-day">' + WD[now.getDay()] + ' · ' + now.getDate() + '. ' + MON[now.getMonth()] + '</span></div>' +
        '<div class="hd-desc">Haut ass kee Plang an der aktueller Woch. De Plang fir déi nei Woch kënnt, soubal de Coach en schéckt.</div></div>';
    } else {
      var c = cs[tIdx], state;
      if (c.done) state = '<div class="hd-state done">&#10003; ' + esc(c.doneText) + (c.doneNote ? '<small>' + esc(c.doneNote) + '</small>' : '') + '</div>';
      else if (c.off) state = '<div class="hd-state off">' + esc(c.offText) + '</div>';
      else if (c.rest) state = '<div class="hd-state rest">Rescht-Dag</div>';
      else state = '<div class="hd-state open">Nach oppen</div>';
      var nx = cs[tIdx + 1];
      html += '<div class="card hd"><div class="hd-top"><span class="hd-day">' + c.name + ' · ' + now.getDate() + '. ' + MON[now.getMonth()] + '</span>' +
        (c.type ? '<span class="type type-' + (c.css ? c.css[1] : 'rescht') + '">' + esc(c.type) + '</span>' : '') + '</div>' +
        '<div class="hd-desc">' + esc(c.desc) + '</div>' + state +
        (nx ? '<div class="hd-next">Muer: ' + esc(nx.type) + (nx.desc ? ' · ' + esc(nx.desc.split('\n')[0]) : '') + '</div>' : '') + '</div>';
    }
    // Wochenring: Sessiounen gemaach vun geplangten
    var planned = cs.filter(function (c) { return !c.rest || c.done; }).length, done = cs.filter(function (c) { return c.done; }).length;
    var C = 2 * Math.PI * 34, frac = planned ? Math.min(1, done / planned) : 0;
    var km = statValue('Distanz Woch');
    html += '<div class="card hd"><p class="hd-title">Dës Woch</p><div class="ring-row"><div class="ring"><svg viewBox="0 0 84 84"><circle class="bg" cx="42" cy="42" r="34"/>' +
      '<circle class="fg" cx="42" cy="42" r="34" stroke-dasharray="' + (C * frac).toFixed(1) + ' ' + C.toFixed(1) + '"/></svg><b>' + done + '/' + planned + '</b></div>' +
      '<div class="ring-side"><p><b>' + done + '</b> vun ' + planned + ' Sessiounen gemaach</p>' + (km ? '<p><b>' + esc(km) + '</b> dës Woch</p>' : '') + '</div></div><div class="dots">' +
      cs.map(function (c, i) {
        var k = c.done ? 'done' : c.off ? 'off' : c.rest ? 'rest' : '';
        return '<div class="dot ' + k + (i === tIdx ? ' today' : '') + '"><i></i>' + (SHORT[c.name] || c.name.slice(0, 2)) + '</div>';
      }).join('') + '</div></div>';
    html += '<div id="heuteForm"></div><div id="heuteSchong"></div>';
    root.innerHTML = html;
    formCard(); schongCard();
  }

  // ---- Form-Ampel (nëmmen wann de Schlëssel um Apparat gespäichert ass) ----
  function formCard() {
    var box = $('heuteForm');
    if (!box || !window.TrainingAnalyse) return;
    window.TrainingAnalyse.silentForm().then(function (fl) {
      if (!fl) return;
      var t = fl.tsb, lamp = t >= 0 ? 'g' : t >= -30 ? 'o' : 'r';
      var txt = t > 10 ? 'ganz frësch' : t >= -10 ? 'ausgewoge' : t >= -30 ? 'midd, awer am Opbau' : 'staark midd';
      box.innerHTML = '<div class="card hd"><p class="hd-title">Form</p><div class="form-row"><span class="lamp ' + lamp + '"></span><div><p><b>' + (t > 0 ? '+' : '') + Math.round(t) + '</b> · ' + txt +
        '</p><small>Fitness ' + Math.round(fl.ctl) + ' · Middegkeet ' + Math.round(fl.atl) + ' (Detailer ënner Analyse)</small></div></div></div>';
    });
  }

  // ---- Schong ----
  var shoeData = null;
  function barHtml(s, d) {
    var pct = Math.min(100, s.km / d.red_km * 100);
    return '<div class="bar ' + (s.state === 'ok' ? '' : s.state) + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>';
  }
  function lastRun(s) { if (!s.last_run) return 'nach net gelaf (zënter Start vun der Zielung)'; var p = s.last_run.split('-'); return 'lescht Laf ' + parseInt(p[2], 10) + '. ' + MON[parseInt(p[1], 10) - 1]; }
  function tag(s, d) { return s.state === 'red' ? '<span class="shoe-tag red">Zäit fir ze tauschen (' + d.red_km + ' km)</span>' : s.state === 'warn' ? '<span class="shoe-tag warn">Bal tauschen (' + d.warn_km + ' km)</span>' : ''; }
  function shoeBlock(s, d, isCur) {
    return '<div class="card shoe"><div class="shoe-head"><b>' + esc(s.nick) + (isCur ? '<span class="shoe-cur">aktuell</span>' : '') + '</b><span>' + num(s.km, s.km < 100 ? 1 : 0) + ' km</span></div>' +
      barHtml(s, d) + '<small>' + esc(s.model) + ' · ' + lastRun(s) + '</small>' + tag(s, d) + '</div>';
  }
  function schongCard() {
    if (!shoeData) return;
    var d = shoeData, cur = d.shoes.filter(function (s) { return s.nick === d.current; })[0];
    var h = $('heuteSchong');
    if (h && cur) h.innerHTML = '<p class="hd-title" style="margin:16px 0 8px;">Aktuell Schong</p>' + shoeBlock(cur, d, false);
    var m = $('schuhe');
    if (m) m.innerHTML = d.shoes.map(function (s) { return shoeBlock(s, d, s.nick === d.current); }).join('') +
      '<p class="empty" style="padding:0 0 8px;">Kilometer: Startwäert + FIT-Sessiounen (Schong gëtt bei all Laf gefrot). Gielen Balken ab ' + d.warn_km + ' km, roude ab ' + d.red_km + ' km.</p>';
  }
  function getJson(u) { return fetch(u + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }

  render(null);
  getJson('data/current-week.json').then(function (w) { if (w) render(w); });
  getJson('data/shoes.json').then(function (d) { if (d && d.shoes) { shoeData = d; schongCard(); } else { var m = $('schuhe'); if (m) m.innerHTML = '<p class="empty">Nach keng Schong-Donnéeën.</p>'; } });
})();
