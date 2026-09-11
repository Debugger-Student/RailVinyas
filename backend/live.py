"""
backend/live.py — Live Section Panel data.

TWO DISTINCT DATA SOURCES, kept deliberately separate and separately
labeled -- do not conflate them:

1. SCHEDULE-PROJECTED trains
   - Uses the real 02_train_timetable.csv timetable data.
   - Computes trains currently inside a section.
   - Computes trains scheduled to enter a section within the next N hours.
   - Uses current India time (IST).
   - NOT GPS-confirmed.
   - Source timetable has no run-day mask, so every train is treated
     as running today.

2. RAILRADAR GPS lookup
   - Optional third-party live GPS lookup for one train.
   - Requires RAILRADAR_API_KEY.
   - NOT an official Indian Railways feed.

Router mounted at /api/live in app.py.
"""

import os
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd
import requests
from fastapi import APIRouter, Depends, HTTPException

from backend.auth import get_current_user


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/api/live",
    tags=["Live Tracking"],
)


# ============================================================
# CONFIGURATION
# ============================================================

RAILRADAR_API_KEY = os.environ.get("RAILRADAR_API_KEY")

RAILRADAR_BASE = "https://api.railradar.in/v1"

# Indian Standard Time
IST = ZoneInfo("Asia/Kolkata")


# ============================================================
# PRE-COMPUTED LIVE DATA
# ============================================================

# section_id -> list of train section hops
#
# Example:
#
# {
#     "GZB-NDLS": [
#         {
#             "train_no": "12919",
#             "train_name": "Malwa SF Express",
#             "from_code": "GZB",
#             "to_code": "NDLS",
#             "from_name": "GHAZIABAD JN",
#             "to_name": "NEW DELHI",
#             "dep_time": "15:20:00",
#             "arr_time": "15:55:00"
#         }
#     ]
# }

_section_hops = {}

# Set by app.py.
# Used to determine the signal-aspect proxy.
_traffic_idx = None


# ============================================================
# INITIALIZATION
# ============================================================

def init_live_module(
    timetable_df: pd.DataFrame,
    traffic_idx,
):
    """
    Precompute every train's section hop.

    This avoids scanning the complete timetable dataframe
    on every API request.

    Called once from app.py during application startup.
    """

    global _traffic_idx

    _traffic_idx = traffic_idx

    # Prevent duplicate entries if initialization happens again.
    _section_hops.clear()

    tt = timetable_df.copy()

    # Ensure sequence is numeric.
    tt["sequence"] = tt["sequence"].astype(int)

    # Sort every train in station sequence order.
    tt = tt.sort_values(
        ["train_no", "sequence"]
    )

    # --------------------------------------------------------
    # Create next station information.
    # --------------------------------------------------------

    tt["next_station"] = (
        tt.groupby("train_no")["station_code"]
        .shift(-1)
    )

    tt["next_station_name"] = (
        tt.groupby("train_no")["station_name"]
        .shift(-1)
    )

    tt["next_arrival"] = (
        tt.groupby("train_no")["arrival_time"]
        .shift(-1)
    )

    # Only rows having a next station represent a section hop.
    hops = tt.dropna(
        subset=["next_station"]
    ).copy()

    # --------------------------------------------------------
    # Build canonical section ID.
    #
    # GZB -> NDLS
    # NDLS -> GZB
    #
    # Both become:
    #
    # GZB-NDLS
    # --------------------------------------------------------

    hops["section_id"] = hops.apply(
        lambda r: "-".join(
            sorted(
                [
                    str(r["station_code"]),
                    str(r["next_station"]),
                ]
            )
        ),
        axis=1,
    )

    count = 0

    # --------------------------------------------------------
    # Build fast lookup dictionary.
    # --------------------------------------------------------

    for _, r in hops.iterrows():

        dep = str(r["departure_time"])
        arr = str(r["next_arrival"])

        if dep in ("nan", "None"):
            continue

        if arr in ("nan", "None"):
            continue

        entry = {
            "train_no": str(r["train_no"]),
            "train_name": str(r["train_name"]),

            "from_code": str(r["station_code"]),
            "to_code": str(r["next_station"]),

            "from_name": str(r["station_name"]),
            "to_name": str(r["next_station_name"]),

            "dep_time": dep,
            "arr_time": arr,
        }

        section_id = str(r["section_id"])

        _section_hops.setdefault(
            section_id,
            []
        ).append(entry)

        count += 1

    print(
        f"[live] Indexed {count} train hops "
        f"across {len(_section_hops)} sections "
        f"for live projection"
    )


