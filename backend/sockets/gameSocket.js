import { gameService } from "../services/gameService.js";
import Match from "../models/Match.js";
import User from "../models/User.js";
import { calculateElo } from "../utils/calculateElo.js";

export const registerGameHandler = (io, socket) => {
  socket.on("move_attempt", async ({ gameId, from, to, promotion }) => {
    const game = gameService.getGame(gameId);

    if (!game) {
      return socket.emit("move_rejected", { reason: "game_not_found" });
      g;
    }

    const { instance, players } = game;

    const isWhite = players.white.socket.id === socket.id;
    const isBlack = players.black.socket.id === socket.id;
    const playerColor = isWhite ? "w" : isBlack ? "b" : null;

    if (!playerColor) {
      return socket.emit("move_rejected", { reason: "not_your_game" });
    }

    if (instance.turn() !== playerColor) {
      return socket.emit("move_rejected", { reason: "not_your_turn" });
    }

    try {
      const piece = instance.get(from);
      const isPromotion =
        piece && piece.type === "p" && (to.endsWith("8") || to.endsWith("1"));

      const moveData = { from, to };
      if (isPromotion) {
        moveData.promotion = promotion || "q";
      }

      const move = instance.move(moveData);

      if (!move) {
        return socket.emit("move_rejected", { reason: "illegal_move" });
      }
      io.to(gameId).emit("board_sync", {
        fen: instance.fen(),
        lastMove: move,
        turn: instance.turn(),
      });

      if (instance.isGameOver()) {
        let reason = "unknown";
        let winner = null;

        if (instance.isCheckmate()) {
          reason = "checkmate";
          winner = instance.turn() === "w" ? "black" : "white";
        } else if (instance.isStalemate()) {
          reason = "stalemate";
          winner = "draw";
        } else if (instance.isThreefoldRepetition()) {
          reason = "repetition";
          winner = "draw";
        } else if (instance.isInsufficientMaterial()) {
          reason = "insufficient_material";
          winner = "draw";
        } else {
          reason = "agreement";
          winner = "draw";
        }

        const dateString = new Date()
          .toISOString()
          .split("T")[0]
          .replace(/-/g, ".");
        const resultString =
          winner === "white" ? "1-0" : winner === "black" ? "0-1" : "1/2-1/2";

        instance.header("Event", "Arena Match");
        instance.header("Site", "local");
        instance.header("Date", dateString);
        instance.header("White", players.white.user.userName);
        instance.header("Black", players.black.user.userName);
        instance.header("Result", resultString);

        const finalPgn = instance.pgn();

        const whiteResult =
          winner === "white" ? "win" : winner === "draw" ? "draw" : "loss";
        const blackResult =
          winner === "black" ? "win" : winner === "draw" ? "draw" : "loss";

        const whiteStats = calculateElo(
          players.white.user.rating,
          players.black.user.rating,
          whiteResult,
          players.white.user.gamesPlayed,
        );
        const blackStats = calculateElo(
          players.black.user.rating,
          players.white.user.rating,
          blackResult,
          players.black.user.gamesPlayed,
        );

        io.to(gameId).emit("game_over", {
          winner,
          reason,
          pgn: finalPgn,
          ratingChanges: {
            white: { delta: whiteStats.delta, newRating: whiteStats.newRating },
            black: { delta: blackStats.delta, newRating: blackStats.newRating },
          },
        });

        try {
          await Promise.all([
            User.findByIdAndUpdate(players.white.user._id, {
              $inc: {
                gamesPlayed: 1,
                wins: winner === "white" ? 1 : 0,
                losses: winner === "black" ? 1 : 0,
                draws: winner === "draw" ? 1 : 0,
              },
              $set: { rating: whiteStats.newRating },
            }),
            User.findByIdAndUpdate(players.black.user._id, {
              $inc: {
                gamesPlayed: 1,
                wins: winner === "black" ? 1 : 0,
                losses: winner === "white" ? 1 : 0,
                draws: winner === "draw" ? 1 : 0,
              },
              $set: { rating: blackStats.newRating },
            }),
          ]);

          await Match.create({
            gameId,
            whitePlayer: players.white.user._id,
            blackPlayer: players.black.user._id,
            winner,
            endReason: reason,
            pgn: finalPgn,
            ratingChanges: {
              white: whiteStats.delta,
              black: blackStats.delta,
            },
            moveCount: instance.history().length,
          });

          console.log(`Match ${gameId} saved. Ratings updated in db.`);
        } catch (err) {
          console.error(
            `Failed to save match data for ${gameId} in db:`,
            err.message,
          );
        }

        gameService.removeGame(gameId);

        const finishedArenaId = game.arenaId;

        gameService.removeGame(gameId);

        if (finishedArenaId) {
          io.to(gameId).emit("requeue_countdown", {
            secondsLeft: 5,
            arenaId: finishedArenaId,
          });

          setTimeout(async () => {
            const { arenaService } = await import("../arena/arenaService.js");
            const { startMatch } = await import("../utils/socketStartMatch.js");

            if (players.white.socket.connected) {
              const resW = arenaService.joinTimedArena(
                finishedArenaId,
                players.white.socket,
                players.white.user,
              );
              if (resW.success)
                startMatch(arenaService.matchTimedArena(finishedArenaId));
            }
            if (players.black.socket.connected) {
              const resB = arenaService.joinTimedArena(
                finishedArenaId,
                players.black.socket,
                players.black.user,
              );
              if (resB.success)
                startMatch(arenaService.matchTimedArena(finishedArenaId));
            }
          }, 5000);
        }
      }
    } catch (error) {
      console.error("[Game Error]:", error);
      socket.emit("move_rejected", { reason: "illegal_move" });
    }
  });
};
