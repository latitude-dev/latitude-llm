import type { NotificationEmailRenderContext } from "./types.ts"

type IncidentSourcePayload = {
  readonly sourceId: string
  readonly projectSlug?: string | undefined
}

/**
 * Absolute web-app URL to the issues list with the source issue drawer
 * targeted. Prefers the live project snapshot from the emailer; falls back
 * to the slug snapshotted on the notification payload when the project row
 * is gone or was not loaded.
 */
export function resolveIncidentIssueAppHref(
  ctx: NotificationEmailRenderContext,
  payload: IncidentSourcePayload,
): string | undefined {
  const slug = ctx.project?.slug ?? payload.projectSlug
  if (!slug) return undefined
  return `${ctx.webAppUrl}/projects/${slug}/issues?issueId=${encodeURIComponent(payload.sourceId)}`
}
