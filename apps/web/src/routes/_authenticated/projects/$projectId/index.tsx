import {
  Button,
  Checkbox,
  Container,
  Icon,
  Input,
  Label,
  Table,
  TableBlankSlate,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  TableWithHeader,
  Text,
} from "@repo/ui"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { SlidersHorizontal, X } from "lucide-react"
import { useDeferredValue, useState } from "react"
import { z } from "zod"
import { useTracesCollection } from "../../../../domains/spans/spans.collection.ts"

const tracesSearchSchema = z.object({
  traceId: z.string().optional(),
  status: z.string().optional(),
  startTimeFrom: z.string().optional(),
  startTimeTo: z.string().optional(),
})

type TracesSearch = z.infer<typeof tracesSearchSchema>

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  component: TracesPage,
  validateSearch: tracesSearchSchema,
})

const STATUS_OPTIONS = [
  { value: "ok", label: "OK" },
  { value: "error", label: "Error" },
  { value: "unset", label: "Unset" },
] as const

function StatusBadge({ status }: { status: string }) {
  const color = status === "error" ? "destructive" : "foregroundMuted"
  return <Text.H5 color={color}>{status.toUpperCase()}</Text.H5>
}

function hasActiveFilters(search: TracesSearch): boolean {
  return !!(search.traceId || search.status || search.startTimeFrom || search.startTimeTo)
}

function FiltersSidebar({
  search,
  onUpdate,
}: {
  search: TracesSearch
  onUpdate: (patch: Partial<TracesSearch>) => void
}) {
  const [localTraceId, setLocalTraceId] = useState(search.traceId ?? "")

  return (
    <aside className="w-[280px] shrink-0 border-r border-border flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Icon icon={SlidersHorizontal} size="sm" color="foregroundMuted" />
          <Text.H5 weight="bold">Filters</Text.H5>
        </div>
        {hasActiveFilters(search) && (
          <Button
            variant="ghost"
            size="sm"
            flat
            onClick={() =>
              onUpdate({ traceId: undefined, status: undefined, startTimeFrom: undefined, startTimeTo: undefined })
            }
          >
            <Text.H6 color="foregroundMuted">Clear all</Text.H6>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-6 p-4">
        {/* Trace ID */}
        <div className="flex flex-col gap-2">
          <Label>
            <Text.H6 weight="medium" color="foregroundMuted">
              Trace ID
            </Text.H6>
          </Label>
          <div className="flex flex-row gap-2">
            <Input
              placeholder="Search by trace ID..."
              value={localTraceId}
              onChange={(e) => setLocalTraceId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onUpdate({ traceId: localTraceId || undefined })
                }
              }}
              onBlur={() => onUpdate({ traceId: localTraceId || undefined })}
              size="sm"
            />
            {localTraceId && (
              <Button
                variant="ghost"
                size="icon"
                flat
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  setLocalTraceId("")
                  onUpdate({ traceId: undefined })
                }}
              >
                <Icon icon={X} size="sm" color="foregroundMuted" />
              </Button>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col gap-2">
          <Label>
            <Text.H6 weight="medium" color="foregroundMuted">
              Status
            </Text.H6>
          </Label>
          <div className="flex flex-col gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="flex items-center gap-2 px-1 py-1.5 rounded-md hover:bg-muted cursor-pointer text-left"
                onClick={() => onUpdate({ status: search.status === opt.value ? undefined : opt.value })}
              >
                <Checkbox
                  checked={search.status === opt.value}
                  onCheckedChange={(checked) => {
                    onUpdate({ status: checked ? opt.value : undefined })
                  }}
                />
                <Text.H5 color={search.status === opt.value ? "foreground" : "foregroundMuted"}>{opt.label}</Text.H5>
              </button>
            ))}
          </div>
        </div>

        {/* Time range */}
        <div className="flex flex-col gap-2">
          <Label>
            <Text.H6 weight="medium" color="foregroundMuted">
              Time range
            </Text.H6>
          </Label>
          <div className="flex flex-col gap-2">
            <Input
              type="datetime-local"
              value={search.startTimeFrom ? toLocalDatetime(search.startTimeFrom) : ""}
              onChange={(e) =>
                onUpdate({ startTimeFrom: e.target.value ? new Date(e.target.value).toISOString() : undefined })
              }
              size="sm"
            />
            <Text.H6 color="foregroundMuted" className="text-center">
              to
            </Text.H6>
            <Input
              type="datetime-local"
              value={search.startTimeTo ? toLocalDatetime(search.startTimeTo) : ""}
              onChange={(e) =>
                onUpdate({ startTimeTo: e.target.value ? new Date(e.target.value).toISOString() : undefined })
              }
              size="sm"
            />
          </div>
        </div>
      </div>
    </aside>
  )
}

