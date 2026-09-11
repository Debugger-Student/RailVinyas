"""
backend/live.py

RailVinyas Live Section + RailRadar LIVE data.

DATA SOURCES
------------

1. SCHEDULE PROJECTION
   GET /api/live/section/{section_id}/projection

   Uses the real timetable loaded by app.py.
   NOT GPS.

2. RAILRADAR LIVE
   GET /api/live/section/{section_id}/upcoming
   GET /api/live/train/{train_number}

   Uses RailRadar third-party live railway data.

IMPORTANT
---------
RailRadar is NOT an official Indian Railways feed.

The upcoming endpoint NEVER falls back to schedule projection.
If RailRadar fails, the API reports the actual error.
"""

# ============================================================
# STANDARD LIBRARY
# ============================================================

import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from zoneinfo import ZoneInfo


# ============================================================
# THIRD PARTY
# ============================================================

import pandas as pd
import requests

from fastapi import APIRouter, Depends, HTTPException


# ============================================================
# LOCAL
# ============================================================

from backend.auth import get_current_user


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/api/live",
    tags=["Live Tracking"],
)


# ============================================================
# CONFIG
# ============================================================

RAILRADAR_API_KEY = os.environ.get("RAILRADAR_API_KEY")

RAILRADAR_BASE = "https://api.railradar.in/v1"

IST = ZoneInfo("Asia/Kolkata")

# Keep this reasonably high because the frontend polls.
LIVE_CACHE_TTL_SECONDS = 60

# Maximum number of RailRadar train-live calls per section
# refresh. The station board itself is one API call.
#
# This protects the free API plan from accidental bursts.
MAX_TRAIN_ENRICHMENTS = 6


# ============================================================
# CACHES
# ============================================================

_live_train_cache: Dict[str, Dict[str, Any]] = {}

_live_station_cache: Dict[str, Dict[str, Any]] = {}


# ============================================================
# TIMETABLE DATA
# ============================================================

_section_hops: Dict[str, List[Dict[str, Any]]] = {}

_traffic_idx = None


# ============================================================
# INITIALIZATION
# ============================================================

def init_live_module(
    timetable_df: pd.DataFrame,
    traffic_idx,
):
    """
    Precompute timetable train hops.

    Used ONLY by /projection.

    /upcoming does NOT use this as a fallback.
    """

    global _traffic_idx

    _traffic_idx = traffic_idx

    _section_hops.clear()

    if timetable_df is None or timetable_df.empty:
        print("[live] Timetable dataframe is empty")
        return

    tt = timetable_df.copy()

    required_columns = {
        "train_no",
        "train_name",
        "sequence",
        "station_code",
        "station_name",
        "departure_time",
        "arrival_time",
    }

    missing = required_columns - set(tt.columns)

    if missing:
        print(
            "[live] Missing timetable columns:",
            sorted(missing),
        )
        return

    tt["sequence"] = pd.to_numeric(
        tt["sequence"],
        errors="coerce",
    )

    tt = tt.dropna(
        subset=[
            "train_no",
            "sequence",
            "station_code",
        ]
    )

    tt["sequence"] = tt["sequence"].astype(int)

    tt = tt.sort_values(
        [
            "train_no",
            "sequence",
        ]
    )

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

    hops = tt.dropna(
        subset=["next_station"]
    ).copy()

    count = 0

    for _, row in hops.iterrows():

        dep = str(row["departure_time"])
        arr = str(row["next_arrival"])

        if dep in ("nan", "None", ""):
            continue

        if arr in ("nan", "None", ""):
            continue

        from_code = str(
            row["station_code"]
        ).strip().upper()

        to_code = str(
            row["next_station"]
        ).strip().upper()

        if not from_code or not to_code:
            continue

        section_id = "-".join(
            sorted(
                [
                    from_code,
                    to_code,
                ]
            )
        )

        entry = {
            "train_no": str(
                row["train_no"]
            ),
            "train_name": str(
                row["train_name"]
            ),
            "from_code": from_code,
            "to_code": to_code,
            "from_name": str(
                row["station_name"]
            ),
            "to_name": str(
                row["next_station_name"]
            ),
            "dep_time": dep,
            "arr_time": arr,
        }

        _section_hops.setdefault(
            section_id,
            [],
        ).append(entry)

        count += 1

    print(
        f"[live] Indexed {count} timetable hops "
        f"across {len(_section_hops)} sections "
        f"for live projection"
    )


