import {
  useState,
} from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import {
  register,
} from "../api";


export default function Register() {

  const navigate =
    useNavigate();


  const [name, setName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");


  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [loading, setLoading] =
    useState(false);


  async function handleRegister(
    event
  ) {

    event.preventDefault();

    setError("");
    setSuccess("");


    if (
      password.length < 6
    ) {

      setError(
        "Password must be at least 6 characters."
      );

      return;
    }


    setLoading(true);


    try {

      const response =
        await register(
          name.trim(),
          email.trim(),
          password
        );


      setSuccess(
        response.message ||
        "Account created. You can now log in."
      );


      setTimeout(
        () => navigate("/login"),
        2000
      );


    } catch (err) {

      setError(
        err.message ||
        "Registration failed."
      );

    } finally {

      setLoading(false);
    }
  }


  return (
    <div className="register-page">

      <div className="register-card">

        <h1>
          Create RailVinyas Account
        </h1>


        {error && (
          <div className="error-message">
            {error}
          </div>
        )}


        {success && (
          <div className="success-message">
            {success}
          </div>
        )}


        <form
          onSubmit={
            handleRegister
          }
        >

          <label>
            Name
          </label>

          <input
            type="text"
            value={name}
            onChange={(e) =>
              setName(
                e.target.value
              )
            }
            required
          />


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
            minLength={6}
            required
          />


          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Creating..."
              : "Create Account"}
          </button>

        </form>


        <p>
          Already have an account?{" "}
          <Link to="/login">
            Log in
          </Link>
        </p>

      </div>

    </div>
  );
}