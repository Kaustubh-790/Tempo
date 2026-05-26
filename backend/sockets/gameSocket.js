import { gameService } from "../services/gameService.js";
import { calculateElo } from "../utils/calculateElo.js";

const localSockets = new Map();

const smartEmit = (io, socketId, event, data) => {
  const local = localSockets.get(socketId);
  if (local?.connected) {
    local.emit(event, data);
  } else {
    io.to(socketId).emit(event, data);
  }
};

const gameEmit = (io, gameId, event, data, players) => {
  const wLocal = localSockets.get(players.white.socketId);
  const bLocal = localSockets.get(players.black.socketId);

  if (wLocal?.connected && bLocal?.connected) {
    wLocal.emit(event, data);
    bLocal.emit(event, data);
  } else {
    io.to(gameId).emit(event, data);
  }
};

const handleGameOver = async (io, game, winner, reason) => {
  const { gameId, players } = game;

  const finalPgn = gameService.buildFinalPgn(game, winner, players);
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

  const gameOverPayload = {
    winner,
    reason,
    pgn: finalPgn,
    ratingChanges: {
      white: { delta: whiteStats.delta, newRating: whiteStats.newRating },
      black: { delta: blackStats.delta, newRating: blackStats.newRating },
    },
  };

  gameEmit(io, gameId, "game_over", gameOverPayload, players);

  try {
    const { matchResultQueue } = await import("../workers/dbQueue.js");
    await matchResultQueue.add("saveMatch", {
      gameId,
      whitePlayerId: players.white.user._id,
      blackPlayerId: players.black.user._id,
      winner,
      reason,
      pgn: finalPgn,
      whiteStats,
      blackStats,
      moveCount: game.moves.length,
    });
  } catch (err) {
    console.error(`Failed to queue match ${gameId}:`, err.message);
  }

  const finishedArenaId = game.arenaId;
  await gameService.removeGame(gameId);

  if (finishedArenaId) {
    gameEmit(
      io,
      gameId,
      "requeue_countdown",
      { secondsLeft: 5, arenaId: finishedArenaId },
      players,
    );

    setTimeout(async () => {
      const { arenaService } = await import("../arena/arenaService.js");
      const { startMatch } = await import("../utils/socketStartMatch.js");
      const joined = [];
      for (const side of ["white", "black"]) {
        const player = players[side];
        const sock =
          localSockets.get(player.socketId) ||
          io.sockets.sockets.get(player.socketId);
        if (!sock?.connected) continue;

        const arenaRoom = io.sockets.adapter.rooms.get(
          `arena:${finishedArenaId}`,
        );
        if (!arenaRoom || !arenaRoom.has(sock.id)) continue;

        const res = await arenaService.joinArena(
          finishedArenaId,
          sock,
          player.user,
        );
        if (res.success) {
          joined.push(true);
        }
      }
      arenaService.broadcastQueueUpdate(finishedArenaId);
      for (let i = 0; i < joined.length; i++) {
        const ng = await arenaService.matchArena(finishedArenaId);
        if (ng) startMatch(io, ng);
        else break;
      }
    }, 5000);
  }
};

