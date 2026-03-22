import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useSocket } from "../contexts/SocketContext";
import "./Game.css";

const Game = () => {
  const { gameId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const socket = useSocket();

  // Recover game data from navigation state or sessionStorage
  const gameData = useMemo(() => {
    if (location.state) return location.state;
    const stored = sessionStorage.getItem(`game-${gameId}`);
    return stored ? JSON.parse(stored) : null;
  }, [location.state, gameId]);

  const playerColor = gameData?.color || "white";
  const opponentName = gameData?.opponent || "Opponent";
  const opponentRating = gameData?.opponentRating ?? "?";

  // Chess engine ref (source of local state)
  const chessRef = useRef(new Chess());

  const [fen, setFen] = useState(chessRef.current.fen());
  const [turn, setTurn] = useState("w");
  const [gameOver, setGameOver] = useState(null);
  const [requeue, setRequeue] = useState(null);
  const [statusText, setStatusText] = useState("");
  
  // Arena-specific state
  const [isLookingForMatch, setIsLookingForMatch] = useState(false);
  const [arenaStats, setArenaStats] = useState(null);
  const [arenaTimeLeft, setArenaTimeLeft] = useState("");

  // Keep a "server FEN" for rollback on rejected moves
  const serverFenRef = useRef(chessRef.current.fen());

  // ─── Socket listeners ────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onBoardSync = ({ fen: newFen, lastMove, turn: newTurn }) => {
      chessRef.current.load(newFen);
      serverFenRef.current = newFen;
      setFen(newFen);
      setTurn(newTurn);
      setStatusText("");
    };

    const onMoveRejected = ({ reason }) => {
      // Rollback to last known server state
      chessRef.current.load(serverFenRef.current);
      setFen(serverFenRef.current);
      setStatusText(`Move rejected: ${reason.replace(/_/g, " ")}`);
      setTimeout(() => setStatusText(""), 3000);
    };

    const onGameOver = (data) => {
      setGameOver(data);
    };

    // When the arena game ends on the server, it asks the client to queue up
    const onArenaGameEnded = ({ arenaId }) => {
      setRequeue({ secondsLeft: 5, arenaId });
    };

    // Listen for arena updates (time left, player count)
    const onArenaUpdate = (stats) => {
      setArenaStats(stats);
    };

    // Re-trigger game when a new match is found
    const onMatchStarted = (newGameData) => {
      // Clear game over & queue states
      setGameOver(null);
      setRequeue(null);
      setIsLookingForMatch(false);
      
      // Update session storage for the new game
      sessionStorage.setItem(`game-${newGameData.gameId}`, JSON.stringify(newGameData));
      
      // Update the URL without reloading
      window.history.replaceState(newGameData, "", `/game/${newGameData.gameId}`);
      
      // Reset local engine and state
      chessRef.current.load(newGameData.fen);
      serverFenRef.current = newGameData.fen;
      setFen(newGameData.fen);
      setTurn("w"); // Game always starts with white
      setStatusText("");
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

    socket.on("board_sync", onBoardSync);
    socket.on("move_rejected", onMoveRejected);
    socket.on("game_over", onGameOver);
    socket.on("arena_game_ended", onArenaGameEnded);
    socket.on("arena_update", onArenaUpdate);
    socket.on("match_started", onMatchStarted);

    return () => {
      socket.off("board_sync", onBoardSync);
      socket.off("move_rejected", onMoveRejected);
      socket.off("game_over", onGameOver);
      socket.off("arena_game_ended", onArenaGameEnded);
      socket.off("arena_update", onArenaUpdate);
      socket.off("match_started", onMatchStarted);
    };
  }, [socket]);

  // Handle requeue countdown and joining arena queue
  useEffect(() => {
    if (!requeue || requeue.secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setRequeue((prev) => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) {
          // Time to join the arena queue
          socket.emit("join_arena", { arenaId: prev.arenaId });
          setIsLookingForMatch(true); // Show searching screen
          setGameOver(null); // Hide old game over modal
          return null;
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [requeue, socket]);

  // Handle Arena Timer Countdown
  useEffect(() => {
    if (!arenaStats?.endTime) return;

    const tick = () => {
      const diff = arenaStats.endTime - Date.now();
      if (diff <= 0) {
        setArenaTimeLeft("Expired");
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setArenaTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [arenaStats?.endTime]);

  // When mounting/unmounting an Arena game, we need to join/leave the connection room
  // so the server knows we are actively viewing the arena.
  useEffect(() => {
    if (socket && gameData?.arenaId) {
      socket.emit("join_arena_connection", { arenaId: gameData.arenaId });
      return () => {
        socket.emit("leave_arena_connection", { arenaId: gameData.arenaId });
      };
    }
  }, [socket, gameData?.arenaId]);

  // ─── Move handler (react-chessboard v5 object-arg API) ──
  const onPieceDrop = useCallback(
    ({ piece, sourceSquare, targetSquare }) => {
      if (!targetSquare) return false;

      // Guard: only move on your turn
      const myColorChar = playerColor === "white" ? "w" : "b";
      if (turn !== myColorChar) {
        setStatusText("Not your turn!");
        setTimeout(() => setStatusText(""), 2000);
        return false;
      }

      // piece.pieceType is like "P", "N", "K" etc.
      const pieceType = piece.pieceType.toLowerCase();
      const isPromotion =
        pieceType === "p" &&
        ((myColorChar === "w" && targetSquare[1] === "8") ||
          (myColorChar === "b" && targetSquare[1] === "1"));

      // Try move locally for instant feedback
      try {
        const moveData = { from: sourceSquare, to: targetSquare };
        if (isPromotion) moveData.promotion = "q";

        const result = chessRef.current.move(moveData);
        if (!result) return false;

        setFen(chessRef.current.fen());

        // Send to server
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

  // ─── Drag restrictions (v5: canDragPiece) ────────────────
  const canDragPiece = useCallback(
    ({ piece }) => {
      if (gameOver) return false;
      const myColorChar = playerColor === "white" ? "w" : "b";
      // piece.pieceType is like "P", "N" — color is inferred from position
      // In v5, we need to check whose turn it is
      return turn === myColorChar;
    },
    [playerColor, turn, gameOver],
  );

  // ─── Resign handler ─────────────────────────────────────
  const handleResign = () => {
    if (gameOver) return;
    if (window.confirm("Are you sure you want to resign?")) {
      socket.emit("resign", { gameId });
    }
  };

  // ─── Move history ────────────────────────────────────────
  const moveHistory = chessRef.current.history();
  const movePairs = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: moveHistory[i],
      black: moveHistory[i + 1] || "",
    });
  }

  // ─── Determine display info ──────────────────────────────
  const isMyTurn = turn === (playerColor === "white" ? "w" : "b");
  const topColor = playerColor === "white" ? "black" : "white";
  const bottomColor = playerColor;

  // ─── Result text ─────────────────────────────────────────
  const getResultText = () => {
    if (!gameOver) return "";
    if (gameOver.winner === "draw") return "Draw!";
    if (gameOver.winner === playerColor) return "You Won!";
    return "You Lost!";
  };

  const getReasonText = (reason) => {
    const map = {
      checkmate: "by Checkmate",
      stalemate: "Stalemate",
      resignation: "by Resignation",
      repetition: "Threefold Repetition",
      insufficient_material: "Insufficient Material",
      agreement: "by Agreement",
    };
    return map[reason] || reason;
  };

  // ─── Board size (responsive) ─────────────────────────────
  const boardWidth = Math.min(560, typeof window !== "undefined" ? window.innerWidth - 48 : 560);

  // ─── Render ──────────────────────────────────────────────
  if (!gameData) {
    return (
      <div className="game-container" style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center", color: "#94a3b8" }}>
          <h2 style={{ color: "#f97316", marginBottom: "0.5rem" }}>Game not found</h2>
          <p>This game session may have expired.</p>
          <button className="btn-lobby" style={{ marginTop: "1rem", maxWidth: 200 }} onClick={() => navigate("/")}>
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      {/* ─── Board Column ─── */}
      <div className="board-column">
        {/* Top player (opponent) */}
        <div className={`player-panel ${turn === (topColor === "white" ? "w" : "b") ? "active-turn" : ""}`}>
          <div className="player-info">
            <div className={`player-avatar ${topColor}-avatar`}>
              {opponentName.charAt(0)}
            </div>
            <div>
              <div className="player-name">{opponentName}</div>
              <div className="player-rating">{opponentRating}</div>
            </div>
          </div>
          <div className={`turn-indicator ${turn === (topColor === "white" ? "w" : "b") ? "active" : ""}`} />
        </div>

        {/* Chess board (react-chessboard v5 options API) */}
        <div className="board-wrapper" style={{ width: boardWidth, height: boardWidth }}>
          <Chessboard
            options={{
              id: "game-board",
              position: fen,
              onPieceDrop,
              boardOrientation: playerColor,
              canDragPiece,
              animationDurationInMs: 200,
              boardStyle: {
                borderRadius: "4px",
              },
              darkSquareStyle: { backgroundColor: "#779952" },
              lightSquareStyle: { backgroundColor: "#edeed1" },
            }}
          />
        </div>

        {/* Status bar */}
        <div className="game-status-bar">
          {statusText || (gameOver ? "" : isMyTurn ? "Your turn" : "Opponent's turn")}
        </div>

        {/* Bottom player (you) */}
        <div className={`player-panel ${isMyTurn && !gameOver ? "active-turn" : ""}`}>
          <div className="player-info">
            <div className={`player-avatar ${bottomColor}-avatar`}>
              {bottomColor === "white" ? "W" : "B"}
            </div>
            <div>
              <div className="player-name">You ({playerColor})</div>
              <div className="player-rating">{gameData?.yourRating ?? ""}</div>
            </div>
          </div>
          <div className={`turn-indicator ${isMyTurn && !gameOver ? "active" : ""}`} />
        </div>
      </div>

      {/* ─── Sidebar ─── */}
      <div className="game-sidebar">
        
        {/* Arena Info Card (Only shown if part of an arena) */}
        {gameData?.arenaId && (
          <div className="move-history-card" style={{ marginBottom: "1rem" }}>
            <div className="move-history-header" style={{ justifyContent: "center", borderBottom: 0 }}>
              <span style={{ color: "#f97316" }}>Timed Arena</span>
            </div>
            <div style={{ padding: "0.5rem 1rem", fontSize: "0.9rem", color: "#cbd5e1", textAlign: "center" }}>
              <div style={{ marginBottom: "0.5rem" }}>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Time Remaining</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: arenaTimeLeft === "Expired" ? "#ef4444" : "#f1f5f9", fontFamily: "monospace" }}>
                  {arenaTimeLeft || "..."}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Players in Arena</div>
                <div style={{ fontSize: "1.1rem", fontWeight: "500" }}>{arenaStats?.connectedCount || "-"}</div>
              </div>
            </div>
          </div>
        )}

        {/* Move history */}
        <div className="move-history-card">
          <div className="move-history-header">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm0 4v5l4.28 2.54-.72 1.21L12 13V7h1z" />
            </svg>
            Moves
          </div>
          <div className="move-list">
            {movePairs.length === 0 && (
              <div style={{ padding: "1rem", color: "#64748b", textAlign: "center", fontSize: "0.85rem" }}>
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

        {/* Actions */}
        <div className="game-actions">
          {!gameOver && !isLookingForMatch && (
            <button className="btn-resign" onClick={handleResign}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              Resign
            </button>
          )}
          <button className="btn-lobby" onClick={() => {
            if (isLookingForMatch && gameData?.arenaId) {
               socket.emit("leave_arena", { arenaId: gameData.arenaId });
            }
            navigate(gameData?.arenaId ? `/arena/${gameData.arenaId}` : "/");
          }}>
            ← {isLookingForMatch ? "Leave Queue" : "Back to Lobby"}
          </button>
        </div>
      </div>

      {/* ─── Game Over Modal ─── */}
      {gameOver && (
        <div className="game-over-overlay">
          <div className="game-over-modal">
            <h2>{getResultText()}</h2>
            <div className="game-over-reason">{getReasonText(gameOver.reason)}</div>

            {gameOver.ratingChanges && (
              <div className="rating-changes">
                <div className="rating-change-item">
                  <span className="rating-label">White</span>
                  <span className={`rating-delta ${gameOver.ratingChanges.white.delta > 0 ? "positive" : gameOver.ratingChanges.white.delta < 0 ? "negative" : "neutral"}`}>
                    {gameOver.ratingChanges.white.delta > 0 ? "+" : ""}
                    {gameOver.ratingChanges.white.delta}
                  </span>
                </div>
                <div className="rating-change-item">
                  <span className="rating-label">Black</span>
                  <span className={`rating-delta ${gameOver.ratingChanges.black.delta > 0 ? "positive" : gameOver.ratingChanges.black.delta < 0 ? "negative" : "neutral"}`}>
                    {gameOver.ratingChanges.black.delta > 0 ? "+" : ""}
                    {gameOver.ratingChanges.black.delta}
                  </span>
                </div>
              </div>
            )}

            <div className="game-over-actions">
              <button className="btn-lobby" onClick={() => navigate(gameData?.arenaId ? `/arena/${gameData.arenaId}` : "/")}>
                ← Back to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Looking for Match Overlay ─── */}
      {isLookingForMatch && (
        <div className="game-over-overlay" style={{ backdropFilter: "blur(6px)", backgroundColor: "rgba(15, 23, 42, 0.85)" }}>
          <div className="game-over-modal" style={{ border: "2px solid #f97316", boxShadow: "0 0 40px rgba(249, 115, 22, 0.2)"}}>
             <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "1rem" }}>
                <div style={{ width: "16px", height: "16px", backgroundColor: "#f97316", borderRadius: "50%", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }} />
                <h2 style={{ color: "#f97316", margin: 0 }}>Looking for match...</h2>
             </div>
             <p style={{ color: "#94a3b8", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
               Waiting for an opponent in the arena queue. Please stay on this screen.
             </p>
             <button className="btn-lobby" style={{ backgroundColor: "#ef4444", borderColor: "#dc2626" }} onClick={() => {
                socket.emit("leave_arena", { arenaId: gameData.arenaId });
                navigate(`/arena/${gameData.arenaId}`);
             }}>
                Cancel Search
             </button>
          </div>
        </div>
      )}

      {/* ─── Requeue Banner ─── */}
      {requeue && (
        <div className="requeue-banner" style={{ zIndex: 9999 }}>
          Queuing for next arena match in {requeue.secondsLeft}s...
        </div>
      )}
    </div>
  );
};

export default Game;
