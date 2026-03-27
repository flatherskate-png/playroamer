#!/usr/bin/env python3
"""
Enrichment pipeline: all-global-routes-cleaned.csv -> routes.enriched.csv

Adds lat, lng, photo_url, and is_decoy (always false — decoys must be
added manually to routes.enriched.csv after the fact).

Usage:
    python enrich.py
    python enrich.py --input path/to/input.csv --output path/to/output.csv
    python enrich.py --force          # re-fetch even if row already enriched

Environment variables:
    UNSPLASH_ACCESS_KEY   required

Exit codes:
    0   all rows enriched successfully
    1   one or more rows failed; partial output written to --output
"""

import argparse
import csv
import os
import sys
import time
from pathlib import Path

import requests

# ── Paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR  = Path(__file__).resolve().parent
DEFAULT_IN  = SCRIPT_DIR / "all-global-routes-cleaned.csv"
DEFAULT_OUT = SCRIPT_DIR / "routes.enriched.csv"

# Load a .env file by walking up from the script's directory.
# This finds backend/.env when the script lives at backend/data/enrich.py,
# regardless of the working directory the script is invoked from.
# python-dotenv is optional — if not installed the script falls back to the
# real environment.
try:
    from dotenv import load_dotenv
    _dotenv_path = next(
        (p / ".env" for p in [SCRIPT_DIR, *SCRIPT_DIR.parents] if (p / ".env").exists()),
        None,
    )
    load_dotenv(dotenv_path=_dotenv_path)
except ImportError:
    pass


# ── Constants ─────────────────────────────────────────────────────────────────

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# TODO: replace with a real project URL or contact email before production use.
# Nominatim's usage policy requires a valid contact in the User-Agent header.
# See: https://operations.osmfoundation.org/policies/nominatim/
NOMINATIM_UA    = "roamer-enrichment/1.0 (https://github.com/your-org/roamer)"
NOMINATIM_PAUSE = 1.1   # Nominatim policy: max 1 req/sec
NOMINATIM_RETRY = 2     # number of retries on transient network errors
NOMINATIM_BACKOFF = 2.0 # seconds to wait between retries

UNSPLASH_URL            = "https://api.unsplash.com/search/photos"
UNSPLASH_PER_PAGE       = 15
UNSPLASH_ORIENTATION    = "landscape"
UNSPLASH_CONTENT_FILTER = "high"
UNSPLASH_PAUSE          = 0.35
UNSPLASH_RETRY          = 2     # number of retries on transient network errors
UNSPLASH_BACKOFF        = 1.0   # seconds to wait between retries

OUTPUT_FIELDNAMES = [
    "route_name", "stop_order", "location",
    "lat", "lng", "photo_url", "is_decoy",
]

# ── Unsplash landmark tuning ──────────────────────────────────────────────────

SIGNATURE_LANDMARK = {
    "Paris, France": "Eiffel Tower",
    "Rome, Italy": "Colosseum",
    "London, UK": "Big Ben",
    "London, United Kingdom": "Big Ben",
    "Amsterdam, Netherlands": "Canal houses",
    "Berlin, Germany": "Brandenburg Gate",
    "Barcelona, Spain": "Sagrada Familia",
    "Athens, Greece": "Acropolis",
    "Istanbul, Turkey": "Hagia Sophia",
    "Dubrovnik, Croatia": "Old Town walls",
    "Reykjavik, Iceland": "Hallgrimskirkja",
    "New York, USA": "Statue of Liberty",
    "Washington, DC, USA": "US Capitol",
    "San Francisco, USA": "Golden Gate Bridge",
    "Los Angeles, USA": "Hollywood sign",
    "Dubai, UAE": "Burj Khalifa",
    "Abu Dhabi, UAE": "Sheikh Zayed Grand Mosque",
    "Jerusalem": "Old City Jerusalem",
    "Cairo, Egypt": "Pyramids of Giza",
    "Cape Town, South Africa": "Table Mountain",
    "Beijing, China": "Great Wall of China",
    "Shanghai, China": "The Bund skyline",
    "Hong Kong": "Victoria Harbour skyline",
    "Singapore": "Marina Bay Sands",
    "Tokyo, Japan": "Tokyo Tower",
    "Kyoto, Japan": "Fushimi Inari gates",
    "Seoul, South Korea": "Gyeongbokgung Palace",
    "Jaipur, India": "Hawa Mahal",
    "Agra, India": "Taj Mahal",
}

