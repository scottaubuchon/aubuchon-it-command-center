"""
Render the Daily Sales Report HTML.

Based on mockup-style2-light.html (approved). Produces a single static HTML file
with identical visual design, driven by live data.
"""
from datetime import date
from html import escape

from state_map import STATES, STATE_NAME_TO_CODE, color_for_pct, text_fill_for_pct, LEGEND_STOPS, LEGEND_MIN, LEGEND_MAX
from date_ranges import week_number, quarter, day_of_year


# ---------- Formatting helpers ----------

def _fmt_money(v: float, compact=False) -> str:
    if compact:
        if v >= 1_000_000:
            return f"${v/1_000_000:.2f}M"
        if v >= 1_000:
            return f"${v/1_000:.0f}K"
        return f"${v:,.0f}"
    return f"${v:,.0f}"


def _fmt_pct(v, decimals=1, plus=True):
    if v is None:
        return "n/a"
    sign = "+" if v > 0 and plus else ("" if v >= 0 else "")
    return f"{sign}{v:.{decimals}f}%"


def _badge_class(v):
    if v is None:
        return "neg"
    return "pos" if v >= 0 else "neg"


def _arrow(v):
    if v is None:
        return ""
    return "▲" if v >= 0 else "▼"


def _pct(part, whole):
    if not whole:
        return None
    return (part / whole - 1) * 100


