import { arenaService } from "./arenaService.js";
import { startMatch } from "../utils/socketStartMatch.js";

export const registerArenaHandlers = (io, socket) => {
  socket.on("join_arena", ({ arenaId }) => {
    const result = arenaService.joinArena(arenaId, socket, socket.user);

    if (result.error) {
      return socket.emit("arena_error", { message: result.error });
    }

    console.log(
      `[Arena] ${socket.user.userName} joined arena ${arenaId}. Queue: ${result.queueLength}`,
    );
    startMatch(arenaService.matchArena(arenaId));
  });

  socket.on("leave_arena", ({ arenaId }) => {
    arenaService.removePlayerFromArena(arenaId, socket.id);
  });

  socket.on("disconnect", () => {
    arenaService.removeSocketFromAllArenas(socket.id);
  });
};
