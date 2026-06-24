import { cn, Icon, LatitudeLogo, Text } from "@repo/ui"
import { Link, useRouterState } from "@tanstack/react-router"
import { Palette } from "lucide-react"
import { DesignSystemThemeBadge, DesignSystemThemeToggle } from "./design-system-theme.tsx"
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
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border/70 bg-background">
      <div className="flex flex-col gap-1 border-b border-border/70 px-5 py-5">
        <Link to="/design-system" className="flex items-center gap-2 rounded-lg transition-colors hover:opacity-80">
          <LatitudeLogo className="h-5 w-5" />
          <div className="flex min-w-0 flex-col">
            <Text.H6 weight="semibold">Latitude UI</Text.H6>
            <Text.H6 color="foregroundMuted" className="text-[11px]">
              Design system
            </Text.H6>
          </div>
        </Link>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
        {DESIGN_SYSTEM_NAV.map((section) => (
          <div key={section.label} className="flex flex-col gap-1">
            <Text.H6 color="foreground" weight="medium" className="px-2 uppercase tracking-wide">
              {section.label}
            </Text.H6>
            {section.items.map((item) => {
              const active = isNavItemActive(pathname, item.to)

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <DesignSystemThemeToggle compact />
          <DesignSystemThemeBadge />
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <Icon icon={Palette} size="sm" color="foregroundMuted" />
          Back to app
        </Link>
      </div>
    </aside>
  )
}
