import { Button, cn, Icon, Text, Tooltip, useToggleWithDefault } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { Link, useMatches } from "@tanstack/react-router"
import { ChevronDown, ChevronRight, ChevronsUp, PanelLeft, PanelLeftClose } from "lucide-react"
import { type ReactNode, useState } from "react"
import { HotkeyBadge } from "../../components/hotkey-badge.tsx"

function ProjectEmoji({ name }: { name: string }) {
  const [emoji] = extractLeadingEmoji(name)
  if (!emoji) return null

  return (
    <div className="w-6 h-6 rounded-lg bg-white border border-border flex items-center justify-center shrink-0">
      <span className="text-sm leading-none">{emoji}</span>
    </div>
  )
}

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
      className={cn("flex cursor-pointer items-center gap-2 rounded-lg transition-colors", {
        "h-10 w-10 justify-center": collapsed,
        "px-2 py-2": !collapsed,
        "bg-accent": active,
        "hover:bg-muted": !active,
      })}
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

function useShouldCollapseSidebar() {
  const matches = useMatches()
  return matches.some((m) => (m.staticData as { collapseSidebar?: boolean } | undefined)?.collapseSidebar === true)
}
export function AppSidebar({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: ReactNode
  children: (props: { collapsed: boolean }) => ReactNode
}) {
  const autoCollapse = useShouldCollapseSidebar()
  const [collapsed, toggleCollapsed] = useToggleWithDefault(autoCollapse)
  useHotkeys([{ hotkey: "Mod+B", callback: toggleCollapsed }])
  return (
    <aside
      className={cn("flex h-full shrink-0 flex-col border-r border-border transition-all duration-200", {
        "w-16": collapsed,
        "w-[280px]": !collapsed,
      })}
    >
      <div className="flex flex-col shrink-0">
        <div
          className={cn("flex flex-col gap-2 border-b border-border p-4", {
            "items-center": collapsed,
          })}
        >
          <div
            className={cn("flex items-center gap-3", {
              "w-full justify-between": !collapsed,
            })}
          >
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <ProjectEmoji name={title} />
                  <Text.H5M ellipsis className="flex-1 min-w-0">
                    {extractLeadingEmoji(title)[1]}
                  </Text.H5M>
                </div>
              </div>
            )}
            <Tooltip
              asChild
              side="right"
              trigger={
                <Button variant="outline" size="icon" onClick={toggleCollapsed} className="h-8 w-8 shrink-0">
                  <Icon icon={collapsed ? PanelLeft : PanelLeftClose} size="sm" color="foregroundMuted" />
                </Button>
              }
            >
              {collapsed ? "Expand" : "Collapse"} <HotkeyBadge hotkey="Mod+B" />
            </Tooltip>
          </div>
          {!collapsed && subtitle ? <div className="min-w-0">{subtitle}</div> : null}
        </div>

        <nav
          className={cn("flex flex-col gap-1 p-4", {
            "items-center": collapsed,
          })}
        >
          {children({ collapsed })}
        </nav>
      </div>
    </aside>
  )
}
