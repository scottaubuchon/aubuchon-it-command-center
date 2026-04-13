"""
Daily Sales Report — production builder.

Usage:
  python build_report.py                      # yesterday
  python build_report.py --date 2026-04-09    # specific date
  python build_report.py --date 2026-04-09 --push   # also push to GitHub

Output:
  ./output/daily-sales-YYYY-MM-DD.html
  ./output/daily-sales-latest.html  (copy)

If --push: uploads the latest to
  scottaubuchon/aubuchon-it-command-center:public/reports/daily-sales-latest.html
  scottaubuchon/aubuchon-it-command-center:public/reports/daily-sales-YYYY-MM-DD.html
Vercel auto-deploys within ~30s; report is live at
  https://aubuchon-it-command-center.vercel.app/reports/daily-sales-latest.html
"""
import argparse
import base64
import json
import os
import shutil
import sys
from datetime import date, timedelta
from pathlib import Path

import requests

from date_ranges import ranges_for
from queries import (
    fetch_period_totals, fetch_cohort_totals, fetch_metrics_day,
    fetch_store_dim, fetch_store_sales,
    aggregate_by_state, build_store_ranks,
)
from renderer import render_report


REPO = "scottaubuchon/aubuchon-it-command-center"
# Token must be provided via GITHUB_TOKEN env var (GitHub Actions sets this automatically).
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="YYYY-MM-DD (defaults to yesterday)")
    ap.add_argument("--push", action="store_true", help="Push HTML to GitHub → Vercel")
    ap.add_argument("--out", default="./output", help="Output folder")
    return ap.parse_args()


def build(report_date: date) -> str:
    print(f"[1/6] Computing date ranges for {report_date}...")
    ranges = ranges_for(report_date)
    for k, (a, b) in ranges.items():
        print(f"      {k}: {a} .. {b}")

    print("[2/6] Fetching period totals (TY + Plan + LY)...")
    totals = fetch_period_totals(ranges)

    print("[3/6] Fetching cohort totals (SS + Acq × 4 periods)...")
    cohorts = fetch_cohort_totals(ranges)

    print("[4/6] Fetching DAY metrics (txns, units, avg, upt)...")
    metrics = fetch_metrics_day(ranges)

    print("[5/6] Fetching store dim + TY/LY store sales...")
    dim = fetch_store_dim()
    store_ty = fetch_store_sales(ranges["DAY"])
    store_ly = fetch_store_sales(ranges["DAY_LY"])
    state_data = aggregate_by_state(store_ty, store_ly, dim)
    store_ranked = build_store_ranks(store_ty, store_ly, dim)

    print(f"      {len(dim)} stores in dim, {len(store_ty)} with TY sales, {len(state_data)} states")

    print("[6/6] Rendering HTML...")
    return render_report(report_date, totals, cohorts, metrics, state_data, store_ranked)


def push_to_github(html: str, report_date: date) -> None:
    print("[PUSH] Uploading to GitHub...")
    for path in (
        f"public/reports/daily-sales-latest.html",
        f"public/reports/daily-sales-{report_date.isoformat()}.html",
    ):
        url = f"https://api.github.com/repos/{REPO}/contents/{path}"
        # GET existing SHA if file exists
        r = requests.get(url, headers={"Authorization": f"token {GITHUB_TOKEN}"})
        sha = r.json().get("sha") if r.status_code == 200 else None
        b64 = base64.b64encode(html.encode("utf-8")).decode()
        body = {"message": f"report: daily sales {report_date.isoformat()}", "content": b64}
        if sha:
            body["sha"] = sha
        r = requests.put(
            url,
            headers={"Authorization": f"token {GITHUB_TOKEN}", "Content-Type": "application/json"},
            data=json.dumps(body),
        )
        if r.status_code not in (200, 201):
            print(f"      FAILED {path}: {r.status_code} {r.text[:300]}")
        else:
            sha_short = r.json()["commit"]["sha"][:7]
            print(f"      OK {path} → commit {sha_short}")


def main():
    args = parse_args()
    if args.date:
        y, m, d = args.date.split("-")
        report_date = date(int(y), int(m), int(d))
    else:
        report_date = date.today() - timedelta(days=1)

    html = build(report_date)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    dated = out_dir / f"daily-sales-{report_date.isoformat()}.html"
    latest = out_dir / "daily-sales-latest.html"
    dated.write_text(html, encoding="utf-8")
    shutil.copyfile(dated, latest)
    print(f"Wrote {dated}")
    print(f"Wrote {latest}")

    if args.push:
        push_to_github(html, report_date)
        print()
        print("Live at:")
        print(f"  https://aubuchon-it-command-center.vercel.app/reports/daily-sales-latest.html")
        print(f"  https://aubuchon-it-command-center.vercel.app/reports/daily-sales-{report_date.isoformat()}.html")


if __name__ == "__main__":
    main()
