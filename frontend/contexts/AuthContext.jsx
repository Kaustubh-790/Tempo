import React, {
  createContext,
  useContext,
  useEffect,
  useSate,
  useRef,
  useState,
} from "react";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "../config/firebase";
import api from "../services/axios";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleAuthResponse = (res) => {
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("user", JSON.stringify(res.data.user));
    setCurrentUser(res.data.user);
  };

  const registerEmailPassword = async (userName, email, password) => {
    try {
      const res = await api.post("/auth/register-email", {
        userName,
        email,
        password,
      });
      handleAuthResponse(res);

      await signInWithEmailAndPassword(auth, email, password);

      return res.data;
    } catch (err) {
      console.error("email registration error", err);
      throw err;
    }
  };

  const loginEmailPassword = async (email, password) => {
    try {
      const userCredentials = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const idToken = await userCredentials.user.getIdToken();

      const res = await api.post("/auth/login-email", { idToken });
      handleAuthResponse(res);

      return res.data;
    } catch (err) {
      console.error("email login error", err);
      throw err;
    }
  };

  const googleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const userCredentials = await signInWithPopup(auth, provider);
      const idToken = await userCredentials.user.getIdToken();

      const res = await api.post("/auth/login-google", { idToken });
      handleAuthResponse(res);

      return res.data;
    } catch (err) {
      console.error("google login error", err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Firebase sign out failed:", error);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setCurrentUser(null);
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setCurrentUser(null);
        localStorage.removeItem("user");
        localStorage.removeItem("token");
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    registerEmailPassword,
    loginEmailPassword,
    googleLogin,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
