import { useCommitsChanges } from '$/stores/commitChanges'
import { useDocumentDiff } from '$/stores/documentDiff'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { DiffViewer } from '@latitude-data/web-ui/molecules/DiffViewer'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { ModifiedDocumentType } from '@latitude-data/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'

const REFERENCE_ONLY_DESCRIPTION =
  "This prompt's content hasn't changed — it references another prompt that was modified in this version."

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

  if (document.changeType === ModifiedDocumentType.UpdatedByReference) {
    return (
      <div className='w-full h-full overflow-hidden flex flex-col gap-2'>
        <Alert description={REFERENCE_ONLY_DESCRIPTION} />
        <DiffViewer {...diff} />
      </div>
    )
  }

  return <DiffViewer {...diff} />
}
