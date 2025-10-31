import { use, useCallback } from 'react'
import { AnnotationContext, AnnotationFormWrapper } from '../../FormWrapper'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { useIssue } from '$/stores/issues/issue'

export function IssuesSelector() {
  const { result, commit, documentUuid } = use(AnnotationContext)
  const projectId = commit?.projectId
  const { data: resultIssue, isLoading } = useIssue({
    projectId,
    commitUuid: commit.uuid,
    issueId: result?.issueId,
  })
  const onChange = useCallback((value: number) => {
    console.log(value)
  }, [])
  const onSearch = useCallback((query: string) => {
    console.log(query)
  }, [])

  if (!result || result.hasPassed) return null

  return (
    <AnnotationFormWrapper.Body>
      <Select<number>
        width='auto'
        name='annotation-issue'
        disabled={isLoading}
        placeholder='Select issue'
        options={[]}
        onChange={onChange}
        onSearch={onSearch}
        value={resultIssue?.id}
      />
    </AnnotationFormWrapper.Body>
  )
}
