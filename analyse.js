// Tab "Analyse": verschlësselt FIT-Analyse (data/analyse.enc.json, gemaach vun analyse_verschlesselen.py).
// Entschlësselt gëtt just am Browser (WebCrypto); ouni Passwuert gesäit een näischt.
(function () {
  var ENC_URL = 'data/analyse.enc.json';
  var SPORTS = ['Laafen', 'Rad', 'Schwammen', 'Kraft'];
  var SNAME = { Laafen: 'Laafen', Rad: 'Vëlo', Schwammen: 'Schwammen', Kraft: 'Kraft' };
  var SCOL = { Laafen: '#1d9e75', Rad: '#ef9f27', Schwammen: '#2fa8c9', Kraft: '#7f77dd' };
  var GOOD = '#1d9e75', MID = '#e0b43a', BAD = '#d4574a', MUTED = '#b4b2a9', INK = '#1a1a18';
  var MON = ['Jan.', 'Feb.', 'Mäe.', 'Abr.', 'Mee', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

  // ---- Zuelen a Datumer op Lëtzebuergesch ----
  function num(v, d) { return v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\./g, ' '); }
  function day(s) { var d = new Date(s + 'T00:00:00Z'); return d.getUTCDate() + '. ' + MON[d.getUTCMonth()]; }
  function hm(min) { if (min == null) return ''; var m = Math.round(min); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); }
  function sum(a, f) { return a.reduce(function (s, r) { return s + (f(r) || 0); }, 0); }
  function mean(a, f) { return a.length ? sum(a, f) / a.length : null; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function label(r) { return day(r.date) + ' · ' + (SNAME[r.sport] || r.sport) + ' ' + num(r.km, 1) + ' km'; }

  // ---- Tabs ----
  var root = document.getElementById('analyse');
  function showTab() {
    var on = location.hash === '#analyse';
    document.body.classList.toggle('tab-analyse', on);
    document.querySelectorAll('.tabs a').forEach(function (a) {
      if ((a.getAttribute('href') === '#analyse') === on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (on && !root.dataset.started) { root.dataset.started = '1'; start(); }
  }
  window.addEventListener('hashchange', showTab);
  showTab();

  // ---- Schlëssel um Apparat verhalen (IndexedDB, net exportéierbar) ----
  function idb(mode, fn) {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open('training-analyse', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('k'); };
        rq.onerror = function () { res(null); };
        rq.onsuccess = function () {
          try {
            var tx = rq.result.transaction('k', mode), r = fn(tx.objectStore('k'));
            tx.oncomplete = function () { res(r && r.result); };
            tx.onerror = tx.onabort = function () { res(null); };
          } catch (e) { res(null); }
        };
      } catch (e) { res(null); }
    });
  }
  var keyGet = function () { return idb('readonly', function (s) { return s.get('key'); }); };
  var keyPut = function (v) { return idb('readwrite', function (s) { s.put(v, 'key'); }); };
  var keyDel = function () { return idb('readwrite', function (s) { s.delete('key'); }); };

  function b64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function derive(pw, enc, extractable) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(enc.salt), iterations: enc.iter },
        base, { name: 'AES-GCM', length: 256 }, extractable, ['decrypt']);
    });
  }
  function decrypt(key, enc) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct)).then(function (buf) {
      return JSON.parse(new TextDecoder().decode(buf));
    });
  }

  function start() {
    root.replaceChildren(el('p', 'empty', 'Lueden …'));
    fetch(ENC_URL + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (enc) {
      return keyGet().then(function (saved) {
        if (saved && saved.salt === enc.salt) {
          return decrypt(saved.key, enc).then(function (data) { render(data, enc); }, function () { keyDel(); lock(enc); });
        }
        lock(enc);
      });
    }).catch(function () {
      root.replaceChildren(el('p', 'empty', 'D’Analyse-Donnéeën konnten net geluede ginn.'));
    });
  }

  function lock(enc) {
    var card = el('div', 'card an-lock');
    card.innerHTML = '<p><strong>Analyse ass gespaart.</strong> Hei stinn Gesondheetsdonnéeën aus der Auer (Pulszonen, Ustrengung, Drift). Si sinn verschlësselt a ginn just op dësem Apparat mam Passwuert opgemaach.</p>' +
      '<form><input type="password" autocomplete="current-password" placeholder="Passwuert" aria-label="Passwuert" required>' +
      '<label><input type="checkbox" checked> Op dësem Apparat verhalen</label>' +
      '<button type="submit">Opmaachen</button><div class="an-err" role="alert"></div></form>';
    var form = card.querySelector('form'), inp = card.querySelector('input[type=password]'),
      keep = card.querySelector('input[type=checkbox]'), btn = card.querySelector('button'), err = card.querySelector('.an-err');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      btn.disabled = true; err.textContent = ''; btn.textContent = 'Opmaachen …';
      derive(inp.value, enc, false).then(function (key) {
        return decrypt(key, enc).then(function (data) {
          if (keep.checked) keyPut({ salt: enc.salt, key: key });
          render(data, enc);
        });
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'Opmaachen';
        err.textContent = 'Passwuert falsch.';
        inp.select();
      });
    });
    root.replaceChildren(card);
    inp.focus();
  }

  // ---- Rechnen ----
  function monday(s) { var d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
  function weekly(jot) {
    var m = {};
    jot.forEach(function (r) {
      var w = monday(r.date);
      if (!m[w]) m[w] = { week: w, Laafen: 0, Rad: 0, Schwammen: 0, Kraft: 0, km: { Laafen: 0, Rad: 0, Schwammen: 0 } };
      if (r.sport in m[w]) m[w][r.sport] += (r.time_min || 0) / 60;
      if (r.sport in m[w].km) m[w].km[r.sport] += r.km || 0;
    });
    return Object.keys(m).sort().map(function (k) { return m[k]; });
  }
  function wtot(r) { return r.Laafen + r.Rad + r.Schwammen + r.Kraft; }
  function intensity(ses) {
    var out = [];
    ['Laafen', 'Rad', 'All'].forEach(function (sp) {
      var rs = ses.filter(function (r) { return r.z12_pct != null && (sp === 'All' ? (r.sport === 'Laafen' || r.sport === 'Rad') : r.sport === sp); });
      var t = sum(rs, function (r) { return r.time_min; });
      if (!t) return;
      var w = function (k) { return sum(rs, function (r) { return (r[k] || 0) * r.time_min; }) / t; };
      out.push({ sport: sp, liicht: w('z12_pct'), mettel: w('z3_pct'), schweier: w('z4_pct') + w('z5_pct'), minutes: t });
    });
    return out;
  }
  function dnum(s) { return Date.parse(s + 'T12:00:00Z') / 864e5; }
  function trend(rs, f) {
    if (rs.length < 3) return null;
    var t = rs.map(function (r) { return dnum(r.date); }), y = rs.map(f);
    var mt = mean(t, Number), my = mean(y, Number), b = 0, q = 0;
    t.forEach(function (v, i) { b += (v - mt) * (y[i] - my); q += (v - mt) * (v - mt); });
    b /= q;
    var first = Math.min.apply(null, t), last = Math.max.apply(null, t), from = my + b * (first - mt), to = my + b * (last - mt);
    return { x0: first, x1: last, from: from, to: to, change_pct: (to - from) / from * 100 };
  }

  // ---- Charts ----
  var charts = [];
  function chart(box, cfg) {
    var c = document.createElement('canvas'); box.append(c);
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'nearest', intersect: true } }, cfg.options || {});
    charts.push(new Chart(c, cfg));
  }
  var refLines = { id: 'refLines', afterDatasetsDraw: function (c, a, o) {
    (o.lines || []).forEach(function (l) {
      var ctx = c.ctx, ar = c.chartArea, s = c.scales[l.axis];
      var p = s.getPixelForValue(l.value);
      ctx.save(); ctx.strokeStyle = l.color || '#8a8983'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.beginPath();
      if (l.axis === 'y') { ctx.moveTo(ar.left, p); ctx.lineTo(ar.right, p); } else { ctx.moveTo(p, ar.top); ctx.lineTo(p, ar.bottom); }
      ctx.stroke();
      if (l.text) { ctx.setLineDash([]); ctx.fillStyle = '#6b6a64'; ctx.font = '11px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(l.text, l.axis === 'x' ? p : (ar.left + ar.right) / 2, ar.top - 6); }
      ctx.restore();
    });
  } };
  function dateTicks(v) { return day(new Date(v * 864e5).toISOString().slice(0, 10)); }
  function legend(on) { return { display: on !== false, position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } }; }

  function render(data, enc) {
    var ses = data.sessions.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    var jot = data.jotform;
    charts.forEach(function (c) { c.destroy(); }); charts = [];
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.color = '#6b6a64';
    Chart.defaults.borderColor = '#efeee8';

    var g = jot.filter(function (r) { return r.gefill != null; });
    var since = jot.reduce(function (m, r) { return r.date < m ? r.date : m; }, '9999');
    var wk = weekly(jot), full = wk.slice(0, -1);
    var it = intensity(ses), all = it.filter(function (r) { return r.sport === 'All'; })[0];
    var runs = ses.filter(function (r) { return r.sport === 'Laafen' && r.ef != null && r.time_min >= 10; });
    var eft = trend(runs, function (r) { return r.ef; });

    root.replaceChildren();
    var head = el('div', 'an-head');
    head.append(el('p', null, 'Zënter dem <b>' + day(since) + ' ' + since.slice(0, 4) + '</b>: <b>' + jot.length + '</b> Trainingen. Déi lescht 4 Wochen am Schnëtt <b>' +
      (full.length ? num(mean(full.slice(-4), wtot), 1) : '—') + '</b> Stonnen pro Woch. Donnéeën vum ' + day(enc.updated) + ' ' + enc.updated.slice(0, 4) + '.'));
    var off = el('button', 'an-btn an-ghost', 'Spären');
    off.type = 'button';
    off.addEventListener('click', function () { keyDel().then(function () { charts.forEach(function (c) { c.destroy(); }); charts = []; lock(enc); }); });
    head.append(off);
    root.append(head);

    var tiles = el('div', 'an-tiles');
    [['Kilometer', num(sum(jot, function (r) { return r.km; }), 0) + ' km'],
     ['Stonnen Training', num(sum(jot, function (r) { return r.time_min; }) / 60, 0) + ' h'],
     ['Trainingen', String(jot.length)],
     ['Ø Gefill (1 = schlecht, 5 = super)', g.length ? num(mean(g, function (r) { return r.gefill; }), 1) : '—']
    ].forEach(function (t) { tiles.append(el('div', 'an-tile', '<span>' + t[0] + '</span><b>' + t[1] + '</b>')); });
    root.append(tiles);

    // Pro Sport: km, Stonnen, Trainingen, leschten Training (dës Woch extra)
    var wk0 = monday(new Date().toISOString().slice(0, 10));
    var ps = el('div', 'an-tiles an-sports');
    SPORTS.forEach(function (s) {
      var rs = jot.filter(function (r) { return r.sport === s; });
      if (!rs.length) return;
      var km = sum(rs, function (r) { return r.km; }), h = sum(rs, function (r) { return r.time_min; }) / 60;
      var last = rs.reduce(function (m, r) { return r.date > m ? r.date : m; }, '');
      var now = rs.filter(function (r) { return r.date >= wk0; });
      var t = el('div', 'an-tile an-sport');
      t.style.borderLeftColor = SCOL[s];
      t.innerHTML = '<span>' + SNAME[s] + '</span><b>' + (s === 'Kraft' ? num(h, 1) + ' h' : num(km, 0) + ' km') + '</b>' +
        '<small>' + (s === 'Kraft' ? '' : num(h, 1) + ' h \u00b7 ') + rs.length + ' Trainingen<br>Lescht: ' + day(last) +
        (now.length ? '<br>Dës Woch: ' + (s === 'Kraft' ? hm(sum(now, function (r) { return r.time_min; })) + ' h' : num(sum(now, function (r) { return r.km; }), 1) + ' km') : '') + '</small>';
      ps.append(t);
    });
    root.append(ps);

    function section(title) { root.append(el('h2', null, title)); var gr = el('div', 'an-grid'); root.append(gr); return gr; }
    function card(parent, title, take, how, short) {
      var c = el('div', 'an-card');
      c.append(el('h3', null, title));
      if (take) c.append(el('p', 'an-take', take));
      var box = el('div', 'an-chart' + (short ? ' an-short' : ''));
      c.append(box);
      if (how) c.append(el('p', 'an-how', '<strong>Wéi liesen:</strong> ' + how));
      parent.append(c);
      return box;
    }

    // Wéi vill trainéieren ech?
    var s1 = section('Wéi vill trainéieren ech?');
    var avg = full.length ? mean(full, wtot) : null;
    var b1 = card(s1, 'Stonnen pro Woch', 'Am Schnëtt <b>' + (avg != null ? num(avg, 1) : '—') + '</b> Stonnen pro Woch.',
      'All Balken ass eng Woch (vu Méindeg u). D’Faarwen weisen de Sport. Déi gestrachelt Linn ass de Schnëtt. Déi lescht Woch ass nach net fäerdeg.');
    chart(b1, {
      type: 'bar',
      data: { labels: wk.map(function (r) { return day(r.week); }), datasets: SPORTS.map(function (s) {
        return { label: SNAME[s], data: wk.map(function (r) { return +r[s].toFixed(2); }), backgroundColor: SCOL[s], stack: 'h' };
      }) },
      options: {
        scales: { x: { stacked: true, grid: { display: false }, ticks: { autoSkipPadding: 8, maxRotation: 0 } }, y: { stacked: true, beginAtZero: true, ticks: { callback: function (v) { return v + ' h'; } } } },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: legend(), refLines: { lines: avg != null ? [{ axis: 'y', value: avg, color: INK }] : [] },
          tooltip: { filter: function (i) { return i.raw > 0; }, callbacks: {
            title: function (i) { return 'Woch vum ' + i[0].label; },
            label: function (i) { return i.dataset.label + ' ' + num(i.raw, 1) + ' h'; },
            footer: function (i) { return 'Total ' + num(wtot(wk[i[0].dataIndex]), 1) + ' h'; } } } }
      },
      plugins: [refLines]
    });

    // Kilometer pro Woch a Sport, Kraft a Stonnen
    var KM = ['Laafen', 'Rad', 'Schwammen'];
    var bk = card(s1, 'Kilometer pro Woch', 'Déi lescht komplett Woch: ' + (full.length ? KM.map(function (s) { return SNAME[s] + ' <b>' + num(full[full.length - 1].km[s], 1) + ' km</b>'; }).join(', ') + ', Kraft <b>' + hm(full[full.length - 1].Kraft * 60) + ' h</b>' : '\u2014') + '.',
      'D\u2019Balke sinn d\u2019Kilometer pro Sport an der Woch (vu Méindeg u), lénks Achs. D\u2019Linn ass d\u2019Kraft a Stonnen, riets Achs. Déi lescht Woch ass nach net fäerdeg.');
    chart(bk, {
      type: 'bar',
      data: { labels: wk.map(function (r) { return day(r.week); }), datasets: KM.map(function (s) {
        return { label: SNAME[s], data: wk.map(function (r) { return +r.km[s].toFixed(2); }), backgroundColor: SCOL[s], yAxisID: 'y' };
      }).concat([{ type: 'line', label: 'Kraft (h)', data: wk.map(function (r) { return +r.Kraft.toFixed(2); }), borderColor: SCOL.Kraft, backgroundColor: SCOL.Kraft, pointRadius: 3, tension: 0.2, yAxisID: 'y1' }]) },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false }, ticks: { autoSkipPadding: 8, maxRotation: 0 } },
          y: { beginAtZero: true, ticks: { callback: function (v) { return v + ' km'; } } },
          y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: function (v) { return v + ' h'; } } } },
        plugins: { legend: legend(), tooltip: { callbacks: {
          title: function (i) { return 'Woch vum ' + i[0].label; },
          label: function (i) { return i.dataset.yAxisID === 'y1' ? 'Kraft ' + hm(i.raw * 60) + ' h' : i.dataset.label + ' ' + num(i.raw, 1) + ' km'; } } } }
      }
    });
    var kt = el('div', 'an-card');
    kt.append(el('h3', null, 'Zuelen pro Woch'));
    var ktb = el('div', 'an-tablebox'), ktt = el('table', 'an-table an-weeks');
    ktt.innerHTML = '<thead><tr><th>Woch vum</th><th>Laafen</th><th>Vëlo</th><th>Schwammen</th><th>Kraft</th><th>Total Stonnen</th></tr></thead>';
    var ktbody = el('tbody');
    wk.slice().reverse().forEach(function (r) {
      var tr = el('tr');
      [day(r.week) + ' ' + r.week.slice(0, 4), num(r.km.Laafen, 1) + ' km', num(r.km.Rad, 1) + ' km', num(r.km.Schwammen, 2) + ' km', hm(r.Kraft * 60) + ' h', num(wtot(r), 1) + ' h']
        .forEach(function (v) { var td = el('td'); td.textContent = v; tr.append(td); });
      ktbody.append(tr);
    });
    ktt.append(ktbody); ktb.append(ktt); kt.append(ktb); s1.append(kt);

    // Wéi ustrengend?
    var s2 = section('Wéi ustrengend ass mäin Training?');
    s2.classList.add('an-two');
    var INAME = { Laafen: 'Laafen', Rad: 'Vëlo', All: 'Zesummen' };
    var b2 = card(s2, 'Liicht oder schwéier?', 'Iwwer all Laafen a Vëlo: <b>' + (all ? num(all.liicht, 0) + ' %' : '—') + '</b> vun der Zäit war liicht.',
      'Gréng = liicht (do kann ee schwätzen), giel = mëttel, rout = schwéier (no beim Maximum). Vill Ausdauersportler trainéieren ongeféier 80 % liicht, dofir déi gestrachelt Linn. D’Zonen hänken un der Puls-Schwell: ass déi ze déif, kuckt et méi schwéier aus wéi et ass.', true);
    chart(b2, {
      type: 'bar',
      data: { labels: it.map(function (r) { return INAME[r.sport]; }), datasets: [['liicht', 'Liicht', GOOD], ['mettel', 'Mëttel', MID], ['schweier', 'Schwéier', BAD]].map(function (k) {
        return { label: k[1], data: it.map(function (r) { return +r[k[0]].toFixed(1); }), backgroundColor: k[2], stack: 'i' };
      }) },
      options: {
        indexAxis: 'y', layout: { padding: { top: 22 } },
        scales: { x: { stacked: true, min: 0, max: 100, ticks: { stepSize: 25, callback: function (v) { return v + ' %'; } } }, y: { stacked: true, grid: { display: false } } },
        plugins: { legend: legend(), refLines: { lines: [{ axis: 'x', value: 80, color: INK, text: 'Ziel 80 % liicht' }] },
          tooltip: { callbacks: { title: function (i) { var r = it[i[0].dataIndex]; return INAME[r.sport] + ' · ' + hm(r.minutes) + ' h'; },
            label: function (i) { return i.dataset.label + ' ' + num(i.raw, 0) + ' %'; } } } }
      },
      plugins: [refLines]
    });

    var LV = [[50, 'Liicht (ënner 50)', GOOD], [100, 'Mëttel (50–100)', MUTED], [150, 'Schwéier (100–150)', MID], [Infinity, 'Ganz schwéier (iwwer 150)', BAD]];
    function lvl(v) { for (var i = 0; i < LV.length; i++) if (v < LV[i][0]) return LV[i]; }
    var ld = ses.filter(function (r) { return r.load != null; });
    var b3 = card(s2, 'Wéi vill huet all Training kascht?', 'D’Héicht vum Balken = Ustrengung a Punkten.',
      'D’Punkte rechnen Dauer an Intensitéit zesummen. 100 Punkten = eng Stonn voll op der Schwell. Ënner 50 erhëlt ee sech bis den nächsten Dag, iwwer 150 brauch ee méi Deeg.');
    chart(b3, {
      type: 'bar',
      data: { labels: ld.map(function (r) { return day(r.date); }), datasets: [{ data: ld.map(function (r) { return r.load; }), backgroundColor: ld.map(function (r) { return lvl(r.load)[2]; }), borderRadius: 2 }] },
      options: {
        scales: { x: { grid: { display: false }, ticks: { autoSkipPadding: 8, maxRotation: 0 } }, y: { beginAtZero: true } },
        plugins: { legend: { display: true, position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 },
            generateLabels: function () { return LV.map(function (l) { return { text: l[1], fillStyle: l[2], strokeStyle: l[2], lineWidth: 0 }; }); } }, onClick: function () {} },
          tooltip: { callbacks: { title: function (i) { return label(ld[i[0].dataIndex]); },
            label: function (i) { var r = ld[i.dataIndex]; return [num(r.load, 0) + ' Punkten · ' + hm(r.time_min) + ' h', lvl(r.load)[1].split(' (')[0]]; } } } }
      }
    });

    // Gëtt et besser?
    var s3 = section('Gëtt et besser?');
    s3.classList.add('an-two');
    function scatter(box, rows, val, tipf, yfmt, colors, tr, lines) {
      var ds = [{ type: 'scatter', data: rows.map(function (r) { return { x: dnum(r.date), y: val(r) }; }), backgroundColor: colors, borderColor: '#ffffff', borderWidth: 1.5, pointRadius: 5, pointHoverRadius: 6 }];
      if (tr) ds.push({ type: 'line', data: [{ x: tr.x0, y: tr.from }, { x: tr.x1, y: tr.to }], borderColor: '#378add', borderWidth: 2, pointRadius: 0, pointHoverRadius: 0 });
      var xs = rows.map(function (r) { return dnum(r.date); });
      chart(box, {
        type: 'scatter', data: { datasets: ds },
        options: {
          scales: { x: { type: 'linear', min: Math.min.apply(null, xs) - 2, max: Math.max.apply(null, xs) + 2, ticks: { callback: dateTicks, maxTicksLimit: 6, maxRotation: 0 } }, y: { grace: '10%', ticks: { callback: yfmt } } },
          plugins: { legend: { display: false }, refLines: { lines: lines || [] },
            tooltip: { filter: function (i) { return i.datasetIndex === 0; }, callbacks: { title: function (i) { return label(rows[i[0].dataIndex]); }, label: function (i) { return tipf(rows[i.dataIndex]); } } } }
        },
        plugins: [refLines]
      });
    }
    var b4 = card(s3, 'Laafen: Meter pro Häerzschlag', 'Trend vun der Effizienz: <b>' + (eft ? (eft.change_pct >= 0 ? '+' : '−') + num(Math.abs(eft.change_pct), 0) + ' %' : '—') + '</b> vum éischten bis zum leschte Laf.',
      'Wéi wäit s de mat all Häerzschlag kënns. Méi héich = méi fit: méi séier beim selwechte Puls. All Punkt ass e Laf, d’Linn de Trend. Séier Intervaller leien héich, lues Leef déif: also ähnlech Leef matenee vergläichen.');
    scatter(b4, runs, function (r) { return r.ef; }, function (r) { return num(r.ef, 2) + ' m pro Schlag · ' + r.pace + ' /km · Ø Puls ' + r.hr_avg; },
      function (v) { return num(v, 2) + ' m'; }, MUTED, eft);

    var wt = ses.filter(function (r) { return r.np != null; });
    var b5 = card(s3, 'Vëlo: Kraaft an de Pedalen', 'Watt pro Fahrt (just mam Wattmiesser).',
      'Den éischte Balken ass d’Duerchschnëttskraaft vun der Fahrt, mat de Spëtzten méi staark gewiicht (Normalized Power). Den zweeten ass déi bescht 20 Minutten. Wuessen se mat der Zäit, gëss de méi staark.');
    chart(b5, {
      type: 'bar',
      data: { labels: wt.map(function (r) { return day(r.date); }), datasets: [
        { label: 'Ø Kraaft vun der Fahrt', data: wt.map(function (r) { return r.np; }), backgroundColor: SCOL.Rad, borderRadius: 2, maxBarThickness: 32 },
        { label: 'Bescht 20 Minutten', data: wt.map(function (r) { return r.best_20min_w; }), backgroundColor: MUTED, borderRadius: 2, maxBarThickness: 32 }] },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: function (v) { return v + ' W'; } } } },
        plugins: { legend: legend(), tooltip: { callbacks: { title: function (i) { return label(wt[i[0].dataIndex]); },
          label: function (i) { return i.dataset.label + ' ' + (i.raw == null ? '—' : num(i.raw, 0) + ' W'); },
          footer: function (i) { var r = wt[i[0].dataIndex]; return r.thr_watt ? 'Schwell (FTP) ' + r.thr_watt + ' W' : ''; } } } }
      }
    });

    var DR = [[5, 'Gutt (ënner 5 %)', GOOD], [10, 'Ok (5–10 %)', MID], [Infinity, 'Ze vill (iwwer 10 %)', BAD]];
    function drl(v) { for (var i = 0; i < DR.length; i++) if (v < DR[i][0]) return DR[i]; }
    var dr = ses.filter(function (r) { return r.drift_pct != null; });
    var b6 = card(s3, 'Hält de Kierper d’Tempo duerch?', 'Puls-Drift pro Training vun iwwer 20 Minutten. Gréng ënner 5 %, giel 5–10 %, rout iwwer 10 %.',
      'Wéi vill méi den Häerz an der zweeter Hallschent schaffe muss fir datselwecht Tempo. Ënner 5 %: gutt Ausdauer bei deem Tempo. Iwwer 10 %: ze séier, ze waarm oder ze mann gedronk.');
    scatter(b6, dr, function (r) { return r.drift_pct; }, function (r) { return 'Puls-Drift ' + num(r.drift_pct, 1) + ' % · ' + drl(r.drift_pct)[1].split(' (')[0] + ' · ' + hm(r.time_min) + ' h'; },
      function (v) { return v + ' %'; }, dr.map(function (r) { return drl(r.drift_pct)[2]; }), null, [{ axis: 'y', value: 5 }, { axis: 'y', value: 10 }]);

    // Schwellen
    var hms = jot.filter(function (r) { return r.sport === 'Laafen' && r.km >= 20.9 && r.km <= 21.6 && r.time_min; });
    var hmb = hms.reduce(function (a, b) { return !a || b.time_min < a.time_min ? b : a; }, null);
    var lr = ses.filter(function (r) { return r.sport === 'Laafen'; }).reduce(function (a, b) { return b.km > (a ? a.km : 0) ? b : a; }, null);
    if (hmb && lr) {
      root.append(el('h2', null, 'Schwellen kontrolléieren'));
      var f = el('div', 'an-card an-find');
      f.append(el('p', null, 'Däi beschten Hallefmarathon war den <b>' + day(hmb.date) + '</b>: <b>' + hm(hmb.time_min) + '</b> h mat engem Ø-Puls vun <b>' + hmb.hr_avg +
        '</b>. De längste Laf mat Auer-Datei (<b>' + day(lr.date) + '</b>, ' + num(lr.km, 1) + ' km) hat en Ø-Puls vun <b>' + lr.hr_avg + '</b>.'));
      f.append(el('p', null, 'En Hallefmarathon leeft een ongeféier op senger Laaf-Schwell oder e bësse driwwer. Deng Schwell läit also no beim Ø-Puls vum beschten Hallefmarathon; déi aktuell Schwell an der Auer ass <b>' +
        (lr.thr_hr || '—') + '</b>. Bei deem Laf war doduerch <b>' + (lr.z5_pct != null ? num(lr.z5_pct, 0) + ' %' : '—') + '</b> vun der Zäit rout (ganz schwéier): ass dat vill, ass d’Schwell eventuell ze déif agestallt.'));
      root.append(f);
    }

    // Tabell
    root.append(el('h2', null, 'All Trainingen mat Auer-Datei'));
    var tc = el('div', 'an-card');
    tc.append(el('p', 'an-take', 'Op eng Kolonn tippen fir ze sortéieren. Gefill a Bemierkung kommen aus dem Jotform.'));
    var tb = el('div', 'an-tablebox'), tbl = el('table', 'an-table');
    var COLS = [
      ['date', 'Datum', function (r) { return day(r.date) + ' ' + r.date.slice(0, 4); }],
      ['sport', 'Sport', function (r) { return SNAME[r.sport] || r.sport; }],
      ['km', 'km', function (r) { return num(r.km, 1); }],
      ['time_min', 'Zäit', function (r) { return hm(r.time_min); }],
      ['hr_avg', 'Ø Puls', function (r) { return r.hr_avg == null ? '' : r.hr_avg; }],
      ['ef', 'Meter/Schlag', function (r) { return r.ef == null || r.sport !== 'Laafen' ? '' : num(r.ef, 2) + ' m'; }],
      ['drift_pct', 'Puls-Drift', function (r) { return r.drift_pct == null ? '' : num(r.drift_pct, 1) + ' %'; }],
      ['load', 'Punkten', function (r) { return r.load == null ? '' : num(r.load, 0); }],
      ['np', 'Watt', function (r) { return r.np == null ? '' : r.np; }],
      ['gefill', 'Gefill', function (r) { return r.gefill == null ? '' : r.gefill; }],
      ['gear', 'Material', function (r) { return r.gear || ''; }, 'l'],
      ['note', 'Bemierkung', function (r) { return r.note || ''; }, 'l']
    ];
    var sortKey = 'date', sortDir = -1;
    var thead = el('thead'), hr = el('tr'), tbody = el('tbody');
    COLS.forEach(function (c) {
      var th = el('th', c[3] || null), bt = el('button', null, esc(c[1]));
      bt.type = 'button';
      bt.addEventListener('click', function () {
        sortDir = c[0] === sortKey ? -sortDir : (c[0] === 'date' ? -1 : 1);
        sortKey = c[0];
        hr.querySelectorAll('th').forEach(function (t) { t.removeAttribute('aria-sort'); });
        th.setAttribute('aria-sort', sortDir > 0 ? 'ascending' : 'descending');
        fill();
      });
      th.append(bt); hr.append(th);
      if (c[0] === 'date') th.setAttribute('aria-sort', 'descending');
    });
    thead.append(hr);
    function fill() {
      var rows = ses.slice().sort(function (a, b) {
        var va = sortKey === 'date' ? a.id : a[sortKey], vb = sortKey === 'date' ? b.id : b[sortKey];
        if (va == null) return 1; if (vb == null) return -1;
        return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sortDir;
      });
      tbody.replaceChildren.apply(tbody, rows.map(function (r) {
        var tr = el('tr');
        COLS.forEach(function (c) { var td = el('td', c[3] || null); td.textContent = c[2](r); tr.append(td); });
        return tr;
      }));
    }
    fill();
    tbl.append(thead, tbody); tb.append(tbl); tc.append(tb);
    root.append(tc);
  }
})();
