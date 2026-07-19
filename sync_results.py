#!/usr/bin/env python3
"""
Training Guy - results sync (GitHub Action version).

Pulls new Jotform submissions for the current week and folds them into
index.html and trainer.html (top day-grid + matching Archiv entry),
recomputes the Auswertung stats block, the per-week mini-stats under the
open Archiv week, the "Gesamt Iwwersiicht" (all-time totals) section, and
the WEEK_HISTORY chart data, and writes the files back in place if
anything changed.

This intentionally mirrors the formatting rules used by the
"training-guy-results-sync" Claude skill, so the output looks identical
whether a human/Claude or this script produced it.

Env vars:
  JOTFORM_API_KEY   - required
  JOTFORM_FORM_ID   - defaults to 261891471293060

Files (relative to repo root):
  data/current-week.json   - weekday->date map + week number + hours/km baseline
  index.html, trainer.html - the two pages to update
"""
import json
import os
import re
import sys
import urllib.request
import urllib.error

FORM_ID = os.environ.get("JOTFORM_FORM_ID", "261891471293060")
API_KEY = os.environ.get("JOTFORM_API_KEY")
REPO_ROOT = os.environ.get("REPO_ROOT", ".")

WEEKDAY_ORDER = ["Méindeg", "Dënschdeg", "Mëttwoch", "Donneschdeg", "Freideg", "Samschdeg", "Sonndeg"]


# ---------- Jotform ----------

