# Training Guy Dashboard – Uleedung fir Claude Code

Persönlechen Trainings-Dashboard vum Guy (Laafen, Vëlo, Kraft, Schwammen). Statesch Säit iwwer **GitHub Pages** vum Branch `main` (Root). All Push op `main` geet bannent 1–2 Minutte live, et gëtt keng Freigab. Dofir all Ännerung virum Push gutt nokucken.

- Guy: https://pugu-prog.github.io/training-guy-dashboard/
- Trainer (read-only): https://pugu-prog.github.io/training-guy-dashboard/trainer.html
- Kommunikatioun mam Guy an all Texter op der Säit: **Lëtzebuergesch**. De Guy schreift kuerz Korrekturen; Diagnos, Editéieren, Verifikatioun an Push mécht Claude eegestänneg.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Guy-Usiicht (mat Jotform-iFrame, "Trainingsprogramm Guy, Woch N"-Kaart, .ics-Knäppchen) |
| `trainer.html` | Trainer-Usiicht: selwecht Struktur, **ouni** Jotform-iFrame/Reload-Knäppchen, mat "Trainer-Usiicht"-Tag, ouni Trainingsprogramm-Kaart |
| `data/current-week.json` | Steiert de Sync: aktuell Woch, 7 Datumer, Baselines |
| `sync_results.py` | Gëtt vun `.github/workflows/results-sync.yml` all 3 Stonnen (Cron `0 */3 * * *` UTC) gestart; schreift Jotform-Resultater an d'oppe Woch |
| `training.ics` | Statesche Kalenner fir déi aktuell Woch |
| `manifest.json`, Icons, `.nojekyll` | änneren net |

**Regel:** `index.html` an `trainer.html` ëmmer zesummen änneren (selwecht Day-Grid, Archiv, `WEEK_HISTORY`, Gesamt Iwwersiicht). All Woch steet an all HTML-Datei **zweemol**: uewen als aktuell Woch an als oppenen `<details class="week">` am Archiv. Ännerunge musse béid Plazen treffen.

## Externt

- **Jotform** Form `261891471293060` ("Training Guy - Resultater"): Felder Datum, Status (Gemaach/Ausgelooss), Grond, Aktivitéit (Laafen / Rad / Kraft / Schwammen), Phase (Warmup / Training / Race / Cooldown), Distanz (Komma), Zäit, Max HF, AVG HF, Elevatioun, Gefill (1–5), Bemierkung. Min HF ass zënter 15.07.2026 verstoppt (feelt bei neie Submissiounen, dat ass kee Feeler).
- API-Schlëssel: GitHub-Secret `JOTFORM_API_KEY`. Fir lokal ze testen: `export JOTFORM_API_KEY=...` (vum Guy froen; ni committen).
- **Trainingsplang-PDFs** (Lëtzebuergesch, vum Coach, ronn all Sonndeg): Google-Drive-Dossier "Training Guy" (ID `1p2U8mZdlpf268cg3Nnt5UKT_pICW3jo9`), oder de Guy gëtt den PDF direkt. Den PDF ass d'Wourecht fir wéi en Dag wéi eng Sessioun huet.

## Dag-Karten

Struktur (aktuell Woch, op e puer Zeilen):
```html
<div class="day laaf main">
  <div class="day-head"><span class="day-name">Mëttwoch</span><span class="badge">18:00</span></div>
  <span class="type type-laaf">Laafen</span>
  <div class="desc">4km
5x1600m (60s Paus)
2km</div></div>
```
Am Archiv steet déiselwecht Kaart op enger Zeil. `sync_results.py` fënnt Deeg iwwer `<div class="day ` + `<span class="day-name">Weekday</span>`. Dës Muster net änneren.

Typen (Klass op `.day` + Badge `.type-*`):
- `laaf`: Laafen, gréng `#1d9e75`
- `kraft`: Kraft, mof `#7f77dd`
- `velo`: Vëlo, orange `#ef9f27`
- `schwamm`: Schwammen, hellblo `#2fa8c9` (zënter 28.09.2026)
- `rescht`: Rescht/Congé, gro `#b4b2a9`

Sessioune mat Auerzäit (meeschtens déi 2 Haaptsessiounen) kréien zousätzlech `main` an e `<span class="badge">18:00</span>`.
Daagnimm: Méindeg, Dënschdeg, Mëttwoch, Donneschdeg, Freideg, Samschdeg, Sonndeg (PDF-Schreifweisen wéi "Freides"/"Samsdes" normaliséieren).
Zousaz an der Woch (z. B. "an och nach schwammen"): an der bestoender `.desc` mat `+ Schwammen: …` dobäischreiwen, keng nei Kaart.

