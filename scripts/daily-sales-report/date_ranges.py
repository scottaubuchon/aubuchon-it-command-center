"""
Date range + LY equivalent math for the Daily Sales Report.

Rules:
- WTD: week starts Sunday. For date D, find most recent Sunday on or before D.
- MTD: 1st of D's month through D.
- YTD: Jan 1 of D's year through D.
- LY: 52 weeks back = 364 days back = same day-of-week, one year prior.
"""
from datetime import date, timedelta


def week_start_sunday(d: date) -> date:
    # Python weekday: Mon=0..Sun=6. We want Sunday as start.
    # Days since last Sunday:
    dow = (d.weekday() + 1) % 7  # Sun=0..Sat=6
    return d - timedelta(days=dow)


def ranges_for(d: date):
    """Return dict of (start, end) date tuples for DAY/WTD/MTD/YTD + LY equivalents."""
    day_start = day_end = d
    wtd_start = week_start_sunday(d)
    wtd_end = d
    mtd_start = d.replace(day=1)
    mtd_end = d
    ytd_start = d.replace(month=1, day=1)
    ytd_end = d

    ly_offset = timedelta(days=364)
    ly_day = d - ly_offset
    ly_wtd_start = wtd_start - ly_offset
    ly_wtd_end = wtd_end - ly_offset
    ly_mtd_start = mtd_start - ly_offset
    ly_mtd_end = mtd_end - ly_offset
    ly_ytd_start = ytd_start - ly_offset
    ly_ytd_end = ytd_end - ly_offset

    return {
        "DAY": (day_start, day_end),
        "WTD": (wtd_start, wtd_end),
        "MTD": (mtd_start, mtd_end),
        "YTD": (ytd_start, ytd_end),
        "DAY_LY": (ly_day, ly_day),
        "WTD_LY": (ly_wtd_start, ly_wtd_end),
        "MTD_LY": (ly_mtd_start, ly_mtd_end),
        "YTD_LY": (ly_ytd_start, ly_ytd_end),
    }


def dax_date(d: date) -> str:
    return f"DATE({d.year},{d.month},{d.day})"


def dax_between(col: str, start: date, end: date) -> str:
    if start == end:
        return f"{col} = {dax_date(start)}"
    return f"{col} >= {dax_date(start)}, {col} <= {dax_date(end)}"


def week_number(d: date) -> int:
    """Aubuchon fiscal week (Sun-start). Week 1 contains the first Sunday of the year? Use ISO-ish: week of year where week starts Sunday."""
    # Simple approach: weeks since Jan 1, counting from first Sunday
    jan1 = d.replace(month=1, day=1)
    # Find first Sunday on or after Jan 1
    # If Jan 1 is Sunday, week 1 starts there.
    dow = (jan1.weekday() + 1) % 7  # Sun=0
    first_sunday = jan1 if dow == 0 else jan1 + timedelta(days=(7 - dow))
    if d < first_sunday:
        return 1
    return ((d - first_sunday).days // 7) + 1


def quarter(d: date) -> int:
    return (d.month - 1) // 3 + 1


def day_of_year(d: date) -> int:
    return (d - d.replace(month=1, day=1)).days + 1
