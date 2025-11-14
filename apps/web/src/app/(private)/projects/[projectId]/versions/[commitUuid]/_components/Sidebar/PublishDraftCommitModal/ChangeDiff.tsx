import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { DiffViewer } from '@latitude-data/web-ui/molecules/DiffViewer'
import { ChangedDocument, ModifiedDocumentType } from '@latitude-data/constants'
import useDocumentVersions from '$/stores/documentVersions'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useMemo } from 'react'

function DocumentDiff({
  oldContent,
  newContent,
}: {
  oldContent?: string
  newContent?: string
}) {
  if (oldContent === undefined || newContent === undefined) {
    return (
      <div className='flex w-full h-96'>
        <TextEditorPlaceholder />
      </div>
    )
  }

  return (
    <div className='flex w-full flex-grow'>
      <DiffViewer newValue={newContent} oldValue={oldContent} />
    </div>
  )
}

function LoadingDiff() {
  return (
    <div className='flex w-full h-96'>
      <TextEditorPlaceholder />
    </div>
  )
}

export function ChangeDiff({ change }: { change: ChangedDocument }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const { data: headDocuments, isLoading: isLoadingHeadDocuments } =
    useDocumentVersions({
      projectId: project.id,
    })

  const { data: currentDocuments, isLoading: isLoadingCurrentDocuments } =
    useDocumentVersions({
      projectId: project.id,
      commitUuid: commit.uuid,
    })

  const headDocument = useMemo(
    () => headDocuments?.find((d) => d.documentUuid === change.documentUuid),
    [headDocuments, change.documentUuid],
  )

  const currentDocument = useMemo(
    () => currentDocuments?.find((d) => d.documentUuid === change.documentUuid),
    [currentDocuments, change.documentUuid],
  )

  const isLoading = isLoadingHeadDocuments || isLoadingCurrentDocuments

  if (isLoading) {
    return <LoadingDiff />
  }

  return (
    <DocumentDiff
      oldContent={change.changeType === ModifiedDocumentType.Created ? '' : headDocument?.content} // prettier-ignore
      newContent={change.changeType === ModifiedDocumentType.Deleted ? '' : currentDocument?.content} // prettier-ignore
    />
  )
}
