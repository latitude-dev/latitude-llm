import { redirect } from "@tanstack/react-router"
import type { getSession } from "../../../domains/sessions/session.functions.ts"
import type { Organization, resolveEntryDestination } from "../../../lib/entry-destination.ts"
import type { isLatitudeStaffEmail } from "../../../lib/posthog/posthog-client.ts"

export interface ChooseOrganizationLoaderDeps {
  readonly getSession: typeof getSession
  readonly resolveEntryDestination: typeof resolveEntryDestination
  readonly isLatitudeStaffEmail: typeof isLatitudeStaffEmail
}

// Renders the picker (several orgs); returns the resolved list so it needn't refetch.
export async function chooseOrganizationLoader({
  getSession,
  resolveEntryDestination,
  isLatitudeStaffEmail,
}: ChooseOrganizationLoaderDeps): Promise<{
  organizations: readonly Organization[]
  excludeFromAnalytics: boolean
}> {
  const session = await getSession()
  if (!session) {
    throw redirect({ to: "/login" })
  }

  const dest = await resolveEntryDestination()
  if (dest.kind === "welcome") {
    throw redirect({ to: "/welcome" })
  }

  const sessionData = session.session as Record<string, unknown>
  const impersonatedBy = typeof sessionData.impersonatedBy === "string" ? sessionData.impersonatedBy : null

  return {
    organizations: dest.organizations,
    excludeFromAnalytics: isLatitudeStaffEmail(session.user.email) || impersonatedBy != null,
  }
}
