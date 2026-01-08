'use client'

import { SpanWithDetails } from '@latitude-data/constants'
import { AnnotationPopover } from './AnnotationFormPopover'
import { AnnotatedTextRange } from '../ChatWrapper'

type AnnotationClickPopoverProps = {
  clickedAnnotation: {
    annotation: AnnotatedTextRange
    position: { x: number; y: number }
  } | null
  onClose: () => void
  span: SpanWithDetails
}

/**
 * Renders an annotation popover when an annotation is clicked on a messages list.
 * The popover displays annotation details and allows editing the annotation.
 *
 * @param clickedAnnotation - The clicked annotation with its position, or null if no annotation is clicked
 * @param onClose - Callback function to close the popover
 * @param span - The prompt span that contains the annotation
 * @returns The annotation popover component, or null if no annotation is clicked
 */
export function AnnotationClickPopover({
  clickedAnnotation,
  onClose,
  span,
}: AnnotationClickPopoverProps) {
  if (!clickedAnnotation) return null

  const { annotation, position } = clickedAnnotation

  return (
    <AnnotationPopover
      initialExpanded
      align='center'
      evaluation={annotation.evaluation}
      onAnnotate={onClose}
      onClose={onClose}
      position={position}
      result={annotation.result}
      selectedContext={annotation.context}
      side='top'
      span={span}
    />
  )
}