# ============================================================
# TIME HELPERS
# ============================================================

def _time_str_to_minutes(t: str):
    """
    Convert:

        HH:MM:SS

    into minutes since midnight.

    Returns None if the value cannot be parsed.
    """

    try:
        parts = str(t).split(":")

        if len(parts) != 3:
            return None

        h, m, s = parts

        return (
            int(h) * 60
            + int(m)
            + int(s) / 60
        )

    except Exception:
        return None


def _canonical_section_id(section_id: str) -> str:
    """
    Convert a section ID into the canonical format.

    Example:

        NDLS-GZB -> GZB-NDLS

    This matches the format used while building _section_hops.
    """

    section_id = str(section_id).strip().upper()

    if "-" not in section_id:
        return section_id

    parts = section_id.split("-")

    if len(parts) != 2:
        return section_id

    return "-".join(
        sorted(parts)
    )


# ============================================================
# SIGNAL ASPECT
# ============================================================

def _signal_aspect(
    section_id: str,
    hour: int,
) -> str:
    """
    Reuse the real traffic level for that
    section/hour as a signal-aspect proxy.

    LOW        -> green
    MEDIUM     -> yellow
    HIGH       -> red
    VERY_HIGH  -> red

    This is a derived traffic value, not decorative UI data.
    """

    try:

        row = _traffic_idx.loc[
            (section_id, hour)
        ]

        level = row["traffic_level"]

    except (KeyError, TypeError, AttributeError):

        level = "LOW"

    return {
        "LOW": "green",
        "MEDIUM": "yellow",
        "HIGH": "red",
        "VERY_HIGH": "red",
    }.get(
        level,
        "green",
    )


# ============================================================
# CURRENTLY ACTIVE TRAINS
# ============================================================

@router.get(
    "/section/{section_id}/projection"
)
def section_projection(
    section_id: str,
    user=Depends(get_current_user),
):
    """
    Return trains that are currently inside
    the requested section.

    DATA SOURCE:
        Real timetable

    MODE:
        Schedule projection

    NOT:
        GPS tracking
    """

    # --------------------------------------------------------
    # IMPORTANT:
    # Always use Indian Standard Time.
    # --------------------------------------------------------

    now = datetime.now(IST)

    now_min = (
        now.hour * 60
        + now.minute
        + now.second / 60
    )

    canonical = _canonical_section_id(
        section_id
    )

    hops = _section_hops.get(
        canonical,
        []
    )

    # --------------------------------------------------------
    # Section direction endpoints.
    # --------------------------------------------------------

    parts = canonical.split("-")

    if len(parts) == 2:

        canon_a = parts[0]
        canon_b = parts[1]

    else:

        canon_a = canonical
        canon_b = canonical

    active = []

    # --------------------------------------------------------
    # Check every train hop in this section.
    # --------------------------------------------------------

    for hop in hops:

        dep_min = _time_str_to_minutes(
            hop["dep_time"]
        )

        arr_min = _time_str_to_minutes(
            hop["arr_time"]
        )

        if dep_min is None:
            continue

        if arr_min is None:
            continue

        # ----------------------------------------------------
        # Overnight section movement.
        #
        # Example:
        #
        # 23:55 -> 00:20
        #
        # becomes:
        #
        # 23:55 -> 24:20
        # ----------------------------------------------------

        if arr_min <= dep_min:
            arr_min += 24 * 60

        # ----------------------------------------------------
        # Check current time.
        #
        # Offset handling prevents midnight problems.
        # ----------------------------------------------------

        for offset in (
            0,
            -24 * 60,
            24 * 60,
        ):

            t = now_min + offset

            if dep_min <= t <= arr_min:

                duration = max(
                    arr_min - dep_min,
                    0.1,
                )

                raw_fraction = (
                    (t - dep_min)
                    / duration
                )

                forward = (
                    hop["from_code"]
                    == canon_a
                )

                progress = (
                    raw_fraction
                    if forward
                    else
                    1 - raw_fraction
                )

                eta_min = round(
                    arr_min - t,
                    1,
                )

                active.append(
                    {
                        "train_no": hop["train_no"],
                        "train_name": hop["train_name"],

                        "from_station": hop["from_name"],
                        "to_station": hop["to_name"],

                        "direction": (
                            "forward"
                            if forward
                            else "reverse"
                        ),

                        "progress": round(
                            max(
                                0.0,
                                min(
                                    1.0,
                                    progress,
                                ),
                            ),
                            3,
                        ),

                        "eta_minutes": eta_min,

                        "source": "schedule",
                    }
                )

                break

    # --------------------------------------------------------
    # Response.
    # --------------------------------------------------------

    return {
        "success": True,

        "section_id": canonical,

        "as_of": now.isoformat(),

        "signal_aspect": _signal_aspect(
            canonical,
            now.hour,
        ),

        "active_trains": active,

        "source": "schedule",

        "note": (
            "Schedule-projected from real timetable data "
            "against the current India time. "
            "Not GPS-confirmed. Every train is treated "
            "as running today because the source timetable "
            "has no run-day mask."
        ),
    }


