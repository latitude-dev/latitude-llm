/**
 * Build the absolute URL that emails embed via `<Img src={...}>` to
 * pull the per-notification incident-trend chart from `apps/web`.
 * The route sits next to the wrapped OG PNG renderer
 * (`/wrapped/$id/og/png`) so both PNG-rendering surfaces share the
 * same satori + resvg pipeline and stay off the public + MCP API
 * surface.
 *
 * Authentication: none. The chart endpoint is unauthenticated and
 * uses the `notificationId` (a CUID, ~128 bits of entropy) directly
 * as the lookup key. Enumeration isn't feasible at that key size,
 * and the chart payload itself is project-internal trend data — no
 * PII, no credentials — so the cost of a leaked id is bounded.
 *
 * TODO: revisit if chart data starts carrying more sensitive
 * payloads, or if `notificationId` ever gets exposed to less-trusted
 * surfaces (public API responses, embeds, etc.). Re-introducing an
 * HMAC-signed token here is a contained change — sign at this
 * call-site, verify in the `apps/web` route handler.
 */
export const buildChartUrl = (input: { readonly notificationId: string; readonly webAppUrl: string }): string => {
  const base = input.webAppUrl.replace(/\/$/, "")
  return `${base}/api/notifications/${encodeURIComponent(input.notificationId)}/incident-trend.png`
}
