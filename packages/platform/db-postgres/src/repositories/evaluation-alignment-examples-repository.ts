import type {
  EvaluationAlignmentExample,
  EvaluationAlignmentNegativePriority,
  EvaluationAlignmentPositivePriority,
  ListEvaluationAlignmentExamplesInput,
  ListNegativeEvaluationAlignmentExamplesInput,
} from "@domain/evaluations"
import {
  DEFAULT_ALIGNMENT_EXAMPLE_LIMIT,
  EvaluationAlignmentExamplesRepository,
  evaluationAlignmentExampleSchema,
} from "@domain/evaluations"
import { type IssueId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, asc, eq, gt, isNotNull, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { scores } from "../schema/scores.ts"

type AlignmentScoreRow = Pick<
  typeof scores.$inferSelect,
  "id" | "traceId" | "sessionId" | "issueId" | "source" | "passed" | "feedback" | "createdAt"
>

const sortRows = (rows: readonly AlignmentScoreRow[]): readonly AlignmentScoreRow[] =>
  [...rows].sort((left, right) => {
    const createdAtDiff = left.createdAt.getTime() - right.createdAt.getTime()
    if (createdAtDiff !== 0) {
      return createdAtDiff
    }

    return left.id.localeCompare(right.id)
  })

const getExampleSessionId = (rows: readonly AlignmentScoreRow[]): string | null =>
  rows.find((row) => row.sessionId !== null && row.sessionId.length > 0)?.sessionId ?? null

const toExample = (input: {
  readonly rows: readonly AlignmentScoreRow[]
  readonly evidenceRows: readonly AlignmentScoreRow[]
  readonly label: "positive" | "negative"
  readonly positivePriority: EvaluationAlignmentPositivePriority | null
  readonly negativePriority: EvaluationAlignmentNegativePriority | null
}): EvaluationAlignmentExample => {
  const rows = sortRows(input.rows)
  const evidenceRows = sortRows(input.evidenceRows)
  const [firstRow] = rows

  if (!firstRow?.traceId) {
    throw new Error("Alignment example rows must include a traceId")
  }

  const feedbackParts = evidenceRows.filter((row) => row.feedback.length > 0).map((row) => row.feedback)
  const annotationFeedback = feedbackParts.length > 0 ? feedbackParts.join(" | ") : null

  return evaluationAlignmentExampleSchema.parse({
    traceId: firstRow.traceId,
    sessionId: getExampleSessionId(rows),
    scoreIds: evidenceRows.map((row) => row.id),
    label: input.label,
    positivePriority: input.positivePriority,
    negativePriority: input.negativePriority,
    annotationFeedback,
  })
}

const groupRowsByTrace = (rows: readonly AlignmentScoreRow[]): readonly (readonly AlignmentScoreRow[])[] => {
  const groups = new Map<string, AlignmentScoreRow[]>()

  for (const row of rows) {
    if (row.traceId === null) {
      continue
    }

    const group = groups.get(row.traceId)
    if (group) {
      group.push(row)
    } else {
      groups.set(row.traceId, [row])
    }
  }

  return Array.from(groups.values()).map(sortRows)
}

const hasTargetIssueScore = (rows: readonly AlignmentScoreRow[], issueId: IssueId): boolean =>
  rows.some((row) => row.issueId === issueId)

const isPositiveGroup = (rows: readonly AlignmentScoreRow[], issueId: IssueId): boolean =>
  rows.some((row) => row.source === "annotation" && row.issueId === issueId && row.passed === false)

const hasFailedScore = (rows: readonly AlignmentScoreRow[]): boolean => rows.some((row) => row.passed === false)

const hasPassedScore = (rows: readonly AlignmentScoreRow[]): boolean => rows.some((row) => row.passed === true)

const hasPassedAnnotation = (rows: readonly AlignmentScoreRow[]): boolean =>
  rows.some((row) => row.source === "annotation" && row.passed === true)

export const EvaluationAlignmentExamplesRepositoryLive = Layer.effect(
  EvaluationAlignmentExamplesRepository,
  Effect.gen(function* () {
    const loadProjectRows = (input: ListEvaluationAlignmentExamplesInput) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        return yield* sqlClient.query((db, organizationId) =>
          db
            .select({
              id: scores.id,
              traceId: scores.traceId,
              sessionId: scores.sessionId,
              issueId: scores.issueId,
              source: scores.source,
              passed: scores.passed,
              feedback: scores.feedback,
              createdAt: scores.createdAt,
            })
            .from(scores)
            .where(
              and(
                eq(scores.organizationId, organizationId),
                eq(scores.projectId, input.projectId),
                isNull(scores.draftedAt),
                eq(scores.errored, false),
                isNotNull(scores.traceId),
                input.createdAfter ? gt(scores.createdAt, input.createdAfter) : undefined,
              ),
            )
            .orderBy(asc(scores.createdAt), asc(scores.id)),
        )
      })

    return {
      listPositiveExamples: (input: ListEvaluationAlignmentExamplesInput) =>
        loadProjectRows(input).pipe(
          Effect.map((rows) => {
            const candidates = groupRowsByTrace(rows).filter((group) => isPositiveGroup(group, input.issueId))

            const failedAnnotationNoPasses = candidates.filter((group) => !hasPassedScore(group))
            const failedAnnotationWithPasses = candidates.filter((group) => hasPassedScore(group))

            const buildEvidence = (group: readonly AlignmentScoreRow[]) =>
              group.filter(
                (row) => row.source === "annotation" && row.issueId === input.issueId && row.passed === false,
              )

            return [
              ...failedAnnotationNoPasses.map((group) =>
                toExample({
                  rows: group,
                  evidenceRows: buildEvidence(group),
                  label: "positive",
                  positivePriority: "failed-annotation-no-passes",
                  negativePriority: null,
                }),
              ),
              ...failedAnnotationWithPasses.map((group) =>
                toExample({
                  rows: group,
                  evidenceRows: buildEvidence(group),
                  label: "positive",
                  positivePriority: "failed-annotation-with-passes",
                  negativePriority: null,
                }),
              ),
            ].slice(0, input.limit ?? DEFAULT_ALIGNMENT_EXAMPLE_LIMIT)
          }),
        ),

      listNegativeExamples: (input: ListNegativeEvaluationAlignmentExamplesInput) =>
        loadProjectRows(input).pipe(
          Effect.map((rows) => {
            const excludeTraceIds = new Set((input.excludeTraceIds ?? []).map((traceId) => traceId as string))
            const groupedRows = groupRowsByTrace(rows).filter((group) => {
              const traceId = group[0]?.traceId
              return traceId !== undefined && traceId !== null && !excludeTraceIds.has(traceId)
            })

            const candidates = groupedRows.filter(
              (group) => !hasTargetIssueScore(group, input.issueId) && hasPassedAnnotation(group),
            )

            const passedAnnotationNoFailures = candidates.filter((group) => !hasFailedScore(group))
            const passedAnnotationUnrelatedFailures = candidates.filter((group) => hasFailedScore(group))

            const buildEvidence = (group: readonly AlignmentScoreRow[]) =>
              group.filter((row) => row.source === "annotation" && row.passed === true)

            return [
              ...passedAnnotationNoFailures.map((group) =>
                toExample({
                  rows: group,
                  evidenceRows: buildEvidence(group),
                  label: "negative",
                  positivePriority: null,
                  negativePriority: "passed-annotation-no-failures",
                }),
              ),
              ...passedAnnotationUnrelatedFailures.map((group) =>
                toExample({
                  rows: group,
                  evidenceRows: buildEvidence(group),
                  label: "negative",
                  positivePriority: null,
                  negativePriority: "passed-annotation-unrelated-failures",
                }),
              ),
            ].slice(0, input.limit ?? DEFAULT_ALIGNMENT_EXAMPLE_LIMIT)
          }),
        ),
    }
  }),
)
