import axios from "axios";

const BASE_ORIGIN = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

const api = axios.create({
  baseURL: `${BASE_ORIGIN}/api`,
  withCredentials: true,
});

export default api;
