import { cn, LatitudeLogo, Text } from "@repo/ui"
import { Link, useRouterState } from "@tanstack/react-router"
import { DesignSystemThemeToggle } from "./design-system-theme.tsx"
import { DESIGN_SYSTEM_NAV } from "./nav-config.ts"

function isNavItemActive(pathname: string, to: string) {
  const normalized = pathname.replace(/\/$/, "")
  const target = to.replace(/\/$/, "")

  if (target === "/design-system") {
    return normalized === "/design-system"
  }

  return normalized === target || normalized.startsWith(`${target}/`)
}

export function DesignSystemSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-border">
      <div className="shrink-0 border-b border-border p-4">
        <div className="flex w-full items-center justify-between gap-3">
          <Link to="/design-system" className="flex min-w-0 flex-1 items-center gap-2">
            <LatitudeLogo className="h-5 w-5 shrink-0" />
            <Text.H5M ellipsis className="min-w-0 flex-1">
              Latitude Design
            </Text.H5M>
          </Link>
          <DesignSystemThemeToggle />
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-6 py-6">
        {DESIGN_SYSTEM_NAV.map((section, index) => (
          <div key={section.label} className={cn("flex flex-col gap-1", index > 0 && "mt-4")}>
            <Text.H6 color="foregroundMuted" weight="medium" className="px-2 uppercase tracking-wide">
              {section.label}
            </Text.H6>
            {section.items.map((item) => {
              const active = isNavItemActive(pathname, item.to)

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn("flex items-center rounded-lg px-2 py-2 transition-colors", {
                    "bg-accent": active,
                    "hover:bg-muted": !active,
                  })}
                >
                  <Text.H5M color={active ? "accentForeground" : "foregroundMuted"} ellipsis className="min-w-0 flex-1">
                    {item.label}
                  </Text.H5M>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
