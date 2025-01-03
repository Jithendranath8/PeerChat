import axios from "axios";

export const axiosInstance = axios.create({
  baseURL: import.meta.env.MODE === "development" ? "https://peerchat-u2ha.onrender.com/api" : "/api",
  withCredentials: true,
});
