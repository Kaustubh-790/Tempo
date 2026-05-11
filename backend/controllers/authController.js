import firebaseAdmin from "../config/firebaseAdmin.js";
import User from "../models/User.js";
import { emailRegex, passwordRegex } from "../utils/regex.js";
import { generateToken } from "../utils/generateTokens.js";

const setTokenCookie = (res, token) => {
  res.cookie("jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "none",
    maxAge: 3650 * 24 * 60 * 60 * 1000,
  });
};

export const registerEmailPassword = async (req, res) => {
  const { userName, email, password } = req.body;

  if (!userName || !email || !password) {
    return res.status(400).json({
      error: "userName, email, and password are required",
    });
  }

  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      error:
        "Password must be at least 8 characters long and contain at least one letter and one number",
    });
  }

  let firebaseUser;

  try {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        error: "User with this email already exists",
      });
    }

    firebaseUser = await firebaseAdmin.auth().createUser({
      email,
      password,
      displayName: userName,
    });

    const user = await User.create({
      firebaseUid: firebaseUser.uid,
      userName,
      email: email.toLowerCase(),
    });

    const token = generateToken(user);

    setTokenCookie(res, token);

    return res.status(201).json({
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    if (firebaseUser) {
      try {
        await firebaseAdmin.auth().deleteUser(firebaseUser.uid);
      } catch (rollbackError) {
        console.error("Rollback Firebase user failed:", rollbackError);
      }
    }

    console.error("Register Error:", error);

    return res.status(500).json({
      error: error.message,
    });
  }
};

export const loginEmailPassword = async (req, res) => {
  const { idToken } = req.body; // expects idtoken sent by the frontend

  if (!idToken) {
    return res.status(400).json({ error: "ID token is required" });
  }
  try {
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);

    const { uid, email } = decodedToken;

    let user = await User.findOne({ firebaseUid: uid });

    if (!user) {
      return res.status(401).json({ message: "user not found" });
    }

    const token = generateToken(user);

    setTokenCookie(res, token);

    return res.status(200).json({
      message: "Login successful",

      user,
    });
  } catch (err) {
    console.error("Login error", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

export const handleGoogleAuth = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: "ID token is required" });
  }

  try {
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);

    const { uid, name, email, picture } = decodedToken;

    let user = await User.findOne({ firebaseUid: uid });

    // if new user, create one
    if (!user) {
      user = await User.create({
        firebaseUid: uid,
        userName: name,
        email: email.toLowerCase(),
      });
    }

    const token = generateToken(user);

    setTokenCookie(res, token);

    return res.status(200).json({
      message: "Login successful",
      user,
    });
  } catch (err) {
    console.error("Google auth error", err);
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }
};

export const logoutUser = (req, res) => {
  res.cookie("jwt", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "none",
    expires: new Date(0),
  });
  res.status(200).json({ message: "Logged out successfully" });
};
