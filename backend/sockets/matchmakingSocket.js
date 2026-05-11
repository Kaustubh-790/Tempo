import { gameService } from "../services/gameService.js";
import { startMatch } from "../utils/socketStartMatch.js";

export const registerMatchMakingHandlers = (io, socket) => {
  socket.on("enter_arena", async (payload) => {
    const activeGame = await gameService.getGameByUserId(socket.user._id);
    if (activeGame) {
      return socket.emit("already_in_game", { gameId: activeGame.gameId });
    }

    const timeControl = payload?.timeControl || null;
    const added = await gameService.addToQueue(
      socket,
      socket.user,
      timeControl,
    );
    if (!added) return;

    const qLen = await gameService.getQueueLength();
    console.log(
      `[Global] ${socket.user.userName} joined global pool (${timeControl?.label || "unlimited"}). Total: ${qLen}`,
    );

    const newGame = await gameService.matchPlayers();
    if (newGame) startMatch(io, newGame);
  });

  socket.on("disconnect", async () => {
    await gameService.removeFromQueue(socket.id);
  });
};