# ============================================================
# GENERIC HELPERS
# ============================================================

def _canonical_section(section_id: str) -> str:

    parts = [
        p.strip().upper()
        for p in section_id.split("-")
        if p.strip()
    ]

    if len(parts) != 2:
        return section_id.strip().upper()

    return "-".join(sorted(parts))


def _time_str_to_minutes(
    value: Any,
) -> Optional[float]:

    if value is None:
        return None

    text = str(value).strip()

    if not text or text.lower() in {
        "nan",
        "none",
        "null",
    }:
        return None

    parts = text.split(":")

    try:

        hour = int(parts[0])
        minute = int(parts[1])

        second = (
            float(parts[2])
            if len(parts) > 2
            else 0
        )

        return (
            hour * 60
            + minute
            + second / 60
        )

    except (
        ValueError,
        TypeError,
    ):
        return None


def _parse_iso_datetime(
    value: Any,
) -> Optional[datetime]:

    if value is None:
        return None

    if isinstance(value, datetime):

        dt = value

        if dt.tzinfo is None:
            dt = dt.replace(
                tzinfo=IST
            )

        return dt.astimezone(IST)

    text = str(value).strip()

    if not text:
        return None

    try:

        dt = datetime.fromisoformat(
            text.replace(
                "Z",
                "+00:00",
            )
        )

        if dt.tzinfo is None:
            dt = dt.replace(
                tzinfo=IST
            )

        return dt.astimezone(IST)

    except (
        ValueError,
        TypeError,
    ):
        return None


def _format_time(
    value: Any,
) -> Optional[str]:

    dt = _parse_iso_datetime(value)

    if dt is None:
        return None

    return dt.strftime("%H:%M")


def _minutes_from_now(
    value: Any,
) -> Optional[int]:

    dt = _parse_iso_datetime(value)

    if dt is None:
        return None

    now = datetime.now(IST)

    return round(
        (
            dt - now
        ).total_seconds()
        / 60
    )


def _safe_int(
    value: Any,
) -> Optional[int]:

    if value is None:
        return None

    try:
        return int(float(value))

    except (
        ValueError,
        TypeError,
    ):
        return None


def _safe_float(
    value: Any,
) -> Optional[float]:

    if value is None:
        return None

    try:
        return float(value)

    except (
        ValueError,
        TypeError,
    ):
        return None


# ============================================================
# SIGNAL
# ============================================================

def _signal_aspect(
    section_id: str,
    hour: int,
) -> str:

    if _traffic_idx is None:
        return "green"

    try:

        row = _traffic_idx.loc[
            (
                section_id,
                hour,
            )
        ]

        level = row[
            "traffic_level"
        ]

    except (
        KeyError,
        TypeError,
        IndexError,
    ):

        level = "LOW"

    return {
        "LOW": "green",
        "MEDIUM": "yellow",
        "HIGH": "red",
        "VERY_HIGH": "red",
    }.get(
        str(level),
        "green",
    )


# ============================================================
# SCHEDULE PROJECTION
# ============================================================

