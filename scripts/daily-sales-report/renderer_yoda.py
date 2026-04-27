"""
YODA-design version of the Aubuchon Daily Sales Report.

Same data contract as renderer.py — render_report(report_date, totals,
cohorts, metrics, state_data, store_ranked, products=None) -> str — but
re-skinned in the YODA design system: warm paper background, Inter type,
green-good / red-bad signal scale, no double-bar header, sentence-case
chrome, native <details> for expand/collapse (no JavaScript).
"""
from datetime import date, datetime
from html import escape

from state_map import STATES, STATE_NAME_TO_CODE, color_for_pct  # noqa: F401
from date_ranges import week_number, quarter, day_of_year


# ---------- Glyphs ----------
ARROW_UP = "▲"      # ▲
ARROW_DOWN = "▼"    # ▼
CHECK_MARK = "✓"    # ✓
CROSS_MARK = "✗"    # ✗
MINUS_REAL = "−"    # − (real minus, U+2212)
EM_DASH = "—"       # —
THIN_SPACE = "&thinsp;"


# ---------- Formatting helpers ----------

def fmt_dollars(x) -> str:
    """$1,234"""
    if x is None:
        return EM_DASH
    try:
        return f"${x:,.0f}"
    except (TypeError, ValueError):
        return EM_DASH


def fmt_dollars2(x) -> str:
    """$1,234.56"""
    if x is None:
        return EM_DASH
    try:
        return f"${x:,.2f}"
    except (TypeError, ValueError):
        return EM_DASH


def fmt_int(x) -> str:
    """1,234"""
    if x is None:
        return EM_DASH
    try:
        return f"{int(x):,}"
    except (TypeError, ValueError):
        return EM_DASH


def fmt_pct(x) -> str:
    """Input is a fraction (e.g. 0.031 -> "+3.1%"). Negatives use real minus.
    None / non-finite -> em dash."""
    if x is None:
        return EM_DASH
    try:
        v = float(x) * 100.0
    except (TypeError, ValueError):
        return EM_DASH
    if v != v:  # NaN
        return EM_DASH
    if v >= 0:
        return f"+{v:.1f}%"
    return f"{MINUS_REAL}{abs(v):.1f}%"


def fmt_pct_from_pct(p100) -> str:
    """Same as fmt_pct but input is already a 0-100 style percent (e.g. 3.1)."""
    if p100 is None:
        return EM_DASH
    try:
        v = float(p100)
    except (TypeError, ValueError):
        return EM_DASH
    if v != v:
        return EM_DASH
    if v >= 0:
        return f"+{v:.1f}%"
    return f"{MINUS_REAL}{abs(v):.1f}%"


def fmt_compact_dollars(x) -> str:
    """$1.23M / $123K / $1,234 — used for big hero KPI numbers."""
    if x is None:
        return EM_DASH
    try:
        v = float(x)
    except (TypeError, ValueError):
        return EM_DASH
    if abs(v) >= 1_000_000:
        return f"${v/1_000_000:.2f}M"
    if abs(v) >= 10_000:
        return f"${v/1_000:.0f}K"
    return f"${v:,.0f}"


def pct_change(part, whole):
    """Return (part/whole - 1) as a fraction. None if whole is 0/None."""
    if whole is None:
        return None
    try:
        if float(whole) == 0:
            return None
        return (float(part) / float(whole)) - 1.0
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def plan_pct(sales, plan) -> float:
    """% of plan, 0..n.  e.g. 96.4 = 96.4% of plan."""
    if not plan:
        return 0.0
    try:
        return (float(sales) / float(plan)) * 100.0
    except (TypeError, ValueError, ZeroDivisionError):
        return 0.0


def tone_for_pct(pct100: float) -> str:
    """Hero/scorecard tone: % of plan -> good|warn|bad|flat.
       >=100 -> good, 95..100 -> warn, <95 -> bad."""
    if pct100 is None:
        return "flat"
    try:
        v = float(pct100)
    except (TypeError, ValueError):
        return "flat"
    if v >= 100.0:
        return "good"
    if v >= 95.0:
        return "warn"
    return "bad"


def tone_for_delta(frac) -> str:
    """Variance tone for vs Plan / vs LY deltas (input = fraction).
       >0 good, =0 flat, <0 bad."""
    if frac is None:
        return "flat"
    try:
        v = float(frac)
    except (TypeError, ValueError):
        return "flat"
    if v > 0:
        return "good"
    if v == 0:
        return "flat"
    return "bad"


def class_for_tone(tone: str) -> str:
    """Map a tone token to the CSS class name used in pills/cells."""
    return {
        "good": "pos",
        "bad": "neg",
        "warn": "warn",
        "flat": "flat",
    }.get(tone, "flat")


