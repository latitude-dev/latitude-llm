import { Modal, Status, Text } from "@repo/ui"
import type { EvaluationSummaryRecord } from "../../../../../../domains/evaluations/evaluation-alignment.functions.ts"
import { formatPercent, getAlignmentVariant } from "./issue-formatters.ts"

type AlignmentStat = {
  readonly name: string
  readonly value: number
  readonly description: string
}

// The headline "alignment metric" surfaced on the badge is intentionally listed
// first and flagged so readers can see which individual stat the badge reflects.
const buildStats = (evaluation: EvaluationSummaryRecord): readonly AlignmentStat[] => {
  const metrics = evaluation.alignment.metrics

  return [
    {
      name: "Balanced accuracy",
      value: metrics.balancedAccuracy,
      description:
        "Unweighted average of recall and specificity. Treats presence and absence detection as equally important regardless of class imbalance. Used as the alignment metric.",
    },
    {
      name: "Accuracy",
      value: metrics.accuracy,
      description: "Share of predictions that match the human annotation, positives and negatives combined.",
    },
    {
      name: "Recall",
      value: metrics.recall,
      description:
        "Of all the traces humans marked as containing the issue, how many the evaluation caught. High recall means few misses. This is the issue presence detection success rate.",
    },
    {
      name: "Specificity",
      value: metrics.specificity,
      description:
        "Of all the traces humans marked as clean, how many the evaluation correctly left alone. High specificity means few false alarms. This is the issue absence detection success rate.",
    },
    {
      name: "Precision",
      value: metrics.precision,
      description:
        "Of all the traces the evaluation flagged as containing the issue, how many humans agreed with. High precision means few false alarms among flagged traces.",
    },
    {
      name: "F1",
      value: metrics.f1,
      description: "Harmonic mean of precision and recall. Ignores true negatives entirely.",
    },
    {
      name: "Matthews Correlation Coefficient (MCC)",
      value: metrics.matthewsCorrelationCoefficient,
      description:
        "Correlation between predictions and annotations across all four confusion-matrix cells, scaled to [-1, 1]. Penalizes class imbalance more aggressively than balanced accuracy.",
    },
  ]
}

function ConfusionMatrixBlock({ evaluation }: { readonly evaluation: EvaluationSummaryRecord }) {
  const confusionMatrix = evaluation.alignment.confusionMatrix

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 py-2">
        <div className="flex items-baseline justify-between gap-4">
          <Text.H5M>Confusion matrix</Text.H5M>
        </div>
        <Text.H6 color="foregroundMuted">
          <b>Actual</b> is the what the human annotated, <b>Predicted</b> is what the evaluation decided. <b>+</b> means
          the issue was present, <b>-</b> means it was absent.
        </Text.H6>
      </div>
      <div className="grid grid-cols-[auto_auto_auto] self-start rounded-md border border-border">
        <div aria-hidden className="border-b border-r border-border px-3 py-1.5" />
        <div className="border-b border-r border-border px-3 py-1.5">
          <Text.H6 color="foregroundMuted">Predicted +</Text.H6>
        </div>
        <div className="border-b border-border px-3 py-1.5">
          <Text.H6 color="foregroundMuted">Predicted -</Text.H6>
        </div>

        <div className="border-b border-r border-border px-3 py-1.5">
          <Text.H6 color="foregroundMuted">Actual +</Text.H6>
        </div>
        <div className="border-b border-r border-border px-3 py-1.5">
          <Text.H6B color="success">{confusionMatrix.truePositives}</Text.H6B>
        </div>
        <div className="border-b border-border px-3 py-1.5">
          <Text.H6B color="destructive">{confusionMatrix.falseNegatives}</Text.H6B>
        </div>

        <div className="border-r border-border px-3 py-1.5">
          <Text.H6 color="foregroundMuted">Actual -</Text.H6>
        </div>
        <div className="border-r border-border px-3 py-1.5">
          <Text.H6B color="destructive">{confusionMatrix.falsePositives}</Text.H6B>
        </div>
        <div className="px-3 py-1.5">
          <Text.H6B color="success">{confusionMatrix.trueNegatives}</Text.H6B>
        </div>
      </div>
    </div>
  )
}

function StatRow({ stat }: { readonly stat: AlignmentStat }) {
  return (
    <div className="flex flex-row items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text.H5M>{stat.name}</Text.H5M>
        <Text.H6 color="foregroundMuted">{stat.description}</Text.H6>
      </div>
      <Status variant={getAlignmentVariant(stat.value)} label={formatPercent(stat.value)} />
    </div>
  )
}

export function AlignmentStatsModal({
  evaluation,
  onClose,
}: {
  readonly evaluation: EvaluationSummaryRecord | null
  readonly onClose: () => void
}) {
  const stats = evaluation === null ? [] : buildStats(evaluation)

  return (
    <Modal.Root open={evaluation !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Modal.Content dismissible size="medium">
        <Modal.Header
          title="Alignment stats"
          description="All metrics derivable from the stored confusion matrix. Balanced accuracy is the main alignment metric used in the system, the rest are exposed here for reference."
        />
        {evaluation !== null ? (
          <Modal.Body>
            <div className="flex flex-col gap-6">
              <ConfusionMatrixBlock evaluation={evaluation} />
              <div className="flex flex-col">
                {stats.map((stat) => (
                  <StatRow key={stat.name} stat={stat} />
                ))}
              </div>
            </div>
          </Modal.Body>
        ) : null}
      </Modal.Content>
    </Modal.Root>
  )
}
