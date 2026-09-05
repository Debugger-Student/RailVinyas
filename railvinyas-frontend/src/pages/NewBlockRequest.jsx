// src/pages/NewBlockRequest.jsx
import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "../api";
import { Card, TrafficBadge, Spinner } from "../components/ui";

const MAINTENANCE_TYPES = {
  "Track Repair": "Tamping Machine",
  "Rail Welding": "Rail Crane",
  "Ballast Renewal": "Ballast Regulator",
  "OHE Maintenance": "OHE Maintenance Special",
  "Points Renewal": "Rail Crane",
  "Track Stabilization": "Dynamic Track Stabilizer",
  "Signal Maintenance": "Tower Wagon",
};

const WEATHER_OPTIONS = [
  "Clear",
  "Light Rain",
  "Heavy Rain",
  "Fog",
  "Extreme Heat",
];

const PREFERRED_WINDOWS = [
  ["any", "Any time"],
  ["night", "Night operations · 22:00–05:00"],
  ["day", "Day operations · 05:00–22:00"],
];

function formatHour(hour) {
  const h = Number(hour);
  if (Number.isNaN(h)) return "--:--";

  const suffix = h >= 12 ? "PM" : "AM";
  const display = h % 12 === 0 ? 12 : h % 12;

  return `${String(display).padStart(2, "0")}:00 ${suffix}`;
}

function normalizeStations(data) {
  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.stations)) return data.stations;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;

  return [];
}

function stationLabel(station) {
  return station?.station_name || station?.name || station?.station || "";
}

function stationCode(station) {
  return station?.station_code || station?.code || station?.stationCode || "";
}

