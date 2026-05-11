import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../contexts/SocketContext";
import { useAuth } from "../contexts/AuthContext";
import Navbar from "../components/Navbar";

const TIME_CONTROLS = [
  { label: "1 + 0", sublabel: "Bullet", initial: 1, increment: 0 },
  { label: "3 + 2", sublabel: "Blitz", initial: 3, increment: 2 },
  { label: "5 + 0", sublabel: "Blitz", initial: 5, increment: 0 },
  { label: "10 + 0", sublabel: "Rapid", initial: 10, increment: 0 },
];

const Home = () => {
  const [selectedTc, setSelectedTc] = useState(TIME_CONTROLS[1]);
  const [searching, setSearching] = useState(false);

  const socket = useSocket();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;
    const onMatchStarted = (gameData) => {
      setSearching(false);
      sessionStorage.setItem(
        `game-${gameData.gameId}`,
        JSON.stringify(gameData),
      );
      navigate(`/game/${gameData.gameId}`, { state: gameData });
    };
    const onAlreadyInGame = ({ gameId }) => {
      setSearching(false);
      navigate(`/game/${gameId}`);
    };
    socket.on("match_started", onMatchStarted);
    socket.on("already_in_game", onAlreadyInGame);
    return () => {
      socket.off("match_started", onMatchStarted);
      socket.off("already_in_game", onAlreadyInGame);
    };
  }, [socket, navigate]);

  const handlePlay = () => {
    if (!socket) return;
    setSearching(true);
    socket.emit("enter_arena", {
      timeControl: {
        label: selectedTc.label,
        initial: selectedTc.initial,
        increment: selectedTc.increment,
      },
    });
  };

  const handleCancel = () => setSearching(false);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg)" }}
    >
      <Navbar />

      <main className="flex-1 flex items-start justify-center px-4 pt-14 pb-12">
        <div className="w-full max-w-3xl">
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
              Quick Pairing
            </h1>
            <p
              className="text-sm max-w-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Select a time control to enter the matchmaking queue.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-8">
            {TIME_CONTROLS.map((tc) => {
              const isSelected = selectedTc.label === tc.label;
              return (
                <button
                  key={tc.label}
                  onClick={() => setSelectedTc(tc)}
                  disabled={searching}
                  className="relative p-5 rounded-xl text-left transition-all duration-150 focus:outline-none"
                  style={{
                    background: isSelected
                      ? "var(--surface-3)"
                      : "var(--surface)",
                    border: isSelected
                      ? "1px solid var(--accent-border)"
                      : "1px solid var(--border)",
                    boxShadow: isSelected
                      ? "0 0 0 1px var(--accent-dim) inset"
                      : "none",
                  }}
                >
                  {isSelected && (
                    <span
                      className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full"
                      style={{ background: "var(--accent)" }}
                    />
                  )}
                  <p
                    className="text-2xl font-bold tabular-nums tracking-tight mb-1"
                    style={{ color: isSelected ? "var(--text)" : "#9ca3af" }}
                  >
                    {tc.label}
                  </p>
                  <p
                    className="text-xs font-medium"
                    style={{
                      color: isSelected ? "var(--accent)" : "var(--text-dim)",
                    }}
                  >
                    {tc.sublabel}
                  </p>
                </button>
              );
            })}
          </div>

          {!searching ? (
            <button
              id="home-play"
              onClick={handlePlay}
              disabled={!socket}
              className="btn btn-primary btn-lg"
            >
              Play {selectedTc.label}
            </button>
          ) : (
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ background: "var(--accent)" }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-3 w-3"
                    style={{ background: "var(--accent)" }}
                  />
                </span>
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Searching for opponent…
                </span>
              </div>
              <button
                onClick={handleCancel}
                className="text-xs underline underline-offset-2 transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Home;
