// src/main.jsx
import { API_BASE } from "./api";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
fetch(`${API_BASE}/api/health`).catch(() => {});
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
