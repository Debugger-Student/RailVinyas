"""
backend/live.py — Live Section Panel data.

DATA SOURCES
============

1. SCHEDULE-PROJECTED DATA
   - Uses the real 02_train_timetable.csv timetable data.
   - Used by /section/{section_id}/projection.
   - NOT GPS-confirmed.

2. RAILRADAR LIVE DATA
   - Used by /section/{section_id}/upcoming.
   - Uses RailRadar live station board.
   - Enriches candidate trains using RailRadar live train status.
   - Provides live departure, arrival, ETA, delay, status,
     platform, speed and current location where available.
   - Third-party source.
   - NOT an official Indian Railways feed.

3. RAILRADAR SINGLE TRAIN LOOKUP
   - Used by /train/{train_number}.
   - Direct live train lookup.

Router mounted at /api/live in app.py.
"""

import os
import time
from datetime import datetime, timedelta
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

RAILRADAR_API_KEY = os.environ.get(
    "RAILRADAR_API_KEY"
)

RAILRADAR_BASE = (
    "https://api.railradar.in/v1"
)

# Indian Standard Time
IST = ZoneInfo(
    "Asia/Kolkata"
)

# ------------------------------------------------------------
# Short cache for individual live train lookups.
#
# This prevents the dashboard from consuming a large number
# of RailRadar API calls when the frontend refreshes every
# few seconds.
# ------------------------------------------------------------

LIVE_CACHE_TTL_SECONDS = 30

_live_train_cache = {}


# ============================================================
# PRE-COMPUTED SCHEDULE DATA
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
# Used for signal-aspect proxy.
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

    This is used ONLY for schedule projection.

    RailRadar is NOT used here.
    """

    global _traffic_idx

    _traffic_idx = traffic_idx

    # Prevent duplicate entries.
    _section_hops.clear()

    tt = timetable_df.copy()

    # Ensure sequence is numeric.
    tt["sequence"] = (
        tt["sequence"]
        .astype(int)
    )

    # Sort every train by station sequence.
    tt = tt.sort_values(
        [
            "train_no",
            "sequence",
        ]
    )

    # --------------------------------------------------------
    # Next station.
    # --------------------------------------------------------

    tt["next_station"] = (
        tt.groupby("train_no")[
            "station_code"
        ].shift(-1)
    )

    tt["next_station_name"] = (
        tt.groupby("train_no")[
            "station_name"
        ].shift(-1)
    )

    tt["next_arrival"] = (
        tt.groupby("train_no")[
            "arrival_time"
        ].shift(-1)
    )

    # Only rows having a next station are section hops.
    hops = tt.dropna(
        subset=["next_station"]
    ).copy()

    # --------------------------------------------------------
    # Canonical section ID.
    #
    # GZB -> NDLS
    # NDLS -> GZB
    #
    # both become GZB-NDLS
    # --------------------------------------------------------

    hops["section_id"] = hops.apply(
        lambda r: "-".join(
            sorted(
                [
                    str(
                        r["station_code"]
                    ),
                    str(
                        r["next_station"]
                    ),
                ]
            )
        ),
        axis=1,
    )

    count = 0

    # --------------------------------------------------------
    # Build lookup.
    # --------------------------------------------------------

    for _, r in hops.iterrows():

        dep = str(
            r["departure_time"]
        )

        arr = str(
            r["next_arrival"]
        )

        if dep in (
            "nan",
            "None",
        ):
            continue

        if arr in (
            "nan",
            "None",
        ):
            continue

        entry = {

            "train_no": str(
                r["train_no"]
            ),

            "train_name": str(
                r["train_name"]
            ),

            "from_code": str(
                r["station_code"]
            ),

            "to_code": str(
                r["next_station"]
            ),

            "from_name": str(
                r["station_name"]
            ),

            "to_name": str(
                r["next_station_name"]
            ),

            "dep_time": dep,

            "arr_time": arr,
        }

        section_id = str(
            r["section_id"]
        )

        _section_hops.setdefault(
            section_id,
            []
        ).append(entry)

        count += 1

    print(
        f"[live] Indexed {count} train hops "
        f"across {len(_section_hops)} sections "
        f"for schedule projection",
        flush=True,
    )


# ============================================================
# TIME HELPERS
# ============================================================

def _time_str_to_minutes(
    t: str,
):
    """
    Convert HH:MM:SS into minutes since midnight.
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


