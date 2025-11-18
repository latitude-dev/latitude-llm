import { AnnotationForm } from '$/components/evaluations/Annotation/Form'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useAnnotationBySpan } from '$/hooks/useAnnotationsBySpan'
import { SpanType, SpanWithDetails } from '@latitude-data/core/constants'

export function AnnotationForms({
  span,
}: {
  span: SpanWithDetails<SpanType.Prompt>
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { annotations } = useAnnotationBySpan({
    project,
    commit,
    span,
  })
  if (!annotations.bottom) return null

  return (
    <div className='w-full border-t flex flex-col gap-y-4 mt-4 pt-4'>
      <AnnotationForm
        key={annotations.bottom.evaluation.uuid}
        evaluation={annotations.bottom.evaluation}
        span={span}
        result={annotations.bottom.result}
      />
    </div>
  )
}