## Resultat-Blocken (normalerweis mécht dat de Sync)

- Ausgelooss: `<div class="result result-off">Ausgelooss - {Grond}<span class="result-note">{Bemierkung}</span></div>`
- Gemaach: zouklappbar
```html
<details class="result result-done"><summary class="result-summary">&#10003; 12,47 km &middot; Laafen<span class="chev">&#9656;</span></summary><span class="result-note">1:13:38 Gesamt &middot; 96m Héicht<br>WU: 4,05 km &middot; 23:27 &middot; HF bis 160 (&#216; 153)<br>TR: …<br>CD: …<br>Gefill 3/5<br>Bemierkung1 &middot; Bemierkung2</span></details>
```
  Phase-Tags: Warmup→WU, Training→TR, Race→Race, Cooldown→CD. Bei e puer Sportarten op engem Dag gëtt et eng Zeil pro Sport ("Rad + Schwammen"). Nëmmen `&#10003;` an Text benotzen, keng Emojien a keng faarweg Punkten (de Guy huet dat ausdrécklech refuséiert).
  HF: `HF min-max (&#216; avg)` / `HF bis max (&#216; avg)` / `HF &#216; avg` / guer näischt. Dat muss mat `fmt_hf`/`fmt_hf_range` am `sync_results.py` iwwereneestëmmen.
- Wann een de Format ännert, muss en am Script **an** an dëser Datei geännert ginn.

## Wochewiessel (wann en neie PDF kënnt)

1. PDF liesen, Datumer Méindeg–Sonndeg vun der neier Woch bestëmmen, all Dag klasséieren.
2. **Al Woch ofschléissen** (an index.html + trainer.html):
   - Hir Resultater sinn schonn am Archiv-Entrée (vum Sync). Op komplett kontrolléieren (Jotform).
   - Direkt nom `<summary>` e `<p class="week-comment">` mat 2–3 Sätz derbäisetzen: gemaach/ausgelooss, km pro Sport, Ø HF, Ø Gefill, wat an de Bemierkungen opfält.
   - Säin `<details>` zouklappen (kee `open`).
   - Am `WEEK_HISTORY` déi definitiv Wäerter androen (laafen/velo/schwammen km, stonnen, total).
3. **Nei Woch bauen:**
   - Uewen: "Aktuell Woch: Woch N &middot; 5. - 11. Oktober 2026", d'Stats-Kaarten (Sessiounen, Laafdeeg, Haaptsessiounen) an den Day-Grid.
   - `index.html`: Kaart "Trainingsprogramm Guy, Woch N".
   - Archiv: neien oppenen `<details class="week">` mat `<summary>Woch N &middot; Datumberäich …</summary>` an `.stats-mini` op "0,0 km" / "0,0 h", uewen iwwer de fréiere Wochen. Al Woche **ni läschen**.
   - `WEEK_HISTORY` an **béide** Dateien: `{ label: "Woch N", laafen: 0, velo: 0, schwammen: 0, stonnen: 0, total: 0 }`.
