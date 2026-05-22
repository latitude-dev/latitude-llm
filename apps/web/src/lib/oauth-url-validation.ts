const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

const parseAbsoluteUrl = (value: string): URL | null => {
  try {
    const url = new URL(value)
    if (url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

const ipv4OctetPattern = "(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)"
const loopbackIpv4Pattern = new RegExp(`^127\\.${ipv4OctetPattern}\\.${ipv4OctetPattern}\\.${ipv4OctetPattern}$`)

const isLoopbackHostname = (hostname: string) => {
  if (LOOPBACK_HOSTS.has(hostname)) return true
  return loopbackIpv4Pattern.test(hostname)
}

export const isSafeOAuthIconUrl = (value: string | null | undefined): value is string => {
  if (!value) return false

  const url = parseAbsoluteUrl(value)
  if (!url) return false

  return url.protocol === "https:" || url.protocol === "http:"
}

export const isSafeOAuthRedirectUrl = (value: string | null | undefined): value is string => {
  if (!value) return false

  const url = parseAbsoluteUrl(value)
  if (!url) return false

  if (url.protocol === "https:") return true
  return url.protocol === "http:" && isLoopbackHostname(url.hostname)
}

export const validateOAuthClientRegistrationMetadata = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null) {
    return "Client registration body must be a JSON object"
  }

  const fields = body as { readonly redirect_uris?: unknown; readonly logo_uri?: unknown }

  if (Array.isArray(fields.redirect_uris)) {
    for (const redirectUri of fields.redirect_uris) {
      if (typeof redirectUri === "string" && !isSafeOAuthRedirectUrl(redirectUri)) {
        return "redirect_uris must use HTTPS or loopback HTTP URLs"
      }
    }
  }

  if (typeof fields.logo_uri === "string" && !isSafeOAuthIconUrl(fields.logo_uri)) {
    return "logo_uri must use an HTTP or HTTPS URL"
  }

  return null
}
