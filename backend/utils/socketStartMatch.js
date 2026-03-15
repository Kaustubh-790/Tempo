export const startMatch = (newGame) => {
  if (!newGame) return;
  const { gameId, instance, players } = newGame;

  players.white.socket.join(gameId);
  players.black.socket.join(gameId);

  players.white.socket.emit("match_started", {
    gameId,
    color: "white",
    opponent: players.black.user.userName,
    opponentRating: players.black.user.rating,
    fen: instance.fen(),
    timeControl: "unlimited",
  });

  players.black.socket.emit("match_started", {
    gameId,
    color: "black",
    opponent: players.white.user.userName,
    opponentRating: players.white.user.rating,
    fen: instance.fen(),
    timeControl: "unlimited",
  });
};
