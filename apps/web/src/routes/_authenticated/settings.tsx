import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { Building2, Key, ShieldAlert, UserRound, Users } from "lucide-react"
import { AppSidebar, NavItem } from "../../layouts/AppSidebar/index.tsx"

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
})

const navItems = [
  { label: "Organization", to: "/settings/organization", icon: Building2 },
  { label: "Members", to: "/settings/members", icon: Users },
  { label: "API Keys", to: "/settings/api-keys", icon: Key },
  { label: "Issues", to: "/settings/issues", icon: ShieldAlert },
  { label: "Account", to: "/settings/account", icon: UserRound },
] as const

function SettingsLayout() {
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  return (
    <div className="flex h-full">
      <AppSidebar title="Settings">
        {({ collapsed }) => (
          <>
            {navItems.map(({ label, to, icon }) => (
              <NavItem
                key={to}
                icon={icon}
                label={label}
                to={to}
                active={pathname === to || pathname.startsWith(`${to}/`)}
                collapsed={collapsed}
              />
            ))}
          </>
        )}
      </AppSidebar>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