# ============================================================
# UPCOMING TRAINS — NEXT N HOURS
# ============================================================

@router.get(
    "/section/{section_id}/upcoming"
)
def upcoming_trains(
    section_id: str,
    hours: int = 3,
    user=Depends(get_current_user),
):
    """
    Return trains scheduled to ENTER the requested
    section within the next `hours` hours.

    Default:
        3 hours

    Maximum:
        6 hours

    DATA SOURCE:
        Real timetable

    MODE:
        Schedule projection

    NOT:
        GPS-confirmed live movement.
    """

    # --------------------------------------------------------
    # Protect the API from unreasonable windows.
    #
    # Minimum = 1 hour
    # Maximum = 6 hours
    # --------------------------------------------------------

    hours = max(
        1,
        min(
            hours,
            6,
        ),
    )

    # --------------------------------------------------------
    # IMPORTANT:
    # Render/Linux may use UTC.
    #
    # The railway dashboard needs Indian Standard Time.
    # --------------------------------------------------------

    now = datetime.now(IST)

    now_min = (
        now.hour * 60
        + now.minute
        + now.second / 60
    )

    canonical = _canonical_section_id(
        section_id
    )

    hops = _section_hops.get(
        canonical,
        []
    )

    # --------------------------------------------------------
    # Debug information.
    #
    # Useful in Render logs.
    # --------------------------------------------------------

    print(
        f"[upcoming] "
        f"section={canonical} "
        f"hops={len(hops)} "
        f"now={now.isoformat()} "
        f"window={hours}h"
    )

    upcoming = []

    # --------------------------------------------------------
    # Examine every train using this section.
    # --------------------------------------------------------

    for hop in hops:

        dep_min = _time_str_to_minutes(
            hop["dep_time"]
        )

        arr_min = _time_str_to_minutes(
            hop["arr_time"]
        )

        if dep_min is None:
            continue

        if arr_min is None:
            continue

        # ----------------------------------------------------
        # Find the NEXT occurrence of the train departure.
        #
        # If today's scheduled departure already passed,
        # consider the next day's occurrence.
        # ----------------------------------------------------

        adjusted_dep = dep_min

        while adjusted_dep < now_min:

            adjusted_dep += 24 * 60

        # ----------------------------------------------------
        # Adjust arrival for overnight movement.
        #
        # Example:
        #
        # departure = 23:55
        # arrival   = 00:20
        #
        # arrival becomes 24:20.
        # ----------------------------------------------------

        adjusted_arr = arr_min

        while adjusted_arr < adjusted_dep:

            adjusted_arr += 24 * 60

        # ----------------------------------------------------
        # Time until train ENTERS the section.
        # ----------------------------------------------------

        minutes_until_departure = (
            adjusted_dep
            - now_min
        )

        # ----------------------------------------------------
        # Ignore anything outside requested window.
        # ----------------------------------------------------

        if not (
            0
            <= minutes_until_departure
            <= hours * 60
        ):
            continue

        # ----------------------------------------------------
        # Determine direction.
        # ----------------------------------------------------

        forward = True

        try:

            canon_a, canon_b = (
                canonical.split(
                    "-",
                    1,
                )
            )

            forward = (
                hop["from_code"]
                == canon_a
            )

        except ValueError:

            forward = True

        # ----------------------------------------------------
        # Section travel duration.
        # ----------------------------------------------------

        section_duration = (
            adjusted_arr
            - adjusted_dep
        )

        # ----------------------------------------------------
        # Estimated time until train exits section.
        # ----------------------------------------------------

        minutes_until_arrival = (
            minutes_until_departure
            + section_duration
        )

        # ----------------------------------------------------
        # Status.
        # ----------------------------------------------------

        status = (
            "SOON"
            if minutes_until_departure <= 30
            else "UPCOMING"
        )

        # ----------------------------------------------------
        # Add train.
        # ----------------------------------------------------

        upcoming.append(
            {
                "train_no": hop["train_no"],
                "train_name": hop["train_name"],

                "from_station": hop["from_name"],
                "to_station": hop["to_name"],

                "from_code": hop["from_code"],
                "to_code": hop["to_code"],

                "direction": (
                    "forward"
                    if forward
                    else "reverse"
                ),

                "departure_time": hop["dep_time"],
                "arrival_time": hop["arr_time"],

                "minutes_until_departure": round(
                    minutes_until_departure,
                    1,
                ),

                "minutes_until_arrival": round(
                    minutes_until_arrival,
                    1,
                ),

                "status": status,

                "source": "schedule",
            }
        )

    # --------------------------------------------------------
    # Nearest train first.
    # --------------------------------------------------------

    upcoming.sort(
        key=lambda train:
        train[
            "minutes_until_departure"
        ]
    )

    # --------------------------------------------------------
    # Response.
    # --------------------------------------------------------

    return {
        "success": True,

        "section_id": canonical,

        "as_of": now.isoformat(),

        "window_hours": hours,

        "window_minutes": hours * 60,

        "trains": upcoming,

        "count": len(upcoming),

        "source": "schedule",

        "note": (
            "Schedule-projected from real timetable data "
            "against the current India time. "
            "Not GPS-confirmed. Every train is treated "
            "as running today because the source timetable "
            "has no run-day mask."
        ),
    }


