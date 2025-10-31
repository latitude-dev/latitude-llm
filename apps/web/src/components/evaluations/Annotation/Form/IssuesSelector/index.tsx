import { use, useCallback, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { useIssue } from '$/stores/issues/issue'
import { useSearchIssues } from '$/stores/issues/selectorIssues'
import { AnnotationContext, AnnotationFormWrapper } from '../../FormWrapper'

export function IssuesSelector() {
  const { result, commit, documentUuid } = use(AnnotationContext)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
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
  const onSearch = useDebouncedCallback(async (value: string) => {
    setQuery(value)
  }, 500)
  const option = useMemo<SelectOption<number>[]>(() => {
    const list = serachIssues.map((issue) => ({
      label: issue.title,
      value: issue.id,
    }))

    // Put in the list evaluation result assigned issue if not present
    if (resultIssue && !query) {
      const exists = list.find((item) => item.value === resultIssue.id)
      if (!exists) {
        list.unshift({
          label: resultIssue.title,
          value: resultIssue.id,
        })
      }
    }

    return list
  }, [serachIssues, query, resultIssue])
  const onOpenChange = useCallback((open: boolean) => {
    setOpen(open)
    if (open) {
      setQuery('')
    }
  }, [])

  if (!result || result.hasPassed) return null

  return (
    <AnnotationFormWrapper.Body>
      <Select<number>
        searchable
        width='auto'
        open={open}
        onOpenChange={onOpenChange}
        options={option}
        name='annotation-issue'
        disabled={isLoading}
        placeholder='Select issue'
        onChange={onChange}
        onSearch={onSearch}
        value={resultIssue?.id}
      />
    </AnnotationFormWrapper.Body>
  )
}
