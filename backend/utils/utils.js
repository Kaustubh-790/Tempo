export const calculateElo = (
  playerRating,
  opponentRating,
  result,
  gamesPlayed,
) => {
  const K = gamesPlayed < 30 ? 40 : playerRating < 2300 ? 20 : 10;

  const expected =
    1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  const score = result === "win" ? 1 : result === "draw" ? 0.5 : 0;

  const delta = Math.round(K * (score - expected));

  return { newRating: playerRating + delta, delta };
};
