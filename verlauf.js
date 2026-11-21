/* Phase 3 / Stufe A: Tab "Verlauf" – Wochenbalken (12 Wochen), Serie, Kalenner-Heatmap.
   Liest NËMMEN, wat schonn ëffentlech um Dashboard steet: WEEK_HISTORY, Archiv-Wochen (Dag-Kaarten) an déi aktuell Woch.
   Keng Gesondheetsdonnéeën, kee Strava. Wichteg: Sync-Muster am HTML net änneren – hei nëmme gelies. */
(function () {
  var MONTHS = { 'Januar': 0, 'Februar': 1, 'Mäerz': 2, 'Abrëll': 3, 'Mee': 4, 'Juni': 5, 'Juli': 6, 'August': 7, 'September': 8, 'Oktober': 9, 'November': 10, 'Dezember': 11 };
  var MSHORT = ['Jan.', 'Feb.', 'Mäerz', 'Abr.', 'Mee', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  var WD = ['Méindeg', 'Dënschdeg', 'Mëttwoch', 'Donneschdeg', 'Freideg', 'Samschdeg', 'Sonndeg'];
  var WDS = ['Mé', 'Dë', 'Më', 'Do', 'Fr', 'Sa', 'So'];
  var COL = { laaf: '29,158,117', velo: '239,159,39', schwamm: '47,168,201', kraft: '127,119,221' };
  var REF = { laaf: 14, velo: 60, schwamm: 2 };               // km, bei deem d'Faarf voll ass
  var SPORT = { 'Laafen': 'laaf', 'Rad': 'velo', 'Schwammen': 'schwamm', 'Kraft': 'kraft' };
  var SNAME = { laaf: 'Laafen', velo: 'Vëlo', schwamm: 'Schwammen', kraft: 'Kraft' };
  var MIN_DEEG = 4;                                           // Serie: Woch zielt, wann ≥ 4 Deeg mat Resultat
  var root = document.getElementById('verlaufExtra');
  if (!root) return;
  var drawn = false, chart = null, days = [], dayByKey = {};

  function $(s, r) { return (r || document).querySelector(s); }
  function all(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function nf(v, d) { return v.toFixed(d).replace('.', ','); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  // "9. - 15. November 2026" / "26. Oktober - 1. November 2026" -> Méindeg als Date
  function startOf(txt) {
    var m = /(\d+)\.\s*(?:([A-Za-zÄäËëÖöÜü]+)\s*)?-\s*(\d+)\.\s*([A-Za-zÄäËëÖöÜü]+)\s+(\d{4})/.exec(txt);
    if (!m) return null;
    var em = MONTHS[m[4]], sm = m[2] ? MONTHS[m[2]] : em, y = +m[5];
    if (sm == null || em == null) return null;
    if (sm > em) y -= 1;
    return new Date(y, sm, +m[1]);
  }
  function cardInfo(c) {
    var name = $('.day-name', c).textContent.trim();
    var sum = $('.result-done .result-summary', c), off = $('.result-off', c);
    var o = { idx: WD.indexOf(name), done: false, off: !!off, km: 0, sport: null, sports: [], text: '', plan: ($('.desc', c) || { textContent: '' }).textContent.trim(), rest: c.classList.contains('rescht') };
    if (sum) {
      var cl = sum.cloneNode(true); all('.chev', cl).forEach(function (x) { x.remove(); });
      var t = cl.textContent.replace(/\s+/g, ' ').replace('✓', '').trim();
      o.done = true; o.text = t;
      var m = /^([\d.,]+)\s*km\s*·\s*(.+)$/.exec(t);
      if (m) { o.km = parseFloat(m[1].replace('.', '').replace(',', '.')) || 0; o.sports = m[2].split(' + '); }
      else { o.sports = [t]; }
      o.sport = SPORT[o.sports[0].trim()] || 'laaf';
    } else if (off) { o.text = off.textContent.replace(/\s+/g, ' ').trim(); }
    return o;
  }
  function collect(week) {
    var out = [];
    // Archiv: all Woch mat "Woch N · …" am Summary
    all('#tab-verlauf details.week').forEach(function (d) {
      var s = $(':scope > summary', d); if (!s) return;
      var m = /^Woch\s+(\d+)/.exec(s.textContent.trim()); if (!m) return;
      var st = startOf(s.textContent); if (!st) return;
      var w = { n: +m[1], start: st, days: [] };
      all('.days > .day', d).forEach(function (c) { var i = cardInfo(c); if (i.idx >= 0) { i.date = new Date(st.getFullYear(), st.getMonth(), st.getDate() + i.idx); w.days.push(i); } });
      out.push(w);
    });
    // aktuell Woch: Dag-Kaarten am Tab "Woche" + current-week.json
    if (week && week.days && week.days.length) {
      var d0 = week.days[0].date, st2 = new Date(+d0.slice(0, 4), +d0.slice(4, 6) - 1, +d0.slice(6, 8));
      var cw = { n: +(/\d+/.exec(week.week_label) || [0])[0], start: st2, days: [], current: true };
      all('#tab-woche .days > .day').forEach(function (c) { var i = cardInfo(c); if (i.idx >= 0) { i.date = new Date(st2.getFullYear(), st2.getMonth(), st2.getDate() + i.idx); cw.days.push(i); } });
      out.push(cw);
    }
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }

  function streak(weeks) {
    var ok = weeks.map(function (w) { return { n: w.n, cur: !!w.current, ok: w.days.filter(function (d) { return d.done; }).length >= MIN_DEEG }; });
    var longest = 0, run = 0;
    ok.forEach(function (w) { if (w.ok) { run++; if (run > longest) longest = run; } else if (!w.cur) { run = 0; } });
    // aktuell Serie: vun hannen, déi lafend Woch bricht net of, wann se nach net voll ass
    var cur = 0, i = ok.length - 1;
    if (i >= 0 && ok[i].cur) { if (ok[i].ok) cur++; i--; }
    for (; i >= 0 && ok[i].ok; i--) cur++;
    return { cur: cur, longest: longest };
  }

  function html(weeks, st) {
    var h = '<h2 class="first">Wochen an Zuelen</h2><div class="card vl-card"><div class="vl-chart"><canvas id="vlChart"></canvas></div>' +
      '<p class="vl-how"><b>Wéi liesen:</b> All Balken ass eng Woch (Kilometer, gestapelt no Sport). Déi lescht Woch ass nach net fäerdeg.</p></div>';
    h += '<div class="vl-row"><div class="card vl-stat"><p class="hd-title">Serie</p><p class="vl-big">' + st.cur + (st.cur === 1 ? ' Woch' : ' Wochen') + '</p><small>an engem Rei mat mindestens ' + MIN_DEEG +
      ' Deeg mat Resultat. Längst Serie: ' + st.longest + '.</small></div>';
    var sess = 0, km = 0; weeks.forEach(function (w) { w.days.forEach(function (d) { if (d.done) { sess++; km += d.km; } }); });
    h += '<div class="card vl-stat"><p class="hd-title">Zënter Ufank</p><p class="vl-big">' + sess + '</p><small>Trainingsdeeg mat Resultat, ' + nf(km, 0) + ' km.</small></div></div>';
    h += '<h2>Kalenner</h2><div class="card vl-card"><div class="vl-heat-wrap" id="vlHeatWrap"><div class="vl-heat" id="vlHeat"></div></div>' +
      '<div class="vl-legend"><span><i style="background:rgb(' + COL.laaf + ')"></i>Laafen</span><span><i style="background:rgb(' + COL.velo + ')"></i>Vëlo</span><span><i style="background:rgb(' + COL.schwamm + ')"></i>Schwammen</span><span><i style="background:rgb(' + COL.kraft + ')"></i>Kraft</span><span><i class="off"></i>ausgelooss</span></div>' +
      '<p class="vl-how"><b>Wéi liesen:</b> Eng Spalt ass eng Woch (Méindeg uewen). Hellegkeet = Distanz. Op en Dag tippen fir Detailer.</p><div class="vl-detail" id="vlDetail">Tipp op en Dag.</div></div>';
    return h;
  }

  function heat(weeks) {
    var el = document.getElementById('vlHeat'); if (!el) return;
    var n = weeks.length, rows = '', lab = '', lastM = -1;
    el.style.gridTemplateColumns = 'repeat(' + n + ', 15px)';
    var cells = '';
    weeks.forEach(function (w, ci) {
      var m = w.start.getMonth();
      lab += '<span class="vl-m" style="grid-column:' + (ci + 1) + ';">' + (m !== lastM ? MSHORT[m] : '') + '</span>'; lastM = m;
      var byIdx = {}; w.days.forEach(function (d) { byIdx[d.idx] = d; });
      for (var r = 0; r < 7; r++) {
        var d = byIdx[r], date = new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate() + r), key = ymd(date);
        var st = 'grid-column:' + (ci + 1) + ';grid-row:' + (r + 2) + ';', cls = 'vl-c';
        if (d && d.done) {
          var c = COL[d.sport] || COL.laaf, a = d.sport === 'kraft' || !d.km ? 0.55 : Math.min(1, 0.3 + d.km / (REF[d.sport] || 14) * 0.7);
          st += 'background:rgba(' + c + ',' + a.toFixed(2) + ');';
        } else if (d && d.off) { cls += ' off'; }
        else if (date > new Date()) { cls += ' fut'; }
        dayByKey[key] = d ? { d: d, date: date } : { d: null, date: date };
        cells += '<button type="button" class="' + cls + '" style="' + st + '" data-k="' + key + '" aria-label="' + key + '"></button>';
      }
    });
    el.innerHTML = lab + cells;
    el.style.gridTemplateRows = '12px repeat(7, 15px)';
    var wrap = document.getElementById('vlHeatWrap'); wrap.scrollLeft = wrap.scrollWidth;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var o = dayByKey[b.getAttribute('data-k')], box = document.getElementById('vlDetail'); if (!o) return;
      var dt = o.date, head = WDS[(dt.getDay() + 6) % 7] + ' ' + dt.getDate() + '. ' + MSHORT[dt.getMonth()];
      var t;
      if (o.d && o.d.done) t = '<b>' + head + '</b> · ' + esc(o.d.text) + (o.d.plan ? '<br><small>Plang: ' + esc(o.d.plan.split('\n')[0]) + '</small>' : '');
      else if (o.d && o.d.off) t = '<b>' + head + '</b> · ' + esc(o.d.text);
      else if (o.d && o.d.rest) t = '<b>' + head + '</b> · Rescht-Dag' + (o.d.plan ? ' (' + esc(o.d.plan.split('\n')[0]) + ')' : '');
      else t = '<b>' + head + '</b> · ' + (dt > new Date() ? 'nach net' : 'kee Resultat');
      box.innerHTML = t;
    });
  }

  function bars() {
    var cv = document.getElementById('vlChart'); if (!cv || !window.Chart || !window.WEEK_HISTORY) return;
    var wh = window.WEEK_HISTORY.slice(-12);
    if (chart) chart.destroy();
    chart = new Chart(cv.getContext('2d'), {
      type: 'bar',
      data: { labels: wh.map(function (w, i) { return w.label.replace('Woch ', 'W') + (i === wh.length - 1 ? '*' : ''); }),
        datasets: [
          { label: 'Laafen', data: wh.map(function (w) { return w.laafen; }), backgroundColor: 'rgb(' + COL.laaf + ')', stack: 's' },
          { label: 'Vëlo', data: wh.map(function (w) { return w.velo; }), backgroundColor: 'rgb(' + COL.velo + ')', stack: 's' },
          { label: 'Schwammen (rietsch)', type: 'line', yAxisID: 'y1', data: wh.map(function (w) { return w.schwammen; }), borderColor: 'rgb(' + COL.schwamm + ')', backgroundColor: 'rgb(' + COL.schwamm + ')', pointRadius: 3.5, borderWidth: 2, tension: 0.2 }] },
      options: { responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Laafen + Vëlo (km)', font: { size: 11 } } },
          y1: { position: 'right', beginAtZero: true, grid: { display: false }, title: { display: true, text: 'Schwammen (km)', color: 'rgb(' + COL.schwamm + ')', font: { size: 11 } }, ticks: { color: 'rgb(' + COL.schwamm + ')' } } },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
          tooltip: { callbacks: { footer: function (it) { var t = 0; it.forEach(function (i) { if (i.dataset.yAxisID !== 'y1') t += i.raw; }); return 'Laafen + Vëlo ' + nf(t, 1) + ' km'; } } } } }
    });
  }

  function draw(week) {
    if (drawn) return; drawn = true;
    var weeks = collect(week);
    if (!weeks.length) { root.innerHTML = ''; return; }
    root.innerHTML = html(weeks, streak(weeks));
    heat(weeks); bars();
  }
  function visible() { var c = document.body.className; return /tab-(verlauf|alles)/.test(c); }
  var weekData = null, fetched = false;
  function go() {
    if (drawn || !visible()) return;
    if (!fetched) {
      fetched = true;
      fetch('data/current-week.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        .then(function (w) { weekData = w; draw(weekData); });
    }
  }
  window.addEventListener('hashchange', function () { setTimeout(go, 0); });
  window.addEventListener('load', function () { setTimeout(go, 0); });
  setTimeout(go, 0);
})();
