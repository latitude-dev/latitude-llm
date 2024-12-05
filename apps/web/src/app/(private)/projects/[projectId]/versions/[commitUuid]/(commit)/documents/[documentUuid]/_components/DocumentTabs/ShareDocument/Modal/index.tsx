import { FormEvent, useCallback, useState } from 'react'

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ClickToCopy,
  FormWrapper,
  Icon,
  Input,
  Modal,
  SwitchInput,
  TextArea,
} from '@latitude-data/web-ui'
import { UpdatePublishedDocumentInput } from '$/actions/documents/sharing/updatePublishedDocumentAction'
import { APP_DOMAIN } from '$/app/(private)/_lib/constants'
import { ROUTES } from '$/services/routes'
import usePublishedDocuments from '$/stores/publishedDocuments'
import { DialogClose } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Modal/Primitives'
import { DocumentVersion } from '@latitude-data/core/browser'

type Data = Omit<UpdatePublishedDocumentInput, 'uuid'>
type OnUpdateFn = (data: Data) => Promise<void>

function VisibilitySwitch({
  uuid,
  isPublished,
  onUpdate,
  documentInOldSyntax,
}: {
  uuid: string
  isPublished: boolean
  onUpdate: OnUpdateFn
  documentInOldSyntax: boolean
}) {
  const url = `${APP_DOMAIN}${ROUTES.share.document(uuid).root}`
  const canUpdate = isPublished ? true : !documentInOldSyntax
  const [isUpdating, setIsUpdating] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className='flex flex-row gap-x-2 items-center'>
            {!isPublished ? <Icon name='lock' /> : null}
            <span>Prompt visibility</span>
          </div>
        </CardTitle>
        <CardDescription>
          When this setting is activated the prompt is accessible for anyone
          with access to the URL
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='flex flex-col gap-y-4'>
          <SwitchInput
            checked={isPublished}
            disabled={!canUpdate || isUpdating}
            label={
              isUpdating ? 'Updating...' : isPublished ? 'Public' : 'Private'
            }
            onCheckedChange={async (isPublished) => {
              setIsUpdating(true)
              await onUpdate({ isPublished })
              setIsUpdating(false)
            }}
          />
          {documentInOldSyntax ? (
            <Alert
              showIcon={false}
              variant='warning'
              title='Syntax update required'
              description='You need to update prompt syntaxt to Promptl to enable sharing.'
            />
          ) : null}
          {isPublished ? (
            <ClickToCopy fullWidth copyValue={url} showIcon={false}>
              <div className='relative w-full'>
                <Input
                  disabled
                  value={url}
                  label='Public URL'
                  className='pr-8'
                />
                <div className='h-8 w-8 absolute right-0 bottom-0 p-1 flex items-center justify-center'>
                  <Icon name='clipboard' className='text-muted-foreground' />
                </div>
              </div>
            </ClickToCopy>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function FollowConversationSwitch({
  canFollowConversation,
  onUpdate,
}: {
  canFollowConversation: boolean
  onUpdate: OnUpdateFn
}) {
  const [isUpdating, setIsUpdating] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Can chat?</CardTitle>
        <CardDescription>
          When external users interact with this prompt they will be able to run
          the prompt and keep the conversation going if you enable chat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='flex flex-col gap-y-4'>
          <SwitchInput
            checked={canFollowConversation}
            disabled={isUpdating}
            label={
              isUpdating
                ? 'Updating...'
                : canFollowConversation
                  ? 'Chat enabled'
                  : 'No Chat'
            }
            onCheckedChange={async (canFollowConversation) => {
              setIsUpdating(true)
              await onUpdate({ canFollowConversation })
              setIsUpdating(false)
            }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function ShareDocumentModal({
  document,
  uuid,
  projectId,
  commitUuid,
  documentUuid,
  open,
  onClose,
}: {
  document: DocumentVersion
  uuid: string
  projectId: number
  commitUuid: string
  documentUuid: string
  open: boolean
  onClose: () => void
}) {
  const documentInOldSyntax = document.promptlVersion === 0
  const [isUpdating, setIsUpdating] = useState(false)
  const { find, update } = usePublishedDocuments({
    projectId,
  })
  const publishedDocument = find(uuid)
  const onUpdate = useCallback(
    async (data: Data) => {
      if (!publishedDocument) return
      await update({
        projectId,
        commitUuid,
        documentUuid,
        uuid: publishedDocument.uuid!,
        ...data,
      })
    },
    [projectId, commitUuid, documentUuid, publishedDocument, update],
  )
  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      setIsUpdating(true)
      const form = event.target as HTMLFormElement
      const formData = new FormData(form)
      const data = Object.fromEntries(formData.entries())
      await onUpdate(data)
      setIsUpdating(false)
      onClose()
    },
    [onUpdate, onClose],
  )

  if (!publishedDocument) return null

  const isPublished = publishedDocument.isPublished ?? false
  const canFollowConversation = publishedDocument.canFollowConversation ?? false

  return (
    <Modal
      open={open}
      dismissible
      title='Share this prompt'
      description='Create a public site to let others use, fork, and customize this prompt.'
      onOpenChange={onClose}
      footer={
        <>
          <DialogClose asChild>
            <Button fancy variant='outline'>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type='submit'
            form='sharing-settings'
            fancy
            variant='default'
            disabled={isUpdating}
          >
            Save settings {`${isUpdating ? '...' : ''}`}
          </Button>
        </>
      }
    >
      <FormWrapper>
        <form onSubmit={onSubmit} id='sharing-settings'>
          <FormWrapper>
            <Input
              name='title'
              label='Prompt name'
              defaultValue={publishedDocument.title ?? ''}
            />
            <TextArea
              name='description'
              label='Description'
              placeholder='Add a helpful description for your prompt'
              defaultValue={publishedDocument.description ?? ''}
            />
          </FormWrapper>
        </form>
        <VisibilitySwitch
          uuid={uuid}
          isPublished={isPublished}
          onUpdate={onUpdate}
          documentInOldSyntax={documentInOldSyntax}
        />
        <FollowConversationSwitch
          canFollowConversation={canFollowConversation}
          onUpdate={onUpdate}
        />
      </FormWrapper>
    </Modal>
  )
}
