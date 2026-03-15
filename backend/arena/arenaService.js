import crypto from "crypto";
import { gameService } from "../services/gameService.js";

class ArenaService {
  constructor() {
    this.timedArenas = new Map();
  }

  createArena(duration /*minutes */) {
    const arenaId = crypto.randomUUID();
    const endTime = Date.now() + duration * 60 * 1000;
    this.arena.set(arenaId, { arenaId, endTime, queue: [] });
    return { arenaId, endTime };
  }

  joinArena(arenaId, socket, user) {
    const arena = this.arena.get(arenaId);
    if (!arena) return { error: "Arena not found" };
    if (Date.now() > arena.endTime) return { error: "Arena time has expired" };

    if (arena.queue.find((p) => p.socket.id === socket.id))
      return { error: "Already in queue" };

    arena.queue.push({ socket, user });
    return { success: true, queueLength: arena.queue.length };
  }

  removePlayerFromArena(arenaId, socketId) {
    const arena = this.timedArenas.get(arenaId);
    if (arena) {
      arena.queue = arena.queue.filter((p) => p.socket.id !== socketId);
    }
  }

  removeSocketFromAllArenas(socketId) {
    for (const arena of this.timedArenas.values()) {
      arena.queue = arena.queue.filter((p) => p.socket.id !== socketId);
    }
  }

  matchArena(arenaId) {
    const arena = this.timedArenas.get(arenaId);
    if (!arena || arena.queue.length < 2) return false;

    if (Date.now() > arena.endTime) return false;

    const player1 = arena.queue.shift();
    const player2 = arena.queue.shift();

    return gameService.createGame(player1, player2, arenaId);
  }
}

export const arenaService = new ArenaService();
