"""
Backend API for RailVinyas.

Run locally with:
    pip install fastapi uvicorn pandas numpy scikit-learn xgboost joblib bcrypt pyjwt python-multipart --break-system-packages
    cd RailVinyas/backend
    uvicorn app:app --reload --port 8000

Then your website's fetch() calls hit: http://localhost:8000/api/recommend

Expects this folder layout (this file lives in backend/):
RailVinyas/
├── backend/app.py, auth.py                <- these two files
├── data/
│   ├── real/       01_stations_master.csv, 02_train_timetable.csv
│   ├── derived/    03_section_traffic_derived.csv
│   └── synthetic/  04_asset_register.csv, 05_maintenance_blocks.csv,
│                   06_daily_asset_availability.csv
├── training/       07_model_training_table.csv, 08_evaluation_results.csv
└── models/         overrun_model.joblib, model_feature_columns.joblib

AUTHENTICATION: see auth.py for full details. Seeded login:
    email: aarzubhatt9@gmail.com   password: aarzu1234
All routes below except / and /api/auth/* require a valid Bearer token
(see get_current_user in auth.py). Send it as:
    Authorization: Bearer <token>
"""
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import pandas as pd
import numpy as np
import joblib

from .auth import router as auth_router, init_db, get_current_user

app = FastAPI(title="RailVinyas API")

# Create the user database + seed the admin account on startup
init_db()

# Mount authentication routes: /api/auth/register, /api/auth/login,
# /api/auth/verify-otp, /api/auth/me
app.include_router(auth_router)

# Allow your website (running on a different port/domain) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------
# Path setup — this file lives in backend/, everything else lives one
# level up in data/real, data/derived, data/synthetic, training/, models/
# ------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent   # -> Block-Bugger/
DATA_REAL = BASE_DIR / "data" / "real"
DATA_DERIVED = BASE_DIR / "data" / "derived"
DATA_SYNTHETIC = BASE_DIR / "data" / "synthetic"
TRAINING_DIR = BASE_DIR / "training"
MODELS_DIR = BASE_DIR / "models"

# ------------------------------------------------------------------
# Load everything ONCE at startup, not per-request
# ------------------------------------------------------------------
traffic = pd.read_csv(DATA_DERIVED / "03_section_traffic_derived.csv")
assets = pd.read_csv(DATA_SYNTHETIC / "04_asset_register.csv")
avail = pd.read_csv(DATA_SYNTHETIC / "06_daily_asset_availability.csv", parse_dates=["date"])
train_table = pd.read_csv(TRAINING_DIR / "07_model_training_table.csv", parse_dates=["date"])
model = joblib.load(MODELS_DIR / "overrun_model.joblib")
feature_columns = joblib.load(MODELS_DIR / "model_feature_columns.joblib")

traffic_idx = traffic.set_index(["section_id", "hour_of_day"])[["trains_count", "traffic_level"]]
assets_count_idx = assets.groupby(["home_section_id", "asset_type"]).size()
latest_section_rate = (train_table.sort_values("date")
                        .groupby("section_id")["section_historical_overrun_rate"].last())
global_fallback_rate = train_table["overrun_flag"].mean()
avail_with_type = avail.merge(assets[["asset_id", "asset_type"]], on="asset_id", how="left")
overall_type_avail = (avail_with_type.groupby("asset_type")["available"]
                       .apply(lambda s: (s == "YES").mean()))

CATEGORICAL = ["day_of_week", "maintenance_type", "required_asset_type", "priority", "weather", "traffic_level"]


class BlockRequest(BaseModel):
    section_id: str
    maintenance_type: str
    required_asset_type: str
    priority: str
    weather: str
    planned_duration_min: float
    date: str  # "YYYY-MM-DD"


