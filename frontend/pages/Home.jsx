import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../contexts/SocketContext";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const { currentUser, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleMatchStarted = (gameData) => {
      setIsSearching(false);
      sessionStorage.setItem(
        `game-${gameData.gameId}`,
        JSON.stringify(gameData),
      );
      navigate(`/game/${gameData.gameId}`, { state: gameData });
    };

    socket.on("match_started", handleMatchStarted);

    return () => {
      socket.off("match_started", handleMatchStarted);
    };
  }, [socket, navigate]);

  const handleFindMatch = () => {
    setIsSearching(true);
    socket.emit("enter_arena");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-md w-full bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-700 text-center">
        <h1 className="text-4xl font-bold text-orange-500 mb-2">
          Chess Server
        </h1>
        <p className="text-xl text-gray-300 mb-6">
          Welcome, {currentUser?.userName}!
        </p>

        <div className="mb-8 p-6 bg-gray-700 rounded-lg border border-gray-600">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            Global Arena
          </h2>
          <button
            onClick={handleFindMatch}
            disabled={isSearching}
            className="w-full px-4 py-3 font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-500 transition-colors text-lg"
          >
            {isSearching ? "Searching for opponent..." : "Play Now"}
          </button>
        </div>

        <div className="mb-8 p-6 bg-gray-700 rounded-lg border border-gray-600">
          <h2 className="text-2xl font-semibold mb-2 text-white">
            Timed Arena
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            Create or join a timed arena and compete!
          </p>
          <button
            onClick={() => navigate("/arena")}
            className="w-full px-4 py-3 font-bold text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors text-lg"
          >
            Timed Arena
          </button>
        </div>

        <button
          onClick={logout}
          className="w-full px-4 py-2 font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
        >
          Log Out
        </button>
      </div>
    </div>
  );
};

export default Home;
