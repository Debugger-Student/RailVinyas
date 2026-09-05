// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { Card, Spinner, TrafficBadge } from "../components/ui";

function formatHour(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const text = String(value);

  if (text.includes(":")) return text;

  const hour = Number(text);

  if (Number.isNaN(hour)) return text;

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;

  return `${String(displayHour).padStart(2, "0")}:00 ${suffix}`;
}

function StatCard({
  label,
  value,
  subtitle,
  icon,
  accent = "sky",
  glow = false,
}) {
  const styles = {
    sky: {
      icon: "bg-sky/10 text-sky",
      border: "border-sky/10",
    },
    green: {
      icon: "bg-green-50 text-green-700",
      border: "border-green-100",
    },
    amber: {
      icon: "bg-amber-50 text-amber-700",
      border: "border-amber-100",
    },
    navy: {
      icon: "bg-slate-100 text-navy",
      border: "border-slate-200",
    },
  };

  const style = styles[accent] || styles.sky;

  return (
    <div
      className={`group relative overflow-hidden bg-white border ${
        style.border
      } rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ${
        glow ? "ring-1 ring-sky/5" : ""
      }`}
    >
      <div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-sky/5 blur-2xl opacity-0 group-hover:opacity-100 transition" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-gray-400">
            {label}
          </div>

          <div className="text-3xl font-extrabold tracking-tight text-navy mt-2">
            {value}
          </div>

          <div className="text-[11px] text-gray-500 mt-1.5 leading-5">
            {subtitle}
          </div>
        </div>

        <div
          className={`h-11 w-11 rounded-xl ${style.icon} flex items-center justify-center text-lg font-bold shrink-0`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ eyebrow, title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-sky">
          {eyebrow}
        </div>

        <h2 className="text-lg font-extrabold text-navy mt-1">
          {title}
        </h2>

        {subtitle && (
          <p className="text-xs text-gray-500 mt-1 leading-5">
            {subtitle}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

function TrafficDistribution({ counts, total }) {
  if (!total) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
        <div className="text-xs font-semibold text-navy">
          No traffic signals available
        </div>
        <div className="text-[11px] text-gray-400 mt-1">
          Traffic distribution will appear when recommendation records are
          available.
        </div>
      </div>
    );
  }

  const low = ((counts.LOW || 0) / total) * 100;
  const medium = ((counts.MEDIUM || 0) / total) * 100;
  const high = ((counts.HIGH || 0) / total) * 100;
  const veryHigh = ((counts.VERY_HIGH || 0) / total) * 100;

  return (
    <div>
      <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex">
        <div
          className="bg-green-500"
          style={{ width: `${low}%` }}
        />
        <div
          className="bg-amber-400"
          style={{ width: `${medium}%` }}
        />
        <div
          className="bg-orange-500"
          style={{ width: `${high}%` }}
        />
        <div
          className="bg-red-500"
          style={{ width: `${veryHigh}%` }}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        <TrafficLegend
          label="LOW"
          value={counts.LOW}
          dot="bg-green-500"
        />

        <TrafficLegend
          label="MEDIUM"
          value={counts.MEDIUM}
          dot="bg-amber-400"
        />

        <TrafficLegend
          label="HIGH"
          value={counts.HIGH}
          dot="bg-orange-500"
        />

        <TrafficLegend
          label="VERY HIGH"
          value={counts.VERY_HIGH}
          dot="bg-red-500"
        />
      </div>
    </div>
  );
}

function TrafficLegend({ label, value, dot }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
          {label}
        </span>
      </div>

      <div className="text-xl font-extrabold text-navy mt-1">
        {value}
      </div>

      <div className="text-[10px] text-gray-400">
        recent records
      </div>
    </div>
  );
}

function IntelligenceStep({ number, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 shrink-0 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-[10px] font-bold text-sky">
        {number}
      </div>

      <div>
        <div className="text-sm font-semibold text-white">
          {title}
        </div>

        <div className="text-[11px] text-white/45 mt-0.5">
          {description}
        </div>
      </div>
    </div>
  );
}

function WorkflowNode({ number, title, subtitle, last }) {
  return (
    <div className="relative flex-1">
      <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 h-full">
        <div className="text-[10px] font-bold text-sky">
          {number}
        </div>

        <div className="text-sm font-bold text-navy mt-1">
          {title}
        </div>

        <div className="text-[11px] text-gray-500 mt-1 leading-4">
          {subtitle}
        </div>
      </div>

      {!last && (
        <div className="hidden lg:block absolute top-1/2 -right-3 text-gray-300 z-10">
          →
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([
      apiFetch("/api/dashboard/summary"),
      apiFetch("/api/dashboard/recent?limit=10"),
    ])
      .then(([summaryData, recentData]) => {
        if (!active) return;

        setSummary(summaryData);
        setRecent(
          Array.isArray(recentData)
            ? recentData
            : []
        );
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err.message ||
            "Unable to load RailVinyas operations data."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const trafficCounts = useMemo(() => {
    return recent.reduce(
      (acc, row) => {
        const level = row?.traffic_level;

        if (level === "LOW") acc.LOW += 1;
        if (level === "MEDIUM") acc.MEDIUM += 1;
        if (level === "HIGH") acc.HIGH += 1;
        if (level === "VERY_HIGH") acc.VERY_HIGH += 1;

        return acc;
      },
      {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        VERY_HIGH: 0,
      }
    );
  }, [recent]);

  const trafficTotal =
    trafficCounts.LOW +
    trafficCounts.MEDIUM +
    trafficCounts.HIGH +
    trafficCounts.VERY_HIGH;

  const lowTrafficShare = trafficTotal
    ? Math.round(
        (trafficCounts.LOW / trafficTotal) * 100
      )
    : 0;

  const maintenanceMix = useMemo(() => {
    const counter = {};

    recent.forEach((row) => {
      if (!row?.maintenance_type) return;

      counter[row.maintenance_type] =
        (counter[row.maintenance_type] || 0) + 1;
    });

    return Object.entries(counter).sort(
      (a, b) => b[1] - a[1]
    );
  }, [recent]);

  const mostCommonMaintenance =
    maintenanceMix[0]?.[0] || "No recent data";

  const latest = recent[0];

  return (
    <div className="max-w-[1400px] mx-auto space-y-7 pb-10">

      {/* ======================================================
          HERO
      ======================================================= */}
      <section className="relative overflow-hidden rounded-3xl bg-navy text-white shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-navy via-navy to-[#0F557D]" />

        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky/10 blur-3xl" />
        <div className="absolute -left-16 bottom-[-120px] h-72 w-72 rounded-full bg-sky/5 blur-3xl" />

        <div className="h-1 bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />

        <div className="relative p-7 lg:p-9">
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-8">

            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] font-bold text-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  RailVinyas AI
                </span>

                <span className="text-white/20">/</span>

                <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-white/45">
                  Operations Command Center
                </span>
              </div>

              <h1 className="text-3xl lg:text-5xl font-extrabold tracking-tight mt-5 leading-tight">
                Railway Maintenance
                <br />
                <span className="text-sky">
                  Intelligence Platform
                </span>
              </h1>

              <p className="max-w-2xl text-sm lg:text-base leading-7 text-white/60 mt-5">
                AI-assisted maintenance planning that uses operational
                traffic signals, asset information and predicted overrun
                risk to support lower-disruption maintenance windows.
              </p>

              <div className="flex flex-wrap gap-3 mt-7">
                <Link
                  to="/new-request"
                  className="inline-flex items-center gap-2 rounded-xl bg-sky text-white px-5 py-3 text-sm font-bold hover:bg-sky/90 transition shadow-lg"
                >
                  ✦ Plan Maintenance Block
                </Link>

                <Link
                  to="/section-traffic"
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 border border-white/10 text-white px-5 py-3 text-sm font-semibold hover:bg-white/15 transition"
                >
                  Explore Traffic Intelligence →
                </Link>
              </div>
            </div>

            <div className="xl:w-[300px]">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-sm">
                <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-white/40">
                  System Status
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <div className="h-10 w-10 rounded-xl bg-green-400/10 border border-green-400/10 flex items-center justify-center">
                    <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  </div>

                  <div>
                    <div className="font-bold text-white">
                      Operational
                    </div>

                    <div className="text-[11px] text-white/40">
                      Planning services available
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/10 mt-5 pt-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">
                      Recent records
                    </span>

                    <span className="font-bold text-white">
                      {recent.length}
                    </span>
                  </div>

                  <div className="flex justify-between text-xs mt-3">
                    <span className="text-white/40">
                      Low-traffic share
                    </span>

                    <span className="font-bold text-green-300">
                      {lowTrafficShare}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ======================================================
          ERROR / LOADING
      ======================================================= */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-sm font-semibold text-red-700">
            Dashboard unavailable
          </div>

          <div className="text-xs text-red-600 mt-1">
            {error}
          </div>
        </div>
      )}

      {loading && (
        <Card className="p-6">
          <Spinner label="Loading RailVinyas intelligence..." />
        </Card>
      )}

      {/* ======================================================
          NETWORK PULSE
      ======================================================= */}
      {summary && (
        <section>
          <SectionTitle
            eyebrow="Network pulse"
            title="Operational Snapshot"
            subtitle="Current planning coverage across the monitored network."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

            <StatCard
              label="Sections monitored"
              value={summary.total_sections_monitored}
              subtitle="Railway sections represented in the planning network"
              icon="◎"
              accent="sky"
              glow
            />

            <StatCard
              label="Assets tracked"
              value={summary.total_assets}
              subtitle="Maintenance assets represented in the system"
              icon="▣"
              accent="navy"
            />

            <StatCard
              label="Scheduled blocks"
              value={summary.blocks_scheduled_this_month}
              subtitle={
                summary.blocks_scheduled_reference_month
                  ? `Planning period · ${summary.blocks_scheduled_reference_month}`
                  : "Latest available planning period"
              }
              icon="◷"
              accent="amber"
            />

            <StatCard
              label="Avg. disruption reduction"
              value={
                summary.avg_disruption_reduction_pct != null
                  ? `${summary.avg_disruption_reduction_pct}%`
                  : "N/A"
              }
              subtitle="Indicator reported by dashboard service"
              icon="↘"
              accent="green"
              glow
            />

          </div>
        </section>
      )}

      {/* ======================================================
          INTELLIGENCE PANELS
      ======================================================= */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-5">

        {/* TRAFFIC */}
        <Card className="overflow-hidden p-0">
          <div className="px-6 py-5 border-b border-gray-100">
            <SectionTitle
              eyebrow="Traffic intelligence"
              title="Network Traffic Distribution"
              subtitle="Traffic levels across the latest recommendation records."
            />
          </div>

          <div className="p-6">
            <TrafficDistribution
              counts={trafficCounts}
              total={trafficTotal}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">

              <div className="rounded-xl border border-gray-100 bg-slate-50 p-4">
                <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
                  Dominant maintenance
                </div>

                <div className="text-sm font-bold text-navy mt-2">
                  {mostCommonMaintenance}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-slate-50 p-4">
                <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
                  Low-traffic signals
                </div>

                <div className="text-sm font-bold text-green-700 mt-2">
                  {trafficCounts.LOW}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-slate-50 p-4">
                <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
                  High attention
                </div>

                <div className="text-sm font-bold text-amber-700 mt-2">
                  {trafficCounts.HIGH +
                    trafficCounts.VERY_HIGH}
                </div>
              </div>

            </div>

            <Link
              to="/section-traffic"
              className="inline-flex items-center gap-2 text-xs font-bold text-sky mt-5 hover:gap-3 transition-all"
            >
              Open Traffic Intelligence →
            </Link>
          </div>
        </Card>

        {/* AI */}
        <div className="rounded-2xl bg-navy overflow-hidden relative shadow-sm">
          <div className="absolute -right-10 -top-10 h-40 w-40 bg-sky/10 rounded-full blur-3xl" />

          <div className="relative p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-white/40">
                  AI decision engine
                </div>

                <h2 className="text-xl font-extrabold text-white mt-1">
                  Decision Intelligence
                </h2>
              </div>

              <div className="h-11 w-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-sky text-lg">
                ✦
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <IntelligenceStep
                number="01"
                title="Traffic signal"
                description="Analyze train movement by section and hour."
              />

              <IntelligenceStep
                number="02"
                title="Maintenance requirement"
                description="Consider work type and planned duration."
              />

              <IntelligenceStep
                number="03"
                title="Asset signal"
                description="Consider availability of the required asset."
              />

              <IntelligenceStep
                number="04"
                title="Overrun prediction"
                description="Estimate additional maintenance duration."
              />

              <IntelligenceStep
                number="05"
                title="Planning decision"
                description="Rank candidate hours by disruption score."
              />
            </div>

            <div className="mt-6 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide font-bold text-sky">
                Engine status
              </div>

              <div className="flex items-center gap-2 mt-1">
                <span className="h-2 w-2 rounded-full bg-green-400" />

                <span className="text-sm font-semibold text-white">
                  Ready for maintenance planning
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================
          QUICK ACTIONS
      ======================================================= */}
      <section>
        <SectionTitle
          eyebrow="Operator workspace"
          title="Quick Actions"
          subtitle="Move directly to the tools used for planning and analysis."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <QuickAction
            to="/new-request"
            icon="✦"
            title="Plan a Maintenance Block"
            description="Select a station pair and generate an AI-assisted maintenance window."
            label="Open Planner"
          />

          <QuickAction
            to="/section-traffic"
            icon="≋"
            title="Inspect Section Traffic"
            description="Explore hour-by-hour traffic intensity across monitored sections."
            label="View Traffic"
          />

          <QuickAction
            to="/reports"
            icon="▤"
            title="Analyze Planning Performance"
            description="Compare optimizer results against baseline scheduling scenarios."
            label="Open Analytics"
          />

        </div>
      </section>

      {/* ======================================================
          RECENT OPERATIONS
      ======================================================= */}
      {recent.length > 0 && (
        <Card className="overflow-hidden p-0">

          <div className="px-6 py-5 border-b border-gray-100">
            <SectionTitle
              eyebrow="Planning activity"
              title="Recent Maintenance Recommendations"
              subtitle="Latest available recommendation records."
              action={
                <Link
                  to="/reports"
                  className="text-xs font-bold text-sky hover:underline"
                >
                  View analytics →
                </Link>
              }
            />
          </div>

          {latest && (
            <div className="px-6 py-4 bg-sky/5 border-b border-sky/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-bold text-sky">
                    Latest planning signal
                  </div>

                  <div className="text-sm font-bold text-navy mt-1">
                    {latest.section_id}
                    {" · "}
                    {latest.from_station}
                    {" → "}
                    {latest.to_station}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded-lg bg-white border border-sky/10 px-3 py-1.5 text-xs font-bold text-sky">
                    {formatHour(latest.recommended_time)}
                  </span>

                  <TrafficBadge
                    level={latest.traffic_level}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">

              <thead>
                <tr className="bg-slate-50 border-b border-gray-100 text-left">
                  <th className="px-6 py-3 text-[10px] uppercase tracking-wide font-bold text-gray-400">
                    Section
                  </th>

                  <th className="px-4 py-3 text-[10px] uppercase tracking-wide font-bold text-gray-400">
                    Route
                  </th>

                  <th className="px-4 py-3 text-[10px] uppercase tracking-wide font-bold text-gray-400">
                    Date
                  </th>

                  <th className="px-4 py-3 text-[10px] uppercase tracking-wide font-bold text-gray-400">
                    Maintenance
                  </th>

                  <th className="px-4 py-3 text-[10px] uppercase tracking-wide font-bold text-gray-400">
                    AI Window
                  </th>

                  <th className="px-4 py-3 text-[10px] uppercase tracking-wide font-bold text-gray-400">
                    Traffic
                  </th>

                  <th className="px-4 py-3 text-[10px] uppercase tracking-wide font-bold text-gray-400">
                    Asset
                  </th>

                  <th className="px-6 py-3 text-[10px] uppercase tracking-wide font-bold text-gray-400">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {recent.map((row, index) => (
                  <tr
                    key={`${row.section_id}-${row.date}-${index}`}
                    className="border-b border-gray-50 last:border-0 hover:bg-slate-50/70 transition"
                  >

                    <td className="px-6 py-4">
                      <div className="font-extrabold text-navy">
                        {row.section_id}
                      </div>

                      <div className="text-[10px] text-gray-400 mt-0.5">
                        monitored section
                      </div>
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-gray-600">
                        {row.from_station}
                      </span>

                      <span className="text-sky font-bold mx-1">
                        →
                      </span>

                      <span className="text-gray-600">
                        {row.to_station}
                      </span>
                    </td>

                    <td className="px-4 py-4 text-gray-500">
                      {row.date}
                    </td>

                    <td className="px-4 py-4">
                      <span className="font-medium text-navy">
                        {row.maintenance_type}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-lg bg-sky/5 border border-sky/10 px-3 py-1.5 text-xs font-bold text-sky">
                        {formatHour(row.recommended_time)}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <TrafficBadge
                        level={row.traffic_level}
                      />
                    </td>

                    <td className="px-4 py-4 text-gray-600">
                      {row.asset_type}
                    </td>

                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-xs font-semibold text-gray-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        {row.status}
                      </span>
                    </td>

                  </tr>
                ))}
              </tbody>

            </table>
          </div>

          <div className="px-6 py-3 bg-slate-50/50 border-t border-gray-100">
            <p className="text-[10px] text-gray-400">
              Records are sourced from the available maintenance planning
              dataset. Operational approval remains with authorized railway
              personnel.
            </p>
          </div>
        </Card>
      )}

      {/* ======================================================
          WORKFLOW
      ======================================================= */}
      <Card className="overflow-hidden">
        <div className="p-6">
          <SectionTitle
            eyebrow="How it works"
            title="From Railway Data to Maintenance Decision"
            subtitle="A transparent view of the RailVinyas planning workflow."
          />

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <WorkflowNode
              number="01"
              title="Traffic"
              subtitle="Train movement signals"
            />

            <WorkflowNode
              number="02"
              title="Maintenance"
              subtitle="Work type & duration"
            />

            <WorkflowNode
              number="03"
              title="Assets"
              subtitle="Availability signal"
            />

            <WorkflowNode
              number="04"
              title="Risk"
              subtitle="Overrun prediction"
            />

            <WorkflowNode
              number="05"
              title="Decision"
              subtitle="Optimal candidate window"
              last
            />
          </div>
        </div>
      </Card>

      {/* ======================================================
          FOOTER NOTE
      ======================================================= */}
      <div className="text-center px-4">
        <p className="text-[10px] text-gray-400 leading-5">
          RailVinyas AI is a prototype decision-support system. Traffic data
          is derived from Indian Railways schedules, while asset and
          maintenance-history data is simulated for demonstration purposes.
          It is not an official Indian Railways product.
        </p>
      </div>
    </div>
  );
}

function QuickAction({
  to,
  icon,
  title,
  description,
  label,
}) {
  return (
    <Link
      to={to}
      className="group bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="h-11 w-11 rounded-xl bg-sky/10 text-sky flex items-center justify-center font-bold text-lg">
          {icon}
        </div>

        <span className="text-gray-300 group-hover:text-sky transition text-lg">
          →
        </span>
      </div>

      <h3 className="text-base font-bold text-navy mt-5">
        {title}
      </h3>

      <p className="text-xs text-gray-500 mt-2 leading-5">
        {description}
      </p>

      <div className="text-xs font-bold text-sky mt-4">
        {label} →
      </div>
    </Link>
  );
}