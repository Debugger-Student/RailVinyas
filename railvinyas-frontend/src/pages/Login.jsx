import {
  useState,
} from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import {
  login,
  verifyOtp,
} from "../api";

import {
  useAuth,
} from "../context/AuthContext";


export default function Login() {

  const navigate =
    useNavigate();

  const {
    loginSuccess,
  } = useAuth();


  const [step, setStep] =
    useState(1);

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [otp, setOtp] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(false);


  async function handleLogin(event) {

    event.preventDefault();

    setError("");
    setMessage("");

    setLoading(true);


    try {

      const response =
        await login(
          email.trim(),
          password
        );


      // ----------------------------------------------------
      // Normal successful login
      // ----------------------------------------------------

      if (
        response.status ===
        "success"
      ) {

        loginSuccess(response);

        navigate("/dashboard");

        return;
      }


      // ----------------------------------------------------
      // OTP required
      // ----------------------------------------------------

      if (
        response.status ===
        "verification_required"
      ) {

        setStep(2);

        setMessage(
          response.dev_otp
            ? `Verification required. Development OTP: ${response.dev_otp}`
            : response.message
        );

        return;
      }


      setError(
        response.message ||
        "Unexpected login response."
      );

    } catch (err) {

      setError(
        err.message ||
        "Login failed. Please try again."
      );

    } finally {

      setLoading(false);
    }
  }


  async function handleVerifyOtp(
    event
  ) {

    event.preventDefault();

    setError("");
    setMessage("");

    if (
      !/^\d{6}$/.test(otp)
    ) {

      setError(
        "Enter a valid 6-digit OTP."
      );

      return;
    }


    setLoading(true);


    try {

      const response =
        await verifyOtp(
          email.trim(),
          otp
        );


      if (
        response.status ===
        "success"
      ) {

        loginSuccess(response);

        navigate("/dashboard");

        return;
      }


      setError(
        "OTP verification failed."
      );

    } catch (err) {

      setError(
        err.message ||
        "Incorrect verification code."
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
    <div className="login-page">

      <div className="login-card">

        <div className="brand">
          <div className="logo">
            RV
          </div>

          <h1>
            RailVinyas
          </h1>

          <p>
            AI-Powered Railway Block Planning
          </p>
        </div>


        {error && (
          <div className="error-message">
            {error}
          </div>
        )}


        {message && (
          <div className="success-message">
            {message}
          </div>
        )}


        {step === 1 && (

          <form
            onSubmit={
              handleLogin
            }
          >

            <label>
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(
                  e.target.value
                )
              }
              required
              autoComplete="email"
            />


            <label>
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(
                  e.target.value
                )
              }
              required
              autoComplete="current-password"
            />


            <button
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Signing in..."
                : "Sign In"}
            </button>


            <p>
              Don't have an account?{" "}
              <Link to="/register">
                Register
              </Link>
            </p>

          </form>
        )}


        {step === 2 && (

          <form
            onSubmit={
              handleVerifyOtp
            }
          >

            <h2>
              Verify your device
            </h2>

            <p>
              Enter the 6-digit
              verification code.
            </p>


            <label>
              Verification Code
            </label>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) =>
                setOtp(
                  e.target.value
                    .replace(/\D/g, "")
                    .slice(0, 6)
                )
              }
              required
              autoFocus
            />


            <button
              type="submit"
              disabled={
                loading ||
                otp.length !== 6
              }
            >
              {loading
                ? "Verifying..."
                : "Verify OTP"}
            </button>


            <button
              type="button"
              onClick={
                backToCredentials
              }
            >
              Back to Login
            </button>

          </form>
        )}

      </div>

    </div>
  );
}