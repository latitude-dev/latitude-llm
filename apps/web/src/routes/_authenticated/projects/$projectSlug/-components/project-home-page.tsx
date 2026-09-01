import { Alert, Button, Icon, Status, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
  BellRingIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  MessagesSquareIcon,
  ShieldAlertIcon,
  UsersRoundIcon,
  WrenchIcon,
} from "lucide-react"
import { useRouteProject } from "../-route-data.ts"

const WEEKLY_STATS = [
  { label: "Sessions", value: "12,482", detail: "Up 18%" },
  { label: "Users", value: "2,074", detail: "Up 9%" },
  { label: "Cost", value: "$184.20", detail: "This week" },
  { label: "P95 latency", value: "1.2s", detail: "Within target" },
] as const

const PROJECT_AREAS = [
  { label: "Sessions", value: "12,482", icon: MessagesSquareIcon, to: "/projects/$projectSlug/sessions" },
  { label: "Users", value: "2,074 active", icon: UsersRoundIcon, to: "/projects/$projectSlug/users" },
  { label: "Signals", value: "3 open", icon: ShieldAlertIcon, to: "/projects/$projectSlug/signals" },
  { label: "Monitors", value: "8 live", icon: BellRingIcon, to: "/projects/$projectSlug/monitors" },
  { label: "Experiments", value: "4 running", icon: FlaskConicalIcon, to: "/projects/$projectSlug/experiments" },
  { label: "Datasets", value: "6 connected", icon: DatabaseIcon, to: "/projects/$projectSlug/datasets" },
  { label: "Tools", value: "18 tracked", icon: WrenchIcon, to: "/projects/$projectSlug/tools" },
] as const

const OPEN_SIGNALS = [
  { label: "Checkout failures", detail: "Up 42% in the last hour", variant: "destructive" },
  { label: "Answer quality", detail: "Below target for 3 hours", variant: "warning" },
  { label: "New latency pattern", detail: "Review recent tool calls", variant: "info" },
] as const

function ProjectAreaLink({
  label,
  value,
  icon,
  to,
  projectSlug,
}: {
  readonly label: string
  readonly value: string
  readonly icon: LucideIcon
  readonly to: (typeof PROJECT_AREAS)[number]["to"]
  readonly projectSlug: string
}) {
  return (
    <Link
      to={to}
      params={{ projectSlug }}
      className="group flex min-w-[180px] flex-1 items-center justify-between gap-3 px-4 py-3 hover:bg-secondary"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon icon={icon} size="sm" color="foregroundMuted" />
        <Text.H6 className="truncate">{label}</Text.H6>
      </div>
      <Text.H6 color="foregroundMuted" className="shrink-0 tabular-nums group-hover:text-foreground">
        {value}
      </Text.H6>
    </Link>
  )
}

export function ProjectHomePage() {
  const project = useRouteProject()

  return (
    <div className="flex w-full flex-col gap-6 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Text.H3M>Welcome back, {project.name}</Text.H3M>
        <Status label="Sample data" variant="neutral" />
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="weekly-summary">
        <Text.H5M asChild>
          <h2 id="weekly-summary">This week</h2>
        </Text.H5M>
        <div className="flex flex-wrap overflow-hidden rounded-lg border bg-background">
          {WEEKLY_STATS.map((stat) => (
            <div key={stat.label} className="flex min-w-[180px] flex-1 flex-col gap-1 px-4 py-3">
              <Text.H6 color="foregroundMuted">{stat.label}</Text.H6>
              <Text.H4M className="tabular-nums">{stat.value}</Text.H4M>
              <Text.H6 color="foregroundMuted">{stat.detail}</Text.H6>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="attention">
        <Text.H5M asChild>
          <h2 id="attention">Needs attention</h2>
        </Text.H5M>
        <Alert
          variant="warning"
          title="1 escalation needs a response"
          description="Checkout failures increased 42% in the last hour."
          cta={
            <Button asChild size="sm">
              <Link to="/projects/$projectSlug/signals" params={{ projectSlug: project.slug }}>
                Review signal
              </Link>
            </Button>
          }
        />
        <div className="flex flex-col overflow-hidden rounded-lg border bg-background">
          {OPEN_SIGNALS.map((signal) => (
            <Link
              key={signal.label}
              to="/projects/$projectSlug/signals"
              params={{ projectSlug: project.slug }}
              className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0 hover:bg-secondary"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <Text.H6>{signal.label}</Text.H6>
                <Text.H6 color="foregroundMuted">{signal.detail}</Text.H6>
              </div>
              <Status label={signal.variant === "destructive" ? "Escalating" : "Open"} variant={signal.variant} />
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="project-areas">
        <Text.H5M asChild>
          <h2 id="project-areas">Project areas</h2>
        </Text.H5M>
        <div className="flex flex-wrap overflow-hidden rounded-lg border bg-background">
          {PROJECT_AREAS.map((area) => (
            <ProjectAreaLink key={area.label} {...area} projectSlug={project.slug} />
          ))}
        </div>
      </section>
    </div>
  )
}
