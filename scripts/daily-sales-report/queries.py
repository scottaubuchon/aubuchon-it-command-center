"""
All YODA DAX queries for the Daily Sales Report.

Returns structured data dict the renderer consumes.
"""
from collections import defaultdict
from datetime import date

from yoda_client import query, first_row, strip_bracket
from date_ranges import dax_between, dax_date


def _period_filter(col, rng):
    start, end = rng
    return dax_between(col, start, end)


def fetch_period_totals(ranges):
    """DAY/WTD/MTD/YTD TY sales + plan, plus LY sales."""
    col_ty = "RPT_SCORECARD_BY_DAY[TRANSACTION_DT]"
    sales = "RPT_SCORECARD_BY_DAY[ACTUAL_SALES_AMT]"
    plan = "RPT_SCORECARD_BY_DAY[TARGET_DAILY_SALES_AMT]"

    parts = []
    for per in ("DAY", "WTD", "MTD", "YTD"):
        f = _period_filter(col_ty, ranges[per])
        parts.append(f'"{per}_TY", CALCULATE(SUM({sales}), {f})')
        parts.append(f'"{per}_PLAN", CALCULATE(SUM({plan}), {f})')
    for per in ("DAY", "WTD", "MTD", "YTD"):
        f = _period_filter(col_ty, ranges[f"{per}_LY"])
        parts.append(f'"{per}_LY", CALCULATE(SUM({sales}), {f})')

    dax = "EVALUATE ROW(\n  " + ",\n  ".join(parts) + "\n)"
    row = first_row(dax)
    # Keys look like "[DAY_TY" -> strip
    return {k.lstrip("[").rstrip("]"): float(v or 0) for k, v in row.items()}


def fetch_cohort_totals(ranges):
    """Same-Store (Comp-Store) and Acquisition (Non-Comp-Store) across 4 periods, TY + LY."""
    col_ty = "RPT_SCORECARD_BY_DAY[TRANSACTION_DT]"
    sales = "RPT_SCORECARD_BY_DAY[ACTUAL_SALES_AMT]"
    plan = "RPT_SCORECARD_BY_DAY[TARGET_DAILY_SALES_AMT]"

    def cohort_expr(name, val, rng_key):
        f = _period_filter(col_ty, ranges[rng_key])
        flt = f'FILTER(DIM_STORE, DIM_STORE[STORE_COHORT] = "{val}")'
        return (f, flt)

    parts = []
    for tag, val in (("SS", "Comp-Store"), ("AC", "Non-Comp-Store")):
        for per in ("DAY", "WTD", "MTD", "YTD"):
            f, flt = cohort_expr(tag, val, per)
            parts.append(f'"{tag}_{per}_TY", CALCULATE(SUM({sales}), {f}, {flt})')
            parts.append(f'"{tag}_{per}_PLAN", CALCULATE(SUM({plan}), {f}, {flt})')
            f_ly, _ = cohort_expr(tag, val, f"{per}_LY")
            parts.append(f'"{tag}_{per}_LY", CALCULATE(SUM({sales}), {f_ly}, {flt})')

    dax = "EVALUATE ROW(\n  " + ",\n  ".join(parts) + "\n)"
    row = first_row(dax)
    return {k.lstrip("[").rstrip("]"): float(v or 0) for k, v in row.items()}


def _date_key(d):
    return int(d.strftime("%Y%m%d"))


def fetch_metrics_day(ranges):
    """Transactions, Units, UPT, Avg Sale for DAY (TY + LY).
    Txns + sales come from RPT_SCORECARD_BY_DAY; units come from FCT_TRANSACTION_LINE."""
    col = "RPT_SCORECARD_BY_DAY[TRANSACTION_DT]"
    f = _period_filter(col, ranges["DAY"])
    f_ly = _period_filter(col, ranges["DAY_LY"])

    txn = "RPT_SCORECARD_BY_DAY[TRANSACTION_CNT]"
    sales = "RPT_SCORECARD_BY_DAY[ACTUAL_SALES_AMT]"

    dax = f"""
EVALUATE ROW(
  "TXN_TY", CALCULATE(SUM({txn}), {f}),
  "TXN_LY", CALCULATE(SUM({txn}), {f_ly}),
  "SALES_TY", CALCULATE(SUM({sales}), {f}),
  "SALES_LY", CALCULATE(SUM({sales}), {f_ly})
)
"""
    row = first_row(dax)
    r = {k.lstrip("[").rstrip("]"): float(v or 0) for k, v in row.items()}

    # Units via FCT_TRANSACTION_LINE (date key = YYYYMMDD)
    day_key = _date_key(ranges["DAY"][0])
    day_ly_key = _date_key(ranges["DAY_LY"][0])
    dax_units = f"""
EVALUATE ROW(
  "UNITS_TY", CALCULATE(SUM(FCT_TRANSACTION_LINE[UPT_SALE_QTY]), FCT_TRANSACTION_LINE[TRANSACTION_DATE_KEY] = {day_key}),
  "UNITS_LY", CALCULATE(SUM(FCT_TRANSACTION_LINE[UPT_SALE_QTY]), FCT_TRANSACTION_LINE[TRANSACTION_DATE_KEY] = {day_ly_key})
)
"""
    try:
        urow = first_row(dax_units)
        for k, v in urow.items():
            r[k.lstrip("[").rstrip("]")] = float(v or 0)
    except Exception:
        r["UNITS_TY"] = 0
        r["UNITS_LY"] = 0

    r["TXN_PLAN"] = 0  # Not available as a plan metric in YODA
    r["AVG_TY"] = (r["SALES_TY"] / r["TXN_TY"]) if r["TXN_TY"] else 0
    r["AVG_LY"] = (r["SALES_LY"] / r["TXN_LY"]) if r["TXN_LY"] else 0
    r["UPT_TY"] = (r["UNITS_TY"] / r["TXN_TY"]) if r["TXN_TY"] else 0
    r["UPT_LY"] = (r["UNITS_LY"] / r["TXN_LY"]) if r["TXN_LY"] else 0
    return r


