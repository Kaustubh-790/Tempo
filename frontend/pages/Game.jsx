import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useSocket } from "../contexts/SocketContext";
import "./Game.css";

const Game = () => {
  const { gameId: routeGameId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const socket = useSocket();

  const [gameData, setGameData] = useState(() => {
    if (location.state?.gameId) return location.state;
    const stored = sessionStorage.getItem(`game-${routeGameId}`);
    return stored ? JSON.parse(stored) : null;
  });

  const [rejoinStatus, setRejoinStatus] = useState("pending");
  const [confirmResign, setConfirmResign] = useState(false);

  const gameId = gameData?.gameId || routeGameId;
  const playerColor = gameData?.color || "white";
  const opponentName = gameData?.opponent || "Opponent";
  const opponentRating = gameData?.opponentRating ?? "?";

  const chessRef = useRef(new Chess());
  const serverFenRef = useRef(chessRef.current.fen());

  useEffect(() => {
    if (gameData?.fen) {
      try {
        chessRef.current.load(gameData.fen);
        serverFenRef.current = gameData.fen;
      } catch (_) {}
    }
  }, []);

  const [fen, setFen] = useState(() => gameData?.fen || new Chess().fen());
  const [turn, setTurn] = useState("w");
  const [whiteTime, setWhiteTime] = useState(gameData?.whiteTime || 0);
  const [blackTime, setBlackTime] = useState(gameData?.blackTime || 0);
  const [gameOver, setGameOver] = useState(null);
  const [requeue, setRequeue] = useState(null);
  const [statusText, setStatusText] = useState("");
  const [isLookingForMatch, setIsLookingForMatch] = useState(false);
  const [arenaExpired, setArenaExpired] = useState(false);
  const [arenaEndTime, setArenaEndTime] = useState(null);
  const [arenaTimeLeft, setArenaTimeLeft] = useState("");
  const moveListRef = useRef(null);

  /* ── Clock helpers ── */
  const formatClock = (ms) => {
    if (ms === undefined || ms === null) return "0:00";
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (ms < 20000 && ms > 0) {
      const tenths = Math.floor((ms % 1000) / 100);
      return `${m}:${s.toString().padStart(2, "0")}.${tenths}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const clockColor = (ms, active) => {
    if (!active) return {};
    if (ms <= 10000)
      return { background: "#dc2626", color: "#fff", borderColor: "#dc2626" };
    if (ms <= 30000)
      return { background: "#f59e0b", color: "#000", borderColor: "#f59e0b" };
    return {
      background: "var(--accent)",
      color: "#fff",
      borderColor: "var(--accent)",
    };
  };

  /* ── Client-side countdown ── */
  useEffect(() => {
    if (
      gameOver ||
      isLookingForMatch ||
      !gameData?.timeControl ||
      gameData.timeControl === "unlimited"
    )
      return;
    const interval = setInterval(() => {
      if (turn === "w") setWhiteTime((p) => Math.max(0, p - 100));
      else setBlackTime((p) => Math.max(0, p - 100));
    }, 100);
    return () => clearInterval(interval);
  }, [turn, gameOver, isLookingForMatch, gameData?.timeControl]);

  /* ── Arena timer ── */
  useEffect(() => {
    if (!arenaEndTime) return;
    const tick = () => {
      const diff = arenaEndTime - Date.now();
      if (diff <= 0) {
        setArenaTimeLeft("Expired");
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setArenaTimeLeft(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [arenaEndTime]);

  /* ── Rejoin ── */
  useEffect(() => {
    if (!socket || !routeGameId) return;
    socket.emit("rejoin_game", { gameId: routeGameId });
  }, [socket, routeGameId]);

  /* ── Socket events (all logic unchanged) ── */
  useEffect(() => {
    if (!socket) return;

    const onRejoinSuccess = (data) => {
      setRejoinStatus("ok");
      const chess = new Chess();
      try {
        chess.loadPgn(data.pgn);
      } catch (_) {
        chess.load(data.fen);
      }
      chessRef.current = chess;
      serverFenRef.current = data.fen;
      setFen(data.fen);
      setTurn(data.turn);
      if (data.whiteTime !== undefined) setWhiteTime(data.whiteTime);
      if (data.blackTime !== undefined) setBlackTime(data.blackTime);
      setGameOver(null);
      setStatusText("");
      const restored = {
        gameId: data.gameId,
        arenaId: data.arenaId,
        color: data.color,
        opponent: data.opponent,
        opponentRating: data.opponentRating,
        fen: data.fen,
        timeControl: data.timeControl,
        whiteTime: data.whiteTime,
        blackTime: data.blackTime,
      };
      setGameData(restored);
      sessionStorage.setItem(`game-${data.gameId}`, JSON.stringify(restored));
    };

    const onRejoinFailed = ({ reason }) => {
      console.log("[Rejoin] Failed:", reason);
      setRejoinStatus("failed");
    };

    const onBoardSync = ({
      fen: newFen,
      turn: newTurn,
      whiteTime: newWt,
      blackTime: newBt,
    }) => {
      const newBoard = newFen.split(" ")[0];
      const currentBoard = chessRef.current.fen().split(" ")[0];

      if (newBoard === currentBoard) {
        // Server confirmed OUR move — chess ref already has it, just update server ref
        serverFenRef.current = newFen;
      } else {
        // OPPONENT moved — find and apply the move so history is preserved
        // (.move() keeps the history; .load() wipes it, causing the flash-and-disappear bug)
        const tempChess = new Chess(serverFenRef.current);
        const legalMoves = tempChess.moves({ verbose: true });

        let applied = false;
        for (const m of legalMoves) {
          const t = new Chess(serverFenRef.current);
          t.move(m);
          if (t.fen().split(" ")[0] === newBoard) {
            chessRef.current.move(m);
            applied = true;
            break;
          }
        }

        // Fallback (e.g. server-driven correction after reconnect)
        if (!applied) chessRef.current.load(newFen);

        serverFenRef.current = newFen;
      }

      setFen(newFen);
      setTurn(newTurn);
      setStatusText("");
      if (newWt !== undefined) setWhiteTime(newWt);
      if (newBt !== undefined) setBlackTime(newBt);
    };

    const onMoveRejected = ({ reason }) => {
      // Undo the optimistic local move (preserves history up to that point)
      chessRef.current.undo();
      // Sanity-check: if undo left us in a wrong state, force-sync with server FEN
      if (
        chessRef.current.fen().split(" ")[0] !==
        serverFenRef.current.split(" ")[0]
      ) {
        chessRef.current.load(serverFenRef.current);
      }
      setFen(serverFenRef.current);
      setStatusText(`Move rejected: ${reason.replace(/_/g, " ")}`);
      setTimeout(() => setStatusText(""), 3000);
    };

    const onGameOver = (data) => {
      setGameOver(data);
      setConfirmResign(false);
    };

    const onMatchStarted = (newGameData) => {
      const freshChess = new Chess();
      chessRef.current = freshChess;
      serverFenRef.current = freshChess.fen();
      setFen(freshChess.fen());
      setTurn("w");
      setGameOver(null);
      setRequeue(null);
      setIsLookingForMatch(false);
      setArenaExpired(false);
      setStatusText("");
      setRejoinStatus("ok");
      setConfirmResign(false);
      if (newGameData.whiteTime !== undefined)
        setWhiteTime(newGameData.whiteTime);
      if (newGameData.blackTime !== undefined)
        setBlackTime(newGameData.blackTime);
      setGameData(newGameData);
      sessionStorage.setItem(
        `game-${newGameData.gameId}`,
        JSON.stringify(newGameData),
      );
      window.history.replaceState(
        newGameData,
        "",
        `/game/${newGameData.gameId}`,
      );
    };

    const onRequeueCountdown = ({ secondsLeft, arenaId }) => {
      setRequeue({ secondsLeft, arenaId });
      const interval = setInterval(() => {
        setRequeue((prev) => {
          if (!prev || prev.secondsLeft <= 1) {
            clearInterval(interval);
            return null;
          }
          return { ...prev, secondsLeft: prev.secondsLeft - 1 };
        });
      }, 1000);
    };

    const onArenaExpired = () => {
      setArenaExpired(true);
      setRequeue(null);
      setIsLookingForMatch(false);
      setGameOver(
        (prev) =>
          prev ?? {
            winner: null,
            reason: "arena_expired",
            ratingChanges: null,
          },
      );
    };

    const onQueueUpdate = ({ endTime }) => {
      if (endTime) setArenaEndTime(endTime);
    };

    socket.on("rejoin_success", onRejoinSuccess);
    socket.on("rejoin_failed", onRejoinFailed);
    socket.on("board_sync", onBoardSync);
    socket.on("move_rejected", onMoveRejected);
    socket.on("game_over", onGameOver);
    socket.on("match_started", onMatchStarted);
    socket.on("requeue_countdown", onRequeueCountdown);
    socket.on("arena_expired", onArenaExpired);
    socket.on("arena_queue_update", onQueueUpdate);

    return () => {
      socket.off("rejoin_success", onRejoinSuccess);
      socket.off("rejoin_failed", onRejoinFailed);
      socket.off("board_sync", onBoardSync);
      socket.off("move_rejected", onMoveRejected);
      socket.off("game_over", onGameOver);
      socket.off("match_started", onMatchStarted);
      socket.off("requeue_countdown", onRequeueCountdown);
      socket.off("arena_expired", onArenaExpired);
      socket.off("arena_queue_update", onQueueUpdate);
    };
  }, [socket]);

  /* ── Requeue auto-join ── */
  useEffect(() => {
    if (!requeue || requeue.secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setRequeue((prev) => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) {
          socket.emit("join_arena", { arenaId: prev.arenaId });
          setIsLookingForMatch(true);
          setGameOver(null);
          return null;
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [requeue, socket]);

  /* ── Auto-scroll move list ── */
  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  });

  /* ── Board interaction ── */
  const onPieceDrop = useCallback(
    ({ piece, sourceSquare, targetSquare }) => {
      if (!targetSquare) return false;
      const myColorChar = playerColor === "white" ? "w" : "b";
      if (turn !== myColorChar) {
        setStatusText("Not your turn!");
        setTimeout(() => setStatusText(""), 2000);
        return false;
      }
      const pieceType = piece.pieceType.toLowerCase();
      const isPromotion =
        pieceType === "p" &&
        ((myColorChar === "w" && targetSquare[1] === "8") ||
          (myColorChar === "b" && targetSquare[1] === "1"));
      try {
        const moveData = { from: sourceSquare, to: targetSquare };
        if (isPromotion) moveData.promotion = "q";
        const result = chessRef.current.move(moveData);
        if (!result) return false;
        setFen(chessRef.current.fen());
        socket.emit("move_attempt", {
          gameId,
          from: sourceSquare,
          to: targetSquare,
          promotion: isPromotion ? "q" : undefined,
        });
        return true;
      } catch {
        return false;
      }
    },
    [turn, playerColor, socket, gameId],
  );

  const canDragPiece = useCallback(
    ({ piece }) => {
      if (gameOver) return false;
      return turn === (playerColor === "white" ? "w" : "b");
    },
    [playerColor, turn, gameOver],
  );

  /* ── Resign ── */
  const handleResign = () => {
    if (gameOver) return;
    setConfirmResign(true);
  };
  const confirmResignYes = () => {
    socket.emit("resign", { gameId });
    setConfirmResign(false);
  };

  /* ── Move history ── */
  const moveHistory = chessRef.current.history();
  const movePairs = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: moveHistory[i],
      black: moveHistory[i + 1] || "",
    });
  }

  const isMyTurn = turn === (playerColor === "white" ? "w" : "b");
  const topColor = playerColor === "white" ? "black" : "white";
  const bottomColor = playerColor;

  const getResultText = () => {
    if (!gameOver) return "";
    if (gameOver.reason === "arena_expired") return "Arena Ended";
    if (gameOver.winner === "draw") return "Draw!";
    if (gameOver.winner === playerColor) return "You Won! 🎉";
    return "You Lost";
  };

  const getReasonText = (reason) =>
    ({
      checkmate: "by Checkmate",
      stalemate: "Stalemate",
      resignation: "by Resignation",
      repetition: "Threefold Repetition",
      insufficient_material: "Insufficient Material",
      agreement: "by Agreement",
      timeout: "on Time",
      arena_expired: "The arena time limit was reached",
    })[reason] || reason;

  const boardWidth = Math.min(
    560,
    typeof window !== "undefined" ? window.innerWidth - 48 : 560,
  );

  /* ── Loading states ── */
  if (!gameData && rejoinStatus === "pending") {
    return (
      <div
        className="game-container"
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid var(--border-2)",
              borderTop: "3px solid var(--accent)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 1rem",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Reconnecting to game…
          </p>
        </div>
      </div>
    );
  }

  if (rejoinStatus === "failed" && !gameData) {
    return (
      <div
        className="game-container"
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <div style={{ textAlign: "center" }}>
          <p
            style={{
              color: "var(--accent)",
              fontWeight: 700,
              fontSize: "1.1rem",
              marginBottom: "0.5rem",
            }}
          >
            Game not found
          </p>
          <p
            style={{
              color: "var(--text-muted)",
              marginBottom: "1.25rem",
              fontSize: "0.9rem",
            }}
          >
            This game has ended or doesn't exist.
          </p>
          <button className="btn btn-subtle" onClick={() => navigate("/")}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div className="game-container">
      {/* Board column */}
      <div className="board-column">
        {/* Opponent panel */}
        <div
          className={`player-panel ${turn === (topColor === "white" ? "w" : "b") ? "active-turn" : ""}`}
        >
          <div className="player-info">
            <div className={`player-avatar ${topColor}-avatar`}>
              {opponentName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="player-name">{opponentName}</div>
              <div className="player-rating">{opponentRating}</div>
            </div>
          </div>
          {gameData?.timeControl !== "unlimited" && (
            <div
              className="player-clock"
              style={clockColor(
                topColor === "white" ? whiteTime : blackTime,
                turn === (topColor === "white" ? "w" : "b"),
              )}
            >
              {formatClock(topColor === "white" ? whiteTime : blackTime)}
            </div>
          )}
          <div
            className={`turn-indicator ${turn === (topColor === "white" ? "w" : "b") ? "active" : ""}`}
          />
        </div>

        {/* Board */}
        <div
          className="board-wrapper"
          style={{ width: boardWidth, height: boardWidth }}
        >
          <Chessboard
            options={{
              id: "game-board",
              position: fen,
              onPieceDrop,
              boardOrientation: playerColor,
              canDragPiece,
              animationDurationInMs: 180,
              darkSquareStyle: { backgroundColor: "#779952" },
              lightSquareStyle: { backgroundColor: "#edeed1" },
            }}
          />
        </div>

        {/* Status bar */}
        <div className="game-status-bar">
          {statusText ||
            (gameOver ? "" : isMyTurn ? "Your turn" : "Opponent's turn")}
        </div>

        {/* Your panel */}
        <div
          className={`player-panel ${isMyTurn && !gameOver ? "active-turn" : ""}`}
        >
          <div className="player-info">
            <div className={`player-avatar ${bottomColor}-avatar`}>
              {bottomColor === "white" ? "W" : "B"}
            </div>
            <div>
              <div className="player-name">You ({playerColor})</div>
              <div className="player-rating">{gameData?.yourRating ?? ""}</div>
            </div>
          </div>
          {gameData?.timeControl !== "unlimited" && (
            <div
              className="player-clock"
              style={clockColor(
                bottomColor === "white" ? whiteTime : blackTime,
                isMyTurn && !gameOver,
              )}
            >
              {formatClock(bottomColor === "white" ? whiteTime : blackTime)}
            </div>
          )}
          <div
            className={`turn-indicator ${isMyTurn && !gameOver ? "active" : ""}`}
          />
        </div>
      </div>

      {/* Sidebar */}
      <div className="game-sidebar">
        {/* Arena timer */}
        {gameData?.arenaId && (
          <div className="move-history-card">
            <div
              className="move-history-header"
              style={{ justifyContent: "space-between" }}
            >
              <span style={{ color: "var(--accent)" }}>Timed Arena</span>
              {arenaExpired && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "#ef4444",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                  }}
                >
                  EXPIRED
                </span>
              )}
            </div>
            <div style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
              {arenaEndTime && !arenaExpired && (
                <>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Arena ends in
                  </div>
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: "bold",
                      fontFamily: "monospace",
                      color:
                        arenaTimeLeft === "Expired"
                          ? "#ef4444"
                          : arenaEndTime - Date.now() < 60_000
                            ? "#f87171"
                            : arenaEndTime - Date.now() < 5 * 60_000
                              ? "#fbbf24"
                              : "var(--accent)",
                    }}
                  >
                    {arenaTimeLeft || "…"}
                  </div>
                </>
              )}
              {arenaExpired && (
                <div style={{ color: "#ef4444", fontSize: "0.85rem" }}>
                  The arena has ended
                </div>
              )}
            </div>
          </div>
        )}

        {/* Move history */}
        <div className="move-history-card">
          <div className="move-history-header">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm0 4v5l4.28 2.54-.72 1.21L12 13V7h1z" />
            </svg>
            Moves
          </div>
          <div className="move-list" ref={moveListRef}>
            {movePairs.length === 0 && (
              <div
                style={{
                  padding: "1rem",
                  color: "var(--text-dim)",
                  textAlign: "center",
                  fontSize: "0.8rem",
                }}
              >
                No moves yet
              </div>
            )}
            {movePairs.map((pair) => (
              <div className="move-row" key={pair.num}>
                <span className="move-number">{pair.num}.</span>
                <span className="move-white">{pair.white}</span>
                <span className="move-black">{pair.black}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="game-actions">
          {!gameOver && !isLookingForMatch && (
            <button className="btn-resign" onClick={handleResign}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              Resign
            </button>
          )}
          <button
            className="btn-lobby"
            onClick={() => {
              if (isLookingForMatch && gameData?.arenaId)
                socket.emit("leave_arena", { arenaId: gameData.arenaId });
              navigate(gameData?.arenaId ? `/arena/${gameData.arenaId}` : "/");
            }}
          >
            ← {isLookingForMatch ? "Leave Queue" : "Back to Lobby"}
          </button>
        </div>
      </div>

      {/* ── Resign confirm dialog ── */}
      {confirmResign && (
        <div
          className="game-over-overlay"
          onClick={() => setConfirmResign(false)}
        >
          <div className="game-over-modal" onClick={(e) => e.stopPropagation()}>
            <p
              style={{
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "0.5rem",
              }}
            >
              Confirm Action
            </p>
            <h2 style={{ fontSize: "1.25rem" }}>Resign this game?</h2>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.875rem",
                marginBottom: "1.5rem",
              }}
            >
              Your opponent will be declared the winner.
            </p>
            <div className="game-over-actions">
              <button
                className="btn btn-danger btn-full"
                onClick={confirmResignYes}
              >
                Yes, I resign
              </button>
              <button
                className="btn btn-subtle btn-full"
                onClick={() => setConfirmResign(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Game over modal ── */}
      {gameOver && (
        <div className="game-over-overlay">
          <div className="game-over-modal">
            <h2>{getResultText()}</h2>
            <div className="game-over-reason">
              {getReasonText(gameOver.reason)}
            </div>

            {gameOver.ratingChanges && (
              <div className="rating-changes">
                {["white", "black"].map((c) => (
                  <div className="rating-change-item" key={c}>
                    <span className="rating-label">{c}</span>
                    <span
                      className={`rating-delta ${
                        gameOver.ratingChanges[c].delta > 0
                          ? "positive"
                          : gameOver.ratingChanges[c].delta < 0
                            ? "negative"
                            : "neutral"
                      }`}
                    >
                      {gameOver.ratingChanges[c].delta > 0 ? "+" : ""}
                      {gameOver.ratingChanges[c].delta}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="game-over-actions">
              {arenaExpired ? (
                <button
                  className="btn btn-subtle btn-full"
                  onClick={() => navigate("/arena")}
                >
                  Back to Arenas
                </button>
              ) : (
                <button
                  className="btn btn-subtle btn-full"
                  onClick={() =>
                    navigate(
                      gameData?.arenaId ? `/arena/${gameData.arenaId}` : "/",
                    )
                  }
                >
                  Back to Lobby
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isLookingForMatch && !arenaExpired && (
        <div className="game-over-overlay">
          <div
            className="game-over-modal"
            style={{
              border: "1px solid var(--accent-border)",
              boxShadow: "0 0 40px var(--accent-dim)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                marginBottom: "0.75rem",
              }}
            >
              <span
                className="relative flex h-3 w-3"
                style={{ position: "relative" }}
              >
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    opacity: 0.6,
                    animation: "ping 1s cubic-bezier(0,0,0.2,1) infinite",
                  }}
                />
                <span
                  style={{
                    position: "relative",
                    display: "inline-flex",
                    borderRadius: "50%",
                    width: 12,
                    height: 12,
                    background: "var(--accent)",
                  }}
                />
              </span>
              <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
                Finding opponent…
              </h2>
            </div>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.875rem",
                marginBottom: "1.25rem",
              }}
            >
              Waiting in the arena queue.
            </p>
            {arenaEndTime && (
              <p
                style={{
                  color: "var(--accent)",
                  fontFamily: "monospace",
                  fontSize: "1.1rem",
                  marginBottom: "1.25rem",
                }}
              >
                {arenaTimeLeft}
              </p>
            )}
            <button
              className="btn btn-danger btn-full"
              onClick={() => {
                socket.emit("leave_arena", { arenaId: gameData.arenaId });
                navigate(`/arena/${gameData.arenaId}`);
              }}
            >
              Cancel Search
            </button>
          </div>
        </div>
      )}

      {/* ── Requeue banner ── */}
      {requeue && (
        <div className="requeue-banner" style={{ zIndex: 9999 }}>
          Queuing for next match in {requeue.secondsLeft}s…
        </div>
      )}

      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default Game;
