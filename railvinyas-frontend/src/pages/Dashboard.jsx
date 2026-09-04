// src/pages/Dashboard.jsx
import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { Card, TrafficBadge, Spinner } from "../components/ui";

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch("/api/dashboard/summary"),
      apiFetch("/api/dashboard/recent?limit=10"),
    ])
      .then(([s, r]) => { setSummary(s); setRecent(r); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const cards = summary ? [
    { label: "Sections Monitored", value: summary.total_sections_monitored },
    { label: "Total Assets", value: summary.total_assets },
    { label: `Blocks Scheduled (${summary.blocks_scheduled_reference_month})`, value: summary.blocks_scheduled_this_month },
    { label: "Avg. Disruption Reduction",
      value: summary.avg_disruption_reduction_pct != null ? `${summary.avg_disruption_reduction_pct}%` : "N/A" },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of block planning activity across monitored sections</p>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {loading && <Spinner label="Loading dashboard data..." />}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Card key={c.label} className="bg-cardgray/60 border-0">
              <div className="text-xs text-gray-500 font-medium">{c.label}</div>
              <div className="text-2xl font-bold text-navy mt-1">{c.value}</div>
            </Card>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <Card>
          <h2 className="font-semibold text-navy mb-3">Recent Block Recommendations</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-4 font-medium">Section</th>
                  <th className="py-2 pr-4 font-medium">From → To</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Maintenance Type</th>
                  <th className="py-2 pr-4 font-medium">Recommended Time</th>
                  <th className="py-2 pr-4 font-medium">Traffic</th>
                  <th className="py-2 pr-4 font-medium">Asset</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-navy">{r.section_id}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{r.from_station} → {r.to_station}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{r.date}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{r.maintenance_type}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{r.recommended_time}</td>
                    <td className="py-2.5 pr-4"><TrafficBadge level={r.traffic_level} /></td>
                    <td className="py-2.5 pr-4 text-gray-600">{r.asset_type}</td>
                    <td className="py-2.5 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">Shown from the maintenance dataset. Live requests you submit appear via /api/blocks/log.</p>
        </Card>
      )}
    </div>
  );
}
