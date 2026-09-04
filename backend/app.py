"""
RailVinyas AI
============================================================

AI-powered railway maintenance block planning and optimization
backend using FastAPI.

Repository structure
--------------------

Block_debugger/
│
├── backend/
│   ├── __init__.py
│   ├── app.py
│   ├── auth.py
│   └── railvinyas.db
│
├── data/
│   ├── real/
│   │   ├── 01_stations_master.csv
│   │   └── 02_train_timetable.csv
│   │
│   ├── derived/
│   │   └── 03_section_traffic_derived.csv
│   │
│   └── synthetic/
│       ├── 04_asset_register.csv
│       ├── 05_maintenance_blocks.csv
│       └── 06_daily_asset_availability.csv
│
├── training/
│   ├── 07_model_training_table.csv
│   └── 08_evaluation_results.csv
│
├── models/
│   ├── overrun_model.joblib
│   └── model_feature_columns.joblib
│
├── railvinyas-frontend/
│   ├── src/
│   ├── package.json
│   └── dist/
│
└── requirements.txt


Local development
-----------------

Run from Block_debugger/:

    python -m uvicorn backend.app:app --reload --port 8000


Render
------

    python -m uvicorn backend.app:app --host 0.0.0.0 --port $PORT
"""

# ============================================================
# STANDARD LIBRARY
# ============================================================

from pathlib import Path
from typing import Optional


# ============================================================
# THIRD-PARTY LIBRARIES
# ============================================================

import joblib
import pandas as pd

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator


# ============================================================
# LOCAL APPLICATION
# ============================================================

from backend.auth import (
    get_current_user,
    get_db,
    init_db,
    require_role,
    router as auth_router,
)


# ============================================================
# APPLICATION CONFIGURATION
# ============================================================

APP_NAME = "RailVinyas AI"
APP_VERSION = "1.0.0"


app = FastAPI(
    title=f"{APP_NAME} API",
    description=(
        "AI-assisted railway maintenance block planning, "
        "traffic analysis, asset management, prediction, "
        "and optimization system."
    ),
    version=APP_VERSION,
)


# ============================================================
# DATABASE / AUTH INITIALIZATION
# ============================================================

# Initialize authentication tables.
init_db()

# Mount authentication routes:
#
# POST /api/auth/register
# POST /api/auth/login
# POST /api/auth/verify-otp
# GET  /api/auth/me
#
app.include_router(auth_router)


# ============================================================
# CORS
# ============================================================

# Authorization is sent using the HTTP Authorization header,
# so cookies are not required by the current architecture.
#
# This broad configuration is convenient during development
# and initial deployment.
#
# Once your public frontend URL is finalized, you can restrict
# allow_origins to that domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# PATH CONFIGURATION
# ============================================================

# app.py:
#
# Block_debugger/backend/app.py
#
# parent       -> backend/
# parent.parent -> Block_debugger/
#
BASE_DIR = Path(__file__).resolve().parent.parent


DATA_DIR = BASE_DIR / "data"

DATA_REAL = DATA_DIR / "real"
DATA_DERIVED = DATA_DIR / "derived"
DATA_SYNTHETIC = DATA_DIR / "synthetic"

TRAINING_DIR = BASE_DIR / "training"

MODELS_DIR = BASE_DIR / "models"

FRONTEND_DIST = (
    BASE_DIR
    / "railvinyas-frontend"
    / "dist"
)


# ============================================================
# REQUIRED FILES
# ============================================================

REQUIRED_FILES = [
    DATA_DERIVED / "03_section_traffic_derived.csv",
    DATA_SYNTHETIC / "04_asset_register.csv",
    DATA_SYNTHETIC / "05_maintenance_blocks.csv",
    DATA_SYNTHETIC / "06_daily_asset_availability.csv",
    TRAINING_DIR / "07_model_training_table.csv",
    MODELS_DIR / "overrun_model.joblib",
    MODELS_DIR / "model_feature_columns.joblib",
    DATA_REAL / "01_stations_master.csv",
]


def validate_required_files():
    """
    Confirm that all files required by the backend exist.
    This gives a clear startup error instead of a confusing
    FileNotFoundError later.
    """

    missing = [
        str(path)
        for path in REQUIRED_FILES
        if not path.exists()
    ]

    if missing:
        raise RuntimeError(
            "RailVinyas startup failed. Missing required files:\n"
            + "\n".join(f"- {item}" for item in missing)
        )