@router.get(
    "/section/{section_id}/projection"
)
def section_projection(
    section_id: str,
    user=Depends(get_current_user),
):

    now = datetime.now(IST)

    now_min = (
        now.hour * 60
        + now.minute
        + now.second / 60
    )

    canonical = _canonical_section(
        section_id
    )

    hops = _section_hops.get(
        canonical,
        [],
    )

    parts = canonical.split("-")

    if len(parts) != 2:

        return {
            "section_id": canonical,
            "as_of": now.strftime(
                "%H:%M:%S"
            ),
            "signal_aspect": "green",
            "active_trains": [],
            "source": "Schedule Projection",
            "live": False,
            "is_live": False,
            "note": "Invalid section format.",
        }

    canon_a, canon_b = parts

    active = []

    for hop in hops:

        dep_min = _time_str_to_minutes(
            hop["dep_time"]
        )

        arr_min = _time_str_to_minutes(
            hop["arr_time"]
        )

        if (
            dep_min is None
            or arr_min is None
        ):
            continue

        if arr_min <= dep_min:
            arr_min += 24 * 60

        for offset in (
            0,
            -24 * 60,
            24 * 60,
        ):

            t = now_min + offset

            if dep_min <= t <= arr_min:

                raw_fraction = (
                    t - dep_min
                ) / max(
                    arr_min - dep_min,
                    0.1,
                )

                forward = (
                    hop["from_code"]
                    == canon_a
                )

                progress = (
                    raw_fraction
                    if forward
                    else 1 - raw_fraction
                )

                eta_min = round(
                    arr_min - t,
                    1,
                )

                active.append(
                    {
                        "train_no": hop[
                            "train_no"
                        ],
                        "train_name": hop[
                            "train_name"
                        ],
                        "from_station": hop[
                            "from_name"
                        ],
                        "to_station": hop[
                            "to_name"
                        ],
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
                        "source": "Schedule Projection",
                        "is_live": False,
                        "live": False,
                    }
                )

                break

    return {
        "success": True,
        "section_id": canonical,
        "as_of": now.strftime(
            "%H:%M:%S"
        ),
        "signal_aspect": _signal_aspect(
            canonical,
            now.hour,
        ),
        "active_trains": active,
        "source": "Schedule Projection",
        "live": False,
        "is_live": False,
        "note": (
            "Schedule-projected from real "
            "timetable data against the "
            "current clock. Not GPS-confirmed."
        ),
    }


# ============================================================
# RAILRADAR HELPERS
# ============================================================

def _railradar_headers() -> Dict[str, str]:

    if not RAILRADAR_API_KEY:
        return {
            "Accept": "application/json",
            "User-Agent": "RailVinyas/1.0",
        }

    return {
        "Authorization": (
            f"Bearer {RAILRADAR_API_KEY}"
        ),
        "Accept": "application/json",
        "User-Agent": "RailVinyas/1.0",
    }


def _check_railradar_config():

    if not RAILRADAR_API_KEY:

        raise HTTPException(
            status_code=503,
            detail=(
                "RailRadar live data is not configured. "
                "Set RAILRADAR_API_KEY in Render environment variables."
            ),
        )


def _railradar_error_detail(
    response: requests.Response,
) -> str:

    try:

        body = response.json()

        if isinstance(body, dict):

            error = body.get("error")

            if isinstance(error, dict):

                message = (
                    error.get("message")
                    or error.get("detail")
                )

                if message:
                    return str(message)

            detail = (
                body.get("detail")
                or body.get("message")
                or body.get("error")
            )

            if detail:
                return str(detail)

        return response.text[:500]

    except Exception:

        return response.text[:500]


# ============================================================
# GENERIC RAILRADAR GET
# ============================================================

def _railradar_get(
    url: str,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:

    _check_railradar_config()

    try:

        response = requests.get(
            url,
            headers=_railradar_headers(),
            params=params or {},
            timeout=12,
        )

    except requests.RequestException as exc:

        raise HTTPException(
            status_code=502,
            detail=(
                "Could not reach RailRadar: "
                f"{exc}"
            ),
        )

    if response.status_code == 401:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar API key was rejected."
            ),
        )

    if response.status_code == 404:

        raise HTTPException(
            status_code=404,
            detail=(
                _railradar_error_detail(
                    response
                )
            ),
        )

    if response.status_code == 429:

        raise HTTPException(
            status_code=429,
            detail=(
                "RailRadar rate limit exceeded. "
                "Wait before requesting live data again."
            ),
        )

    if response.status_code == 503:

        raise HTTPException(
            status_code=503,
            detail=(
                "RailRadar live service is temporarily unavailable."
            ),
        )

    if not response.ok:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar returned HTTP "
                f"{response.status_code}: "
                f"{_railradar_error_detail(response)}"
            ),
        )

    try:

        return response.json()

    except ValueError:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar returned invalid JSON."
            ),
        )


# ============================================================
# STATION LIVE
# ============================================================

