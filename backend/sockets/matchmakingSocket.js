import { gameService } from "../services/gameService.js";
import { startMatch } from "../utils/socketStartMatch.js";

export const registerMatchMakingHandlers = (io, socket) => {
  socket.on("enter_arena", () => {
    const added = gameService.addToQueue(socket, socket.user);
    if (!added) return;

    console.log(
      `[Global] ${socket.user.userName} joined global pool. Queue: ${gameService.getQueueLength()}`,
    );
    startMatch(gameService.matchPlayers());
  });

  socket.on("disconnect", () => {
    gameService.removeFromQueue(socket.id);
  });
};
