"""
backend/live.py — RailVinyas Live Section + RailRadar LIVE data.

DATA SOURCES
------------

1. SCHEDULE PROJECTION
   Uses the real timetable CSV already loaded by app.py.
   Used by:
       GET /api/live/section/{section_id}/projection

   This is NOT GPS.

2. RAILRADAR LIVE
   Third-party live railway data.
   Used by:
       GET /api/live/section/{section_id}/upcoming
       GET /api/live/train/{train_number}

   RailRadar is NOT an official Indian Railways feed.

IMPORTANT
---------
- RailRadar API is rate limited.
- Backend cache is used to reduce repeated API calls.
- Do NOT use authoritative=true by default because that bypasses
  RailRadar cache and increases upstream requests.
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
# THIRD-PARTY
# ============================================================

import pandas as pd
import requests
from fastapi import APIRouter, Depends, HTTPException


# ============================================================
# LOCAL APPLICATION
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
# CONFIGURATION
# ============================================================

RAILRADAR_API_KEY = os.environ.get("RAILRADAR_API_KEY")

RAILRADAR_BASE = "https://api.railradar.in/v1"

IST = ZoneInfo("Asia/Kolkata")


# ============================================================
# RATE LIMIT PROTECTION
# ============================================================

# Cache RailRadar responses for 60 seconds.
#
# This prevents the same train from being requested repeatedly
# within a short period.
LIVE_CACHE_TTL_SECONDS = 60


# train_number -> {
#     "timestamp": float,
#     "data": dict
# }
_live_train_cache: Dict[str, Dict[str, Any]] = {}


# station cache:
# (station_code, hours) -> {
#     "timestamp": float,
#     "data": dict
# }
_live_station_cache: Dict[str, Dict[str, Any]] = {}


# ============================================================
# TIMETABLE DATA
# ============================================================

# Populated by init_live_module() from app.py.
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
    Precompute every timetable train hop.

    This keeps /projection fast and avoids scanning the entire
    timetable dataframe on every request.
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
            []
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

def _canonical_section(
    section_id: str,
) -> str:

    parts = [
        p.strip().upper()
        for p in section_id.split("-")
        if p.strip()
    ]

    if len(parts) != 2:
        return section_id.strip().upper()

    return "-".join(
        sorted(parts)
    )


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
            return dt.replace(
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

    return dt.strftime(
        "%H:%M"
    )


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
        return int(
            float(value)
        )
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
# SIGNAL ASPECT
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

    """
    Schedule-projected trains currently inside a section.

    This does NOT use RailRadar.
    """

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
                    else
                    1 - raw_fraction
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
                        "source": "schedule",
                        "is_live": False,
                    }
                )

                break

    return {
        "section_id": canonical,
        "as_of": now.strftime(
            "%H:%M:%S"
        ),
        "signal_aspect": _signal_aspect(
            canonical,
            now.hour,
        ),
        "active_trains": active,
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

    return {
        "Authorization": (
            f"Bearer {RAILRADAR_API_KEY}"
        ),
        "Accept": "application/json",
        "User-Agent": "RailVinyas/1.0",
    }


def _railradar_error_detail(
    response: requests.Response,
) -> str:

    try:

        body = response.json()

        if isinstance(body, dict):

            detail = (
                body.get("detail")
                or body.get("message")
                or body.get("error")
            )

            if detail:
                return str(detail)

        return response.text[:300]

    except Exception:
        return response.text[:300]


def _check_railradar_config():

    if not RAILRADAR_API_KEY:

        raise HTTPException(
            status_code=503,
            detail=(
                "RailRadar live data is not configured. "
                "Set RAILRADAR_API_KEY in the server environment."
            ),
        )


# ============================================================
# RAILRADAR STATION LIVE
# ============================================================

def _railradar_station_live(
    station_code: str,
    hours: int = 4,
) -> Dict[str, Any]:

    _check_railradar_config()

    station_code = (
        station_code.strip().upper()
    )

    hours = max(
        2,
        min(
            int(hours),
            8,
        ),
    )

    cache_key = (
        f"{station_code}:{hours}"
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

    params = {
        "hours": hours,
        "includeIntermediate": "true",
    }

    try:

        response = requests.get(
            url,
            headers=_railradar_headers(),
            params=params,
            timeout=10,
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
                f"RailRadar station "
                f"'{station_code}' not found."
            ),
        )

    if response.status_code == 429:

        raise HTTPException(
            status_code=429,
            detail=(
                "RailRadar rate limit exceeded. "
                "Please wait before requesting live data again."
            ),
        )

    if not response.ok:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar returned an error "
                f"(HTTP {response.status_code}): "
                f"{_railradar_error_detail(response)}"
            ),
        )

    try:
        data = response.json()

    except ValueError:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar returned invalid JSON."
            ),
        )

    _live_station_cache[
        cache_key
    ] = {
        "timestamp": time.time(),
        "data": data,
    }

    return data


# ============================================================
# RAILRADAR TRAIN LIVE
# ============================================================

def _railradar_train_live(
    train_number: str,
) -> Dict[str, Any]:

    _check_railradar_config()

    train_number = (
        str(train_number)
        .strip()
    )

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

    try:

        response = requests.get(
            url,
            headers=_railradar_headers(),
            timeout=10,
        )

    except requests.RequestException as exc:

        raise HTTPException(
            status_code=502,
            detail=(
                "Could not reach RailRadar: "
                f"{exc}"
            ),
        )

    if response.status_code == 404:

        raise HTTPException(
            status_code=404,
            detail=(
                f"Train '{train_number}' "
                "was not found in RailRadar live data."
            ),
        )

    if response.status_code == 401:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar API key was rejected."
            ),
        )

    if response.status_code == 429:

        raise HTTPException(
            status_code=429,
            detail=(
                "RailRadar rate limit exceeded. "
                "Please wait before requesting live data again."
            ),
        )

    if not response.ok:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar returned an error "
                f"(HTTP {response.status_code}): "
                f"{_railradar_error_detail(response)}"
            ),
        )

    try:

        data = response.json()

    except ValueError:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar returned invalid JSON."
            ),
        )

    _live_train_cache[
        cache_key
    ] = {
        "timestamp": time.time(),
        "data": data,
    }

    return data


# ============================================================
# ROUTE EXTRACTION
# ============================================================

def _extract_data(
    response: Dict[str, Any],
) -> Dict[str, Any]:

    """
    RailRadar responses may wrap payload inside data.
    """

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

    possible = [
        live_data.get("route"),
        live_data.get("stops"),
        live_data.get("stations"),
    ]

    for route in possible:

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


def _station_code_from_stop(
    stop: Dict[str, Any],
) -> Optional[str]:

    value = (
        stop.get("stationCode")
        or stop.get("station_code")
        or stop.get("code")
        or stop.get("station")
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

    station_code = (
        station_code.strip().upper()
    )

    route = _extract_route(
        live_data
    )

    for stop in route:

        code = _station_code_from_stop(
            stop
        )

        if code == station_code:
            return stop

    return None


def _route_contains_section(
    live_data: Dict[str, Any],
    from_code: str,
    to_code: str,
) -> bool:

    from_code = (
        from_code.strip().upper()
    )

    to_code = (
        to_code.strip().upper()
    )

    route = _extract_route(
        live_data
    )

    if not route:
        return False

    codes = []

    for stop in route:

        code = _station_code_from_stop(
            stop
        )

        if code:
            codes.append(code)

    for index in range(
        len(codes) - 1
    ):

        if (
            codes[index] == from_code
            and
            codes[index + 1] == to_code
        ):
            return True

    return False


# ============================================================
# TIMING EXTRACTION
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


def _expected_arrival_from_delay(
    scheduled_arrival: Optional[datetime],
    delay_minutes: Optional[int],
) -> Optional[datetime]:

    if scheduled_arrival is None:
        return None

    delay = (
        delay_minutes
        if delay_minutes is not None
        else 0
    )

    return (
        scheduled_arrival
        + timedelta(
            minutes=delay
        )
    )


def _calculate_eta(
    expected_arrival: Optional[datetime],
) -> Optional[int]:

    if expected_arrival is None:
        return None

    now = datetime.now(IST)

    minutes = round(
        (
            expected_arrival
            - now
        ).total_seconds()
        / 60
    )

    return max(
        0,
        minutes,
    )


# ============================================================
# NORMALIZE RAILRADAR TRAIN
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
) -> Dict[str, Any]:

    # --------------------------------------------------------
    # Scheduled departure
    # --------------------------------------------------------

    scheduled_departure = _get_stop_datetime(
        from_stop,
        "scheduledDeparture",
        "scheduled_departure",
        "departureTime",
        "scheduledDepartureTime",
    )

    # --------------------------------------------------------
    # Actual departure
    # --------------------------------------------------------

    actual_departure = _get_stop_datetime(
        from_stop,
        "actualDeparture",
        "actual_departure",
        "actualDepartureTime",
    )

    # --------------------------------------------------------
    # Scheduled arrival
    # --------------------------------------------------------

    scheduled_arrival = _get_stop_datetime(
        to_stop,
        "scheduledArrival",
        "scheduled_arrival",
        "arrivalTime",
        "scheduledArrivalTime",
    )

    # --------------------------------------------------------
    # Actual arrival
    # --------------------------------------------------------

    actual_arrival = _get_stop_datetime(
        to_stop,
        "actualArrival",
        "actual_arrival",
        "actualArrivalTime",
    )

    # --------------------------------------------------------
    # Delay
    # --------------------------------------------------------

    delay_minutes = (
        _safe_int(
            live_data.get(
                "delayMinutes"
            )
        )
        or
        _safe_int(
            live_data.get(
                "delay"
            )
        )
        or
        _safe_int(
            from_stop.get(
                "delayMinutes"
            )
        )
        or
        0
    )

    # --------------------------------------------------------
    # Expected arrival
    #
    # If actual arrival exists, train has arrived.
    #
    # Otherwise:
    # scheduled arrival + live delay
    # --------------------------------------------------------

    if actual_arrival:

        expected_arrival = (
            actual_arrival
        )

    else:

        expected_arrival = (
            _expected_arrival_from_delay(
                scheduled_arrival,
                delay_minutes,
            )
        )

    # --------------------------------------------------------
    # Expected departure
    # --------------------------------------------------------

    if actual_departure:

        expected_departure = (
            actual_departure
        )

    else:

        expected_departure = (
            scheduled_departure
        )

    # --------------------------------------------------------
    # ETA
    # --------------------------------------------------------

    if actual_arrival:

        eta_minutes = 0

    else:

        eta_minutes = _calculate_eta(
            expected_arrival
        )

    # --------------------------------------------------------
    # Minutes until departure
    # --------------------------------------------------------

    minutes_until_departure = (
        _minutes_from_now(
            expected_departure
        )
    )

    # If train already departed,
    # don't show negative departure time.
    if (
        minutes_until_departure is not None
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

        speed_kmh = (
            _safe_float(
                current_location.get(
                    "speed"
                )
            )
        )

        if speed_kmh is None:

            speed_kmh = (
                _safe_float(
                    current_location.get(
                        "speedKmh"
                    )
                )
            )

    if speed_kmh is None:

        speed_kmh = (
            _safe_float(
                live_data.get(
                    "speed"
                )
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
        live_data.get(
            "trainStatus"
        )
        or
        from_stop.get(
            "status"
        )
        or
        "upcoming"
    )

    live_status = (
        from_stop.get(
            "status"
        )
        or
        live_data.get(
            "status"
        )
        or
        "upcoming"
    )

    # --------------------------------------------------------
    # Last update
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
        live_data.get(
            "updatedAt"
        )
    )

    # --------------------------------------------------------
    # Direction
    # --------------------------------------------------------

    direction = "FORWARD"

    if (
        from_code
        and
        to_code
    ):
        direction = "FORWARD"

    # --------------------------------------------------------
    # Human-readable timing
    # --------------------------------------------------------

    departure_display = (
        _format_time(
            actual_departure
        )
        if actual_departure
        else
        _format_time(
            scheduled_departure
        )
    )

    arrival_display = (
        _format_time(
            actual_arrival
        )
        if actual_arrival
        else
        _format_time(
            expected_arrival
        )
    )

    return {
        # ----------------------------------------------------
        # Basic identity
        # ----------------------------------------------------

        "train_no": str(
            train_number
        ),

        "train_name": str(
            train_name
        ),

        # ----------------------------------------------------
        # Section
        # ----------------------------------------------------

        "from_code": from_code,

        "to_code": to_code,

        "from_station": from_name,

        "to_station": to_name,

        "direction": direction,

        # ----------------------------------------------------
        # Display timing
        # ----------------------------------------------------

        "departure_time": (
            departure_display
        ),

        "arrival_time": (
            arrival_display
        ),

        # ----------------------------------------------------
        # Raw live timing
        # ----------------------------------------------------

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

        # ----------------------------------------------------
        # ETA
        # ----------------------------------------------------

        "minutes_until_departure": (
            minutes_until_departure
        ),

        "minutes_until_arrival": (
            eta_minutes
        ),

        "eta_minutes": (
            eta_minutes
        ),

        # ----------------------------------------------------
        # Operational status
        # ----------------------------------------------------

        "status": status,

        "live_status": live_status,

        "delay_minutes": (
            delay_minutes
        ),

        "platform": platform,

        "speed_kmh": speed_kmh,

        "current_location": (
            current_location
        ),

        "last_updated_at": (
            last_updated_at
        ),

        # ----------------------------------------------------
        # Source
        # ----------------------------------------------------

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
# UPCOMING TRAINS — REAL RAILRADAR DATA
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
    Return upcoming trains for a section using
    RailRadar LIVE data.

    Example:

        /api/live/section/GZB-NDLS/upcoming?hours=3
    """

    _check_railradar_config()

    canonical = _canonical_section(
        section_id
    )

    parts = canonical.split("-")

    if len(parts) != 2:

        raise HTTPException(
            status_code=400,
            detail=(
                "section_id must be in "
                "STATION-STATION format."
            ),
        )

    station_a, station_b = parts

    # --------------------------------------------------------
    # IMPORTANT:
    #
    # The canonical section is sorted alphabetically.
    # We therefore try both directions.
    # --------------------------------------------------------

    hours = max(
        1,
        min(
            int(hours),
            3,
        ),
    )

    now = datetime.now(IST)

    # --------------------------------------------------------
    # Get RailRadar live station board.
    #
    # We request 4 hours from RailRadar because its live
    # station board supports 2/4/6/8 hour windows.
    # We then trim the result to our requested 3-hour window.
    # --------------------------------------------------------

    station_data = _railradar_station_live(
        station_a,
        hours=4,
    )

    data = _extract_data(
        station_data
    )

    entries = (
        data.get("trains")
        or
        data.get("entries")
        or
        data.get("departures")
        or
        data.get("arrivals")
        or
        []
    )

    if not isinstance(
        entries,
        list,
    ):
        entries = []

    results = []

    seen_trains = set()

    # --------------------------------------------------------
    # First pass:
    # inspect station board.
    # --------------------------------------------------------

    candidates = []

    for entry in entries:

        if not isinstance(
            entry,
            dict,
        ):
            continue

        train_number = (
            entry.get("trainNumber")
            or
            entry.get("train_no")
            or
            entry.get("number")
        )

        if train_number is None:
            continue

        train_number = str(
            train_number
        ).strip()

        if not train_number:
            continue

        if train_number in seen_trains:
            continue

        seen_trains.add(
            train_number
        )

        candidates.append(
            entry
        )

    # --------------------------------------------------------
    # Second pass:
    # enrich candidates with RailRadar live train endpoint.
    #
    # Cache prevents repeated requests for same train within
    # 60 seconds.
    # --------------------------------------------------------

    for entry in candidates:

        train_number = str(
            entry.get("trainNumber")
            or
            entry.get("train_no")
            or
            entry.get("number")
        ).strip()

        train_name = str(
            entry.get("trainName")
            or
            entry.get("train_name")
            or
            entry.get("name")
            or
            ""
        )

        # ----------------------------------------------------
        # Candidate direction from station board
        # ----------------------------------------------------

        entry_from = str(
            entry.get("stationCode")
            or
            entry.get("station_code")
            or
            entry.get("fromCode")
            or
            ""
        ).strip().upper()

        entry_to = str(
            entry.get("nextStationCode")
            or
            entry.get("toCode")
            or
            ""
        ).strip().upper()

        # ----------------------------------------------------
        # Get live train data.
        # ----------------------------------------------------

        try:

            live_response = (
                _railradar_train_live(
                    train_number
                )
            )

        except HTTPException as exc:

            # One unavailable train must NOT destroy
            # the complete upcoming-trains response.
            #
            # Particularly important with free API limits.
            if exc.status_code in (
                404,
                429,
            ):
                continue

            continue

        live_data = _extract_data(
            live_response
        )

        # ----------------------------------------------------
        # Find the requested section.
        #
        # Try both directions because section_id is canonical.
        # ----------------------------------------------------

        route_from = station_a
        route_to = station_b

        from_stop = _find_route_stop(
            live_data,
            route_from,
        )

        to_stop = _find_route_stop(
            live_data,
            route_to,
        )

        valid_direction = (
            from_stop is not None
            and
            to_stop is not None
            and
            _route_contains_section(
                live_data,
                route_from,
                route_to,
            )
        )

        # Try reverse.
        if not valid_direction:

            route_from = station_b
            route_to = station_a

            from_stop = _find_route_stop(
                live_data,
                route_from,
            )

            to_stop = _find_route_stop(
                live_data,
                route_to,
            )

            valid_direction = (
                from_stop is not None
                and
                to_stop is not None
                and
                _route_contains_section(
                    live_data,
                    route_from,
                    route_to,
                )
            )

        if not valid_direction:
            continue

        # ----------------------------------------------------
        # Station names
        # ----------------------------------------------------

        from_name = str(
            from_stop.get(
                "stationName"
            )
            or
            from_stop.get(
                "station_name"
            )
            or
            entry.get(
                "stationName"
            )
            or
            route_from
        )

        to_name = str(
            to_stop.get(
                "stationName"
            )
            or
            to_stop.get(
                "station_name"
            )
            or
            route_to
        )

        # ----------------------------------------------------
        # Normalize live data.
        # ----------------------------------------------------

        normalized = _normalize_live_train(
            train_number=train_number,
            train_name=train_name,
            from_code=route_from,
            to_code=route_to,
            from_name=from_name,
            to_name=to_name,
            live_data=live_data,
            from_stop=from_stop,
            to_stop=to_stop,
        )

        # ----------------------------------------------------
        # Determine arrival/departure time used for window.
        # ----------------------------------------------------

        arrival_value = (
            normalized.get(
                "expected_arrival"
            )
        )

        departure_value = (
            normalized.get(
                "scheduled_departure"
            )
        )

        arrival_dt = _parse_iso_datetime(
            arrival_value
        )

        departure_dt = _parse_iso_datetime(
            departure_value
        )

        # ----------------------------------------------------
        # Only show trains within requested window.
        # ----------------------------------------------------

        window_end = (
            now
            + timedelta(
                hours=hours
            )
        )

        reference_time = (
            arrival_dt
            or
            departure_dt
        )

        if reference_time is None:
            continue

        if reference_time < now:
            # Already passed.
            #
            # It may still be active, but /upcoming should
            # not include it.
            continue

        if reference_time > window_end:
            continue

        # ----------------------------------------------------
        # Final deduplication.
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
    # Sort by ETA.
    # --------------------------------------------------------

    results.sort(
        key=lambda item: (
            item.get(
                "eta_minutes"
            )
            if item.get(
                "eta_minutes"
            ) is not None
            else 999999
        )
    )

    # --------------------------------------------------------
    # Statistics
    # --------------------------------------------------------

    within_30 = sum(
        1
        for item in results
        if (
            item.get(
                "eta_minutes"
            ) is not None
            and
            0
            <= item["eta_minutes"]
            <= 30
        )
    )

    next_train = (
        results[0]
        if results
        else None
    )

    # --------------------------------------------------------
    # Response
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

        "disclosure": (
            "Live railway data provided "
            "by third-party RailRadar. "
            "Not an official Indian Railways feed."
        ),
    }


# ============================================================
# DIRECT LIVE TRAIN LOOKUP
# ============================================================

@router.get(
    "/train/{train_number}"
)
def live_train_lookup(
    train_number: str,
    user=Depends(get_current_user),
):

    """
    Direct RailRadar live train lookup.

    Example:

        /api/live/train/12919
    """

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