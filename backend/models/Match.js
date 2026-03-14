import mongoose from "mongoose";

const MatchSchema = new mongoose.Schema(
  {
    gameId: { type: String, required: true, unique: true, index: true },
    whitePlayer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    blackPlayer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    winner: {
      type: String,
      enum: ["white", "black", "draw"],
      required: true,
    },
    endReason: {
      type: String,
      enum: [
        "checkmate",
        "resignation",
        "timeout",
        "stalemate",
        "repetition",
        "insufficient_material",
        "agreement",
      ],
      required: true,
    },
    pgn: {
      type: String,
      required: true,
    },
    ratingChanges: {
      white: { type: Number, required: true, default: 0 }, // defaults to zero just for testing, have to remove default value later
      black: { type: Number, required: true, default: 0 },
    },
    moveCount: { type: Number },
    playedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

const Match = mongoose.model("Match", MatchSchema);
export default Match;
