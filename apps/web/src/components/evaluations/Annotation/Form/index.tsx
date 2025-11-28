import { useState } from 'react'
import Link from 'next/link'
import { EvaluationMetric, EvaluationType } from '@latitude-data/core/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { AnnotationProvider } from '../FormWrapper'
import { useHasPassed } from '../../hooks/useHasPassed'
import { EVALUATION_SPECIFICATIONS } from '../../index'
import { FormProps } from '../types'
import { useAnnotationForm } from '../useAnnotationForm'
import { IssuesSelector } from './IssuesSelector'
import { AnnotationsProgressIcon } from '$/components/AnnotationProgressPanel/AnntationsProgressIcon'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { ROUTES } from '$/services/routes'

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
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const issuesDashboardLink = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid }).issues.root
  const { onSubmit, isSubmitting } = useAnnotationForm<T, M>({
    evaluation,
    span,
    onAnnotate,
  })

  // Start expanded if there's already a result
  const [isExpanded, setIsExpanded] = useState(!!result)
  const hasPassed = useHasPassed({
    evaluation,
    result,
    score: result?.score,
  })

  if (!spec.AnnotationForm) return null

  const hasReason = Boolean(
    result?.metadata && 'reason' in result.metadata && result.metadata.reason,
  )
  const isFailedWithoutReason = hasPassed === false && !hasReason

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
        {isFailedWithoutReason ? (
          <div className='rounded-lg mx-3 my-2 p-1.5 border border-dashed bg-secondary'>
            <div className='px-3 py-2 bg-background rounded-md flex items-center gap-x-2'>
              <AnnotationsProgressIcon isCompleted />
              <Text.H6 color='foregroundMuted'>
                Please write feedback on why this annotation did not pass. This
                is important for improving your prompt and ensuring Latitude can
                create better issues. Check the{' '}
                <Link href={issuesDashboardLink} target='_blank'>
                  <Text.H6M underline color='foregroundMuted'>
                    issues section
                  </Text.H6M>
                </Link>
              </Text.H6>
            </div>
          </div>
        ) : null}
      </div>
    </AnnotationProvider>
  )
}
