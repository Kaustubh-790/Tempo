import express from "express";
import { createArena } from "../controllers/arenaController.js";

const router = express.Router();

router.post("/create", createArena);

export default router;
