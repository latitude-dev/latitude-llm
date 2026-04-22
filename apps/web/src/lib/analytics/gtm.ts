export const GTM_CONTAINER_ID: string | undefined = import.meta.env.VITE_LAT_GTM_CONTAINER_ID

export const gtmHeadScripts = (): Array<{ children: string }> =>
  GTM_CONTAINER_ID
    ? [
        {
          children: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_CONTAINER_ID}');`,
        },
      ]
    : []

export const TRACKING_PARAM_KEYS = [
  "gclid",
  "fbclid",
  "ttclid",
  "li_fat_id",
  "msclkid",
  "_gl",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "baker_anon_id",
  "baker_session_id",
] as const

export const pickTrackingParams = (search: URLSearchParams | string): Record<string, string> => {
  const params = typeof search === "string" ? new URLSearchParams(search) : search
  const out: Record<string, string> = {}
  for (const key of TRACKING_PARAM_KEYS) {
    const value = params.get(key)
    if (value) out[key] = value
  }
  return out
}

export const appendTrackingParams = (path: string, params: Record<string, string>): string => {
  const entries = Object.entries(params)
  if (entries.length === 0) return path
  const separator = path.includes("?") ? "&" : "?"
  const query = new URLSearchParams(params).toString()
  return `${path}${separator}${query}`
}

export type SignupMethod = "email" | "google" | "github"

interface SignupCompletePayload {
  signup_method: SignupMethod
  user_data: {
    email: string
    first_name?: string
    last_name?: string
  }
}

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>
  }
}

const SIGNUP_FIRED_SESSION_KEY = "latitude:signup_complete_fired"

export const pushSignupComplete = (payload: SignupCompletePayload): void => {
  if (typeof window === "undefined") return
  try {
    if (window.sessionStorage.getItem(SIGNUP_FIRED_SESSION_KEY) === "1") return
    window.sessionStorage.setItem(SIGNUP_FIRED_SESSION_KEY, "1")
  } catch {
    // sessionStorage may be unavailable; allow event to fire and let GTM dedupe
  }
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({
    event: "signup_complete",
    signup_method: payload.signup_method,
    user_data: payload.user_data,
  })
}
