import type { SelectedContext, SpanWithDetails } from '@latitude-data/constants'
import { isMainSpan, MainSpanType } from '@latitude-data/constants'

import type { AnnotatedTextRange } from '../../../AnnotationsContext'
import { AnnotationForm } from '$/components/evaluations/Annotation/Form'

type AnnotationSectionProps = {
  blockAnnotations: AnnotatedTextRange[]
  evaluation?: AnnotatedTextRange['evaluation']
  span?: SpanWithDetails
  messageIndex?: number
  contentBlockIndex?: number
  contentType: SelectedContext['contentType']
  requireMainSpan?: boolean
  initialExpanded?: boolean
  includeSelectedContextForExisting?: boolean
}

/**
 * Renders annotation forms for a content block.
 */
export function AnnotationSection({
  blockAnnotations,
  evaluation,
  span,
  messageIndex,
  contentBlockIndex,
  contentType,
  requireMainSpan = false,
  initialExpanded,
  includeSelectedContextForExisting = true,
}: AnnotationSectionProps) {
  const isMainSpanType = !!span && isMainSpan(span)
  const shouldRenderSection =
    !!span &&
    (blockAnnotations.length > 0 || evaluation) &&
    (!requireMainSpan || isMainSpanType)

  if (!shouldRenderSection) return null

  const canRenderEmptyForm =
    blockAnnotations.length === 0 &&
    evaluation &&
    messageIndex !== undefined &&
    contentBlockIndex !== undefined &&
    isMainSpanType

  return (
    <div className='flex flex-col gap-y-4 border-t pt-4'>
      {blockAnnotations.map((annotation) => (
        <AnnotationForm
          key={`${annotation.result.uuid}-${annotation.evaluation.uuid}`}
          evaluation={annotation.evaluation}
          result={annotation.result}
          selectedContext={
            includeSelectedContextForExisting ? annotation.context : undefined
          }
          span={span as SpanWithDetails<MainSpanType>}
          initialExpanded={initialExpanded}
        />
      ))}
      {canRenderEmptyForm && (
        <AnnotationForm
          key={`${evaluation.uuid}-${messageIndex}-${contentBlockIndex}`}
          evaluation={evaluation}
          selectedContext={{
            messageIndex,
            contentBlockIndex,
            contentType,
          }}
          span={span as SpanWithDetails<MainSpanType>}
          initialExpanded={initialExpanded}
        />
      )}
    </div>
  )
}
