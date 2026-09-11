// src/pages/Dashboard.jsx

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { apiFetch } from "../api";
import { Card, Spinner, TrafficBadge } from "../components/ui";


// ============================================================
// HELPERS
// ============================================================

function formatHour(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const text = String(value);

  if (text.includes(":")) {
    return text;
  }

  const hour = Number(text);

  if (Number.isNaN(hour)) {
    return text;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;

  return `${String(displayHour).padStart(2, "0")}:00 ${suffix}`;
}


function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return String(value);
  }

  return number.toLocaleString("en-IN");
}


function unwrapData(response) {
  if (response?.data !== undefined) {
    return response.data;
  }

  return response;
}


// ============================================================
// TRAFFIC COLORS
// ============================================================

const TRAFFIC_COLORS = {
  LOW: "#22C55E",
  MEDIUM: "#F59E0B",
  HIGH: "#F97316",
  VERY_HIGH: "#EF4444",
};


// ============================================================
// SECTION TITLE
// ============================================================

function SectionTitle({
  eyebrow,
  title,
  subtitle,
  action = null,
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">

      <div>
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-sky">
            {eyebrow}
          </div>
        )}

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


// ============================================================
// STAT CARD
// ============================================================

function StatCard({
  label,
  value,
  subtitle,
  icon,
  loading = false,
}) {
  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm animate-pulse">
        <div className="h-3 w-24 bg-gray-100 rounded" />
        <div className="h-8 w-20 bg-gray-100 rounded mt-3" />
        <div className="h-3 w-32 bg-gray-100 rounded mt-3" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">

      <div className="flex items-start justify-between gap-4">

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

        <div className="h-11 w-11 shrink-0 rounded-xl bg-slate-50 border border-slate-100 text-navy flex items-center justify-center text-lg font-bold">
          {icon}
        </div>

      </div>
    </div>
  );
}


// ============================================================
// TRAFFIC DONUT
// ============================================================

function TrafficDonut({
  counts,
  total,
}) {
  if (!total) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-100 p-6 text-center">

        <div className="text-sm font-semibold text-navy">
          No traffic records available
        </div>

        <div className="text-[11px] text-gray-400 mt-1">
          Traffic distribution will appear after planning records are generated.
        </div>

      </div>
    );
  }

  const data = [
    {
      name: "LOW",
      value: counts.LOW,
    },
    {
      name: "MEDIUM",
      value: counts.MEDIUM,
    },
    {
      name: "HIGH",
      value: counts.HIGH,
    },
    {
      name: "VERY_HIGH",
      value: counts.VERY_HIGH,
    },
  ].filter((item) => item.value > 0);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">

      <div className="relative h-40 w-40 shrink-0">

        <ResponsiveContainer width="100%" height="100%">
          <PieChart>

            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={68}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={TRAFFIC_COLORS[entry.name]}
                />
              ))}
            </Pie>

            <Tooltip
              formatter={(value, name) => [
                value,
                String(name).replace("_", " "),
              ]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #E2E8F0",
              }}
            />

          </PieChart>
        </ResponsiveContainer>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">

          <div className="text-xl font-extrabold text-navy">
            {total}
          </div>

          <div className="text-[9px] uppercase tracking-wide text-gray-400">
            records
          </div>

        </div>

      </div>


      <div className="grid grid-cols-2 gap-3 flex-1 w-full">

        {[
          ["LOW", counts.LOW],
          ["MEDIUM", counts.MEDIUM],
          ["HIGH", counts.HIGH],
          ["VERY_HIGH", counts.VERY_HIGH],
        ].map(([level, value]) => (
          <div
            key={level}
            className="rounded-xl bg-slate-50 border border-slate-100 p-3"
          >

            <div className="flex items-center gap-2">

              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: TRAFFIC_COLORS[level],
                }}
              />

              <span className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
                {level.replace("_", " ")}
              </span>

            </div>

            <div className="text-xl font-extrabold text-navy mt-1">
              {value || 0}
            </div>

          </div>
        ))}

      </div>

    </div>
  );
}


