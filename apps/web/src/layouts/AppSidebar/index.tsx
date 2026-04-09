import { Button, cn, Icon, Text, Tooltip, useLocalStorage } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { Link, useMatches } from "@tanstack/react-router"
import { ChevronDown, ChevronRight, ChevronsUp, PanelLeft, PanelLeftClose } from "lucide-react"
import { type ReactElement, type ReactNode, useCallback, useState } from "react"
import { HotkeyBadge } from "../../components/hotkey-badge.tsx"

type NavItemIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>

function ProjectEmoji({ name }: { name: string }) {
  const [emoji] = extractLeadingEmoji(name)
  if (!emoji) return null

  return (
    <div className="w-6 h-6 rounded-lg bg-white border border-border flex items-center justify-center shrink-0">
      <span className="text-sm leading-none">{emoji}</span>
    </div>
  )
}

function NavItemTooltipWrapper({
  collapsed,
  label,
  children,
}: {
  collapsed: boolean
  label: string
  children: ReactElement
}) {
  if (!collapsed) return children

  return (
    <Tooltip asChild trigger={children} side="right">
      {label}
    </Tooltip>
  )
}

function NavItemDisclosureIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <Icon icon={expanded ? ChevronDown : ChevronRight} size="sm" color="foregroundMuted" className={className ?? ""} />
  )
}

function NavItemActionWrapper({
  to,
  collapsed,
  label,
  rowClassName,
  hasChildren,
  expanded,
  onToggle,
  children,
}: {
  to: string | undefined
  collapsed: boolean
  label: string
  rowClassName: string
  hasChildren: boolean
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const disclosureIcon = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-6 w-6 rounded-md p-0 group-hover:bg-transparent"
      onClick={onToggle}
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
      aria-expanded={expanded}
    >
      <NavItemDisclosureIcon expanded={expanded} />
    </Button>
  )

  const content = to ? (
    <div
      className={cn(rowClassName, "flex items-center", {
        "justify-center": collapsed,
        "gap-1": !collapsed,
      })}
      title={collapsed ? label : undefined}
    >
      <Link
        to={to}
        className={cn("flex items-center", {
          "h-full w-full justify-center": collapsed,
          "min-w-0 flex-1 gap-2": !collapsed,
        })}
        aria-label={collapsed ? label : undefined}
      >
        {children}
      </Link>
      {hasChildren ? disclosureIcon : null}
    </div>
  ) : (
    <button
      type="button"
      onClick={hasChildren ? onToggle : undefined}
      className={cn(rowClassName, "flex w-full items-center text-left", {
        "justify-center": collapsed,
        "gap-2": !collapsed,
      })}
      title={collapsed ? label : undefined}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-label={collapsed ? label : undefined}
    >
      {children}
      {hasChildren ? disclosureIcon : null}
    </button>
  )

  return (
    <NavItemTooltipWrapper collapsed={collapsed} label={label}>
      {content}
    </NavItemTooltipWrapper>
  )
}

function NavItemContent({
  icon,
  label,
  active,
  badge,
  collapsed = false,
}: {
  icon: NavItemIcon
  label: string
  active?: boolean | undefined
  badge?: number | undefined
  collapsed?: boolean | undefined
}) {
  return (
    <>
      <Icon icon={icon} size="sm" className={active ? "text-accent-foreground" : "text-muted-foreground"} />
      {!collapsed ? (
        <>
          <Text.H5M color={active ? "accentForeground" : "foregroundMuted"} ellipsis className="min-w-0 flex-1">
            {label}
          </Text.H5M>
          {badge !== undefined && badge > 0 ? (
            <span className="inline-flex items-center gap-0.5 rounded-md border border-destructive/10 bg-destructive-muted px-1.5 py-0.5">
              <Icon icon={ChevronsUp} size="xs" color="destructive" />
              <Text.H6 color="destructive" weight="medium">
                {badge}
              </Text.H6>
            </span>
          ) : null}
        </>
      ) : null}
    </>
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
  icon: NavItemIcon
  label: string
  to?: string
  active?: boolean
  badge?: number
  children?: ReactNode
  defaultExpanded?: boolean
  collapsed?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const hasChildren = Boolean(children) && !collapsed
  const rowClassName = cn("rounded-lg transition-colors", {
    "h-10 w-10": collapsed,
    "px-2 py-2": !collapsed,
    "bg-accent/10": active,
    "hover:bg-muted": !active,
  })
  const navItemContent = (
    <NavItemContent icon={icon} label={label} active={active} badge={badge} collapsed={collapsed} />
  )
  const toggleExpanded = () => setExpanded((value) => !value)

  return (
    <div className="flex flex-col">
      <NavItemActionWrapper
        to={to}
        collapsed={collapsed}
        label={label}
        rowClassName={rowClassName}
        hasChildren={hasChildren}
        expanded={expanded}
        onToggle={toggleExpanded}
      >
        {navItemContent}
      </NavItemActionWrapper>
      {hasChildren && expanded ? <div className="flex flex-col gap-0.5 pl-6 pt-0.5">{children}</div> : null}
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
  const { value: collapsedPreference, setValue: setCollapsedPreference } = useLocalStorage<boolean | null>({
    key: "app-sidebar-collapsed",
    defaultValue: null,
  })
  const collapsed = collapsedPreference ?? autoCollapse
  const toggleCollapsed = () => setCollapsedPreference((value) => !(value ?? autoCollapse))
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
