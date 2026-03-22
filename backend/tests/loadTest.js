import { io } from "socket.io-client";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/User.js";
import { Chess } from "chess.js";

dotenv.config();

const NUM_BOTS = 2; 
const SERVER_URL = "http://localhost:5000";

const activeGames = new Map();
let matchesStarted = 0;
let matchesCompleted = 0;
let moveCount = 0;

const seedBotsAndGetTokens = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB for load testing data seeding...");

  // Clear previous test bots
  await User.deleteMany({ userName: /^loadbot_/ });

  const botsToCreate = [];
  for (let i = 0; i < NUM_BOTS; i++) {
    botsToCreate.push({
      userName: `bot${i}_${Date.now().toString().slice(-6)}`,
      firebaseUid: `firebase_${i}_${Date.now()}`,
      rating: 1200,
    });
  }

  const createdBots = await User.insertMany(botsToCreate);
  console.log(`Successfully created ${NUM_BOTS} bot accounts.`);

  const tokens = createdBots.map((bot) => {
    return jwt.sign({ userId: bot._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
  });

  return tokens;
};

const runBot = (token, id) => {
  const socket = io(SERVER_URL, {
    extraHeaders: {
      cookie: `jwt=${token}`,
    },
    transports: ["websocket"], // force websocket to avoid polling overhead in tests
  });

  socket.on("connect", () => {
    console.log(`[Bot ${id}] Connected. Queuing...`);
    socket.emit("enter_arena", { timeControl: { label: "bullet", initial: 1, increment: 0 } });
  });

  socket.on("match_started", (data) => {
    matchesStarted++;
    console.log(`[Bot ${id}] Match started against ${data.opponent}! Game: ${data.gameId}`);
    
    // Explicitly ask the backend to join the socket room to guarantee board_sync payload delivery
    socket.emit("rejoin_game", { gameId: data.gameId });

    const game = new Chess(data.fen);
    activeGames.set(data.gameId, game);

    // Provide the spark to actually start the match!
    if (data.color === "white") {
      setTimeout(() => {
        const moves = game.moves({ verbose: true });
        if (moves.length > 0) {
          const randomMove = moves[Math.floor(Math.random() * moves.length)];
          moveCount++;
          socket.emit("move_attempt", { 
            gameId: data.gameId, 
            from: randomMove.from, 
            to: randomMove.to, 
            promotion: "q" 
          });
        }
      }, 100 + Math.random() * 400);
    }
  });

  socket.on("board_sync", (data) => {
    // The board_sync event from the server does NOT include gameId.
    // Since each bot only ever plays 1 concurrent game, we grab the only active game:
    if (activeGames.size === 0) return;
    const [gameId, game] = activeGames.entries().next().value;

    if (data.fen === game.fen()) return;

    game.load(data.fen);
    
    const moves = game.moves({ verbose: true });
    if (moves.length > 0) {
      setTimeout(() => {
        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        moveCount++;
        socket.emit("move_attempt", { 
          gameId: gameId, 
          from: randomMove.from, 
          to: randomMove.to, 
          promotion: "q" 
        });
      }, 100 + Math.random() * 400); 
    }
  });

  socket.on("move_rejected", (data) => {
    console.log(`[Bot ${id}] Move Rejected: ${data.reason}`);
  });

  socket.on("game_over", (data) => {
    matchesCompleted++;
    console.log(`[Bot ${id}] Game Over. Winner: ${data.winner}. Reason: ${data.reason}`);
    
    // Check if all bots are done
    if (matchesCompleted >= NUM_BOTS / 2 || matchesCompleted >= matchesStarted) {
      const elapsedSeconds = (Date.now() - testStartTime) / 1000;
      console.log(`\n=== 🚀 TEST COMPLETE 🚀 ===`);
      console.log(`Target Load: ${NUM_BOTS} Concurrent Bots`);
      console.log(`Total Matches Played: ${matchesCompleted}`);
      console.log(`Total Moves Processed: ${moveCount}`);
      console.log(`Test Duration: ${elapsedSeconds.toFixed(2)}s`);
      console.log(`Throughput: ${(moveCount / elapsedSeconds).toFixed(2)} moves/sec`);
      process.exit(0);
    }
  });

  socket.on("connect_error", (err) => {
    console.log(`[Bot ${id}] Conn Error:`, err.message);
  });
};

let testStartTime;

const main = async () => {
  try {
    const tokens = await seedBotsAndGetTokens();
    testStartTime = Date.now();
    
    console.log("Spawning bots...");
    tokens.forEach((token, index) => {
      // Stagger connection slightly to not burst the loop
      setTimeout(() => runBot(token, index), index * 50);
    });

  } catch (err) {
    console.error("Load test failed to start:", err);
    process.exit(1);
  }
};

main();
