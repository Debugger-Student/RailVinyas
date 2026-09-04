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
      <div className="p-8 text-center text-navy">
        <p className="text-lg font-semibold">You don't have access to this page.</p>
        <p className="text-sm text-gray-500 mt-1">This section requires: {roles.join(" or ")}</p>
      </div>
    );
  }
  return children;
}

const roleColors = {
  Admin: "bg-navy text-white",
  "Section Controller": "bg-sky text-white",
  Viewer: "bg-gray-200 text-navy",
};

export function RoleBadge({ role }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleColors[role] || "bg-gray-200"}`}>
      {role}
    </span>
  );
}

const trafficColors = {
  LOW: "bg-green-100 text-green-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HIGH: "bg-orange-100 text-orange-700",
  VERY_HIGH: "bg-red-100 text-red-700",
};

export function TrafficBadge({ level }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${trafficColors[level] || "bg-gray-100 text-gray-600"}`}>
      {level}
    </span>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div className={`bg-white border border-gray-100 rounded-lg shadow-sm p-5 ${className}`}>
      {children}
    </div>
  );
}

export function Spinner({ label = "Loading..." }) {
  return (
    <div className="flex items-center gap-2 text-navy/70 text-sm py-4">
      <svg className="animate-spin h-4 w-4 text-sky" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {label}
    </div>
  );
}

export function Toast({ message, type = "error", onClose }) {
  if (!message) return null;
  const styles = type === "error" ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700";
  return (
    <div className={`fixed top-4 right-4 z-50 border rounded-lg px-4 py-3 shadow-md text-sm max-w-sm ${styles}`}>
      <div className="flex justify-between items-start gap-3">
        <span>{message}</span>
        <button onClick={onClose} className="font-bold leading-none">×</button>
      </div>
    </div>
  );
}

export function Layout({ children }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  const navItem = "px-3 py-2 text-sm font-medium rounded-md transition-colors";
  const active = "text-sky bg-sky/10";
  const inactive = "text-navy/80 hover:text-sky hover:bg-sky/5";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-t-[3px] border-b border-gray-100 bg-white sticky top-0 z-40"
        style={{ borderTopImage: "linear-gradient(90deg, #FF9933, #FFFFFF, #138808) 1" }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-navy flex items-center justify-center text-white font-bold text-sm">RV</div>
            <span className="text-lg font-bold text-navy">RailVinyas</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/dashboard" className={({isActive}) => `${navItem} ${isActive ? active : inactive}`}>Dashboard</NavLink>
            {session?.role !== "Viewer" && (
              <NavLink to="/new-request" className={({isActive}) => `${navItem} ${isActive ? active : inactive}`}>New Block Request</NavLink>
            )}
            <NavLink to="/section-traffic" className={({isActive}) => `${navItem} ${isActive ? active : inactive}`}>Section Traffic</NavLink>
            {session?.role !== "Viewer" && (
              <NavLink to="/reports" className={({isActive}) => `${navItem} ${isActive ? active : inactive}`}>Reports</NavLink>
            )}
            {session?.role === "Admin" && (
              <NavLink to="/admin" className={({isActive}) => `${navItem} ${isActive ? active : inactive}`}>Admin Panel</NavLink>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-navy leading-tight">{session?.name}</div>
            </div>
            <RoleBadge role={session?.role} />
            <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-500 transition-colors" title="Log out">
              ⏻
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">{children}</main>

      <footer className="border-t border-gray-100 bg-cardgray/50 py-4 mt-auto">
        <p className="max-w-7xl mx-auto px-6 text-xs text-gray-500 text-center">
          Prototype system — traffic data derived from real Indian Railways schedules; asset and
          maintenance-history data is simulated for demonstration purposes. Not an official Indian Railways product.
        </p>
      </footer>
    </div>
  );
}
