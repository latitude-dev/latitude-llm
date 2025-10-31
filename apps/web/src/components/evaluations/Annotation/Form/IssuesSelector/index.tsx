import { use } from 'react'
import { AnnotationContext, AnnotationFormWrapper } from '../../FormWrapper'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { useIssue } from '$/stores/issues/issue'

export function IssuesSelector() {
  const { result, commit } = use(AnnotationContext)
  const projectId = commit?.projectId
  const { data: resultIssue, isLoading } = useIssue({
    projectId,
    commitUuid: commit.uuid,
    issueId: result?.issueId,
  })

  if (!result || result.hasPassed) return null

  return (
    <AnnotationFormWrapper.Body>
      <Select
        width='auto'
        name='annotation-issue'
        disabled={isLoading}
        placeholder='Select issue'
        options={[]}
        value={resultIssue.id}
      />
    </AnnotationFormWrapper.Body>
  )
}
