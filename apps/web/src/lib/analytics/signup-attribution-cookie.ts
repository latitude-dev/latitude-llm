import type { SignupAttributionInput } from "@domain/marketing"
import { signupAttributionInputSchema } from "@domain/marketing"

export const SIGNUP_ATTRIBUTION_COOKIE = "latitude_signup_attr"
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 2

const cookieDomain = (): string | undefined => {
  if (typeof window === "undefined") return undefined
  const host = window.location.hostname
  if (host === "localhost" || host === "127.0.0.1") return undefined
  if (host.endsWith(".latitude.so") || host === "latitude.so") return ".latitude.so"
  return undefined
}

export const setSignupAttributionCookie = (attribution: SignupAttributionInput): void => {
  if (typeof document === "undefined") return
  const parsed = signupAttributionInputSchema.safeParse(attribution)
  if (!parsed.success) return
  if (Object.keys(parsed.data).length === 0) return

  const value = encodeURIComponent(JSON.stringify(parsed.data))
  const domain = cookieDomain()
  const domainAttr = domain ? `; domain=${domain}` : ""
  // biome-ignore lint/suspicious/noDocumentCookie: cross-subdomain attribution bridge for OAuth; Cookie Store API cannot set domain.
  document.cookie = `${SIGNUP_ATTRIBUTION_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax; secure${domainAttr}`
}

export const parseSignupAttributionCookie = (
  cookieHeader: string | null | undefined,
): SignupAttributionInput | null => {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SIGNUP_ATTRIBUTION_COOKIE}=([^;]*)`))
  const raw = match?.[1]
  if (!raw) return null

  try {
    const parsed = signupAttributionInputSchema.safeParse(JSON.parse(decodeURIComponent(raw)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
