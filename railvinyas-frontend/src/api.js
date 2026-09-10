// src/api.js
// Single shared fetch wrapper. Every page uses this instead of calling
// fetch() directly, so auth headers and 401 handling live in ONE place.

export const API_BASE = "https://railvinyas-api.onrender.com";

// Set by AuthContext on login/logout so apiFetch always has the latest token
// and a way to clear the session on 401 without a circular import.
let currentToken = null;
let onUnauthorized = () => {};

export function setAuthToken(token) {
  currentToken = token;
}

export function setOnUnauthorized(handler) {
  onUnauthorized = handler;
}

export async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (currentToken) {
    headers["Authorization"] = `Bearer ${currentToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    onUnauthorized();
    const body = await safeJson(res);
    throw new ApiError(body?.detail || "Session expired. Please log in again.", 401);
  }

  const body = await safeJson(res);

  if (!res.ok) {
    throw new ApiError(body?.detail || "Something went wrong. Please try again.", res.status);
  }

  return body;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// -----------------------------------------------------------------
// Device ID — generated once per browser, persisted in localStorage.
// This is how the backend recognizes "have I seen this device before?"
// -----------------------------------------------------------------
export function getDeviceId() {
  let id = localStorage.getItem("railvinyas_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("railvinyas_device_id", id);
  }
  return id;
}

