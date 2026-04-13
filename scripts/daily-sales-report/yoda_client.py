"""
YODA proxy client — thin wrapper around POST /query.
"""
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

YODA_URL = "https://yoda-aubuchon.duckdns.org:5088"
YODA_KEY = "aubuchon-yoda-2026"


def query(dax: str, timeout: int = 120):
    """Run a DAX query against YODA, return list[dict] of rows."""
    r = requests.post(
        f"{YODA_URL}/query",
        json={"dax": dax},
        headers={"X-API-Key": YODA_KEY},
        verify=False,
        timeout=timeout,
    )
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(f"YODA error: {data['error']}\nDAX:\n{dax}")
    return data.get("rows", [])


def first_row(dax: str) -> dict:
    rows = query(dax)
    if not rows:
        raise RuntimeError(f"No rows from YODA for:\n{dax}")
    return rows[0]


def strip_bracket(d: dict) -> dict:
    """YODA returns keys like 'Table[Col' with no closing bracket. Normalize."""
    out = {}
    for k, v in d.items():
        if "[" in k:
            out[k.split("[", 1)[1]] = v
        else:
            out[k] = v
    return out