# ---------- CSS (lifted verbatim from mockup) ----------
CSS = r"""
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --red: #d63b31; --red-light: #fde8e7;
  --green: #16a34a; --green-light: #dcfce7;
  --amber: #d97706; --amber-light: #fef3c7;
  --blue: #2563eb; --blue-light: #dbeafe;
  --gray-50: #f9fafb; --gray-100: #f3f4f6; --gray-200: #e5e7eb;
  --gray-300: #d1d5db; --gray-500: #6b7280; --gray-700: #374151; --gray-900: #111827;
}
body { font-family: 'Inter', -apple-system, sans-serif; background: #f0f2f5; color: var(--gray-900); min-width: 800px; padding: 28px; }
.header { background: white; border-radius: 16px; padding: 24px 28px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04); }
.header-left { display: flex; align-items: center; gap: 16px; }
.logo { background: var(--red); color: white; width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; box-shadow: 0 4px 12px rgba(214,59,49,0.3); }
.title h1 { font-size: 20px; font-weight: 800; color: var(--gray-900); }
.title p { font-size: 12px; color: var(--gray-500); margin-top: 2px; }
.header-right { text-align: right; }
.date-big { font-size: 24px; font-weight: 800; color: var(--gray-900); }
.date-sub { font-size: 12px; color: var(--gray-500); margin-top: 3px; }
.status-pill { display: inline-flex; align-items: center; gap: 5px; background: var(--green-light); color: var(--green); font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 100px; margin-top: 6px; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
.scorecard { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
.sc-card { background: white; border-radius: 14px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border-top: 4px solid transparent; position: relative; }
.sc-card.day { border-top-color: #2563eb; }
.sc-card.week { border-top-color: #7c3aed; }
.sc-card.month { border-top-color: #d97706; }
.sc-card.year { border-top-color: #16a34a; }
.sc-period { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--gray-500); margin-bottom: 10px; }
.sc-sales { font-size: 32px; font-weight: 900; color: var(--gray-900); letter-spacing: -1.5px; line-height: 1; }
.sc-plan { font-size: 12px; color: var(--gray-500); margin-top: 6px; }
.sc-plan strong { color: var(--gray-700); }
.sc-badges { display: flex; gap: 6px; margin-top: 14px; flex-wrap: wrap; }
.sc-badge { padding: 5px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 3px; }
.sc-badge.neg { background: var(--red-light); color: var(--red); }
.sc-badge.pos { background: var(--green-light); color: var(--green); }
.sc-badge small { font-size: 10px; font-weight: 500; opacity: 0.75; margin-left: 2px; }
.sc-progress { margin-top: 12px; height: 4px; background: var(--gray-100); border-radius: 4px; overflow: visible; position: relative; }
.sc-progress-fill { height: 100%; border-radius: 4px; }
.day .sc-progress-fill { background: #2563eb; }
.week .sc-progress-fill { background: #7c3aed; }
.month .sc-progress-fill { background: #d97706; }
.year .sc-progress-fill { background: #16a34a; }
.cohort-panel { background: white; border-radius: 14px; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.06); overflow: hidden; margin-bottom: 20px; }
.panel-header { padding: 16px 20px; border-bottom: 1px solid var(--gray-100); display: flex; align-items: center; justify-content: space-between; }
.panel-title { font-size: 13px; font-weight: 700; color: var(--gray-700); text-transform: uppercase; letter-spacing: 0.5px; }
.panel-hint { font-size: 11px; color: var(--gray-500); }
.cohort-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }
.cohort-col { padding: 20px; border-right: 1px solid var(--gray-100); }
.cohort-col:last-child { border-right: none; }
.cohort-header { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.cohort-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.total-icon { background: #dbeafe; } .same-icon { background: #dcfce7; } .acq-icon { background: #fef3c7; }
.cohort-col-title { font-size: 13px; font-weight: 700; color: var(--gray-900); }
.cohort-col-sub { font-size: 11px; color: var(--gray-500); }
.period-rows { display: flex; flex-direction: column; gap: 10px; }
.period-row { display: flex; align-items: center; padding: 10px 12px; background: var(--gray-50); border-radius: 8px; gap: 8px; }
.pr-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gray-500); width: 36px; flex-shrink: 0; }
.pr-sales { flex: 1; font-size: 14px; font-weight: 800; color: var(--gray-900); }
.pr-badges { display: flex; gap: 4px; }
.pr-badge { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 5px; }
.pr-badge.pos { background: var(--green-light); color: var(--green); }
.pr-badge.neg { background: var(--red-light); color: var(--red); }
.metrics-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
.metric-card { background: white; border-radius: 14px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.metric-icon-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.metric-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 17px; }
.metric-trend-pill { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 100px; }
.metric-trend-pill.pos { background: var(--green-light); color: var(--green); }
.metric-trend-pill.neg { background: var(--red-light); color: var(--red); }
.metric-val { font-size: 28px; font-weight: 900; color: var(--gray-900); letter-spacing: -1px; }
.metric-lbl { font-size: 11px; color: var(--gray-500); margin-top: 3px; }
.metric-vs { display: flex; gap: 12px; margin-top: 10px; border-top: 1px solid var(--gray-100); padding-top: 8px; }
.mv-item { font-size: 11px; }
.mv-item .lbl { color: var(--gray-500); }
.mv-item .val { font-weight: 700; }
.mv-item .val.pos { color: var(--green); }
.mv-item .val.neg { color: var(--red); }
.stores-panel { background: white; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); margin-bottom: 20px; }
.stores-table { width: 100%; border-collapse: collapse; }
.stores-table thead tr { background: var(--gray-50); border-bottom: 2px solid var(--gray-100); }
.stores-table th { padding: 11px 14px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gray-500); text-align: right; }
.stores-table th:first-child { text-align: left; }
.stores-table tbody tr { border-bottom: 1px solid var(--gray-100); }
.stores-table tbody tr:hover { background: var(--gray-50); }
.stores-table tbody tr:last-child { border-bottom: none; }
.stores-table td { padding: 11px 14px; font-size: 13px; text-align: right; color: var(--gray-700); }
.stores-table td:first-child { text-align: left; }
.rank-num { font-size: 11px; font-weight: 700; color: var(--gray-300); width: 24px; display: inline-block; }
.store-name-link { font-weight: 700; color: var(--gray-900); font-size: 13px; }
.store-cohort-tag { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; margin-left: 6px; }
.tag-same { background: #dcfce7; color: #16a34a; }
.tag-acq { background: #fef3c7; color: #d97706; }
.sales-num { font-weight: 700; color: var(--gray-900); }
.var-pill { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 6px; display: inline-block; }
.var-pill.pos { background: var(--green-light); color: var(--green); }
.var-pill.neg { background: var(--red-light); color: var(--red); }
.footer { text-align: center; font-size: 11px; color: var(--gray-500); padding: 16px; background: white; border-radius: 14px; }
.footer a { color: var(--red); text-decoration: none; font-weight: 600; }
"""


