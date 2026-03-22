import { arenaService } from "./arenaService.js";
import { startMatch } from "../utils/socketStartMatch.js";

export const registerArenaHandlers = (io, socket) => {
  socket.on("join_arena", ({ arenaId }) => {
    const result = arenaService.joinArena(arenaId, socket, socket.user);

    if (result.error) {
      return socket.emit("arena_error", { message: result.error });
    }

    // Join the arena socket room so this player receives queue/expiry broadcasts
    socket.join(`arena:${arenaId}`);

    console.log(
      `[Arena] ${socket.user.userName} joined arena ${arenaId}. Queue: ${result.queueLength}`,
    );

    // Broadcast updated queue to everyone waiting (including this player)
    arenaService.broadcastQueueUpdate(arenaId);

    // Try to form a match
    const newGame = arenaService.matchArena(arenaId);
    startMatch(newGame);
  });

  socket.on("leave_arena", ({ arenaId }) => {
    arenaService.removePlayerFromArena(arenaId, socket.id);
    socket.leave(`arena:${arenaId}`);
    arenaService.broadcastQueueUpdate(arenaId);
  });

  socket.on("disconnect", () => {
    // Returns list of arenas this socket was in so we can broadcast updates
    const affected = arenaService.removeSocketFromAllArenas(socket.id);
    for (const arenaId of affected) {
      arenaService.broadcastQueueUpdate(arenaId);
    }
  });
};