// ============================================================
// INTELLIGENCE STEP
// ============================================================

function IntelligenceStep({
  number,
  title,
  description,
}) {
  return (
    <div className="flex items-start gap-3">

      <div className="h-8 w-8 shrink-0 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-[10px] font-bold text-sky">
        {number}
      </div>

      <div>
        <div className="text-sm font-semibold text-white">
          {title}
        </div>

        <div className="text-[11px] text-white/45 mt-0.5 leading-4">
          {description}
        </div>
      </div>

    </div>
  );
}


// ============================================================
// QUICK ACTION — NORMAL
// ============================================================

function NormalActionCard({
  to,
  icon,
  title,
  description,
  action,
}) {
  return (
    <Link
      to={to}
      className="
        group
        bg-white
        border border-gray-100
        rounded-2xl
        p-5
        shadow-sm
        hover:shadow-md
        hover:-translate-y-0.5
        transition-all duration-200
      "
    >

      <div className="flex items-start justify-between">

        <div className="h-11 w-11 rounded-xl bg-slate-50 border border-slate-100 text-navy flex items-center justify-center text-lg font-bold">
          {icon}
        </div>

        <span className="text-lg text-gray-300 group-hover:text-sky transition-colors">
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
        {action} →
      </div>

    </Link>
  );
}


// ============================================================
// WORKFLOW NODE
// ============================================================

function WorkflowNode({
  number,
  title,
  subtitle,
  last = false,
}) {
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
        <div className="hidden lg:block absolute top-1/2 -right-3 -translate-y-1/2 text-gray-300 z-10">
          →
        </div>
      )}

    </div>
  );
}


// ============================================================
// MAIN DASHBOARD
// ============================================================

