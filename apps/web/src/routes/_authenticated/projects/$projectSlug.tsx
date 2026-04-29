import { CopyableText } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router"
import { DatabaseIcon, SearchIcon, SettingsIcon, ShieldAlertIcon, TextAlignStartIcon } from "lucide-react"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { getProjectBySlug, type ProjectRecord } from "../../../domains/projects/projects.functions.ts"
import { AppSidebar, NavItem } from "../../../layouts/AppSidebar/index.tsx"
import { ProjectBreadcrumbSegment } from "../-components/project-breadcrumb-segment.tsx"

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

function ProjectSidebar({ project, projectSlug }: { project: ProjectRecord; projectSlug: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  const isTracesActive =
    pathname === `/projects/${projectSlug}` ||
    pathname === `/projects/${projectSlug}/` ||
    pathname.startsWith(`/projects/${projectSlug}/traces`)
  const isSearchActive = pathname.startsWith(`/projects/${projectSlug}/search`)
  const isIssuesActive = pathname.startsWith(`/projects/${projectSlug}/issues`)
  const isDatasetsActive = pathname.startsWith(`/projects/${projectSlug}/datasets`)
  const isSettingsActive = pathname.startsWith(`/projects/${projectSlug}/settings`)

  return (
    <AppSidebar
      title={project.name}
      subtitle={<CopyableText value={project.slug} size="sm" tooltip="Copy project slug" />}
      footer={({ collapsed }) => (
        <NavItem
          icon={SettingsIcon}
          label="Settings"
          to={`/projects/${projectSlug}/settings`}
          active={isSettingsActive}
          collapsed={collapsed}
        />
      )}
    >
      {({ collapsed }) => (
        <>
          <NavItem
            icon={SearchIcon}
            label="Search"
            to={`/projects/${projectSlug}/search`}
            active={isSearchActive}
            collapsed={collapsed}
          />
          <NavItem
            icon={TextAlignStartIcon}
            label="Traces"
            to={`/projects/${projectSlug}`}
            active={isTracesActive}
            collapsed={collapsed}
          />
          <NavItem
            icon={ShieldAlertIcon}
            label="Issues"
            to={`/projects/${projectSlug}/issues`}
            active={isIssuesActive}
            collapsed={collapsed}
          />
          <NavItem
            icon={DatabaseIcon}
            label="Datasets"
            to={`/projects/${projectSlug}/datasets`}
            active={isDatasetsActive}
            collapsed={collapsed}
          />
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
