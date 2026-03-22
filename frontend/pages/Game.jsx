import React from "react";
import { useLocation, useParams } from "react-router-dom";

const Game = () => {
  const { gameId } = useParams();
  const location = useLocation();
  const gameData = location.state;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <h1 className="text-3xl text-orange-500 mb-4">Match Found!</h1>
      <pre className="bg-gray-800 p-4 rounded text-sm text-green-400">
        {JSON.stringify(gameData, null, 2)}
      </pre>
    </div>
  );
};

export default Game;
