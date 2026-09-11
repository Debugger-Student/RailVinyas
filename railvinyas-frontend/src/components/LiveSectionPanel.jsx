// src/components/LiveSectionPanel.jsx
//
// Control-room-style schematic of a railway section.
//
// Data source:
//   - Schedule-projected trains: calculated from timetable data.
//
// IMPORTANT:
// This component is rendered inside NewBlockRequest's main <form>.
// Therefore, buttons in this component use type="button"
// so they do not submit the outer New Block Request form.
//
// GPS Live:
//   Clicking GPS Live opens the dedicated Live Train Availability
//   dashboard at /live-trains.
//

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

const SIGNAL_COLORS = {
  green: "#22C55E",
  yellow: "#F59E0B",
  red: "#EF4444",
};

function SignalPost({ x, aspect, label }) {
  const color =
    SIGNAL_COLORS[aspect] || SIGNAL_COLORS.green;

  return (
    <g>
      <line
        x1={x}
        y1={70}
        x2={x}
        y2={40}
        stroke="#94A3B8"
        strokeWidth="2"
      />

      <rect
        x={x - 9}
        y={22}
        width="18"
        height="22"
        rx="3"
        fill="#1E293B"
      />

      <circle
        cx={x}
        cy={33}
        r="6"
        fill={color}
      >
        <animate
          attributeName="opacity"
          values="1;0.55;1"
          dur="1.6s"
          repeatCount="indefinite"
        />
      </circle>

      <text
        x={x}
        y={16}
        textAnchor="middle"
        fontSize="9"
        fill="#64748B"
        fontWeight="600"
      >
        {label}
      </text>
    </g>
  );
}

function TrainIcon({
  x,
  y,
  color,
  label,
  live,
}) {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{
        transition: "transform 1.4s linear",
      }}
    >
      {live && (
        <circle
          r="14"
          fill={color}
          opacity="0.18"
        >
          <animate
            attributeName="r"
            values="10;16;10"
            dur="1.4s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      <rect
        x="-11"
        y="-6"
        width="22"
        height="12"
        rx="3"
        fill={color}
        stroke="#0C4A6E"
        strokeWidth="0.5"
      />

      <circle
        cx="-6"
        cy="7"
        r="2.3"
        fill="#0C4A6E"
      />

      <circle
        cx="6"
        cy="7"
        r="2.3"
        fill="#0C4A6E"
      />

      <title>{label}</title>
    </g>
  );
}

const TRACK_X0 = 70;
const TRACK_X1 = 730;
const TRACK_Y = 70;

