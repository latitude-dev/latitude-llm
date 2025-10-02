import { useCommitsChanges } from '$/stores/commitChanges'
import { useDocumentDiff } from '$/stores/documentDiff'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { DiffViewer } from '@latitude-data/web-ui/molecules/DiffViewer'
import { Commit } from '@latitude-data/core/schema/types'

export function ChangeDiffViewer({
  commit,
  documentUuid,
}: {
  commit?: Commit
  documentUuid?: string
}) {
  const { data: changes, isLoading: isChangeListLoading } = useCommitsChanges({
    commit,
  })
  const { data: diff, isLoading: isDiffLoading } = useDocumentDiff({
    commit,
    documentUuid,
  })
  const document = changes.documents.all.find(
    (change) => change.documentUuid === documentUuid,
  )

  if (isChangeListLoading || isDiffLoading) {
    return (
      <div className='w-full h-full overflow-hidden'>
        <TextEditorPlaceholder />
      </div>
    )
  }

  if (!document) {
    return <div className='w-full h-full rounded-md bg-secondary' />
  }

  return <DiffViewer {...diff} />
}
