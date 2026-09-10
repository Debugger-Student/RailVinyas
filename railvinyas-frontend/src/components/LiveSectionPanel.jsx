// src/components/LiveSectionPanel.jsx
//
// A control-room-style schematic of a railway section: track, signal
// aspect, and live train positions. Two distinct data sources, kept
// visually and textually separate so nobody mistakes one for the other:
//
//   - "Schedule-projected" trains (sky-blue): computed from the real
//     timetable against the current clock. Always available, free,
//     no external dependency.
//   - "GPS Live" train (amber, via the RailRadar lookup): a specific
//     train number looked up by the user, genuinely live -- but a
//     third-party feed, not an official Indian Railways source.
//
import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "../api";

const SIGNAL_COLORS = {
  green: "#22C55E",
  yellow: "#F59E0B",
  red: "#EF4444",
};

function SignalPost({ x, aspect, label }) {
  const color = SIGNAL_COLORS[aspect] || SIGNAL_COLORS.green;
  return (
    <g>
      <line x1={x} y1={70} x2={x} y2={40} stroke="#94A3B8" strokeWidth="2" />
      <rect x={x - 9} y={22} width="18" height="22" rx="3" fill="#1E293B" />
      <circle cx={x} cy={33} r="6" fill={color}>
        <animate attributeName="opacity" values="1;0.55;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <text x={x} y={16} textAnchor="middle" fontSize="9" fill="#64748B" fontWeight="600">
        {label}
      </text>
    </g>
  );
}

function TrainIcon({ x, y, color, label, live }) {
  return (
    <g transform={`translate(${x}, ${y})`} style={{ transition: "transform 1.4s linear" }}>
      {live && (
        <circle r="14" fill={color} opacity="0.18">
          <animate attributeName="r" values="10;16;10" dur="1.4s" repeatCount="indefinite" />
        </circle>
      )}
      <rect x="-11" y="-6" width="22" height="12" rx="3" fill={color} stroke="#0C4A6E" strokeWidth="0.5" />
      <circle cx="-6" cy="7" r="2.3" fill="#0C4A6E" />
      <circle cx="6" cy="7" r="2.3" fill="#0C4A6E" />
      <title>{label}</title>
    </g>
  );
}

const TRACK_X0 = 70;
const TRACK_X1 = 730;
const TRACK_Y = 70;

export default function LiveSectionPanel({ sectionId, fromName, toName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [gpsQuery, setGpsQuery] = useState("");
  const [gpsResult, setGpsResult] = useState(null);
  const [gpsError, setGpsError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!sectionId) return;

    const fetchProjection = () => {
      apiFetch(`/api/live/section/${encodeURIComponent(sectionId)}/projection`)
        .then((d) => { setData(d); setError(""); })
        .catch((err) => setError(err.message || "Could not load live section data"));
    };

    fetchProjection();
    pollRef.current = setInterval(fetchProjection, 8000);
    return () => clearInterval(pollRef.current);
  }, [sectionId]);

  const trackLive = async (e) => {
    e.preventDefault();
    setGpsError(""); setGpsResult(null);
    if (!gpsQuery.trim()) return;
    setGpsLoading(true);
    try {
      const res = await apiFetch(`/api/live/train/${encodeURIComponent(gpsQuery.trim())}`);
      setGpsResult(res);
    } catch (err) {
      setGpsError(err instanceof ApiError ? err.message : "Lookup failed.");
    } finally {
      setGpsLoading(false);
    }
  };

  if (!sectionId) return null;

  const signal = data?.signal_aspect || "green";
  const trains = data?.active_trains || [];

  return (
    <div className="rounded-2xl bg-navy overflow-hidden relative shadow-lg border border-white/5">
      <div className="absolute -right-16 -top-16 h-56 w-56 bg-sky/10 rounded-full blur-3xl" />
      <div className="relative px-6 pt-5 pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-sky">Live Section Panel</div>
            <h3 className="text-base font-bold text-white mt-0.5">{sectionId} — Control View</h3>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-white/50">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            {data ? `Updated ${data.as_of}` : "Connecting..."}
          </div>
        </div>
      </div>

      <div className="px-4 pb-1">
        <svg viewBox="0 0 800 90" className="w-full h-auto">
          {/* sleepers */}
          {Array.from({ length: 34 }).map((_, i) => (
            <line key={i} x1={TRACK_X0 + i * 20} y1={TRACK_Y - 6} x2={TRACK_X0 + i * 20 - 6} y2={TRACK_Y + 6}
              stroke="#334155" strokeWidth="2" />
          ))}
          <line x1={TRACK_X0} y1={TRACK_Y} x2={TRACK_X1} y2={TRACK_Y} stroke="#64748B" strokeWidth="3" />

          <circle cx={TRACK_X0} cy={TRACK_Y} r="4" fill="#0EA5E9" />
          <text x={TRACK_X0} y={TRACK_Y + 20} textAnchor="start" fontSize="10" fill="#CBD5E1" fontWeight="600">
            {fromName || "From"}
          </text>
          <circle cx={TRACK_X1} cy={TRACK_Y} r="4" fill="#0EA5E9" />
          <text x={TRACK_X1} y={TRACK_Y + 20} textAnchor="end" fontSize="10" fill="#CBD5E1" fontWeight="600">
            {toName || "To"}
          </text>

          <SignalPost x={TRACK_X0 + 30} aspect={signal} label="SIG A" />
          <SignalPost x={TRACK_X1 - 30} aspect={signal} label="SIG B" />

          {trains.map((tr, i) => (
            <TrainIcon
              key={tr.train_no + i}
              x={TRACK_X0 + tr.progress * (TRACK_X1 - TRACK_X0)}
              y={TRACK_Y}
              color="#0EA5E9"
              live
              label={`${tr.train_no} ${tr.train_name} · ${tr.direction} · ETA ${tr.eta_minutes}m (schedule-projected)`}
            />
          ))}

          {gpsResult && gpsResult.latitude != null && (
            <TrainIcon x={TRACK_X0 + (TRACK_X1 - TRACK_X0) / 2} y={TRACK_Y - 24} color="#F59E0B" live
              label={`GPS live: ${gpsQuery} — third-party (RailRadar)`} />
          )}
        </svg>
      </div>

      <div className="px-6 pb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 text-[10px] text-white/50">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky" /> Schedule-projected</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> GPS live (RailRadar)</span>
        </div>
        <div className="text-[10px] text-white/40">{trains.length} train{trains.length !== 1 ? "s" : ""} active now</div>
      </div>

      {error && <div className="px-6 pb-3 text-[11px] text-red-300">{error}</div>}

      <div className="border-t border-white/10 px-6 py-4">
        <form onSubmit={trackLive} className="flex items-center gap-2">
          <input value={gpsQuery} onChange={(e) => setGpsQuery(e.target.value)}
            placeholder="Track a specific train live (e.g. 12919) — optional"
            className="flex-1 bg-white/10 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-sky/50" />
          <button type="submit" disabled={gpsLoading}
            className="text-xs font-semibold bg-amber-400/90 text-navy px-3 py-1.5 rounded-md hover:bg-amber-400 transition disabled:opacity-50">
            {gpsLoading ? "..." : "GPS Track"}
          </button>
        </form>
        {gpsError && <p className="text-[11px] text-amber-300/80 mt-2">{gpsError}</p>}
        {gpsResult && !gpsError && (
          <p className="text-[11px] text-amber-200 mt-2">
            {JSON.stringify(gpsResult).slice(0, 160)}… — {gpsResult.disclosure}
          </p>
        )}
      </div>
    </div>
  );
}
