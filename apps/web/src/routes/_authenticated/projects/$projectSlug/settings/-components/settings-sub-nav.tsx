import { cn, Icon, Text, Tooltip } from "@repo/ui"
import { Link, useRouterState } from "@tanstack/react-router"
import { useVisibleProjectSettingsGroups } from "../../../../../../domains/projects/project-sections.ts"
import { useMediaQuery } from "../../../../../../lib/hooks/useMediaQuery.ts"

export function SettingsSubNav({ projectSlug }: { projectSlug: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const groups = useVisibleProjectSettingsGroups()
  // Mirrors the `md:` breakpoint that switches the nav to its icons-only rail.
  const collapsed = !useMediaQuery("(min-width: 48rem)")
  // Longest match wins, so /organization/integrations highlights Integrations, not Organization → General.
  const activePath = groups
    .flatMap((group) => group.items.map((item) => item.path(projectSlug)))
    .filter((to) => pathname === to || pathname.startsWith(`${to}/`))
    .reduce((longest, to) => (to.length > longest.length ? to : longest), "")

  return (
    <nav className="flex w-fit shrink-0 flex-col gap-6 overflow-y-auto bg-secondary p-4 md:w-72">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <span className="hidden px-2 pb-1 md:block">
            <Text.H6 color="foregroundMuted">{group.title}</Text.H6>
          </span>
          {group.items.map((item) => {
            const to = item.path(projectSlug)
            const active = to === activePath
            const link = (
              <Link
                key={item.key}
                to={to}
                className={cn("flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted", {
                  "bg-muted": active,
                })}
              >
                <Icon icon={item.icon} size="sm" color={active ? "foreground" : "foregroundMuted"} />
                <span className="hidden md:block">
                  <Text.H5M color={active ? "foreground" : "foregroundMuted"}>{item.label}</Text.H5M>
                </span>
              </Link>
            )
            if (!collapsed) return link
            return (
              <Tooltip key={item.key} asChild side="right" trigger={link}>
                {item.label}
              </Tooltip>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
