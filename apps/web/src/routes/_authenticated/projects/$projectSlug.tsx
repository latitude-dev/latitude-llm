import { CopyableText } from "@repo/ui"
import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router"
import { CircleAlertIcon, DatabaseIcon, LayersIcon, MessageSquareTextIcon, SettingsIcon } from "lucide-react"
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
  const isIssuesActive = pathname.startsWith(`/projects/${projectSlug}/issues`)
  const isDatasetsActive = pathname.startsWith(`/projects/${projectSlug}/datasets`)
  const isSettingsActive = pathname.startsWith(`/projects/${projectSlug}/settings`)
  const isAnnotationQueuesActive = pathname.startsWith(`/projects/${projectSlug}/annotation-queues`)

  return (
    <AppSidebar
      title={project.name}
      subtitle={<CopyableText value={project.slug} size="sm" tooltip="Copy project slug" />}
    >
      {({ collapsed }) => (
        <>
          <NavItem
            icon={MessageSquareTextIcon}
            label="Traces"
            to={`/projects/${projectSlug}`}
            active={isTracesActive}
            collapsed={collapsed}
          />
          <NavItem
            icon={LayersIcon}
            label="Annotation queues"
            to={`/projects/${projectSlug}/annotation-queues`}
            active={isAnnotationQueuesActive}
            collapsed={collapsed}
          />
          <NavItem
            icon={CircleAlertIcon}
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
          <NavItem
            icon={SettingsIcon}
            label="Settings"
            to={`/projects/${projectSlug}/settings`}
            active={isSettingsActive}
            collapsed={collapsed}
          />
        </>
      )}
    </AppSidebar>
  )
}

function ProjectLayout() {
  const { projectSlug } = Route.useParams()
  const project = Route.useLoaderData({ select: (data) => data.project })
  return (
    <div className="flex h-full">
      <ProjectSidebar project={project} projectSlug={projectSlug} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
