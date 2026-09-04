// src/pages/AdminPanel.jsx
import { useEffect, useState } from "react";
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

  const load = () => {
    setLoading(true);
    Promise.all([apiFetch("/api/admin/users"), apiFetch("/api/assets")])
      .then(([u, a]) => { setUsers(u); setAssets(a); })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load admin data"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const changeRole = async (userId, role) => {
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
      setUsers((u) => u.map((x) => (x.id === userId ? { ...x, role } : x)));
      setToast("Role updated");
    } catch (err) {
      setToast(err.message || "Failed to update role");
    }
  };

  const changeAssetStatus = async (assetId, status) => {
    try {
      await apiFetch(`/api/assets/${assetId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setAssets((a) => a.map((x) => (x.asset_id === assetId ? { ...x, status } : x)));
      setToast("Asset status updated");
    } catch (err) {
      setToast(err.message || "Failed to update asset");
    }
  };

  return (
    <div className="space-y-6">
      <Toast message={toast} type="success" onClose={() => setToast("")} />
      <div>
        <h1 className="text-2xl font-bold text-navy">Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-1">User and asset management — live data, changes persist</p>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="flex gap-2 border-b border-gray-100">
        {["users", "assets"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? "border-sky text-sky" : "border-transparent text-gray-500 hover:text-navy"}`}>
            {t === "users" ? "User Management" : "Asset Management"}
          </button>
        ))}
      </div>

      {loading ? <Spinner label="Loading..." /> : (
        <>
          {tab === "users" && (
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-4 font-medium text-navy">{u.name}</td>
                      <td className="py-2.5 pr-4 text-gray-600">{u.email}</td>
                      <td className="py-2.5 pr-4">
                        <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded px-2 py-1">
                          {ROLES.map((r) => <option key={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600">{u.created_at?.split("T")[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {tab === "assets" && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-4 font-medium">Asset ID</th>
                      <th className="py-2 pr-4 font-medium">Type</th>
                      <th className="py-2 pr-4 font-medium">Home Section</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.slice(0, 100).map((a) => (
                      <tr key={a.asset_id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2.5 pr-4 font-medium text-navy">{a.asset_id}</td>
                        <td className="py-2.5 pr-4 text-gray-600">{a.asset_type}</td>
                        <td className="py-2.5 pr-4 text-gray-600">{a.home_section_id}</td>
                        <td className="py-2.5 pr-4">
                          <select value={a.status} onChange={(e) => changeAssetStatus(a.asset_id, e.target.value)}
                            className="text-xs border border-gray-200 rounded px-2 py-1">
                            {ASSET_STATUSES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-3">Showing first 100 of {assets.length} assets.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
