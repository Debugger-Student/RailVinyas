// src/pages/Login.jsx
import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, getDeviceId, ApiError } from "../api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [step, setStep] = useState(1); // 1 = credentials, 2 = OTP
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef(null);

  const { login } = useAuth();
  const navigate = useNavigate();
  const deviceId = getDeviceId();

  const startCooldown = () => {
    setCooldown(30);
    clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(cooldownTimer.current); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const submitCredentials = async (e) => {
    e?.preventDefault();
    setError(""); setInfo(""); setLoading(true);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, device_id: deviceId }),
      });
      if (res.status === "success") {
        login(res);
        navigate("/dashboard");
      } else if (res.status === "verification_required") {
        setInfo(res.message);
        setStep(2);
        if (res.dev_otp) {
          // Email isn't configured on the backend yet -- the OTP came back
          // directly in the response, so auto-fill it for a smooth demo.
          setOtpCode(res.dev_otp);
        }
        startCooldown();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await apiFetch("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, device_id: deviceId, otp_code: otpCode }),
      });
      login(res);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const resendCode = () => {
    if (cooldown > 0) return;
    submitCredentials();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-sky/5 to-white px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-navy flex items-center justify-center text-white font-bold text-lg mx-auto mb-3">RV</div>
          <h1 className="text-2xl font-bold text-navy">RailVinyas</h1>
          <p className="text-sm text-gray-500 mt-1">AI-Powered Railway Block Planning</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-6">
          {error && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
          )}

          {step === 1 && (
            <form onSubmit={submitCredentials} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-navy mb-1">Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky" />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy mb-1">Password</label>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-sky text-white font-semibold py-2.5 rounded-md hover:bg-sky/90 transition-colors disabled:opacity-60">
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={submitOtp} className="space-y-4">
              {info && (
                <div className="text-sm text-navy bg-sky/10 border border-sky/20 rounded-md px-3 py-2">{info}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-navy mb-1">Verification Code</label>
                <input type="text" inputMode="numeric" maxLength={6} required value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="6-digit code"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm tracking-[0.3em] text-center font-mono focus:outline-none focus:ring-2 focus:ring-sky/40 focus:border-sky" />
              </div>
              <button type="submit" disabled={loading || otpCode.length !== 6}
                className="w-full bg-sky text-white font-semibold py-2.5 rounded-md hover:bg-sky/90 transition-colors disabled:opacity-60">
                {loading ? "Verifying..." : "Verify & Sign In"}
              </button>
              <button type="button" onClick={resendCode} disabled={cooldown > 0}
                className="w-full text-sm text-sky hover:underline disabled:text-gray-400 disabled:no-underline">
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            </form>
          )}

          <p className="text-sm text-gray-500 text-center mt-5">
            Don't have an account? <Link to="/register" className="text-sky font-medium hover:underline">Register</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
