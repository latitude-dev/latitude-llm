import useDocumentVersion from '$/stores/useDocumentVersion'
import { ModifiedDocumentType } from '@latitude-data/core/browser'
import { ChangedDocument } from '@latitude-data/core/repositories'
import {
  DiffViewer,
  TextEditorPlaceholder,
  Text,
  useCurrentCommit,
} from '@latitude-data/web-ui'

function ChangeDiffPlaceholder() {
  return (
    <div className='flex flex-grow bg-secondary w-full rounded-md items-center justify-center'>
      <Text.H6 color='foregroundMuted'>
        Select a change to view the diff
      </Text.H6>
    </div>
  )
}

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

function CreatedDocumentDiff({ documentUuid }: { documentUuid: string }) {
  const { commit } = useCurrentCommit()
  const { data: newDocument } = useDocumentVersion(documentUuid, {
    commitUuid: commit.uuid,
  })

  return <DocumentDiff oldContent='' newContent={newDocument?.content} />
}

function DeletedDocumentDiff({ documentUuid }: { documentUuid: string }) {
  const { data: oldDocument } = useDocumentVersion(documentUuid)

  return <DocumentDiff oldContent={oldDocument?.content} newContent='' />
}

function UpdatedDocumentDiff({ documentUuid }: { documentUuid: string }) {
  const { commit } = useCurrentCommit()
  const { data: newDocument } = useDocumentVersion(documentUuid, {
    commitUuid: commit.uuid,
  })
  const { data: oldDocument } = useDocumentVersion(documentUuid)

  return (
    <DocumentDiff
      oldContent={oldDocument?.content}
      newContent={newDocument?.content}
    />
  )
}

export function ChangeDiff({ change }: { change?: ChangedDocument }) {
  if (!change) {
    return <ChangeDiffPlaceholder />
  }

  if (change.changeType === ModifiedDocumentType.Created) {
    return <CreatedDocumentDiff documentUuid={change.documentUuid} />
  }

  if (change.changeType === ModifiedDocumentType.Deleted) {
    return <DeletedDocumentDiff documentUuid={change.documentUuid} />
  }

  return <UpdatedDocumentDiff documentUuid={change.documentUuid} />
}
