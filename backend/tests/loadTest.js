/**
 * Chess Server Load Test
 *
 * Each pair creates a private arena → guaranteed they match each other.
 * No cross-pair matching, no timeouts from queue ordering.
 *
 * Usage:
 *   node tests/loadTest.js --pairs=5  --moveDelay=150
 *   node tests/loadTest.js --pairs=20 --moveDelay=100
 *   node tests/loadTest.js --pairs=50 --moveDelay=50
 */

import { io } from "socket.io-client";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import axios from "axios";
import dotenv from "dotenv";
import { Chess } from "chess.js";
import { performance } from "perf_hooks";
import User from "../models/User.js";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";

const agent = new HttpsAgent({
  maxSockets: Infinity,
  rejectUnauthorized: false,
});

// for local testing
/**
 * const agent = new Agent({ maxSockets: Infinity });
 * change httpsAgent to httpAgent at line 84
 */
dotenv.config();

const arg = (name, fallback) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=")[1] : fallback;
};

const NUM_PAIRS = parseInt(arg("pairs", "5"));
const MOVE_DELAY = parseInt(arg("moveDelay", "150"));
const SERVER_URL = arg("url", "http://localhost:5000");
const TIME_CTRL = { label: "1 min", initial: 1, increment: 0 };
const NUM_BOTS = NUM_PAIRS * 2;

const stats = {
  connected: 0,
  matched: 0,
  gamesCompleted: 0,
  movesSent: 0,
  movesRejected: 0,
  connectErrors: 0,
  gameErrors: 0,
  duplicateGameIds: 0,
  moveTimes: [],
  startTime: 0,
};

const seenGameIds = new Set();

const pct = (arr, p) => {
  if (!arr.length) return "N/A";
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.ceil((p / 100) * sorted.length) - 1].toFixed(1) + "ms";
};

async function seedBots() {
  await User.deleteMany({ userName: /^loadbot_/ });
  const docs = Array.from({ length: NUM_BOTS }, (_, i) => ({
    userName: `loadbot_${i}_${Date.now().toString(36)}`,
    firebaseUid: `fake_fb_lb_${i}_${Date.now()}`,
    rating: 1200,
    gamesPlayed: 0,
  }));
  const created = await User.insertMany(docs);
  console.log(`[Setup] Created ${NUM_BOTS} bot accounts`);
  return created;
}

function makeToken(user) {
  return jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

async function createArena(token) {
  const res = await axios.post(
    `${SERVER_URL}/api/arena/create`,
    { duration: 10, timeControl: TIME_CTRL },
    { headers: { Cookie: `jwt=${token}` } },
    {
      httpsAgent: agent,
    },
  );
  return res.data;
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, {
      extraHeaders: { cookie: `jwt=${token}` },
      transports: ["websocket"],
      reconnection: false,
      agent,
    });
    const t = setTimeout(() => {
      socket.disconnect();
      reject(new Error("connect timeout"));
    }, 8000);
    socket.on("connect", () => {
      clearTimeout(t);
      resolve(socket);
    });
    socket.on("connect_error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function playGame(socket, startData) {
  return new Promise((resolve) => {
    const { gameId, color, fen: startFen } = startData;
    const chess = new Chess();
    try {
      chess.load(startFen);
    } catch (_) {}

    let myTurn = color === "white";
    let pendingStart = null;
    let resolved = false;

    const finish = (reason) => {
      if (resolved) return;
      resolved = true;
      socket.off("board_sync");
      socket.off("move_rejected");
      socket.off("game_over");
      socket.off("arena_expired");
      resolve(reason);
    };

    const doMove = () => {
      if (resolved || !myTurn) return;
      const moves = chess.moves({ verbose: true });
      if (!moves.length) return;
      const m = moves[Math.floor(Math.random() * moves.length)];
      pendingStart = performance.now();
      stats.movesSent++;
      socket.emit("move_attempt", {
        gameId,
        from: m.from,
        to: m.to,
        promotion: m.promotion || "q",
      });
      myTurn = false;
    };

    socket.on("board_sync", (data) => {
      if (resolved) return;
      if (pendingStart !== null) {
        stats.moveTimes.push(performance.now() - pendingStart);
        pendingStart = null;
      }
      try {
        chess.load(data.fen);
      } catch (_) {}
      const myChar = color === "white" ? "w" : "b";
      myTurn = data.turn === myChar;
      if (myTurn && !chess.isGameOver()) {
        setTimeout(doMove, MOVE_DELAY + Math.random() * 50);
      }
    });

    socket.on("move_rejected", () => {
      stats.movesRejected++;
      pendingStart = null;
      if (!resolved) setTimeout(doMove, MOVE_DELAY);
    });
    socket.on("game_over", () => finish("game_over"));
    socket.on("arena_expired", () => finish("arena_expired"));
    socket.on("disconnect", () => finish("disconnect"));

    if (myTurn) setTimeout(doMove, MOVE_DELAY);
  });
}

async function runPair(botA, botB, pairIndex) {
  const tokenA = makeToken(botA);
  const tokenB = makeToken(botB);

  let sA, sB;
  try {
    [sA, sB] = await Promise.all([
      connectSocket(tokenA),
      connectSocket(tokenB),
    ]);
    stats.connected += 2;
  } catch (err) {
    stats.connectErrors += 2;
    console.error(`[Pair ${pairIndex}] Connect failed:`, err.message);
    return;
  }

  let arenaId;
  try {
    ({ arenaId } = await createArena(tokenA));
  } catch (err) {
    stats.gameErrors++;
    console.error(`[Pair ${pairIndex}] Arena create failed:`, err.message);
    sA.disconnect();
    sB.disconnect();
    return;
  }

  const waitMatch = (sock) =>
    new Promise((res) => sock.once("match_started", res));
  const p1 = waitMatch(sA);
  const p2 = waitMatch(sB);

  sA.emit("join_arena", { arenaId });
  await new Promise((r) => setTimeout(r, 50));
  sB.emit("join_arena", { arenaId });

  let dataA, dataB;
  try {
    [dataA, dataB] = await Promise.race([
      Promise.all([p1, p2]),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("match timeout")), 15000),
      ),
    ]);
  } catch (err) {
    stats.gameErrors++;
    console.error(`[Pair ${pairIndex}] Match failed:`, err.message);
    sA.disconnect();
    sB.disconnect();
    return;
  }

  if (seenGameIds.has(dataA.gameId)) {
    stats.duplicateGameIds++;
    console.error(
      `[Pair ${pairIndex}] DUPLICATE gameId ${dataA.gameId.slice(0, 8)}`,
    );
    sA.disconnect();
    sB.disconnect();
    return;
  }
  seenGameIds.add(dataA.gameId);

  if (dataA.gameId !== dataB.gameId) {
    stats.gameErrors++;
    console.error(
      `[Pair ${pairIndex}]   gameId MISMATCH: ${dataA.gameId.slice(0, 8)} vs ${dataB.gameId.slice(0, 8)}`,
    );
    sA.disconnect();
    sB.disconnect();
    return;
  }

  stats.matched += 2;
  console.log(
    `  [Pair ${pairIndex}] Matched → ${dataA.gameId.slice(0, 8)}… (arena ${arenaId.slice(0, 8)}…)`,
  );

  try {
    await Promise.all([playGame(sA, dataA), playGame(sB, dataB)]);
    stats.gamesCompleted++;
    console.log(`  [Pair ${pairIndex}]  Game complete`);
  } catch (err) {
    stats.gameErrors++;
    console.error(`[Pair ${pairIndex}] Game error:`, err.message);
  }

  sA.disconnect();
  sB.disconnect();
}

