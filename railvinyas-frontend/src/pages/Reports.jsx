// src/pages/Reports.jsx
import { Card } from "../components/ui";

// NOTE: requires a backend endpoint logging past block requests/outcomes.
// Shown here as a demo shell with sample data for the ministry walkthrough.
export default function Reports() {
  const rows = [
    { section: "CLA-MTN", type: "Track Repair", date: "2026-03-15", status: "Completed", predicted: 14.6, actual: 12 },
    { section: "BNXR-DDJ", type: "OHE Maintenance", date: "2026-03-14", status: "Approved", predicted: 22.1, actual: "-" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Historical block requests and outcomes (demo data)</p>
        </div>
        <div className="flex gap-2">
          <button className="text-sm border border-gray-200 rounded-md px-3 py-1.5 text-navy hover:bg-cardgray/60">Export CSV</button>
          <button className="text-sm bg-sky text-white rounded-md px-3 py-1.5 hover:bg-sky/90">Export PDF Summary</button>
        </div>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="py-2 pr-4 font-medium">Section</th>
              <th className="py-2 pr-4 font-medium">Maintenance Type</th>
              <th className="py-2 pr-4 font-medium">Date</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Predicted Overrun (min)</th>
              <th className="py-2 pr-4 font-medium">Actual Overrun (min)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="py-2.5 pr-4 font-medium text-navy">{r.section}</td>
                <td className="py-2.5 pr-4 text-gray-600">{r.type}</td>
                <td className="py-2.5 pr-4 text-gray-600">{r.date}</td>
                <td className="py-2.5 pr-4 text-gray-600">{r.status}</td>
                <td className="py-2.5 pr-4 text-gray-600">{r.predicted}</td>
                <td className="py-2.5 pr-4 text-gray-600">{r.actual}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-4">Requires a backend log of past requests — not yet implemented.</p>
      </Card>
    </div>
  );
}
