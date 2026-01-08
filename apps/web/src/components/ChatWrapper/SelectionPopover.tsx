'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useAnnotationBySpan } from '$/hooks/useAnnotationsBySpan'
import {
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  SelectedContext,
  SpanWithDetails,
} from '@latitude-data/constants'
import { AnnotatedTextRange } from '../ChatWrapper'
import { AnnotationPopover } from './AnnotationFormPopover'

type SelectionPopoverProps = {
  selection: { context: SelectedContext; selectedText: string }
  position: { x: number; y: number }
  onClose: () => void
  span: SpanWithDetails
  annotation?: AnnotatedTextRange
  onAnnotate?: (
    result: EvaluationResultV2<EvaluationType.Human, HumanEvaluationMetric>,
  ) => void
}

/**
 * Renders an annotation popover for text selections within a messages list.
 * Fetches available evaluations for the span and displays an annotation form
 * allowing users to create an annotation for the selected text.
 *
 * @param selection - The selected text and its context within the span
 * @param position - The x/y coordinates where the popover should be positioned
 * @param onClose - Callback function to close the popover
 * @param span - The prompt span containing the selected text
 * @param onAnnotate - Optional callback function called when an annotation is created or updated
 * @returns The annotation popover component, or null if no evaluation is available for the span
 */
export function SelectionPopover({
  selection,
  position,
  onClose,
  span,
  onAnnotate,
}: SelectionPopoverProps) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { evaluations } = useAnnotationBySpan({
    project,
    commit,
    span,
  })
  const evaluation = evaluations[0]
  if (!evaluation) return null

  return (
    <AnnotationPopover
      initialExpanded
      align='start'
      evaluation={
        evaluation as EvaluationV2<EvaluationType.Human, HumanEvaluationMetric>
      }
      onAnnotate={onAnnotate}
      onClose={onClose}
      position={position}
      selectedContext={selection.context}
      side='top'
      span={span}
    />
  )
}
