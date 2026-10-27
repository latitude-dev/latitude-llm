import { Badge, Button, Icon, Text } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { DownloadIcon } from "lucide-react"
import {
  listTraceDeletions,
  type TraceDeletionRecord,
} from "../../../../../domains/trace-deletions/trace-deletions.functions.ts"
import { useRouteProject } from "../-route-data.ts"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/data-deletion")({
  component: DataDeletionSettingsPage,
})

const STATUS_VARIANT: Record<
  TraceDeletionRecord["status"],
  "outlineAccent" | "outlineWarningMuted" | "outlineSuccessMuted" | "outlineDestructiveMuted"
> = {
  pending: "outlineWarningMuted",
  running: "outlineAccent",
  completed: "outlineSuccessMuted",
  failed: "outlineDestructiveMuted",
}

const REQUESTER_LABEL: Record<TraceDeletionRecord["requestedBy"]["type"], string> = {
  user: "a member",
  api_key: "an API key",
  staff: "Latitude support",
}

const describeFilters = (filters: TraceDeletionRecord["filters"]) =>
  Object.entries(filters)
    .filter(([field]) => field !== "startTime")
    .flatMap(([field, conditions]) =>
      conditions.map((condition) =>
        field === "traceId" && condition.op === "in" && Array.isArray(condition.value)
          ? `${condition.value.length} selected traces`
          : `${field} ${condition.op} ${JSON.stringify(condition.value)}`,
      ),
    )
    .join(" · ")

const downloadReceipt = (deletion: TraceDeletionRecord, projectSlug: string) => {
  const receipt = { project: projectSlug, ...deletion }
  const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }))
  const link = document.createElement("a")
  link.href = url
  link.download = `trace-deletion-${deletion.id}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function DataDeletionSettingsPage() {
  const project = useRouteProject()
  const { data: deletions, isLoading } = useQuery({
    queryKey: ["trace-deletions", project.id],
    queryFn: () => listTraceDeletions({ data: { projectId: project.id } }),
    refetchInterval: (query) =>
      query.state.data?.some((deletion) => deletion.status === "pending" || deletion.status === "running")
        ? 5_000
        : false,
  })

  return (
    <SettingsPage title="Data deletion" description="Permanently deleted traces and the receipts that prove it">
      <div className="flex w-full flex-col gap-4">
        <Text.H6 color="foregroundMuted">
          Select traces in the{" "}
          <Link to="/projects/$projectSlug" params={{ projectSlug: project.slug }} className="underline">
            trace list
          </Link>{" "}
          and choose Delete, or use the API, SDKs or CLI. Each deletion removes the traces with their spans, scores,
          annotations and search indexes, and is kept here as evidence of erasure.
        </Text.H6>
        {isLoading ? (
          <Text.H6 color="foregroundMuted">Loading…</Text.H6>
        ) : !deletions || deletions.length === 0 ? (
          <Text.H6 color="foregroundMuted">No traces have been deleted from this project.</Text.H6>
        ) : (
          <div className="flex flex-col gap-2">
            {deletions.map((deletion) => (
              <div key={deletion.id} className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[deletion.status]}>{deletion.status}</Badge>
                  <Text.H5 ellipsis noWrap>
                    {describeFilters(deletion.filters) || "All traces"}
                  </Text.H5>
                </div>
                <Text.H6 color="foregroundMuted">
                  {formatCount(deletion.matchedTraceCount)} traces · {formatCount(deletion.deletedRecordCount)} records
                  · requested by {REQUESTER_LABEL[deletion.requestedBy.type]} {relativeTime(deletion.createdAt)}
                  {deletion.completedAt ? ` · finished ${relativeTime(deletion.completedAt)}` : ""}
                </Text.H6>
                {deletion.error ? <Text.H6 color="destructive">{deletion.error}</Text.H6> : null}
                <div className="flex items-center justify-between gap-2">
                  <Text.H6 color="foregroundMuted">Receipt {deletion.id}</Text.H6>
                  {deletion.status === "completed" || deletion.status === "failed" ? (
                    <Button variant="ghost" size="sm" onClick={() => downloadReceipt(deletion, project.slug)}>
                      <Icon icon={DownloadIcon} size="sm" />
                      Download receipt
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingsPage>
  )
}
