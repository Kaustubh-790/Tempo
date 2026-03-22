import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { io } from "socket.io-client";

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    let newSocket;

    if (isAuthenticated) {
      newSocket = io("http://localhost:5000", {
        withCredentials: true,
      });
      setSocket(newSocket);
    }

    return () => {
      if (newSocket) {
        newSocket.close();
      }
    };
  }, [isAuthenticated]);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};
