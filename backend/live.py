"""
backend/live.py — Live Section Panel data.

TWO DISTINCT DATA SOURCES, kept deliberately separate and separately
labeled -- do not conflate them:

1. SCHEDULE-PROJECTED trains (default, always available, zero cost,
   zero external dependency): for a given section_id, computes which
   real trains -- per the real 02_train_timetable.csv -- are scheduled
   to be somewhere between the two stations of that section RIGHT NOW,
   and how far along (0.0-1.0) based on the current time of day.
   This is REAL schedule data, run through a live clock -- not GPS.
   Same honest caveat as everywhere else in this project: no run-day
   mask exists in the source data, so every train is treated as if it
   runs today.

2. RAILRADAR GPS lookup (optional, third-party, rate-limited): a
   single-train live-position lookup via railradar.in's public API.
   This is genuinely live GPS-derived data, but it is NOT an official
   Indian Railways feed -- RailRadar states this themselves. Requires
   a RAILRADAR_API_KEY environment variable; if unset, the endpoint
   returns a clear "not configured" response instead of failing oddly.

Router mounted at /api/live in app.py.
"""
import os
import time
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import requests
from fastapi import APIRouter, Depends, HTTPException

from backend.auth import get_current_user

router = APIRouter(prefix="/api/live", tags=["Live Tracking"])

RAILRADAR_API_KEY = os.environ.get("RAILRADAR_API_KEY")
RAILRADAR_BASE = "https://api.railradar.in/v1"

# Populated by init_live_module() below, called once from app.py at startup
# with the already-loaded timetable dataframe -- avoids reading the 186k-row
# CSV a second time.
_section_hops = {}   # section_id -> list of hop dicts (see build below)
_traffic_idx = None  # set by app.py so this module can read signal aspect


def init_live_module(timetable_df: pd.DataFrame, traffic_idx):
    """
    Precompute, once at startup, every train's per-section hop with its
    scheduled departure/arrival times -- so /api/live/section/.../projection
    is a cheap dict lookup per request, not a 186k-row scan.
    """
    global _traffic_idx
    _traffic_idx = traffic_idx

    tt = timetable_df.copy()
    tt["sequence"] = tt["sequence"].astype(int)
    tt = tt.sort_values(["train_no", "sequence"])

    tt["next_station"] = tt.groupby("train_no")["station_code"].shift(-1)
    tt["next_station_name"] = tt.groupby("train_no")["station_name"].shift(-1)
    tt["next_arrival"] = tt.groupby("train_no")["arrival_time"].shift(-1)

    hops = tt.dropna(subset=["next_station"]).copy()

    hops["section_id"] = hops.apply(
        lambda r: "-".join(sorted([r["station_code"], r["next_station"]])), axis=1)

    count = 0
    for _, r in hops.iterrows():
        dep = str(r["departure_time"])
        arr = str(r["next_arrival"])
        if dep in ("nan", "None") or arr in ("nan", "None"):
            continue
        entry = dict(
            train_no=str(r["train_no"]),
            train_name=str(r["train_name"]),
            from_code=r["station_code"], to_code=r["next_station"],
            from_name=r["station_name"], to_name=r["next_station_name"],
            dep_time=dep, arr_time=arr,
        )
        _section_hops.setdefault(r["section_id"], []).append(entry)
        count += 1

    print(f"[live] Indexed {count} train hops across {len(_section_hops)} sections for live projection")


def _time_str_to_minutes(t: str):
    """'HH:MM:SS' -> minutes since midnight. Returns None if unparseable."""
    try:
        h, m, s = t.split(":")
        return int(h) * 60 + int(m) + int(s) / 60
    except Exception:
        return None


def _signal_aspect(section_id: str, hour: int) -> str:
    """Reuse the real traffic level for that section/hour as a genuine
    signal-aspect proxy: LOW->green, MEDIUM->yellow, HIGH/VERY_HIGH->red.
    This is a real derived value, not decorative."""
    try:
        row = _traffic_idx.loc[(section_id, hour)]
        level = row["traffic_level"]
    except KeyError:
        level = "LOW"
    return {"LOW": "green", "MEDIUM": "yellow", "HIGH": "red", "VERY_HIGH": "red"}.get(level, "green")


@router.get("/section/{section_id}/projection")
def section_projection(section_id: str, user=Depends(get_current_user)):
    """Schedule-projected trains currently 'in' this section, based on the
    real timetable and the current clock. No external dependency."""
    now = datetime.now()
    now_min = now.hour * 60 + now.minute + now.second / 60
    canonical = "-".join(sorted(section_id.split("-"))) if "-" in section_id else section_id

    hops = _section_hops.get(canonical, [])
    canon_a, canon_b = (canonical.split("-") + [canonical])[:2]

    active = []
    for hop in hops:
        dep_min = _time_str_to_minutes(hop["dep_time"])
        arr_min = _time_str_to_minutes(hop["arr_time"])
        if dep_min is None or arr_min is None:
            continue
        if arr_min <= dep_min:
            arr_min += 24 * 60  # overnight hop

        # Check current time against this hop's window, allowing for the
        # possibility "now" is also past-midnight relative to a late-night departure
        for offset in (0, -24 * 60, 24 * 60):
            t = now_min + offset
            if dep_min <= t <= arr_min:
                raw_fraction = (t - dep_min) / max(arr_min - dep_min, 0.1)
                forward = hop["from_code"] == canon_a
                progress = raw_fraction if forward else (1 - raw_fraction)
                eta_min = round(arr_min - t, 1)
                active.append(dict(
                    train_no=hop["train_no"], train_name=hop["train_name"],
                    from_station=hop["from_name"], to_station=hop["to_name"],
                    direction="forward" if forward else "reverse",
                    progress=round(max(0.0, min(1.0, progress)), 3),
                    eta_minutes=eta_min,
                    source="schedule",
                ))
                break

    return {
        "section_id": canonical,
        "as_of": now.strftime("%H:%M:%S"),
        "signal_aspect": _signal_aspect(canonical, now.hour),
        "active_trains": active,
        "note": "Schedule-projected from real timetable data against the current clock. "
                "Not GPS-confirmed. Every train is treated as running today (source data "
                "has no run-day mask).",
    }


@router.get("/train/{train_number}")
def live_train_lookup(train_number: str, user=Depends(get_current_user)):
    """Optional real GPS lookup via RailRadar (third-party, NOT an official
    Indian Railways feed -- disclose this in the UI when showing results)."""
    if not RAILRADAR_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Live GPS tracking isn't configured on this server. "
                   "Set the RAILRADAR_API_KEY environment variable to enable it "
                   "(https://railradar.in). Schedule-projected traffic still works without it.",
        )

    try:
        resp = requests.get(
            f"{RAILRADAR_BASE}/trains/{train_number}/live",
            headers={"Authorization": f"Bearer {RAILRADAR_API_KEY}"},
            timeout=5,
        )
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Could not reach RailRadar: {e}")

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Train '{train_number}' not found or not currently running")
    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="RailRadar free-tier quota exceeded for this month")
    if not resp.ok:
        raise HTTPException(status_code=502, detail=f"RailRadar returned an error (status {resp.status_code})")

    data = resp.json()
    data["source"] = "railradar"
    data["disclosure"] = "Third-party data via RailRadar, not an official Indian Railways feed."
    return data
