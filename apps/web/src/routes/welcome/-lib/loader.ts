import { redirect } from "@tanstack/react-router"
import type { getSession } from "../../../domains/sessions/session.functions.ts"
import type { resolveEntryDestination } from "../../../lib/entry-destination.ts"
import type { isLatitudeStaffEmail } from "../../../lib/posthog/posthog-client.ts"

export interface WelcomeLoaderDeps {
  readonly getSession: typeof getSession
  readonly resolveEntryDestination: typeof resolveEntryDestination
  readonly isLatitudeStaffEmail: typeof isLatitudeStaffEmail
}

// Renders the create-first-org form; `resolveEntryDestination` diverts existing-org users away.
export async function welcomeLoader({
  getSession,
  resolveEntryDestination,
  isLatitudeStaffEmail,
}: WelcomeLoaderDeps): Promise<{ excludeFromAnalytics: boolean }> {
  const session = await getSession()
  if (!session) {
    throw redirect({ to: "/login" })
  }

  const dest = await resolveEntryDestination()
  if (dest.kind === "choose") {
    throw redirect({ to: "/choose-organization" })
  }

  const sessionData = session.session as Record<string, unknown>
  const impersonatedBy = typeof sessionData.impersonatedBy === "string" ? sessionData.impersonatedBy : null

  return { excludeFromAnalytics: isLatitudeStaffEmail(session.user.email) || impersonatedBy != null }
}
