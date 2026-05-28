import { Text } from "@repo/ui"
import {
  useAnnotationsByTrace,
  useCreateAnnotation,
  useUpdateAnnotation,
} from "../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { AnnotationList } from "./annotation-list.tsx"

export function TraceAnnotationsList({
  projectId,
  traceId,
  selectedAnnotationId,
  onAnnotationClick,
  hideAnnotationIntro = false,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly selectedAnnotationId?: string | undefined
  readonly onAnnotationClick?: ((annotation: AnnotationRecord) => void) | undefined
  readonly hideAnnotationIntro?: boolean | undefined
}) {
  const {
    data: annotationsData,
    isLoading: annotationsLoading,
    isError: annotationsError,
  } = useAnnotationsByTrace({
    projectId,
    traceId,
    draftMode: "include",
  })
  const createMutation = useCreateAnnotation()
  const updateMutation = useUpdateAnnotation()

  return (
    <AnnotationList
      projectId={projectId}
      annotations={annotationsData?.items ?? []}
      isLoading={annotationsLoading}
      isError={annotationsError}
      intro={
        hideAnnotationIntro ? undefined : (
          <div className="flex flex-col">
            <Text.H5M>Annotations</Text.H5M>
            <Text.H5 color="foregroundMuted">
              Select text, a message or annotate the entire conversation in this section
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
          ...(data.issueId ? { issueId: data.issueId } : {}),
        })
      }
      updatePending={updateMutation.isPending}
      onUpdate={(annotation, data) =>
        updateMutation.mutate({
          scoreId: annotation.id,
          projectId,
          traceId,
          value: data.passed ? 1 : 0,
          passed: data.passed,
          feedback: data.comment.trim(),
          issueId: data.issueId ?? undefined,
        })
      }
      {...(onAnnotationClick ? { onAnnotationClick } : {})}
      {...(selectedAnnotationId !== undefined ? { selectedAnnotationId } : {})}
    />
  )
}