def arrow_for_delta(frac) -> str:
    """▲ for >=0, ▼ for <0, em dash for None.  (Sign is duplicated in the
    text via fmt_pct so reds and greens are never color-only.)"""
    if frac is None:
        return EM_DASH
    try:
        v = float(frac)
    except (TypeError, ValueError):
        return EM_DASH
    return ARROW_UP if v >= 0 else ARROW_DOWN


# ---------- CSS ----------
CSS = r"""
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg-warm: #faf5e8;
  --bg-raised: #ffffff;
  --paper-50: #f5f4ef;
  --border-1: #dedcd2;
  --border-2: #c9c6b9;
  --fg-1: #121210;
  --fg-2: #36342f;
  --fg-3: #807c70;
  --fg-4: #a8a497;
  --good: #1f8a6b;
  --good-strong: #0e6651;
  --good-soft: #d8ece3;
  --good-ink: #06352a;
  --bad:  #c52a30;
  --bad-strong:  #97142a;
  --bad-soft:  #f8dcd9;
  --bad-ink:  #470810;
  --warn: #e36b3c;
  --warn-soft: #fbe1cf;
  --warn-ink: #5a260a;
  --watch: #f0a04b;
  --watch-soft: #fbeacf;
  --watch-ink: #5b3b0a;
  --info: #2c6bb8;
  --info-soft: #dde9f7;
  --info-ink:  #0e2c52;
  --accent-retail: #ee6a1f;
  --accent-retail-soft: #fde2cd;
  --shadow-1: 0 1px 0 rgba(18,18,16,0.04), 0 1px 2px rgba(18,18,16,0.06);
}
html, body {
  background: var(--bg-warm);
  color: var(--fg-1);
  font-family: 'Inter', ui-sans-serif, system-ui, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
body { padding: 24px; }
.tabular { font-variant-numeric: tabular-nums; }

a { color: inherit; text-decoration: none; }

/* ---------- Header ---------- */
.back-row { margin-bottom: 14px; }
.back-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 14px;
  background: var(--bg-raised);
  border: 1px solid var(--border-1);
  border-radius: 999px;
  color: var(--fg-2);
  font-size: 13px; font-weight: 500;
  transition: background .15s, border-color .15s;
}
.back-pill:hover { background: var(--paper-50); border-color: var(--border-2); }
.back-pill svg { width: 14px; height: 14px; }

.header {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  margin-bottom: 20px;
}
.header-left { display: flex; align-items: center; gap: 14px; }
.brand-tile {
  width: 44px; height: 44px;
  background: var(--accent-retail);
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.brand-tile svg { width: 22px; height: 22px; color: #fff; }
.title-stack h1 {
  font-size: 28px; font-weight: 700; letter-spacing: -0.02em;
  color: var(--fg-1); line-height: 1.15;
}
.title-stack .sub {
  font-size: 13px; color: var(--fg-3); margin-top: 2px;
}

.live-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px;
  background: var(--good-soft); color: var(--good-ink);
  border: 1px solid #c2dfd2;
  border-radius: 999px;
  font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.live-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--good); }

/* ---------- Cards ---------- */
.card {
  background: var(--bg-raised);
  border: 1px solid var(--border-1);
  border-radius: 8px;
  margin-bottom: 16px;
}
.card-header {
  padding: 14px 18px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border-1);
}
.card-body { padding: 16px 18px; }
.eyebrow {
  font-size: 11px; font-weight: 600;
  color: var(--fg-3);
  text-transform: uppercase; letter-spacing: 0.14em;
}
.card-title { font-size: 15px; font-weight: 600; color: var(--fg-1); }
.card-hint { font-size: 12px; color: var(--fg-3); }

/* ---------- Hero KPI scorecard ---------- */
.scorecard {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.kpi {
  background: var(--bg-raised);
  border: 1px solid var(--border-1);
  border-radius: 8px;
  padding: 16px 18px;
  display: flex; flex-direction: column; gap: 10px;
}
.kpi.tone-good { background: var(--good-soft); border-color: #c2dfd2; }
.kpi.tone-warn { background: var(--warn-soft); border-color: #f1c8af; }
.kpi.tone-bad  { background: var(--bad-soft);  border-color: #efbcb8; }
.kpi-eyebrow { font-size: 11px; font-weight: 600; color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.14em; }
.kpi-value {
  font-size: 32px; font-weight: 700; letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--fg-1); line-height: 1.05;
}
.kpi-sub { font-size: 12px; color: var(--fg-3); font-variant-numeric: tabular-nums; }
.kpi-sub strong { color: var(--fg-1); font-weight: 600; }

.bar { height: 6px; background: rgba(18,18,16,0.08); border-radius: 999px; overflow: hidden; }
.bar > span { display: block; height: 100%; border-radius: 999px; }
.bar-good > span { background: var(--good-strong); }
.bar-warn > span { background: var(--warn); }
.bar-bad  > span { background: var(--bad-strong); }
.bar-flat > span { background: var(--fg-4); }

.kpi-deltas { display: flex; gap: 6px; flex-wrap: wrap; }

/* ---------- Pills ---------- */
.pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  border: 1px solid transparent;
  white-space: nowrap;
}
.pill .lbl { font-size: 9.5px; font-weight: 500; opacity: 0.75; margin-left: 3px; text-transform: uppercase; letter-spacing: 0.08em; }
.pill.pos  { background: var(--good-soft); color: var(--good-ink); border-color: #c2dfd2; }
.pill.neg  { background: var(--bad-soft);  color: var(--bad-ink);  border-color: #efbcb8; }
.pill.warn { background: var(--warn-soft); color: var(--warn-ink); border-color: #f1c8af; }
.pill.flat { background: var(--paper-50);  color: var(--fg-3);     border-color: var(--border-1); }

/* ---------- Status pill (CAPS + tracked) ---------- */
.status-pill {
  display: inline-flex; align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.status-pill.pos  { background: var(--good-soft); color: var(--good-ink); }
.status-pill.neg  { background: var(--bad-soft);  color: var(--bad-ink); }
.status-pill.warn { background: var(--warn-soft); color: var(--warn-ink); }
.status-pill.flat { background: var(--paper-50);  color: var(--fg-3); }

/* ---------- Cohort breakdown ---------- */
details.collapse { background: var(--bg-raised); border: 1px solid var(--border-1); border-radius: 8px; margin-bottom: 16px; }
details.collapse > summary {
  list-style: none;
  cursor: pointer;
  padding: 14px 18px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
details.collapse > summary::-webkit-details-marker { display: none; }
details.collapse > summary .summary-meta { display: flex; align-items: center; gap: 10px; }
details.collapse > summary .chev { color: var(--fg-3); transition: transform 0.15s; }
details.collapse[open] > summary .chev { transform: rotate(180deg); }
details.collapse .body { padding: 0 18px 18px; border-top: 1px solid var(--border-1); }

.cohort-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding-top: 16px;
}
.cohort-col h3 {
  font-size: 13px; font-weight: 600; color: var(--fg-1);
  margin-bottom: 2px;
}
.cohort-col .csub { font-size: 11px; color: var(--fg-3); margin-bottom: 10px; }
.period-row {
  display: grid; grid-template-columns: 38px 1fr auto;
  align-items: center; gap: 8px;
  padding: 8px 10px;
  background: var(--paper-50);
  border: 1px solid var(--border-1);
  border-radius: 6px;
  margin-bottom: 6px;
}
.period-row .pr-label { font-size: 10.5px; font-weight: 700; color: var(--fg-3); letter-spacing: 0.1em; text-transform: uppercase; }
.period-row .pr-sales { font-size: 13px; font-weight: 600; color: var(--fg-1); font-variant-numeric: tabular-nums; }
.period-row .pr-pills { display: flex; gap: 4px; }

/* ---------- Day metrics strip ---------- */
.metrics {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 12px; margin-bottom: 16px;
}
.metric {
  background: var(--bg-raised);
  border: 1px solid var(--border-1);
  border-radius: 8px;
  padding: 14px 16px;
}
.metric .eyebrow { margin-bottom: 6px; }
.metric .val { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; color: var(--fg-1); font-variant-numeric: tabular-nums; }
.metric .sub { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 11.5px; color: var(--fg-3); font-variant-numeric: tabular-nums; }

/* ---------- State map ---------- */
.state-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
  gap: 18px;
  align-items: start;
  padding: 16px 18px;
}
.state-wrap svg { width: 100%; height: auto; display: block; }
.state-legend {
  margin-top: 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.legend-bar {
  height: 10px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--bad-strong) 0%, var(--warn) 30%, var(--watch) 50%, var(--good) 75%, var(--good-strong) 100%);
}
.legend-row {
  display: flex; justify-content: space-between;
  font-size: 10.5px; color: var(--fg-3);
  font-variant-numeric: tabular-nums;
}
.state-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.state-table th {
  font-size: 10.5px; font-weight: 600; color: var(--fg-3);
  text-transform: uppercase; letter-spacing: 0.1em;
  text-align: right; padding: 8px 10px;
  background: var(--paper-50);
  border-bottom: 1px solid var(--border-1);
}
.state-table th:first-child { text-align: left; }
.state-table td {
  padding: 8px 10px; text-align: right;
  border-bottom: 1px solid var(--border-1);
  font-variant-numeric: tabular-nums;
  color: var(--fg-1);
}
.state-table td:first-child { text-align: left; font-weight: 500; }
.state-table tr:last-child td { border-bottom: none; }

/* ---------- Ranked list (stores + products) ---------- */
.ranked-table { width: 100%; border-collapse: collapse; }
.ranked-table thead th {
  background: var(--paper-50);
  font-size: 10.5px; font-weight: 600; color: var(--fg-3);
  text-transform: uppercase; letter-spacing: 0.1em;
  text-align: right;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-1);
}
.ranked-table thead th:first-child,
.ranked-table thead th.left { text-align: left; }
.ranked-table tbody td {
  padding: 10px 12px;
  text-align: right;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--fg-1);
  border-bottom: 1px solid var(--border-1);
}
.ranked-table tbody td:first-child,
.ranked-table tbody td.left { text-align: left; }
.ranked-table tbody tr:last-child td { border-bottom: none; }
.ranked-table .rank {
  display: inline-block; width: 26px;
  font-size: 11px; font-weight: 600; color: var(--fg-3);
  font-variant-numeric: tabular-nums;
}
.ranked-table .name { font-weight: 600; color: var(--fg-1); }
.ranked-table .meta { font-size: 11px; color: var(--fg-3); margin-top: 1px; }
.ranked-table td.tone-good { color: var(--good-ink); }
.ranked-table td.tone-bad  { color: var(--bad-ink); }
.ranked-table td.tone-warn { color: var(--warn-ink); }

.prod-name {
  font-weight: 600; color: var(--fg-1);
  display: inline-block;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.expand-wrap { padding: 12px 16px; border-top: 1px solid var(--border-1); }
details.expand-more > summary {
  list-style: none;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 14px;
  background: var(--paper-50);
  border: 1px solid var(--border-1);
  border-radius: 8px;
  font-size: 12.5px; font-weight: 600; color: var(--fg-2);
}
details.expand-more > summary::-webkit-details-marker { display: none; }
details.expand-more > summary::after { content: " " attr(data-show); }
details.expand-more[open] > summary::after { content: " " attr(data-hide); }
details.expand-more > summary:hover { background: #efece2; border-color: var(--border-2); }
details.expand-more .extra-rows { margin-top: 0; }

/* Empty state */
.empty {
  padding: 28px 18px;
  text-align: center;
  color: var(--fg-3);
  font-size: 13px;
}

/* Footer */
.footer {
  margin-top: 18px;
  padding: 14px 18px;
  font-size: 11.5px;
  color: var(--fg-3);
  text-align: center;
}
.footer .stamp { margin-top: 4px; font-variant-numeric: tabular-nums; }

/* ---------- Responsive ---------- */
@media (max-width: 1024px) {
  .scorecard { grid-template-columns: repeat(2, 1fr); }
  .metrics   { grid-template-columns: repeat(2, 1fr); }
  .cohort-grid { grid-template-columns: 1fr; }
  .state-wrap  { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .scorecard { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  body { padding: 14px; }
  .header { flex-direction: column; align-items: flex-start; gap: 10px; }
  .title-stack h1 { font-size: 24px; }
  .kpi-value { font-size: 26px; }
  .metric .val { font-size: 20px; }
}
@media (max-width: 560px) {
  .scorecard { grid-template-columns: 1fr; }
  .metrics   { grid-template-columns: 1fr; }
}
"""