validate_required_files()


# ============================================================
# DATA LOADING
# ============================================================

traffic = pd.read_csv(
    DATA_DERIVED / "03_section_traffic_derived.csv"
)

assets = pd.read_csv(
    DATA_SYNTHETIC / "04_asset_register.csv"
)

blocks_full = pd.read_csv(
    DATA_SYNTHETIC / "05_maintenance_blocks.csv",
    parse_dates=["date"],
)

avail = pd.read_csv(
    DATA_SYNTHETIC / "06_daily_asset_availability.csv",
    parse_dates=["date"],
)

train_table = pd.read_csv(
    TRAINING_DIR / "07_model_training_table.csv",
    parse_dates=["date"],
)

stations_master = pd.read_csv(
    DATA_REAL / "01_stations_master.csv"
)


# ============================================================
# MODEL LOADING
# ============================================================

model = joblib.load(
    MODELS_DIR / "overrun_model.joblib"
)

feature_columns = joblib.load(
    MODELS_DIR / "model_feature_columns.joblib"
)


# ============================================================
# BASIC DATA VALIDATION
# ============================================================

required_traffic_columns = {
    "section_id",
    "hour_of_day",
    "trains_count",
    "traffic_level",
}

required_asset_columns = {
    "asset_id",
    "asset_type",
    "home_section_id",
    "status",
}

required_availability_columns = {
    "date",
    "asset_id",
    "available",
}

required_training_columns = {
    "section_id",
    "date",
    "section_historical_overrun_rate",
    "overrun_flag",
}

required_station_columns = {
    "station_code",
    "station_name",
}


def ensure_columns(
    dataframe: pd.DataFrame,
    required: set,
    dataset_name: str,
):
    missing = required - set(dataframe.columns)

    if missing:
        raise RuntimeError(
            f"{dataset_name} is missing columns: "
            f"{sorted(missing)}"
        )


ensure_columns(
    traffic,
    required_traffic_columns,
    "Section traffic dataset",
)

ensure_columns(
    assets,
    required_asset_columns,
    "Asset register",
)

ensure_columns(
    avail,
    required_availability_columns,
    "Asset availability dataset",
)

ensure_columns(
    train_table,
    required_training_columns,
    "Training dataset",
)

ensure_columns(
    stations_master,
    required_station_columns,
    "Station dataset",
)


# ============================================================
# STATION LOOKUP
# ============================================================

station_name_lookup = (
    stations_master
    .set_index("station_code")["station_name"]
    .to_dict()
)


# ============================================================
# EVALUATION RESULTS
# ============================================================

try:

    eval_results = pd.read_csv(
        TRAINING_DIR / "08_evaluation_results.csv"
    )

except FileNotFoundError:

    eval_results = None


AVG_DISRUPTION_REDUCTION: Optional[float] = None


if eval_results is not None:

    required_eval_columns = {
        "optimizer_score",
        "as_scheduled_score",
    }

    if required_eval_columns.issubset(
        eval_results.columns
    ):

        baseline = (
            eval_results["as_scheduled_score"]
            .sum()
        )

        optimized = (
            eval_results["optimizer_score"]
            .sum()
        )

        if baseline != 0:

            AVG_DISRUPTION_REDUCTION = round(
                100 * (1 - optimized / baseline),
                1,
            )


# ============================================================
# PRECOMPUTED TRAFFIC LOOKUP
# ============================================================

# Group first so duplicate section/hour records don't cause
# .loc() to return multiple rows.
traffic_hourly = (
    traffic
    .groupby(
        ["section_id", "hour_of_day"],
        as_index=False,
    )
    .agg(
        trains_count=("trains_count", "sum"),
        traffic_level=("traffic_level", "first"),
    )
)


traffic_idx = traffic_hourly.set_index(
    ["section_id", "hour_of_day"]
)[
    ["trains_count", "traffic_level"]
]


# ============================================================
# PRECOMPUTED ASSET LOOKUPS
# ============================================================

assets_count_idx = (
    assets
    .groupby(
        ["home_section_id", "asset_type"]
    )
    .size()
)


# ============================================================
# HISTORICAL OVERRUN LOOKUP
# ============================================================

