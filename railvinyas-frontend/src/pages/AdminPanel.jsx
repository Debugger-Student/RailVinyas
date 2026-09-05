// src/pages/AdminPanel.jsx
import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "../api";
import { Card, RoleBadge, Spinner, Toast } from "../components/ui";

const ROLES = ["Admin", "Section Controller", "Viewer"];
const ASSET_STATUSES = ["Available", "In Use", "Under Repair"];

export default function AdminPanel() {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    setError("");

    Promise.all([
      apiFetch("/api/admin/users"),
      apiFetch("/api/assets"),
    ])
      .then(([userData, assetData]) => {
        setUsers(Array.isArray(userData) ? userData : []);
        setAssets(Array.isArray(assetData) ? assetData : []);
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to load administration data."
        )
      )
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filteredUsers = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return users;

    return users.filter(
      (user) =>
        user.name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query)
    );
  }, [users, search]);

  const filteredAssets = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return assets.slice(0, 100);

    return assets
      .filter(
        (asset) =>
          asset.asset_id?.toLowerCase().includes(query) ||
          asset.asset_type?.toLowerCase().includes(query) ||
          asset.home_section_id?.toLowerCase().includes(query)
      )
      .slice(0, 100);
  }, [assets, search]);

  const assetStats = useMemo(() => {
    return {
      available: assets.filter((a) => a.status === "Available").length,
      inUse: assets.filter((a) => a.status === "In Use").length,
      repair: assets.filter((a) => a.status === "Under Repair").length,
    };
  }, [assets]);

  const changeRole = async (userId, role) => {
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });

      setUsers((current) =>
        current.map((user) =>
          user.id === userId ? { ...user, role } : user
        )
      );

      setToast("User role updated successfully.");
    } catch (err) {
      setToast(err.message || "Failed to update user role.");
    }
  };

  const changeAssetStatus = async (assetId, status) => {
    try {
      await apiFetch(`/api/assets/${assetId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setAssets((current) =>
        current.map((asset) =>
          asset.asset_id === assetId
            ? { ...asset, status }
            : asset
        )
      );

      setToast("Asset status updated successfully.");
    } catch (err) {
      setToast(err.message || "Failed to update asset status.");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      <Toast
        message={toast}
        type="success"
        onClose={() => setToast("")}
      />

      {/* HEADER */}
      <section className="bg-white border border-sky/10 rounded-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />

        <div className="p-6 lg:p-7">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-sky">
                RailVinyas AI / Administration
              </div>

              <h1 className="text-3xl font-extrabold text-navy tracking-tight mt-2">
                System Administration
              </h1>

              <p className="text-sm text-gray-500 mt-2">
                Manage users, roles and maintenance assets across the
                RailVinyas prototype.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 px-4 py-3 w-fit">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />

              <div>
                <div className="text-xs font-bold text-green-700">
                  ADMIN ACCESS
                </div>

                <div className="text-[10px] text-green-700/70">
                  Management controls enabled
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

      {/* MANAGEMENT SNAPSHOT */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric
            title="Registered users"
            value={users.length}
            subtitle="System accounts"
            icon="◎"
          />

          <Metric
            title="Tracked assets"
            value={assets.length}
            subtitle="Maintenance assets"
            icon="▣"
          />

          <Metric
            title="Available assets"
            value={assetStats.available}
            subtitle="Currently available"
            tone="green"
            icon="✓"
          />

          <Metric
            title="Under repair"
            value={assetStats.repair}
            subtitle="Requires attention"
            tone="amber"
            icon="!"
          />
        </div>
      )}

      {/* TABS */}
      <Card className="p-2">
        <div className="flex flex-col sm:flex-row gap-2">
          {[
            ["users", "User Management", "Manage accounts and roles"],
            ["assets", "Asset Management", "Monitor asset status"],
          ].map(([value, title, description]) => (
            <button
              key={value}
              onClick={() => {
                setTab(value);
                setSearch("");
              }}
              className={`flex-1 text-left rounded-xl px-4 py-3 transition ${
                tab === value
                  ? "bg-navy text-white shadow-sm"
                  : "hover:bg-slate-50 text-navy"
              }`}
            >
              <div className="text-sm font-bold">{title}</div>

              <div
                className={`text-[10px] mt-1 ${
                  tab === value
                    ? "text-white/60"
                    : "text-gray-400"
                }`}
              >
                {description}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {loading ? (
        <Card className="p-6">
          <Spinner label="Loading administration data..." />
        </Card>
      ) : (
        <>
          {/* USERS */}
          {tab === "users" && (
            <Card className="p-0 overflow-hidden">
              <div className="px-5 py-5 border-b border-gray-100">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
                      Access management
                    </div>

                    <h2 className="text-lg font-bold text-navy mt-1">
                      System Users
                    </h2>
                  </div>

                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or email..."
                    className="w-full md:w-72 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-gray-100 text-left">
                      <TableHeading>Name</TableHeading>
                      <TableHeading>Email</TableHeading>
                      <TableHeading>Role</TableHeading>
                      <TableHeading>Created</TableHeading>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-gray-50 last:border-0 hover:bg-slate-50/70"
                      >
                        <td className="px-5 py-4">
                          <div className="font-bold text-navy">
                            {user.name}
                          </div>

                          <div className="text-[10px] text-gray-400 mt-0.5">
                            User ID #{user.id}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-gray-600">
                          {user.email}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <RoleBadge role={user.role} />

                            <select
                              value={user.role}
                              onChange={(e) =>
                                changeRole(
                                  user.id,
                                  e.target.value
                                )
                              }
                              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-navy bg-white"
                            >
                              {ROLES.map((role) => (
                                <option key={role}>{role}</option>
                              ))}
                            </select>
                          </div>
                        </td>

                        <td className="px-5 py-4 text-gray-500">
                          {user.created_at?.split("T")[0] || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ASSETS */}
          {tab === "assets" && (
            <Card className="p-0 overflow-hidden">
              <div className="px-5 py-5 border-b border-gray-100">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
                      Operational assets
                    </div>

                    <h2 className="text-lg font-bold text-navy mt-1">
                      Maintenance Asset Register
                    </h2>
                  </div>

                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search asset or section..."
                    className="w-full md:w-72 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-gray-100 text-left">
                      <TableHeading>Asset</TableHeading>
                      <TableHeading>Type</TableHeading>
                      <TableHeading>Home Section</TableHeading>
                      <TableHeading>Status</TableHeading>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredAssets.map((asset) => (
                      <tr
                        key={asset.asset_id}
                        className="border-b border-gray-50 last:border-0 hover:bg-slate-50/70"
                      >
                        <td className="px-5 py-4">
                          <div className="font-bold text-navy">
                            {asset.asset_id}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-gray-600">
                          {asset.asset_type}
                        </td>

                        <td className="px-5 py-4 text-gray-600">
                          {asset.home_section_id}
                        </td>

                        <td className="px-5 py-4">
                          <select
                            value={asset.status}
                            onChange={(e) =>
                              changeAssetStatus(
                                asset.asset_id,
                                e.target.value
                              )
                            }
                            className={`text-xs font-semibold border rounded-lg px-2.5 py-1.5 ${
                              asset.status === "Available"
                                ? "bg-green-50 border-green-200 text-green-700"
                                : asset.status === "Under Repair"
                                ? "bg-amber-50 border-amber-200 text-amber-700"
                                : "bg-slate-50 border-gray-200 text-navy"
                            }`}
                          >
                            {ASSET_STATUSES.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-4 border-t border-gray-100 bg-slate-50/50">
                <p className="text-[10px] text-gray-400">
                  Showing the first 100 assets. Total registered assets:{" "}
                  {assets.length}.
                </p>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function TableHeading({ children }) {
  return (
    <th className="px-5 py-3 text-[10px] uppercase tracking-wide font-bold text-gray-400">
      {children}
    </th>
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
      <div className="flex justify-between">
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