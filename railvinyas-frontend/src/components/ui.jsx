// src/components/ui.jsx
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ roles, children }) {
  const { session } = useAuth();
  const navigate = useNavigate();

  if (!session) {
    navigate("/login", { replace: true });
    return null;
  }

  if (roles && !roles.includes(session.role)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center text-xl font-bold">
            !
          </div>

          <h2 className="text-xl font-bold text-navy mt-5">
            Access restricted
          </h2>

          <p className="text-sm text-gray-500 mt-2 leading-6">
            You don't have permission to access this section.
          </p>

          <div className="inline-flex mt-4 rounded-full bg-slate-50 border border-gray-200 px-3 py-1.5 text-xs text-gray-500">
            Required role: {roles.join(" or ")}
          </div>
        </div>
      </div>
    );
  }

  return children;
}

const roleColors = {
  Admin: "bg-navy text-white",
  "Section Controller": "bg-sky text-white",
  Viewer: "bg-slate-100 text-navy border border-slate-200",
};

export function RoleBadge({ role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
        roleColors[role] || "bg-slate-100 text-navy"
      }`}
    >
      {role || "User"}
    </span>
  );
}

const trafficColors = {
  LOW: "bg-green-50 text-green-700 border-green-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  VERY_HIGH: "bg-red-50 text-red-700 border-red-200",
};

export function TrafficBadge({ level }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
        trafficColors[level] || "bg-gray-50 text-gray-600 border-gray-200"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          level === "LOW"
            ? "bg-green-500"
            : level === "MEDIUM"
            ? "bg-amber-500"
            : level === "HIGH"
            ? "bg-orange-500"
            : level === "VERY_HIGH"
            ? "bg-red-500"
            : "bg-gray-400"
        }`}
      />
      {level || "UNKNOWN"}
    </span>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div
      className={`bg-white border border-gray-100 rounded-2xl shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function Spinner({ label = "Loading..." }) {
  return (
    <div className="flex items-center gap-3 text-sm text-gray-500 py-5">
      <span className="h-5 w-5 rounded-full border-2 border-sky/20 border-t-sky animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function Toast({ message, type = "error", onClose }) {
  if (!message) return null;

  const styles =
    type === "error"
      ? "bg-red-50 border-red-200 text-red-700"
      : "bg-green-50 border-green-200 text-green-700";

  return (
    <div className="fixed top-5 right-5 z-50 max-w-sm">
      <div
        className={`border rounded-xl px-4 py-3 shadow-lg text-sm ${styles}`}
      >
        <div className="flex items-start gap-3">
          <span className="font-bold">{type === "error" ? "!" : "✓"}</span>

          <span className="flex-1">{message}</span>

          <button
            onClick={onClose}
            className="font-bold opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

export function Layout({ children }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  const navItem =
    "px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200";

  const active =
    "text-sky bg-sky/10 shadow-sm";

  const inactive =
    "text-navy/75 hover:text-sky hover:bg-sky/5";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="h-[3px] bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />

        <div className="max-w-[1400px] mx-auto px-5 lg:px-8 h-[68px] flex items-center justify-between gap-6">
          {/* BRAND */}
          <div
            className="flex items-center gap-3 shrink-0 cursor-pointer"
            onClick={() => navigate("/dashboard")}
          >
            <div className="h-10 w-10 rounded-xl bg-navy text-white flex items-center justify-center font-extrabold shadow-sm">
              RV
            </div>

            <div>
              <div className="text-lg font-extrabold text-navy leading-none">
                RailVinyas
              </div>

              <div className="text-[9px] uppercase tracking-[0.16em] font-semibold text-gray-400 mt-1">
                AI Operations
              </div>
            </div>
          </div>

          {/* NAVIGATION */}
          <nav className="hidden lg:flex items-center gap-1">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `${navItem} ${isActive ? active : inactive}`
              }
            >
              Command Center
            </NavLink>

            {session?.role !== "Viewer" && (
              <NavLink
                to="/new-request"
                className={({ isActive }) =>
                  `${navItem} ${isActive ? active : inactive}`
                }
              >
                Block Planner
              </NavLink>
            )}

            <NavLink
              to="/section-traffic"
              className={({ isActive }) =>
                `${navItem} ${isActive ? active : inactive}`
              }
            >
              Traffic Intelligence
            </NavLink>

            {session?.role !== "Viewer" && (
              <NavLink
                to="/reports"
                className={({ isActive }) =>
                  `${navItem} ${isActive ? active : inactive}`
                }
              >
                Analytics
              </NavLink>
            )}

            {session?.role === "Admin" && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `${navItem} ${isActive ? active : inactive}`
                }
              >
                Administration
              </NavLink>
            )}
          </nav>

          {/* USER AREA */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:block text-right">
              <div className="text-sm font-bold text-navy leading-tight">
                {session?.name}
              </div>

              <div className="text-[10px] text-gray-400 mt-0.5">
                Authorized user
              </div>
            </div>

            <RoleBadge role={session?.role} />

            <button
              onClick={handleLogout}
              className="h-9 w-9 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition"
              title="Log out"
            >
              ⏻
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-5 lg:px-8 py-7">
        {children}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-gray-100 bg-white mt-auto">
        <div className="max-w-[1400px] mx-auto px-5 lg:px-8 py-4">
          <p className="text-[10px] text-gray-400 text-center leading-5">
            Prototype system — traffic data derived from Indian Railways
            schedules; asset and maintenance-history data is simulated for
            demonstration purposes. Not an official Indian Railways product.
          </p>
        </div>
      </footer>
    </div>
  );
}