latest_section_rate = (
    train_table
    .sort_values("date")
    .groupby("section_id")[
        "section_historical_overrun_rate"
    ]
    .last()
)


global_fallback_rate = (
    float(
        train_table["overrun_flag"].mean()
    )
    if not train_table.empty
    else 0.0
)


# ============================================================
# ASSET AVAILABILITY LOOKUP
# ============================================================

avail_with_type = avail.merge(
    assets[
        ["asset_id", "asset_type"]
    ],
    on="asset_id",
    how="left",
)


overall_type_avail = (
    avail_with_type
    .groupby("asset_type")["available"]
    .apply(
        lambda series:
        (series == "YES").mean()
    )
)


# ============================================================
# MODEL FEATURES
# ============================================================

CATEGORICAL = [
    "day_of_week",
    "maintenance_type",
    "required_asset_type",
    "priority",
    "weather",
    "traffic_level",
]


# ============================================================
# REQUEST SCHEMAS
# ============================================================

class BlockRequest(BaseModel):
    section_id: str = Field(
        min_length=1,
        max_length=100,
    )

    maintenance_type: str = Field(
        min_length=1,
        max_length=100,
    )

    required_asset_type: str = Field(
        min_length=1,
        max_length=100,
    )

    priority: str = Field(
        min_length=1,
        max_length=50,
    )

    weather: str = Field(
        min_length=1,
        max_length=50,
    )

    planned_duration_min: float = Field(
        gt=0,
        le=1440,
    )

    date: str

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str):

        try:
            pd.Timestamp(value)

        except Exception:

            raise ValueError(
                "date must be a valid date such as YYYY-MM-DD"
            )

        return value


class AssetStatusUpdate(BaseModel):
    status: str


class RoleUpdate(BaseModel):
    role: str


class ApproveRequest(BaseModel):
    log_id: int = Field(gt=0)


# ============================================================
# STATION / SECTION HELPERS
# ============================================================

def section_to_stations(section_id: str):
    """
    Convert:
        AAA-BBB

    into:
        station codes + station names.
    """

    parts = section_id.split("-")

    if len(parts) != 2:

        first = parts[0]
        last = parts[-1]

        return (
            first,
            last,
            station_name_lookup.get(first, first),
            station_name_lookup.get(last, last),
        )

    first, second = parts

    return (
        first,
        second,
        station_name_lookup.get(first, first),
        station_name_lookup.get(second, second),
    )


# ============================================================
# HOURLY SCORING FUNCTION
# ============================================================

