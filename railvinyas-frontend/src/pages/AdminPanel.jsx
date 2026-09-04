// src/pages/AdminPanel.jsx
import { useState } from "react";
import { Card, RoleBadge } from "../components/ui";

// SECURITY NOTE: this page hides itself from non-Admin users on the
// frontend, but that is NOT real security by itself. The backend must
// independently reject non-Admin tokens on any admin routes -- this is
// a known gap in the current backend (auth.py has role info in the JWT,
// but app.py doesn't yet have dedicated admin endpoints to protect).
export default function AdminPanel() {
  const [tab, setTab] = useState("users");

  const users = [
    { name: "Aarzu Bhatt", email: "aarzubhatt9@gmail.com", role: "Admin", lastLogin: "2026-09-04" },
  ];
  const assets = [
    { id: "TA005", type: "Tamping Machine", section: "FA-MJ", status: "Available" },
    { id: "OH012", type: "OHE Maintenance Special", section: "CLA-MTN", status: "In Use" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-1">User and asset management (demo data)</p>
      </div>

      <div className="flex gap-2 border-b border-gray-100">
        {["users", "assets"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? "border-sky text-sky" : "border-transparent text-gray-500 hover:text-navy"}`}>
            {t === "users" ? "User Management" : "Asset Management"}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-navy">{u.name}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{u.email}</td>
                  <td className="py-2.5 pr-4"><RoleBadge role={u.role} /></td>
                  <td className="py-2.5 pr-4 text-gray-600">{u.lastLogin}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-4">Requires a GET /api/admin/users backend endpoint — not yet implemented.</p>
        </Card>
      )}

      {tab === "assets" && (
        <Card>
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
              {assets.map((a) => (
                <tr key={a.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-navy">{a.id}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{a.type}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{a.section}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-4">Requires GET/PATCH /api/admin/assets backend endpoints — not yet implemented.</p>
        </Card>
      )}
    </div>
  );
}