export default function Dashboard() {

  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [lastUpdated, setLastUpdated] = useState(null);


  // ==========================================================
  // LOAD DASHBOARD DATA
  // ==========================================================

  useEffect(() => {

    let active = true;

    const loadDashboard = async () => {

      setLoading(true);
      setError("");

      try {

        const [
          summaryResponse,
          recentResponse,
        ] = await Promise.all([
          apiFetch("/api/dashboard/summary"),
          apiFetch("/api/dashboard/recent?limit=10"),
        ]);


        if (!active) {
          return;
        }


        const summaryData = unwrapData(summaryResponse);
        const recentData = unwrapData(recentResponse);


        setSummary(summaryData);

        setRecent(
          Array.isArray(recentData)
            ? recentData
            : Array.isArray(recentData?.records)
            ? recentData.records
            : Array.isArray(recentData?.results)
            ? recentData.results
            : []
        );

        setLastUpdated(new Date());

      } catch (err) {

        if (!active) {
          return;
        }

        setError(
          err?.message ||
            "Unable to load RailVinyas operations data."
        );

      } finally {

        if (active) {
          setLoading(false);
        }

      }
    };


    loadDashboard();


    return () => {
      active = false;
    };

  }, []);


  // ==========================================================
  // TRAFFIC COUNTS
  // ==========================================================

  const trafficCounts = useMemo(() => {

    return recent.reduce(
      (acc, row) => {

        const level = row?.traffic_level;

        if (level === "LOW") {
          acc.LOW += 1;
        }

        if (level === "MEDIUM") {
          acc.MEDIUM += 1;
        }

        if (level === "HIGH") {
          acc.HIGH += 1;
        }

        if (level === "VERY_HIGH") {
          acc.VERY_HIGH += 1;
        }

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


  // ==========================================================
  // MAINTENANCE MIX
  // ==========================================================

  const maintenanceMix = useMemo(() => {

    const counter = {};

    recent.forEach((row) => {

      const type = row?.maintenance_type;

      if (!type) {
        return;
      }

      counter[type] =
        (counter[type] || 0) + 1;

    });

    return Object.entries(counter).sort(
      (a, b) => b[1] - a[1]
    );

  }, [recent]);


  const mostCommonMaintenance =
    maintenanceMix[0]?.[0] ||
    "No recent data";


  const latest = recent[0];


  // ==========================================================
  // SAFE SUMMARY VALUES
  // ==========================================================

  const totalSections =
    summary?.total_sections_monitored ??
    summary?.sections_monitored ??
    0;

  const totalAssets =
    summary?.total_assets ??
    summary?.assets_tracked ??
    0;

  const blocksScheduled =
    summary?.blocks_scheduled_this_month ??
    summary?.scheduled_blocks ??
    0;

  const disruptionReduction =
    summary?.avg_disruption_reduction_pct;


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="max-w-[1400px] mx-auto space-y-7 pb-10">


      {/* ======================================================
          HERO
      ======================================================= */}

      <section className="relative overflow-hidden rounded-3xl bg-navy text-white shadow-sm">

        {/* Railway-style tricolor strip */}
        <div className="h-1 bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />

        <div className="relative px-7 py-8 lg:px-9">

          <div className="absolute right-0 top-0 h-full w-72 bg-gradient-to-l from-sky/10 to-transparent pointer-events-none" />

          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-7">

            <div className="max-w-3xl">

              <div className="flex flex-wrap items-center gap-2">

                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] font-bold text-white/80">

                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />

                  RailVinyas AI

                </span>

                <span className="text-white/20">
                  /
                </span>

                <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-white/40">
                  Railway Operations Dashboard
                </span>

              </div>


              <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight mt-5">
                Maintenance Block
                <span className="text-sky">
                  {" "}Planning System
                </span>
              </h1>


              <p className="text-sm leading-6 text-white/55 mt-3 max-w-2xl">
                AI-assisted decision support for selecting lower-disruption
                railway maintenance windows using traffic intelligence,
                maintenance requirements, asset availability and predicted
                operational risk.
              </p>

            </div>


            {/* System status */}

            <div className="lg:w-[260px] shrink-0">

              <div className="rounded-2xl bg-white/5 border border-white/10 p-5">

                <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-white/35">
                  System Status
                </div>


                <div className="flex items-center gap-3 mt-4">

                  <div className="h-10 w-10 rounded-xl bg-green-400/10 flex items-center justify-center">

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


                {lastUpdated && (
                  <div className="border-t border-white/10 mt-5 pt-4">

                    <div className="flex justify-between text-xs">

                      <span className="text-white/35">
                        Dashboard updated
                      </span>

                      <span className="text-white/65 font-medium">
                        {lastUpdated.toLocaleTimeString(
                          "en-IN",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          }
                        )}
                      </span>

                    </div>

                  </div>
                )}

              </div>

            </div>

          </div>

        </div>

      </section>


      {/* ======================================================
          ERROR
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


      {/* ======================================================
          PRIMARY MODULE
          
          THIS IS THE ONLY STRONGLY HIGHLIGHTED SECTION.
      ======================================================= */}

      <section>

        <div className="mb-3">

          <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-sky">
            Primary Operations Module
          </div>

          <div className="text-xs text-gray-400 mt-1">
            Main workflow for railway maintenance block planning.
          </div>

        </div>


        <Link
          to="/new-request"
          className="
            group
            relative
            block
            overflow-hidden
            rounded-2xl
            border-2
            border-sky-400
            bg-gradient-to-br
            from-[#075985]
            to-[#0EA5E9]
            shadow-[0_8px_30px_rgba(14,165,233,0.28)]
            hover:shadow-[0_12px_40px_rgba(14,165,233,0.42)]
            hover:-translate-y-0.5
            transition-all
            duration-300
          "
        >

          {/* Decorative glow */}

          <div className="
            absolute
            -right-20
            -top-20
            h-52
            w-52
            rounded-full
            bg-white/15
            blur-3xl
            group-hover:bg-white/20
            transition
          " />


          {/* Tricolor top line */}

          <div className="h-1 bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />


          <div className="relative p-6 lg:p-7">

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">


              {/* LEFT */}

              <div className="flex items-start gap-5">

                {/* Railway icon */}

                <div className="
                  h-16
                  w-16
                  shrink-0
                  rounded-2xl
                  bg-white/15
                  border
                  border-white/25
                  flex
                  items-center
                  justify-center
                  text-3xl
                  shadow-sm
                ">
                  🚆
                </div>


                <div>

                  {/* Badge */}

                  <div className="
                    inline-flex
                    items-center
                    gap-1.5
                    rounded-full
                    bg-white
                    px-3
                    py-1
                    text-[9px]
                    uppercase
                    tracking-[0.14em]
                    font-extrabold
                    text-[#075985]
                    shadow-sm
                  ">
                    ★ Main Module
                  </div>


                  {/* Title */}

                  <h2 className="
                    text-2xl
                    lg:text-3xl
                    font-extrabold
                    tracking-tight
                    text-white
                    mt-3
                  ">
                    New Block Request
                  </h2>


                  {/* Description */}

                  <p className="
                    text-sm
                    text-white/75
                    mt-2
                    max-w-2xl
                    leading-6
                  ">
                    Start a new railway maintenance planning request.
                    Select the section, maintenance requirement and
                    operating conditions to generate an AI-assisted
                    maintenance window.
                  </p>

                </div>

              </div>


              {/* RIGHT CTA */}

              <div className="shrink-0">

                <div className="
                  flex
                  items-center
                  gap-3
                  rounded-xl
                  bg-white
                  px-5
                  py-3.5
                  text-[#075985]
                  shadow-lg
                  group-hover:bg-slate-50
                  transition
                ">

                  <span className="text-xs font-extrabold uppercase tracking-wide">
                    Start Planning
                  </span>

                  <span className="
                    flex
                    h-8
                    w-8
                    items-center
                    justify-center
                    rounded-full
                    bg-[#075985]
                    text-white
                    text-lg
                    font-bold
                    group-hover:translate-x-1
                    transition
                  ">
                    →
                  </span>

                </div>

              </div>

            </div>


            {/* Bottom information strip */}

            <div className="
              mt-6
              pt-5
              border-t
              border-white/15
              grid
              grid-cols-2
              md:grid-cols-4
              gap-3
            ">

              <div>
                <div className="text-[9px] uppercase tracking-wide text-white/40 font-bold">
                  Traffic
                </div>

                <div className="text-xs font-semibold text-white mt-1">
                  Schedule-aware
                </div>
              </div>


              <div>
                <div className="text-[9px] uppercase tracking-wide text-white/40 font-bold">
                  Assets
                </div>

                <div className="text-xs font-semibold text-white mt-1">
                  Availability-aware
                </div>
              </div>


              <div>
                <div className="text-[9px] uppercase tracking-wide text-white/40 font-bold">
                  Duration
                </div>

                <div className="text-xs font-semibold text-white mt-1">
                  AI-assisted
                </div>
              </div>


              <div>
                <div className="text-[9px] uppercase tracking-wide text-white/40 font-bold">
                  Decision
                </div>

                <div className="text-xs font-semibold text-white mt-1">
                  Disruption-ranked
                </div>
              </div>

            </div>


            <div className="text-[10px] text-white/40 mt-5">
              Decision-support system. Final maintenance authorization remains
              with authorized railway personnel.
            </div>

          </div>

        </Link>

      </section>


      {/* ======================================================
          NETWORK SNAPSHOT
      ======================================================= */}

      <section>

        <SectionTitle
          eyebrow="Network pulse"
          title="Operational Snapshot"
          subtitle="Current planning coverage across the monitored network."
        />


        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <StatCard
                key={index}
                loading
              />
            ))
          ) : (
            <>

              <StatCard
                label="Sections monitored"
                value={formatNumber(totalSections)}
                subtitle="Railway sections represented in the planning network"
                icon="◎"
              />


              <StatCard
                label="Assets tracked"
                value={formatNumber(totalAssets)}
                subtitle="Maintenance assets represented in the system"
                icon="▣"
              />


              <StatCard
                label="Scheduled blocks"
                value={formatNumber(blocksScheduled)}
                subtitle={
                  summary?.blocks_scheduled_reference_month
                    ? `Planning period · ${summary.blocks_scheduled_reference_month}`
                    : "Latest available planning period"
                }
                icon="◷"
              />


              <StatCard
                label="Avg. disruption reduction"
                value={
                  disruptionReduction !== null &&
                  disruptionReduction !== undefined
                    ? `${disruptionReduction}%`
                    : "N/A"
                }
                subtitle="Optimizer vs. baseline evaluation sample"
                icon="↘"
              />

            </>
          )}

        </div>

      </section>


      {/* ======================================================
          INTELLIGENCE PANELS
      ======================================================= */}

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-5">


        {/* TRAFFIC */}

        <Card className="overflow-hidden p-0">

          <div className="px-6 py-5 border-b border-gray-100">

            <SectionTitle
              eyebrow="Traffic intelligence"
              title="Traffic Distribution"
              subtitle="Traffic levels across recent maintenance recommendations."
            />

          </div>


          <div className="p-6">

            {loading ? (
              <Spinner label="Loading traffic intelligence..." />
            ) : (
              <TrafficDonut
                counts={trafficCounts}
                total={trafficTotal}
              />
            )}


            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">


              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">

                <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
                  Dominant maintenance
                </div>

                <div className="text-sm font-bold text-navy mt-2">
                  {mostCommonMaintenance}
                </div>

              </div>


              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">

                <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
                  Low traffic
                </div>

                <div className="text-sm font-bold text-green-700 mt-2">
                  {trafficCounts.LOW}
                </div>

              </div>


              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">

                <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
                  High attention
                </div>

                <div className="text-sm font-bold text-orange-700 mt-2">
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


        {/* AI ENGINE */}

        <div className="rounded-2xl bg-navy overflow-hidden relative shadow-sm">

          <div className="relative p-6">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-white/40">
                  Decision support
                </div>

                <h2 className="text-xl font-extrabold text-white mt-1">
                  Planning Intelligence
                </h2>

              </div>


              <div className="h-10 w-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-sky">
                ✦
              </div>

            </div>


            <div className="flex items-center gap-2 mt-5">

              <span className="h-2 w-2 rounded-full bg-green-400" />

              <span className="text-xs text-white/65">
                Recommendation engine ready
              </span>

            </div>


            <div className="mt-6 space-y-5">

              <IntelligenceStep
                number="01"
                title="Section traffic"
                description="Analyze train movement by section and hour."
              />


              <IntelligenceStep
                number="02"
                title="Maintenance requirement"
                description="Consider work type and planned duration."
              />


              <IntelligenceStep
                number="03"
                title="Asset availability"
                description="Consider availability of the required asset."
              />


              <IntelligenceStep
                number="04"
                title="Overrun prediction"
                description="Estimate additional maintenance duration."
              />


              <IntelligenceStep
                number="05"
                title="Disruption ranking"
                description="Rank candidate hours by expected disruption."
              />

            </div>


            <div className="mt-6 rounded-xl bg-white/5 border border-white/10 p-4">

              <div className="text-[10px] uppercase tracking-wide font-bold text-sky">
                Planning principle
              </div>

              <div className="text-sm font-semibold text-white mt-1">
                Select the maintenance window with lower expected operational
                disruption.
              </div>

            </div>

          </div>

        </div>

      </div>


      {/* ======================================================
          OTHER TOOLS
          
          NORMAL. NO SPECIAL HIGHLIGHT.
      ======================================================= */}

      <section>

        <SectionTitle
          eyebrow="Operator workspace"
          title="Other Tools"
          subtitle="Supporting tools for traffic inspection and performance analysis."
        />


        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">


          <NormalActionCard
            to="/section-traffic"
            icon="≋"
            title="Section Traffic"
            description="Inspect hour-by-hour traffic intensity across monitored railway sections."
            action="View Traffic"
          />


          <NormalActionCard
            to="/reports"
            icon="▤"
            title="Reports & Analytics"
            description="Review previous planning recommendations and analyze system performance."
            action="Open Analytics"
          />

        </div>

      </section>


      {/* ======================================================
          RECENT OPERATIONS
      ======================================================= */}

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
                View reports →
              </Link>
            }
          />

        </div>


        {loading ? (

          <div className="p-6">
            <Spinner label="Loading recent activity..." />
          </div>

        ) : recent.length === 0 ? (

          <div className="p-10 text-center">

            <div className="text-3xl text-gray-300">
              ◎
            </div>

            <div className="text-sm font-semibold text-navy mt-2">
              No recommendations yet
            </div>

            <div className="text-xs text-gray-400 mt-1">
              Create a New Block Request to generate planning records.
            </div>

          </div>

        ) : (

          <>

            {/* Latest signal */}

            {latest && (
              <div className="px-6 py-4 bg-slate-50 border-b border-gray-100">

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

                  <div>

                    <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
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

                    <span className="inline-flex rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs font-bold text-sky">
                      {formatHour(latest.recommended_time)}
                    </span>

                    <TrafficBadge
                      level={latest.traffic_level}
                    />

                  </div>

                </div>

              </div>
            )}


            {/* TABLE */}

            <div className="overflow-x-auto">

              <table className="w-full min-w-[1050px] text-sm">

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
                      className="border-b border-gray-50 last:border-0 hover:bg-slate-50/60 transition"
                    >

                      <td className="px-6 py-4">

                        <div className="font-extrabold text-navy">
                          {row.section_id || "—"}
                        </div>

                        <div className="text-[10px] text-gray-400 mt-0.5">
                          monitored section
                        </div>

                      </td>


                      <td className="px-4 py-4 whitespace-nowrap">

                        <span className="text-gray-600">
                          {row.from_station || "—"}
                        </span>

                        <span className="text-sky font-bold mx-1">
                          →
                        </span>

                        <span className="text-gray-600">
                          {row.to_station || "—"}
                        </span>

                      </td>


                      <td className="px-4 py-4 text-gray-500">
                        {row.date || "—"}
                      </td>


                      <td className="px-4 py-4">

                        <span className="font-medium text-navy">
                          {row.maintenance_type || "—"}
                        </span>

                      </td>


                      <td className="px-4 py-4">

                        <span className="inline-flex rounded-lg bg-slate-50 border border-gray-200 px-3 py-1.5 text-xs font-bold text-sky">
                          {formatHour(row.recommended_time)}
                        </span>

                      </td>


                      <td className="px-4 py-4">

                        <TrafficBadge
                          level={row.traffic_level}
                        />

                      </td>


                      <td className="px-4 py-4 text-gray-600">
                        {row.asset_type || "—"}
                      </td>


                      <td className="px-6 py-4">

                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-xs font-semibold text-gray-600">

                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />

                          {row.status || "Available"}

                        </span>

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>


            <div className="px-6 py-3 bg-slate-50/50 border-t border-gray-100">

              <p className="text-[10px] text-gray-400">
                Records are sourced from the available RailVinyas planning
                dataset. Operational approval remains with authorized railway
                personnel.
              </p>

            </div>

          </>

        )}

      </Card>


      {/* ======================================================
          WORKFLOW
      ======================================================= */}

      <Card>

        <SectionTitle
          eyebrow="Planning workflow"
          title="How RailVinyas Supports the Decision"
          subtitle="Transparent flow from railway data to maintenance planning."
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
            subtitle="Work type and duration"
          />

          <WorkflowNode
            number="03"
            title="Assets"
            subtitle="Required asset availability"
          />

          <WorkflowNode
            number="04"
            title="Risk"
            subtitle="Predicted overrun"
          />

          <WorkflowNode
            number="05"
            title="Decision"
            subtitle="Lower-disruption window"
            last
          />

        </div>

      </Card>


      {/* ======================================================
          DATA DISCLOSURE
      ======================================================= */}

      <div className="text-center px-5">

        <p className="text-[10px] text-gray-400 leading-5 max-w-4xl mx-auto">

          RailVinyas AI is a prototype decision-support system.
          Traffic intelligence is derived from railway schedule data.
          Asset and maintenance-history data may be simulated for prototype
          evaluation where operational datasets are unavailable.
          This is not an official Indian Railways product.

        </p>

      </div>

    </div>
  );
}