def score_hour(
    section_id: str,
    hour: int,
    maintenance_type: str,
    required_asset_type: str,
    priority: str,
    weather: str,
    planned_duration_min: float,
    date: str,
):
    """
    Evaluate one candidate maintenance start hour.

    Pipeline:

        traffic
           ↓
        asset availability
           ↓
        historical overrun
           ↓
        ML prediction
           ↓
        expected duration
           ↓
        disruption score
    """

    # --------------------------------------------------------
    # Traffic
    # --------------------------------------------------------

    try:

        trains_count, traffic_level = (
            traffic_idx.loc[
                (section_id, hour)
            ]
        )

    except KeyError:

        trains_count = 0.0
        traffic_level = "LOW"


    # --------------------------------------------------------
    # Number of matching assets in section
    # --------------------------------------------------------

    assets_here = assets_count_idx.get(
        (section_id, required_asset_type),
        0,
    )


    # --------------------------------------------------------
    # Daily asset availability
    # --------------------------------------------------------

    target_date = pd.Timestamp(date)

    day_records = avail_with_type[
        (
            avail_with_type["date"]
            == target_date
        )
        &
        (
            avail_with_type["asset_type"]
            == required_asset_type
        )
    ]


    if not day_records.empty:

        avail_pct = (
            day_records["available"]
            == "YES"
        ).mean()

        had_record = 1

    else:

        avail_pct = overall_type_avail.get(
            required_asset_type,
            0.7,
        )

        had_record = 0


    # --------------------------------------------------------
    # Historical overrun rate
    # --------------------------------------------------------

    section_rate = latest_section_rate.get(
        section_id,
        global_fallback_rate,
    )


    # --------------------------------------------------------
    # Date features
    # --------------------------------------------------------

    d = target_date

    day_name = d.day_name()

    is_weekend = int(
        day_name in [
            "Saturday",
            "Sunday",
        ]
    )


    # --------------------------------------------------------
    # Create ML feature row
    # --------------------------------------------------------

    raw = pd.DataFrame(
        [
            {
                "day_of_week": day_name,
                "maintenance_type": maintenance_type,
                "required_asset_type": required_asset_type,
                "priority": priority,
                "weather": weather,
                "traffic_level": traffic_level,
                "month": d.month,
                "is_weekend": is_weekend,
                "start_hour": hour,
                "trains_count": trains_count,
                "assets_of_type_in_section": assets_here,
                "asset_type_availability_pct": avail_pct,
                "had_availability_record": had_record,
                "section_historical_overrun_rate": section_rate,
                "planned_duration_min": planned_duration_min,
            }
        ]
    )


    # --------------------------------------------------------
    # Encode categorical features
    # --------------------------------------------------------

    X_row = (
        pd.get_dummies(
            raw,
            columns=CATEGORICAL,
        )
        .reindex(
            columns=feature_columns,
            fill_value=0,
        )
    )


    # --------------------------------------------------------
    # ML prediction
    # --------------------------------------------------------

    predicted_overrun = float(
        model.predict(X_row)[0]
    )

    predicted_overrun = max(
        predicted_overrun,
        0.0,
    )


    # --------------------------------------------------------
    # Expected duration
    # --------------------------------------------------------

    expected_total_duration = (
        planned_duration_min
        + predicted_overrun
    )


    # --------------------------------------------------------
    # Disruption score
    # --------------------------------------------------------

    trains_count = float(trains_count)

    disruption_score = (
        trains_count
        * expected_total_duration
    )


    return {
        "trains_count": round(
            trains_count,
            1,
        ),

        "traffic_level": str(
            traffic_level
        ),

        "predicted_overrun_min": round(
            predicted_overrun,
            1,
        ),

        "expected_total_duration_min": round(
            expected_total_duration,
            1,
        ),

        "asset_type_availability_pct": round(
            float(avail_pct),
            2,
        ),

        "disruption_score": round(
            float(disruption_score),
            1,
        ),
    }


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get(
    "/api/health",
    tags=["System"],
)
def health():

    return {
        "status": "healthy",
        "service": APP_NAME,
        "version": APP_VERSION,
        "model_loaded": model is not None,
        "traffic_records": int(
            len(traffic)
        ),
        "assets": int(
            len(assets)
        ),
        "stations": int(
            len(stations_master)
        ),
        "frontend_built": FRONTEND_DIST.exists(),
    }


# ============================================================
# SECTION LIST
# ============================================================

@app.get(
    "/api/sections",
    tags=["Railway Sections"],
)
def list_sections(
    user=Depends(get_current_user),
):

    return sorted(
        traffic["section_id"]
        .dropna()
        .unique()
        .tolist()
    )[:1000]


# ============================================================
# RECOMMENDATION API
# ============================================================