def _canonical_section_id(
    section_id: str,
) -> str:
    """
    Convert:

        NDLS-GZB

    into:

        GZB-NDLS
    """

    section_id = (
        str(section_id)
        .strip()
        .upper()
    )

    if "-" not in section_id:
        return section_id

    parts = section_id.split("-")

    if len(parts) != 2:
        return section_id

    return "-".join(
        sorted(parts)
    )


def _parse_iso_datetime(
    value,
):
    """
    Parse RailRadar ISO timestamp.

    Returns timezone-aware IST datetime.
    """

    if not value:
        return None

    try:

        text = str(value)

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

        return dt.astimezone(
            IST
        )

    except Exception:

        return None


def _format_time(
    value,
):
    """
    Convert ISO datetime into HH:MM.
    """

    dt = _parse_iso_datetime(
        value
    )

    if not dt:
        return "--"

    return dt.strftime(
        "%H:%M"
    )


def _minutes_from_now(
    value,
    now=None,
):
    """
    Return minutes from now to an ISO timestamp.
    """

    dt = _parse_iso_datetime(
        value
    )

    if not dt:
        return None

    if now is None:
        now = datetime.now(
            IST
        )

    return round(
        (
            dt - now
        ).total_seconds()
        / 60,
        1,
    )


# ============================================================
# SIGNAL ASPECT
# ============================================================

def _signal_aspect(
    section_id: str,
    hour: int,
) -> str:
    """
    Reuse traffic level as signal-aspect proxy.

    LOW        -> green
    MEDIUM     -> yellow
    HIGH       -> red
    VERY_HIGH  -> red

    This is a derived traffic value.
    """

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
        AttributeError,
    ):

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
# RAILRADAR HELPERS
# ============================================================

def _railradar_headers():
    """
    Authorization headers for RailRadar.
    """

    return {
        "Authorization": (
            f"Bearer {RAILRADAR_API_KEY}"
        ),
        "Accept": "application/json",
    }


def _railradar_error_detail(
    response,
):
    """
    Extract useful RailRadar error text.
    """

    try:

        payload = response.json()

        error = payload.get(
            "error"
        )

        if isinstance(
            error,
            dict,
        ):

            return (
                error.get(
                    "message"
                )
                or str(error)
            )

        if error:
            return str(error)

    except Exception:

        pass

    return (
        f"RailRadar returned HTTP "
        f"{response.status_code}"
    )


# ============================================================
# RAILRADAR — LIVE STATION BOARD
# ============================================================

