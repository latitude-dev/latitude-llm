import { Text } from "@repo/ui"
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { Building2, Key, ShieldAlert, User, Users } from "lucide-react"
import { useState } from "react"
import { AppSidebar, NavItem } from "../../layouts/AppSidebar/index.tsx"

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
})

const NAV_ITEMS = [
  { label: "Organization", to: "/settings/organization", icon: Building2 },
  { label: "Members", to: "/settings/members", icon: Users },
  { label: "API Keys", to: "/settings/api-keys", icon: Key },
  { label: "Issues", to: "/settings/issues", icon: ShieldAlert },
  { label: "Myself", to: "/settings/myself", icon: User },
] as const

function SettingsLayout() {
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-full">
      <AppSidebar
        title={<Text.H5M>Settings</Text.H5M>}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      >
        {NAV_ITEMS.map(({ label, to, icon }) => (
          <NavItem
            key={to}
            icon={icon}
            label={label}
            to={to}
            active={pathname === to || pathname.startsWith(`${to}/`)}
            collapsed={collapsed}
          />
        ))}
      </AppSidebar>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
