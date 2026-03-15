import { Chess } from "chess.js";
import crypto from "crypto";

class GameService {
  constructor() {
    this.arenaQueue = [];
    this.activeGames = new Map();
  }

  addToQueue(socket, user) {
    if (this.arenaQueue.find((p) => p.socket.id === socket.id)) return false;
    this.arenaQueue.push({ socket, user });
    return true;
  }

  removeFromQueue(socketId) {
    this.arenaQueue = this.arenaQueue.filter((p) => p.socket.id !== socketId);
  }

  getQueueLength() {
    return this.arenaQueue.length;
  }

  matchPlayers() {
    if (this.arenaQueue.length < 2) return false;
    const player1 = this.arenaQueue.shift();
    const player2 = this.arenaQueue.shift();
    return this.createGame(player1, player2, null);
  }

  createGame(player1, player2, arenaId = null) {
    const gameId = crypto.randomUUID();
    const gameData = {
      instance: new Chess(),
      gameId,
      arenaId,
      players: { white: player1, black: player2 },
    };

    this.activeGames.set(gameId, gameData);
    return gameData;
  }

  getGame(gameId) {
    return this.activeGames.get(gameId);
  }

  removeGame(gameId) {
    this.activeGames.delete(gameId);
  }
}

export const gameService = new GameService();