function toLocalDatetime(iso: string): string {
  const d = new Date(iso)
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

function TracesPage() {
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const deferredSearch = useDeferredValue(search)
  const filter = {
    ...(deferredSearch.traceId ? { traceId: deferredSearch.traceId } : {}),
    ...(deferredSearch.status ? { status: deferredSearch.status } : {}),
    ...(deferredSearch.startTimeFrom ? { startTimeFrom: deferredSearch.startTimeFrom } : {}),
    ...(deferredSearch.startTimeTo ? { startTimeTo: deferredSearch.startTimeTo } : {}),
  }
  const { data: traces } = useTracesCollection({ projectId, filter })

  const updateSearch = (patch: Partial<TracesSearch>) => {
    navigate({
      to: ".",
      search: (prev: TracesSearch) => {
        const next = { ...prev, ...patch }
        return Object.fromEntries(Object.entries(next).filter(([_, v]) => v !== undefined))
      },
      replace: true,
    })
  }

  const activeFilterCount = [search.traceId, search.status, search.startTimeFrom || search.startTimeTo].filter(
    Boolean,
  ).length

  return (
    <div className="flex h-full">
      {sidebarOpen && <FiltersSidebar search={search} onUpdate={updateSearch} />}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <Container className="py-8">
          <TableWithHeader
            title="Traces"
            actions={
              <Button variant={sidebarOpen ? "outline" : "ghost"} size="sm" onClick={() => setSidebarOpen((v) => !v)}>
                <Icon icon={SlidersHorizontal} size="sm" />
                <Text.H5>Filters</Text.H5>
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-accent px-1.5 text-xs text-accent-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            }
            table={
              !traces ? (
                <TableSkeleton cols={8} rows={5} />
              ) : traces.length === 0 ? (
                <TableBlankSlate description="No traces found for this project." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Spans</TableHead>
                      <TableHead>Models</TableHead>
                      <TableHead>Tokens (in/out)</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Start Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {traces.map((trace) => (
                      <TableRow key={trace.traceId}>
                        <TableCell>
                          <Link
                            to="/projects/$projectId/traces/$traceId/spans"
                            params={{ projectId, traceId: trace.traceId }}
                            className="underline"
                          >
                            <Text.H5>{trace.rootSpanName || trace.traceId.slice(0, 8)}</Text.H5>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={trace.status} />
                        </TableCell>
                        <TableCell>
                          <Text.H5>
                            {formatCount(trace.spanCount)}
                            {trace.errorCount > 0 && <Text.H6 color="destructive"> ({trace.errorCount} err)</Text.H6>}
                          </Text.H5>
                        </TableCell>
                        <TableCell>
                          <Text.H5>{trace.models.join(", ") || "\u2014"}</Text.H5>
                        </TableCell>
                        <TableCell>
                          <Text.H5>
                            {formatCount(trace.tokensInput)} / {formatCount(trace.tokensOutput)}
                          </Text.H5>
                        </TableCell>
                        <TableCell>
                          <Text.H5>{formatPrice(trace.costTotalMicrocents / 100_000_000)}</Text.H5>
                        </TableCell>
                        <TableCell>
                          <Text.H5>{formatDuration(trace.durationNs)}</Text.H5>
                        </TableCell>
                        <TableCell>
                          <Text.H5 color="foregroundMuted">{new Date(trace.startTime).toLocaleString()}</Text.H5>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            }
          />
        </Container>
      </div>
    </div>
  )
}
