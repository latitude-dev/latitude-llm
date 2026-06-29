import { Text } from "@repo/ui"
import {
  useCreateAnnotation,
  useUpdateAnnotation,
} from "../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { useScoresByTrace } from "../../../../../../domains/scores/scores.collection.ts"
import type { ScoreRecord } from "../../../../../../domains/scores/scores.functions.ts"
import { ScoreList } from "./score-list.tsx"

export function TraceScoresList({
  projectId,
  traceId,
  selectedScoreId,
  onScoreClick,
  hideIntro = false,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly selectedScoreId?: string | undefined
  readonly onScoreClick?: ((score: ScoreRecord) => void) | undefined
  readonly hideIntro?: boolean | undefined
}) {
  const {
    data: scoresData,
    isLoading,
    isError,
  } = useScoresByTrace({
    projectId,
    traceId,
    draftMode: "include",
  })
  const createMutation = useCreateAnnotation()
  const updateMutation = useUpdateAnnotation()

  return (
    <ScoreList
      projectId={projectId}
      scores={scoresData?.items ?? []}
      isLoading={isLoading}
      isError={isError}
      intro={
        hideIntro ? undefined : (
          <div className="flex flex-col">
            <Text.H5M>Scores</Text.H5M>
            <Text.H5 color="foregroundMuted">
              Evaluations, annotations, and custom scores attached to this trace
            </Text.H5>
          </div>
        )
      }
      createPending={createMutation.isPending}
      onCreate={(data) =>
        createMutation.mutate({
          projectId,
          traceId,
          value: data.passed ? 1 : 0,
          passed: data.passed,
          feedback: data.comment.trim(),
          ...(data.signalId ? { signalId: data.signalId } : {}),
        })
      }
      updatePending={updateMutation.isPending}
      onUpdate={(annotation: AnnotationRecord, data) =>
        updateMutation.mutate({
          scoreId: annotation.id,
          projectId,
          traceId,
          value: data.passed ? 1 : 0,
          passed: data.passed,
          feedback: data.comment.trim(),
          signalId: data.signalId ?? undefined,
        })
      }
      {...(onScoreClick ? { onScoreClick } : {})}
      {...(selectedScoreId !== undefined ? { selectedScoreId } : {})}
    />
  )
}
