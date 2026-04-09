import { Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import type {
  EvaluationAlignmentJobStatusRecord,
  EvaluationSummaryRecord,
} from "../../../../../../domains/evaluations/evaluation-alignment.functions.ts"

export function EvaluationAlignmentStatus({
  evaluation,
  jobStatus,
}: {
  readonly evaluation?: EvaluationSummaryRecord | null
  readonly jobStatus?: EvaluationAlignmentJobStatusRecord | null
}) {
  if (jobStatus) {
    switch (jobStatus.status) {
      case "pending":
        return <Text.H6 color="foregroundMuted">Alignment job queued.</Text.H6>
      case "running":
        return <Text.H6 color="foregroundMuted">Alignment job running.</Text.H6>
      case "failed":
        return <Text.H6 color="destructive">{jobStatus.error?.message ?? "Alignment job failed."}</Text.H6>
      case "completed":
        return <Text.H6 color="success">Alignment job completed.</Text.H6>
    }
  }

  if (!evaluation) {
    return <Text.H6 color="foregroundMuted">No linked evaluation yet.</Text.H6>
  }

  const details = [
    evaluation.archivedAt ? "Archived" : "Active",
    `Aligned ${relativeTime(new Date(evaluation.alignedAt))}`,
    `MCC ${evaluation.alignment.metrics.matthewsCorrelationCoefficient.toFixed(2)}`,
  ]

  return <Text.H6 color="foregroundMuted">{details.join(" · ")}</Text.H6>
}
