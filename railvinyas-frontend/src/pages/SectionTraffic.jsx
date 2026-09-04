// src/pages/SectionTraffic.jsx
import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { Card, Spinner } from "../components/ui";

// NOTE: the backend has 03_section_traffic_derived.csv, but no API route
// yet exposes it for a heatmap across many sections at once. This page
// lists real section IDs (from /api/sections) and lets you search them --
// swap the placeholder heatmap for a real one once a
// GET /api/sections/{id}/traffic endpoint exists.
export default function SectionTraffic() {
  const [sections, setSections] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/sections").then(setSections).finally(() => setLoading(false));
  }, []);

  const filtered = sections.filter((s) => s.toLowerCase().includes(search.toLowerCase())).slice(0, 50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Section Traffic</h1>
        <p className="text-sm text-gray-500 mt-1">Real sections derived from Indian Railways schedules</p>
      </div>

      <Card>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by section ID..."
          className="w-full sm:w-80 border border-gray-200 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky" />

        {loading ? <Spinner label="Loading sections..." /> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {filtered.map((s) => (
              <div key={s} className="text-sm bg-cardgray/60 rounded-md px-3 py-2 text-navy font-medium">{s}</div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-4">
          Full hour-by-hour heatmap requires a backend endpoint exposing 03_section_traffic_derived.csv — not yet built.
        </p>
      </Card>
    </div>
  );
}
