// src/pages/NewBlockRequest.jsx
import { useEffect, useState } from "react";
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
const WEATHER_OPTIONS = ["Clear", "Light Rain", "Heavy Rain", "Fog", "Extreme Heat"];

export default function NewBlockRequest() {
  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);

  const [form, setForm] = useState({
    section_id: "",
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

  useEffect(() => {
    apiFetch("/api/sections")
      .then(setSections)
      .catch((err) => setError(err.message))
      .finally(() => setSectionsLoading(false));
  }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setResult(null); setLoading(true);
    try {
      const res = await apiFetch("/api/recommend", {
        method: "POST",
        body: JSON.stringify({
          section_id: form.section_id,
          maintenance_type: form.maintenance_type,
          required_asset_type: MAINTENANCE_TYPES[form.maintenance_type],
          priority: form.priority,
          weather: form.weather,
          planned_duration_min: Number(form.planned_duration_min),
          date: form.date,
        }),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const requiredAsset = MAINTENANCE_TYPES[form.maintenance_type];
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-navy">New Block Request</h1>
        <p className="text-sm text-gray-500 mt-1">Get an AI-recommended maintenance window for a section</p>
      </div>

      <Card>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-navy mb-1">Section</label>
            {sectionsLoading ? (
              <Spinner label="Loading sections..." />
            ) : (
              <input list="sections-list" required value={form.section_id} onChange={update("section_id")}
                placeholder="Search a section (e.g. CLA-MTN)"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky" />
            )}
            <datalist id="sections-list">
              {sections.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-1">Maintenance Type</label>
            <select value={form.maintenance_type} onChange={update("maintenance_type")}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky">
              {Object.keys(MAINTENANCE_TYPES).map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-1">Required Asset Type</label>
            <input disabled value={requiredAsset}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-1">Priority</label>
            <select value={form.priority} onChange={update("priority")}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky">
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-1">Weather</label>
            <select value={form.weather} onChange={update("weather")}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky">
              {WEATHER_OPTIONS.map((w) => <option key={w}>{w}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-1">Planned Duration (minutes)</label>
            <input type="number" min={30} max={480} required value={form.planned_duration_min}
              onChange={update("planned_duration_min")}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky" />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-1">Date</label>
            <input type="date" required min={todayStr} value={form.date} onChange={update("date")}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky" />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-navy mb-2">Preferred Time Window</label>
            <div className="flex flex-wrap gap-4 text-sm text-navy">
              {[["any", "Any time"], ["night", "Night only (22:00–05:00)"], ["day", "Day only (05:00–22:00)"]].map(([val, lbl]) => (
                <label key={val} className="flex items-center gap-1.5">
                  <input type="radio" name="window" value={val} checked={form.preferred_window === val}
                    onChange={update("preferred_window")} className="accent-sky" />
                  {lbl}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="sm:col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
          )}

          <div className="sm:col-span-2">
            <button type="submit" disabled={loading}
              className="bg-sky text-white font-semibold px-6 py-2.5 rounded-md hover:bg-sky/90 transition-colors disabled:opacity-60">
              {loading ? "Calculating best window..." : "Get Recommendation"}
            </button>
          </div>
        </form>
      </Card>

      {result && <RecommendationResult result={result} form={form} />}
    </div>
  );
}

function RecommendationResult({ result, form }) {
  const maxScore = Math.max(...result.top_5_candidates.map((c) => c.disruption_score), 1);

  return (
    <Card className="border-sky/20">
      <h2 className="font-semibold text-navy mb-4">Recommendation</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div>
          <div className="text-xs text-gray-500">Recommended Start</div>
          <div className="text-2xl font-bold text-sky">{String(result.recommended_start_hour).padStart(2, "0")}:00</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Expected Duration</div>
          <div className="text-lg font-semibold text-navy">{result.expected_total_duration_min} min</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Traffic Level</div>
          <div className="mt-1"><TrafficBadge level={result.traffic_level} /></div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Disruption Score</div>
          <div className="text-lg font-semibold text-navy">{result.disruption_score}</div>
        </div>
      </div>

      {result.selected_asset && (
        <div className="mb-5 text-sm text-navy bg-cardgray/60 rounded-md px-3 py-2">
          Selected asset: <span className="font-semibold">{result.selected_asset.asset_id}</span>
          {" "}({result.selected_asset.asset_name}) — status: {result.selected_asset.status}
        </div>
      )}

      <div className="mb-5">
        <div className="text-sm font-medium text-navy mb-2">Top 5 candidate hours (lower score = better)</div>
        <div className="space-y-1.5">
          {result.top_5_candidates.map((c) => (
            <div key={c.start_hour} className="flex items-center gap-3 text-xs">
              <span className="w-10 text-gray-500">{String(c.start_hour).padStart(2, "0")}:00</span>
              <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden">
                <div className="h-full bg-sky/70 rounded" style={{ width: `${Math.max((c.disruption_score / maxScore) * 100, 2)}%` }} />
              </div>
              <span className="w-16 text-right text-gray-600">{c.disruption_score}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500 bg-cardgray/50 rounded-md px-3 py-2">
        Traffic data is derived from real Indian Railways schedules. Asset and maintenance-history data is simulated for this prototype.
      </p>
    </Card>
  );
}