@app.post(
    "/api/recommend",
    tags=["AI Recommendation"],
)
def recommend(
    req: BlockRequest,
    user=Depends(get_current_user),
):

    # --------------------------------------------------------
    # Validate section
    # --------------------------------------------------------

    if req.section_id not in set(
        traffic["section_id"]
        .dropna()
        .unique()
    ):

        raise HTTPException(
            status_code=404,
            detail=(
                f"Unknown section_id "
                f"'{req.section_id}'"
            ),
        )


    # --------------------------------------------------------
    # Evaluate all 24 hours
    # --------------------------------------------------------

    candidates = []

    for hour in range(24):

        result = score_hour(
            section_id=req.section_id,
            hour=hour,
            maintenance_type=req.maintenance_type,
            required_asset_type=req.required_asset_type,
            priority=req.priority,
            weather=req.weather,
            planned_duration_min=req.planned_duration_min,
            date=req.date,
        )

        result["start_hour"] = hour

        candidates.append(result)


    # --------------------------------------------------------
    # Rank by disruption
    # --------------------------------------------------------

    ranked = sorted(
        candidates,
        key=lambda item:
        item["disruption_score"],
    )

    best = ranked[0]


    # --------------------------------------------------------
    # Select asset
    # --------------------------------------------------------

    asset_candidates = assets[
        assets["asset_type"]
        == req.required_asset_type
    ].copy()


    selected = None


    if not asset_candidates.empty:

        # Give preference to:
        #
        # 1. Same section
        # 2. Available asset
        # 3. Other statuses
        #
        asset_candidates["home_match"] = (
            asset_candidates[
                "home_section_id"
            ]
            == req.section_id
        ).astype(int)


        status_priority = {
            "Available": 0,
            "In Use": 1,
            "Under Repair": 2,
        }


        asset_candidates["status_priority"] = (
            asset_candidates["status"]
            .map(status_priority)
            .fillna(99)
        )


        asset_candidates = (
            asset_candidates
            .sort_values(
                [
                    "home_match",
                    "status_priority",
                ],
                ascending=[
                    False,
                    True,
                ],
            )
        )


        raw_selected = (
            asset_candidates
            .iloc[0]
            .to_dict()
        )


        selected = {
            key: (
                value.item()
                if hasattr(value, "item")
                else value
            )
            for key, value
            in raw_selected.items()
        }


    # --------------------------------------------------------
    # Save live recommendation
    # --------------------------------------------------------

    log_id = log_recommendation(
        req,
        best,
        selected,
        user,
    )


    # --------------------------------------------------------
    # Final response
    # --------------------------------------------------------

    return {

        "section_id":
            req.section_id,

        "maintenance_type":
            req.maintenance_type,

        "date":
            req.date,

        "recommended_start_hour":
            best["start_hour"],

        "expected_total_duration_min":
            best[
                "expected_total_duration_min"
            ],

        "predicted_overrun_min":
            best[
                "predicted_overrun_min"
            ],

        "traffic_level":
            best["traffic_level"],

        "trains_count":
            best["trains_count"],

        "asset_type_availability_pct":
            best[
                "asset_type_availability_pct"
            ],

        "disruption_score":
            best["disruption_score"],

        "selected_asset":
            selected,

        "top_5_candidates":
            ranked[:5],

        "log_id":
            log_id,
    }


# ============================================================
# DASHBOARD SUMMARY
# ============================================================

@app.get(
    "/api/dashboard/summary",
    tags=["Dashboard"],
)
def dashboard_summary(
    user=Depends(get_current_user),
):

    now = pd.Timestamp.now()

    # Current month.
    current_mask = (
        (blocks_full["date"].dt.year == now.year)
        &
        (blocks_full["date"].dt.month == now.month)
    )

    count = int(
        current_mask.sum()
    )

    reference_month = (
        now.strftime("%B %Y")
    )


    # If current month has no records,
    # use latest month present in dataset.
    if count == 0 and not blocks_full.empty:

        latest_date = (
            blocks_full["date"].max()
        )

        fallback_mask = (
            (
                blocks_full["date"].dt.year
                == latest_date.year
            )
            &
            (
                blocks_full["date"].dt.month
                == latest_date.month
            )
        )

        count = int(
            fallback_mask.sum()
        )

        reference_month = (
            latest_date.strftime("%B %Y")
            +
            " (most recent month in dataset)"
        )


    return {

        "total_sections_monitored":
            int(
                traffic[
                    "section_id"
                ].nunique()
            ),

        "total_assets":
            int(
                len(assets)
            ),

        "total_stations":
            int(
                len(stations_master)
            ),

        "blocks_scheduled_this_month":
            count,

        "blocks_scheduled_reference_month":
            reference_month,

        "avg_disruption_reduction_pct":
            AVG_DISRUPTION_REDUCTION,

        "model_loaded":
            model is not None,
    }


# ============================================================
# RECENT DASHBOARD BLOCKS
# ============================================================

@app.get(
    "/api/dashboard/recent",
    tags=["Dashboard"],
)
def dashboard_recent(
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
    ),
    user=Depends(get_current_user),
):

    recent = (
        blocks_full
        .sort_values(
            "date",
            ascending=False,
        )
        .head(limit)
        .copy()
    )


    now = pd.Timestamp.now()

    rows = []


    for _, row in recent.iterrows():

        (
            _,
            _,
            from_name,
            to_name,
        ) = section_to_stations(
            row["section_id"]
        )


        rows.append(
            {
                "section_id":
                    row["section_id"],

                "from_station":
                    from_name,

                "to_station":
                    to_name,

                "date":
                    row["date"].strftime(
                        "%Y-%m-%d"
                    ),

                "maintenance_type":
                    row[
                        "maintenance_type"
                    ],

                "recommended_time":
                    row[
                        "planned_start"
                    ],

                "traffic_level":
                    (
                        "LOW"
                        if row["overrun_flag"] == 0
                        else "MEDIUM"
                    ),

                "asset_type":
                    row[
                        "required_asset_type"
                    ],

                "status":
                    (
                        "Completed"
                        if row["date"] < now
                        else "Pending"
                    ),

                "priority":
                    row["priority"],
            }
        )


    return rows


