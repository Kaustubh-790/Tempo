import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { loginEmailPassword, registerEmailPassword, loginWithGoogle } =
    useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        await loginEmailPassword(email, password);
      } else {
        await registerEmailPassword(userName, email, password);
      }
      navigate("/");
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || "Authentication failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError("");
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate("/");
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || "Google auth failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {isLogin ? "Sign in to your account" : "Create an account"}
          </p>
        </div>

        <div className="card" style={{ borderRadius: "14px" }}>
          {error && <div className="alert-error mb-5">{error}</div>}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {!isLogin && (
              <div>
                <label htmlFor="auth-username" className="label">
                  Username
                </label>
                <input
                  id="auth-username"
                  type="text"
                  className="input"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  required={!isLogin}
                  autoComplete="username"
                  placeholder="your userName"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="label">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="label">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isLogin ? "current-password" : "new-password"}
                placeholder="••••••••"
              />
            </div>

            <button
              id="auth-submit"
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-full"
              style={{ marginTop: "0.25rem" }}
            >
              {loading
                ? "Please wait…"
                : isLogin
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>

          <div className="divider my-5">or</div>

          <button
            id="auth-google"
            onClick={handleGoogleAuth}
            disabled={loading}
            className="btn btn-subtle btn-full"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <p
            className="text-sm text-center mt-5"
            style={{ color: "var(--text-muted)" }}
          >
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              id="auth-switch"
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
              }}
              className="font-semibold focus:outline-none transition-colors"
              style={{ color: "var(--accent)" }}
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
