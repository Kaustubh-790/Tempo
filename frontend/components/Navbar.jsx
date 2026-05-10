import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const Navbar = () => {
  const location = useLocation();
  const { currentUser, logout } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { path: "/", label: "Play" },
    { path: "/arena", label: "Arena" },
  ];

  return (
    <header
      className="sticky top-0 z-50 w-full border-b"
      style={{
        background: "rgba(10,10,10,0.88)",
        borderColor: "var(--border)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div className="h-16 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2 select-none shrink-0">
            <img
              src="/knight.png"
              alt="Tempo"
              className="w-8 h-8 object-contain"
            />

            <div className="flex flex-col leading-none">
              <span
                className="text-white font-semibold tracking-tight"
                style={{
                  fontSize: "1.05rem",
                }}
              >
                Tempo
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(({ path, label }) => {
              const isActive = location.pathname === path;

              return (
                <Link
                  key={path}
                  to={path}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200"
                  style={{
                    color: isActive ? "var(--text)" : "var(--text-muted)",
                    background: isActive
                      ? "rgba(255,255,255,0.06)"
                      : "transparent",
                    border: isActive
                      ? "1px solid rgba(255,255,255,0.06)"
                      : "1px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = "var(--text)";
                      e.currentTarget.style.background =
                        "rgba(255,255,255,0.03)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = "var(--text-muted)";
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {currentUser && (
            <div
              className="hidden sm:flex items-center gap-3 pl-4"
              style={{
                borderLeft: "1px solid var(--border)",
              }}
            >
              <div className="text-right">
                <p className="text-sm font-semibold text-white truncate max-w-[120px]">
                  {currentUser.userName}
                </p>
              </div>

              <button
                onClick={logout}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                title="Log out"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  color: "var(--text-muted)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "white";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            </div>
          )}

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          className="md:hidden px-4 pb-4 pt-2 border-t"
          style={{
            borderColor: "rgba(255,255,255,0.05)",
            background: "rgba(15,15,15,0.96)",
          }}
        >
          <nav className="flex flex-col gap-2">
            {navLinks.map(({ path, label }) => {
              const isActive = location.pathname === path;

              return (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-3 rounded-xl text-sm font-medium transition-all"
                  style={{
                    color: isActive ? "var(--text)" : "var(--text-muted)",
                    background: isActive
                      ? "rgba(255,255,255,0.06)"
                      : "transparent",
                  }}
                >
                  {label}
                </Link>
              );
            })}

            {currentUser && (
              <>
                <div
                  className="my-2"
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                  }}
                />

                <div className="px-4 py-2 text-sm text-white">
                  {currentUser.userName}
                </div>

                <button
                  onClick={logout}
                  className="px-4 py-3 rounded-xl text-sm text-left transition-all"
                  style={{
                    color: "#ffb4b4",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  Log out
                </button>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};

export default Navbar;
