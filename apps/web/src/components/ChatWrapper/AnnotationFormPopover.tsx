'use client'

import { FormProps } from '$/components/evaluations/Annotation/types'
import {
  EvaluationMetric,
  EvaluationType,
  isMainSpan,
  MainSpanType,
  SelectedContext,
  SpanWithDetails,
} from '@latitude-data/constants'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { cn } from '@latitude-data/web-ui/utils'
import { AnnotationForm } from '../evaluations/Annotation/Form'

type AnnotationPopoverProps<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
> = Omit<FormProps<T, M>, 'span'> & {
  position: { x: number; y: number }
  onClose: () => void
  selectedContext: SelectedContext
  initialExpanded?: boolean
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  span: SpanWithDetails
}

export function AnnotationPopover<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  evaluation,
  span,
  result,
  onAnnotate,
  selectedContext,
  initialExpanded,
  position,
  onClose,
  side = 'top',
  align = 'start',
}: AnnotationPopoverProps<T, M>) {
  if (!isMainSpan(span)) return

  return (
    <Popover.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <Popover.Trigger asChild>
        <div
          style={{
            position: 'fixed',
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
        />
      </Popover.Trigger>
      <Popover.Content
        side={side}
        align={align}
        sideOffset={8}
        className={cn('w-96 p-0', 'animate-in fade-in slide-in-from-top-2')}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement | null
          if (target?.closest('[role="dialog"]')) {
            e.preventDefault()
          }
        }}
        data-selection-popover
        onMouseDown={(e) => {
          e.stopPropagation()
        }}
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <AnnotationForm
          evaluation={evaluation}
          span={span as SpanWithDetails<MainSpanType>}
          result={result}
          onAnnotate={onAnnotate}
          selectedContext={selectedContext}
          initialExpanded={initialExpanded}
        />
      </Popover.Content>
    </Popover.Root>
  )
}
