// src/pages/Dashboard.jsx
import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { Card, TrafficBadge, Spinner } from "../components/ui";

// NOTE: the backend doesn't yet expose a dedicated dashboard-summary or
// recent-recommendations-log endpoint -- those need to be added server-side
// (e.g. by logging each /api/recommend call to a table). Until then this
// page shows illustrative placeholder summary numbers, clearly marked, and
// pulls the real section count live from GET /api/sections.
export default function Dashboard() {
  const [sectionCount, setSectionCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/sections")
      .then((sections) => setSectionCount(sections.length))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const summaryCards = [
    { label: "Sections Monitored", value: loading ? "…" : sectionCount ?? "—", live: true },
    { label: "Total Assets", value: 400, live: false },
    { label: "Blocks Scheduled (30d)", value: 128, live: false },
    { label: "Avg. Disruption Reduction", value: "97%", live: false },
  ];

  // Placeholder recent-recommendations rows -- wire this to a real
  // GET /api/blocks/recent endpoint once it exists server-side.
  const recentRows = [
    { section: "CLA-MTN", date: "2026-03-15", type: "Track Repair", time: "02:00", traffic: "LOW", asset: "TA005", status: "Approved" },
    { section: "BNXR-DDJ", date: "2026-03-14", type: "OHE Maintenance", time: "01:00", traffic: "LOW", asset: "OH012", status: "Pending" },
    { section: "MLND-TNA", date: "2026-03-12", type: "Ballast Renewal", time: "03:00", traffic: "MEDIUM", asset: "BA003", status: "Completed" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of block planning activity across monitored sections</p>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((c) => (
          <Card key={c.label} className="bg-cardgray/60 border-0">
            <div className="text-xs text-gray-500 font-medium">{c.label}{!c.live && <span className="text-gray-300"> (demo)</span>}</div>
            <div className="text-2xl font-bold text-navy mt-1">{c.value}</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-navy">Recent Block Recommendations</h2>
          <span className="text-xs text-gray-400">Demo data — connect to a real log endpoint</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-4 font-medium">Section</th>
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Maintenance Type</th>
                <th className="py-2 pr-4 font-medium">Recommended Time</th>
                <th className="py-2 pr-4 font-medium">Traffic</th>
                <th className="py-2 pr-4 font-medium">Asset</th>
                <th className="py-2 pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-navy">{r.section}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{r.date}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{r.type}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{r.time}</td>
                  <td className="py-2.5 pr-4"><TrafficBadge level={r.traffic} /></td>
                  <td className="py-2.5 pr-4 text-gray-600">{r.asset}</td>
                  <td className="py-2.5 pr-4">
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {loading && <Spinner label="Loading section data..." />}
    </div>
  );
}