def _render_header(d: date) -> str:
    weekday = d.strftime("%A")
    doy = day_of_year(d)
    wk = week_number(d)
    q = quarter(d)
    pretty = d.strftime("%B %-d, %Y") if hasattr(d, "strftime") else str(d)
    # On Windows %-d is invalid; fall back
    try:
        pretty = d.strftime("%B %-d, %Y")
    except Exception:
        pretty = d.strftime("%B %#d, %Y")
    return f"""
<div style="margin-bottom:16px">
  <a href="https://aubuchon-it-command-center.vercel.app/?section=yoda"
     onclick="if(document.referrer.indexOf('aubuchon-it-command-center')!==-1){{history.back();return false;}}"
     style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:white;border:1px solid #e2e8f0;border-radius:8px;color:#334155;font-family:Inter,system-ui,sans-serif;font-size:14px;font-weight:500;text-decoration:none;box-shadow:0 1px 2px rgba(0,0,0,0.05);cursor:pointer;transition:background 0.15s;"
     onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    Back to Reports
  </a>
</div>
<div class="header">
  <div class="header-left">
    <div class="logo">A</div>
    <div class="title">
      <h1>Daily Sales Report</h1>
      <p>Aubuchon Hardware · 136 Stores · New England &amp; Mid-Atlantic</p>
    </div>
  </div>
  <div class="header-right">
    <div class="date-big">{pretty}</div>
    <div class="date-sub">{weekday} · Week {wk} · Q{q} · Day {doy} of 365</div>
    <div class="status-pill"><div class="status-dot"></div> Live Data · YODA</div>
  </div>
</div>
"""


def _sc_card(kind, label, sales, plan, ly):
    vsP = _pct(sales, plan)
    vsLY = _pct(sales, ly)
    width = 0 if not plan else min(100, max(0, (sales / plan) * 100))
    return f"""
<div class="sc-card {kind}">
  <div class="sc-period">{label}</div>
  <div class="sc-sales">{_fmt_money(sales, compact=True)}</div>
  <div class="sc-plan">of <strong>{_fmt_money(plan, compact=True)}</strong> plan</div>
  <div class="sc-badges">
    <div class="sc-badge {_badge_class(vsP)}">{_arrow(vsP)} {_fmt_pct(abs(vsP) if vsP is not None else None, 1, plus=False)} <small>vs Plan</small></div>
    <div class="sc-badge {_badge_class(vsLY)}">{_arrow(vsLY)} {_fmt_pct(abs(vsLY) if vsLY is not None else None, 1, plus=False)} <small>vs LY</small></div>
  </div>
  <div class="sc-progress"><div class="sc-progress-fill" style="width:{width:.1f}%"></div></div>
</div>
"""


def _render_scorecard(p, d: date):
    day_label = f"📅 Yesterday ({d.strftime('%b %-d')})" if d else "📅 Yesterday"
    try:
        day_label = f"📅 {d.strftime('%a %b %-d')}"
    except Exception:
        day_label = f"📅 {d.strftime('%a %b %#d')}"
    wk = week_number(d)
    month_name = d.strftime("%B")
    return f"""
<div class="scorecard">
  {_sc_card("day",   day_label, p["DAY_TY"],  p["DAY_PLAN"],  p["DAY_LY"])}
  {_sc_card("week",  f"📆 Week-to-Date · Wk {wk}", p["WTD_TY"], p["WTD_PLAN"], p["WTD_LY"])}
  {_sc_card("month", f"🗓 Month-to-Date · {month_name}", p["MTD_TY"], p["MTD_PLAN"], p["MTD_LY"])}
  {_sc_card("year",  f"📊 Year-to-Date · {d.year}", p["YTD_TY"], p["YTD_PLAN"], p["YTD_LY"])}
</div>
"""


