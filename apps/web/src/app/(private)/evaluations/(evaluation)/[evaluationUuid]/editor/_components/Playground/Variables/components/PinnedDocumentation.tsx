import { cn } from '@latitude-data/web-ui/utils'
import { CopyButton } from '@latitude-data/web-ui/atoms/CopyButton'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { MessagesList } from './MessagesList'

export const PinnedDocumentation = ({ isPinned }: { isPinned: boolean }) => {
  const messageVariables = [
    '{{messages.all}}',
    '{{messages.first}}',
    '{{messages.last}}',
    '{{messages.user.all}}',
    '{{messages.user.first}}',
    '{{messages.user.last}}',
    '{{messages.system.all}}',
    '{{messages.system.first}}',
    '{{messages.system.last}}',
    '{{messages.assistant.all}}',
    '{{messages.assistant.first}}',
    '{{messages.assistant.last}}',
  ]

  return (
    <div className={cn('flex flex-col gap-2', { 'py-4': !isPinned })}>
      <Text.H6>
        The <code>messages</code> variable contains all messages in the
        conversation, with the following properties:
      </Text.H6>
      <div className='bg-backgroundCode p-4 rounded-lg'>
        <div className='flex gap-4'>
          <MessagesList items={messageVariables.slice(0, 6)} />
          <MessagesList items={messageVariables.slice(6)} />
        </div>
      </div>
      <Text.H6>
        You can access these properties in your prompt template using JavaScript
        object accessor syntax. E.g:
      </Text.H6>
      <div className='flex flex-col gap-2 bg-backgroundCode p-4 rounded-lg relative overflow-x-auto'>
        <Text.H6 noWrap color='foregroundMuted'>
          /* This will print the first message from the user in the conversation
          */
        </Text.H6>
        <Text.H6 noWrap>{`{{messages.user.first}}`} </Text.H6>
        <div className='absolute top-4 right-2 bg-backgroundCode'>
          <CopyButton content={`{{messages.user.first}}`} />
        </div>
      </div>
    </div>
  )
}
