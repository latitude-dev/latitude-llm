import { buildSignalsExportFilename, type ExportSelection } from "@domain/exports"
import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import {
  listSignalsUseCase,
  type SignalAssigneeFilter,
  type SignalsLifecycleGroup,
  type SignalsSortDirection,
  type SignalsSortField,
} from "./list-signals.ts"

const ISSUES_EXPORT_BATCH_SIZE = 100

export interface BuildSignalsExportInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly selection?: ExportSelection
  readonly lifecycleGroup?: SignalsLifecycleGroup
  readonly assigneeIds?: readonly SignalAssigneeFilter[]
  readonly searchQuery?: string
  readonly timeRange?: {
    readonly from?: Date
    readonly to?: Date
  }
  readonly sort?: {
    readonly field: SignalsSortField
    readonly direction: SignalsSortDirection
  }
  readonly now?: Date
}

export interface BuildSignalsExportResult {
  readonly csv: string
  readonly filename: string
  readonly exportName: string
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

export const buildSignalsExportUseCase = Effect.fn("issues.buildSignalsExport")(function* (
  input: BuildSignalsExportInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const selectionIds =
    input.selection?.mode === "all" || input.selection === undefined ? null : new Set(input.selection.rowIds)
  const remainingSelectedIds = input.selection?.mode === "selected" ? new Set(input.selection.rowIds) : null
  const csvRows: string[][] = [
    ["id", "name", "description", "createdAt", "updatedAt", "escalatedAt", "resolvedAt", "ignoredAt"],
  ]

  let offset = 0
  while (true) {
    const page = yield* listSignalsUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      limit: ISSUES_EXPORT_BATCH_SIZE,
      offset,
      ...(input.lifecycleGroup ? { lifecycleGroup: input.lifecycleGroup } : {}),
      ...(input.assigneeIds?.length ? { assigneeIds: [...input.assigneeIds] } : {}),
      ...(input.searchQuery ? { textSearchQuery: input.searchQuery } : {}),
      ...(input.timeRange ? { timeRange: input.timeRange } : {}),
      ...(input.sort ? { sort: input.sort } : {}),
      ...(input.now ? { now: input.now } : {}),
    })

    if (page.items.length === 0) break

    for (const issue of page.items) {
      if (input.selection?.mode === "selected" && !selectionIds?.has(issue.id)) {
        continue
      }

      if (input.selection?.mode === "allExcept" && selectionIds?.has(issue.id)) {
        continue
      }

      csvRows.push([
        issue.id,
        escapeCsvField(issue.name),
        escapeCsvField(issue.description),
        issue.createdAt.toISOString(),
        issue.updatedAt.toISOString(),
        issue.escalatedAt?.toISOString() ?? "",
        issue.resolvedAt?.toISOString() ?? "",
        issue.ignoredAt?.toISOString() ?? "",
      ])

      remainingSelectedIds?.delete(issue.id)
    }

    if (remainingSelectedIds && remainingSelectedIds.size === 0) break
    if (!page.hasMore) break
    offset += page.limit
  }

  return {
    csv: csvRows.map((row) => row.join(",")).join("\n"),
    filename: buildSignalsExportFilename("project_issues"),
    exportName: "Project Signals",
  } satisfies BuildSignalsExportResult
})