def fetch_store_dim():
    """Store metadata: code -> {name, state, cohort}."""
    dax = """
EVALUATE FILTER(
  SUMMARIZECOLUMNS(DIM_STORE[STORE_CD], DIM_STORE[STORE_CITY_NM], DIM_STORE[STORE_STATE_CD], DIM_STORE[STORE_COHORT]),
  DIM_STORE[STORE_COHORT] <> "Closed"
)
"""
    rows = query(dax)
    out = {}
    for r in rows:
        r = strip_bracket(r)
        try:
            cd = str(int(r["STORE_CD"]))
        except Exception:
            continue
        out[cd] = {
            "name": r.get("STORE_CITY_NM", "") or "",
            "state": r.get("STORE_STATE_CD", "") or "",
            "cohort": r.get("STORE_COHORT", "") or "",
        }
    return out


def fetch_store_sales(rng):
    """Store-level sales, plan, txns for a date range."""
    start, end = rng
    f = dax_between("RPT_SCORECARD_BY_DAY[TRANSACTION_DT]", start, end)
    dax = f"""
EVALUATE CALCULATETABLE(
  FILTER(
    SUMMARIZECOLUMNS(
      RPT_SCORECARD_BY_DAY[LOCATION_CD],
      "Sales", SUM(RPT_SCORECARD_BY_DAY[ACTUAL_SALES_AMT]),
      "Plan",  SUM(RPT_SCORECARD_BY_DAY[TARGET_DAILY_SALES_AMT]),
      "Txns",  SUM(RPT_SCORECARD_BY_DAY[TRANSACTION_CNT])
    ),
    [Plan] > 0
  ),
  {f}
)
"""
    rows = query(dax)
    out = {}
    for r in rows:
        r = strip_bracket(r)
        try:
            cd = str(int(r.get("LOCATION_CD") or r.get("LOCATION_CD]") or 0))
        except Exception:
            continue
        out[cd] = {
            "sales": float(r.get("Sales") or 0),
            "plan": float(r.get("Plan") or 0),
            "txns": float(r.get("Txns") or 0),
        }
    return out


def aggregate_by_state(store_sales_ty, store_sales_ly, dim):
    """Aggregate store-level TY+LY into state totals."""
    state = defaultdict(lambda: {"sales": 0.0, "plan": 0.0, "ly": 0.0, "stores": 0})
    counted = set()
    for cd, row in store_sales_ty.items():
        s = dim.get(cd, {}).get("state") or "??"
        state[s]["sales"] += row["sales"]
        state[s]["plan"] += row["plan"]
        if cd not in counted and row["sales"] > 0:
            state[s]["stores"] += 1
            counted.add(cd)
    for cd, row in store_sales_ly.items():
        s = dim.get(cd, {}).get("state") or "??"
        state[s]["ly"] += row["sales"]
    return dict(state)


def build_store_ranks(store_sales_ty, store_sales_ly, dim):
    """Return [{code, name, state, cohort, sales, plan, txns, vsP, ly, vsLY, avg}] sorted by vsP desc."""
    rows = []
    for cd, r in store_sales_ty.items():
        if r["plan"] <= 0 or r["sales"] <= 0:
            continue
        d = dim.get(cd, {})
        ly_sales = store_sales_ly.get(cd, {}).get("sales", 0)
        vsP = (r["sales"] / r["plan"] - 1) * 100
        vsLY = None if ly_sales <= 0 else (r["sales"] / ly_sales - 1) * 100
        avg = (r["sales"] / r["txns"]) if r["txns"] else 0
        rows.append({
            "code": cd, "name": d.get("name", ""), "state": d.get("state", ""),
            "cohort": d.get("cohort", ""),
            "sales": r["sales"], "plan": r["plan"], "txns": r["txns"],
            "vsP": vsP, "ly": ly_sales, "vsLY": vsLY, "avg": avg,
        })
    rows.sort(key=lambda x: x["vsP"], reverse=True)
    return rows
