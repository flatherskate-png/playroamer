"""
Loads route data from a CSV file at startup.
Fails immediately if any row has a missing or unparsable field.

Expected CSV columns:
    route_name  - string, groups rows into a route
    stop_order  - integer (1-based), ignored for decoys but must still be a valid int
    location    - string, display name of the location
    lat         - float
    lng         - float
    photo_url   - string (non-empty URL)
    is_decoy    - "true" or "false" (case-insensitive)

Route IDs are auto-incremented in the order routes first appear in the file:
route-001, route-002, ...
"""

import csv
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.models.game import Route, Location, Decoy

REQUIRED_COLUMNS = {"route_name", "stop_order", "location", "lat", "lng", "photo_url", "is_decoy"}


def _parse_bool(value: str, row_num: int, field: str) -> bool:
    normalised = value.strip().lower()
    if normalised not in ("true", "false"):
        raise ValueError(
            f"Row {row_num}: field '{field}' must be 'true' or 'false', got {value!r}"
        )
    return normalised == "true"


def _parse_float(value: str, row_num: int, field: str) -> float:
    try:
        return float(value.strip())
    except (ValueError, AttributeError):
        raise ValueError(
            f"Row {row_num}: field '{field}' must be a float, got {value!r}"
        )


def _parse_int(value: str, row_num: int, field: str) -> int:
    try:
        return int(value.strip())
    except (ValueError, AttributeError):
        raise ValueError(
            f"Row {row_num}: field '{field}' must be an integer, got {value!r}"
        )


def _require_str(value: str, row_num: int, field: str) -> str:
    stripped = value.strip() if value else ""
    if not stripped:
        raise ValueError(f"Row {row_num}: field '{field}' is required and cannot be empty")
    return stripped


def _load_routes(csv_path: Path) -> list[Route]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Routes CSV not found: {csv_path}")

    # { route_name -> { "stops": [...], "decoys": [...] } }
    route_buckets: dict[str, dict] = {}
    route_order:   list[str]       = []  # preserves first-seen order for ID assignment

    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)

        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV is missing required columns: {sorted(missing)}")

        for row_num, row in enumerate(reader, start=2):  # 1-based, row 1 is the header
            route_name = _require_str(row["route_name"], row_num, "route_name")
            location   = _require_str(row["location"],   row_num, "location")
            photo_url  = _require_str(row["photo_url"],  row_num, "photo_url")
            is_decoy   = _parse_bool (row["is_decoy"],   row_num, "is_decoy")
            lat        = _parse_float(row["lat"],        row_num, "lat")
            lng        = _parse_float(row["lng"],        row_num, "lng")
            stop_order = _parse_int  (row["stop_order"], row_num, "stop_order")

            region = row.get("region", "").strip()
            pack   = row.get("pack", "").strip()
            blurb  = row.get("blurb", "").strip()

            if route_name not in route_buckets:
                route_buckets[route_name] = {"stops": [], "decoys": [], "region": "", "pack": "", "blurb": ""}
                route_order.append(route_name)

            # Use first non-empty value seen for region/pack/blurb
            if region and not route_buckets[route_name]["region"]:
                route_buckets[route_name]["region"] = region
            if pack and not route_buckets[route_name]["pack"]:
                route_buckets[route_name]["pack"] = pack
            if blurb and not route_buckets[route_name]["blurb"]:
                route_buckets[route_name]["blurb"] = blurb

            if is_decoy:
                route_buckets[route_name]["decoys"].append(
                    Decoy(name=location, photo=photo_url)
                )
            else:
                route_buckets[route_name]["stops"].append(
                    (stop_order, Location(name=location, photo=photo_url, lat=lat, lng=lng))
                )

    routes: list[Route] = []
    for idx, route_name in enumerate(route_order, start=1):
        bucket = route_buckets[route_name]

        # Sort stops by stop_order so CSV row order doesn't matter
        ordered_stops = [loc for _, loc in sorted(bucket["stops"], key=lambda t: t[0])]

        routes.append(Route(
            id=f"route-{idx:03d}",
            name=route_name,
            region=bucket["region"],
            pack=bucket["pack"],
            blurb=bucket["blurb"],
            stops=ordered_stops,
            decoys=bucket["decoys"],
        ))

    if not routes:
        raise ValueError("CSV loaded successfully but contains no routes")

    return routes


# ── Module-level load — fails at import time if the CSV is bad ──
ROUTES: list[Route] = _load_routes(settings.routes_csv)
DAILY_INDEX: int = 0


def get_route_by_id(route_id: str) -> Optional[Route]:
    return next((r for r in ROUTES if r.id == route_id), None)


def get_daily_route() -> Route:
    return ROUTES[settings.daily_route_index % len(ROUTES)]


def get_all_routes() -> list[Route]:
    return ROUTES
