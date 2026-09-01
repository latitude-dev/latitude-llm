import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Status, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import {
  BellRingIcon,
  DatabaseIcon,
  MessagesSquareIcon,
  ShieldAlertIcon,
  UsersRoundIcon,
  WrenchIcon,
} from "lucide-react"
import { useRouteProject } from "../-route-data.ts"

type SummaryMetric = {
  readonly label: string
  readonly value: string
  readonly context: string
}

type SectionPulse = {
  readonly label: string
  readonly value: string
  readonly context: string
  readonly to: string
  readonly icon: typeof MessagesSquareIcon
  readonly status: {
    readonly label: string
    readonly variant: "success" | "warning" | "destructive"
  }
}

type Escalation = {
  readonly title: string
  readonly detail: string
  readonly owner: string
  readonly to: string
  readonly status: {
    readonly label: string
    readonly variant: "warning" | "destructive"
  }
}

function MetricCard({ metric }: { readonly metric: SummaryMetric }) {
  return (
    <Card shadow="none" className="rounded-lg">
      <CardHeader className="gap-2 p-4">
        <Text.H6 color="foregroundMuted">{metric.label}</Text.H6>
        <Text.H3 className="tabular-nums">{metric.value}</Text.H3>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <Text.H6 color="foregroundMuted">{metric.context}</Text.H6>
      </CardContent>
    </Card>
  )
}

function SectionPulseRow({ item }: { readonly item: SectionPulse }) {
  return (
    <Link
      to={item.to}
      className="flex flex-col gap-3 rounded-lg border border-border px-4 py-4 transition-colors hover:bg-muted/40 md:flex-row md:items-start md:justify-between"
    >
      <div className="flex min-w-0 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <item.icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text.H5M>{item.label}</Text.H5M>
            <Status variant={item.status.variant} label={item.status.label} />
          </div>
          <Text.H4 className="tabular-nums">{item.value}</Text.H4>
          <Text.H6 color="foregroundMuted">{item.context}</Text.H6>
        </div>
      </div>
      <Text.H6 color="foregroundMuted" className="shrink-0">
        Open
      </Text.H6>
    </Link>
  )
}

function EscalationRow({ item }: { readonly item: Escalation }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Status variant={item.status.variant} label={item.status.label} />
          <Text.H5M>{item.title}</Text.H5M>
        </div>
        <Text.H6 color="foregroundMuted">{item.detail}</Text.H6>
        <Text.H6 color="foregroundMuted">Owner: {item.owner}</Text.H6>
      </div>
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link to={item.to}>Review</Link>
      </Button>
    </div>
  )
}

export function ProjectHomePage({ projectSlug }: { readonly projectSlug: string }) {
  const project = useRouteProject()

  const metrics: readonly SummaryMetric[] = [
    { label: "Sessions reviewed", value: "18.4k", context: "Up 12% week over week across support and QA flows." },
    { label: "Active users", value: "2,940", context: "Most activity is coming from onboarding and retrieval paths." },
    { label: "Tool success rate", value: "97.8%", context: "Calendar and search tools are carrying the busiest flows." },
    { label: "Dataset freshness", value: "5 sources", context: "Last sync completed 18 minutes ago without failures." },
  ]

  const sectionPulse: readonly SectionPulse[] = [
    {
      label: "Sessions",
      value: "92% healthy",
      context: "Median session duration is 4m 18s and error-heavy sessions are trending down.",
      to: `/projects/${projectSlug}/sessions`,
      icon: MessagesSquareIcon,
      status: { label: "Healthy", variant: "success" },
    },
    {
      label: "Users",
      value: "146 flagged",
      context: "Most flagged users hit the same retry loop during account linking.",
      to: `/projects/${projectSlug}/users`,
      icon: UsersRoundIcon,
      status: { label: "Watch", variant: "warning" },
    },
    {
      label: "Tools",
      value: "6 live tools",
      context: "Two tools are spiking in latency after yesterday's prompt change.",
      to: `/projects/${projectSlug}/tools`,
      icon: WrenchIcon,
      status: { label: "Needs review", variant: "warning" },
    },
    {
      label: "Signals",
      value: "14 active",
      context: "Three regression signals are stable enough to keep in the weekly review.",
      to: `/projects/${projectSlug}/signals`,
      icon: ShieldAlertIcon,
      status: { label: "Stable", variant: "success" },
    },
    {
      label: "Monitors",
      value: "2 escalated",
      context: "A latency monitor and a zero-result monitor both need follow-up today.",
      to: `/projects/${projectSlug}/monitors`,
      icon: BellRingIcon,
      status: { label: "Escalated", variant: "destructive" },
    },
    {
      label: "Datasets",
      value: "1 import queued",
      context: "The product feedback dataset is waiting for its schema mapping review.",
      to: `/projects/${projectSlug}/datasets`,
      icon: DatabaseIcon,
      status: { label: "Queued", variant: "warning" },
    },
  ]

  const escalations: readonly Escalation[] = [
    {
      title: "Support chat latency has crossed the 2.5s threshold",
      detail: "This started in the last two hours and is concentrated in sessions that call both search and rerank.",
      owner: "Runtime team",
      to: `/projects/${projectSlug}/monitors`,
      status: { label: "Escalation", variant: "destructive" },
    },
    {
      title: "Tool retry loop is inflating user issue counts",
      detail: "The same failure path is creating duplicate retries and showing up across 38 affected users.",
      owner: "Agent platform",
      to: `/projects/${projectSlug}/tools`,
      status: { label: "Needs review", variant: "warning" },
    },
    {
      title: "Knowledge base import is waiting on schema approval",
      detail: "The import is safe to resume once the `customer_tier` and `region` fields are mapped.",
      owner: "Data ops",
      to: `/projects/${projectSlug}/datasets`,
      status: { label: "Blocked", variant: "warning" },
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-background p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Text.H2>Welcome to {project.name}</Text.H2>
          <Badge variant="outlineMuted">Sample data</Badge>
        </div>
        <Text.H5 color="foregroundMuted">
          Here&apos;s a quick project pulse across sessions, users, tools, signals, monitors, and datasets.
        </Text.H5>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/projects/$projectSlug/sessions" params={{ projectSlug }}>
              Open sessions
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/projects/$projectSlug/monitors" params={{ projectSlug }}>
              Review escalations
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <Card shadow="none" className="rounded-xl">
          <CardHeader className="gap-1 p-5">
            <CardTitle className="text-base">Section summary</CardTitle>
            <Text.H6 color="foregroundMuted">
              A quick read on how each part of the project is trending right now.
            </Text.H6>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-5 pb-5 pt-0">
            {sectionPulse.map((item) => (
              <SectionPulseRow key={item.label} item={item} />
            ))}
          </CardContent>
        </Card>

        <Card shadow="none" className="rounded-xl">
          <CardHeader className="gap-1 p-5">
            <CardTitle className="text-base">Issues and escalations</CardTitle>
            <Text.H6 color="foregroundMuted">
              The main items worth attention before the next release check-in.
            </Text.H6>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-5 pb-5 pt-0">
            {escalations.map((item) => (
              <EscalationRow key={item.title} item={item} />
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
