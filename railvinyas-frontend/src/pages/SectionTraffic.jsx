// src/pages/SectionTraffic.jsx
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { Card, Spinner, TrafficBadge } from "../components/ui";

const heatColor = (count) => {
  if (count === 0) return "#F8FAFC";
  if (count < 5) return "#BAE6FD";
  if (count < 10) return "#7DD3FC";
  if (count < 15) return "#38BDF8";
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    if (!q) return data;

    return data.filter(
      (item) =>
        item.section_id?.toLowerCase().includes(q) ||
        item.from_station?.toLowerCase().includes(q) ||
        item.to_station?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const networkStats = useMemo(() => {
    const hours = data.flatMap((row) => row.hours || []);
    const counts = hours.map((h) => Number(h.trains_count || 0));

    const total = counts.reduce((sum, value) => sum + value, 0);
    const highest = counts.length ? Math.max(...counts) : 0;

    const low = hours.filter((h) => h.traffic_level === "LOW").length;
    const high = hours.filter(
      (h) => h.traffic_level === "HIGH" || h.traffic_level === "VERY_HIGH"
    ).length;

    return {
      sections: data.length,
      max: highest,
      low,
      high,
      total,
    };
  }, [data]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* HEADER */}
      <section className="relative overflow-hidden rounded-2xl border border-sky/10 bg-white">
        <div className="h-1 bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />

        <div className="p-6 lg:p-7">
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-sky">
                RailVinyas AI / Network Intelligence
              </div>

              <h1 className="text-3xl font-extrabold text-navy tracking-tight mt-2">
                Traffic Intelligence Center
              </h1>

              <p className="text-sm text-gray-500 mt-2 max-w-3xl leading-6">
                Understand hour-by-hour train movement across monitored
                sections before planning maintenance activity.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 px-4 py-3 w-fit">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />

              <div>
                <div className="text-xs font-bold text-green-700">
                  DATA AVAILABLE
                </div>

                <div className="text-[10px] text-green-700/70">
                  Schedule-derived traffic intelligence
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* NETWORK SNAPSHOT */}
      {!loading && (
        <section>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric
              title="Sections analyzed"
              value={networkStats.sections}
              subtitle="Busiest monitored sections"
              icon="◎"
            />

            <Metric
              title="Peak trains / hour"
              value={networkStats.max}
              subtitle="Highest observed movement"
              icon="≋"
            />

            <Metric
              title="Low-traffic signals"
              value={networkStats.low}
              subtitle="Candidate planning signals"
              icon="✓"
              tone="green"
            />

            <Metric
              title="High-traffic signals"
              value={networkStats.high}
              subtitle="Requires closer planning"
              icon="!"
              tone="amber"
            />
          </div>
        </section>
      )}

      {/* SEARCH + LEGEND */}
      <Card className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-navy">
              Section traffic heatmap
            </div>

            <div className="text-[11px] text-gray-400 mt-1">
              Click a section to inspect its 24-hour traffic profile.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search section or station..."
                className="w-full sm:w-72 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky"
              />
            </div>

            <div className="flex items-center gap-2 text-[10px] text-gray-400 border border-gray-100 rounded-xl px-3 py-2">
              <span className="h-3 w-3 rounded-sm bg-slate-50 border" />
              <span>0</span>

              <span className="h-3 w-3 rounded-sm bg-sky-200" />
              <span>Low</span>

              <span className="h-3 w-3 rounded-sm bg-sky-400" />
              <span>Medium</span>

              <span className="h-3 w-3 rounded-sm bg-sky" />
              <span>High</span>

              <span className="h-3 w-3 rounded-sm bg-navy" />
              <span>Peak</span>
            </div>
          </div>
        </div>
      </Card>

      {/* HEATMAP */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-gray-400">
                24-hour operational profile
              </div>

              <h2 className="font-bold text-navy mt-1">
                Section Traffic Heatmap
              </h2>
            </div>

            <span className="text-xs font-semibold text-gray-400">
              {filtered.length} sections
            </span>
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-8">
            <Spinner label="Loading traffic intelligence..." />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-sm font-semibold text-navy">
              No sections found
            </div>

            <div className="text-xs text-gray-400 mt-1">
              Try another section ID or station name.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-[11px] border-separate border-spacing-1 min-w-[1050px]">
              <thead>
                <tr>
                  <th className="text-left text-gray-400 font-semibold pr-4 sticky left-0 bg-white z-10">
                    SECTION
                  </th>

                  {Array.from({ length: 24 }, (_, hour) => (
                    <th
                      key={hour}
                      className="text-gray-400 font-medium w-7 text-center"
                    >
                      {String(hour).padStart(2, "0")}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.section_id}
                    onClick={() => setSelected(row)}
                    className="cursor-pointer group"
                  >
                    <td className="pr-4 sticky left-0 bg-white z-10">
                      <div className="font-bold text-navy group-hover:text-sky transition">
                        {row.section_id}
                      </div>

                      <div className="text-[9px] text-gray-400 mt-0.5 whitespace-nowrap">
                        {row.from_station} → {row.to_station}
                      </div>
                    </td>

                    {row.hours.map((hour) => (
                      <td
                        key={hour.hour}
                        title={`${hour.trains_count} trains — ${hour.traffic_level}`}
                        style={{
                          backgroundColor: heatColor(hour.trains_count),
                        }}
                        className="w-7 h-7 rounded-md transition-all group-hover:opacity-80"
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-gray-100 bg-slate-50/50 px-5 py-3">
          <p className="text-[10px] text-gray-400">
            Traffic values represent schedule-derived train counts by hour.
            Select a row for detailed section analysis.
          </p>
        </div>
      </Card>

      {/* SELECTED SECTION */}
      {selected && (
        <Card className="overflow-hidden p-0">
          <div className="px-5 py-5 border-b border-gray-100">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-sky">
                  Selected section
                </div>

                <h2 className="text-xl font-bold text-navy mt-1">
                  {selected.section_id}
                </h2>

                <p className="text-xs text-gray-500 mt-1">
                  {selected.from_station} → {selected.to_station}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <TrafficBadge
                  level={
                    selected.hours.find(
                      (h) => h.trains_count ===
                      Math.max(
                        ...selected.hours.map((x) =>
                          Number(x.trains_count || 0)
                        )
                      )
                    )?.traffic_level
                  }
                />

                <button
                  onClick={() => setSelected(null)}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:text-navy hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="flex items-end gap-1.5 h-44">
              {selected.hours.map((hour) => {
                const count = Number(hour.trains_count || 0);

                return (
                  <div
                    key={hour.hour}
                    className="flex-1 h-full flex flex-col justify-end items-center gap-1.5"
                    title={`${count} trains at ${hour.hour}:00`}
                  >
                    <div className="text-[9px] text-gray-400">
                      {count}
                    </div>

                    <div
                      className="w-full rounded-t-md bg-sky/75 hover:bg-sky transition"
                      style={{
                        height: `${Math.max(count * 7, 4)}px`,
                      }}
                    />

                    <div className="text-[9px] text-gray-400">
                      {String(hour.hour).padStart(2, "0")}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl bg-slate-50 border border-slate-100 p-4">
              <div>
                <div className="text-sm font-bold text-navy">
                  Planning signal
                </div>

                <div className="text-xs text-gray-500 mt-1">
                  Lower traffic periods generally provide more favorable
                  conditions for routine maintenance planning.
                </div>
              </div>

              <div className="text-xs font-semibold text-sky">
                24-hour profile
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Metric({ title, value, subtitle, icon, tone = "sky" }) {
  const iconClass =
    tone === "green"
      ? "bg-green-50 text-green-700"
      : tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : "bg-sky/10 text-sky";

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-gray-400">
            {title}
          </div>

          <div className="text-2xl font-extrabold text-navy mt-2">
            {value}
          </div>

          <div className="text-[11px] text-gray-500 mt-1">
            {subtitle}
          </div>
        </div>

        <div className={`h-10 w-10 rounded-xl ${iconClass} flex items-center justify-center font-bold`}>
          {icon}
        </div>
      </div>
    </div>
  );
}