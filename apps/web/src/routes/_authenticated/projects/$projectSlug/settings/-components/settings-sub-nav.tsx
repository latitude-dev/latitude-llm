import { cn, Icon, Text } from "@repo/ui"
import { Link, useRouterState } from "@tanstack/react-router"
import {
  Building2,
  CreditCard,
  Key,
  type LucideIcon,
  Package,
  ScanSearch,
  ShieldAlert,
  UserRound,
  Users,
} from "lucide-react"

interface SubNavItem {
  readonly to: string
  readonly label: string
  readonly icon: LucideIcon
}

interface SubNavSection {
  readonly title: string
  readonly items: readonly SubNavItem[]
}

export function SettingsSubNav({ projectSlug }: { projectSlug: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const base = `/projects/${projectSlug}/settings`

  const sections: SubNavSection[] = [
    {
      title: "Project",
      items: [
        { to: `${base}/general`, label: "General", icon: Package },
        { to: `${base}/issues`, label: "Issues", icon: ShieldAlert },
        { to: `${base}/flaggers`, label: "Flaggers", icon: ScanSearch },
      ],
    },
    {
      title: "Organization",
      items: [
        { to: `${base}/organization`, label: "General", icon: Building2 },
        { to: `${base}/members`, label: "Members", icon: Users },
        { to: `${base}/keys`, label: "Keys", icon: Key },
        { to: `${base}/billing`, label: "Billing", icon: CreditCard },
      ],
    },
    {
      title: "Personal",
      items: [{ to: `${base}/account`, label: "Account", icon: UserRound }],
    },
  ]

  return (
    <nav className="flex w-72 shrink-0 flex-col gap-6 overflow-y-auto bg-secondary p-4">
      {sections.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <Text.H6 color="foregroundMuted" className="px-2 pb-1">
            {section.title}
          </Text.H6>
          {section.items.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`)
            return (
              <Link
                key={item.to}
                to={item.to}
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
