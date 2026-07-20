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
import { CHANGELOG_UI_ENABLED } from "../../../domains/changelog/changelog.collection.ts"
import {
  ProjectScopeProvider,
  SHOWCASE_SCOPE,
  useIsReadOnlyProjectScope,
} from "../../../domains/projects/project-scope.tsx"
import { PROJECT_SETTINGS_SECTION, useVisibleProjectSectionGroups } from "../../../domains/projects/project-sections.ts"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { type ProjectRecord, rememberLastProjectSlug, toRecord } from "../../../domains/projects/projects.functions.ts"
import { loadProjectRouteData } from "../../../domains/projects/showcase-project.ts"
import { getShowcaseProjectRecord } from "../../../domains/showcase/showcase.functions.ts"
import { getLatestWrappedReportForProject } from "../../../domains/wrapped/wrapped.functions.ts"
import { AppSidebar, NavItem } from "../../../layouts/AppSidebar/index.tsx"
import { ContentErrorBoundary } from "../../../lib/client-error-reporting.tsx"
import { requireSession } from "../../../server/auth.ts"
import { getPostgresClient } from "../../../server/clients.ts"
import { ChangelogSidebarEntry } from "../-components/changelog/changelog-sidebar-entry.tsx"
import { ProjectBreadcrumbSegment } from "../-components/project-breadcrumb-segment.tsx"
import { SandboxSwitcher } from "../-components/sandbox-switcher.tsx"
import { ShowcaseBanner } from "./-components/showcase-banner.tsx"

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
  // `useLoaderData({ select })`. The reserved showcase slug resolves cross-org
  // via the showcase resolver and marks the data `isShowcase` so the layout
  // scopes descendant reads to the showcase org.
  loader: async ({ params }) => {
    try {
      return await loadProjectRouteData({
        slug: params.projectSlug,
        loadShowcaseProject: () => getShowcaseProjectRecord(),
        loadProjectBySlug: (slug) => getProjectBySlug({ data: { slug } }),
      })
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

  // The footer extras (Wrapped shortcut, sandbox switcher, Settings) are all
  // full-product chrome that makes no sense in the read-only demo: the sandbox
  // mirrors the *current* project (a foreign showcase-org project here),
  // Settings would be the showcase org's settings, and a Wrapped report on the
  // demo isn't the viewer's. One scope check hides all three.
  const isReadOnly = useIsReadOnlyProjectScope()

  // Fire-and-forget client-side fetch: surfaces a sidebar shortcut to this
  // week's Wrapped report when one exists. Returns null for the typical
  // case (no report or report > 7 days old) and we just render nothing.
  const { data: latestWrapped } = useQuery({
    queryKey: ["wrapped", "latest", project.id, "claude_code"],
    queryFn: () => getLatestWrappedReportForProject({ data: { projectId: project.id, type: "claude_code" } }),
    staleTime: WRAPPED_REPORT_STALE_TIME_MS,
    retry: false,
    enabled: !isReadOnly,
  })

  return (
    <AppSidebar
      title={project.name}
      subtitle={<CopyableText value={project.slug} size="sm" tooltip="Copy project slug" ellipsis />}
      footer={({ collapsed }) => (
        <>
          {CHANGELOG_UI_ENABLED ? <ChangelogSidebarEntry collapsed={collapsed} /> : null}
          {isReadOnly ? null : (
            <>
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

function SampleProjectStrip() {
  return (
    <div className="relative flex shrink-0 items-center justify-center gap-4 px-4 py-3 text-primary-foreground">
      <Text.H6 color="white" className="text-center opacity-95">
        This sample project uses lightweight seed data. Some features, including semantic search and behavior detail
        drill-downs, may not be fully functional.
      </Text.H6>
    </div>
  )
}

function ProjectLayout() {
  const isShowcase = Route.useLoaderData({ select: (data) => data.isShowcase })
  if (isShowcase) {
    return (
      <ProjectScopeProvider scope={SHOWCASE_SCOPE}>
        <ProjectLayoutContent isShowcase />
      </ProjectScopeProvider>
    )
  }
  return <ProjectLayoutContent isShowcase={false} />
}

function ProjectLayoutContent({ isShowcase }: { isShowcase: boolean }) {
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

  if (isShowcase) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-primary">
        <ShowcaseBanner />
        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-t-2xl bg-background">
          <ProjectSidebar project={project} projectSlug={projectSlug} />
          <main className="flex-1 min-w-0 overflow-y-auto">
            <ContentErrorBoundary>
              <Outlet />
            </ContentErrorBoundary>
          </main>
        </div>
      </div>
    )
  }

  if (project.settings.isSample) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-primary">
        <SampleProjectStrip />
        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-t-2xl bg-background">
          <ProjectSidebar project={project} projectSlug={projectSlug} />
          <main className="flex-1 min-w-0 overflow-y-auto">
            <ContentErrorBoundary>
              <Outlet />
            </ContentErrorBoundary>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <ProjectSidebar project={project} projectSlug={projectSlug} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <ContentErrorBoundary>
          <Outlet />
        </ContentErrorBoundary>
      </main>
    </div>
  )
}
