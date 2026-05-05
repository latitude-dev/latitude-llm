import { buildIssuesExportFilename, type ExportSelection } from "@domain/exports"
import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import {
  type IssuesLifecycleGroup,
  type IssuesSortDirection,
  type IssuesSortField,
  listIssuesUseCase,
} from "./list-issues.ts"

const ISSUES_EXPORT_BATCH_SIZE = 100

export interface BuildIssuesExportInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly selection?: ExportSelection
  readonly lifecycleGroup?: IssuesLifecycleGroup
  readonly search?: {
    readonly query: string
    readonly normalizedEmbedding: number[]
  }
  readonly timeRange?: {
    readonly from?: Date
    readonly to?: Date
  }
  readonly sort?: {
    readonly field: IssuesSortField
    readonly direction: IssuesSortDirection
  }
  readonly now?: Date
}

export interface BuildIssuesExportResult {
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

export const buildIssuesExportUseCase = Effect.fn("issues.buildIssuesExport")(function* (
  input: BuildIssuesExportInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const selectionIds =
    input.selection?.mode === "all" || input.selection === undefined ? null : new Set(input.selection.rowIds)
  const remainingSelectedIds = input.selection?.mode === "selected" ? new Set(input.selection.rowIds) : null
  const csvRows: string[][] = [
    ["id", "uuid", "name", "description", "createdAt", "updatedAt", "escalatedAt", "resolvedAt", "ignoredAt"],
  ]

  let offset = 0
  while (true) {
    const page = yield* listIssuesUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      limit: ISSUES_EXPORT_BATCH_SIZE,
      offset,
      ...(input.lifecycleGroup ? { lifecycleGroup: input.lifecycleGroup } : {}),
      ...(input.search ? { search: input.search } : {}),
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
        issue.uuid,
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
    filename: buildIssuesExportFilename("project_issues"),
    exportName: "Project Issues",
  } satisfies BuildIssuesExportResult
})
