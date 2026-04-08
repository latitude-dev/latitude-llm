import { CopyableText } from "@repo/ui"
import { createFileRoute, getRouteApi, Outlet, redirect, useRouterState } from "@tanstack/react-router"
import { History, MessageSquareText, Settings, ShieldAlert, UnlinkIcon } from "lucide-react"
import { useLayoutEffect } from "react"
import { getProjectBySlug, type ProjectRecord } from "../../../domains/projects/projects.functions.ts"
import { AppSidebar, NavItem } from "../../../layouts/AppSidebar/index.tsx"
import { writeLastProjectSlug } from "../../../lib/last-project-storage.ts"
import { ProjectBreadcrumbSegment } from "../-components/project-breadcrumb-segment.tsx"

const authenticatedRoute = getRouteApi("/_authenticated")

export const Route = createFileRoute("/_authenticated/projects/$projectSlug")({
  staticData: {
    breadcrumb: ProjectBreadcrumbSegment,
  },
  component: ProjectLayout,
  beforeLoad: async ({ params }) => {
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
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

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
      footer={({ collapsed }) => (
        <NavItem
          icon={Settings}
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
            icon={MessageSquareText}
            label="Traces"
            to={`/projects/${projectSlug}`}
            active={isTracesActive}
            collapsed={collapsed}
          />
          <NavItem
            icon={UnlinkIcon}
            label="Annotation queues"
            to={`/projects/${projectSlug}/annotation-queues`}
            active={isAnnotationQueuesActive}
            collapsed={collapsed}
          />
          <NavItem
            icon={ShieldAlert}
            label="Issues"
            to={`/projects/${projectSlug}/issues`}
            active={isIssuesActive}
            collapsed={collapsed}
          />
          <NavItem
            icon={History}
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
  const { project } = Route.useRouteContext()
  const { organizationId } = authenticatedRoute.useRouteContext()

  useLayoutEffect(() => {
    writeLastProjectSlug(organizationId, projectSlug)
  }, [organizationId, projectSlug])

  return (
    <div className="flex h-full min-h-0">
      <ProjectSidebar project={project} projectSlug={projectSlug} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
