#!/usr/bin/env python3
"""Refresh the dated fallback from the official, allowlisted NGA SMAPS feeds.

Snapshots are context only. Runtime must validate the current in-force list before
an alert can contribute to the observed-track presence indicator.
"""
import concurrent.futures
import datetime
import json
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "frontend/public/warnings/nga-smaps-snapshot.json"
AREAS = ("4", "12", "A", "P", "C")
MAX_BYTES = 2_000_000


def load_area(area):
    query = urllib.parse.urlencode({
        "navArea": area, "status": "active", "category": "14", "output": "json",
    })
    request = urllib.request.Request(
        "https://msi.nga.mil/api/publications/smaps?" + query,
        headers={"User-Agent": "AIS-vessel-tracker-source-research/1.0"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("NGA source exceeds bounded import size")
    parsed = json.loads(data)
    rows = parsed.get("smaps")
    if not isinstance(rows, list):
        raise ValueError("Invalid SMAPS schema")
    return rows


def main():
    # If any area fails, retain the existing snapshot and its original timestamp.
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        batches = list(executor.map(load_area, AREAS))
    rows = [row for batch in batches for row in batch]
    result = {
        "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sourceUrl": "https://msi.nga.mil/NavWarnings",
        "source": "NGA SMAPS",
        "smaps": rows,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    temporary.replace(OUTPUT)
    print(f"Saved {len(rows)} in-force source messages to {OUTPUT}")


if __name__ == "__main__":
    main()