def _railradar_station_live(
    station_code: str,
    hours: int = 4,
) -> Dict[str, Any]:

    _check_railradar_config()

    station_code = (
        station_code.strip().upper()
    )

    # RailRadar accepts 2,4,6,8.
    requested = int(hours)

    if requested <= 2:
        rr_hours = 2
    elif requested <= 4:
        rr_hours = 4
    elif requested <= 6:
        rr_hours = 6
    else:
        rr_hours = 8

    cache_key = (
        f"{station_code}:{rr_hours}"
    )

    cached = _live_station_cache.get(
        cache_key
    )

    if cached:

        age = (
            time.time()
            - cached["timestamp"]
        )

        if age < LIVE_CACHE_TTL_SECONDS:
            return cached["data"]

    url = (
        f"{RAILRADAR_BASE}"
        f"/stations/{station_code}/live"
    )

    data = _railradar_get(
        url,
        params={
            "hours": rr_hours,
            "includeIntermediate": "true",
        },
    )

    _live_station_cache[
        cache_key
    ] = {
        "timestamp": time.time(),
        "data": data,
    }

    return data


# ============================================================
# TRAIN LIVE
# ============================================================

def _railradar_train_live(
    train_number: str,
) -> Dict[str, Any]:

    _check_railradar_config()

    train_number = str(
        train_number
    ).strip()

    # IMPORTANT:
    # Do not use authoritative=true.
    # It bypasses RailRadar's cache.
    cache_key = train_number

    cached = _live_train_cache.get(
        cache_key
    )

    if cached:

        age = (
            time.time()
            - cached["timestamp"]
        )

        if age < LIVE_CACHE_TTL_SECONDS:
            return cached["data"]

    url = (
        f"{RAILRADAR_BASE}"
        f"/trains/{train_number}/live"
    )

    data = _railradar_get(
        url,
        params={
            "haltsOnly": "false",
            "geometry": "false",
        },
    )

    _live_train_cache[
        cache_key
    ] = {
        "timestamp": time.time(),
        "data": data,
    }

    return data


# ============================================================
# DATA EXTRACTION
# ============================================================

def _extract_data(
    response: Dict[str, Any],
) -> Dict[str, Any]:

    if not isinstance(
        response,
        dict,
    ):
        return {}

    data = response.get(
        "data"
    )

    if isinstance(
        data,
        dict,
    ):
        return data

    return response


def _extract_route(
    live_data: Dict[str, Any],
) -> List[Dict[str, Any]]:

    route = live_data.get(
        "route"
    )

    if isinstance(
        route,
        list,
    ):

        return [
            item
            for item in route
            if isinstance(
                item,
                dict,
            )
        ]

    return []


# ============================================================
# ROUTE HELPERS
# ============================================================

def _station_code_from_stop(
    stop: Dict[str, Any],
) -> Optional[str]:

    value = (
        stop.get("stationCode")
        or stop.get("station_code")
        or stop.get("code")
    )

    if value is None:
        return None

    return str(
        value
    ).strip().upper()


def _find_route_stop(
    live_data: Dict[str, Any],
    station_code: str,
) -> Optional[Dict[str, Any]]:

    target = (
        station_code
        .strip()
        .upper()
    )

    for stop in _extract_route(
        live_data
    ):

        code = _station_code_from_stop(
            stop
        )

        if code == target:
            return stop

    return None


def _route_contains_section(
    live_data: Dict[str, Any],
    from_code: str,
    to_code: str,
) -> bool:

    from_code = (
        from_code
        .strip()
        .upper()
    )

    to_code = (
        to_code
        .strip()
        .upper()
    )

    route = _extract_route(
        live_data
    )

    codes = []

    for stop in route:

        code = _station_code_from_stop(
            stop
        )

        if code:
            codes.append(code)

    for i in range(
        len(codes) - 1
    ):

        if (
            codes[i] == from_code
            and
            codes[i + 1] == to_code
        ):
            return True

    return False


# ============================================================
# DATETIME HELPERS
# ============================================================

def _get_stop_datetime(
    stop: Optional[Dict[str, Any]],
    *keys: str,
) -> Optional[datetime]:

    if not stop:
        return None

    for key in keys:

        value = stop.get(
            key
        )

        dt = _parse_iso_datetime(
            value
        )

        if dt:
            return dt

    return None


