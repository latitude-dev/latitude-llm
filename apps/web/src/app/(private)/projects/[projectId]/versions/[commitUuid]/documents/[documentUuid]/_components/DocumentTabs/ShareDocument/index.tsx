import { PublishedDocument } from '@latitude-data/core/browser'
import { Button, Icon, Skeleton, Tooltip } from '@latitude-data/web-ui'
import { useToggleModal } from '$/hooks/useToogleModal'
import usePublishedDocuments from '$/stores/publishedDocuments'

import { ShareDocumentModal } from './Modal'

const SHARE_COPY = 'Share prompt'

function FakeButton() {
  return (
    <div>
      <Button fancy variant='outline' disabled>
        {SHARE_COPY} <Icon name='externalLink' />
      </Button>
    </div>
  )
}

function CreatePublishedDocumentButton({
  projectId,
  commitUuid,
  documentUuid,
  onOpen,
}: {
  projectId: number
  commitUuid: string
  documentUuid: string
  onOpen: () => void
}) {
  const { create, isCreating } = usePublishedDocuments({
    projectId,
    onCreated: () => {
      onOpen()
    },
  })
  return (
    <Button
      fancy
      variant='outline'
      disabled={isCreating}
      iconProps={{ name: 'lock' }}
      onClick={() => create({ projectId, commitUuid, documentUuid })}
    >
      {isCreating ? 'Enabling sharing...' : SHARE_COPY}
    </Button>
  )
}

function PublishedDocumentButton({
  publishedDocument,
  onOpen,
}: {
  publishedDocument: PublishedDocument
  onOpen: () => void
}) {
  const isPublished = publishedDocument.isPublished
  const tooltipPublishBtn = isPublished
    ? 'This prompt is public. Anyone with the URL can run it'
    : 'This prompt is private. Only people with access to Latitude can see it.'

  return (
    <Tooltip
      asChild
      trigger={
        <Button
          fancy
          variant='outline'
          indicator={
            isPublished ? { pulse: true, variant: 'success' } : undefined
          }
          iconProps={!isPublished ? { name: 'lock' } : undefined}
          onClick={onOpen}
        >
          {isPublished ? 'Public prompt' : 'Share prompt'}
        </Button>
      }
    >
      {tooltipPublishBtn}
    </Tooltip>
  )
}

export function ShareDocument({
  projectId,
  commitUuid,
  documentUuid,
  canShare,
}: {
  commitUuid: string
  projectId: number
  documentUuid: string
  canShare: boolean
}) {
  const { open, onOpen, onClose } = useToggleModal()
  const { findByDocumentUuid, isLoading } = usePublishedDocuments({
    projectId,
  })
  const publishedDocument = findByDocumentUuid(documentUuid)
  const notPublished = !publishedDocument && !isLoading
  const hasPublished = !!publishedDocument && !isLoading

  if (!canShare) {
    return (
      <Tooltip asChild trigger={<FakeButton />}>
        You can only share the live version of the prompt. Drafts cannot be
        shared.
      </Tooltip>
    )
  }

  return (
    <>
      {isLoading && (
        <Skeleton>
          <FakeButton />
        </Skeleton>
      )}
      {notPublished && (
        <CreatePublishedDocumentButton
          projectId={projectId}
          commitUuid={commitUuid}
          documentUuid={documentUuid}
          onOpen={onOpen}
        />
      )}
      {hasPublished && (
        <PublishedDocumentButton
          publishedDocument={publishedDocument}
          onOpen={onOpen}
        />
      )}
      {publishedDocument && (
        <ShareDocumentModal
          uuid={publishedDocument.uuid!}
          projectId={projectId}
          commitUuid={commitUuid}
          documentUuid={documentUuid}
          open={open}
          onClose={onClose}
        />
      )}
    </>
  )
}