# Bolt SVG (Lucide-style "zap" path) — same shape as in ui_kits/sales/sales-kit.jsx
BOLT_SVG = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
    'aria-hidden="true">'
    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor"/>'
    '</svg>'
)

BACK_ARROW_SVG = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>'
    '</svg>'
)

CHEVRON_SVG = (
    '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" '
    'fill="none" stroke="currentColor" stroke-width="2.25" '
    'stroke-linecap="round" stroke-linejoin="round">'
    '<path d="M6 9l6 6 6-6"/>'
    '</svg>'
)


# ---------- Header ----------

def _render_header(d: date) -> str:
    weekday = d.strftime("%A")
    wk = week_number(d)
    q = quarter(d)
    try:
        pretty = d.strftime("%B %-d, %Y")
    except Exception:
        pretty = d.strftime("%B %#d, %Y")
    sub = f"{weekday}, {pretty} &middot; Week {wk} &middot; Q{q} &middot; Live data &middot; YODA"
    return f"""
<div class="back-row">
  <a class="back-pill" href="https://aubuchon-it-command-center.vercel.app/?section=yoda">
    {BACK_ARROW_SVG}
    <span>Back to reports</span>
  </a>
</div>
<div class="header">
  <div class="header-left">
    <div class="brand-tile">{BOLT_SVG}</div>
    <div class="title-stack">
      <h1>Daily sales</h1>
      <div class="sub">{sub}</div>
    </div>
  </div>
  <div class="live-pill"><span class="dot"></span><span>Live data</span></div>
</div>
"""


