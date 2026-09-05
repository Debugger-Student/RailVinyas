// ============================================================
// RailVinyas API Client
// ============================================================

// When frontend and backend are deployed together on Render,
// use the same origin.
//
// Local:
//     http://localhost:8000
//
// Production:
//     https://railvinyas-api.onrender.com
//
// You can optionally override this with:
//     VITE_API_BASE_URL
//
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "";


// ============================================================
// CUSTOM API ERROR
// ============================================================

export class ApiError extends Error {
  constructor(
    message,
    status = 0,
    data = null
  ) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}


// ============================================================
// DEVICE ID
// ============================================================

export function getDeviceId() {
  let deviceId =
    localStorage.getItem(
      "railvinyas_device_id"
    );

  if (!deviceId) {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      deviceId = crypto.randomUUID();
    } else {
      deviceId =
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;
    }

    localStorage.setItem(
      "railvinyas_device_id",
      deviceId
    );
  }

  return deviceId;
}


// ============================================================
// TOKEN
// ============================================================

function getToken() {
  return sessionStorage.getItem(
    "railvinyas_token"
  );
}


// ============================================================
// API FETCH WRAPPER
// ============================================================

export async function apiFetch(
  path,
  options = {}
) {
  const token = getToken();

  const headers = {
    ...(options.headers || {}),
  };


  // ----------------------------------------------------------
  // JSON body
  // ----------------------------------------------------------

  let body = options.body;

  if (
    body &&
    typeof body !== "string" &&
    !(body instanceof FormData)
  ) {
    headers["Content-Type"] =
      "application/json";

    body = JSON.stringify(body);
  }


  // ----------------------------------------------------------
  // Authorization
  // ----------------------------------------------------------

  if (token) {
    headers["Authorization"] =
      `Bearer ${token}`;
  }


  let response;


  try {
    response = await fetch(
      `${API_BASE}${path}`,
      {
        ...options,
        headers,
        body,
      }
    );
  } catch (error) {

    throw new ApiError(
      "Unable to connect to the RailVinyas server.",
      0,
      null
    );
  }


  // ----------------------------------------------------------
  // Parse response
  // ----------------------------------------------------------

  let data = null;

  const contentType =
    response.headers.get(
      "content-type"
    );


  try {

    if (
      contentType &&
      contentType.includes(
        "application/json"
      )
    ) {
      data = await response.json();
    } else {
      const text =
        await response.text();

      data = text
        ? { message: text }
        : null;
    }

  } catch {
    data = null;
  }


  // ----------------------------------------------------------
  // Unauthorized
  // ----------------------------------------------------------

  if (response.status === 401) {

    sessionStorage.removeItem(
      "railvinyas_token"
    );

    sessionStorage.removeItem(
      "railvinyas_role"
    );

    sessionStorage.removeItem(
      "railvinyas_name"
    );

    // Do not redirect if the user is already
    // on a public authentication page.
    const publicPages = [
      "/login",
      "/register",
    ];

    if (
      !publicPages.includes(
        window.location.pathname
      )
    ) {
      window.location.href =
        "/login";
    }

    throw new ApiError(
      data?.detail ||
        data?.message ||
        "Session expired. Please log in again.",
      401,
      data
    );
  }


  // ----------------------------------------------------------
  // Other HTTP errors
  // ----------------------------------------------------------

  if (!response.ok) {

    throw new ApiError(
      data?.detail ||
        data?.message ||
        `Request failed with status ${response.status}`,
      response.status,
      data
    );
  }


  return data;
}


// ============================================================
// AUTHENTICATION
// ============================================================

export async function register(
  name,
  email,
  password
) {
  return apiFetch(
    "/api/auth/register",
    {
      method: "POST",
      body: {
        name,
        email,
        password,
      },
    }
  );
}


export async function login(
  email,
  password
) {
  return apiFetch(
    "/api/auth/login",
    {
      method: "POST",
      body: {
        email,
        password,
        device_id:
          getDeviceId(),
      },
    }
  );
}


export async function verifyOtp(
  email,
  otpCode
) {
  return apiFetch(
    "/api/auth/verify-otp",
    {
      method: "POST",
      body: {
        email,
        device_id:
          getDeviceId(),
        otp_code: otpCode,
      },
    }
  );
}


export async function getCurrentUser() {
  return apiFetch(
    "/api/auth/me"
  );
}


// ============================================================
// RAILWAY SECTIONS
// ============================================================

export async function getSections() {
  return apiFetch(
    "/api/sections"
  );
}


export async function resolveSection(
  fromStation,
  toStation
) {
  const params =
    new URLSearchParams({
      from: fromStation,
      to: toStation,
    });

  return apiFetch(
    `/api/sections/resolve?${params.toString()}`
  );
}


// ============================================================
// STATIONS
// ============================================================

export async function getStations(
  query = "",
  limit = 30
) {
  const params =
    new URLSearchParams({
      q: query,
      limit: String(limit),
    });

  return apiFetch(
    `/api/stations?${params.toString()}`
  );
}


// ============================================================
// AI RECOMMENDATION
// ============================================================

export async function getRecommendation(
  request
) {
  return apiFetch(
    "/api/recommend",
    {
      method: "POST",
      body: request,
    }
  );
}


// Backward-compatible alias.
// Some existing components may call this name.
export const recommend =
  getRecommendation;


// ============================================================
// DASHBOARD
// ============================================================

export async function getDashboardSummary() {
  return apiFetch(
    "/api/dashboard/summary"
  );
}


export async function getDashboardRecent(
  limit = 20
) {
  return apiFetch(
    `/api/dashboard/recent?limit=${limit}`
  );
}


// ============================================================
// TRAFFIC
// ============================================================

export async function getTrafficHeatmap(
  limit = 40
) {
  return apiFetch(
    `/api/section-traffic/heatmap?limit=${limit}`
  );
}


// ============================================================
// REPORTS
// ============================================================

export async function getReports() {
  return apiFetch(
    "/api/reports"
  );
}


// ============================================================
// ASSET MANAGEMENT
// ============================================================

export async function getAssets() {
  return apiFetch(
    "/api/assets"
  );
}


export async function updateAssetStatus(
  assetId,
  status
) {
  return apiFetch(
    `/api/assets/${encodeURIComponent(
      assetId
    )}`,
    {
      method: "PATCH",
      body: {
        status,
      },
    }
  );
}


// ============================================================
// ADMIN USERS
// ============================================================

export async function getAdminUsers() {
  return apiFetch(
    "/api/admin/users"
  );
}


export async function updateUserRole(
  userId,
  role
) {
  return apiFetch(
    `/api/admin/users/${userId}`,
    {
      method: "PATCH",
      body: {
        role,
      },
    }
  );
}


// ============================================================
// BLOCK REQUEST LOG
// ============================================================

export async function getBlockLogs(
  limit = 20
) {
  return apiFetch(
    `/api/blocks/log?limit=${limit}`
  );
}


export async function approveBlock(
  logId
) {
  return apiFetch(
    "/api/blocks/approve",
    {
      method: "POST",
      body: {
        log_id: logId,
      },
    }
  );
}


// ============================================================
// HEALTH
// ============================================================

export async function healthCheck() {
  return apiFetch(
    "/api/health"
  );
}