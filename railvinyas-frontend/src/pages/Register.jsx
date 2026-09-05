// src/pages/Register.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api";

export default function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const response = await register(
        name.trim(),
        email.trim(),
        password
      );

      setSuccess(
        response.message ||
          "Account created. You can now log in."
      );

      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(
        err.message || "Registration failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">

      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />

      <div className="absolute top-10 right-[-120px] h-80 w-80 rounded-full bg-sky/10 blur-3xl" />

      <div className="min-h-screen flex items-center justify-center px-5 py-10 relative">

        <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_1fr] bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">

          {/* BRAND */}
          <div className="hidden lg:flex bg-navy text-white p-10 flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center font-extrabold">
                  RV
                </div>

                <div>
                  <div className="text-xl font-extrabold">
                    RailVinyas
                  </div>

                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/40">
                    AI Operations
                  </div>
                </div>
              </div>

              <div className="mt-16">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-sky">
                  Join the planning environment
                </div>

                <h1 className="text-4xl font-extrabold tracking-tight mt-3">
                  Intelligent maintenance planning.
                </h1>

                <p className="text-sm text-white/60 leading-6 mt-5 max-w-md">
                  Explore traffic-aware railway maintenance planning through
                  the RailVinyas AI prototype.
                </p>
              </div>
            </div>

            <div className="text-[10px] text-white/30">
              New accounts receive Viewer access by default.
            </div>
          </div>

          {/* FORM */}
          <div className="p-7 sm:p-10 lg:p-12">

            <div className="lg:hidden flex items-center gap-3 mb-8">
              <div className="h-11 w-11 rounded-xl bg-navy text-white flex items-center justify-center font-extrabold">
                RV
              </div>

              <div>
                <div className="text-xl font-extrabold text-navy">
                  RailVinyas
                </div>

                <div className="text-[9px] uppercase tracking-[0.16em] text-gray-400">
                  AI Operations
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-sky">
                Account registration
              </div>

              <h2 className="text-2xl font-extrabold text-navy mt-2">
                Create your account
              </h2>

              <p className="text-sm text-gray-500 mt-2">
                Set up access to the RailVinyas prototype.
              </p>
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <div className="font-semibold">
                  Registration unsuccessful
                </div>

                <div className="text-xs mt-1">{error}</div>
              </div>
            )}

            {success && (
              <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                <div className="font-semibold">
                  Account created
                </div>

                <div className="text-xs mt-1">{success}</div>
              </div>
            )}

            <form
              onSubmit={handleRegister}
              className="mt-7 space-y-5"
            >
              <Field
                label="Full name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
              />

              <Field
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />

              <Field
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
              />

              <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                <div className="text-xs font-semibold text-navy">
                  Default access
                </div>

                <div className="text-[11px] text-gray-500 mt-1">
                  New registrations are created with Viewer access.
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-navy text-white rounded-xl px-4 py-3 font-semibold text-sm hover:bg-navy/90 transition disabled:opacity-50"
              >
                {loading
                  ? "Creating account..."
                  : "Create RailVinyas account"}
              </button>
            </form>

            <div className="text-center text-xs text-gray-500 mt-6">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-sky hover:underline"
              >
                Sign in
              </Link>
            </div>

            <div className="border-t border-gray-100 mt-8 pt-5 text-center text-[10px] text-gray-400">
              RailVinyas AI — prototype decision-support environment
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  minLength,
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-navy mb-2 uppercase tracking-wide">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minLength={minLength}
        required
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky transition"
      />
    </div>
  );
}