# ---------- Hero scorecard ----------

def _delta_pill(label_caps: str, frac) -> str:
    tone = tone_for_delta(frac)
    cls = class_for_tone(tone)
    arrow = arrow_for_delta(frac)
    return (
        f'<span class="pill {cls}" aria-label="{escape(label_caps)}">'
        f'<span aria-hidden="true">{arrow}</span>'
        f'<span>{fmt_pct(frac)}</span>'
        f'<span class="lbl">{escape(label_caps)}</span>'
        f'</span>'
    )


def _kpi_card(eyebrow: str, sales, plan, ly) -> str:
    pct100 = plan_pct(sales, plan)
    tone = tone_for_pct(pct100)
    fill_pct = max(0.0, min(100.0, pct100))
    vsP = pct_change(sales, plan)
    vsLY = pct_change(sales, ly)
    return f"""
<div class="kpi tone-{tone}">
  <div class="kpi-eyebrow">{escape(eyebrow)}</div>
  <div class="kpi-value tabular">{fmt_compact_dollars(sales)}</div>
  <div class="kpi-sub">{fmt_pct_from_pct(pct100 - 100.0)} of plan &middot; <strong>{fmt_compact_dollars(plan)}</strong> plan</div>
  <div class="bar bar-{tone}"><span style="width:{fill_pct:.1f}%"></span></div>
  <div class="kpi-deltas">
    {_delta_pill("vs Plan", vsP)}
    {_delta_pill("vs LY", vsLY)}
  </div>
</div>
"""


