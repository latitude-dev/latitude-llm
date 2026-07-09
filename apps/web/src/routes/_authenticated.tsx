import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { CommandPalette } from "../components/command-palette/command-palette.tsx"
import { CommandPaletteProvider } from "../components/command-palette/command-palette-provider.tsx"
import { getBillingOverview } from "../domains/billing/billing.functions.ts"
import { useOrganizationsCollection } from "../domains/organizations/organizations.collection.ts"
import { createProject, listProjects } from "../domains/projects/projects.functions.ts"
import { getSession } from "../domains/sessions/session.functions.ts"
import { getSupportUserIdentity } from "../domains/support/support.functions.ts"
import { resolveEntryDestination } from "../lib/entry-destination.ts"
import { IntercomProvider } from "../lib/intercom/intercom-provider.tsx"
import { isLatitudeStaffEmail } from "../lib/posthog/posthog-client.ts"
import { PostHogIdentity } from "../lib/posthog/posthog-provider.tsx"
import { ImpersonationBanner } from "./_authenticated/-components/impersonation-banner.tsx"
import { NavHeader } from "./_authenticated/-components/nav-header.tsx"
import { isProjectOnboardingPathname } from "./_authenticated/-lib/is-project-onboarding-pathname.ts"
import { authenticatedLoader } from "./_authenticated/-lib/loader.ts"

const projectOnboardingRouteId = "/_authenticated/projects/$projectSlug/onboarding" as const

export const Route = createFileRoute("/_authenticated")({
  ssr: "data-only",
  staleTime: Infinity,
  remountDeps: () => "authenticated-layout",
  loader: ({ location }) =>
    authenticatedLoader(
      {
        getSession,
        resolveEntryDestination,
        listProjects,
        createProject,
        getSupportUserIdentity,
        getBillingOverview,
        isLatitudeStaffEmail,
        isProjectOnboardingPathname,
      },
      location,
    ),
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const user = Route.useLoaderData({ select: (data) => data.user })
  const organizationId = Route.useLoaderData({
    select: (data) => data.organizationId,
  })
  const impersonatedBy = Route.useLoaderData({
    select: (data) => data.impersonatedBy,
  })
  const supportIdentity = Route.useLoaderData({
    select: (data) => data.supportIdentity,
  })
  const isProjectOnboarding = useRouterState({
    select: (s) => s.matches.some((m) => m.routeId === projectOnboardingRouteId),
  })
  const organizationPlan = Route.useLoaderData({
    select: (data) => data.organizationBilling?.planSlug ?? null,
  })
  const { data: allOrgs } = useOrganizationsCollection()
  const org = allOrgs?.find((o) => o.id === organizationId)

  return (
    <IntercomProvider identity={supportIdentity} floatingButton="none">
      <CommandPaletteProvider>
        <div className="flex h-screen flex-col overflow-hidden">
          <PostHogIdentity
            key={user.id}
            userId={user.id}
            userEmail={user.email}
            userName={user.name}
            organizationId={organizationId}
            organizationName={org?.name}
            organizationSlug={org?.slug}
            organizationPlan={organizationPlan}
            excludeFromAnalytics={isLatitudeStaffEmail(user.email) || impersonatedBy != null}
          />
          {impersonatedBy && <ImpersonationBanner impersonatedUserEmail={user.email} />}
          {isProjectOnboarding ? null : <NavHeader />}
          <main
            className={
              isProjectOnboarding
                ? "relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
                : "relative h-full min-h-0 w-full grow overflow-y-auto"
            }
          >
            <Outlet />
          </main>
        </div>
        <CommandPalette />
      </CommandPaletteProvider>
    </IntercomProvider>
  )
}
