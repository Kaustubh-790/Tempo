import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocket } from "../contexts/SocketContext";
import { useAuth } from "../contexts/AuthContext";
import api from "../services/axios";

const Arena = () => {
  const { arenaId: paramArenaId } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const { currentUser } = useAuth();

  // ─── State ───────────────────────────────────────────────
  const [arenaId, setArenaId] = useState(paramArenaId || "");
  const [endTime, setEndTime] = useState(null);
  const [inLobby, setInLobby] = useState(false);
  const [duration, setDuration] = useState(10);
  const [joinId, setJoinId] = useState("");
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState("");
  const [copied, setCopied] = useState(false);

  // ─── Auto-join if URL has arenaId ────────────────────────
  useEffect(() => {
    if (paramArenaId && socket) {
      setArenaId(paramArenaId);
      socket.emit("join_arena", { arenaId: paramArenaId });
      setInLobby(true);
    }
  }, [paramArenaId, socket]);

  // ─── Socket listeners ────────────────────────────────────
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

    socket.on("match_started", onMatchStarted);
    socket.on("arena_error", onArenaError);

    return () => {
      socket.off("match_started", onMatchStarted);
      socket.off("arena_error", onArenaError);
    };
  }, [socket, navigate]);

  // ─── Countdown timer ─────────────────────────────────────
  useEffect(() => {
    if (!endTime) return;

    const tick = () => {
      const diff = endTime - Date.now();
      if (diff <= 0) {
        setTimeLeft("Expired");
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  // ─── Create arena ────────────────────────────────────────
  const handleCreate = async () => {
    setError("");
    try {
      const res = await api.post("/arena/create", { duration });
      const { arenaId: newId, endTime: newEnd } = res.data;
      setArenaId(newId);
      setEndTime(newEnd);
      // Auto-join after creating
      socket.emit("join_arena", { arenaId: newId });
      setInLobby(true);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create arena");
    }
  };

  // ─── Join arena ──────────────────────────────────────────
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

  // ─── Leave arena ─────────────────────────────────────────
  const handleLeave = () => {
    socket.emit("leave_arena", { arenaId });
    setInLobby(false);
    setArenaId("");
    setEndTime(null);
    navigate("/");
  };

  // ─── Copy arena ID ───────────────────────────────────────
  const handleCopy = () => {
    navigator.clipboard.writeText(arenaId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Render: Lobby view ──────────────────────────────────
  if (inLobby) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-md w-full bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-700 text-center">
          <h1 className="text-3xl font-bold text-orange-500 mb-2">
            Timed Arena
          </h1>

          {/* Arena ID */}
          <div className="mt-4 p-4 bg-gray-700 rounded-lg border border-gray-600">
            <p className="text-sm text-gray-400 mb-1">Arena ID</p>
            <div className="flex items-center justify-center gap-2">
              <code className="text-lg text-green-400 font-mono break-all">
                {arenaId}
              </code>
              <button
                onClick={handleCopy}
                className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Timer */}
          {timeLeft && (
            <div className="mt-4">
              <p className="text-sm text-gray-400">Time Remaining</p>
              <p className={`text-2xl font-bold font-mono ${timeLeft === "Expired" ? "text-red-500" : "text-orange-400"}`}>
                {timeLeft}
              </p>
            </div>
          )}

          {/* Waiting indicator */}
          <div className="mt-6 p-4 bg-gray-700 rounded-lg border border-gray-600">
            <div className="flex items-center justify-center gap-3">
              <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse" />
              <p className="text-gray-300">Waiting for opponent...</p>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Share the Arena ID with a friend to play!
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Leave */}
          <button
            onClick={handleLeave}
            className="mt-6 w-full px-4 py-2 font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Leave Arena
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: Create / Join view ──────────────────────────
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-md w-full bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-700">
        <h1 className="text-3xl font-bold text-orange-500 mb-2 text-center">
          Timed Arena
        </h1>
        <p className="text-gray-400 text-center mb-6">
          Create or join a timed arena to play!
        </p>

        {/* Create Section */}
        <div className="mb-6 p-4 bg-gray-700 rounded-lg border border-gray-600">
          <h2 className="text-xl font-semibold mb-3 text-white">
            Create Arena
          </h2>
          <label className="block text-sm text-gray-400 mb-1">
            Duration (minutes)
          </label>
          <input
            type="number"
            min="1"
            max="120"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white mb-3 focus:outline-none focus:border-orange-500"
          />
          <button
            onClick={handleCreate}
            className="w-full px-4 py-2 font-bold text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
          >
            Create Arena
          </button>
        </div>

        {/* Join Section */}
        <div className="mb-6 p-4 bg-gray-700 rounded-lg border border-gray-600">
          <h2 className="text-xl font-semibold mb-3 text-white">
            Join Arena
          </h2>
          <input
            type="text"
            placeholder="Enter Arena ID"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white mb-3 focus:outline-none focus:border-orange-500 font-mono text-sm"
          />
          <button
            onClick={handleJoin}
            className="w-full px-4 py-2 font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
          >
            Join Arena
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Back */}
        <button
          onClick={() => navigate("/")}
          className="w-full px-4 py-2 font-bold text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
};

export default Arena;
