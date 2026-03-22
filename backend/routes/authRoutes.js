import express from "express";
import {
  registerEmailPassword,
  loginEmailPassword,
  handleGoogleAuth,
} from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register-email", registerEmailPassword);
router.post("/login-email", loginEmailPassword); // expects a idToken sent by the frontend
router.post("/login-google", handleGoogleAuth);

export default router;