def _render_scorecard(p) -> str:
    return f"""
<div class="scorecard">
  {_kpi_card("Day", p["DAY_TY"], p["DAY_PLAN"], p["DAY_LY"])}
  {_kpi_card("Week to date", p["WTD_TY"], p["WTD_PLAN"], p["WTD_LY"])}
  {_kpi_card("Month to date", p["MTD_TY"], p["MTD_PLAN"], p["MTD_LY"])}
  {_kpi_card("Year to date", p["YTD_TY"], p["YTD_PLAN"], p["YTD_LY"])}
</div>
"""


# ---------- Cohort breakdown ----------

def _cohort_period_row(label: str, ty, plan, ly) -> str:
    vsP = pct_change(ty, plan)
    vsLY = pct_change(ty, ly)
    p_tone = class_for_tone(tone_for_delta(vsP))
    l_tone = class_for_tone(tone_for_delta(vsLY))
    p_arrow = arrow_for_delta(vsP)
    l_arrow = arrow_for_delta(vsLY)
    return f"""
<div class="period-row">
  <div class="pr-label">{escape(label)}</div>
  <div class="pr-sales tabular">{fmt_compact_dollars(ty)}</div>
  <div class="pr-pills">
    <span class="pill {p_tone}"><span aria-hidden="true">{p_arrow}</span><span>{fmt_pct(vsP)}</span><span class="lbl">P</span></span>
    <span class="pill {l_tone}"><span aria-hidden="true">{l_arrow}</span><span>{fmt_pct(vsLY)}</span><span class="lbl">LY</span></span>
  </div>
</div>"""


def _cohort_column(title: str, subtitle: str, prefix: str, totals, cohorts) -> str:
    """If prefix == "" pull from totals; else from cohorts with that prefix."""
    src = totals if prefix == "" else cohorts
    rows = []
    for per in ("DAY", "WTD", "MTD", "YTD"):
        ty = src.get(f"{prefix}{per}_TY", 0)
        plan = src.get(f"{prefix}{per}_PLAN", 0)
        ly = src.get(f"{prefix}{per}_LY", 0)
        rows.append(_cohort_period_row(per, ty, plan, ly))
    sub_html = f'<div class="csub">{escape(subtitle)}</div>' if subtitle else ""
    return f"""
<div class="cohort-col">
  <h3>{escape(title)}</h3>
  {sub_html}
  <div class="period-rows">{''.join(rows)}</div>
</div>
"""


def _render_cohorts(totals, cohorts) -> str:
    return f"""
<details class="collapse">
  <summary>
    <div>
      <div class="eyebrow">Store group breakdown</div>
      <div class="card-title" style="margin-top:2px">Same-store vs acquisition &middot; all periods</div>
    </div>
    <div class="summary-meta">
      <span class="card-hint">Show details</span>
      {CHEVRON_SVG}
    </div>
  </summary>
  <div class="body">
    <div class="cohort-grid">
      {_cohort_column("Total company", "All stores", "", totals, cohorts)}
      {_cohort_column("Same-store", "Comp stores", "SS_", totals, cohorts)}
      {_cohort_column("Acquisition", "Non-comp stores", "AC_", totals, cohorts)}
    </div>
  </div>
</details>
"""


# ---------- Day metrics strip ----------

def _metric_card(eyebrow: str, value_html: str, vs_label: str, frac) -> str:
    tone = class_for_tone(tone_for_delta(frac))
    arrow = arrow_for_delta(frac)
    return f"""
<div class="metric">
  <div class="eyebrow">{escape(eyebrow)}</div>
  <div class="val tabular">{value_html}</div>
  <div class="sub">
    <span class="status-pill {tone}"><span aria-hidden="true">{arrow}</span>&nbsp;{fmt_pct(frac)}</span>
    <span>{escape(vs_label)}</span>
  </div>
</div>
"""


