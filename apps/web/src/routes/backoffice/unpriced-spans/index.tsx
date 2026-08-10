import {
  Alert,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Text,
} from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import {
  type AdminUnpricedPairDto,
  type AdminUnpricedProjectRefDto,
  adminListUnpricedSpans,
} from "../../../domains/admin/unpriced-spans.functions.ts"
import { UnpricedStateBadge } from "./-components/state-badge.tsx"

export const Route = createFileRoute("/backoffice/unpriced-spans/")({
  component: BackofficeUnpricedSpansPage,
})

/** Enough projects to show the shape of the blast radius; the rest expand on click. */
const COLLAPSED_PROJECTS = 3

function ProjectLink({ project }: { project: AdminUnpricedProjectRefDto }) {
  const label = project.projectName ?? project.projectId
  const org = project.organizationName ?? project.organizationId

  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <Link
        to="/backoffice/organizations/$organizationId"
        params={{ organizationId: project.organizationId }}
        className="hover:underline"
      >
        <Text.H6 color="foregroundMuted" noWrap>
          {org}
        </Text.H6>
      </Link>
      <Text.H6 color="foregroundMuted">/</Text.H6>
      <Text.H6 ellipsis noWrap>
        {label}
      </Text.H6>
      <Text.H6 color="foregroundMuted" noWrap>
        <span className="tabular-nums">{formatCount(project.tokens)} tok</span>
      </Text.H6>
    </div>
  )
}

function ProjectList({ projects }: { projects: AdminUnpricedProjectRefDto[] }) {
  const [expanded, setExpanded] = useState(false)
  const hidden = projects.length - COLLAPSED_PROJECTS
  const shown = expanded ? projects : projects.slice(0, COLLAPSED_PROJECTS)

  return (
    <div className="flex flex-col gap-0.5">
      {shown.map((project) => (
        <ProjectLink key={`${project.organizationId}:${project.projectId}`} project={project} />
      ))}
      {hidden > 0 ? (
        <button type="button" className="w-fit" onClick={() => setExpanded((value) => !value)}>
          <Text.H6 color="accentForeground">{expanded ? "Show fewer" : `+${hidden} more`}</Text.H6>
        </button>
      ) : null}
    </div>
  )
}

function PairRow({ pair }: { pair: AdminUnpricedPairDto }) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex min-w-0 flex-col leading-tight">
          <Text.H5 weight="medium" ellipsis noWrap>
            {pair.model}
          </Text.H5>
          <Text.H6 color="foregroundMuted" ellipsis noWrap>
            {pair.provider}
          </Text.H6>
        </div>
      </TableCell>
      <TableCell>
        <UnpricedStateBadge pair={pair} />
      </TableCell>
      <TableCell align="right">
        <Text.H5 weight="medium" noWrap>
          <span className="tabular-nums">{formatCount(pair.tokens)}</span>
        </Text.H5>
      </TableCell>
      <TableCell align="right">
        <Text.H6 noWrap>
          <span className="tabular-nums">{formatCount(pair.spans)}</span>
        </Text.H6>
      </TableCell>
      <TableCell>
        <ProjectList projects={pair.projects} />
      </TableCell>
      <TableCell align="right">
        <Text.H6 color="foregroundMuted" noWrap>
          {relativeTime(new Date(pair.lastOccurrenceAt))}
        </Text.H6>
      </TableCell>
    </TableRow>
  )
}

function BackofficeUnpricedSpansPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["backoffice", "unpriced-spans"],
    queryFn: () => adminListUnpricedSpans({ data: {} }),
  })

  const pairs = data?.pairs ?? []
  const actionable = pairs.filter((pair) => pair.state === "active" || pair.state === "regressed")

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <Text.H3 weight="semibold">Unpriced spans</Text.H3>
        <Text.H6 color="foregroundMuted">
          Provider/model pairs ingested with token usage that no pricing matched, deduplicated across organizations —
          one catalog entry or alias fixes every project at once. Billable operations only, over the last{" "}
          {data?.windowDays ?? 30} days. Record a decision in{" "}
          <code>packages/domain/admin/src/unpriced-spans/unpriced-triage.ts</code>.
        </Text.H6>
      </div>

      {data && actionable.length === 0 && pairs.length > 0 ? (
        <Alert variant="success" description="Nothing needs pricing right now — every pair is resolved or parked." />
      ) : null}

      {/* A failed load must not render the empty state: "nothing is unpriced" and "we could not
          find out" are the same picture, and this page exists to stop a zero being read as a fact. */}
      {isError ? (
        <Alert
          variant="destructive"
          description="Could not load unpriced spans, so this is not a statement that there are none. Reload, and check the server logs if it persists."
        />
      ) : isLoading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : pairs.length === 0 ? (
        <Alert
          variant="default"
          description="No unpriced spans in the window. Note this view starts at the cost_source cutover (2026-07-30), so it has no history before then."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model / provider</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Spans</TableHead>
              <TableHead>Affected projects</TableHead>
              <TableHead className="text-right">Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pairs.map((pair) => (
              <PairRow key={`${pair.provider}:${pair.model}`} pair={pair} />
            ))}
          </TableBody>
        </Table>
      )}

      {data && data.staleTriage.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Text.H5 weight="semibold">Stale decisions</Text.H5>
          <Text.H6 color="foregroundMuted">
            Recorded in <code>unpriced-triage.ts</code> but matching nothing in the window. A <code>fixed</code> entry
            here no longer guards anything; prune it or widen the window.
          </Text.H6>
          <div className="flex flex-wrap gap-1.5">
            {data.staleTriage.map((entry) => (
              <Badge key={`${entry.provider}:${entry.model}`} variant="outlineMuted">
                {entry.provider}/{entry.model}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