# ============================================================
# SECTION RESOLUTION
# ============================================================

@app.get(
    "/api/sections/resolve",
    tags=["Railway Sections"],
)
def resolve_section(
    from_station: str,
    to_station: str,
    user=Depends(get_current_user),
):

    from_code = (
        from_station
        .strip()
        .upper()
    )

    to_code = (
        to_station
        .strip()
        .upper()
    )


    pair = sorted(
        [from_code, to_code]
    )


    section_id = (
        f"{pair[0]}-{pair[1]}"
    )


    match = traffic[
        traffic["section_id"]
        == section_id
    ]


    if match.empty:

        raise HTTPException(
            status_code=404,
            detail=(
                f"No direct section found "
                f"between {from_code} and {to_code}"
            ),
        )


    return {

        "section_id":
            section_id,

        "from_station":
            pair[0],

        "to_station":
            pair[1],

        "from_station_name":
            station_name_lookup.get(
                pair[0],
                pair[0],
            ),

        "to_station_name":
            station_name_lookup.get(
                pair[1],
                pair[1],
            ),
    }


# ============================================================
# STATION SEARCH
# ============================================================

@app.get(
    "/api/stations",
    tags=["Stations"],
)
def list_stations(
    q: str = "",
    limit: int = Query(
        default=30,
        ge=1,
        le=100,
    ),
    user=Depends(get_current_user),
):

    q = q.strip()


    if q:

        matches = stations_master[
            stations_master[
                "station_name"
            ].astype(str)
            .str.contains(
                q,
                case=False,
                na=False,
            )
            |
            stations_master[
                "station_code"
            ].astype(str)
            .str.contains(
                q,
                case=False,
                na=False,
            )
        ]

    else:

        matches = stations_master


    return (
        matches
        .head(limit)
        .fillna("")
        .to_dict(
            orient="records"
        )
    )


# ============================================================
# SECTION TRAFFIC HEATMAP
# ============================================================

@app.get(
    "/api/section-traffic/heatmap",
    tags=["Traffic"],
)
def section_traffic_heatmap(
    limit: int = Query(
        default=40,
        ge=1,
        le=200,
    ),
    user=Depends(get_current_user),
):

    totals = (
        traffic
        .groupby("section_id")[
            "trains_count"
        ]
        .sum()
        .sort_values(
            ascending=False
        )
    )


    top_sections = (
        totals
        .head(limit)
        .index
        .tolist()
    )


    subset = traffic[
        traffic["section_id"]
        .isin(top_sections)
    ]


    result = []


    for section_id in top_sections:

        sec_rows = (
            subset[
                subset["section_id"]
                == section_id
            ]
            .groupby("hour_of_day")
            .agg(
                trains_count=(
                    "trains_count",
                    "sum",
                ),
                traffic_level=(
                    "traffic_level",
                    "first",
                ),
            )
        )


        (
            _,
            _,
            from_name,
            to_name,
        ) = section_to_stations(
            section_id
        )


        hours = []


        for hour in range(24):

            if hour in sec_rows.index:

                hours.append(
                    {
                        "hour":
                            hour,

                        "trains_count":
                            int(
                                sec_rows
                                .loc[
                                    hour,
                                    "trains_count",
                                ]
                            ),

                        "traffic_level":
                            str(
                                sec_rows
                                .loc[
                                    hour,
                                    "traffic_level",
                                ]
                            ),
                    }
                )

            else:

                hours.append(
                    {
                        "hour": hour,
                        "trains_count": 0,
                        "traffic_level": "LOW",
                    }
                )


        result.append(
            {
                "section_id":
                    section_id,

                "from_station":
                    from_name,

                "to_station":
                    to_name,

                "hours":
                    hours,
            }
        )


    return result


# ============================================================
# REPORTS
# ============================================================