def _cohort_rows(prefix, c, p, periods=("DAY", "WTD", "MTD", "YTD")):
    """Build 4 period rows for a cohort column.
       prefix: '' (total from period totals p), 'SS_' or 'AC_' (from cohort dict c).
       For total: use p dict. For SS/AC: use c dict.
    """
    rows = []
    src = p if prefix == "" else c
    for per in periods:
        ty = src.get(f"{prefix}{per}_TY", 0)
        plan = src.get(f"{prefix}{per}_PLAN", 0)
        ly = src.get(f"{prefix}{per}_LY", 0)
        vsP = _pct(ty, plan)
        vsLY = _pct(ty, ly)
        rows.append(f"""
<div class="period-row">
  <div class="pr-label">{per}</div>
  <div class="pr-sales">{_fmt_money(ty, compact=(per != 'DAY'))}</div>
  <div class="pr-badges">
    <div class="pr-badge {_badge_class(vsP)}">{_fmt_pct(vsP, 1)} P</div>
    <div class="pr-badge {_badge_class(vsLY)}">{_fmt_pct(vsLY, 1)} LY</div>
  </div>
</div>""")
    return "\n".join(rows)


def _render_cohorts(p, c):
    return f"""
<div class="cohort-panel">
  <div class="panel-header">
    <div class="panel-title">Sales by Store Group</div>
    <div class="panel-hint">vs Plan &nbsp;|&nbsp; vs LY &nbsp; across all periods</div>
  </div>
  <div class="cohort-cards">
    <div class="cohort-col">
      <div class="cohort-header">
        <div class="cohort-icon total-icon">🏢</div>
        <div><div class="cohort-col-title">Total Company</div><div class="cohort-col-sub">All 136 stores</div></div>
      </div>
      <div class="period-rows">{_cohort_rows("", c, p)}</div>
    </div>
    <div class="cohort-col">
      <div class="cohort-header">
        <div class="cohort-icon same-icon">🏪</div>
        <div><div class="cohort-col-title">Same Store</div><div class="cohort-col-sub">109 stores · comp ≥ 1yr</div></div>
      </div>
      <div class="period-rows">{_cohort_rows("SS_", c, p)}</div>
    </div>
    <div class="cohort-col">
      <div class="cohort-header">
        <div class="cohort-icon acq-icon">🆕</div>
        <div><div class="cohort-col-title">Acquisition Stores</div><div class="cohort-col-sub">27 stores · non-comp</div></div>
      </div>
      <div class="period-rows">{_cohort_rows("AC_", c, p)}</div>
    </div>
  </div>
</div>
"""


def _render_metrics(m, plan_txn):
    txn_ty = m["TXN_TY"]; txn_ly = m["TXN_LY"]
    avg_ty = m["AVG_TY"]; avg_ly = m["AVG_LY"]
    upt_ty = m["UPT_TY"]; upt_ly = m["UPT_LY"]
    txn_vs_ly = _pct(txn_ty, txn_ly)
    txn_vs_plan = _pct(txn_ty, plan_txn) if plan_txn else None
    avg_vs_ly = _pct(avg_ty, avg_ly)
    upt_vs_ly = _pct(upt_ty, upt_ly)
    return f"""
<div class="metrics-strip">
  <div class="metric-card">
    <div class="metric-icon-row">
      <div class="metric-icon" style="background:#dbeafe">🛒</div>
      <div class="metric-trend-pill {_badge_class(txn_vs_ly)}">{_arrow(txn_vs_ly)} {_fmt_pct(abs(txn_vs_ly) if txn_vs_ly is not None else None, 1, plus=False)} LY</div>
    </div>
    <div class="metric-val">{int(txn_ty):,}</div>
    <div class="metric-lbl">Transactions · Yesterday</div>
    <div class="metric-vs">
      <div class="mv-item"><span class="lbl">vs Plan: </span><span class="val {_badge_class(txn_vs_plan)}">{_fmt_pct(txn_vs_plan, 1)}</span></div>
      <div class="mv-item"><span class="lbl">Plan: </span><span class="val">{int(plan_txn):,}</span></div>
    </div>
  </div>
  <div class="metric-card">
    <div class="metric-icon-row">
      <div class="metric-icon" style="background:#f3e8ff">💰</div>
      <div class="metric-trend-pill {_badge_class(avg_vs_ly)}">{_arrow(avg_vs_ly)} {_fmt_pct(abs(avg_vs_ly) if avg_vs_ly is not None else None, 1, plus=False)} LY</div>
    </div>
    <div class="metric-val">${avg_ty:.2f}</div>
    <div class="metric-lbl">Avg. Sale · Yesterday</div>
    <div class="metric-vs">
      <div class="mv-item"><span class="lbl">LY: </span><span class="val">${avg_ly:.2f}</span></div>
    </div>
  </div>
  <div class="metric-card">
    <div class="metric-icon-row">
      <div class="metric-icon" style="background:#fef9c3">📦</div>
      <div class="metric-trend-pill {_badge_class(upt_vs_ly)}">{_arrow(upt_vs_ly)} {_fmt_pct(abs(upt_vs_ly) if upt_vs_ly is not None else None, 1, plus=False)} LY</div>
    </div>
    <div class="metric-val">{upt_ty:.2f}</div>
    <div class="metric-lbl">Units per Transaction · Yesterday</div>
    <div class="metric-vs">
      <div class="mv-item"><span class="lbl">LY: </span><span class="val">{upt_ly:.2f}</span></div>
    </div>
  </div>
  <div class="metric-card">
    <div class="metric-icon-row">
      <div class="metric-icon" style="background:#dcfce7">🎯</div>
      <div class="metric-trend-pill pos">Live</div>
    </div>
    <div class="metric-val">{int(txn_ty):,}</div>
    <div class="metric-lbl">Total Txns (confirmed)</div>
    <div class="metric-vs">
      <div class="mv-item"><span class="lbl">LY Txns: </span><span class="val">{int(txn_ly):,}</span></div>
    </div>
  </div>
</div>
"""


