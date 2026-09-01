import { Button, Icon, Tooltip, useLocalStorage, useValueWithDefault } from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { PanelLeft, PanelLeftClose } from "lucide-react"
import { createContext, type ReactNode, useContext } from "react"
import { HotkeyBadge } from "../../components/hotkey-badge.tsx"
import { useHasMatchStaticData } from "../../lib/hooks/use-router-selectors.ts"

interface SidebarCollapseValue {
  readonly collapsed: boolean
  readonly toggleCollapsed: () => void
}

const SidebarCollapseContext = createContext<SidebarCollapseValue | null>(null)

function useShouldCollapseSidebar() {
  return useHasMatchStaticData((staticData) => staticData?.collapseSidebar === true)
}

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const autoCollapse = useShouldCollapseSidebar()
  const { value: storedCollapsed, setValue: setStoredCollapsed } = useLocalStorage<boolean | null>({
    key: "app-sidebar-collapsed",
    defaultValue: null,
  })

  const defaultCollapseToken = autoCollapse ? "narrow" : storedCollapsed === true ? "narrow" : "wide"
  const [collapseToken, setCollapseToken] = useValueWithDefault(defaultCollapseToken)
  const collapsed = collapseToken === "narrow"

  const toggleCollapsed = () => {
    const nextCollapsed = !collapsed
    setCollapseToken(nextCollapsed ? "narrow" : "wide")
    setStoredCollapsed(nextCollapsed)
  }
  useHotkeys([{ hotkey: "Mod+B", callback: toggleCollapsed }])

  return (
    <SidebarCollapseContext.Provider value={{ collapsed, toggleCollapsed }}>{children}</SidebarCollapseContext.Provider>
  )
}

export function useSidebarCollapse(): SidebarCollapseValue {
  const ctx = useContext(SidebarCollapseContext)
  if (!ctx) throw new Error("useSidebarCollapse must be used within a SidebarCollapseProvider")
  return ctx
}

export function SidebarCollapseToggleButton({ className }: { className?: string }) {
  const { collapsed, toggleCollapsed } = useSidebarCollapse()

  return (
    <Tooltip
      asChild
      side="right"
      trigger={
        <Button variant="ghost" size="icon" onClick={toggleCollapsed} className={className ?? "h-8 w-8 shrink-0"}>
          <Icon icon={collapsed ? PanelLeft : PanelLeftClose} size="sm" color="foregroundMuted" />
        </Button>
      }
    >
      <div className="flex items-center gap-1">
        {collapsed ? "Expand" : "Collapse"} <HotkeyBadge hotkey="Mod+B" />
      </div>
    </Tooltip>
  )
}
