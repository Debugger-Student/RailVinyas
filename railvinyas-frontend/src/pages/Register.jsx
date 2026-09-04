// src/pages/Register.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, ApiError } from "../api";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setSuccess(res.message);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-sky/5 to-white px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-navy flex items-center justify-center text-white font-bold text-lg mx-auto mb-3">RV</div>
          <h1 className="text-2xl font-bold text-navy">Create Account</h1>
          <p className="text-sm text-gray-500 mt-1">Join RailVinyas as a Viewer</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-6">
          {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          {success && <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{success}</div>}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy mb-1">Full Name</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky" />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky" />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1">Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky" />
              <p className="text-xs text-gray-400 mt-1">Minimum 6 characters</p>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-sky text-white font-semibold py-2.5 rounded-md hover:bg-sky/90 transition-colors disabled:opacity-60">
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="text-sm text-gray-500 text-center mt-5">
            Already have an account? <Link to="/login" className="text-sky font-medium hover:underline">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
