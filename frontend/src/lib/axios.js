import axios from "axios";

export const axiosInstance = axios.create({
  baseURL: import.meta.env.MODE === "development" ? "http://localhost:5001/api" : "/api",
  withCredentials: false,
});

// attach Authorization header if token exists
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("peerchat_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
