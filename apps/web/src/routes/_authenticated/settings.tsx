import { createFileRoute, Outlet } from "@tanstack/react-router"
import { Building2, CreditCard, Key, UserRound, Users } from "lucide-react"
import { AppSidebar, NavItem } from "../../layouts/AppSidebar/index.tsx"
import { usePathname } from "../../lib/hooks/use-router-selectors.ts"
import { ProjectBreadcrumbSegment } from "./-components/project-breadcrumb-segment.tsx"

export const Route = createFileRoute("/_authenticated/settings")({
  staticData: {
    breadcrumb: ProjectBreadcrumbSegment,
  },
  component: SettingsLayout,
})

const navItems = [
  { label: "Organization", to: "/settings/organization", icon: Building2 },
  { label: "Members", to: "/settings/members", icon: Users },
  { label: "Billing", to: "/settings/billing", icon: CreditCard },
  { label: "API Keys", to: "/settings/api-keys", icon: Key },
  { label: "Account", to: "/settings/account", icon: UserRound },
] as const

function SettingsLayout() {
  const pathname = usePathname()
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
