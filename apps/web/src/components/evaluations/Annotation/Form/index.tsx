import { use, useState } from 'react'
import { EvaluationMetric, EvaluationType } from '@latitude-data/core/constants'
import { cn } from '@latitude-data/web-ui/utils'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { AnnotationContext, AnnotationProvider } from '../FormWrapper'
import { AnnotationFormWrapper as AForm } from '../FormWrapper'
import { EVALUATION_SPECIFICATIONS } from '../../index'
import { FormProps } from '../types'
import { useAnnotationForm } from '../useAnnotationForm'
import { IssuesSelector } from './IssuesSelector'
import { useHasPassed } from '../../hooks/useHasPassed'

function AnnotationFormContent<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  evaluation,
  result,
  spec,
}: {
  evaluation: FormProps<T, M>['evaluation']
  result: FormProps<T, M>['result']
  spec: (typeof EVALUATION_SPECIFICATIONS)[T]
}) {
  const { isExpanded, localReason, localScore } = use(AnnotationContext)

  // Compute hasPassed based on local score
  const hasPassed =
    useHasPassed({
      evaluation,
      result,
      score: localScore,
    }) ?? null

  // Check if there's a reason (local state)
  const hasReason = localReason.trim().length > 0

  // Show IssuesSelector when expanded and there's a reason
  const showIssuesSelector = isExpanded && hasReason

  // Show warning when failed without reason
  const isFailedWithoutReason = hasPassed === false && !hasReason

  const AnnotationFormComponent = spec.AnnotationForm

  if (!AnnotationFormComponent) return null

  return (
    <div
      className={cn(
        'bg-background dark:bg-backgroundCode',
        'flex flex-col ',
        'transition-all duration-300 ease-in-out',
        'origin-bottom-left',
        'overflow-hidden',
        {
          'border border-border rounded-xl': isExpanded,
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2':
            isExpanded,
          'w-full': isExpanded,
          'w-fit': !isExpanded,
        },
      )}
    >
      {showIssuesSelector && (
        <div className='animate-in fade-in slide-in-from-top-2 duration-300'>
          <IssuesSelector hasPassed={hasPassed} hasReason={hasReason} />
        </div>
      )}
      <AnnotationFormComponent
        metric={evaluation.metric}
        evaluation={evaluation}
        result={result}
      />
      {isFailedWithoutReason && isExpanded && (
        <div className='animate-in fade-in slide-in-from-top-2 duration-300'>
          <AForm.FailedWithoutReasonWarning />
        </div>
      )}
    </div>
  )
}

export function AnnotationForm<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  evaluation,
  span,
  result,
  onAnnotate,
  mergedToIssueId,
}: FormProps<T, M> & { mergedToIssueId?: number }) {
  const spec = EVALUATION_SPECIFICATIONS[evaluation.type]
  const { commit } = useCurrentCommit()
  const { onSubmit, isSubmitting } = useAnnotationForm<T, M>({
    evaluation,
    span,
    onAnnotate,
  })

  // Start expanded if there's already a result
  const [isExpanded, setIsExpanded] = useState(!!result)

  if (!spec.AnnotationForm) return null

  return (
    <AnnotationProvider
      commit={commit}
      span={span}
      evaluation={evaluation}
      documentUuid={span.documentUuid ?? ''}
      result={result}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      isExpanded={isExpanded}
      setIsExpanded={setIsExpanded}
      mergedToIssueId={mergedToIssueId}
    >
      <AnnotationFormContent
        evaluation={evaluation}
        result={result}
        spec={spec}
      />
    </AnnotationProvider>
  )
}