def _render_metrics(m) -> str:
    txn_ty = m.get("TXN_TY", 0)
    txn_ly = m.get("TXN_LY", 0)
    avg_ty = m.get("AVG_TY", 0)
    avg_ly = m.get("AVG_LY", 0)
    upt_ty = m.get("UPT_TY", 0)
    upt_ly = m.get("UPT_LY", 0)
    sales_ty = m.get("SALES_TY", 0)
    sales_ly = m.get("SALES_LY", 0)

    txn_vs_ly = pct_change(txn_ty, txn_ly)
    avg_vs_ly = pct_change(avg_ty, avg_ly)
    upt_vs_ly = pct_change(upt_ty, upt_ly)
    sales_vs_ly = pct_change(sales_ty, sales_ly)

    txn_val = f"{fmt_int(txn_ty)}{THIN_SPACE}txns"
    avg_val = f"{fmt_dollars2(avg_ty)}{THIN_SPACE}/&thinsp;txn"
    try:
        upt_val = f"{float(upt_ty):.2f}{THIN_SPACE}u/txn"
    except (TypeError, ValueError):
        upt_val = EM_DASH
    sales_val = f"{fmt_compact_dollars(sales_ty)}"

    return f"""
<div class="metrics">
  {_metric_card("Transactions yesterday", txn_val, "vs LY", txn_vs_ly)}
  {_metric_card("Avg sale", avg_val, "vs LY", avg_vs_ly)}
  {_metric_card("Units per txn", upt_val, "vs LY", upt_vs_ly)}
  {_metric_card("Net sales", sales_val, "vs LY", sales_vs_ly)}
</div>
"""


# ---------- State map ----------

def _render_state_map(state_data) -> str:
    rows = []
    for code, r in state_data.items():
        sales = r.get("sales", 0) or 0
        plan = r.get("plan", 0) or 0
        ly = r.get("ly", 0) or 0
        stores = r.get("stores", 0) or 0
        if plan:
            vsP_pct = (sales / plan - 1.0) * 100.0
        else:
            vsP_pct = 0.0
        rows.append({
            "code": code,
            "sales": sales,
            "plan": plan,
            "ly": ly,
            "stores": stores,
            "vsP_pct": vsP_pct,
        })
    rows.sort(key=lambda x: x["vsP_pct"], reverse=True)
    by_code = {r["code"]: r for r in rows}
    name_map = {s["code"]: s["name"] for s in STATES}
    name_map["VA"] = "Virginia"

    svg_paths = []
    svg_paths.append('<rect width="520" height="310" fill="#f5f4ef" rx="6"/>')
    for s in STATES:
        d = by_code.get(s["code"])
        vsP = d["vsP_pct"] if d else 0
        fill = color_for_pct(vsP) if d else "#dedcd2"
        sales = d["sales"] if d else 0
        stores = d["stores"] if d else 0
        title = (
            f'{s["name"]}: {fmt_pct_from_pct(vsP)} vs Plan | '
            f'{fmt_compact_dollars(sales)} sales | {stores} stores'
        )
        svg_paths.append(
            f'<path d="{s["d"]}" fill="{fill}" stroke="#ffffff" stroke-width="1.5">'
            f'<title>{escape(title)}</title>'
            f'</path>'
        )
        if s.get("no_label"):
            continue
        if s.get("external_label"):
            # Use the per-state connector + label_xy so VA and RI don't stack
            # at the same hard-coded position. Each external state owns its
            # own leader line endpoints and label position in state_map.py.
            connector = s.get("connector")
            if connector:
                (cx1, cy1), (cx2, cy2) = connector
                svg_paths.append(
                    f'<line x1="{cx1}" y1="{cy1}" x2="{cx2}" y2="{cy2}" '
                    f'stroke="#807c70" stroke-width="0.8"/>'
                )
            label_x, label_y = s.get("label_xy", (390, 188))
            color = "#0e6651" if vsP >= 0 else "#97142a"
            svg_paths.append(
                f'<text x="{label_x}" y="{label_y}" text-anchor="middle" font-size="8" '
                f'font-weight="700" fill="{color}" font-family="Inter,Arial,sans-serif">'
                f'{s["code"]} {fmt_pct_from_pct(vsP)}</text>'
            )
            continue
        if s.get("combined_label"):
            x, y = s["label_xy"]
            svg_paths.append(
                f'<text x="{x}" y="{y}" text-anchor="middle" font-size="8.5" '
                f'font-weight="700" fill="{s["label_fill"]}" '
                f'font-family="Inter,Arial,sans-serif">'
                f'{s["code"]}  {fmt_pct_from_pct(vsP)}</text>'
            )
            continue
        lx, ly_xy = s["label_xy"]
        px, py = s["pct_xy"]
        svg_paths.append(
            f'<text x="{lx}" y="{ly_xy}" text-anchor="middle" font-size="8.5" '
            f'font-weight="700" fill="{s["label_fill"]}" '
            f'font-family="Inter,Arial,sans-serif">{s["code"]}</text>'
        )
        svg_paths.append(
            f'<text x="{px}" y="{py}" text-anchor="middle" font-size="8" '
            f'fill="{s["pct_fill"]}" font-family="Inter,Arial,sans-serif">'
            f'{fmt_pct_from_pct(vsP)}</text>'
        )

    svg = (
        '<svg viewBox="0 0 520 310" xmlns="http://www.w3.org/2000/svg" '
        'role="img" aria-label="State sales map">'
        + "\n".join(svg_paths) +
        '</svg>'
    )

    table_rows = []
    for r in rows:
        tone = class_for_tone(tone_for_delta(r["vsP_pct"] / 100.0 if r["vsP_pct"] else 0))
        arrow = arrow_for_delta(r["vsP_pct"] / 100.0 if r["vsP_pct"] else 0)
        table_rows.append(
            f'<tr>'
            f'<td>{escape(name_map.get(r["code"], r["code"]))}</td>'
            f'<td class="tabular">{fmt_dollars(r["sales"])}</td>'
            f'<td class="tabular tone-{tone}">{arrow}&thinsp;{fmt_pct_from_pct(r["vsP_pct"])}</td>'
            f'<td class="tabular">{fmt_int(r["stores"])}</td>'
            f'</tr>'
        )

    return f"""
<div class="card">
  <div class="card-header">
    <div>
      <div class="eyebrow">Sales by state</div>
      <div class="card-title" style="margin-top:2px">Yesterday vs plan</div>
    </div>
    <div class="card-hint">Color = % vs plan &middot; hover for details</div>
  </div>
  <div class="state-wrap">
    <div>
      {svg}
      <div class="state-legend">
        <div class="legend-bar" aria-hidden="true"></div>
        <div class="legend-row">
          <span>{MINUS_REAL}35%</span>
          <span>0%</span>
          <span>+25%</span>
        </div>
      </div>
    </div>
    <div>
      <div class="table-scroll">
        <table class="state-table">
          <thead><tr>
            <th>State</th>
            <th>Sales</th>
            <th>vs Plan</th>
            <th>Stores</th>
          </tr></thead>
          <tbody>{''.join(table_rows)}</tbody>
        </table>
      </div>
    </div>
  </div>
</div>
"""


