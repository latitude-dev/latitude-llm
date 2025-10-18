import usePublishedDocument from '$/stores/publishedDocument'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CopyButton } from '@latitude-data/web-ui/atoms/CopyButton'
import { DotIndicator } from '@latitude-data/web-ui/atoms/DotIndicator'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { PublishedDocumentPreview } from './Preview'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { NotEditableBanner } from '../_components/NotEditableBanner'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

function UnpublishedDocumentSettings({
  document,
  projectId,
}: {
  document: DocumentVersion
  projectId: number
}) {
  const {
    data: publishedData,
    publish,
    isPublishing,
  } = usePublishedDocument({
    documentUuid: document.documentUuid,
    projectId,
  })

  const { commit, isHead: canEdit } = useCurrentCommit()

  const onPublish = () => {
    if (!canEdit) return

    publish({
      documentUuid: document.documentUuid,
      projectId,
      commitUuid: commit.uuid,
    })
  }

  return (
    <div className='flex flex-col items-center w-full gap-4 p-4'>
      <div className='flex flex-col w-full items-center'>
        <Text.H5B>Share to the web</Text.H5B>
        <Text.H5 color='foregroundMuted'>
          Create a public chatbot with Latitude
        </Text.H5>
      </div>
      <PublishedDocumentPreview
        document={document}
        publishedData={publishedData}
      />
      <div className='max-w-[300px] w-full'>
        <Button
          fullWidth
          fancy
          variant='default'
          isLoading={isPublishing}
          disabled={!canEdit}
          onClick={onPublish}
        >
          Share prompt
        </Button>
      </div>
    </div>
  )
}

function PublishedDocumentSettings({
  document,
  projectId,
}: {
  document: DocumentVersion
  projectId: number
}) {
  const { isHead: canEdit } = useCurrentCommit()
  const { data, isUpdating, update } = usePublishedDocument({
    documentUuid: document.documentUuid,
    projectId,
  })

  const onUnpublish = () => {
    if (!canEdit) return

    update({ isPublished: false })
  }

  const [title, setTitle] = useState<string | undefined>()
  const [description, setDescription] = useState<string | undefined>()
  const [canChat, setCanChat] = useState<boolean | undefined>()
  const [displayPromptOnly, setdisplayPromptOnly] = useState<
    boolean | undefined
  >()

  const hasEdits =
    title !== undefined ||
    description !== undefined ||
    canChat !== undefined ||
    displayPromptOnly !== undefined
  useEffect(() => {
    if (isUpdating) return
    setTitle(undefined)
    setDescription(undefined)
    setCanChat(undefined)
  }, [isUpdating])

  const url = `${window.location.origin}${ROUTES.share.document(data!.uuid!).root}`

  const onSaveChanges = useCallback(() => {
    if (isUpdating) return

    update({
      title,
      description,
      canFollowConversation: canChat,
      displayPromptOnly,
    })
  }, [title, description, canChat, displayPromptOnly, isUpdating, update])

  return (
    <div className='flex flex-col w-full gap-4 p-4'>
      <div className='flex flex-col w-full relative'>
        <Text.H5>Your prompt is public on</Text.H5>
        <div className='flex flex-row gap-2 max-w-full w-full overflow-hidden'>
          <Link href={url} target='_blank' className='truncate'>
            <Text.H5 color='primary' noWrap ellipsis>
              {url}
            </Text.H5>
          </Link>
          <CopyButton content={url} />
        </div>
      </div>
      <Input
        label='Title'
        value={title ?? data?.title ?? undefined}
        disabled={isUpdating || !canEdit}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TextArea
        label='Description'
        placeholder='Add a description to your website.'
        value={description ?? data?.description ?? undefined}
        disabled={isUpdating || !canEdit}
        onChange={(e) => setDescription(e.target.value)}
      />
      <SwitchInput
        label='Allow chat'
        checked={canChat ?? data?.canFollowConversation ?? false}
        disabled={isUpdating || !canEdit}
        onCheckedChange={setCanChat}
      />
      <SwitchInput
        label='Display prompt only'
        checked={displayPromptOnly ?? data?.displayPromptOnly ?? false}
        disabled={isUpdating || !canEdit}
        onCheckedChange={setdisplayPromptOnly}
        description='When enabled, the prompt will be displayed without the chat interface.'
      />
      <div className='flex flex-row w-full items-center justify-between gap-4'>
        <Button
          variant='outline'
          className='border-destructive'
          fancy
          isLoading={isUpdating}
          disabled={isUpdating || !canEdit}
          onClick={onUnpublish}
        >
          Unpublish
        </Button>
        <div className='flex flex-row w-full items-center justify-end gap-4'>
          <Link href={url} target='_blank'>
            <Button
              variant='outline'
              fancy
              iconProps={{ name: 'externalLink' }}
            >
              Open
            </Button>
          </Link>
          <Button
            variant='default'
            fancy
            isLoading={isUpdating}
            disabled={isUpdating || !canEdit || !hasEdits}
            onClick={onSaveChanges}
          >
            Save changes
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PublishDocumentButton({
  document,
  projectId,
}: {
  document: DocumentVersion
  projectId: number
}) {
  const { isPublished } = usePublishedDocument({
    documentUuid: document.documentUuid,
    projectId,
  })

  return (
    <Popover.Root>
      <Popover.Trigger asChild suppressHydrationWarning>
        <Button fancy variant='outline'>
          <div className='flex flex-row items-center gap-2'>
            <Text.H5>Share</Text.H5>
            <DotIndicator
              variant={isPublished ? 'success' : 'muted'}
              pulse={isPublished}
            />
          </div>
        </Button>
      </Popover.Trigger>
      <Popover.Content maxHeight='none' width={500} align='end'>
        <NotEditableBanner
          description='Share settings cannot be modified in a Draft.'
          allowOnly='live'
        />
        {isPublished ? (
          <PublishedDocumentSettings
            document={document}
            projectId={projectId}
          />
        ) : (
          <UnpublishedDocumentSettings
            document={document}
            projectId={projectId}
          />
        )}
      </Popover.Content>
    </Popover.Root>
  )
}