def _delay_for_stop(
    stop: Optional[Dict[str, Any]],
    departure: bool = False,
) -> Optional[int]:

    if not stop:
        return None

    if departure:

        return (
            _safe_int(
                stop.get(
                    "delayDeparture"
                )
            )
            if stop.get(
                "delayDeparture"
            ) is not None
            else _safe_int(
                stop.get(
                    "delayMinutes"
                )
            )
        )

    return (
        _safe_int(
            stop.get(
                "delayArrival"
            )
        )
        if stop.get(
            "delayArrival"
        ) is not None
        else _safe_int(
            stop.get(
                "delayMinutes"
            )
        )
    )


def _add_delay(
    scheduled: Optional[datetime],
    delay: Optional[int],
) -> Optional[datetime]:

    if scheduled is None:
        return None

    return (
        scheduled
        + timedelta(
            minutes=(
                delay
                if delay is not None
                else 0
            )
        )
    )


def _calculate_eta(
    expected_arrival: Optional[datetime],
) -> Optional[int]:

    if expected_arrival is None:
        return None

    now = datetime.now(IST)

    value = round(
        (
            expected_arrival
            - now
        ).total_seconds()
        / 60
    )

    return max(
        0,
        value,
    )


# ============================================================
# NORMALIZE LIVE TRAIN
# ============================================================