export default function LiveSectionPanel({
  sectionId,
  fromName,
  toName,
}) {
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const pollRef = useRef(null);

  // ---------------------------------------------------------------
  // Load schedule-projected section data
  // ---------------------------------------------------------------

  useEffect(() => {
    if (!sectionId) {
      return;
    }

    const fetchProjection = () => {
      apiFetch(
        `/api/live/section/${encodeURIComponent(
          sectionId
        )}/projection`
      )
        .then((response) => {
          setData(response);
          setError("");
        })
        .catch((err) => {
          setError(
            err?.message ||
              "Could not load live section data"
          );
        });
    };

    fetchProjection();

    pollRef.current = setInterval(
      fetchProjection,
      8000
    );

    return () => {
      clearInterval(pollRef.current);
    };
  }, [sectionId]);

  // ---------------------------------------------------------------
  // Open dedicated Live Train Availability dashboard
  // ---------------------------------------------------------------

  const openLiveTrains = () => {
    const params = new URLSearchParams();

    if (sectionId) {
      params.set("section", sectionId);
    }

    if (fromName) {
      params.set("from", fromName);
    }

    if (toName) {
      params.set("to", toName);
    }

    navigate(`/live-trains?${params.toString()}`);
  };

  // ---------------------------------------------------------------
  // Nothing to render without a section
  // ---------------------------------------------------------------

  if (!sectionId) {
    return null;
  }

  const signal =
    data?.signal_aspect || "green";

  const trains =
    data?.active_trains || [];

  return (
    <div className="rounded-2xl bg-navy overflow-hidden relative shadow-lg border border-white/5">

      {/* Decorative background */}
      <div className="absolute -right-16 -top-16 h-56 w-56 bg-sky/10 rounded-full blur-3xl" />

      {/* =========================================================
          HEADER
          ========================================================= */}

      <div className="relative px-6 pt-5 pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">

          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-sky">
              Live Section Panel
            </div>

            <h3 className="text-base font-bold text-white mt-0.5">
              {sectionId} — Control View
            </h3>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-white/50">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />

            {data
              ? `Updated ${data.as_of}`
              : "Connecting..."}
          </div>

        </div>
      </div>

      {/* =========================================================
          RAILWAY SCHEMATIC
          ========================================================= */}

      <div className="px-4 pb-1">

        <svg
          viewBox="0 0 800 90"
          className="w-full h-auto"
        >

          {/* Sleepers */}
          {Array.from({ length: 34 }).map(
            (_, index) => (
              <line
                key={index}
                x1={
                  TRACK_X0 +
                  index * 20
                }
                y1={TRACK_Y - 6}
                x2={
                  TRACK_X0 +
                  index * 20 -
                  6
                }
                y2={TRACK_Y + 6}
                stroke="#334155"
                strokeWidth="2"
              />
            )
          )}

          {/* Track */}
          <line
            x1={TRACK_X0}
            y1={TRACK_Y}
            x2={TRACK_X1}
            y2={TRACK_Y}
            stroke="#64748B"
            strokeWidth="3"
          />

          {/* From station */}
          <circle
            cx={TRACK_X0}
            cy={TRACK_Y}
            r="4"
            fill="#0EA5E9"
          />

          <text
            x={TRACK_X0}
            y={TRACK_Y + 20}
            textAnchor="start"
            fontSize="10"
            fill="#CBD5E1"
            fontWeight="600"
          >
            {fromName || "From"}
          </text>

          {/* To station */}
          <circle
            cx={TRACK_X1}
            cy={TRACK_Y}
            r="4"
            fill="#0EA5E9"
          />

          <text
            x={TRACK_X1}
            y={TRACK_Y + 20}
            textAnchor="end"
            fontSize="10"
            fill="#CBD5E1"
            fontWeight="600"
          >
            {toName || "To"}
          </text>

          {/* Signal A */}
          <SignalPost
            x={TRACK_X0 + 30}
            aspect={signal}
            label="SIG A"
          />

          {/* Signal B */}
          <SignalPost
            x={TRACK_X1 - 30}
            aspect={signal}
            label="SIG B"
          />

          {/* =====================================================
              SCHEDULE-PROJECTED TRAINS
              ===================================================== */}

          {trains.map((train, index) => (
            <TrainIcon
              key={`${train.train_no}-${index}`}
              x={
                TRACK_X0 +
                train.progress *
                  (TRACK_X1 -
                    TRACK_X0)
              }
              y={TRACK_Y}
              color="#0EA5E9"
              live
              label={`${train.train_no} ${train.train_name} · ${train.direction} · ETA ${train.eta_minutes}m (schedule-projected)`}
            />
          ))}

        </svg>
      </div>

      {/* =========================================================
          LEGEND
          ========================================================= */}

      <div className="px-6 pb-4 flex items-center justify-between flex-wrap gap-3">

        <div className="flex items-center gap-4 text-[10px] text-white/50">

          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky" />
            Schedule-projected
          </span>

          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Live monitoring
          </span>

        </div>

        <div className="text-[10px] text-white/40">
          {trains.length} train
          {trains.length !== 1
            ? "s"
            : ""}{" "}
          active now
        </div>

      </div>

      {/* =========================================================
          SECTION ERROR
          ========================================================= */}

      {error && (
        <div className="px-6 pb-3 text-[11px] text-red-300">
          {error}
        </div>
      )}

      {/* =========================================================
          LIVE TRAIN AVAILABILITY
          
          GPS Live now opens the dedicated dashboard page.
          
          No <form> here because this component is already
          inside NewBlockRequest's outer <form>.
          ========================================================= */}

      <div className="border-t border-white/10 px-6 py-4">

        <div className="flex items-center justify-between gap-4 flex-wrap">

          <div>
            <div className="text-xs font-semibold text-white">
              Live Train Availability
            </div>

            <div className="text-[10px] text-white/40 mt-1">
              View all upcoming trains scheduled
              within the next 3 hours.
            </div>
          </div>

          <button
            type="button"
            onClick={openLiveTrains}
            className="text-xs font-bold bg-amber-400 text-navy px-4 py-2 rounded-lg hover:bg-amber-300 transition"
          >
            GPS Live →
          </button>

        </div>

      </div>

    </div>
  );
}