function StationPicker({
  label,
  value,
  selectedCode,
  options,
  loading,
  onChange,
  onPick,
  suggested = false,
}) {
  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-semibold text-navy">
          {label}
        </label>

        {selectedCode && (
          <span className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            Selected
          </span>
        )}
      </div>

      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search station name or code"
          className={`w-full border rounded-xl px-4 py-3 pr-10 text-sm text-navy bg-white
            placeholder:text-gray-400
            focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky
            transition
            ${selectedCode ? "border-green-300 bg-green-50/30" : "border-gray-200"}`}
        />

        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
          {loading ? "…" : "⌕"}
        </div>
      </div>

      {selectedCode && (
        <div className="mt-2 inline-flex items-center gap-2 text-xs text-navy bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
          <span className="font-semibold">{selectedCode}</span>
          <span className="text-gray-400">•</span>
          <span>Railway station selected</span>
        </div>
      )}

      {!selectedCode && suggested && options.length > 0 && (
        <div className="mt-2">
          <div className="text-[11px] text-gray-400 mb-1.5">
            Suggested stations
          </div>

          <div className="flex flex-wrap gap-1.5">
            {options.slice(0, 5).map((station) => {
              const name = stationLabel(station);
              const code = stationCode(station);

              return (
                <button
                  type="button"
                  key={`${code}-${name}`}
                  onClick={() => onPick(station)}
                  className="text-xs bg-white border border-gray-200 hover:border-sky hover:bg-sky/5 text-navy rounded-lg px-2.5 py-1.5 transition"
                >
                  {name}
                  {code ? ` · ${code}` : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {options.length > 0 && !suggested && (
        <div className="absolute left-0 right-0 mt-2 border border-gray-200 rounded-xl bg-white shadow-xl z-30 overflow-hidden">
          <div className="px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-gray-400 bg-slate-50 border-b border-gray-100">
            Matching stations
          </div>

          <div className="max-h-56 overflow-y-auto">
            {options.map((station) => {
              const name = stationLabel(station);
              const code = stationCode(station);

              return (
                <button
                  type="button"
                  key={`${code}-${name}`}
                  onClick={() => onPick(station)}
                  className="w-full text-left px-4 py-3 hover:bg-sky/5 transition border-b last:border-b-0 border-gray-100"
                >
                  <div className="text-sm font-medium text-navy">
                    {name}
                  </div>

                  {code && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Station code: {code}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {value.length >= 2 && options.length === 0 && !loading && !selectedCode && (
        <div className="mt-2 text-xs text-gray-400">
          No matching stations found.
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, subtext, accent = "sky" }) {
  const accentClasses = {
    sky: "text-sky bg-sky/5 border-sky/10",
    green: "text-green-700 bg-green-50 border-green-100",
    amber: "text-amber-700 bg-amber-50 border-amber-100",
    navy: "text-navy bg-slate-50 border-slate-100",
  };

  return (
    <div
      className={`rounded-xl border p-4 ${accentClasses[accent] || accentClasses.sky}`}
    >
      <div className="text-[11px] uppercase tracking-wide font-semibold opacity-70">
        {label}
      </div>

      <div className="text-xl font-bold mt-1">
        {value}
      </div>

      {subtext && (
        <div className="text-xs text-gray-500 mt-1">
          {subtext}
        </div>
      )}
    </div>
  );
}

export default function NewBlockRequest() {
  const [stationQuery, setStationQuery] = useState({
    from: "",
    to: "",
    fromCode: null,
    toCode: null,
  });

  const [stationOptions, setStationOptions] = useState({
    from: [],
    to: [],
  });

  const [suggestedStations, setSuggestedStations] = useState([]);

  const [stationLoading, setStationLoading] = useState({
    from: false,
    to: false,
  });

  const [resolvedSection, setResolvedSection] = useState(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState("");

  const [form, setForm] = useState({
    maintenance_type: "Track Repair",
    priority: "Medium",
    weather: "Clear",
    planned_duration_min: 180,
    date: "",
    preferred_window: "any",
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ------------------------------------------------------------
  // Load a few real stations for quick suggestions
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    apiFetch("/api/stations?limit=12")
      .then((data) => {
        if (cancelled) return;

        const stations = normalizeStations(data);

        setSuggestedStations(
          stations.filter(
            (station) => stationLabel(station) && stationCode(station)
          )
        );
      })
      .catch(() => {
        // Search still works when the API supports q-based lookup.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------
  // Search From station
  // ------------------------------------------------------------
  useEffect(() => {
    const query = stationQuery.from.trim();

    if (query.length < 2 || stationQuery.fromCode) {
      setStationOptions((s) => ({ ...s, from: [] }));
      setStationLoading((s) => ({ ...s, from: false }));
      return;
    }

    const timer = setTimeout(async () => {
      setStationLoading((s) => ({ ...s, from: true }));

      try {
        const response = await apiFetch(
          `/api/stations?q=${encodeURIComponent(query)}&limit=8`
        );

        setStationOptions((s) => ({
          ...s,
          from: normalizeStations(response),
        }));
      } catch {
        setStationOptions((s) => ({ ...s, from: [] }));
      } finally {
        setStationLoading((s) => ({ ...s, from: false }));
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [stationQuery.from, stationQuery.fromCode]);

  // ------------------------------------------------------------
  // Search To station
  // ------------------------------------------------------------
  useEffect(() => {
    const query = stationQuery.to.trim();

    if (query.length < 2 || stationQuery.toCode) {
      setStationOptions((s) => ({ ...s, to: [] }));
      setStationLoading((s) => ({ ...s, to: false }));
      return;
    }

    const timer = setTimeout(async () => {
      setStationLoading((s) => ({ ...s, to: true }));

      try {
        const response = await apiFetch(
          `/api/stations?q=${encodeURIComponent(query)}&limit=8`
        );

        setStationOptions((s) => ({
          ...s,
          to: normalizeStations(response),
        }));
      } catch {
        setStationOptions((s) => ({ ...s, to: [] }));
      } finally {
        setStationLoading((s) => ({ ...s, to: false }));
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [stationQuery.to, stationQuery.toCode]);

  // ------------------------------------------------------------
  // Resolve station pair -> railway section
  // ------------------------------------------------------------
  useEffect(() => {
    setResolvedSection(null);
    setResolveError("");

    if (!stationQuery.fromCode || !stationQuery.toCode) {
      setResolveLoading(false);
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      setResolveLoading(true);

      try {
        const response = await apiFetch(
          `/api/sections/resolve?from_station=${encodeURIComponent(
            stationQuery.fromCode
          )}&to_station=${encodeURIComponent(stationQuery.toCode)}`
        );

        if (!cancelled) {
          setResolvedSection(response);
        }
      } catch (err) {
        if (!cancelled) {
          setResolveError(
            err instanceof ApiError
              ? err.message
              : "Unable to resolve this station pair."
          );
        }
      } finally {
        if (!cancelled) {
          setResolveLoading(false);
        }
      }
    };

    resolve();

    return () => {
      cancelled = true;
    };
  }, [stationQuery.fromCode, stationQuery.toCode]);

  const pickStation = (field, station) => {
    const name = stationLabel(station);
    const code = stationCode(station);

    setStationQuery((current) => ({
      ...current,
      [field]: name,
      [`${field}Code`]: code,
    }));

    setStationOptions((current) => ({
      ...current,
      [field]: [],
    }));
  };

  const update = (field) => (e) => {
    setForm((current) => ({
      ...current,
      [field]: e.target.value,
    }));
  };

  const submit = async (e) => {
    e.preventDefault();

    setError("");
    setResult(null);

    if (!resolvedSection?.section_id) {
      setError("Please select a valid From and To station pair first.");
      return;
    }

    if (!form.date) {
      setError("Please select the planned maintenance date.");
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch("/api/recommend", {
  method: "POST",
  body: {
    section_id: resolvedSection.section_id,
    maintenance_type: form.maintenance_type,
    required_asset_type: MAINTENANCE_TYPES[form.maintenance_type],
    priority: form.priority,
    weather: form.weather,
    planned_duration_min: Number(form.planned_duration_min),
    date: form.date,
  },
  });

      setResult(response);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to generate the AI recommendation."
      );
    } finally {
      setLoading(false);
    }
  };

  const requiredAsset = MAINTENANCE_TYPES[form.maintenance_type];
  const todayStr = new Date().toISOString().split("T")[0];

  const selectedAsset = result?.selected_asset;

  const topCandidate = useMemo(() => {
    if (!result?.top_5_candidates?.length) return null;

    return [...result.top_5_candidates].sort(
      (a, b) => a.disruption_score - b.disruption_score
    )[0];
  }, [result]);

  const averageTrains = useMemo(() => {
    if (!result?.top_5_candidates?.length) return null;

    const values = result.top_5_candidates.map((c) => Number(c.trains_count || 0));
    if (!values.length) return null;

    return (
      values.reduce((sum, value) => sum + value, 0) / values.length
    ).toFixed(1);
  }, [result]);

  return (
    <div className="max-w-7xl mx-auto space-y-7">

      {/* --------------------------------------------------------
          PAGE HEADER
      --------------------------------------------------------- */}
      <div className="relative overflow-hidden rounded-2xl border border-sky/10 bg-gradient-to-r from-sky-50 via-white to-slate-50 p-7">
        <div className="absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-sky/10 to-transparent pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[11px] uppercase tracking-[0.15em] font-bold text-sky">
                RailVinyas AI
              </span>

              <span className="h-1 w-1 rounded-full bg-gray-300" />

              <span className="text-[11px] uppercase tracking-[0.15em] font-semibold text-gray-500">
                Operations Planning
              </span>
            </div>

            <h1 className="text-3xl font-bold text-navy tracking-tight">
              Maintenance Block Planner
            </h1>

            <p className="text-sm text-gray-500 mt-2 max-w-2xl leading-6">
              Plan a maintenance window using traffic intelligence, asset
              availability and AI-assisted disruption scoring.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-navy">
              TRAFFIC-AWARE
            </span>

            <span className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-navy">
              ASSET-AWARE
            </span>

            <span className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-sky">
              AI-ASSISTED
            </span>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------
          MAIN PLANNER GRID
      --------------------------------------------------------- */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)] gap-6">

        {/* LEFT: FORM */}
        <Card className="p-0 overflow-visible">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-sky/10 text-sky flex items-center justify-center font-bold">
                01
              </div>

              <div>
                <h2 className="font-bold text-navy">
                  Section & Maintenance Details
                </h2>

                <p className="text-xs text-gray-500 mt-0.5">
                  Define the corridor and work requirements.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="p-6 space-y-6">

            {/* STATIONS */}
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <StationPicker
                  label="From Station"
                  value={stationQuery.from}
                  selectedCode={stationQuery.fromCode}
                  options={
                    stationQuery.from.length >= 2
                      ? stationOptions.from
                      : suggestedStations
                  }
                  loading={stationLoading.from}
                  suggested={stationQuery.from.length < 2}
                  onChange={(value) =>
                    setStationQuery((current) => ({
                      ...current,
                      from: value,
                      fromCode: null,
                    }))
                  }
                  onPick={(station) => pickStation("from", station)}
                />

                <StationPicker
                  label="To Station"
                  value={stationQuery.to}
                  selectedCode={stationQuery.toCode}
                  options={
                    stationQuery.to.length >= 2
                      ? stationOptions.to
                      : suggestedStations
                  }
                  loading={stationLoading.to}
                  suggested={stationQuery.to.length < 2}
                  onChange={(value) =>
                    setStationQuery((current) => ({
                      ...current,
                      to: value,
                      toCode: null,
                    }))
                  }
                  onPick={(station) => pickStation("to", station)}
                />
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-slate-50 px-4 py-3">
                {resolveLoading && (
                  <div className="flex items-center gap-2 text-sm text-sky">
                    <Spinner label="Resolving railway section..." />
                  </div>
                )}

                {!resolveLoading && resolvedSection && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">
                        Railway section detected
                      </div>

                      <div className="text-sm font-bold text-navy mt-1">
                        {resolvedSection.section_id}
                      </div>

                      <div className="text-xs text-gray-500 mt-0.5">
                        {resolvedSection.from_station_name || stationQuery.from}
                        {" "}↔{" "}
                        {resolvedSection.to_station_name || stationQuery.to}
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-2 rounded-full bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 text-xs font-semibold w-fit">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      Section ready
                    </span>
                  </div>
                )}

                {!resolveLoading && resolveError && (
                  <div>
                    <div className="text-sm font-semibold text-orange-700">
                      Section could not be resolved
                    </div>

                    <div className="text-xs text-orange-600 mt-1">
                      {resolveError}
                    </div>
                  </div>
                )}

                {!resolveLoading &&
                  !resolveError &&
                  !resolvedSection &&
                  (!stationQuery.fromCode || !stationQuery.toCode) && (
                    <div className="text-xs text-gray-500">
                      Select both stations to automatically identify the railway
                      section.
                    </div>
                  )}
              </div>
            </div>

            {/* MAINTENANCE */}
            <div className="border-t border-gray-100 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                <div>
                  <label className="block text-sm font-semibold text-navy mb-2">
                    Maintenance Type
                  </label>

                  <select
                    value={form.maintenance_type}
                    onChange={update("maintenance_type")}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-navy bg-white focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky"
                  >
                    {Object.keys(MAINTENANCE_TYPES).map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy mb-2">
                    Required Asset
                  </label>

                  <div className="w-full border border-sky/10 bg-sky/5 rounded-xl px-4 py-3">
                    <div className="text-sm font-semibold text-navy">
                      {requiredAsset}
                    </div>

                    <div className="text-[11px] text-gray-500 mt-1">
                      Automatically mapped from maintenance type
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* CONDITIONS */}
            <div className="border-t border-gray-100 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                <div>
                  <label className="block text-sm font-semibold text-navy mb-2">
                    Priority
                  </label>

                  <select
                    value={form.priority}
                    onChange={update("priority")}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-navy bg-white focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy mb-2">
                    Expected Weather
                  </label>

                  <select
                    value={form.weather}
                    onChange={update("weather")}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-navy bg-white focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky"
                  >
                    {WEATHER_OPTIONS.map((weather) => (
                      <option key={weather}>{weather}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy mb-2">
                    Planned Duration
                  </label>

                  <div className="relative">
                    <input
                      type="number"
                      min={30}
                      max={480}
                      required
                      value={form.planned_duration_min}
                      onChange={update("planned_duration_min")}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-20 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky"
                    />

                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">
                      MINUTES
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy mb-2">
                    Planned Date
                  </label>

                  <input
                    type="date"
                    required
                    min={todayStr}
                    value={form.date}
                    onChange={update("date")}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky"
                  />
                </div>

              </div>
            </div>

            {/* PREFERRED WINDOW */}
            <div className="border-t border-gray-100 pt-6">
              <label className="block text-sm font-semibold text-navy mb-3">
                Preferred Operating Window
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {PREFERRED_WINDOWS.map(([value, label]) => (
                  <label
                    key={value}
                    className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                      form.preferred_window === value
                        ? "border-sky bg-sky/5"
                        : "border-gray-200 hover:border-sky/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="window"
                        value={value}
                        checked={form.preferred_window === value}
                        onChange={update("preferred_window")}
                        className="mt-1 accent-sky"
                      />

                      <div>
                        <div className="text-sm font-medium text-navy">
                          {label.split(" · ")[0]}
                        </div>

                        {label.includes(" · ") && (
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {label.split(" · ")[1]}
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="text-[11px] text-gray-400 mt-2">
                This operator preference is captured with the request; the
                current recommendation service ranks all 24 candidate hours.
              </div>
            </div>

            {/* ERROR */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <div className="text-sm font-semibold text-red-700">
                  Recommendation could not be generated
                </div>

                <div className="text-xs text-red-600 mt-1">
                  {error}
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="border-t border-gray-100 pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-navy">
                    Ready to optimize this block?
                  </div>

                  <div className="text-xs text-gray-500 mt-1">
                    RailVinyas will evaluate traffic and operational disruption
                    across candidate hours.
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !resolvedSection}
                  className="inline-flex items-center justify-center gap-2 bg-sky text-white font-semibold px-6 py-3 rounded-xl hover:bg-sky/90 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <span className="animate-spin">◌</span>
                      Evaluating windows...
                    </>
                  ) : (
                    <>
                      ✦
                      Generate AI Recommendation
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </Card>

        {/* RIGHT: AI INTELLIGENCE */}
        <div className="space-y-5">
          <Card className="overflow-hidden p-0">
            <div className="bg-navy px-5 py-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-white/60 font-semibold">
                    Decision Support
                  </div>

                  <h2 className="text-lg font-bold mt-1">
                    AI Planning Intelligence
                  </h2>
                </div>

                <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center">
                  ✦
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-green-400 shadow-[0_0_0_4px_rgba(74,222,128,0.12)]" />
                <span className="text-xs text-white/80">
                  Recommendation engine ready
                </span>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                <div className="text-xs font-semibold text-gray-500">
                  What RailVinyas evaluates
                </div>

                <div className="mt-3 space-y-3">
                  {[
                    ["01", "Section traffic", "Train movement by hour"],
                    ["02", "Maintenance need", "Work type and duration"],
                    ["03", "Asset signal", "Availability of required asset"],
                    ["04", "Overrun risk", "Predicted additional duration"],
                    ["05", "Disruption", "Traffic × expected duration"],
                  ].map(([number, title, subtitle]) => (
                    <div key={number} className="flex gap-3">
                      <div className="h-7 w-7 shrink-0 rounded-lg bg-white border border-gray-200 text-[10px] font-bold text-sky flex items-center justify-center">
                        {number}
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-navy">
                          {title}
                        </div>

                        <div className="text-[11px] text-gray-500">
                          {subtitle}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {resolvedSection ? (
                <div className="rounded-xl border border-green-100 bg-green-50/70 p-4">
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-green-700">
                    Section ready for analysis
                  </div>

                  <div className="text-lg font-bold text-navy mt-1">
                    {resolvedSection.section_id}
                  </div>

                  <div className="text-xs text-gray-500 mt-1">
                    {stationQuery.from} → {stationQuery.to}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-sky/10 bg-sky/5 p-4">
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-sky">
                    Next step
                  </div>

                  <div className="text-sm font-semibold text-navy mt-1">
                    Select a From and To station
                  </div>

                  <div className="text-xs text-gray-500 mt-1 leading-5">
                    The railway section will be resolved automatically before
                    the AI planner is activated.
                  </div>
                </div>
              )}

              <div className="text-[11px] text-gray-400 leading-5">
                Traffic data is derived from real Indian Railways schedules.
                Asset and maintenance-history data is simulated for this
                prototype.
              </div>
            </div>
          </Card>

          {/* QUICK FACTOR CARD */}
          <Card>
            <div className="text-xs uppercase tracking-wide font-semibold text-gray-400">
              Planning context
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] text-gray-400">Work type</div>
                <div className="text-sm font-semibold text-navy mt-1">
                  {form.maintenance_type}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] text-gray-400">Asset</div>
                <div className="text-sm font-semibold text-navy mt-1">
                  {requiredAsset}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] text-gray-400">Priority</div>
                <div className="text-sm font-semibold text-navy mt-1">
                  {form.priority}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] text-gray-400">Weather</div>
                <div className="text-sm font-semibold text-navy mt-1">
                  {form.weather}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* --------------------------------------------------------
          RESULT
      --------------------------------------------------------- */}
      {result && (
        <RecommendationResult
          result={result}
          form={form}
          selectedAsset={selectedAsset}
          topCandidate={topCandidate}
          averageTrains={averageTrains}
        />
      )}
    </div>
  );
}

function RecommendationResult({
  result,
  form,
  selectedAsset,
  topCandidate,
  averageTrains,
}) {
  const maxScore = Math.max(
    ...result.top_5_candidates.map((candidate) =>
      Number(candidate.disruption_score || 0)
    ),
    1
  );

  const bestScore = Number(result.disruption_score || 0);

  return (
    <section className="space-y-5" id="recommendation-result">

      {/* RESULT HEADER */}
      <div className="rounded-2xl border border-sky/15 bg-gradient-to-r from-sky-50 via-white to-green-50 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] font-bold text-sky">
              AI Planning Output
            </div>

            <h2 className="text-2xl font-bold text-navy mt-1">
              Recommended Maintenance Window
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              Optimized for {form.maintenance_type} on {result.section_id}
            </p>
          </div>

          <div className="text-left lg:text-right">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Recommended Start
            </div>

            <div className="text-4xl font-extrabold text-sky leading-none mt-1">
              {formatHour(result.recommended_start_hour)}
            </div>

            <div className="text-xs text-gray-500 mt-1">
              Planned date: {result.date}
            </div>
          </div>
        </div>
      </div>

      {/* METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard
          label="Traffic"
          value={result.traffic_level}
          subtext={`${result.trains_count} trains/hour`}
          accent="green"
        />

        <MetricCard
          label="Expected duration"
          value={`${result.expected_total_duration_min} min`}
          subtext={`Planned ${form.planned_duration_min} min`}
          accent="sky"
        />

        <MetricCard
          label="Predicted overrun"
          value={`${result.predicted_overrun_min} min`}
          subtext="Model estimate"
          accent={Number(result.predicted_overrun_min) > 15 ? "amber" : "green"}
        />

        <MetricCard
          label="Disruption score"
          value={result.disruption_score}
          subtext="Lower is better"
          accent="navy"
        />

        <MetricCard
          label="Avg. traffic"
          value={averageTrains ?? "—"}
          subtext="Across top candidates"
          accent="navy"
        />

        <MetricCard
          label="Asset availability"
          value={
            result.selected_asset
              ? `${Math.round(
                  Number(result.asset_type_availability_pct || 0) * 100
                )}%`
              : "—"
          }
          subtext={selectedAsset?.status || "No asset selected"}
          accent="green"
        />
      </div>

      {/* MAIN RESULT */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,0.8fr)] gap-5">

        <Card>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-navy">
                Candidate Time Windows
              </h3>

              <p className="text-xs text-gray-500 mt-1">
                Ranked by disruption score. Lower score indicates a more
                favorable operating window.
              </p>
            </div>

            <span className="text-xs font-semibold bg-sky/5 border border-sky/10 text-sky rounded-full px-3 py-1.5">
              Top 5
            </span>
          </div>

          <div className="space-y-3">
            {result.top_5_candidates.map((candidate, index) => {
              const score = Number(candidate.disruption_score || 0);
              const width = Math.max((score / maxScore) * 100, 5);
              const isBest =
                Number(candidate.start_hour) ===
                Number(result.recommended_start_hour);

              return (
                <div
                  key={candidate.start_hour}
                  className={`rounded-xl border p-3 ${
                    isBest
                      ? "border-sky/30 bg-sky/5"
                      : "border-gray-100 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 text-center text-xs font-bold text-gray-400">
                      #{index + 1}
                    </div>

                    <div className="w-24">
                      <div className="text-sm font-bold text-navy">
                        {formatHour(candidate.start_hour)}
                      </div>

                      <div className="text-[11px] text-gray-400">
                        {candidate.trains_count} trains/hr
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isBest ? "bg-sky" : "bg-sky/40"
                          }`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>

                    <div className="w-20 text-right">
                      <div className="text-sm font-bold text-navy">
                        {score}
                      </div>

                      {isBest && (
                        <div className="text-[10px] font-semibold text-sky">
                          RECOMMENDED
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-lg bg-green-50 text-green-700 flex items-center justify-center font-bold">
                ✓
              </div>

              <div>
                <h3 className="font-bold text-navy">
                  Why this window?
                </h3>

                <p className="text-xs text-gray-500">
                  Explainable decision signals
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Reason
                title="Lowest modeled disruption"
                text={`The ${formatHour(
                  result.recommended_start_hour
                )} candidate has the lowest disruption score among the evaluated hours shown.`}
              />

              <Reason
                title="Traffic signal considered"
                text={`${result.trains_count} trains/hour are associated with the selected candidate.`}
              />

              <Reason
                title="Duration risk assessed"
                text={`The model predicts ${result.predicted_overrun_min} minutes of additional duration.`}
              />

              <Reason
                title="Asset signal considered"
                text={
                  selectedAsset
                    ? `${selectedAsset.asset_name || selectedAsset.asset_id} is the selected asset for this request.`
                    : "No matching asset was returned for this maintenance type."
                }
              />
            </div>
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-wide font-semibold text-gray-400">
              Selected asset
            </div>

            {selectedAsset ? (
              <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-4">
                <div className="text-sm font-bold text-navy">
                  {selectedAsset.asset_name || selectedAsset.asset_id}
                </div>

                <div className="text-xs text-gray-500 mt-1">
                  ID: {selectedAsset.asset_id}
                </div>

                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-500">
                    Operational status
                  </span>

                  <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-green-50 border border-green-200 text-green-700">
                    {selectedAsset.status}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-500">
                No asset was selected by the recommendation service.
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* FOOTER */}
      <Card className="bg-slate-50/70">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-navy">
              Planning decision summary
            </div>

            <div className="text-xs text-gray-500 mt-1 max-w-3xl">
              RailVinyas AI evaluates section traffic, maintenance duration,
              asset signals and predicted overrun to rank candidate hours.
            </div>

            <div className="text-[11px] text-gray-400 mt-3 leading-5">
              Traffic data is derived from real Indian Railways schedules.
              Asset and maintenance-history data is simulated for this
              prototype. This is a decision-support prototype and not an
              official Indian Railways product.
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-navy hover:border-sky/40 transition"
            >
              Print / Save PDF
            </button>

            {topCandidate && (
              <span className="px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-semibold">
                Best candidate: {formatHour(topCandidate.start_hour)}
              </span>
            )}
          </div>
        </div>
      </Card>

      {bestScore === 0 && (
        <div className="text-[11px] text-gray-400">
          Note: a disruption score of zero can occur where the traffic dataset
          reports no trains for the evaluated hour.
        </div>
      )}
    </section>
  );
}

function Reason({ title, text }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 h-5 w-5 rounded-full bg-green-50 text-green-700 flex items-center justify-center text-xs font-bold shrink-0">
        ✓
      </div>

      <div>
        <div className="text-sm font-semibold text-navy">
          {title}
        </div>

        <div className="text-xs text-gray-500 leading-5 mt-0.5">
          {text}
        </div>
      </div>
    </div>
  );
}