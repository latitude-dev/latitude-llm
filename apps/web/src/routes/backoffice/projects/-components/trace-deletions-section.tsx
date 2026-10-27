import { Badge, Text } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import type { AdminTraceDeletionDto } from "../../../../domains/admin/trace-deletions.functions.ts"
import { DashboardSection } from "../../-components/dashboard/index.ts"

const STATUS_VARIANT: Record<
  AdminTraceDeletionDto["status"],
  "outlineAccent" | "outlineWarningMuted" | "outlineSuccessMuted" | "outlineDestructiveMuted"
> = {
  pending: "outlineWarningMuted",
  running: "outlineAccent",
  completed: "outlineSuccessMuted",
  failed: "outlineDestructiveMuted",
}

const describeFilters = (filters: AdminTraceDeletionDto["filters"]) =>
  Object.entries(filters)
    .flatMap(([field, conditions]) =>
      conditions.map((condition) => `${field} ${condition.op} ${JSON.stringify(condition.value)}`),
    )
    .join(" · ")

interface TraceDeletionsSectionProps {
  readonly deletions: readonly AdminTraceDeletionDto[]
}

export function TraceDeletionsSection({ deletions }: TraceDeletionsSectionProps) {
  return (
    <DashboardSection title="Trace deletions">
      {deletions.length === 0 ? (
        <Text.H6 color="foregroundMuted">No traces have been deleted from this project.</Text.H6>
      ) : (
        <div className="flex flex-col gap-1.5">
          {deletions.map((deletion) => {
            const deletedRows = Object.values(deletion.deletedRowCounts).reduce((total, rows) => total + rows, 0)
            return (
              <div
                key={deletion.id}
                className="flex flex-col gap-1 rounded-md border border-border/60 bg-background px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[deletion.status]}>{deletion.status}</Badge>
                  <Text.H6 ellipsis noWrap>
                    {describeFilters(deletion.filters)}
                  </Text.H6>
                </div>
                <Text.H6 color="foregroundMuted">
                  {formatCount(deletion.matchedTraceCount)} traces · {formatCount(deletedRows)} records · requested by{" "}
                  {deletion.requestedBy.type} {relativeTime(deletion.createdAt)}
                  {deletion.includeDatasetRows ? " · including dataset rows" : ""}
                  {deletion.error ? ` · ${deletion.error}` : ""}
                </Text.H6>
                {deletedRows > 0 ? (
                  <Text.H6 color="foregroundMuted">
                    {Object.entries(deletion.deletedRowCounts)
                      .filter(([, rows]) => rows > 0)
                      .map(([store, rows]) => `${store}: ${formatCount(rows)}`)
                      .join(", ")}
                  </Text.H6>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </DashboardSection>
  )
}
