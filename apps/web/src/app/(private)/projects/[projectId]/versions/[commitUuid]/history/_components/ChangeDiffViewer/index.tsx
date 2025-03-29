import { useCommitsChanges } from '$/stores/commitChanges'
import { useDocumentDiff } from '$/stores/documentDiff'
import { Commit } from '@latitude-data/core'
import { DiffViewer, TextEditorPlaceholder } from '@latitude-data/web-ui'

export function ChangeDiffViewer({
  commit,
  documentUuid,
}: {
  commit?: Commit
  documentUuid?: string
}) {
  const { data: changes, isLoading: isChangeListLoading } =
    useCommitsChanges(commit)
  const { data: diff, isLoading: isDiffLoading } = useDocumentDiff({
    commit,
    documentUuid,
  })

  if (!changes?.find((change) => change.documentUuid === documentUuid)) {
    return <div className='w-full h-full rounded-md bg-secondary' />
  }

  if (isChangeListLoading || isDiffLoading) {
    return (
      <div className='w-full h-full overflow-hidden'>
        <TextEditorPlaceholder />
      </div>
    )
  }

  return <DiffViewer {...diff} />
}