def _railradar_station_live(
    station_code: str,
):
    """
    Fetch live station board.

    RailRadar endpoint:

        GET /v1/stations/{code}/live

    includeIntermediate=true is important because
    trains passing through the station should also be
    considered.
    """

    if not RAILRADAR_API_KEY:

        raise RuntimeError(
            "RAILRADAR_API_KEY is not configured"
        )

    url = (
        f"{RAILRADAR_BASE}"
        f"/stations/{station_code}/live"
    )

    params = {
        "hours": 4,
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

        raise RuntimeError(
            f"Could not reach RailRadar: {exc}"
        )

    if not response.ok:

        raise RuntimeError(
            _railradar_error_detail(
                response
            )
        )

    try:

        payload = response.json()

    except ValueError:

        raise RuntimeError(
            "RailRadar returned invalid JSON"
        )

    if not payload.get(
        "success",
        False,
    ):

        error = payload.get(
            "error"
        )

        if isinstance(
            error,
            dict,
        ):

            error = error.get(
                "message"
            )

        raise RuntimeError(
            error
            or "RailRadar station API failed"
        )

    return payload


# ============================================================
# RAILRADAR — LIVE TRAIN
# ============================================================

def _railradar_train_live(
    train_number: str,
):
    """
    Fetch authoritative live train status.

    RailRadar endpoint:

        GET /v1/trains/{number}/live

    authoritative=true forces an upstream
    live telemetry fetch.
    """

    if not RAILRADAR_API_KEY:

        raise RuntimeError(
            "RAILRADAR_API_KEY is not configured"
        )

    train_number = str(
        train_number
    ).strip()

    now = time.monotonic()

    # --------------------------------------------------------
    # Short cache.
    # --------------------------------------------------------

    cached = _live_train_cache.get(
        train_number
    )

    if cached:

        cached_time, cached_data = cached

        if (
            now - cached_time
            < LIVE_CACHE_TTL_SECONDS
        ):

            return cached_data

    # --------------------------------------------------------
    # RailRadar request.
    # --------------------------------------------------------

    url = (
        f"{RAILRADAR_BASE}"
        f"/trains/{train_number}/live"
    )

    params = {
        "authoritative": "true",
        "haltsOnly": "false",
        "geometry": "false",
    }

    try:

        response = requests.get(
            url,
            headers=_railradar_headers(),
            params=params,
            timeout=10,
        )

    except requests.RequestException as exc:

        print(
            f"[RailRadar] train {train_number} "
            f"request failed: {exc}",
            flush=True,
        )

        return None

    # --------------------------------------------------------
    # 404
    # --------------------------------------------------------

    if response.status_code == 404:

        print(
            f"[RailRadar] train {train_number} "
            f"not found",
            flush=True,
        )

        return None

    # --------------------------------------------------------
    # 429
    # --------------------------------------------------------

    if response.status_code == 429:

        print(
            "[RailRadar] API quota/rate limit "
            "reached",
            flush=True,
        )

        return None

    # --------------------------------------------------------
    # Other HTTP errors.
    # --------------------------------------------------------

    if not response.ok:

        print(
            f"[RailRadar] train {train_number} "
            f"HTTP {response.status_code}: "
            f"{_railradar_error_detail(response)}",
            flush=True,
        )

        return None

    # --------------------------------------------------------
    # JSON.
    # --------------------------------------------------------

    try:

        payload = response.json()

    except ValueError:

        print(
            f"[RailRadar] train {train_number} "
            f"returned invalid JSON",
            flush=True,
        )

        return None

    if not payload.get(
        "success",
        False,
    ):

        return None

    data = payload.get(
        "data"
    )

    if not isinstance(
        data,
        dict,
    ):

        return None

    # --------------------------------------------------------
    # Cache.
    # --------------------------------------------------------

    _live_train_cache[
        train_number
    ] = (
        now,
        data,
    )

    return data


# ============================================================
# ROUTE HELPERS
# ============================================================

def _find_route_stop(
    route,
    station_code,
):
    """
    Find a station inside RailRadar live route.
    """

    if not isinstance(
        route,
        list,
    ):
        return None

    station_code = str(
        station_code
    ).upper()

    for stop in route:

        if not isinstance(
            stop,
            dict,
        ):
            continue

        code = str(
            stop.get(
                "stationCode"
            )
            or stop.get(
                "code"
            )
            or ""
        ).upper()

        if code == station_code:

            return stop

    return None


def _route_contains_section(
    route,
    from_code,
    to_code,
):
    """
    Check whether the RailRadar route actually
    contains FROM -> TO in that order.

    This prevents unrelated trains from appearing
    in the section.
    """

    if not isinstance(
        route,
        list,
    ):
        return False

    from_sequence = None
    to_sequence = None

    for stop in route:

        if not isinstance(
            stop,
            dict,
        ):
            continue

        code = str(
            stop.get(
                "stationCode"
            )
            or stop.get(
                "code"
            )
            or ""
        ).upper()

        sequence = stop.get(
            "sequence"
        )

        if code == from_code:

            from_sequence = sequence

        if code == to_code:

            to_sequence = sequence

    if (
        from_sequence is None
        or to_sequence is None
    ):
        return False

    try:

        return (
            float(from_sequence)
            < float(to_sequence)
        )

    except Exception:

        return False


# ============================================================
# CURRENTLY ACTIVE TRAINS — SCHEDULE PROJECTION
# ============================================================

@router.get(
    "/section/{section_id}/projection"
)
def section_projection(
    section_id: str,
    user=Depends(get_current_user),
):
    """
    Schedule-projected trains currently inside section.

    This endpoint intentionally remains timetable-based.

    NOT GPS-confirmed.
    """

    now = datetime.now(
        IST
    )

    now_min = (
        now.hour * 60
        + now.minute
        + now.second / 60
    )

    canonical = (
        _canonical_section_id(
            section_id
        )
    )

    hops = _section_hops.get(
        canonical,
        []
    )

    parts = canonical.split("-")

    if len(parts) == 2:

        canon_a = parts[0]
        canon_b = parts[1]

    else:

        canon_a = canonical
        canon_b = canonical

    active = []

    for hop in hops:

        dep_min = (
            _time_str_to_minutes(
                hop["dep_time"]
            )
        )

        arr_min = (
            _time_str_to_minutes(
                hop["arr_time"]
            )
        )

        if (
            dep_min is None
            or arr_min is None
        ):
            continue

        if arr_min <= dep_min:

            arr_min += (
                24 * 60
            )

        for offset in (
            0,
            -24 * 60,
            24 * 60,
        ):

            t = (
                now_min
                + offset
            )

            if (
                dep_min
                <= t
                <= arr_min
            ):

                duration = max(
                    arr_min
                    - dep_min,
                    0.1,
                )

                raw_fraction = (
                    (
                        t
                        - dep_min
                    )
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
                    1
                    - raw_fraction
                )

                eta_min = round(
                    arr_min - t,
                    1,
                )

                active.append(
                    {
                        "train_no":
                            hop["train_no"],

                        "train_name":
                            hop["train_name"],

                        "from_station":
                            hop["from_name"],

                        "to_station":
                            hop["to_name"],

                        "direction":
                            (
                                "forward"
                                if forward
                                else "reverse"
                            ),

                        "progress":
                            round(
                                max(
                                    0.0,
                                    min(
                                        1.0,
                                        progress,
                                    ),
                                ),
                                3,
                            ),

                        "eta_minutes":
                            eta_min,

                        "source":
                            "schedule",
                    }
                )

                break

    return {
        "success": True,

        "section_id":
            canonical,

        "as_of":
            now.isoformat(),

        "signal_aspect":
            _signal_aspect(
                canonical,
                now.hour,
            ),

        "active_trains":
            active,

        "source":
            "schedule",

        "note": (
            "Schedule-projected from real "
            "timetable data against current "
            "India time. Not GPS-confirmed."
        ),
    }


# ============================================================
# UPCOMING TRAINS — REAL RAILRADAR LIVE DATA
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
    REAL RailRadar live section monitoring.

    Flow:

        RailRadar live station board
                ↓
        Candidate trains at FROM station
                ↓
        RailRadar live train status
                ↓
        Check FROM -> TO route
                ↓
        Extract actual/live timing
                ↓
        Calculate ETA

    The local timetable is NOT the primary source
    for this endpoint.
    """

    # --------------------------------------------------------
    # API key.
    # --------------------------------------------------------

    if not RAILRADAR_API_KEY:

        raise HTTPException(
            status_code=503,
            detail=(
                "RAILRADAR_API_KEY is not configured "
                "on the server."
            ),
        )

    # --------------------------------------------------------
    # Hours.
    # --------------------------------------------------------

    try:

        hours = int(
            hours
        )

    except Exception:

        hours = 3

    hours = max(
        1,
        min(
            hours,
            3,
        ),
    )

    # --------------------------------------------------------
    # Section.
    # --------------------------------------------------------

    canonical = (
        _canonical_section_id(
            section_id
        )
    )

    parts = canonical.split(
        "-"
    )

    if len(parts) != 2:

        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid section ID. "
                "Expected FROM-TO, e.g. GZB-NDLS."
            ),
        )

    from_code = parts[0]
    to_code = parts[1]

    # --------------------------------------------------------
    # Current IST time.
    # --------------------------------------------------------

    now = datetime.now(
        IST
    )

    window_end = (
        now
        + timedelta(
            hours=hours
        )
    )

    print(
        f"[RailRadar] LIVE section "
        f"{from_code}->{to_code} "
        f"now={now.isoformat()} "
        f"window={hours}h",
        flush=True,
    )

    # --------------------------------------------------------
    # STEP 1
    #
    # Get live station board at FROM station.
    #
    # We request 4 hours because RailRadar allows
    # station-live windows of 2/4/6/8 hours.
    #
    # We then filter locally to requested 1-3 hours.
    # --------------------------------------------------------

    try:

        station_payload = (
            _railradar_station_live(
                from_code
            )
        )

    except RuntimeError as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )

    station_data = (
        station_payload.get(
            "data"
        )
        or {}
    )

    raw_trains = (
        station_data.get(
            "trains"
        )
        or []
    )

    print(
        f"[RailRadar] {from_code} "
        f"station board returned "
        f"{len(raw_trains)} trains",
        flush=True,
    )

    # --------------------------------------------------------
    # STEP 2
    #
    # Process candidate trains.
    # --------------------------------------------------------

    results = []

    seen_train_numbers = set()

    for item in raw_trains:

        if not isinstance(
            item,
            dict,
        ):
            continue

        train_info = (
            item.get(
                "train"
            )
            or {}
        )

        board_stop = (
            item.get(
                "stop"
            )
            or {}
        )

        board_live = (
            item.get(
                "live"
            )
            or {}
        )

        train_number = str(
            train_info.get(
                "number"
            )
            or ""
        ).strip()

        if not train_number:

            continue

        # Avoid duplicates.
        if train_number in seen_train_numbers:

            continue

        seen_train_numbers.add(
            train_number
        )

        train_name = (
            train_info.get(
                "name"
            )
            or "Unknown Train"
        )

        # ----------------------------------------------------
        # STEP 3
        #
        # Get actual live train details.
        # ----------------------------------------------------

        live_data = (
            _railradar_train_live(
                train_number
            )
        )

        if not live_data:

            # If the individual live call fails,
            # do NOT pretend timetable data is live.
            #
            # Use only the live station-board record
            # if it contains enough information.

            expected_departure = (
                board_live.get(
                    "expectedDepartureTime"
                )
            )

            minutes_until_departure = (
                _minutes_from_now(
                    expected_departure,
                    now,
                )
            )

            if (
                minutes_until_departure
                is None
            ):

                continue

            if not (
                0
                <= minutes_until_departure
                <= hours * 60
            ):

                continue

            results.append(
                {
                    "train_no":
                        train_number,

                    "train_name":
                        train_name,

                    "from_code":
                        from_code,

                    "to_code":
                        to_code,

                    "from_station":
                        (
                            station_data
                            .get("station", {})
                            .get("name")
                            or from_code
                        ),

                    "to_station":
                        to_code,

                    "direction":
                        "FORWARD",

                    "departure_time":
                        _format_time(
                            expected_departure
                        ),

                    "arrival_time":
                        "--",

                    "scheduled_departure":
                        board_stop.get(
                            "departure"
                        ),

                    "scheduled_arrival":
                        None,

                    "minutes_until_departure":
                        minutes_until_departure,

                    "minutes_until_arrival":
                        None,

                    "eta_minutes":
                        None,

                    "delay_minutes":
                        board_live.get(
                            "delayMinutes"
                        ),

                    "status":
                        (
                            board_live.get(
                                "type"
                            )
                            or "LIVE"
                        ),

                    "platform":
                        board_live.get(
                            "platform"
                        ),

                    "speed_kmh":
                        None,

                    "current_location":
                        None,

                    "last_updated_at":
                        None,

                    "source":
                        "RailRadar LIVE",

                    "is_live":
                        True,
                }
            )

            continue

        # ----------------------------------------------------
        # STEP 4
        #
        # Confirm train actually follows:
        #
        # FROM -> TO
        #
        # This is important because the station board
        # can contain trains going in many directions.
        # ----------------------------------------------------

        route = (
            live_data.get(
                "route"
            )
            or []
        )

        if not _route_contains_section(
            route,
            from_code,
            to_code,
        ):

            continue

        # ----------------------------------------------------
        # Locate FROM and TO stops.
        # ----------------------------------------------------

        from_stop = _find_route_stop(
            route,
            from_code,
        )

        to_stop = _find_route_stop(
            route,
            to_code,
        )

        if not from_stop:

            continue

        if not to_stop:

            continue

        # ----------------------------------------------------
        # Current live status.
        # ----------------------------------------------------

        status = (
            live_data.get(
                "status"
            )
            or "unknown"
        )

        delay_minutes = (
            live_data.get(
                "delayMinutes"
            )
        )

        # Make delay numeric where possible.
        try:

            if delay_minutes is not None:

                delay_minutes = int(
                    delay_minutes
                )

        except Exception:

            delay_minutes = 0

        # ----------------------------------------------------
        # Live expected departure.
        #
        # RailRadar station board provides
        # expectedDepartureTime.
        #
        # Individual live route provides scheduled
        # and actual timestamps.
        # ----------------------------------------------------

        expected_departure = (
            board_live.get(
                "expectedDepartureTime"
            )
        )

        if not expected_departure:

            expected_departure = (
                from_stop.get(
                    "actualDeparture"
                )
                or from_stop.get(
                    "scheduledDeparture"
                )
            )

        # ----------------------------------------------------
        # Arrival at TO.
        #
        # Prefer actual arrival if already arrived.
        # Otherwise calculate expected arrival from
        # scheduled arrival + current train delay.
        # ----------------------------------------------------

        actual_arrival = (
            to_stop.get(
                "actualArrival"
            )
        )

        scheduled_arrival = (
            to_stop.get(
                "scheduledArrival"
            )
        )

        if actual_arrival:

            expected_arrival = (
                actual_arrival
            )

        elif scheduled_arrival:

            arrival_dt = (
                _parse_iso_datetime(
                    scheduled_arrival
                )
            )

            if arrival_dt:

                expected_arrival = (
                    (
                        arrival_dt
                        + timedelta(
                            minutes=(
                                delay_minutes
                                or 0
                            )
                        )
                    )
                    .isoformat()
                )

            else:

                expected_arrival = (
                    scheduled_arrival
                )

        else:

            expected_arrival = None

        # ----------------------------------------------------
        # Calculate minutes.
        # ----------------------------------------------------

        minutes_until_departure = (
            _minutes_from_now(
                expected_departure,
                now,
            )
        )

        minutes_until_arrival = (
            _minutes_from_now(
                expected_arrival,
                now,
            )
        )

        # ----------------------------------------------------
        # If train has already passed FROM and is currently
        # travelling towards TO, keep it in the live view
        # only when it is still inside the section.
        # ----------------------------------------------------

        current_location = (
            live_data.get(
                "currentLocation"
            )
            or {}
        )

        current_sequence = (
            current_location.get(
                "sequence"
            )
        )

        from_sequence = (
            from_stop.get(
                "sequence"
            )
        )

        to_sequence = (
            to_stop.get(
                "sequence"
            )
        )

        is_inside_section = False

        try:

            if (
                current_sequence
                is not None
                and from_sequence
                is not None
                and to_sequence
                is not None
            ):

                is_inside_section = (
                    float(
                        from_sequence
                    )
                    <= float(
                        current_sequence
                    )
                    <= float(
                        to_sequence
                    )
                )

        except Exception:

            is_inside_section = False

        # ----------------------------------------------------
        # Future window filter.
        #
        # If train has not entered section yet:
        # use departure.
        #
        # If already inside:
        # keep it because it is REAL LIVE traffic.
        # ----------------------------------------------------

        if not is_inside_section:

            if (
                minutes_until_departure
                is None
            ):

                continue

            if not (
                0
                <= minutes_until_departure
                <= hours * 60
            ):

                continue

        # ----------------------------------------------------
        # Platform.
        # ----------------------------------------------------

        platform = (
            from_stop.get(
                "platform"
            )
            or board_live.get(
                "platform"
            )
        )

        # ----------------------------------------------------
        # Current speed.
        # ----------------------------------------------------

        speed_kmh = (
            current_location.get(
                "speedKmh"
            )
        )

        # ----------------------------------------------------
        # Current station/location.
        # ----------------------------------------------------

        current_station_code = (
            current_location.get(
                "stationCode"
            )
        )

        current_status = (
            current_location.get(
                "status"
            )
        )

        # ----------------------------------------------------
        # Final result.
        # ----------------------------------------------------

        results.append(
            {
                "train_no":
                    train_number,

                "train_name":
                    (
                        live_data.get(
                            "trainName"
                        )
                        or train_name
                    ),

                "from_code":
                    from_code,

                "to_code":
                    to_code,

                "from_station":
                    (
                        from_stop.get(
                            "stationName"
                        )
                        or from_code
                    ),

                "to_station":
                    (
                        to_stop.get(
                            "stationName"
                        )
                        or to_code
                    ),

                "direction":
                    "FORWARD",

                # ------------------------------------------------
                # Real / expected times
                # ------------------------------------------------

                "departure_time":
                    _format_time(
                        expected_departure
                    ),

                "arrival_time":
                    _format_time(
                        expected_arrival
                    ),

                "scheduled_departure":
                    from_stop.get(
                        "scheduledDeparture"
                    ),

                "scheduled_arrival":
                    scheduled_arrival,

                # ------------------------------------------------
                # ETA
                # ------------------------------------------------

                "minutes_until_departure":
                    minutes_until_departure,

                "minutes_until_arrival":
                    minutes_until_arrival,

                "eta_minutes":
                    (
                        minutes_until_arrival
                    ),

                # ------------------------------------------------
                # Live status
                # ------------------------------------------------

                "status":
                    status,

                "live_status":
                    current_status,

                "delay_minutes":
                    delay_minutes,

                # ------------------------------------------------
                # Railway information
                # ------------------------------------------------

                "platform":
                    platform,

                "speed_kmh":
                    speed_kmh,

                "current_location":
                    {
                        "station_code":
                            current_station_code,

                        "status":
                            current_status,

                        "segment_progress":
                            current_location.get(
                                "segmentProgress"
                            ),

                        "bearing_degrees":
                            current_location.get(
                                "bearingDegrees"
                            ),

                        "is_actual_position":
                            current_location.get(
                                "isActualPosition"
                            ),
                    },

                "last_updated_at":
                    live_data.get(
                        "lastUpdatedAt"
                    ),

                # ------------------------------------------------
                # Source
                # ------------------------------------------------

                "source":
                    "RailRadar LIVE",

                "is_live":
                    bool(
                        live_data.get(
                            "isLive",
                            True,
                        )
                    ),
            }
        )

    # --------------------------------------------------------
    # Sort.
    #
    # Live trains currently inside section first,
    # then upcoming trains.
    # --------------------------------------------------------

    results.sort(
        key=lambda train: (
            train.get(
                "minutes_until_departure"
            )
            if train.get(
                "minutes_until_departure"
            ) is not None
            else 999999
        )
    )

    print(
        f"[RailRadar] LIVE "
        f"{from_code}->{to_code}: "
        f"{len(results)} trains",
        flush=True,
    )

    # --------------------------------------------------------
    # Response.
    # --------------------------------------------------------

    return {
        "success": True,

        "section_id":
            canonical,

        "as_of":
            now.isoformat(),

        "window_hours":
            hours,

        "window_minutes":
            hours * 60,

        "trains":
            results,

        "count":
            len(results),

        "source":
            "RailRadar LIVE",

        "live":
            True,

        "last_updated_at":
            now.isoformat(),

        "note": (
            "Live train movement fetched from "
            "RailRadar. RailRadar is a third-party "
            "data provider and is not an official "
            "Indian Railways feed."
        ),
    }


# ============================================================
# OPTIONAL SINGLE TRAIN RAILRADAR GPS LOOKUP
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

    Requires:
        RAILRADAR_API_KEY

    Uses:
        authoritative=true

    This endpoint returns the raw RailRadar live
    train information with source disclosure.
    """

    # --------------------------------------------------------
    # API key.
    # --------------------------------------------------------

    if not RAILRADAR_API_KEY:

        raise HTTPException(
            status_code=503,
            detail=(
                "Live GPS tracking is not configured "
                "on this server. Set RAILRADAR_API_KEY "
                "to enable RailRadar tracking."
            ),
        )

    # --------------------------------------------------------
    # Request RailRadar.
    # --------------------------------------------------------

    url = (
        f"{RAILRADAR_BASE}"
        f"/trains/{train_number}/live"
    )

    params = {
        "authoritative": "true",
        "haltsOnly": "false",
        "geometry": "false",
    }

    try:

        resp = requests.get(
            url,
            headers=_railradar_headers(),
            params=params,
            timeout=10,
        )

    except requests.RequestException as exc:

        raise HTTPException(
            status_code=502,
            detail=(
                f"Could not reach RailRadar: "
                f"{exc}"
            ),
        )

    # --------------------------------------------------------
    # Response handling.
    # --------------------------------------------------------

    if resp.status_code == 404:

        raise HTTPException(
            status_code=404,
            detail=(
                f"Train '{train_number}' "
                f"not found or not currently "
                f"available from RailRadar."
            ),
        )

    if resp.status_code == 401:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar rejected the API key. "
                "Check RAILRADAR_API_KEY on Render."
            ),
        )

    if resp.status_code == 429:

        raise HTTPException(
            status_code=429,
            detail=(
                "RailRadar API quota/rate limit "
                "has been reached."
            ),
        )

    if resp.status_code == 503:

        raise HTTPException(
            status_code=503,
            detail=(
                "RailRadar upstream live telemetry "
                "is temporarily unavailable."
            ),
        )

    if not resp.ok:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar returned an error "
                f"(HTTP {resp.status_code})."
            ),
        )

    # --------------------------------------------------------
    # Parse JSON.
    # --------------------------------------------------------

    try:

        data = resp.json()

    except ValueError:

        raise HTTPException(
            status_code=502,
            detail=(
                "RailRadar returned invalid JSON."
            ),
        )

    # --------------------------------------------------------
    # RailRadar failure envelope.
    # --------------------------------------------------------

    if isinstance(
        data,
        dict,
    ):

        if data.get(
            "success"
        ) is False:

            error = data.get(
                "error"
            )

            if isinstance(
                error,
                dict,
            ):

                error = error.get(
                    "message"
                )

            raise HTTPException(
                status_code=502,
                detail=(
                    error
                    or "RailRadar request failed."
                ),
            )

        # ----------------------------------------------------
        # Source disclosure.
        # ----------------------------------------------------

        data["source"] = (
            "railradar"
        )

        data["disclosure"] = (
            "Third-party live data via RailRadar, "
            "not an official Indian Railways feed."
        )

    return data