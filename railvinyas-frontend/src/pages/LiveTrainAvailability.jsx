// src/pages/LiveTrainAvailability.jsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch, ApiError } from "../api";

const REFRESH_MS = 60000;

function formatTime(value) {
  if (!value) return "--";

  const parts = String(value).split(":");
  if (parts.length < 2) return value;

  return `${parts[0]}:${parts[1]}`;
}

function formatCountdown(minutes) {
  if (minutes <= 0) return "NOW";

  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);

  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function statusClass(status) {
  if (status === "RUNNING") {
    return "bg-green-400/10 text-green-300 border-green-400/20";
  }

  if (status === "SOON") {
    return "bg-amber-400/10 text-amber-300 border-amber-400/20";
  }

  return "bg-sky-400/10 text-sky-300 border-sky-400/20";
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-bold">
        {label}
      </div>

      <div className="mt-1 text-2xl font-bold text-white">
        {value}
      </div>

      {sub && (
        <div className="mt-1 text-[10px] text-slate-500">
          {sub}
        </div>
      )}
    </div>
  );
}

export default function LiveTrainAvailability() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sectionId = searchParams.get("section") || "";
  const fromName = searchParams.get("from") || "From";
  const toName = searchParams.get("to") || "To";

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState("");

  const fetchTrains = useCallback(async () => {
    if (!sectionId) {
      setError("No railway section was provided.");
      setLoading(false);
      return;
    }

    try {
      setError("");

      const response = await apiFetch(
        `/api/live/section/${encodeURIComponent(sectionId)}/upcoming?hours=3`
      );

      setData(response);

      setLastRefresh(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load upcoming train data."
      );
    } finally {
      setLoading(false);
    }
  }, [sectionId]);

  useEffect(() => {
    fetchTrains();

    const timer = setInterval(fetchTrains, REFRESH_MS);

    return () => clearInterval(timer);
  }, [fetchTrains]);

  const trains = data?.trains || [];

  const nextTrain = trains.length > 0 ? trains[0] : null;

  const soonCount = useMemo(
    () => trains.filter((train) => train.minutes_to_arrival <= 30).length,
    [trains]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* =========================================================
          TOP CONTROL BAR
          ========================================================= */}

      <div className="border-b border-slate-800 bg-slate-900">

        <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">

          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-sky-400 font-bold">
              IT Cell / Traffic Control
            </div>

            <h1 className="text-xl font-bold mt-1">
              LIVE TRAIN AVAILABILITY
            </h1>

            <p className="text-xs text-slate-500 mt-1">
              Upcoming train movement monitoring — next 3 hours
            </p>
          </div>

          <div className="flex items-center gap-3">

            <div className="flex items-center gap-2 text-[10px] text-green-400">
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              SYSTEM LIVE
            </div>

            <button
              type="button"
              onClick={fetchTrains}
              className="px-3 py-2 rounded-lg bg-sky-500 text-white text-xs font-bold hover:bg-sky-400 transition"
            >
              ↻ Refresh
            </button>

            <button
              type="button"
              onClick={() => navigate("/new-request")}
              className="px-3 py-2 rounded-lg border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-800 transition"
            >
              ← Block Request
            </button>

          </div>
        </div>
      </div>

      {/* =========================================================
          SECTION / TIME BAR
          ========================================================= */}

      <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-3">

        <div className="flex items-center justify-between flex-wrap gap-4">

          <div className="flex items-center gap-3">

            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500">
                SECTION
              </div>

              <div className="text-sm font-bold text-white">
                {fromName}
                <span className="mx-2 text-sky-400">→</span>
                {toName}
              </div>
            </div>

            <div className="h-8 w-px bg-slate-700" />

            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500">
                SECTION ID
              </div>

              <div className="text-xs font-mono text-sky-300">
                {sectionId || "--"}
              </div>
            </div>

          </div>

          <div className="text-right">

            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              LAST REFRESH
            </div>

            <div className="text-xs font-mono text-slate-300">
              {lastRefresh || "--"}
            </div>

          </div>

        </div>
      </div>

      {/* =========================================================
          MAIN
          ========================================================= */}

      <main className="p-6 max-w-[1600px] mx-auto">

        {/* ERROR */}

        {error && (
          <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* =======================================================
            KPI CARDS
            ======================================================= */}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

          <StatCard
            label="Upcoming Trains"
            value={loading ? "..." : trains.length}
            sub="within next 3 hours"
          />

          <StatCard
            label="Next Train"
            value={loading ? "..." : nextTrain?.train_no || "--"}
            sub={
              nextTrain
                ? `${formatCountdown(nextTrain.minutes_to_arrival)} remaining`
                : "No scheduled movement"
            }
          />

          <StatCard
            label="Trains ≤ 30 Min"
            value={loading ? "..." : soonCount}
            sub="near-term traffic"
          />

          <StatCard
            label="Monitoring Window"
            value="03:00 H"
            sub={
              data?.as_of
                ? `Started ${data.as_of}`
                : "Current clock"
            }
          />

        </div>

        {/* =======================================================
            CONTROL STATUS
            ======================================================= */}

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 mb-6">

          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">

            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-sky-400 font-bold">
                Traffic Monitoring
              </div>

              <div className="text-sm font-semibold text-white mt-1">
                Upcoming Train Movement
              </div>
            </div>

            <div className="text-right">
              <div className="text-[9px] uppercase text-slate-500">
                DATA SOURCE
              </div>

              <div className="text-[10px] text-sky-300">
                Schedule Projection
              </div>
            </div>

          </div>

          {/* =====================================================
              TABLE
              ===================================================== */}

          <div className="overflow-x-auto">

            <table className="w-full text-left">

              <thead>
                <tr className="border-b border-slate-800 text-[9px] uppercase tracking-wider text-slate-500">

                  <th className="px-5 py-3">Train</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Direction</th>
                  <th className="px-5 py-3">Departure</th>
                  <th className="px-5 py-3">Arrival</th>
                  <th className="px-5 py-3">ETA</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Source</th>

                </tr>
              </thead>

              <tbody>

                {loading && (
                  <tr>
                    <td
                      colSpan="8"
                      className="px-5 py-12 text-center text-xs text-slate-500"
                    >
                      Loading train movement data...
                    </td>
                  </tr>
                )}

                {!loading && trains.length === 0 && (
                  <tr>
                    <td
                      colSpan="8"
                      className="px-5 py-12 text-center"
                    >
                      <div className="text-sm font-semibold text-slate-300">
                        NO UPCOMING TRAINS
                      </div>

                      <div className="text-xs text-slate-500 mt-1">
                        No scheduled train movement detected in the next 3 hours.
                      </div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  trains.map((train, index) => (

                    <tr
                      key={`${train.train_no}-${index}`}
                      className="border-b border-slate-800/70 hover:bg-slate-800/40 transition"
                    >

                      <td className="px-5 py-4">

                        <div className="font-mono text-sm font-bold text-sky-300">
                          {train.train_no}
                        </div>

                      </td>

                      <td className="px-5 py-4">

                        <div className="text-xs font-semibold text-white">
                          {train.train_name}
                        </div>

                      </td>

                      <td className="px-5 py-4">

                        <span className="text-[10px] uppercase font-bold text-slate-400">
                          {train.direction}
                        </span>

                      </td>

                      <td className="px-5 py-4">

                        <span className="font-mono text-xs text-slate-300">
                          {formatTime(train.dep_time)}
                        </span>

                      </td>

                      <td className="px-5 py-4">

                        <span className="font-mono text-xs text-slate-300">
                          {formatTime(train.arr_time)}
                        </span>

                      </td>

                      <td className="px-5 py-4">

                        <div className="font-mono text-xs font-bold text-white">
                          {formatCountdown(train.minutes_to_arrival)}
                        </div>

                      </td>

                      <td className="px-5 py-4">

                        <span
                          className={`inline-flex px-2 py-1 rounded-md border text-[9px] font-bold ${statusClass(
                            train.status
                          )}`}
                        >
                          {train.status}
                        </span>

                      </td>

                      <td className="px-5 py-4">

                        <span className="text-[9px] text-slate-500 uppercase">
                          timetable
                        </span>

                      </td>

                    </tr>

                  ))}

              </tbody>

            </table>

          </div>

        </div>

        {/* =======================================================
            SYSTEM NOTE
            ======================================================= */}

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-4">

          <div className="flex items-start gap-3">

            <div className="h-2 w-2 mt-1.5 rounded-full bg-sky-400" />

            <div>

              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                System Information
              </div>

              <p className="text-[10px] leading-relaxed text-slate-500 mt-1">
                Train availability shown here is schedule-projected from
                the railway timetable against the current clock. It is not
                GPS-confirmed. The source timetable does not contain a
                run-day mask, so trains are treated as scheduled for today.
              </p>

            </div>

          </div>

        </div>

      </main>

    </div>
  );
}