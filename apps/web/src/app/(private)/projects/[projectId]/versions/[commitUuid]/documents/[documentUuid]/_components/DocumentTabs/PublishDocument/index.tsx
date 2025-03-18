import usePublishedDocument from '$/stores/publishedDocument'
import { DocumentVersion } from '@latitude-data/core/browser'
import {
  Button,
  CopyButton,
  DotIndicator,
  Input,
  Popover,
  SwitchInput,
  Text,
  TextArea,
  useCurrentCommit,
} from '@latitude-data/web-ui'
import { PublishedDocumentPreview } from './Preview'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { APP_DOMAIN } from '$/app/(private)/_lib/constants'
import { ROUTES } from '$/services/routes'
import { NotEditableBanner } from '../_components/NotEditableBanner'

function UnpublishedDocumentSettings({
  document,
  projectId,
}: {
  document: DocumentVersion
  projectId: number
}) {
  const {
    data: publishedData,
    isPublishing: isLoading,
    setPublished,
  } = usePublishedDocument({
    documentUuid: document.documentUuid,
    projectId,
  })

  const { isHead: canEdit } = useCurrentCommit()

  const onPublish = () => {
    if (!canEdit) return
    setPublished(true)
  }

  return (
    <div className='flex flex-col items-center w-full gap-4 p-4'>
      <div className='flex flex-col w-full items-center'>
        <Text.H5B>Publish to web</Text.H5B>
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
          isLoading={isLoading}
          disabled={!canEdit}
          onClick={onPublish}
        >
          Publish
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
  const { data, isUpdating, update, setPublished } = usePublishedDocument({
    documentUuid: document.documentUuid,
    projectId,
  })

  const onUnpublish = () => {
    if (!canEdit) return
    setPublished(false)
  }

  const [title, setTitle] = useState<string | undefined>()
  const [description, setDescription] = useState<string | undefined>()
  const [canChat, setCanChat] = useState<boolean | undefined>()

  const hasEdits =
    title !== undefined || description !== undefined || canChat !== undefined
  useEffect(() => {
    if (isUpdating) return
    setTitle(undefined)
    setDescription(undefined)
    setCanChat(undefined)
  }, [isUpdating])

  const url = `${APP_DOMAIN}${ROUTES.share.document(data!.uuid!).root}`

  const onSaveChanges = useCallback(() => {
    if (isUpdating) return
    update({
      title,
      description,
      canFollowConversation: canChat,
    })
  }, [title, description, canChat, isUpdating])

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
      <Popover.Trigger asChild>
        <Button fancy variant='outline'>
          <div className='flex flex-row items-center gap-2'>
            <Text.H5>Publish Prompt</Text.H5>
            <DotIndicator
              variant={isPublished ? 'success' : 'muted'}
              pulse={isPublished}
            />
          </div>
        </Button>
      </Popover.Trigger>
      <Popover.Content maxHeight='none' width={500} align='end'>
        <NotEditableBanner description='Publish settings cannot be modified in a Draft.' />
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
