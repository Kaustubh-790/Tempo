import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocket } from "../contexts/SocketContext";
import { useAuth } from "../contexts/AuthContext";
import api from "../services/axios";
import Navbar from "../components/Navbar";

/* ─── Helpers ───────────────────────────────── */
const formatTimeLeft = (endTime) => {
  if (!endTime) return null;
  const diff = endTime - Date.now();
  if (diff <= 0) return { label: "Expired", expired: true };
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return {
    label: `${mins}:${secs.toString().padStart(2, "0")}`,
    expired: false,
  };
};

const TimerDisplay = ({ endTime }) => {
  const [display, setDisplay] = useState(() => formatTimeLeft(endTime));
  useEffect(() => {
    if (!endTime) return;
    const tick = () => setDisplay(formatTimeLeft(endTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime]);
  if (!display) return null;
  const diff = endTime - Date.now();
  const color = display.expired
    ? "#ef4444"
    : diff < 60_000
      ? "#f87171"
      : diff < 5 * 60_000
        ? "#fbbf24"
        : "var(--accent)";
  return (
    <div className="text-center">
      <p className="label mb-1">Time Remaining</p>
      <p
        className="text-4xl font-bold font-mono tabular-nums"
        style={{ color }}
      >
        {display.label}
      </p>
    </div>
  );
};

const QueueList = ({ queue }) => (
  <div className="flex-1 overflow-y-auto">
    {queue.length === 0 ? (
      <p
        className="text-sm text-center py-6"
        style={{ color: "var(--text-muted)" }}
      >
        No players waiting yet
      </p>
    ) : (
      <ul className="space-y-1.5">
        {queue.map((p, i) => (
          <li
            key={p.userName}
            className="flex items-center gap-3 px-3 py-2 rounded-lg"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-2)",
            }}
          >
            <span
              className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{
                background: "var(--accent-dim)",
                border: "1px solid var(--accent-border)",
                color: "var(--accent)",
              }}
            >
              {i + 1}
            </span>
            <p
              className="flex-1 text-sm font-medium truncate"
              style={{ color: "var(--text)" }}
            >
              {p.userName}
            </p>
            <span
              className="text-xs font-mono shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              {p.rating}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const TIME_CONTROLS = [
  { label: "1 + 0", sublabel: "Bullet", initial: 1, increment: 0 },
  { label: "3 + 2", sublabel: "Blitz", initial: 3, increment: 2 },
  { label: "5 + 0", sublabel: "Blitz", initial: 5, increment: 0 },
  { label: "10 + 0", sublabel: "Rapid", initial: 10, increment: 0 },
];

const Arena = () => {
  const { arenaId: paramArenaId } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const { currentUser } = useAuth();

  const [arenaId, setArenaId] = useState(paramArenaId || "");
  const [endTime, setEndTime] = useState(null);
  const [inLobby, setInLobby] = useState(false);
  const [duration, setDuration] = useState(10);
  const [timeControl, setTimeControl] = useState(TIME_CONTROLS[1]);
  const [joinId, setJoinId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [queue, setQueue] = useState([]);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (paramArenaId && socket) {
      setArenaId(paramArenaId);
      socket.emit("join_arena", { arenaId: paramArenaId });
      setInLobby(true);
    }
  }, [paramArenaId, socket]);

  useEffect(() => {
    if (!socket) return;
    const onMatchStarted = (gameData) => {
      sessionStorage.setItem(
        `game-${gameData.gameId}`,
        JSON.stringify(gameData),
      );
      navigate(`/game/${gameData.gameId}`, { state: gameData });
    };
    const onArenaError = ({ message }) => {
      setError(message);
      setTimeout(() => setError(""), 4000);
    };
    const onQueueUpdate = ({ queue: newQueue, endTime: newEndTime }) => {
      setQueue(newQueue);
      if (newEndTime) setEndTime(newEndTime);
    };
    const onArenaExpired = () => {
      setExpired(true);
      setQueue([]);
    };
    const onAlreadyInGame = ({ gameId }) => {
      setError("You have an active game! Redirecting...");
      setTimeout(() => navigate(`/game/${gameId}`), 1000);
    };

    socket.on("match_started", onMatchStarted);
    socket.on("arena_error", onArenaError);
    socket.on("arena_queue_update", onQueueUpdate);
    socket.on("arena_expired", onArenaExpired);
    socket.on("already_in_game", onAlreadyInGame);
    return () => {
      socket.off("match_started", onMatchStarted);
      socket.off("arena_error", onArenaError);
      socket.off("arena_queue_update", onQueueUpdate);
      socket.off("arena_expired", onArenaExpired);
      socket.off("already_in_game", onAlreadyInGame);
    };
  }, [socket, navigate]);

  const handleCreate = async () => {
    setError("");
    try {
      const res = await api.post("/arena/create", { duration, timeControl });
      const { arenaId: newId, endTime: newEnd } = res.data;
      setArenaId(newId);
      setEndTime(newEnd);
      socket.emit("join_arena", { arenaId: newId });
      setInLobby(true);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create arena");
    }
  };

  const handleJoin = () => {
    const id = joinId.trim();
    if (!id) {
      setError("Please enter an arena ID");
      return;
    }
    setError("");
    setArenaId(id);
    socket.emit("join_arena", { arenaId: id });
    setInLobby(true);
  };

  const handleLeave = useCallback(() => {
    if (arenaId) socket.emit("leave_arena", { arenaId });
    setInLobby(false);
    setArenaId("");
    setEndTime(null);
    setQueue([]);
    setExpired(false);
    navigate("/arena");
  }, [arenaId, socket, navigate]);

  const handleCopy = () => {
    navigator.clipboard.writeText(arenaId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inLobby) {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ background: "var(--bg)" }}
      >
        <Navbar />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 flex items-center justify-center p-8">
            {expired ? (
              <div className="text-center space-y-4">
                <h2 className="text-xl font-bold text-red-400">
                  Arena Expired
                </h2>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  This arena session has ended.
                </p>
                <button
                  onClick={() => navigate("/arena")}
                  className="btn btn-ghost"
                  style={{ marginTop: "0.5rem" }}
                >
                  Create New Arena
                </button>
              </div>
            ) : (
              <div className="text-center space-y-6 max-w-sm w-full">
                <div className="card-sm">
                  <p className="label mb-2 text-center">Arena ID</p>
                  <div className="flex items-center justify-between gap-3">
                    <code
                      className="text-sm font-mono break-all text-left"
                      style={{ color: "var(--accent)" }}
                    >
                      {arenaId}
                    </code>
                    <button
                      onClick={handleCopy}
                      className="btn btn-sm btn-subtle"
                      style={{ flexShrink: 0 }}
                    >
                      {copied ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-4">
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text)" }}
                  >
                    Waiting for opponent…
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {queue.length} player{queue.length !== 1 ? "s" : ""} in
                    queue
                  </p>
                </div>

                {error && <div className="alert-error">{error}</div>}
              </div>
            )}
          </main>

          <aside
            className="w-72 flex flex-col"
            style={{
              borderLeft: "1px solid var(--border)",
              background: "var(--bg)",
            }}
          >
            <div
              className="p-5"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <TimerDisplay endTime={endTime} />
            </div>
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <span className="label mb-0">Queue</span>
              <span
                className="text-xs font-mono px-2 py-0.5 rounded"
                style={{
                  background: "var(--accent-dim)",
                  border: "1px solid var(--accent-border)",
                  color: "var(--accent)",
                }}
              >
                {queue.length}
              </span>
            </div>
            <div className="flex-1 p-3 overflow-y-auto">
              <QueueList queue={queue} />
            </div>
            <div
              className="p-4"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <button
                onClick={handleLeave}
                className="btn btn-sm btn-danger w-full"
              >
                Leave Arena
              </button>
            </div>
          </aside>
        </div>
      </div>
    );
  }

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
              Timed Arena
            </h1>
          </div>

          {error && <div className="alert-error mb-6">{error}</div>}

          <p className="label mb-4">Time Control</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-8">
            {TIME_CONTROLS.map((tc) => {
              const sel = timeControl.label === tc.label;
              return (
                <button
                  key={tc.label}
                  onClick={() => setTimeControl(tc)}
                  className="relative p-5 rounded-xl text-left transition-all duration-150 focus:outline-none"
                  style={{
                    background: sel ? "var(--surface-3)" : "var(--surface)",
                    border: sel
                      ? "1px solid var(--accent-border)"
                      : "1px solid var(--border)",
                    boxShadow: sel
                      ? "0 0 0 1px var(--accent-dim) inset"
                      : "none",
                  }}
                >
                  {sel && (
                    <span
                      className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full"
                      style={{ background: "var(--accent)" }}
                    />
                  )}
                  <p
                    className="text-2xl font-bold tabular-nums tracking-tight mb-1"
                    style={{ color: sel ? "var(--text)" : "#9ca3af" }}
                  >
                    {tc.label}
                  </p>
                  <p
                    className="text-xs font-medium"
                    style={{ color: sel ? "var(--accent)" : "var(--text-dim)" }}
                  >
                    {tc.sublabel}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mb-8">
            <p className="label mb-0 shrink-0">Duration</p>
            <input
              type="number"
              min="1"
              max="120"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="input"
              style={{ width: "90px", fontFamily: "monospace" }}
            />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              minutes
            </span>
          </div>

          <button onClick={handleCreate} className="btn btn-primary btn-lg">
            Create Arena &amp; Join
          </button>
          <div className="divider my-10">or join an existing arena</div>
          <div>
            <p className="label mb-3">Arena ID</p>
            <div className="flex gap-3 items-center">
              <input
                type="text"
                placeholder="Paste arena ID here…"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                className="input flex-1"
              />
              <button
                onClick={handleJoin}
                className="btn btn-ghost btn-lg"
                style={{ flexShrink: 0 }}
              >
                Join Arena
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Arena;