@app.get(
    "/api/reports",
    tags=["Reports"],
)
def reports(
    user=Depends(get_current_user),
):

    if eval_results is None:

        raise HTTPException(
            status_code=404,
            detail=(
                "No evaluation results found. "
                "Run the Step 4 evaluation notebook "
                "to generate 08_evaluation_results.csv."
            ),
        )


    return (
        eval_results
        .fillna("")
        .to_dict(
            orient="records"
        )
    )


# ============================================================
# ASSET MANAGEMENT
# ============================================================

@app.get(
    "/api/assets",
    tags=["Assets"],
)
def list_assets(
    user=Depends(get_current_user),
):

    conn = get_db()


    overrides = {
        row["asset_id"]:
            row["status"]

        for row in conn.execute(
            """
            SELECT asset_id, status
            FROM asset_status_overrides
            """
        ).fetchall()
    }


    conn.close()


    result = (
        assets
        .fillna("N/A")
        .to_dict(
            orient="records"
        )
    )


    for row in result:

        asset_id = row.get(
            "asset_id"
        )

        if asset_id in overrides:

            row["status"] = (
                overrides[asset_id]
            )


    return result


@app.patch(
    "/api/assets/{asset_id}",
    tags=["Assets"],
)
def update_asset_status(
    asset_id: str,
    req: AssetStatusUpdate,
    user=Depends(
        require_role("Admin")
    ),
):

    allowed_statuses = {
        "Available",
        "In Use",
        "Under Repair",
    }


    if req.status not in allowed_statuses:

        raise HTTPException(
            status_code=400,
            detail=(
                "status must be "
                "Available, In Use, "
                "or Under Repair"
            ),
        )


    if asset_id not in set(
        assets["asset_id"]
    ):

        raise HTTPException(
            status_code=404,
            detail=(
                f"Unknown asset_id "
                f"'{asset_id}'"
            ),
        )


    conn = get_db()


    conn.execute(
        """
        INSERT INTO asset_status_overrides
            (asset_id, status, updated_by, updated_at)
        VALUES (?, ?, ?, ?)

        ON CONFLICT(asset_id)
        DO UPDATE SET
            status = excluded.status,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
        """,
        (
            asset_id,
            req.status,
            user["email"],
            pd.Timestamp.now().isoformat(),
        ),
    )


    conn.commit()
    conn.close()


    return {
        "asset_id":
            asset_id,

        "status":
            req.status,

        "updated_by":
            user["email"],
    }


# ============================================================
# ADMIN USER MANAGEMENT
# ============================================================

@app.get(
    "/api/admin/users",
    tags=["Administration"],
)
def list_users(
    user=Depends(
        require_role("Admin")
    ),
):

    conn = get_db()


    rows = conn.execute(
        """
        SELECT
            id,
            email,
            name,
            role,
            created_at
        FROM users
        ORDER BY id
        """
    ).fetchall()


    conn.close()


    return [
        dict(row)
        for row in rows
    ]


@app.patch(
    "/api/admin/users/{user_id}",
    tags=["Administration"],
)
def update_user_role(
    user_id: int,
    req: RoleUpdate,
    user=Depends(
        require_role("Admin")
    ),
):

    allowed_roles = {
        "Admin",
        "Section Controller",
        "Viewer",
    }


    if req.role not in allowed_roles:

        raise HTTPException(
            status_code=400,
            detail=(
                "role must be "
                "Admin, Section Controller, "
                "or Viewer"
            ),
        )


    conn = get_db()


    result = conn.execute(
        """
        UPDATE users
        SET role = ?
        WHERE id = ?
        """,
        (
            req.role,
            user_id,
        ),
    )


    conn.commit()


    if result.rowcount == 0:

        conn.close()

        raise HTTPException(
            status_code=404,
            detail="User not found",
        )


    conn.close()


    return {
        "user_id":
            user_id,

        "role":
            req.role,
    }


# ============================================================
# EXTRA DATABASE TABLES
# ============================================================

