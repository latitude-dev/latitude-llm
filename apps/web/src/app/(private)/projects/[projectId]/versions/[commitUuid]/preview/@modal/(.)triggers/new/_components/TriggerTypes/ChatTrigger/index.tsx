import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { type OnTriggerCreated } from '../../../client'
import { PublishedDocumentPreview } from './PublishedDocumentPreview'

const FAKE_CHAT_TRIGGER_DOCUMENT = {}
export function ChatTrigger({
  onTriggerCreated: _ot,
}: {
  onTriggerCreated: OnTriggerCreated
}) {
  const { isHead: canEdit } = useCurrentCommit()

  const onPublish = () => {
    if (!canEdit) return

    console.log('TODO: Refactor shared document to be a trigger document')
  }
  const isDisabled = !canEdit || true
  return (
    <div className='h-full flex flex-col items-center justify-center w-full p-4'>
      <div className='flex flex-col items-center gap-y-4'>
        <div className='flex flex-col w-full items-center'>
          <Text.H5B>Share to the web</Text.H5B>
          <Text.H5 color='foregroundMuted'>
            Create a public chatbot with Latitude
          </Text.H5>
        </div>
        <PublishedDocumentPreview publishedData={FAKE_CHAT_TRIGGER_DOCUMENT} />
        <div className='max-w-[300px] w-full'>
          <Button
            fullWidth
            fancy
            variant='default'
            isLoading={false}
            disabled={isDisabled}
            onClick={onPublish}
          >
            Share prompt
          </Button>
        </div>
      </div>
    </div>
  )
}
