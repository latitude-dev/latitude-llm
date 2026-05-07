export const GTM_CONTAINER_ID: string | undefined = import.meta.env.VITE_LAT_GTM_CONTAINER_ID

export const gtmHeadScripts = (): Array<{ children: string }> =>
  GTM_CONTAINER_ID
    ? [
        {
          children: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_CONTAINER_ID}');`,
        },
      ]
    : []

// `_gl` is intentionally excluded: Google's cross-domain linker uses `*` as a
// delimiter (e.g. `1*abc*_ga*xyz`), and asterisks fail Better Auth's
// relative-path regex when forwarded as `callbackURL` / `newUserCallbackURL`,
// causing /api/auth/magic-link/verify to reject the link with
// INVALID_CALLBACK_URL. `_gl` only matters for cross-domain GA handoff, which
// our same-origin auth flow does not need.
export const TRACKING_PARAM_KEYS = [
  "gclid",
  "fbclid",
  "ttclid",
  "li_fat_id",
  "msclkid",
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

// Better Auth's `originCheck` middleware validates `callbackURL` /
// `newUserCallbackURL` / `errorCallbackURL` against a regex that allows only
// `[\w\-.+/=&%@]` in the query, then runs `decodeURIComponent` on the already
// URL-decoded value (double-decode) before validating. To survive that, every
// unsafe char in the raw value must become `%XX` *before* it reaches
// `URLSearchParams.toString()`: that call adds one `%`→`%25` layer, Better
// Auth's own `searchParams.set` adds another, and the two server-side decodes
// reverse them — leaving `%XX` visible to the regex (which accepts `%` and hex
// digits). Without this, `*`, `(`, `:` etc. round-trip back to themselves and
// the verify endpoint rejects the link with INVALID_CALLBACK_URL.
const CALLBACK_SAFE_CHAR = /^[\w\-.+/=&%@]$/

const TEXT_ENCODER = new TextEncoder()

const percentEncodeChar = (ch: string): string => {
  const bytes = TEXT_ENCODER.encode(ch)
  const parts: string[] = new Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    parts[i] = `%${bytes[i].toString(16).toUpperCase().padStart(2, "0")}`
  }
  return parts.join("")
}

const sanitizeForCallback = (value: string): string => {
  const parts: string[] = []
  for (const ch of value) {
    parts.push(CALLBACK_SAFE_CHAR.test(ch) ? ch : percentEncodeChar(ch))
  }
  return parts.join("")
}

export const appendTrackingParams = (path: string, params: Record<string, string>): string => {
  const entries = Object.entries(params)
  if (entries.length === 0) return path
  // Split off any fragment so the query lands between path and `#fragment` (a
  // user-supplied `?redirect=/foo#bar` would otherwise produce `/foo#bar?gclid=…`,
  // which the browser interprets as part of the fragment).
  const hashIdx = path.indexOf("#")
  const base = hashIdx >= 0 ? path.slice(0, hashIdx) : path
  const fragment = hashIdx >= 0 ? path.slice(hashIdx) : ""
  const sanitized: Record<string, string> = {}
  for (const [key, value] of entries) {
    sanitized[key] = sanitizeForCallback(value)
  }
  const separator = base.includes("?") ? "&" : "?"
  const query = new URLSearchParams(sanitized).toString()
  return `${base}${separator}${query}${fragment}`
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
