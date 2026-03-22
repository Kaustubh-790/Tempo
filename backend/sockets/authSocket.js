import jwt from "jsonwebtoken";
import User from "../models/User.js";
import dotenv from "dotenv";
import cookie from "cookie";

dotenv.config();

export const authenticateSocket = async (socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
      return next(new Error("Authentication error: No cookies found"));
    }

    const cookies = cookie.parse(cookieHeader);
    const token = cookies.jwt;

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    socket.user = user;
    next();
  } catch (err) {
    console.error("socket authentication error: ", err.message);
    next(new Error("Authentication error: Invalid token"));
  }
};