def _render_state_map(state_data):
    """state_data: {state_code: {sales, plan, ly, stores}}. Returns SVG + summary table."""
    # Build lookup of vsP per code
    rows = []
    for code, r in state_data.items():
        vsP = _pct(r["sales"], r["plan"])
        rows.append({"code": code, "vsP": vsP if vsP is not None else 0, **r})
    rows.sort(key=lambda x: x["vsP"], reverse=True)
    by_code = {r["code"]: r for r in rows}

    svg_paths = []
    svg_paths.append('<rect width="520" height="310" fill="#f8fafc" rx="6"/>')
    for s in STATES:
        d = by_code.get(s["code"])
        vsP = d["vsP"] if d else 0
        fill = color_for_pct(vsP) if d else "#e5e7eb"
        sales = d["sales"] if d else 0
        stores = d["stores"] if d else 0
        title = f'{s["name"]}: {_fmt_pct(vsP,1)} vs Plan | {_fmt_money(sales,True)} sales | {stores} stores'
        svg_paths.append(f'<path d="{s["d"]}" fill="{fill}" stroke="#334155" stroke-width="0.75"><title>{escape(title)}</title></path>')
        if s.get("no_label"):
            continue
        txt_color = text_fill_for_pct(vsP) if d else "#1f2937"
        if s.get("external_label"):
            # Leader line + external label — coordinates come from the state dict
            # so we can place labels for tiny states (RI, northern VA sliver) cleanly.
            conn = s.get("connector")
            if conn:
                (csx, csy), (cex, cey) = conn
                svg_paths.append(f'<line x1="{csx}" y1="{csy}" x2="{cex}" y2="{cey}" stroke="#334155" stroke-width="0.75"/>')
            lx, ly = s["label_xy"]
            svg_paths.append(f'<text x="{lx}" y="{ly}" text-anchor="middle" font-size="8" font-weight="700" fill="#1f2937" font-family="Arial,sans-serif">{s["code"]} {_fmt_pct(vsP,1)}</text>')
            continue
        if s.get("combined_label"):
            x, y = s["label_xy"]
            svg_paths.append(f'<text x="{x}" y="{y}" text-anchor="middle" font-size="8.5" font-weight="700" fill="{txt_color}" font-family="Arial,sans-serif">{s["code"]} {_fmt_pct(vsP,1)}</text>')
            continue
        lx, ly = s["label_xy"]; px, py = s["pct_xy"]
        svg_paths.append(f'<text x="{lx}" y="{ly}" text-anchor="middle" font-size="8.5" font-weight="700" fill="{txt_color}" font-family="Arial,sans-serif">{s["code"]}</text>')
        svg_paths.append(f'<text x="{px}" y="{py}" text-anchor="middle" font-size="8" fill="{txt_color}" font-family="Arial,sans-serif">{_fmt_pct(vsP,1)}</text>')

    # Legend: ColorBrewer RdYlGn gradient matching color_for_pct anchor stops
    leg_x, leg_y, leg_w, leg_h = 12, 282, 160, 10
    grad_stops = "".join(f'<stop offset="{off*100:.2f}%" stop-color="{c}"/>' for off, c in LEGEND_STOPS)
    svg_paths.append(f'<defs><linearGradient id="legGrad" x1="0" x2="1" y1="0" y2="0">{grad_stops}</linearGradient></defs>')
    svg_paths.append(f'<rect x="{leg_x}" y="{leg_y}" width="{leg_w}" height="{leg_h}" rx="2" fill="url(#legGrad)" stroke="#334155" stroke-width="0.5"/>')
    # Tick marks + labels at every anchor stop so reader can calibrate the gradient
    tick_vals = [-35, -25, -15, -7, 0, 7, 15, 25]
    zero_range = LEGEND_MAX - LEGEND_MIN
    for v in tick_vals:
        x_pos = leg_x + (v - LEGEND_MIN) / zero_range * leg_w
        svg_paths.append(f'<line x1="{x_pos:.1f}" y1="{leg_y + leg_h}" x2="{x_pos:.1f}" y2="{leg_y + leg_h + 3}" stroke="#334155" stroke-width="0.5"/>')
        lbl = f'{"+" if v > 0 else ""}{v}%'
        svg_paths.append(f'<text x="{x_pos:.1f}" y="{leg_y + leg_h + 10}" text-anchor="middle" font-size="7" fill="#6b7280" font-family="Arial,sans-serif">{lbl}</text>')
    svg_paths.append(f'<text x="{leg_x + leg_w/2:.1f}" y="{leg_y - 4}" text-anchor="middle" font-size="8" font-weight="600" fill="#374151" font-family="Arial,sans-serif">% vs Plan</text>')

    svg = '<svg viewBox="0 0 520 310" xmlns="http://www.w3.org/2000/svg" style="width:540px;max-width:100%;height:auto;display:block;border-radius:6px;overflow:hidden">' + "\n".join(svg_paths) + "</svg>"

    # Summary table rows (sorted best → worst)
    name_map = {s["code"]: s["name"] for s in STATES}
    name_map["VA"] = "Virginia"
    table_rows = []
    for r in rows:
        color = "#16a34a" if r["vsP"] > 0 else ("#6b7280" if r["vsP"] == 0 else "#dc2626")
        table_rows.append(f'''<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:5px 8px 5px 0;font-weight:600">{name_map.get(r["code"], r["code"])}</td><td style="text-align:right;padding:5px 4px">{_fmt_money(r["sales"])}</td><td style="text-align:right;padding:5px 4px;font-weight:700;color:{color}">{_fmt_pct(r["vsP"],1)}</td><td style="text-align:right;padding:5px 0 5px 4px;color:#6b7280">{r["stores"]}</td></tr>''')

    return f"""
    <div class="stores-panel" style="margin-bottom:20px">
        <div class="panel-header">
            <div class="panel-title">Sales by State · Yesterday vs Plan</div>
            <div class="panel-hint">Color = % vs Plan · hover for details</div>
        </div>
        <div style="display:flex;gap:24px;align-items:flex-start;padding:16px 20px 12px;flex-wrap:wrap">
            <div style="position:relative;flex:0 0 auto">{svg}</div>
            <div style="flex:1;min-width:190px;padding-top:4px">
                <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">State Summary</div>
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                    <thead><tr style="border-bottom:2px solid #e5e7eb">
                        <th style="text-align:left;padding:4px 8px 4px 0;color:#6b7280;font-weight:600;font-size:11px">State</th>
                        <th style="text-align:right;padding:4px 4px;color:#6b7280;font-weight:600;font-size:11px">Sales</th>
                        <th style="text-align:right;padding:4px 4px;color:#6b7280;font-weight:600;font-size:11px">vs Plan</th>
                        <th style="text-align:right;padding:4px 0 4px 4px;color:#6b7280;font-weight:600;font-size:11px">Stores</th>
                    </tr></thead>
                    <tbody>{''.join(table_rows)}</tbody>
                </table>
            </div>
        </div>
    </div>
    """