# ============================================================
# OPTIONAL RAILRADAR GPS LOOKUP
# ============================================================

@router.get(
    "/train/{train_number}"
)
def live_train_lookup(
    train_number: str,
    user=Depends(get_current_user),
):
    """
    Optional real GPS lookup through RailRadar.

    IMPORTANT:
        RailRadar is a third-party service.
        It is NOT an official Indian Railways feed.

    Requires:
        RAILRADAR_API_KEY
    """

    # --------------------------------------------------------
    # API key check.
    # --------------------------------------------------------

    if not RAILRADAR_API_KEY:

        raise HTTPException(
            status_code=503,
            detail=(
                "Live GPS tracking isn't configured on this "
                "server. Set the RAILRADAR_API_KEY environment "
                "variable to enable it "
                "(https://railradar.in). "
                "Schedule-projected traffic still works "
                "without it."
            ),
        )

    # --------------------------------------------------------
    # Request RailRadar.
    # --------------------------------------------------------

    try:

        resp = requests.get(
            f"{RAILRADAR_BASE}/trains/"
            f"{train_number}/live",

            headers={
                "Authorization":
                f"Bearer {RAILRADAR_API_KEY}"
            },

            timeout=5,
        )

    except requests.RequestException as e:

        raise HTTPException(
            status_code=502,
            detail=(
                f"Could not reach RailRadar: {e}"
            ),
        )

    # --------------------------------------------------------
    # RailRadar response handling.
    # --------------------------------------------------------

    if resp.status_code == 404:

        raise HTTPException(
            status_code=404,
            detail=(
                f"Train '{train_number}' not found "
                f"or not currently running"
            ),
        )

    if resp.status_code == 429:

        raise HTTPException(
            status_code=429,
            detail=(
                "RailRadar free-tier quota exceeded "
                "for this month"
            ),
        )

    if not resp.ok:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar returned an error "
                f"(status {resp.status_code})"
            ),
        )

    # --------------------------------------------------------
    # Parse response.
    # --------------------------------------------------------

    try:

        data = resp.json()

    except ValueError:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar returned invalid JSON"
            ),
        )

    # --------------------------------------------------------
    # Add source information.
    # --------------------------------------------------------

    if isinstance(data, dict):

        data["source"] = "railradar"

        data["disclosure"] = (
            "Third-party data via RailRadar, "
            "not an official Indian Railways feed."
        )

    return data