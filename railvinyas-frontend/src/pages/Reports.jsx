// src/pages/Reports.jsx
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { Card, Spinner } from "../components/ui";

export default function Reports() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiFetch("/api/reports")
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return rows.slice(0, 100);

    return rows
      .filter(
        (row) =>
          row.section_id?.toLowerCase().includes(query) ||
          row.block_id?.toLowerCase().includes(query)
      )
      .slice(0, 100);
  }, [rows, search]);

  const metrics = useMemo(() => {
    if (!rows.length) {
      return {
        avgReduction: null,
        optimizerWins: 0,
        totalBlocks: 0,
        avgOptimizerScore: 0,
      };
    }

    const optimizerTotal = rows.reduce(
      (sum, row) => sum + Number(row.optimizer_score || 0),
      0
    );

    const scheduledTotal = rows.reduce(
      (sum, row) => sum + Number(row.as_scheduled_score || 0),
      0
    );

    const optimizerWins = rows.filter(
      (row) =>
        Number(row.optimizer_score) <
        Number(row.as_scheduled_score)
    ).length;

    const avgReduction =
      scheduledTotal > 0
        ? (100 * (1 - optimizerTotal / scheduledTotal)).toFixed(1)
        : null;

    return {
      avgReduction,
      optimizerWins,
      totalBlocks: rows.length,
      avgOptimizerScore: (optimizerTotal / rows.length).toFixed(1),
    };
  }, [rows]);

  const exportCsv = () => {
    if (!rows.length) return;

    const keys = Object.keys(rows[0]);

    const escapeCsv = (value) => {
      const stringValue = String(value ?? "");
      return `"${stringValue.replace(/"/g, '""')}"`;
    };

    const csv = [
      keys.map(escapeCsv).join(","),
      ...rows.map((row) =>
        keys.map((key) => escapeCsv(row[key])).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "railvinyas_evaluation_report.csv";
    anchor.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* HEADER */}
      <section className="relative overflow-hidden rounded-2xl bg-white border border-sky/10">
        <div className="h-1 bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />

        <div className="p-6 lg:p-7">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-sky">
                RailVinyas AI / Performance Analytics
              </div>

              <h1 className="text-3xl font-extrabold text-navy tracking-tight mt-2">
                Maintenance & Operations Analytics
              </h1>

              <p className="text-sm text-gray-500 mt-2 max-w-3xl leading-6">
                Compare AI-optimized maintenance windows against available
                baseline planning scenarios.
              </p>
            </div>

            <button
              onClick={exportCsv}
              disabled={!rows.length}
              className="px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy/90 disabled:opacity-40 transition"
            >
              ↓ Export CSV
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <Card className="p-6">
          <Spinner label="Loading evaluation analytics..." />
        </Card>
      )}

      {!loading && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <Metric
              title="Evaluated blocks"
              value={metrics.totalBlocks}
              subtitle="Available evaluation records"
              icon="▣"
            />

            <Metric
              title="Optimizer improvement"
              value={
                metrics.avgReduction !== null
                  ? `${metrics.avgReduction}%`
                  : "N/A"
              }
              subtitle="Average score reduction"
              icon="↘"
              tone="green"
            />

            <Metric
              title="Optimizer wins"
              value={`${metrics.optimizerWins}/${metrics.totalBlocks}`}
              subtitle="Better than as-scheduled score"
              icon="✓"
              tone="sky"
            />

            <Metric
              title="Avg optimizer score"
              value={metrics.avgOptimizerScore || "0.0"}
              subtitle="Lower score is preferable"
              icon="◎"
              tone="amber"
            />
          </div>

          {/* EXPLANATION */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-5">

            <Card className="p-6">
              <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-gray-400">
                Evaluation logic
              </div>

              <h2 className="text-lg font-bold text-navy mt-1">
                What the comparison shows
              </h2>

              <p className="text-sm text-gray-500 leading-6 mt-3">
                Each sampled block is evaluated against alternative planning
                scenarios. The optimizer score is compared with the
                as-scheduled score to understand whether a lower-disruption
                window was identified.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                <Explain
                  number="01"
                  title="Optimizer"
                  text="AI-selected planning window"
                />

                <Explain
                  number="02"
                  title="As scheduled"
                  text="Reference operating scenario"
                />

                <Explain
                  number="03"
                  title="Midnight"
                  text="Simple baseline comparator"
                />
              </div>
            </Card>

            <Card className="bg-navy text-white border-0 p-6">
              <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-white/50">
                Evaluation signal
              </div>

              <div className="text-4xl font-extrabold text-white mt-2">
                {metrics.avgReduction !== null
                  ? `${metrics.avgReduction}%`
                  : "N/A"}
              </div>

              <div className="text-sm text-white/60 mt-2">
                Average score reduction versus the as-scheduled baseline.
              </div>

              <div className="mt-5 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky"
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(Number(metrics.avgReduction || 0), 100)
                    )}%`,
                  }}
                />
              </div>

              <div className="text-[11px] text-white/40 mt-3">
                Lower disruption score indicates a more favorable planning
                outcome.
              </div>
            </Card>
          </div>

          {/* TABLE */}
          {rows.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="px-5 py-5 border-b border-gray-100">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-gray-400">
                      Evaluation records
                    </div>

                    <h2 className="text-lg font-bold text-navy mt-1">
                      Optimizer vs Baseline
                    </h2>

                    <p className="text-xs text-gray-500 mt-1">
                      Showing up to 100 records.
                    </p>
                  </div>

                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search block or section..."
                    className="w-full md:w-72 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-gray-100 text-left">
                      {[
                        "Block ID",
                        "Section",
                        "Optimizer Score",
                        "Optimizer Hour",
                        "Scheduled Score",
                        "Scheduled Hour",
                        "Midnight Baseline",
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="px-5 py-3 text-[10px] uppercase tracking-wide font-bold text-gray-400"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map((row) => {
                      const better =
                        Number(row.optimizer_score) <
                        Number(row.as_scheduled_score);

                      return (
                        <tr
                          key={row.block_id}
                          className="border-b border-gray-50 last:border-0 hover:bg-slate-50/70 transition"
                        >
                          <td className="px-5 py-4 font-bold text-navy">
                            {row.block_id}
                          </td>

                          <td className="px-5 py-4 text-gray-600">
                            {row.section_id}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`font-bold ${
                                better
                                  ? "text-green-700"
                                  : "text-navy"
                              }`}
                            >
                              {Number(row.optimizer_score).toFixed(1)}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <span className="inline-flex rounded-lg bg-sky/5 border border-sky/10 px-2.5 py-1.5 text-xs font-bold text-sky">
                              {String(row.optimizer_hour).padStart(2, "0")}:00
                            </span>
                          </td>

                          <td className="px-5 py-4 text-gray-600">
                            {Number(row.as_scheduled_score).toFixed(1)}
                          </td>

                          <td className="px-5 py-4 text-gray-600">
                            {String(row.as_scheduled_hour).padStart(2, "0")}:00
                          </td>

                          <td className="px-5 py-4 text-gray-600">
                            {Number(row.midnight_score).toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-4 border-t border-gray-100 bg-slate-50/50">
                <p className="text-[10px] text-gray-400 leading-5">
                  These results come from the project evaluation dataset.
                  They are intended to demonstrate comparative planning
                  performance and should not be interpreted as live railway
                  operating statistics.
                </p>
              </div>
            </Card>
          )}
        </>
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
      <div className="flex justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
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

function Explain({ number, title, text }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
      <div className="text-[10px] font-bold text-sky">{number}</div>

      <div className="text-sm font-bold text-navy mt-1">
        {title}
      </div>

      <div className="text-[11px] text-gray-500 mt-1">
        {text}
      </div>
    </div>
  );
}