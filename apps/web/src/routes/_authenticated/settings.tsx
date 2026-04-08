import { DetailDrawerSectionHeading } from "@repo/ui"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import { Building2, Key, ShieldAlert, UserRound, Users } from "lucide-react"
import { AppSidebar, NavItem } from "../../layouts/AppSidebar/index.tsx"
import { usePathname } from "../../lib/hooks/use-router-selectors.ts"

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
})

const organizationNavItems = [
  { label: "Organization", to: "/settings/organization", icon: Building2 },
  { label: "Members", to: "/settings/members", icon: Users },
  { label: "API Keys", to: "/settings/api-keys", icon: Key },
  { label: "Issues", to: "/settings/issues", icon: ShieldAlert },
] as const

const personalNavItems = [{ label: "Account", to: "/settings/account", icon: UserRound }] as const

const allNavItems = [...organizationNavItems, ...personalNavItems] as const

function SettingsLayout() {
  const pathname = usePathname()
  return (
    <div className="flex h-full min-h-0">
      <AppSidebar title="Settings">
        {({ collapsed }) =>
          collapsed ? (
            allNavItems.map(({ label, to, icon }) => (
              <NavItem
                key={to}
                icon={icon}
                label={label}
                to={to}
                active={pathname === to || pathname.startsWith(`${to}/`)}
                collapsed={collapsed}
              />
            ))
          ) : (
            <div className="flex w-full flex-col gap-4">
              <div className="flex flex-col gap-1">
                <DetailDrawerSectionHeading label="Organization" />
                {organizationNavItems.map(({ label, to, icon }) => (
                  <NavItem
                    key={to}
                    icon={icon}
                    label={label}
                    to={to}
                    active={pathname === to || pathname.startsWith(`${to}/`)}
                    collapsed={collapsed}
                  />
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <DetailDrawerSectionHeading label="Personal" />
                {personalNavItems.map(({ label, to, icon }) => (
                  <NavItem
                    key={to}
                    icon={icon}
                    label={label}
                    to={to}
                    active={pathname === to || pathname.startsWith(`${to}/`)}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </div>
          )
        }
      </AppSidebar>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
