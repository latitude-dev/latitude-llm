const webBaseUrl = import.meta.env.VITE_LAT_WEB_URL

if (!webBaseUrl) {
  throw new Error("VITE_LAT_WEB_URL is required")
}

export const WEB_BASE_URL = webBaseUrl.replace(/\/$/, "")
export const AUTH_BASE_PATH = "/api/auth"