def _store_row(rank_sym, r, bg=""):
    cohort_tag = "tag-same" if r["cohort"] == "Comp-Store" else "tag-acq"
    cohort_label = "Same" if r["cohort"] == "Comp-Store" else "Acq"
    vsLY_html = (
        f'<span class="var-pill {_badge_class(r["vsLY"])}">{_fmt_pct(r["vsLY"], 1)}</span>'
        if r["vsLY"] is not None
        else '<span class="var-pill" style="background:#f3f4f6;color:#6b7280">N/A</span>'
    )
    style = f' style="background:{bg}"' if bg else ""
    return f"""
<tr{style}>
  <td style="padding-left:20px">
    <span class="rank-num">{rank_sym}</span>
    <span class="store-name-link">{escape(r["name"])}</span>
    <span class="store-cohort-tag {cohort_tag}">{cohort_label}</span>
    <div style="font-size:11px; color:#6b7280; margin-left:24px; margin-top:2px">{r["state"]}</div>
  </td>
  <td><span class="sales-num">{_fmt_money(r["sales"])}</span></td>
  <td><span class="var-pill {_badge_class(r["vsP"])}">{_fmt_pct(r["vsP"], 1)}</span></td>
  <td>{vsLY_html}</td>
  <td>{int(r["txns"]):,}</td>
  <td>${r["avg"]:.2f}</td>
</tr>"""


