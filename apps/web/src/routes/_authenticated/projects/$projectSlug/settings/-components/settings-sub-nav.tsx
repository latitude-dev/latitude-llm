import { cn, Icon, Text } from "@repo/ui"
import { Link, useRouterState } from "@tanstack/react-router"
import { useVisibleProjectSettingsGroups } from "../../../../../../domains/projects/project-sections.ts"

export function SettingsSubNav({ projectSlug }: { projectSlug: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const groups = useVisibleProjectSettingsGroups()

  return (
    <nav className="flex w-72 shrink-0 flex-col gap-6 overflow-y-auto bg-secondary p-4">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <Text.H6 color="foregroundMuted" className="px-2 pb-1">
            {group.title}
          </Text.H6>
          {group.items.map((item) => {
            const to = item.path(projectSlug)
            const active = pathname === to || pathname.startsWith(`${to}/`)
            return (
              <Link
                key={item.key}
                to={to}
                className={cn("flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted", {
                  "bg-muted": active,
                })}
              >
                <Icon icon={item.icon} size="sm" color={active ? "foreground" : "foregroundMuted"} />
                <Text.H5M color={active ? "foreground" : "foregroundMuted"}>{item.label}</Text.H5M>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
