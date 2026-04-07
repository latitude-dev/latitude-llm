import { CopyableText, Text } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router"
import { History, ListOrdered, MessageSquareText, Settings, ShieldAlert } from "lucide-react"
import { useState } from "react"
import { getProjectBySlug, type ProjectRecord } from "../../../domains/projects/projects.functions.ts"
import { AppSidebar, NavItem } from "../../../layouts/AppSidebar/index.tsx"
import { ProjectBreadcrumbSegment } from "../-components/project-breadcrumb-segment.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug")({
  staticData: {
    breadcrumb: ProjectBreadcrumbSegment,
  },
  component: ProjectLayout,
  beforeLoad: async ({ params }) => {
    try {
      const project = await getProjectBySlug({ data: { slug: params.projectSlug } })
      return { project }
    } catch {
      throw redirect({ to: "/" })
    }
  },
})

function ProjectEmoji({ name }: { name: string }) {
  const [emoji] = extractLeadingEmoji(name)
  if (!emoji) return null

  return (
    <div className="w-6 h-6 rounded-lg bg-white border border-border flex items-center justify-center shrink-0">
      <span className="text-sm leading-none">{emoji}</span>
    </div>
  )
}

function ProjectSidebar({
  project,
  projectSlug,
  collapsed,
  onToggleCollapse,
}: {
  project: ProjectRecord
  projectSlug: string
  collapsed: boolean
  onToggleCollapse: () => void
}) {
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

  const title = (
    <div className="flex items-center gap-2 min-w-0">
      <ProjectEmoji name={project.name} />
      <Text.H5M ellipsis className="flex-1 min-w-0">
        {extractLeadingEmoji(project.name)[1]}
      </Text.H5M>
    </div>
  )

  return (
    <AppSidebar
      title={title}
      subtitle={<CopyableText value={project.slug} size="sm" tooltip="Copy project slug" />}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <NavItem
        icon={MessageSquareText}
        label="Traces"
        to={`/projects/${projectSlug}`}
        active={isTracesActive}
        collapsed={collapsed}
      />
      <NavItem
        icon={ListOrdered}
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
      <NavItem
        icon={Settings}
        label="Settings"
        to={`/projects/${projectSlug}/settings`}
        active={isSettingsActive}
        collapsed={collapsed}
      />
    </AppSidebar>
  )
}

function ProjectLayout() {
  const { projectSlug } = Route.useParams()
  const { project } = Route.useRouteContext()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-full">
      <ProjectSidebar
        project={project}
        projectSlug={projectSlug}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