export const registerGameHandler = (io, socket) => {
  localSockets.set(socket.id, socket);
  socket.on("disconnect", () => localSockets.delete(socket.id));

  socket.on("rejoin_game", async ({ gameId }) => {
    const result = await gameService.rejoinGame(
      gameId,
      socket.user._id.toString(),
      socket.id,
    );
    if (!result)
      return socket.emit("rejoin_failed", { reason: "game_not_found" });
    const { game, color } = result;
    const { instance, players, timeControl } = game;
    socket.join(gameId);
    const opp = color === "white" ? players.black : players.white;
    socket.emit("rejoin_success", {
      gameId,
      arenaId: game.arenaId,
      color,
      opponent: opp.user.userName,
      opponentRating: opp.user.rating,
      fen: instance.fen(),
      turn: instance.turn(),
      pgn: instance.pgn(),
      timeControl: timeControl?.label || "unlimited",
      whiteTime: players.white.time,
      blackTime: players.black.time,
    });
  });

  socket.on("resign", async ({ gameId }) => {
    const game = await gameService.getGame(gameId);
    if (!game)
      return socket.emit("move_rejected", { reason: "game_not_found" });
    const { players } = game;
    const isWhite = players.white.socketId === socket.id;
    const isBlack = players.black.socketId === socket.id;
    if (!isWhite && !isBlack)
      return socket.emit("move_rejected", { reason: "not_your_game" });
    await handleGameOver(io, game, isWhite ? "black" : "white", "resignation");
  });

  socket.on("move_attempt", async ({ gameId, from, to, promotion }) => {
    const game = await gameService.getGame(gameId);
    if (!game)
      return socket.emit("move_rejected", { reason: "game_not_found" });

    const { instance, players } = game;
    const isWhite = players.white.socketId === socket.id;
    const isBlack = players.black.socketId === socket.id;
    const playerColor = isWhite ? "w" : isBlack ? "b" : null;

    if (!playerColor)
      return socket.emit("move_rejected", { reason: "not_your_game" });
    if (instance.turn() !== playerColor)
      return socket.emit("move_rejected", { reason: "not_your_turn" });

    try {
      const piece = instance.get(from);
      const isPromotion =
        piece?.type === "p" && (to.endsWith("8") || to.endsWith("1"));
      const move = instance.move({
        from,
        to,
        ...(isPromotion && { promotion: promotion || "q" }),
      });
      if (!move)
        return socket.emit("move_rejected", { reason: "illegal_move" });

      const updatedMoves = [...game.moves, move.san];
      const now = Date.now();
      const activeStr = isWhite ? "white" : "black";
      const nextStr = isWhite ? "black" : "white";
      const tc = game.timeControl;
      const snapLen = updatedMoves.length;

      if (tc && tc.label !== "unlimited") {
        if (game.lastMoveTime)
          players[activeStr].time -= now - game.lastMoveTime;

        if (players[activeStr].time <= 0 && game.lastMoveTime) {
          players[activeStr].time = 0;
          await gameService.saveGameState(
            gameId,
            instance,
            players,
            now,
            updatedMoves,
          );
          gameEmit(
            io,
            gameId,
            "board_sync",
            {
              fen: instance.fen(),
              lastMove: move,
              turn: instance.turn(),
              whiteTime: players.white.time,
              blackTime: players.black.time,
            },
            players,
          );
          return await handleGameOver(io, game, nextStr, "timeout");
        }

        players[activeStr].time += (tc.increment || 0) * 1000;
        game.lastMoveTime = now;

        if (!instance.isGameOver()) {
          setTimeout(async () => {
            const check = await gameService.getGame(gameId);
            if (!check || check.moves.length !== snapLen) return;
            check.players[nextStr].time = 0;
            await gameService.saveGameState(
              gameId,
              check.instance,
              check.players,
              null,
              check.moves,
            );
            gameEmit(
              io,
              gameId,
              "board_sync",
              {
                fen: check.instance.fen(),
                lastMove: null,
                turn: check.instance.turn(),
                whiteTime: check.players.white.time,
                blackTime: check.players.black.time,
              },
              check.players,
            );
            await handleGameOver(io, check, activeStr, "timeout");
          }, players[nextStr].time);
        }
      }

      const [, boardSyncPayload] = await Promise.all([
        gameService.saveGameState(
          gameId,
          instance,
          players,
          game.lastMoveTime,
          updatedMoves,
        ),
        Promise.resolve({
          fen: instance.fen(),
          lastMove: move,
          turn: instance.turn(),
          whiteTime: players.white.time,
          blackTime: players.black.time,
        }),
      ]);

      gameEmit(io, gameId, "board_sync", boardSyncPayload, players);

      if (instance.isGameOver()) {
        let reason = "unknown",
          winner = null;
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
        await handleGameOver(
          io,
          { ...game, moves: updatedMoves },
          winner,
          reason,
        );
      }
    } catch (err) {
      console.error("[Game Error]:", err);
      socket.emit("move_rejected", { reason: "illegal_move" });
    }
  });
};
