const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "";


// ============================================================
// DEVICE ID
// ============================================================

export function getDeviceId() {
  let deviceId =
    localStorage.getItem(
      "railvinyas_device_id"
    );

  if (!deviceId) {
    deviceId = crypto.randomUUID();

    localStorage.setItem(
      "railvinyas_device_id",
      deviceId
    );
  }

  return deviceId;
}


// ============================================================
// API FETCH
// ============================================================

export async function apiFetch(
  path,
  options = {}
) {
  const token =
    sessionStorage.getItem(
      "railvinyas_token"
    );

  const headers = {
    ...(options.headers || {}),
  };


  // JSON body
  if (
    options.body &&
    typeof options.body !== "string"
  ) {
    headers["Content-Type"] =
      "application/json";

    options = {
      ...options,
      body: JSON.stringify(
        options.body
      ),
    };
  }


  // Authentication
  if (token) {
    headers["Authorization"] =
      `Bearer ${token}`;
  }


  const response = await fetch(
    `${API_BASE}${path}`,
    {
      ...options,
      headers,
    }
  );


  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }


  // Session expired / invalid token
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

    window.location.href =
      "/login";

    throw new Error(
      data?.detail ||
      "Session expired. Please log in again."
    );
  }


  if (!response.ok) {

    throw new Error(
      data?.detail ||
      data?.message ||
      `Request failed (${response.status})`
    );
  }


  return data;
}


// ============================================================
// AUTH
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


// ============================================================
// RAILWAY API
// ============================================================

export async function getSections() {
  return apiFetch(
    "/api/sections"
  );
}


export async function getStations(
  query = ""
) {
  const params =
    new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  return apiFetch(
    `/api/stations?${params.toString()}`
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
// ASSETS
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
// ADMIN
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
// BLOCK REQUESTS
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