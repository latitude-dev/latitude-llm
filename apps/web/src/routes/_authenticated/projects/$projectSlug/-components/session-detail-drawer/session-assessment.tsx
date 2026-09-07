import { Skeleton, Text } from "@repo/ui"
import { useSessionAssessment } from "../../../../../../domains/session-assessments/session-assessments.collection.ts"

export function SessionAssessmentSection({
  projectId,
  sessionId,
}: {
  readonly projectId: string
  readonly sessionId: string
}) {
  const assessment = useSessionAssessment({ projectId, sessionId })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Text.H4M>Session assessment</Text.H4M>
        <Text.H6 color="foregroundMuted">
          What helped or hurt this session across the five Agent Score dimensions.
        </Text.H6>
      </div>
      {assessment.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : assessment.isError ? (
        <Text.H6 color="foregroundMuted">Could not load the session assessment.</Text.H6>
      ) : (
        <Text.H6 color="foregroundMuted">
          {assessment.data?.items.length ?? 0} evidence {assessment.data?.items.length === 1 ? "item" : "items"} found.
        </Text.H6>
      )}
    </div>
  )
}