NATURE_HINTS = {
    "Milford Sound, New Zealand": "Milford Sound fjord waterfall",
    "Queenstown, New Zealand": "Queenstown Lake Wakatipu mountains",
    "Great Ocean Road, Australia": "Twelve Apostles Great Ocean Road",
    "Cairns, Australia": "Great Barrier Reef coral aerial",
    "Komodo National Park, Indonesia": "Komodo dragon",
    "Mount Bromo, Indonesia": "Mount Bromo volcano sunrise",
    "Yogyakarta, Indonesia": "Borobudur sunrise",
    "Sahara Dunes (Erg Chebbi)": "Erg Chebbi sand dunes Morocco",
    "Iguazu Falls, Argentina/Brazil": "Iguazu Falls waterfall",
    "Victoria Falls": "Victoria Falls waterfall",
}

LANDMARK_KEYWORDS = {
    "eiffel", "colosseum", "big ben", "tower", "bridge", "cathedral", "temple",
    "palace", "castle", "monument", "mosque", "basilica", "opera house", "duomo",
    "acropolis", "old town", "skyline", "capitol", "gate", "wall", "harbour",
    "harbor", "ruins", "pagoda", "fort", "square", "pyramid", "pyramids",
    "sphinx", "taj mahal", "marina bay", "bund", "hagia sophia", "brandenburg",
    "charles bridge", "sagrada",
}

VIBEY_BUT_VAGUE = {
    "sunset", "sunrise", "portrait", "people", "person", "model", "food",
    "coffee", "interior", "plant", "cat", "dog", "hands", "laptop",
}

QUERY_SUFFIXES = [
    "famous landmark", "iconic landmark", "landmark", "skyline", "city center",
]


# ── Retry helper ──────────────────────────────────────────────────────────────

def _with_retry(fn, retries: int, backoff: float):
    """
    Call fn(), retrying up to `retries` times on requests.RequestException.
    Waits `backoff` seconds between attempts.
    Re-raises the final exception if all attempts fail.
    ValueError (e.g. empty results) is not retried — it is a logic failure,
    not a transient network error.
    """
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except requests.HTTPError as exc:
            # 4xx errors are not transient — retrying won't help.
            # 401 means bad/missing key; 403 means rate-limited or forbidden;
            # 404 means the endpoint is wrong. Raise immediately.
            if exc.response is not None and 400 <= exc.response.status_code < 500:
                raise
            last_exc = exc
            if attempt < retries:
                print(
                    f"    [retry {attempt + 1}/{retries}] transient error: {exc}",
                    file=sys.stderr,
                )
                time.sleep(backoff)
        except requests.RequestException as exc:
            last_exc = exc
            if attempt < retries:
                print(
                    f"    [retry {attempt + 1}/{retries}] transient error: {exc}",
                    file=sys.stderr,
                )
                time.sleep(backoff)
    raise last_exc  # type: ignore[misc]


# ── Geocoding ─────────────────────────────────────────────────────────────────