def _render_stores(ranked):
    top = ranked[:5]
    bottom = list(reversed(ranked[-5:]))  # show worst-first? Keep mockup order: worst at top of bottom section
    bottom = ranked[-5:][::-1]  # sorted descending vsP → last 5 are worst; reverse so worst is first
    # Mockup shows bottom sorted worst-first
    bottom = sorted(ranked[-5:], key=lambda x: x["vsP"])
    top_rows = []
    for i, r in enumerate(top):
        sym = "🏆" if i == 0 else f"#{i+1}"
        top_rows.append(_store_row(sym, r, bg="#f0fdf4"))
    bot_rows = [_store_row("↓", r) for r in bottom]

    return f"""
<div class="stores-panel">
  <div class="panel-header">
    <div class="panel-title">Store Performance · Yesterday vs Plan</div>
    <div class="panel-hint">Top 5 and Bottom 5 · ranked by vs Plan</div>
  </div>
  <table class="stores-table">
    <thead><tr>
      <th style="text-align:left; width:220px; padding-left:20px">Store</th>
      <th>Sales</th><th>vs Plan</th><th>vs LY</th><th>Txns</th><th>Avg Sale</th>
    </tr></thead>
    <tbody>
      {''.join(top_rows)}
      <tr style="background:#f9fafb"><td colspan="6" style="text-align:center; padding:6px; font-size:10px; color:#9ca3af; letter-spacing:1px; text-transform:uppercase">— · · · — Bottom Performers — · · · —</td></tr>
      {''.join(bot_rows)}
    </tbody>
  </table>
</div>
"""


def render_report(report_date: date, totals, cohorts, metrics, state_data, store_ranked) -> str:
    try:
        title_date = report_date.strftime("%B %-d, %Y")
    except Exception:
        title_date = report_date.strftime("%B %#d, %Y")
    body = (
        _render_header(report_date)
        + _render_scorecard(totals, report_date)
        + _render_cohorts(totals, cohorts)
        + _render_metrics(metrics, metrics.get("TXN_PLAN", 0))
        + _render_state_map(state_data)
        + _render_stores(store_ranked)
        + """
<div class="footer">
  Powered by YODA · Aubuchon Hardware · Report questions? <a href="mailto:scott@aubuchon.com">Contact Scott Aubuchon</a>
</div>
"""
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Aubuchon Daily Sales Report — {title_date}</title>
<style>{CSS}</style>
</head>
<body>
{body}
</body>
</html>"""

