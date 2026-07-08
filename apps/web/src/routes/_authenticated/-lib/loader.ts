import { redirect } from "@tanstack/react-router"
import type { getBillingOverview } from "../../../domains/billing/billing.functions.ts"
import type { createProject, listProjects } from "../../../domains/projects/projects.functions.ts"
import type { getSession } from "../../../domains/sessions/session.functions.ts"
import type { getSupportUserIdentity } from "../../../domains/support/support.functions.ts"
import type { resolveEntryDestination } from "../../../lib/entry-destination.ts"
import type { isLatitudeStaffEmail } from "../../../lib/posthog/posthog-client.ts"
import type { isProjectOnboardingPathname } from "./is-project-onboarding-pathname.ts"

export interface AuthenticatedLoaderDeps {
  readonly getSession: typeof getSession
  readonly resolveEntryDestination: typeof resolveEntryDestination
  readonly listProjects: typeof listProjects
  readonly createProject: typeof createProject
  readonly getSupportUserIdentity: typeof getSupportUserIdentity
  readonly getBillingOverview: typeof getBillingOverview
  readonly isLatitudeStaffEmail: typeof isLatitudeStaffEmail
  readonly isProjectOnboardingPathname: typeof isProjectOnboardingPathname
}

export async function authenticatedLoader(deps: AuthenticatedLoaderDeps, location: { readonly pathname: string }) {
  const session = await deps.getSession()
  if (!session) {
    throw redirect({ to: "/login" })
  }

  const sessionData = session.session as Record<string, unknown>
  const organizationId = typeof sessionData.activeOrganizationId === "string" ? sessionData.activeOrganizationId : null
  if (!organizationId) {
    const dest = await deps.resolveEntryDestination()
    throw redirect({
      to: dest.kind === "choose" ? "/choose-organization" : "/welcome",
    })
  }

  const impersonatedBy = typeof sessionData.impersonatedBy === "string" ? sessionData.impersonatedBy : null

  const projects = await deps.listProjects()
  if (projects.length === 0 && !deps.isProjectOnboardingPathname(location.pathname)) {
    const created = await deps.createProject({ data: { name: "My project" } })
    throw redirect({
      to: "/projects/$projectSlug/onboarding",
      params: { projectSlug: created.slug },
    })
  }

  const supportIdentity = await deps.getSupportUserIdentity()

  // Full overview (not just the plan) so `BillingCreditCounter` can seed from it.
  const excludeFromAnalytics = deps.isLatitudeStaffEmail(session.user.email) || impersonatedBy != null
  let organizationBilling: Awaited<ReturnType<typeof deps.getBillingOverview>> | null = null
  if (!excludeFromAnalytics) {
    try {
      organizationBilling = await deps.getBillingOverview()
    } catch {
      organizationBilling = null
    }
  }

  return {
    user: session.user,
    organizationId,
    impersonatedBy,
    supportIdentity,
    organizationBilling,
  }
}