def score_hour(section_id, hour, maintenance_type, required_asset_type,
               priority, weather, planned_duration_min, date):
    try:
        trains_count, traffic_level = traffic_idx.loc[(section_id, hour)]
    except KeyError:
        trains_count, traffic_level = 0.0, "LOW"

    assets_here = assets_count_idx.get((section_id, required_asset_type), 0)
    day_records = avail_with_type[(avail_with_type.date == pd.Timestamp(date)) &
                                   (avail_with_type.asset_type == required_asset_type)]
    if len(day_records):
        avail_pct = (day_records["available"] == "YES").mean()
        had_record = 1
    else:
        avail_pct = overall_type_avail.get(required_asset_type, 0.7)
        had_record = 0

    section_rate = latest_section_rate.get(section_id, global_fallback_rate)
    d = pd.Timestamp(date)
    raw = pd.DataFrame([{
        "day_of_week": d.day_name(), "maintenance_type": maintenance_type,
        "required_asset_type": required_asset_type, "priority": priority,
        "weather": weather, "traffic_level": traffic_level,
        "month": d.month, "is_weekend": int(d.day_name() in ["Saturday", "Sunday"]),
        "start_hour": hour, "trains_count": trains_count,
        "assets_of_type_in_section": assets_here,
        "asset_type_availability_pct": avail_pct, "had_availability_record": had_record,
        "section_historical_overrun_rate": section_rate,
        "planned_duration_min": planned_duration_min,
    }])
    X_row = pd.get_dummies(raw, columns=CATEGORICAL).reindex(columns=feature_columns, fill_value=0)
    predicted_overrun = float(model.predict(X_row)[0])
    expected_total_duration = planned_duration_min + max(predicted_overrun, 0)
    trains_count = float(trains_count)
    disruption_score = trains_count * expected_total_duration
    return dict(trains_count=trains_count, traffic_level=str(traffic_level),
                predicted_overrun_min=round(predicted_overrun, 1),
                expected_total_duration_min=round(expected_total_duration, 1),
                asset_type_availability_pct=round(float(avail_pct), 2),
                disruption_score=round(float(disruption_score), 1))


@app.get("/api/sections")
def list_sections(user=Depends(get_current_user)):
    """For populating the section dropdown on your website. Requires login."""
    return sorted(traffic["section_id"].unique().tolist())[:1000]


@app.post("/api/recommend")
def recommend(req: BlockRequest, user=Depends(get_current_user)):
    """Requires login. `user` contains the logged-in user's id/email/role,
    available here if you want to log who requested a recommendation."""
    if req.section_id not in traffic["section_id"].values:
        raise HTTPException(status_code=404, detail=f"Unknown section_id '{req.section_id}'")

    candidates = []
    for hour in range(24):
        s = score_hour(req.section_id, hour, req.maintenance_type, req.required_asset_type,
                        req.priority, req.weather, req.planned_duration_min, req.date)
        s["start_hour"] = hour
        candidates.append(s)

    ranked = sorted(candidates, key=lambda x: x["disruption_score"])
    best = ranked[0]

    asset_candidates = assets[assets.asset_type == req.required_asset_type].copy()
    asset_candidates["home_match"] = (asset_candidates.home_section_id == req.section_id).astype(int)
    asset_candidates = asset_candidates.sort_values(["home_match", "status"], ascending=[False, True])
    if len(asset_candidates):
        raw_sel = asset_candidates.iloc[0].to_dict()
        selected = {k: (v.item() if hasattr(v, "item") else v) for k, v in raw_sel.items()}
    else:
        selected = None

    return {
        "section_id": req.section_id,
        "maintenance_type": req.maintenance_type,
        "date": req.date,
        "recommended_start_hour": best["start_hour"],
        "expected_total_duration_min": best["expected_total_duration_min"],
        "predicted_overrun_min": best["predicted_overrun_min"],
        "traffic_level": best["traffic_level"],
        "trains_count": best["trains_count"],
        "disruption_score": best["disruption_score"],
        "selected_asset": selected,
        "top_5_candidates": ranked[:5],
    }


@app.get("/")
def health():
    return {"status": "RailVinyas API is running"}

# ---------------------------------------------------------
# Serve React frontend
# ---------------------------------------------------------

FRONTEND_DIST = BASE_DIR / "railvinyas-frontend" / "dist"

if FRONTEND_DIST.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIST / "assets"),
        name="assets"
    )

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        requested_file = FRONTEND_DIST / full_path

        if requested_file.is_file():
            return FileResponse(requested_file)

        return FileResponse(FRONTEND_DIST / "index.html")

if __name__ == "__main__":
    # Lets you also just run: python app.py
    # (equivalent to: uvicorn app:app --reload --port 8000)
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
