// src/pages/Login.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, verifyOtp } from "../api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { loginSuccess } = useAuth();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await login(email.trim(), password);

      if (response.status === "success") {
        loginSuccess(response);
        navigate("/dashboard");
        return;
      }

      if (response.status === "verification_required") {
        setStep(2);

        setMessage(
          response.dev_otp
            ? `Development verification code: ${response.dev_otp}`
            : response.message
        );

        return;
      }

      setError(
        response.message || "Unexpected login response."
      );
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter a valid 6-digit verification code.");
      return;
    }

    setLoading(true);

    try {
      const response = await verifyOtp(email.trim(), otp);

      if (response.status === "success") {
        loginSuccess(response);
        navigate("/dashboard");
        return;
      }

      setError("OTP verification failed.");
    } catch (err) {
      setError(
        err.message || "Incorrect verification code."
      );
    } finally {
      setLoading(false);
    }
  }

  function backToCredentials() {
    setStep(1);
    setOtp("");
    setError("");
    setMessage("");
  }

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">

      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />

      <div className="absolute -top-32 -right-32 h-80 w-80 rounded-full bg-sky/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-sky/5 blur-3xl" />

      <div className="relative min-h-screen flex items-center justify-center px-5 py-10">

        <div className="w-full max-w-5xl grid lg:grid-cols-[1.05fr_0.95fr] bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">

          {/* BRAND PANEL */}
          <div className="hidden lg:flex bg-navy text-white p-10 flex-col justify-between relative overflow-hidden">
            <div className="absolute right-[-80px] bottom-[-80px] h-64 w-64 rounded-full bg-sky/10" />

            <div>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center font-extrabold">
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

              <div className="mt-14">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-sky">
                  Intelligent Railway Planning
                </div>

                <h1 className="text-4xl font-extrabold tracking-tight mt-3 leading-tight">
                  Smarter maintenance.
                  <br />
                  Lower disruption.
                </h1>

                <p className="text-sm text-white/60 leading-6 mt-5 max-w-md">
                  RailVinyas helps maintenance teams evaluate railway traffic,
                  assets and operational risk to identify better planning
                  windows.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="flex items-center gap-2 text-xs text-white/50">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                AI planning environment operational
              </div>

              <div className="text-[10px] text-white/30 mt-2">
                Prototype decision-support platform
              </div>
            </div>
          </div>

          {/* LOGIN PANEL */}
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
                Secure access
              </div>

              <h2 className="text-2xl font-extrabold text-navy mt-2">
                {step === 1 ? "Welcome back" : "Verify your device"}
              </h2>

              <p className="text-sm text-gray-500 mt-2 leading-5">
                {step === 1
                  ? "Sign in to access the RailVinyas operations environment."
                  : `Enter the 6-digit verification code for ${email}.`}
              </p>
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <div className="font-semibold">Unable to continue</div>
                <div className="text-xs mt-1">{error}</div>
              </div>
            )}

            {message && (
              <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                <div className="font-semibold">Verification</div>
                <div className="text-xs mt-1">{message}</div>
              </div>
            )}

            {step === 1 ? (
              <form onSubmit={handleLogin} className="mt-7 space-y-5">

                <Field
                  label="Email address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                />

                <Field
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-navy text-white rounded-xl px-4 py-3 font-semibold text-sm hover:bg-navy/90 transition disabled:opacity-50"
                >
                  {loading ? "Authenticating..." : "Sign in to RailVinyas"}
                </button>

                <div className="text-center text-xs text-gray-500 pt-2">
                  Don't have an account?{" "}
                  <Link
                    to="/register"
                    className="font-semibold text-sky hover:underline"
                  >
                    Create one
                  </Link>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="mt-7 space-y-5">

                <div>
                  <label className="block text-xs font-bold text-navy mb-2 uppercase tracking-wide">
                    Verification code
                  </label>

                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    value={otp}
                    onChange={(e) =>
                      setOtp(
                        e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 6)
                      )
                    }
                    placeholder="000000"
                    className="w-full border border-gray-200 rounded-xl px-4 py-4 text-center text-2xl font-extrabold tracking-[0.45em] text-navy focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full bg-navy text-white rounded-xl px-4 py-3 font-semibold text-sm hover:bg-navy/90 transition disabled:opacity-50"
                >
                  {loading ? "Verifying..." : "Verify & Continue"}
                </button>

                <button
                  type="button"
                  onClick={backToCredentials}
                  className="w-full border border-gray-200 text-navy rounded-xl px-4 py-3 font-semibold text-sm hover:bg-slate-50 transition"
                >
                  ← Back to login
                </button>
              </form>
            )}

            <div className="border-t border-gray-100 mt-8 pt-5 text-[10px] text-gray-400 leading-5 text-center">
              Authorized prototype users only. Use of the system should follow
              applicable railway operational procedures.
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
  autoComplete,
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
        autoComplete={autoComplete}
        required
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky/20 focus:border-sky transition"
      />
    </div>
  );
}