def _normalize_live_train(
    train_number: str,
    train_name: str,
    from_code: str,
    to_code: str,
    from_name: str,
    to_name: str,
    live_data: Dict[str, Any],
    from_stop: Dict[str, Any],
    to_stop: Dict[str, Any],
    station_live: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:

    # --------------------------------------------------------
    # Scheduled times
    # --------------------------------------------------------

    scheduled_departure = _get_stop_datetime(
        from_stop,
        "scheduledDeparture",
        "scheduled_departure",
        "scheduledDepartureTime",
    )

    scheduled_arrival = _get_stop_datetime(
        to_stop,
        "scheduledArrival",
        "scheduled_arrival",
        "scheduledArrivalTime",
    )

    # --------------------------------------------------------
    # Actual times
    # --------------------------------------------------------

    actual_departure = _get_stop_datetime(
        from_stop,
        "actualDeparture",
        "actual_departure",
        "actualDepartureTime",
    )

    actual_arrival = _get_stop_datetime(
        to_stop,
        "actualArrival",
        "actual_arrival",
        "actualArrivalTime",
    )

    # --------------------------------------------------------
    # Delay
    # --------------------------------------------------------

    departure_delay = _delay_for_stop(
        from_stop,
        departure=True,
    )

    arrival_delay = _delay_for_stop(
        to_stop,
        departure=False,
    )

    overall_delay = (
        _safe_int(
            live_data.get(
                "delayMinutes"
            )
        )
    )

    if departure_delay is None:
        departure_delay = overall_delay

    if arrival_delay is None:
        arrival_delay = overall_delay

    if departure_delay is None:
        departure_delay = 0

    if arrival_delay is None:
        arrival_delay = 0

    # --------------------------------------------------------
    # Station-board live fallback
    # --------------------------------------------------------

    station_live = (
        station_live
        if isinstance(
            station_live,
            dict,
        )
        else {}
    )

    station_expected_departure = _parse_iso_datetime(
        station_live.get(
            "expectedDepartureTime"
        )
    )

    # --------------------------------------------------------
    # Expected departure
    # --------------------------------------------------------

    if actual_departure:

        expected_departure = (
            actual_departure
        )

    elif station_expected_departure:

        expected_departure = (
            station_expected_departure
        )

    else:

        expected_departure = _add_delay(
            scheduled_departure,
            departure_delay,
        )

    # --------------------------------------------------------
    # Expected arrival
    # --------------------------------------------------------

    if actual_arrival:

        expected_arrival = (
            actual_arrival
        )

    else:

        expected_arrival = _add_delay(
            scheduled_arrival,
            arrival_delay,
        )

    # --------------------------------------------------------
    # ETA
    # --------------------------------------------------------

    eta_minutes = _calculate_eta(
        expected_arrival
    )

    # --------------------------------------------------------
    # Departure minutes
    # --------------------------------------------------------

    minutes_until_departure = (
        _minutes_from_now(
            expected_departure
        )
    )

    if (
        minutes_until_departure
        is not None
        and
        minutes_until_departure < 0
    ):

        minutes_until_departure = 0

    # --------------------------------------------------------
    # Platform
    # --------------------------------------------------------

    platform = (
        from_stop.get("platform")
        or
        from_stop.get("platformNumber")
        or
        to_stop.get("platform")
        or
        to_stop.get("platformNumber")
        or
        station_live.get("platform")
    )

    # --------------------------------------------------------
    # Current location
    # --------------------------------------------------------

    current_location = (
        live_data.get(
            "currentLocation"
        )
    )

    # --------------------------------------------------------
    # Speed
    # --------------------------------------------------------

    speed_kmh = None

    if isinstance(
        current_location,
        dict,
    ):

        speed_kmh = _safe_float(
            current_location.get(
                "speedKmh"
            )
        )

        if speed_kmh is None:

            speed_kmh = _safe_float(
                current_location.get(
                    "speed"
                )
            )

    # --------------------------------------------------------
    # Status
    # --------------------------------------------------------

    status = (
        live_data.get(
            "status"
        )
        or
        from_stop.get(
            "status"
        )
        or
        station_live.get(
            "type"
        )
        or
        "upcoming"
    )

    live_status = (
        from_stop.get(
            "status"
        )
        or
        station_live.get(
            "type"
        )
        or
        live_data.get(
            "status"
        )
        or
        "upcoming"
    )

    # --------------------------------------------------------
    # Last updated
    # --------------------------------------------------------

    last_updated_at = (
        live_data.get(
            "lastUpdatedAt"
        )
        or
        live_data.get(
            "lastUpdated"
        )
        or
        station_live.get(
            "updatedAt"
        )
    )

    # --------------------------------------------------------
    # Display
    # --------------------------------------------------------

    departure_display = (
        _format_time(
            expected_departure
        )
    )

    arrival_display = (
        _format_time(
            expected_arrival
        )
    )

    return {

        "train_no": str(
            train_number
        ),

        "train_name": str(
            train_name
        ),

        "from_code": from_code,

        "to_code": to_code,

        "from_station": from_name,

        "to_station": to_name,

        "direction": (
            "FORWARD"
            if from_code == from_code
            else "REVERSE"
        ),

        "departure_time": (
            departure_display
        ),

        "arrival_time": (
            arrival_display
        ),

        "scheduled_departure": (
            scheduled_departure.isoformat()
            if scheduled_departure
            else None
        ),

        "actual_departure": (
            actual_departure.isoformat()
            if actual_departure
            else None
        ),

        "expected_departure": (
            expected_departure.isoformat()
            if expected_departure
            else None
        ),

        "scheduled_arrival": (
            scheduled_arrival.isoformat()
            if scheduled_arrival
            else None
        ),

        "actual_arrival": (
            actual_arrival.isoformat()
            if actual_arrival
            else None
        ),

        "expected_arrival": (
            expected_arrival.isoformat()
            if expected_arrival
            else None
        ),

        "minutes_until_departure": (
            minutes_until_departure
        ),

        "minutes_until_arrival": (
            eta_minutes
        ),

        "eta_minutes": (
            eta_minutes
        ),

        "status": status,

        "live_status": live_status,

        "delay_minutes": (
            arrival_delay
        ),

        "departure_delay_minutes": (
            departure_delay
        ),

        "arrival_delay_minutes": (
            arrival_delay
        ),

        "platform": platform,

        "speed_kmh": speed_kmh,

        "current_location": (
            current_location
        ),

        "last_updated_at": (
            last_updated_at
        ),

        "source": "RailRadar LIVE",

        "is_live": True,

        "live": True,

        "disclosure": (
            "Third-party live data via "
            "RailRadar, not an official "
            "Indian Railways feed."
        ),
    }


# ============================================================
# UPCOMING TRAINS — RAILRADAR
# ============================================================

@router.get(
    "/section/{section_id}/upcoming"
)
def upcoming_trains(
    section_id: str,
    hours: int = 3,
    user=Depends(get_current_user),
):

    _check_railradar_config()

    canonical = _canonical_section(
        section_id
    )

    parts = canonical.split("-")

    if len(parts) != 2:

        raise HTTPException(
            status_code=400,
            detail=(
                "section_id must be "
                "STATION-STATION."
            ),
        )

    station_a, station_b = parts

    hours = max(
        1,
        min(
            int(hours),
            3,
        ),
    )

    now = datetime.now(IST)

    window_end = (
        now
        + timedelta(
            hours=hours
        )
    )

    # --------------------------------------------------------
    # ONE RailRadar station-board call.
    # --------------------------------------------------------

    station_response = (
        _railradar_station_live(
            station_a,
            hours=4,
        )
    )

    station_data = _extract_data(
        station_response
    )

    entries = (
        station_data.get(
            "trains"
        )
        or []
    )

    if not isinstance(
        entries,
        list,
    ):
        entries = []

    candidates = []

    seen = set()

    # --------------------------------------------------------
    # Extract nested RailRadar structure.
    #
    # THIS WAS THE MAIN BUG IN YOUR OLD CODE.
    # --------------------------------------------------------

    for entry in entries:

        if not isinstance(
            entry,
            dict,
        ):
            continue

        train_obj = (
            entry.get(
                "train"
            )
            or {}
        )

        live_obj = (
            entry.get(
                "live"
            )
            or {}
        )

        train_number = (
            train_obj.get(
                "number"
            )
            or
            train_obj.get(
                "trainNumber"
            )
            or
            entry.get(
                "trainNumber"
            )
            or
            entry.get(
                "number"
            )
        )

        if train_number is None:
            continue

        train_number = str(
            train_number
        ).strip()

        if not train_number:
            continue

        if train_number in seen:
            continue

        seen.add(
            train_number
        )

        train_name = (
            train_obj.get(
                "name"
            )
            or
            train_obj.get(
                "trainName"
            )
            or
            entry.get(
                "trainName"
            )
            or
            ""
        )

        live_type = str(
            live_obj.get(
                "type"
            )
            or
            ""
        ).lower()

        expected_departure = (
            _parse_iso_datetime(
                live_obj.get(
                    "expectedDepartureTime"
                )
            )
        )

        # Ignore trains that have already departed
        # from the queried station.
        if live_type == "departed":
            continue

        # If RailRadar supplied a real expected departure,
        # use it to filter before making train-live calls.
        if expected_departure:

            if expected_departure < now:
                continue

            if expected_departure > window_end:
                continue

        candidates.append(
            {
                "entry": entry,
                "train_number": train_number,
                "train_name": str(
                    train_name
                ),
                "live": live_obj,
            }
        )

    # --------------------------------------------------------
    # Earliest trains first.
    # --------------------------------------------------------

    candidates.sort(
        key=lambda item: (
            _parse_iso_datetime(
                item["live"].get(
                    "expectedDepartureTime"
                )
            )
            or
            window_end
        )
    )

    # --------------------------------------------------------
    # Protect RailRadar rate limit.
    #
    # Station call + maximum 6 train calls.
    # --------------------------------------------------------

    if len(candidates) > MAX_TRAIN_ENRICHMENTS:

        candidates = candidates[
            :MAX_TRAIN_ENRICHMENTS
        ]

    results = []

    errors = []

    # --------------------------------------------------------
    # Enrich with actual RailRadar train route.
    # --------------------------------------------------------

    for candidate in candidates:

        train_number = candidate[
            "train_number"
        ]

        train_name = candidate[
            "train_name"
        ]

        station_live = candidate[
            "live"
        ]

        try:

            live_response = (
                _railradar_train_live(
                    train_number
                )
            )

        except HTTPException as exc:

            errors.append(
                {
                    "train_no": train_number,
                    "status_code": exc.status_code,
                    "error": str(
                        exc.detail
                    ),
                }
            )

            # IMPORTANT:
            # Do not silently convert this to schedule data.
            continue

        live_data = _extract_data(
            live_response
        )

        # ----------------------------------------------------
        # Try GZB -> NDLS.
        # ----------------------------------------------------

        from_code = station_a
        to_code = station_b

        from_stop = _find_route_stop(
            live_data,
            from_code,
        )

        to_stop = _find_route_stop(
            live_data,
            to_code,
        )

        valid_direction = (
            from_stop is not None
            and
            to_stop is not None
            and
            _route_contains_section(
                live_data,
                from_code,
                to_code,
            )
        )

        # ----------------------------------------------------
        # Try NDLS -> GZB.
        # ----------------------------------------------------

        if not valid_direction:

            from_code = station_b
            to_code = station_a

            from_stop = _find_route_stop(
                live_data,
                from_code,
            )

            to_stop = _find_route_stop(
                live_data,
                to_code,
            )

            valid_direction = (
                from_stop is not None
                and
                to_stop is not None
                and
                _route_contains_section(
                    live_data,
                    from_code,
                    to_code,
                )
            )

        if not valid_direction:

            continue

        from_name = str(
            from_stop.get(
                "stationName"
            )
            or
            from_code
        )

        to_name = str(
            to_stop.get(
                "stationName"
            )
            or
            to_code
        )

        normalized = (
            _normalize_live_train(
                train_number=(
                    train_number
                ),
                train_name=(
                    train_name
                ),
                from_code=(
                    from_code
                ),
                to_code=(
                    to_code
                ),
                from_name=(
                    from_name
                ),
                to_name=(
                    to_name
                ),
                live_data=(
                    live_data
                ),
                from_stop=(
                    from_stop
                ),
                to_stop=(
                    to_stop
                ),
                station_live=(
                    station_live
                ),
            )
        )

        # ----------------------------------------------------
        # Determine section-entry time.
        # ----------------------------------------------------

        departure_dt = (
            _parse_iso_datetime(
                normalized.get(
                    "expected_departure"
                )
            )
        )

        arrival_dt = (
            _parse_iso_datetime(
                normalized.get(
                    "expected_arrival"
                )
            )
        )

        # ----------------------------------------------------
        # Upcoming section movement.
        #
        # Use departure if it is still upcoming.
        # Otherwise use destination arrival.
        # ----------------------------------------------------

        reference_time = None

        if (
            departure_dt
            and
            departure_dt >= now
        ):

            reference_time = (
                departure_dt
            )

        elif (
            arrival_dt
            and
            arrival_dt >= now
        ):

            reference_time = (
                arrival_dt
            )

        if reference_time is None:
            continue

        if reference_time > window_end:
            continue

        # ----------------------------------------------------
        # Deduplicate.
        # ----------------------------------------------------

        if any(
            item["train_no"]
            == normalized["train_no"]
            for item in results
        ):
            continue

        results.append(
            normalized
        )

    # --------------------------------------------------------
    # Sort by section departure.
    # --------------------------------------------------------

    results.sort(
        key=lambda item: (
            item.get(
                "minutes_until_departure"
            )
            if item.get(
                "minutes_until_departure"
            ) is not None
            else 999999
        )
    )

    within_30 = sum(
        1
        for item in results
        if (
            item.get(
                "minutes_until_departure"
            ) is not None
            and
            0
            <= item[
                "minutes_until_departure"
            ]
            <= 30
        )
    )

    next_train = (
        results[0]
        if results
        else None
    )

    # --------------------------------------------------------
    # IMPORTANT:
    # Always say RailRadar LIVE.
    # Never return Schedule Projection here.
    # --------------------------------------------------------

    return {

        "success": True,

        "section_id": canonical,

        "from_code": station_a,

        "to_code": station_b,

        "window_hours": hours,

        "as_of": now.isoformat(),

        "last_updated_at": now.isoformat(),

        "upcoming_trains": results,

        "trains": results,

        "count": len(
            results
        ),

        "upcoming_count": len(
            results
        ),

        "next_train": next_train,

        "within_30_minutes": within_30,

        "source": "RailRadar LIVE",

        "live": True,

        "is_live": True,

        "partial": (
            len(errors) > 0
        ),

        "enrichment_errors": errors,

        "disclosure": (
            "Live railway data provided "
            "by third-party RailRadar. "
            "Not an official Indian Railways feed."
        ),
    }


# ============================================================
# DIRECT TRAIN LIVE
# ============================================================

@router.get(
    "/train/{train_number}"
)
def live_train_lookup(
    train_number: str,
    user=Depends(get_current_user),
):

    _check_railradar_config()

    train_number = (
        train_number.strip()
    )

    if not train_number:

        raise HTTPException(
            status_code=400,
            detail=(
                "Train number is required."
            ),
        )

    live_response = (
        _railradar_train_live(
            train_number
        )
    )

    data = _extract_data(
        live_response
    )

    return {

        "success": True,

        "data": data,

        "source": "RailRadar LIVE",

        "live": True,

        "is_live": True,

        "disclosure": (
            "Third-party live data via "
            "RailRadar, not an official "
            "Indian Railways feed."
        ),
    }