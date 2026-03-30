import { Button, CopyButton, cn, Icon, Text } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router"
import {
  ChevronDown,
  ChevronRight,
  ChevronsUp,
  History,
  Link2Off,
  MessageSquareText,
  PanelLeft,
  PanelLeftClose,
  Settings,
  ShieldAlert,
} from "lucide-react"
import { useState } from "react"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug")({
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

function NavItem({
  icon,
  label,
  to,
  active,
  badge,
  children,
  defaultExpanded = false,
  collapsed = false,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  to?: string
  active?: boolean
  badge?: number
  children?: React.ReactNode
  defaultExpanded?: boolean
  collapsed?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const hasChildren = !!children && !collapsed

  const chevron = hasChildren ? (
    expanded ? (
      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
    ) : (
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    )
  ) : null

  const rowContent = (
    <div
      className={`flex items-center gap-2 rounded-lg cursor-pointer transition-colors ${
        collapsed ? "justify-center w-10 h-10 mx-auto" : "px-2 py-2"
      } ${active ? "bg-accent/10" : "hover:bg-muted"}`}
      title={collapsed ? label : undefined}
    >
      <Icon icon={icon} size="sm" className={active ? "text-accent-foreground" : "text-muted-foreground"} />
      {!collapsed && (
        <>
          <Text.H5M color={active ? "accentForeground" : "foregroundMuted"} ellipsis className="flex-1 min-w-0">
            {label}
          </Text.H5M>
          {badge !== undefined && badge > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-destructive-muted border border-destructive/10">
              <ChevronsUp className="h-3 w-3 text-destructive" />
              <Text.H6 color="destructive" weight="medium">
                {badge}
              </Text.H6>
            </span>
          )}
          {to ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setExpanded((v) => !v)
              }}
              className="shrink-0"
            >
              {chevron}
            </button>
          ) : (
            chevron
          )}
        </>
      )}
    </div>
  )

  return (
    <div className="flex flex-col">
      {to ? (
        <Link to={to} className="block">
          {rowContent}
        </Link>
      ) : (
        <button type="button" onClick={() => hasChildren && setExpanded((v) => !v)} className="w-full text-left">
          {rowContent}
        </button>
      )}
      {hasChildren && expanded && <div className="flex flex-col pl-6 gap-0.5 pt-0.5">{children}</div>}
    </div>
  )
}

function NavChild({ label, to }: { label: string; to?: string }) {
  const content = (
    <div className="px-2 py-2 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer transition-colors">
      <Text.H5M color="foregroundMuted" ellipsis>
        {label}
      </Text.H5M>
    </div>
  )

  return to ? (
    <Link to={to} className="block">
      {content}
    </Link>
  ) : (
    content
  )
}

function ProjectSidebar({
  projectSlug,
  collapsed,
  onToggleCollapse,
}: {
  projectSlug: string
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const isTracesActive =
    pathname === `/projects/${projectSlug}` ||
    pathname === `/projects/${projectSlug}/` ||
    pathname.startsWith(`/projects/${projectSlug}/traces`)
  const isIssuesActive = pathname.startsWith(`/projects/${projectSlug}/issues`)
  const isDatasetsActive = pathname.startsWith(`/projects/${projectSlug}/datasets`)
  const isSettingsActive = pathname.startsWith(`/projects/${projectSlug}/settings`)

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-border flex flex-col h-full transition-all duration-200",
        collapsed ? "w-16" : "w-[280px]",
      )}
    >
      <div className="flex flex-col shrink-0">
        {/* Header */}
        <div className={cn("flex flex-col p-4 border-b border-border", { collapsed: "justify-center items-center" })}>
          <div className={cn("flex items-center gap-3", !collapsed && "justify-between")}>
            {!collapsed && <ProjectEmoji name={project?.name ?? ""} />}
            {!collapsed && (
              <Text.H5M ellipsis className="flex-1 min-w-0">
                {project ? extractLeadingEmoji(project.name)[1] : "…"}
              </Text.H5M>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={onToggleCollapse}
              className="h-8 w-8 shrink-0"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Icon icon={collapsed ? PanelLeft : PanelLeftClose} size="sm" color="foregroundMuted" />
            </Button>
          </div>
          {!collapsed && project && (
            <div className="flex items-center gap-2">
              <Text.H6 color="foregroundMuted">{project.slug}</Text.H6>
              <CopyButton value={project.slug} className="h-6 w-6" tooltip="Copy project slug" />
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className={`p-4 flex flex-col gap-1 ${collapsed ? "items-center" : ""}`}>
          <NavItem
            icon={MessageSquareText}
            label="Traces"
            to={`/projects/${projectSlug}`}
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
        </nav>
      </div>
    </aside>
  )
}

function ProjectLayout() {
  const { projectSlug } = Route.useParams()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-full">
      <ProjectSidebar
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
