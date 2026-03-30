import { Text } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { History, Link2Off, MessageSquareText, Settings, ShieldAlert } from "lucide-react"
import { useState } from "react"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { AppSidebar, NavChild, NavItem } from "../../../layouts/AppSidebar/index.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectLayout,
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
  projectId,
  collapsed,
  onToggleCollapse,
}: {
  projectId: string
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.id, projectId)).findOne(),
    [projectId],
  )

  const isTracesActive =
    pathname === `/projects/${projectId}` ||
    pathname === `/projects/${projectId}/` ||
    pathname.startsWith(`/projects/${projectId}/traces`)
  const isIssuesActive = pathname.startsWith(`/projects/${projectId}/issues`)
  const isDatasetsActive = pathname.startsWith(`/projects/${projectId}/datasets`)
  const isSettingsActive = pathname.startsWith(`/projects/${projectId}/settings`)

  const title = (
    <div className="flex items-center gap-2 min-w-0">
      <ProjectEmoji name={project?.name ?? ""} />
      <Text.H5M ellipsis className="flex-1 min-w-0">
        {project ? extractLeadingEmoji(project.name)[1] : "…"}
      </Text.H5M>
    </div>
  )

  return (
    <AppSidebar title={title} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <NavItem
        icon={MessageSquareText}
        label="Traces"
        to={`/projects/${projectId}`}
        active={isTracesActive}
        collapsed={collapsed}
      />
      <NavItem icon={Link2Off} label="Annotation queues" defaultExpanded={false} collapsed={collapsed}>
        <NavChild label="Another queue" />
        <NavChild label="Cute queue" />
      </NavItem>
      <NavItem
        icon={ShieldAlert}
        label="Issues"
        to={`/projects/${projectId}/issues`}
        active={isIssuesActive}
        collapsed={collapsed}
      />
      <NavItem
        icon={History}
        label="Datasets"
        to={`/projects/${projectId}/datasets`}
        active={isDatasetsActive}
        collapsed={collapsed}
      />
      <NavItem
        icon={Settings}
        label="Settings"
        to={`/projects/${projectId}/settings`}
        active={isSettingsActive}
        collapsed={collapsed}
      />
    </AppSidebar>
  )
}

function ProjectLayout() {
  const { projectId } = Route.useParams()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-full">
      <ProjectSidebar
        projectId={projectId}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