function printResults() {
  const elapsed = (performance.now() - stats.startTime) / 1000;
  const throughput = stats.movesSent / elapsed;

  const dupLine =
    stats.duplicateGameIds > 0
      ? `\n  Duplicate gameIds : ${stats.duplicateGameIds}`
      : `\n  No duplicate gameIds`;

  console.log(`
══════════════════════════════════════════════
  Load Test Results
══════════════════════════════════════════════
  Config
    Pairs        : ${NUM_PAIRS}
    Total bots   : ${NUM_BOTS}
    Move delay   : ${MOVE_DELAY}ms
    Server       : ${SERVER_URL}

  Connections
    Connected    : ${stats.connected} / ${NUM_BOTS}
    Connect errs : ${stats.connectErrors}

  Matchmaking
    Matched      : ${stats.matched / 2} pairs${dupLine}

  Games
    Completed    : ${stats.gamesCompleted} / ${NUM_PAIRS}
    Errors       : ${stats.gameErrors}

  Moves
    Sent         : ${stats.movesSent}
    Rejected     : ${stats.movesRejected}
    Throughput   : ${throughput.toFixed(1)} moves/sec

  RTT (move_attempt → board_sync)
    Samples      : ${stats.moveTimes.length}
    p50          : ${pct(stats.moveTimes, 50)}
    p95          : ${pct(stats.moveTimes, 95)}
    p99          : ${pct(stats.moveTimes, 99)}
    max          : ${stats.moveTimes.length ? Math.max(...stats.moveTimes).toFixed(1) + "ms" : "N/A"}

  Duration       : ${elapsed.toFixed(1)}s
══════════════════════════════════════════════`);
}

async function main() {
  console.log(`\n Chess Load Test  — ${NUM_PAIRS} pairs (${NUM_BOTS} bots)`);
  console.log(`   Server : ${SERVER_URL}`);
  console.log(`   Delay  : ${MOVE_DELAY}ms per move\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[Setup] Connected to MongoDB");

  const bots = await seedBots();
  const pairs = [];
  for (let i = 0; i < NUM_BOTS; i += 2) pairs.push([bots[i], bots[i + 1]]);

  stats.startTime = performance.now();
  await Promise.all(pairs.map((pair, idx) => runPair(pair[0], pair[1], idx)));

  printResults();

  await User.deleteMany({ userName: /^loadbot_/ });
  console.log("[Cleanup] Removed bot accounts");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
