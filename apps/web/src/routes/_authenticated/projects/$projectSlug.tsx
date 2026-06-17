import { ProjectRepository } from "@domain/projects"
import { ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { ClaudeCodeIcon, CopyableText, cn, Text, useMountEffect } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { PROJECT_SETTINGS_SECTION, useVisibleProjectSectionGroups } from "../../../domains/projects/project-sections.ts"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { type ProjectRecord, rememberLastProjectSlug, toRecord } from "../../../domains/projects/projects.functions.ts"
import { getLatestWrappedReportForProject } from "../../../domains/wrapped/wrapped.functions.ts"
import { AppSidebar, NavItem } from "../../../layouts/AppSidebar/index.tsx"
import { requireSession } from "../../../server/auth.ts"
import { getPostgresClient } from "../../../server/clients.ts"
import { ChangelogSidebarEntry } from "../-components/changelog/changelog-sidebar-entry.tsx"
import { ProjectBreadcrumbSegment } from "../-components/project-breadcrumb-segment.tsx"
import { SandboxSwitcher } from "../-components/sandbox-switcher.tsx"

const getProjectBySlug = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string() }))
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const project = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findBySlug(data.slug)
      }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId), withTracing),
    )

    return toRecord(project)
  })

export const Route = createFileRoute("/_authenticated/projects/$projectSlug")({
  staticData: {
    breadcrumb: ProjectBreadcrumbSegment,
  },
  staleTime: Infinity,
  remountDeps: ({ params }) => params,
  component: ProjectLayout,
  // Keep the rendered project record in `loader` so TanStack Router can cache
  // it across same-route search-param navigations. `beforeLoad` is better for
  // middleware-only checks, while descendants can read cached loader data with
  // `useLoaderData({ select })`.
  loader: async ({ params }) => {
    try {
      const project = await getProjectBySlug({
        data: { slug: params.projectSlug },
      })
      return { project }
    } catch {
      throw redirect({ to: "/" })
    }
  },
})

/**
 * Polled client-side after the page loads. Reports are immutable + only
 * generated weekly, so a long staleTime + a short retry window are fine —
 * a missing row is by far the common case (most orgs / weeks don't have
 * one) and we don't want to hammer the server.
 */
const WRAPPED_REPORT_STALE_TIME_MS = 10 * 60 * 1000

function ProjectSidebar({ project, projectSlug }: { project: ProjectRecord; projectSlug: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const sectionGroups = useVisibleProjectSectionGroups()

  // Fire-and-forget client-side fetch: surfaces a sidebar shortcut to this
  // week's Wrapped report when one exists. Returns null for the typical
  // case (no report or report > 7 days old) and we just render nothing.
  const { data: latestWrapped } = useQuery({
    queryKey: ["wrapped", "latest", project.id, "claude_code"],
    queryFn: () => getLatestWrappedReportForProject({ data: { projectId: project.id, type: "claude_code" } }),
    staleTime: WRAPPED_REPORT_STALE_TIME_MS,
    retry: false,
  })

  return (
    <AppSidebar
      title={project.name}
      subtitle={<CopyableText value={project.slug} size="sm" tooltip="Copy project slug" ellipsis />}
      footer={({ collapsed }) => (
        <>
          <ChangelogSidebarEntry collapsed={collapsed} />
          {latestWrapped ? (
            <NavItem
              icon={ClaudeCodeIcon}
              label="Claude Code Wrapped"
              to={`/wrapped/${latestWrapped.id}`}
              external
              collapsed={collapsed}
            />
          ) : null}
          <SandboxSwitcher collapsed={collapsed} projectId={project.id} />
          <NavItem
            icon={PROJECT_SETTINGS_SECTION.icon}
            label={PROJECT_SETTINGS_SECTION.label}
            to={PROJECT_SETTINGS_SECTION.path(projectSlug)}
            active={PROJECT_SETTINGS_SECTION.isActive(pathname, projectSlug)}
            collapsed={collapsed}
          />
        </>
      )}
    >
      {({ collapsed }) => (
        <>
          {sectionGroups.map((group, index) => (
            <div key={group.key} className={cn("flex flex-col gap-1", index > 0 && "mt-4")}>
              {collapsed ? (
                index > 0 ? (
                  <div className="mb-2 h-px w-6 self-center bg-border" />
                ) : null
              ) : (
                <Text.H6 color="foregroundMuted" weight="medium" className="px-2 uppercase tracking-wide">
                  {group.label}
                </Text.H6>
              )}
              {group.sections.map((section) => (
                <NavItem
                  key={section.key}
                  icon={section.icon}
                  label={section.label}
                  to={section.path(projectSlug)}
                  active={section.isActive(pathname, projectSlug)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </AppSidebar>
  )
}

function ProjectLayout() {
  const { projectSlug } = Route.useParams()
  const projectFromLoader = Route.useLoaderData({ select: (data) => data.project })
  const { data: projectFromCollection } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )
  const project: ProjectRecord = projectFromCollection ?? projectFromLoader
  const pathname = useRouterState({ select: (state) => state.location.pathname.replace(/\/$/, "") || "/" })
  const isOnboarding = pathname === `/projects/${projectSlug}/onboarding`

  useMountEffect(() => {
    void rememberLastProjectSlug({ data: { slug: projectSlug } })
  })

  if (isOnboarding) {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <ProjectSidebar project={project} projectSlug={projectSlug} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
