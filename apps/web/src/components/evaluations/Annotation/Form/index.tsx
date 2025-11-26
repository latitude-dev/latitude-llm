import { useState } from 'react'
import { EvaluationMetric, EvaluationType } from '@latitude-data/core/constants'
import { EVALUATION_SPECIFICATIONS } from '../..'
import { AnnotationProvider } from '../FormWrapper'
import { FormProps } from '../types'
import { useAnnotationForm } from '../useAnnotationForm'
import { IssuesSelector } from './IssuesSelector'
import { cn } from '@latitude-data/web-ui/utils'
import { useCurrentCommit } from '$/app/providers/CommitProvider'

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
        {isExpanded && (
          <div className='animate-in fade-in slide-in-from-top-2 duration-300'>
            <IssuesSelector />
          </div>
        )}
        <spec.AnnotationForm
          metric={evaluation.metric}
          evaluation={evaluation}
          result={result}
        />
      </div>
    </AnnotationProvider>
  )
}
