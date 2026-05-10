import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const Navbar = () => {
  const location = useLocation();
  const { currentUser, logout } = useAuth();

  const navLinks = [
    { path: "/", label: "Play" },
    { path: "/arena", label: "Arena" },
  ];

  return (
    <header
      className="sticky top-0 z-50 w-full flex items-center justify-between px-6 py-3"
      style={{
        background: "rgba(10,10,10,0.9)",
        borderBottom: "1px solid var(--border)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center gap-8">
        {/* <Link to="/" className="flex items-center gap-2 focus:outline-none select-none">
          <span className="text-base font-bold text-white tracking-tight">
            ♟ Chess Server
          </span>
        </Link> */}

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(({ path, label }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                style={{
                  color: isActive ? "var(--text)" : "var(--text-muted)",
                  background: isActive ? "var(--surface-3)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    e.currentTarget.style.color = "var(--text-muted)";
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
            className="flex items-center gap-3 pl-3"
            style={{ borderLeft: "1px solid var(--border)" }}
          >
            <div className="text-right hidden lg:block">
              <p className="text-xs font-semibold text-white truncate max-w-[100px]">
                {currentUser.userName}
              </p>
            </div>

            <button
              onClick={logout}
              className="btn btn-sm btn-subtle"
              title="Log out"
              style={{ padding: "0.4rem" }}
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
      </div>
    </header>
  );
};

export default Navbar;
