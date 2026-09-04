# Your 6 Files — What Each One Is For

| # | File | Answers | Type |
|---|---|---|---|
| 1 | `01_stations_master.csv` | Where are the stations? | REAL |
| 2 | `02_train_timetable.csv` | Which train goes where, when? | REAL |
| 3 | `03_section_traffic_derived.csv` | How busy is each track section, by hour? | DERIVED from REAL |
| 4 | `04_asset_register.csv` | What maintenance equipment exists? | SYNTHETIC |
| 5 | `05_maintenance_blocks.csv` | What maintenance work is needed, where, for how long? | SYNTHETIC |
| 6 | `06_daily_asset_availability.csv` | Is a given asset free on a given day? | SYNTHETIC |

## How they connect (the join keys)

```
01_stations_master
   station_code  ──────┐
                        ▼
02_train_timetable (station_code, train_no)
                        │
                 (consecutive stations per train)
                        ▼
03_section_traffic_derived
   section_id  ─────────┐
                         ▼
05_maintenance_blocks (section_id, required_asset_type)
                         │
                required_asset_type
                         ▼
04_asset_register
   asset_id  ────────────┐
                          ▼
06_daily_asset_availability (asset_id, date)
```

**In plain words:** stations tell you WHERE, the timetable tells you WHICH TRAIN and WHEN, section traffic tells you HOW BUSY each stretch of track is, maintenance blocks tell you WHAT WORK is needed and WHERE, the asset register tells you WHAT EQUIPMENT exists, and daily availability tells you WHEN that equipment is actually free to use.

## What's real vs made up — and why

- **Files 1–2 are 100% real**, cleaned from your uploaded `Train_details_22122017.csv` (5 corrupted rows were dropped — a comma inside a train name had shifted the columns in the raw file).
- **File 3 is calculated, not invented** — it counts how many distinct trains pass through each station-pair, by the hour, using the real timetable. One honest caveat: this source file has no "which days does this train run" column, so this counts scheduled trains per hour, not confirmed daily-actual traffic — every train is treated as if it runs every day.
- **Files 4–6 are simulated**, because no public dataset exists anywhere with real Indian Railways asset inventories or maintenance-block history (I checked). But they're now keyed to the **same real section_ids** as file 3 — so when your AI optimizer looks up "how busy is section CLA-MTN" and "what maintenance is due on CLA-MTN," it's looking at the same real corridor, not two unrelated made-up codes like before.

## Quick numbers
- 8,148 real stations · 11,110 real trains (5 corrupted rows removed)
- 14,465 real physical sections derived; the 800 busiest were chosen to attach maintenance/asset data to (so your optimizer has meaningful high-traffic corridors to actually solve for)
- 400 synthetic assets · 15,000 synthetic maintenance blocks · 16,000 synthetic availability records