# ---------- Stores ranked ----------

def _store_row(rank: int, r) -> str:
    # vsP and vsLY come from build_store_ranks already multiplied by 100
    # (e.g. 16.6 means +16.6%). Convert to fractions before passing to the
    # delta helpers, which all expect fractions. fmt_pct(0.166) = "+16.6%".
    vsP_raw  = r.get("vsP")
    vsLY_raw = r.get("vsLY")
    vsP_frac  = (vsP_raw  / 100.0) if vsP_raw  is not None else None
    vsLY_frac = (vsLY_raw / 100.0) if vsLY_raw is not None else None

    p_tone = class_for_tone(tone_for_delta(vsP_frac))
    l_tone = class_for_tone(tone_for_delta(vsLY_frac))
    p_arrow = arrow_for_delta(vsP_frac)
    l_arrow = arrow_for_delta(vsLY_frac)
    name = escape(r.get("name", ""))
    code = escape(str(r.get("code", "")))
    state = escape(r.get("state", ""))
    cohort = escape(r.get("cohort", ""))
    meta = f"{cohort} &middot; #{code} &middot; {state}"
    vsLY_html = (
        f'<span aria-hidden="true">{l_arrow}</span>&thinsp;{fmt_pct(vsLY_frac)}'
        if vsLY_frac is not None else EM_DASH
    )
    return f"""
<tr>
  <td class="left"><span class="rank tabular">#{rank}</span></td>
  <td class="left">
    <div class="name">{name}</div>
    <div class="meta">{meta}</div>
  </td>
  <td class="tabular">{fmt_dollars(r.get("sales"))}</td>
  <td class="tabular">{fmt_dollars(r.get("plan"))}</td>
  <td class="tabular tone-{p_tone}"><span aria-hidden="true">{p_arrow}</span>&thinsp;{fmt_pct(vsP_frac)}</td>
  <td class="tabular tone-{l_tone}">{vsLY_html}</td>
  <td class="tabular">{fmt_int(r.get("txns"))}</td>
</tr>"""