def init_extra_tables():
    """
    Create application-specific tables used for:

    - asset status overrides
    - real block recommendation history
    """

    conn = get_db()


    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS
        asset_status_overrides (
            asset_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            updated_by TEXT,
            updated_at TEXT
        )
        """
    )


    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS
        block_requests_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            section_id TEXT NOT NULL,
            date TEXT NOT NULL,
            maintenance_type TEXT NOT NULL,
            recommended_start_hour INTEGER,
            traffic_level TEXT,
            asset_id TEXT,
            disruption_score REAL,
            status TEXT NOT NULL DEFAULT 'Pending',
            requested_by TEXT,
            requested_at TEXT NOT NULL
        )
        """
    )


    conn.commit()
    conn.close()


init_extra_tables()


# ============================================================
# RECOMMENDATION LOGGING
# ============================================================

def log_recommendation(
    req: BlockRequest,
    best: dict,
    selected,
    user,
):

    conn = get_db()


    cursor = conn.execute(
        """
        INSERT INTO block_requests_log
        (
            section_id,
            date,
            maintenance_type,
            recommended_start_hour,
            traffic_level,
            asset_id,
            disruption_score,
            status,
            requested_by,
            requested_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)
        """,
        (
            req.section_id,
            req.date,
            req.maintenance_type,
            best["start_hour"],
            best["traffic_level"],
            (
                selected["asset_id"]
                if selected
                else None
            ),
            best["disruption_score"],
            user["email"],
            pd.Timestamp.now().isoformat(),
        ),
    )


    conn.commit()


    log_id = cursor.lastrowid


    conn.close()


    return log_id


# ============================================================
# BLOCK APPROVAL
# ============================================================

@app.post(
    "/api/blocks/approve",
    tags=["Block Management"],
)
def approve_block(
    req: ApproveRequest,
    user=Depends(
        require_role(
            "Admin",
            "Section Controller",
        )
    ),
):

    conn = get_db()


    result = conn.execute(
        """
        UPDATE block_requests_log
        SET status = 'Approved'
        WHERE id = ?
        """,
        (
            req.log_id,
        ),
    )


    conn.commit()


    if result.rowcount == 0:

        conn.close()

        raise HTTPException(
            status_code=404,
            detail="Request not found",
        )


    conn.close()


    return {
        "log_id":
            req.log_id,

        "status":
            "Approved",
    }


# ============================================================
# LIVE BLOCK REQUEST LOG
# ============================================================

@app.get(
    "/api/blocks/log",
    tags=["Block Management"],
)
def blocks_log(
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
    ),
    user=Depends(
        get_current_user
    ),
):

    conn = get_db()


    rows = conn.execute(
        """
        SELECT *
        FROM block_requests_log
        ORDER BY id DESC
        LIMIT ?
        """,
        (
            limit,
        ),
    ).fetchall()


    conn.close()


    return [
        dict(row)
        for row in rows
    ]


# ============================================================
# REACT FRONTEND
# ============================================================

# Important:
#
# All API routes must be defined BEFORE this catch-all route.
#
# The catch-all is only used for serving the React application
# and React Router pages.

if FRONTEND_DIST.exists():

    assets_directory = (
        FRONTEND_DIST
        / "assets"
    )


    if assets_directory.exists():

        app.mount(
            "/assets",
            StaticFiles(
                directory=assets_directory
            ),
            name="frontend-assets",
        )


    @app.get(
        "/",
        include_in_schema=False,
    )
    async def serve_home():

        index_file = (
            FRONTEND_DIST
            / "index.html"
        )


        if index_file.exists():

            return FileResponse(
                index_file
            )


        return JSONResponse(
            {
                "status":
                    "RailVinyas API is running",

                "message":
                    "Frontend build not found.",
            }
        )


    @app.get(
        "/{full_path:path}",
        include_in_schema=False,
    )
    async def serve_frontend(
        full_path: str,
    ):

        frontend_root = (
            FRONTEND_DIST
            .resolve()
        )


        requested_file = (
            FRONTEND_DIST
            / full_path
        ).resolve()


        # Prevent path traversal.
        try:

            requested_file.relative_to(
                frontend_root
            )

        except ValueError:

            return FileResponse(
                FRONTEND_DIST
                / "index.html"
            )


        # Serve existing file.
        if requested_file.is_file():

            return FileResponse(
                requested_file
            )


        # React Router fallback.
        return FileResponse(
            FRONTEND_DIST
            / "index.html"
        )


# ============================================================
# LOCAL DEVELOPMENT ENTRY POINT
# ============================================================

if __name__ == "__main__":

    import uvicorn


    uvicorn.run(
        "backend.app:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )