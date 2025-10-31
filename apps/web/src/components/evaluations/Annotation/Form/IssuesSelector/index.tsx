import { use, useCallback, useState } from 'react'
import { AnnotationContext, AnnotationFormWrapper } from '../../FormWrapper'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { useIssue } from '$/stores/issues/issue'
import { useSearchIssues } from '$/stores/issues/selectorIssues'

export function IssuesSelector() {
  const { result, commit, documentUuid } = use(AnnotationContext)
  const [query, setQuery] = useState('')
  const projectId = commit?.projectId
  const { data: resultIssue, isLoading: isLoadingIssue } = useIssue({
    projectId,
    commitUuid: commit.uuid,
    issueId: result?.issueId,
  })
  const { data: serachIssues, isLoading: isSearchingIssues } = useSearchIssues({
    projectId,
    commitUuid: commit.uuid,
    documentUuid,
    query,
  })
  const isLoading = isLoadingIssue || isSearchingIssues
  const onChange = useCallback((value: number) => {
    console.log(value)
  }, [])
  const onSearch = useCallback(async (value: string) => {
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
