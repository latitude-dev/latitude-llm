import { Button, Icon, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { ChevronDown, ChevronRight, ChevronsUp, PanelLeft, PanelLeftClose } from "lucide-react"
import { type ReactNode, useState } from "react"

export function NavItem({
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
  children?: ReactNode
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

export function NavChild({ label, to }: { label: string; to?: string }) {
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

export function AppSidebar({
  title,
  collapsed,
  onToggleCollapse,
  children,
}: {
  title: ReactNode
  collapsed: boolean
  onToggleCollapse: () => void
  children: ReactNode
}) {
  return (
    <aside
      className={`shrink-0 border-r border-border flex flex-col h-full transition-all duration-200 ${
        collapsed ? "w-16" : "w-[280px]"
      }`}
    >
      <div className="flex flex-col shrink-0">
        {/* Header */}
        <div className={`flex items-center gap-3 p-4 border-b border-border ${collapsed ? "justify-center" : ""}`}>
          {!collapsed && <div className="flex-1 min-w-0">{title}</div>}
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

        {/* Nav items */}
        <nav className={`p-4 flex flex-col gap-1 ${collapsed ? "items-center" : ""}`}>{children}</nav>
      </div>
    </aside>
  )
}
