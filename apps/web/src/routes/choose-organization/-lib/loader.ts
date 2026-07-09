import { redirect } from "@tanstack/react-router"
import type { getSession } from "../../../domains/sessions/session.functions.ts"
import type { Organization, resolveEntryDestination } from "../../../lib/entry-destination.ts"

export interface ChooseOrganizationLoaderDeps {
  readonly getSession: typeof getSession
  readonly resolveEntryDestination: typeof resolveEntryDestination
}

// Renders the picker (several orgs); returns the resolved list so it needn't refetch.
export async function chooseOrganizationLoader({
  getSession,
  resolveEntryDestination,
}: ChooseOrganizationLoaderDeps): Promise<{ organizations: readonly Organization[] }> {
  const session = await getSession()
  if (!session) {
    throw redirect({ to: "/login" })
  }

  const dest = await resolveEntryDestination()
  if (dest.kind === "welcome") {
    throw redirect({ to: "/welcome" })
  }

  return { organizations: dest.organizations }
}
