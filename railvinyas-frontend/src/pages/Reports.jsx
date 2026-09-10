// src/pages/Reports.jsx
import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { Card, Spinner } from "../components/ui";

export default function Reports() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiFetch("/api/reports")
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) => r.section_id.toLowerCase().includes(search.toLowerCase())).slice(0, 100);

  const exportCsv = () => {
    const header = Object.keys(rows[0] || {}).join(",");
    const body = rows.map((r) => Object.values(r).join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "railvinyas_evaluation_report.csv"; a.click();
  };

  const avgReduction = rows.length
    ? (100 * (1 - rows.reduce((s, r) => s + r.optimizer_score, 0) / rows.reduce((s, r) => s + r.as_scheduled_score, 0))).toFixed(1)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Optimizer vs. baseline evaluation — {rows.length} real sampled blocks
            {avgReduction && <> · avg. disruption reduction: <span className="font-semibold text-sky">{avgReduction}%</span></>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} disabled={!rows.length}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 text-navy hover:bg-cardgray/60 disabled:opacity-50">
            Export CSV
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {loading && <Spinner label="Loading evaluation results..." />}

      {rows.length > 0 && (
        <Card>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by section..."
            className="w-full sm:w-72 border border-gray-200 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-4 font-medium">Block ID</th>
                  <th className="py-2 pr-4 font-medium">Section</th>
                  <th className="py-2 pr-4 font-medium">Optimizer Score</th>
                  <th className="py-2 pr-4 font-medium">Optimizer Hour</th>
                  <th className="py-2 pr-4 font-medium">As-Scheduled Score</th>
                  <th className="py-2 pr-4 font-medium">As-Scheduled Hour</th>
                  <th className="py-2 pr-4 font-medium">Midnight Baseline</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.block_id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-navy">{r.block_id}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{r.section_id}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{r.optimizer_score.toFixed(1)}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{String(r.optimizer_hour).padStart(2, "0")}:00</td>
                    <td className="py-2.5 pr-4 text-gray-600">{r.as_scheduled_score.toFixed(1)}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{String(r.as_scheduled_hour).padStart(2, "0")}:00</td>
                    <td className="py-2.5 pr-4 text-gray-600">{r.midnight_score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            From the Step 4 optimizer-vs-baseline evaluation notebook. See project documentation for the honest
            caveat on interpreting this comparison.
          </p>
        </Card>
      )}
    </div>
  );
}
