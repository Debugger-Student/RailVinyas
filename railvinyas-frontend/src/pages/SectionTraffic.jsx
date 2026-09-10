// src/pages/SectionTraffic.jsx
import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { Card, Spinner } from "../components/ui";

const heatColor = (count) => {
  if (count === 0) return "#F1F5F9";
  if (count < 5) return "#BAE6FD";
  if (count < 10) return "#38BDF8";
  if (count < 15) return "#0EA5E9";
  return "#0C4A6E";
};

export default function SectionTraffic() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    apiFetch("/api/section-traffic/heatmap?limit=40")
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = data.filter((d) =>
    d.section_id.toLowerCase().includes(search.toLowerCase()) ||
    d.from_station.toLowerCase().includes(search.toLowerCase()) ||
    d.to_station.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Section Traffic</h1>
        <p className="text-sm text-gray-500 mt-1">
          Real hour-by-hour train counts for the {data.length} busiest sections, derived from actual Indian Railways schedules
        </p>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <Card>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by section or station name..."
          className="w-full sm:w-80 border border-gray-200 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky" />

        {loading ? <Spinner label="Loading traffic data..." /> : (
          <div className="overflow-x-auto">
            <table className="text-xs border-separate border-spacing-0.5">
              <thead>
                <tr>
                  <th className="text-left text-gray-500 font-medium pr-3 sticky left-0 bg-white">Section</th>
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} className="text-gray-400 font-normal w-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.section_id} onClick={() => setSelected(row)} className="cursor-pointer">
                    <td className="pr-3 font-medium text-navy whitespace-nowrap sticky left-0 bg-white">
                      {row.section_id}
                    </td>
                    {row.hours.map((h) => (
                      <td key={h.hour} title={`${h.trains_count} trains — ${h.traffic_level}`}
                        style={{ backgroundColor: heatColor(h.trains_count) }}
                        className="w-6 h-6 rounded-sm" />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-navy">
              {selected.section_id} — {selected.from_station} → {selected.to_station}
            </h2>
            <button onClick={() => setSelected(null)} className="text-sm text-gray-400 hover:text-navy">Close</button>
          </div>
          <div className="flex items-end gap-1 h-32">
            {selected.hours.map((h) => (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-sky/70 rounded-t" style={{ height: `${Math.max(h.trains_count * 6, 2)}px` }} />
                <span className="text-[10px] text-gray-400">{h.hour}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">Hover a cell in the table above for exact train counts per hour.</p>
        </Card>
      )}
    </div>
  );
}