def _render_stores(ranked) -> str:
    total = len(ranked)
    top = ranked[:10]
    rest = ranked[10:]

    top_rows = "\n".join(_store_row(i + 1, r) for i, r in enumerate(top))
    rest_rows_html = "\n".join(_store_row(i + 11, r) for i, r in enumerate(rest))

    rest_section = ""
    if rest:
        rest_section = f"""
<div class="expand-wrap">
  <details class="expand-more">
    <summary data-show="Show all {total} stores" data-hide="Hide extra stores"></summary>
    <div class="extra-rows">
      <div class="table-scroll">
        <table class="ranked-table">
          <tbody>{rest_rows_html}</tbody>
        </table>
      </div>
    </div>
  </details>
</div>
"""

    return f"""
<div class="card">
  <div class="card-header">
    <div>
      <div class="eyebrow">Top stores by % to plan</div>
      <div class="card-title" style="margin-top:2px">{total} stores ranked</div>
    </div>
    <div class="card-hint">Sorted by vs plan, descending</div>
  </div>
  <div class="table-scroll">
    <table class="ranked-table">
      <thead><tr>
        <th class="left" style="width:48px">#</th>
        <th class="left">Store</th>
        <th>Sales</th>
        <th>Plan</th>
        <th>vs Plan</th>
        <th>vs LY</th>
        <th>Txns</th>
      </tr></thead>
      <tbody>{top_rows}</tbody>
    </table>
  </div>
  {rest_section}
</div>
"""


# ---------- Top products ----------

def _product_row(rank: int, r) -> str:
    name = escape(r.get("name", ""))
    dept = escape(r.get("dept", ""))
    return f"""
<tr>
  <td class="left"><span class="rank tabular">#{rank}</span></td>
  <td class="left">
    <span class="prod-name" title="{name}">{name}</span>
  </td>
  <td class="left" style="color:var(--fg-3); font-size:11.5px">{dept}</td>
  <td class="tabular">{fmt_dollars(r.get("revenue"))}</td>
  <td class="tabular">{fmt_int(r.get("units"))}</td>
  <td class="tabular">{fmt_dollars2(r.get("avg_price"))}</td>
  <td class="tabular">{fmt_int(r.get("stores_sold"))}</td>
</tr>"""


def _render_products(products) -> str:
    if not products:
        return """
<div class="card">
  <div class="card-header">
    <div>
      <div class="eyebrow">Top products by revenue</div>
      <div class="card-title" style="margin-top:2px">Yesterday</div>
    </div>
  </div>
  <div class="empty">Product-level data is not available for this date.</div>
</div>
"""
    total = min(len(products), 100)
    top = products[:10]
    rest = products[10:total]

    top_rows = "\n".join(_product_row(i + 1, r) for i, r in enumerate(top))
    rest_rows_html = "\n".join(_product_row(i + 11, r) for i, r in enumerate(rest))

    rest_section = ""
    if rest:
        rest_section = f"""
<div class="expand-wrap">
  <details class="expand-more">
    <summary data-show="Show all {total} products" data-hide="Hide extra products"></summary>
    <div class="extra-rows">
      <div class="table-scroll">
        <table class="ranked-table">
          <tbody>{rest_rows_html}</tbody>
        </table>
      </div>
    </div>
  </details>
</div>
"""

    return f"""
<div class="card">
  <div class="card-header">
    <div>
      <div class="eyebrow">Top products by revenue</div>
      <div class="card-title" style="margin-top:2px">Top {total} SKUs &middot; yesterday</div>
    </div>
    <div class="card-hint">All stores combined</div>
  </div>
  <div class="table-scroll">
    <table class="ranked-table">
      <thead><tr>
        <th class="left" style="width:48px">#</th>
        <th class="left">Product</th>
        <th class="left">Dept</th>
        <th>Revenue</th>
        <th>Units</th>
        <th>Avg price</th>
        <th>Stores</th>
      </tr></thead>
      <tbody>{top_rows}</tbody>
    </table>
  </div>
  {rest_section}
</div>
"""


# ---------- Footer ----------

def _render_footer() -> str:
    stamp = datetime.now().isoformat(timespec="seconds")
    return f"""
<div class="footer">
  <div>Powered by YODA &middot; Aubuchon Hardware &middot; Questions? <a href="mailto:scott@aubuchon.com">scott@aubuchon.com</a></div>
  <div class="stamp">Data from Snowflake &middot; PRD_EDW_DB.ANALYTICS_BASE &middot; {escape(stamp)}</div>
</div>
"""


# ---------- Main entry point ----------

def render_report(report_date: date, totals, cohorts, metrics,
                  state_data, store_ranked, products=None) -> str:
    """Return a complete HTML document string for the YODA-skinned daily report."""
    try:
        title_date = report_date.strftime("%B %-d, %Y")
    except Exception:
        title_date = report_date.strftime("%B %#d, %Y")

    body = (
        _render_header(report_date)
        + _render_scorecard(totals)
        + _render_cohorts(totals, cohorts)
        + _render_metrics(metrics)
        + _render_state_map(state_data)
        + _render_stores(store_ranked)
        + _render_products(products or [])
        + _render_footer()
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Daily Sales &middot; {escape(title_date)}</title>
<style>{CSS}</style>
</head>
<body>
{body}
</body>
</html>"""