4. ⚠️ **Bekannte Bug (scho 2× geschitt):** Ni Resultat-Markup (`<details class="result …">`, `result-off`) vun der aler Woch an déi nei Woch kopéieren. Déi nei Woch fänkt **ouni** Resultat-Blocken un, ausser et gëtt schonn eng richteg Submissioun mat engem Datum an där Woch.
5. **`data/current-week.json` aktualiséieren (Pflicht!):** `week_number`, `week_label`, 7 `days` (Format `YYYYMMDD`), `hours_baseline`/`km_baseline` = al Baseline + exakt Totale vun der ofgeschlossener Woch (aus de Submissiounen summéiert, net déi gerënnt Wäerter vun der Säit), `activity_baselines` d'selwecht pro Sport (velo=Jotform "Rad", laafen, kraft (nëmmen Stonnen), schwammen). D'Zomm vun de 4 km muss genee `km_baseline` ginn. Wann een dëse Schrëtt vergësst, schreift de Sync weider an déi al Woch.
6. **`training.ics`** nei generéieren: VCALENDAR/VTIMEZONE-Header behalen, een `VEVENT` pro Dag, `UID:training-{YYYYMMDD}-{index}@guy`. Mat Auerzäit: `DTSTART;TZID=Europe/Luxembourg:…T180000` + 1 h; ouni: `DTSTART;VALUE=DATE` / `DTEND;VALUE=DATE` (nächsten Dag). SUMMARY/DESCRIPTION escapen: `\` → `\\`, `;` → `\;`, `,` → `\,`, Zeilenëmbroch → literal `\n`. Richteg Zeilenëmbréch an engem Wäert hunn op iOS den Import futti gemaach.
7. "Gesamt Iwwersiicht" (Wochen, Gesamt Distanz/Stonnen, Vëlo/Laafen/Kraft/Schwammen) **net vun Hand änneren**. De Sync rechent se aus de Baselines.

Wann een een Dag am Plang ännert/tauscht: béid HTML-Dateien (aktuell + Archiv), `training.ics` (SUMMARY/DESCRIPTION tauschen, DTSTART an UID bleiwen um Kalennerdatum). Resultater bleiwen op hirem richtegen Datum.

## Push & Verifikatioun

- Virum Push: `git pull --rebase origin main`. De Bot commit all 3 Stonnen ("Resultater-Sync"), et kann also Konflikter ginn.
- Timing-Fal: Leeft e Sync, deen virun dengem Push ausgecheckt huet, nach no dengem Push weider, da rechent en nach mat der aler Script-Logik. Dat korrigéiert sech beim nächste Laf. Wann et direkt richteg muss sinn: Workflow manuell starten (`workflow_dispatch`).
- Virum Push: `git diff` liesen, besonnesch den Day-Grid vun der neier Woch (keng Resultater!).
- No dem Push: `curl -sL https://raw.githubusercontent.com/pugu-prog/training-guy-dashboard/<sha>/index.html | sha256sum` mat der lokaler Datei vergläichen.
- Python-Syntax-Check no Ännerungen um Script: `python3 -c "import ast;ast.parse(open('sync_results.py').read())"`.
- Lokal testen (mat API-Schlëssel): `JOTFORM_API_KEY=… python3 sync_results.py` an duerno `git diff`. **Net** onopgefuerdert pushen.

## Commit-Messagen

Kuerz, op Lëtzebuergesch, z. B. `Woch 14: archive Woch 13, start new week` oder `Woch 13: Méindeg Schwammen amplaz Rescht`.

## Geplangt: `.fit`-Import mat Detail-Usiicht (nach net gebaut)

Zil: `.fit`-Dateien (Auer/Vëlo-Computer) importéieren, fir **exakt km pro Dag** an eng **Detail-Usiicht pro Sessioun**.

- **Input:** De Guy leet `.fit`-Dateien an e Dossier (Virschlag `fit/`, iwwer GitHub-Web oder Handy eropgelueden). Eng GitHub Action (bestoend `results-sync.yml` erweideren oder en eegene Workflow) parst se, z. B. mat `fitdecode`/`fitparse`.
- **Zouuerdnung:** Sport (Laafen/Rad/Schwammen/…) an Datum aus der Datei → Dag an der oppener Woch, iwwer `data/current-week.json`. Dës Sessioun zielt an d'km/Stonnen-Totalen an an d'Baselines, genee wéi eng Jotform-Submissioun. **Keng Duebelzielung:** Wann et fir déiselwecht Sessioun och e Jotform-Entrée gëtt, eng kloer Reegel festleeën (z. B. `.fit` gewënnt bei km/Zäit/HF, Jotform liwwert nëmmen Gefill + Bemierkung).
- **Detail-Usiicht** (geet op, wann een um Resultat-Block vum Dag klickt):
  - Kaart mat der Streck (Leaflet + OpenStreetMap; Libs nëmmen vu cdnjs/jsdelivr)
  - Kurven: Häerzfrequenz an Tempo iwwer d'Zäit, beim Vëlo och Héichteprofil (Chart.js ass schonn agebonnen)
  - Splits pro km (Zäit, Ø HF, Héichtemeter); beim Schwammen pro Längt/Intervall
- **Privatsphär (wichteg, d'Säit ass ëffentlech):** Op der Kaart déi éischt an déi lescht ~300 m vun der Streck ewechloossen (sou datt de Start/Doheem net ze gesinn ass). Nëmmen eng reduzéiert, ofgeleet JSON pro Sessioun publizéieren (z. B. `data/sessions/YYYYMMDD-N.json`, Track ausgedënnt), **net déi rau `.fit`-Dateien**. Déi rau Dateien nom Veraarbechten aus dem Repo läschen oder ni committen (z. B. Upload an e privaten Drive/Release a just d'JSON publizéieren). Mam Guy ofklären, ier en Track live geet.
- `index.html` an `trainer.html` béid upassen; Resultat-Block-Format a Faarwen wéi uewen beschriwwen behalen.
- **Ufank:** Beim Guy no enger Beispill-`.fit` vum Laafen a vum Schwammen froen, an no sengem Apparat (Garmin/Polar/Wahoo/Apple …), ier eppes gebaut gëtt.
