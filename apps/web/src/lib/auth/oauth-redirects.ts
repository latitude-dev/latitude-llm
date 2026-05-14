import { appendTrackingParams } from "../analytics/gtm.ts"

export function safeRelativeRedirect(redirect: string | null): string {
  return redirect?.startsWith("/") ? redirect : "/"
}

export function buildOAuthCallbackUrls({
  provider,
  redirect,
  tracking,
}: {
  readonly provider: "google" | "github"
  readonly redirect: string | null
  readonly tracking: Record<string, string>
}) {
  const hasSafeRedirect = redirect?.startsWith("/") === true
  const safeRedirect = safeRelativeRedirect(redirect)
  const callbackURL = appendTrackingParams(safeRedirect, tracking)
  const newUserPath = hasSafeRedirect ? safeRedirect : "/welcome"
  const newUserCallbackURL = appendTrackingParams(newUserPath, { ...tracking, signup: provider })
  const errorCallbackURL = appendTrackingParams("/login", tracking)

  return { callbackURL, newUserCallbackURL, errorCallbackURL }
}