def geocode(location: str) -> tuple[float, float]:
    """
    Return (lat, lng) for a location string via Nominatim.
    Raises ValueError if no result is returned.
    Raises requests.RequestException on network failure (after retries).
    """
    def _call() -> tuple[float, float]:
        resp = requests.get(
            NOMINATIM_URL,
            params={"q": location, "format": "json", "limit": 1},
            headers={"User-Agent": NOMINATIM_UA},
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json()
        if not results:
            raise ValueError(f"Nominatim returned no results for {location!r}")
        return float(results[0]["lat"]), float(results[0]["lon"])

    return _with_retry(_call, retries=NOMINATIM_RETRY, backoff=NOMINATIM_BACKOFF)


# ── Unsplash ──────────────────────────────────────────────────────────────────

def _unsplash_query_candidates(location: str) -> list[str]:
    candidates = []
    if location in NATURE_HINTS:
        candidates.append(NATURE_HINTS[location])
    if location in SIGNATURE_LANDMARK:
        lm = SIGNATURE_LANDMARK[location]
        candidates += [f"{lm} {location}", f"{location} {lm}", f"{location} landmark"]
    else:
        candidates += [f"{location} {s}" for s in QUERY_SUFFIXES]
    candidates.append(location)
    seen, out = set(), []
    for c in candidates:
        c = c.strip()
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def _unsplash_score(photo: dict, location: str) -> float:
    text = " ".join([
        str(photo.get("alt_description") or ""),
        str(photo.get("description") or ""),
    ]).lower()

    score = float(photo.get("likes", 0) or 0)

    w = int(photo.get("width", 0) or 0)
    h = int(photo.get("height", 1) or 1)
    if w / h >= 1.2:
        score += 400
    if photo.get("alt_description") or photo.get("description"):
        score += 250

    for kw in LANDMARK_KEYWORDS:
        if kw in text:
            score += 900
    for kw in VIBEY_BUT_VAGUE:
        if kw in text:
            score -= 100

    if location in SIGNATURE_LANDMARK:
        lm = SIGNATURE_LANDMARK[location].lower()
        if lm in text:
            score += 2500
        else:
            for token in lm.split():
                if len(token) >= 5 and token in text:
                    score += 700

    return score


def fetch_photo_url(location: str, access_key: str) -> str:
    """
    Return the best Unsplash photo URL for a location.
    Raises ValueError if no photos are found across all query candidates.
    Raises requests.RequestException on network failure (after retries).
    """
    headers = {"Authorization": f"Client-ID {access_key}"}
    queries = _unsplash_query_candidates(location)

    for i, query in enumerate(queries):
        def _call(q=query) -> list[dict]:
            resp = requests.get(
                UNSPLASH_URL,
                headers=headers,
                params={
                    "query": q,
                    "per_page": UNSPLASH_PER_PAGE,
                    "orientation": UNSPLASH_ORIENTATION,
                    "content_filter": UNSPLASH_CONTENT_FILTER,
                },
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json().get("results", [])

        results = _with_retry(_call, retries=UNSPLASH_RETRY, backoff=UNSPLASH_BACKOFF)
        if results:
            best = max(results, key=lambda p: _unsplash_score(p, location))
            return best["urls"]["regular"]

        # Only sleep between queries, not after the last one
        if i < len(queries) - 1:
            time.sleep(UNSPLASH_PAUSE)

    raise ValueError(f"Unsplash returned no photos for {location!r}")


# ── Already-enriched check ────────────────────────────────────────────────────

def _is_enriched(row: dict) -> bool:
    return all([
        row.get("lat", "").strip(),
        row.get("lng", "").strip(),
        row.get("photo_url", "").strip(),
        row.get("is_decoy", "").strip(),
    ])


# ── Output writer ─────────────────────────────────────────────────────────────

def _write_output(rows: list[dict], path: Path, fieldnames: list[str] = OUTPUT_FIELDNAMES) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


# ── Core pipeline (directly testable, no argparse) ────────────────────────────

def run(
    input_path: Path,
    output_path: Path,
    force: bool,
    access_key: str,
) -> int:
    """
    Execute the enrichment pipeline.

    Returns 0 on full success, 1 on any failure (partial output written).
    Separated from main() so tests can call it directly without sys.argv patching.
    """
    if not access_key:
        print("UNSPLASH_ACCESS_KEY is not set", file=sys.stderr)
        return 1

    if not input_path.exists():
        print(f"input file not found: {input_path}", file=sys.stderr)
        return 1

    # Load existing output for skip logic.
    # Key includes stop_order to avoid collisions when the same location
    # name appears in different routes or at different positions.
    existing: dict[tuple[str, str, str], dict] = {}
    if output_path.exists() and not force:
        with output_path.open(newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                key = (
                    row.get("route_name",  "").strip(),
                    row.get("stop_order",  "").strip(),
                    row.get("location",    "").strip(),
                )
                existing[key] = row

    with input_path.open(newline="", encoding="utf-8") as fh:
        input_rows = list(csv.DictReader(fh))

    output_rows: list[dict] = []

    for i, row in enumerate(input_rows, start=2):  # row 1 is the header
        # A line of all '=' characters acts as a stop marker — everything
        # below it is ignored.  Useful for preserving rate-limited runs:
        # just append a row of === to the CSV to mark where to resume from.
        if all(v.strip('=') == '' for v in row.values()):
            print(f"  stop  [{i - 1}/{len(input_rows)}] sentinel line reached, stopping early")
            break

        route_name = row.get("route_name", "").strip()
        location   = row.get("location",   "").strip()
        stop_order = row.get("stop_order", "").strip()

        if not route_name or not location or not stop_order:
            print(
                f"row {i}: missing required input field "
                f"(route_name={route_name!r}, location={location!r}, stop_order={stop_order!r})",
                file=sys.stderr,
            )
            # Validation errors: do not write partial output — there is nothing
            # useful to resume from since no rows have been enriched yet for
            # this row, and overwriting a previous good run's output is harmful.
            return 1

        key = (route_name, stop_order, location)

        if not force and key in existing and _is_enriched(existing[key]):
            total = len(input_rows)
            print(f"  skip  [{i - 1}/{total}] {location} (already enriched)")
            output_rows.append(existing[key])
            continue

        total = len(input_rows)

        # ── Geocode ──
        print(f"  geo   [{i - 1}/{total}] {location} ...", end=" ", flush=True)
        try:
            lat, lng = geocode(location)
            print(f"{lat:.5f}, {lng:.5f}")
        except (ValueError, requests.RequestException) as exc:
            print("FAILED", flush=True)
            print(f"row {i}: geocoding failed for {location!r}: {exc}", file=sys.stderr)
            _write_output(output_rows, output_path)
            return 1
        finally:
            # Rate-limit pause fires only on the success path; on failure we
            # return immediately above, so the sleep here is only reached when
            # the call succeeded.  The except block returns before finally would
            # add meaningful delay — but keeping it in finally ensures we always
            # respect Nominatim's rate limit even if we add more error handling
            # paths later.
            time.sleep(NOMINATIM_PAUSE)

        # ── Photo ──
        existing_url = row.get("photo_url", "").strip()
        if existing_url:
            print(f"  photo [{i - 1}/{total}] {location} ... using existing URL")
            photo_url = existing_url
        else:
            print(f"  photo [{i - 1}/{total}] {location} ...", end=" ", flush=True)
            try:
                photo_url = fetch_photo_url(location, access_key)
                print("ok")
            except (ValueError, requests.RequestException) as exc:
                print("FAILED", flush=True)
                print(f"row {i}: photo fetch failed for {location!r}: {exc}", file=sys.stderr)
                _write_output(output_rows, output_path)
                return 1

        output_rows.append({
            "route_name": route_name,
            "stop_order": stop_order,
            "location":   location,
            "lat":        f"{lat:.6f}",
            "lng":        f"{lng:.6f}",
            "photo_url":  photo_url,
            "is_decoy":   row.get("is_decoy", "false").strip().lower(),
        })

    _write_output(output_rows, output_path)
    print(f"\nDone. {len(output_rows)} rows written to {output_path}")
    return 0


# ── CLI entry point ───────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--input",  type=Path, default=DEFAULT_IN,
                        help=f"Input CSV (default: {DEFAULT_IN})")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT,
                        help=f"Output CSV (default: {DEFAULT_OUT})")
    parser.add_argument("--force",  action="store_true",
                        help="Re-fetch all rows even if already enriched")
    args = parser.parse_args()

    access_key = os.environ.get("UNSPLASH_ACCESS_KEY", "").strip()
    return run(args.input, args.output, args.force, access_key)


if __name__ == "__main__":
    sys.exit(main())