def fetch_submissions():
    if not API_KEY:
        print("JOTFORM_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    url = f"https://api.jotform.com/form/{FORM_ID}/submissions?apiKey={API_KEY}&limit=200&orderby=created_at"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            data = json.load(r)
    except urllib.error.URLError as e:
        print(f"Jotform API request failed: {e}", file=sys.stderr)
        sys.exit(1)
    return data.get("content", [])


def answer_by_name(answers, name):
    for a in answers.values():
        if a.get("name") == name:
            return a
    return None


def parse_submission(sub):
    answers = sub.get("answers", {})
    datum = answer_by_name(answers, "q2_datetime0")
    distanz = answer_by_name(answers, "q3_textbox1")
    zeit = answer_by_name(answers, "q4_textbox2")
    gefill = answer_by_name(answers, "q5_radio3")
    bemierkung = answer_by_name(answers, "q6_textarea4")
    status = answer_by_name(answers, "status")
    grond = answer_by_name(answers, "grond")
    aktiviteit = answer_by_name(answers, "aktiviteit")
    phase = answer_by_name(answers, "phase")
    hf_min = answer_by_name(answers, "minHaerzfrequenz")
    hf_max = answer_by_name(answers, "maxHaerzfrequenz")
    hf_avg = answer_by_name(answers, "avgHaerzfrequenz")
    elevation = answer_by_name(answers, "elevatiounm")

    def val(a, default=None):
        if not a:
            return default
        v = a.get("answer", default)
        if isinstance(v, list):
            return v[0] if v else default
        return v

    d = val(datum)
    date_str = None
    if isinstance(d, dict) and d.get("year"):
        try:
            date_str = f"{int(d['year']):04d}{int(d['month']):02d}{int(d['day']):02d}"
        except (ValueError, TypeError):
            date_str = f"{d['year']}{d['month']}{d['day']}"

    return {
        "date": date_str,
        "status": val(status),
        "grond": val(grond),
        "aktiviteit": val(aktiviteit),
        "phase": val(phase),
        "distanz": val(distanz),
        "zeit": val(zeit),
        "gefill": val(gefill),
        "bemierkung": (val(bemierkung) or "").strip(),
        "hf_min": val(hf_min),
        "hf_max": val(hf_max),
        "hf_avg": val(hf_avg),
        "elevation": val(elevation),
        "created_at": sub.get("created_at"),
    }


# ---------- formatting helpers ----------

def km_str(v):
    if v is None:
        return None
    v = str(v).replace(",", ".").strip()
    try:
        f = float(v)
    except ValueError:
        return None
    return f, f"{f:.2f}".rstrip("0").rstrip(".").replace(".", ",") if "." in f"{f:.2f}" else f"{f:.0f}"


def fmt_km(f):
    # 1 decimal for totals, 2 for individual segments is inconsistent in the
    # existing dashboard, so just mirror what's already there: 2 decimals,
    # comma separator, trim trailing zero only when exactly integer.
    s = f"{f:.2f}"
    if s.endswith(".00"):
        s = f"{f:.0f}"
    return s.replace(".", ",")


def fmt_1dp(f):
    """1-decimal, comma-separator formatting used for week/overall totals."""
    return f"{f:.1f}".replace(".", ",")


def parse_time_to_seconds(t):
    if not t:
        return 0
    parts = t.strip().split(":")
    parts = [int(p) for p in parts]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0


def fmt_hms(total_seconds):
    h = total_seconds // 3600
    m = (total_seconds % 3600) // 60
    s = total_seconds % 60
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


PHASE_TAG = {"Warmup": "WU", "Training": "TR", "Cooldown": "CD"}


def fmt_hf(hf_min, hf_max, hf_avg):
    """Format an HF string for a single entry/segment. Min heart rate is no
    longer collected in the form (hidden 2026-07-15), so this degrades
    gracefully: min-max if both present, "bis max" if only max, just the
    average if that's all there is, empty string if nothing at all."""
    if hf_min and hf_max:
        core = f"HF {hf_min}-{hf_max}"
    elif hf_max:
        core = f"HF bis {hf_max}"
    elif hf_avg:
        return f"HF &#216; {hf_avg}"
    else:
        return ""
    return f"{core} (&#216; {hf_avg})" if hf_avg else core


def fmt_hf_range(hf_mins, hf_maxs, hf_avgs):
    """Same as fmt_hf but for an aggregated list of entries (e.g. one
    activity's segments combined for a day)."""
    avg = round(sum(hf_avgs) / len(hf_avgs)) if hf_avgs else None
    if hf_mins and hf_maxs:
        core = f"HF {int(min(hf_mins))}-{int(max(hf_maxs))}"
    elif hf_maxs:
        core = f"HF bis {int(max(hf_maxs))}"
    elif avg is not None:
        return f"HF &#216; {avg}"
    else:
        return ""
    return f"{core} (&#216; {avg})" if avg is not None else core


def fmt_hf_note(hf_min, hf_max):
    """Weekly Auswertung stat note, same graceful-degradation logic."""
    if hf_min is not None and hf_max is not None:
        return f"{hf_min}-{hf_max} bpm"
    if hf_max is not None:
        return f"bis {hf_max} bpm"
    return None


def build_result_block(day_entries):
    """day_entries: list of parsed submissions for one date, all Status=Gemaach."""
    # Group by Aktivitéit (e.g. "Laafen", "Kraft", "Rad")
    by_activity = {}
    order = []
    for e in day_entries:
        a = e["aktiviteit"] or "?"
        if a not in by_activity:
            by_activity[a] = []
            order.append(a)
        by_activity[a].append(e)

    total_km = 0.0
    total_seconds = 0
    total_elev = 0.0
    gefill_vals = []
    remarks = []
    seg_lines = []

    # Does any group have real Warmup/Training/Cooldown phase tags with a
    # single activity? -> classic WU/TR/CD single-sport day.
    single_activity_segmented = len(order) == 1 and any(
        e.get("phase") in PHASE_TAG for e in by_activity[order[0]]
    )

    if single_activity_segmented:
        act = order[0]
        segs = sorted(by_activity[act], key=lambda e: ["Warmup", "Training", "Cooldown"].index(e["phase"]) if e.get("phase") in PHASE_TAG else 99)
        for e in segs:
            km = None
            if e["distanz"]:
                try:
                    km = float(str(e["distanz"]).replace(",", "."))
                except ValueError:
                    km = None
            secs = parse_time_to_seconds(e["zeit"])
            if km:
                total_km += km
            total_seconds += secs
            if e["elevation"]:
                try:
                    total_elev += float(e["elevation"])
                except ValueError:
                    pass
            if e["gefill"]:
                try:
                    gefill_vals.append(float(e["gefill"]))
                except ValueError:
                    pass
            if e["bemierkung"]:
                remarks.append(e["bemierkung"])
            tag = PHASE_TAG.get(e["phase"], e["phase"] or "")
            hf = fmt_hf(e["hf_min"], e["hf_max"], e["hf_avg"])
            km_part = f"{fmt_km(km)} km &middot; " if km else ""
            seg_lines.append(f"{tag}: {km_part}{e['zeit']} &middot; {hf}".strip(" &middot;"))
        summary_activity = act
        detail_lines = [f"{fmt_hms(total_seconds)} Gesamt &middot; {int(total_elev)}m Héicht"] + seg_lines
    else:
        # One line per distinct activity (e.g. "Vëlo + Kraft"), same
        # aggregation but grouped by activity name instead of WU/TR/CD tag.
        activity_lines = []
        for act in order:
            group = by_activity[act]
            km = 0.0
            secs = 0
            hf_mins, hf_maxs, hf_avgs = [], [], []
            for e in group:
                if e["distanz"]:
                    try:
                        km += float(str(e["distanz"]).replace(",", "."))
                    except ValueError:
                        pass
                secs += parse_time_to_seconds(e["zeit"])
                if e["elevation"]:
                    try:
                        total_elev += float(e["elevation"])
                    except ValueError:
                        pass
                if e["gefill"]:
                    try:
                        gefill_vals.append(float(e["gefill"]))
                    except ValueError:
                        pass
                if e["bemierkung"]:
                    remarks.append(e["bemierkung"])
                if e["hf_min"]:
                    hf_mins.append(float(e["hf_min"]))
                if e["hf_max"]:
                    hf_maxs.append(float(e["hf_max"]))
                if e["hf_avg"]:
                    hf_avgs.append(float(e["hf_avg"]))
            total_km += km
            total_seconds += secs
            hf = fmt_hf_range(hf_mins, hf_maxs, hf_avgs)
            km_part = f"{fmt_km(km)} km &middot; {group[0]['zeit']} &middot; " if km else ""
            activity_lines.append(f"{act}: {km_part}{hf}".strip(" &middot;"))
        summary_activity = " + ".join(order)
        detail_lines = [f"{fmt_hms(total_seconds)} Gesamt &middot; {int(total_elev)}m Héicht"] + activity_lines

    gefill_avg = round(sum(gefill_vals) / len(gefill_vals)) if gefill_vals else None
    if gefill_avg:
        detail_lines.append(f"Gefill {gefill_avg}/5")
    if remarks:
        detail_lines.append(" &middot; ".join(remarks))

    summary = f"&#10003; {fmt_km(total_km)} km &middot; {summary_activity}" if total_km else f"&#10003; {summary_activity}"
    html = (
        '<details class="result result-done">'
        f'<summary class="result-summary">{summary}<span class="chev">&#9656;</span></summary>'
        f'<span class="result-note">{"<br>".join(detail_lines)}</span>'
        "</details>"
    )
    return html, total_km, total_seconds, total_elev, gefill_avg, [e["aktiviteit"] for e in day_entries]


def build_off_block(entry):
    note = f'<span class="result-note">{entry["bemierkung"]}</span>' if entry["bemierkung"] else ""
    grond = entry["grond"] or "Aneren"
    return f'<div class="result result-off">Ausgelooss - {grond}{note}</div>'


# ---------- balanced-tag HTML surgery ----------

def find_balanced(html, start_idx, tag):
    """html[start_idx] must be the start of an opening <tag ...> or <tag>.
    Returns the index right after the matching closing </tag>."""
    open_re = re.compile(r"<" + tag + r"(?=[\s>])")
    close_re = re.compile(r"</" + tag + r">")
    m = open_re.match(html, start_idx)
    if not m:
        raise ValueError(f"no <{tag}> at {start_idx}")
    depth = 1
    pos = m.end()
    while depth > 0:
        next_open = open_re.search(html, pos)
        next_close = close_re.search(html, pos)
        if not next_close:
            raise ValueError(f"unbalanced <{tag}>")
        if next_open and next_open.start() < next_close.start():
            depth += 1
            pos = next_open.end()
        else:
            depth -= 1
            pos = next_close.end()
    return pos


def find_day_block(scope_html, scope_offset, weekday):
    name_marker = f'<span class="day-name">{weekday}</span>'
    idx = scope_html.find(name_marker)
    if idx == -1:
        return None
    div_start = scope_html.rfind('<div class="day ', 0, idx)
    if div_start == -1:
        return None
    end_rel = find_balanced(scope_html, div_start, "div")
    return (scope_offset + div_start, scope_offset + end_rel)


def set_result(day_html, new_result_html):
    cleaned = re.sub(r'\s*<div class="result result-off">.*?</div>', "", day_html, flags=re.S)
    cleaned = re.sub(r'\s*<details class="result result-done">.*?</details>', "", cleaned, flags=re.S)
    if not new_result_html:
        return cleaned
    last_close = cleaned.rfind("</div>")
    if last_close == -1:
        raise ValueError("day block has no closing </div>")
    before = cleaned[:last_close].rstrip()
    after = cleaned[last_close:]
    return before + new_result_html + after


def get_top_grid_scope(html):
    marker = '<div class="days" style="margin-top:16px;">'
    idx = html.find(marker)
    if idx == -1:
        raise ValueError("top day-grid not found")
    end = find_balanced(html, idx, "div")
    return idx, end


def get_open_archive_scope(html):
    marker = '<details class="week" open>'
    idx = html.find(marker)
    if idx == -1:
        raise ValueError("open Archiv week not found")
    end = find_balanced(html, idx, "details")
    return idx, end


def apply_day_result(html, weekday, new_result_html):
    """Sets (or clears) the result block for `weekday` in both the top
    day-grid and the open Archiv week entry. Returns updated html."""
    for scope_fn in (get_top_grid_scope, get_open_archive_scope):
        scope_start, scope_end = scope_fn(html)
        block = find_day_block(html[scope_start:scope_end], scope_start, weekday)
        if not block:
            continue
        day_start, day_end = block
        day_html = html[day_start:day_end]
        new_day_html = set_result(day_html, new_result_html)
        html = html[:day_start] + new_day_html + html[day_end:]
    return html


def replace_stat_value(html, label, new_value, new_note=None):
    """Finds <p class="label">{label}</p> and replaces the following
    <p class="value">...</p> (and optionally the <p class="note">...</p>
    right after it, if new_note is given). Matches the FIRST occurrence of
    `label` in the document."""
    marker = f'<p class="label">{label}</p>'
    idx = html.find(marker)
    if idx == -1:
        raise ValueError(f"stat label {label!r} not found")
    after = idx + len(marker)
    m = re.match(r'\s*<p class="value">.*?</p>', html[after:], flags=re.S)
    if not m:
        raise ValueError(f"stat value for {label!r} not found")
    value_end = after + m.end()
    new_value_html = re.sub(r'(<p class="value">).*?(</p>)', lambda mm: mm.group(1) + new_value + mm.group(2), m.group(0), flags=re.S)
    html = html[:after] + new_value_html + html[value_end:]
    if new_note is not None:
        after2 = after + len(new_value_html)
        m2 = re.match(r'\s*<p class="note">.*?</p>', html[after2:], flags=re.S)
        if m2:
            note_end = after2 + m2.end()
            new_note_html = re.sub(r'(<p class="note">).*?(</p>)', lambda mm: mm.group(1) + new_note + mm.group(2), m2.group(0), flags=re.S)
            html = html[:after2] + new_note_html + html[note_end:]
    return html


def replace_label_value_in_segment(segment, label, new_value):
    """Like replace_stat_value but operates on an already-scoped substring
    and returns the (possibly unchanged) segment instead of raising if the
    label isn't found - used for the newer mini-stats / Gesamt Iwwersiicht
    blocks so a layout change there can't break the whole sync run."""
    marker = f'<p class="label">{label}</p>'
    idx = segment.find(marker)
    if idx == -1:
        return segment
    after = idx + len(marker)
    m = re.match(r'\s*<p class="value">.*?</p>', segment[after:], flags=re.S)
    if not m:
        return segment
    value_end = after + m.end()
    new_value_html = re.sub(r'(<p class="value">).*?(</p>)', lambda mm: mm.group(1) + new_value + mm.group(2), m.group(0), flags=re.S)
    return segment[:after] + new_value_html + segment[value_end:]


def update_open_week_mini_stats(html, distanz_value, stonnen_value):
    """Keeps the small "Distanz"/"Stonnen" stat-mini block under the
    currently-open Archiv week's title in sync with the live totals for
    that week. Added 2026-07 alongside the Gesamt Iwwersiicht section;
    older archived weeks are left untouched (their totals are frozen once
    the week is closed by the weekly skill)."""
    try:
        scope_start, scope_end = get_open_archive_scope(html)
    except ValueError:
        return html
    segment = html[scope_start:scope_end]
    idx = segment.find('<div class="stats-mini">')
    if idx == -1:
        return html  # older page without mini-stats yet, skip gracefully
    window_end = segment.find('<div class="days">', idx)
    if window_end == -1:
        window_end = min(len(segment), idx + 400)
    window = segment[idx:window_end]
    window = replace_label_value_in_segment(window, "Distanz", distanz_value)
    window = replace_label_value_in_segment(window, "Stonnen", stonnen_value)
    new_segment = segment[:idx] + window + segment[window_end:]
    return html[:scope_start] + new_segment + html[scope_end:]


def get_gesamt_section_scope(html):
    marker = "<h2>Gesamt Iwwersiicht</h2>"
    idx = html.find(marker)
    if idx == -1:
        return None
    end = html.find("<footer>", idx)
    if end == -1:
        return None
    return idx, end


def update_gesamt_iwwersiicht(html, wochen, gesamt_km_value, gesamt_stonnen_value):
    """Keeps the bottom "Gesamt Iwwersiicht" (Wochen / Gesamt Distanz /
    Gesamt Stonnen) section in sync with the running totals across all
    weeks. Skips quietly if the section doesn't exist on a page (e.g. an
    older cached copy) instead of failing the whole sync run."""
    scope = get_gesamt_section_scope(html)
    if not scope:
        return html
    scope_start, scope_end = scope
    segment = html[scope_start:scope_end]
    segment = replace_label_value_in_segment(segment, "Wochen", str(wochen))
    segment = replace_label_value_in_segment(segment, "Gesamt Distanz", gesamt_km_value)
    segment = replace_label_value_in_segment(segment, "Gesamt Stonnen", gesamt_stonnen_value)
    return html[:scope_start] + segment + html[scope_end:]


def replace_week_history_last(html, laafen, velo, total):
    m = re.search(r"var WEEK_HISTORY = (\[.*?\]);", html, flags=re.S)
    if not m:
        raise ValueError("WEEK_HISTORY not found")
    arr_text = m.group(1)
    entries = re.findall(r'\{[^{}]*\}', arr_text)
    if not entries:
        raise ValueError("WEEK_HISTORY has no entries")
    last = entries[-1]
    new_last = re.sub(r'laafen:\s*[\d.]+', f"laafen: {laafen:g}", last)
    new_last = re.sub(r'velo:\s*[\d.]+', f"velo: {velo:g}", new_last)
    new_last = re.sub(r'total:\s*[\d.]+', f"total: {total:g}", new_last)
    new_arr_text = arr_text[: arr_text.rfind(last)] + new_last + arr_text[arr_text.rfind(last) + len(last):]
    return html[: m.start(1)] + new_arr_text + html[m.end(1):]


# ---------- orchestration ----------

def normalize(s):
    return re.sub(r">\s+<", "><", s.strip())


def load_current_week():
    path = os.path.join(REPO_ROOT, "data", "current-week.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def group_by_date(parsed_subs, valid_dates):
    by_date = {}
    for e in parsed_subs:
        if e["date"] in valid_dates:
            by_date.setdefault(e["date"], []).append(e)
    return by_date


def hours_for_entries(entries):
    total = 0
    for e in entries:
        if e.get("status") == "Gemaach" and e.get("zeit"):
            total += parse_time_to_seconds(e["zeit"])
    return total / 3600.0


def build_day_blocks(by_date, week):
    """Returns dict weekday -> (result_html_or_None, entries) plus rollup stats."""
    date_to_weekday = {d["date"]: d["weekday"] for d in week["days"]}
    results = {}
    laafen_km = 0.0
    velo_km = 0.0
    gemaach_days = 0
    ausgelooss_days = 0
    grond_counts = {}
    hf_avgs_weighted = []  # (avg, weight_seconds)
    hf_mins, hf_maxs = [], []
    gefill_all = []
    week_seconds = 0.0

    for date, entries in by_date.items():
        weekday = date_to_weekday.get(date)
        if not weekday:
            continue
        statuses = {e["status"] for e in entries}
        if "Gemaach" in statuses:
            done_entries = [e for e in entries if e["status"] == "Gemaach"]
            html, total_km, total_secs, total_elev, gefill_avg, acts = build_result_block(done_entries)
            results[weekday] = html
            gemaach_days += 1
            for e in done_entries:
                if e["aktiviteit"] == "Laafen" and e["distanz"]:
                    try:
                        laafen_km += float(str(e["distanz"]).replace(",", "."))
                    except ValueError:
                        pass
                if e["aktiviteit"] == "Rad" and e["distanz"]:
                    try:
                        velo_km += float(str(e["distanz"]).replace(",", "."))
                    except ValueError:
                        pass
                secs = parse_time_to_seconds(e["zeit"])
                week_seconds += secs
                if e["hf_avg"] and secs:
                    try:
                        hf_avgs_weighted.append((float(e["hf_avg"]), secs))
                    except ValueError:
                        pass
                if e["hf_min"]:
                    try:
                        hf_mins.append(float(e["hf_min"]))
                    except ValueError:
                        pass
                if e["hf_max"]:
                    try:
                        hf_maxs.append(float(e["hf_max"]))
                    except ValueError:
                        pass
                if e["gefill"]:
                    try:
                        gefill_all.append(float(e["gefill"]))
                    except ValueError:
                        pass
        else:
            e = entries[0]
            results[weekday] = build_off_block(e)
            ausgelooss_days += 1
            g = e["grond"] or "Aneren"
            grond_counts[g] = grond_counts.get(g, 0) + 1

    days_passed = gemaach_days + ausgelooss_days
    hf_avg = round(sum(a * w for a, w in hf_avgs_weighted) / sum(w for _, w in hf_avgs_weighted)) if hf_avgs_weighted else None
    gefill_avg = round(sum(gefill_all) / len(gefill_all)) if gefill_all else None
    most_common_grond = max(grond_counts, key=grond_counts.get) if grond_counts else None

    stats = {
        "gemaach": gemaach_days,
        "days_passed": days_passed,
        "ausgelooss": ausgelooss_days,
        "grond": most_common_grond,
        "distanz_total": laafen_km + velo_km,
        "laafen_km": laafen_km,
        "velo_km": velo_km,
        "hf_avg": hf_avg,
        "hf_min": int(min(hf_mins)) if hf_mins else None,
        "hf_max": int(max(hf_maxs)) if hf_maxs else None,
        "gefill_avg": gefill_avg,
        "week_hours": week_seconds / 3600.0,
    }
    return results, stats


def apply_all(html, results, stats, week, hours_baseline, km_baseline):
    for weekday, result_html in results.items():
        html = apply_day_result(html, weekday, result_html)

    html = replace_stat_value(html, "Gemaach", f"{stats['gemaach']}/{stats['days_passed']}", f"vun de leschte {stats['days_passed']} Deeg")
    html = replace_stat_value(html, "Ausgelooss", str(stats["ausgelooss"]), f"Grond: {stats['grond'] or '-'}")
    html = replace_stat_value(html, "Distanz Woch", fmt_1dp(stats["distanz_total"]) + " km")
    if stats["hf_avg"] is not None:
        hf_note = fmt_hf_note(stats["hf_min"], stats["hf_max"])
        html = replace_stat_value(html, "&#216; Häerzfrequenz", str(stats["hf_avg"]), hf_note)
    if stats["gefill_avg"] is not None:
        html = replace_stat_value(html, "&#216; Gefill", f"{stats['gefill_avg']}/5")

    html = replace_week_history_last(html, stats["laafen_km"], stats["velo_km"], stats["distanz_total"])

    total_hours = hours_baseline + stats["week_hours"]
    html = replace_stat_value(html, "Gesamt Stonnen", fmt_1dp(total_hours) + " h")

    # Per-week mini-stats under the open Archiv week's title, and the
    # all-time "Gesamt Iwwersiicht" section at the bottom of the page.
    # Both are recomputed from scratch every run so they can never drift
    # from the Auswertung stats above, regardless of how many automated
    # syncs have run since the week started.
    html = update_open_week_mini_stats(
        html,
        fmt_1dp(stats["distanz_total"]) + " km",
        fmt_1dp(stats["week_hours"]) + " h",
    )

    gesamt_km = km_baseline + stats["distanz_total"]
    html = update_gesamt_iwwersiicht(
        html,
        week["week_number"],
        fmt_1dp(gesamt_km) + " km",
        fmt_1dp(total_hours) + " h",
    )

    return html


def main():
    week = load_current_week()
    valid_dates = {d["date"] for d in week["days"]}

    raw_subs = fetch_submissions()
    parsed = [parse_submission(s) for s in raw_subs]
    by_date = group_by_date(parsed, valid_dates)

    if not by_date:
        print("No submissions for the current week yet, nothing to do.")
        return

    results, stats = build_day_blocks(by_date, week)

    changed_any = False
    for filename in ("index.html", "trainer.html"):
        path = os.path.join(REPO_ROOT, filename)
        with open(path, encoding="utf-8") as f:
            original = f.read()
        updated = apply_all(
            original, results, stats, week,
            week["hours_baseline"], week.get("km_baseline", 0.0),
        )
        if normalize(updated) != normalize(original):
            with open(path, "w", encoding="utf-8") as f:
                f.write(updated)
            print(f"Updated {filename}")
            changed_any = True
        else:
            print(f"No change for {filename}")

    if not changed_any:
        print("Nothing changed, skipping commit.")
        sys.exit(0)
    # Signal to the workflow (via exit code / marker file) that a commit is needed.
    with open(os.path.join(REPO_ROOT, ".sync-changed"), "w") as f:
        f.write("1")


if __name__ == "__main__":
    main()
