import { useCurrentDocumentMaybe } from '$/app/providers/DocumentProvider'
import { useLatteChangeActions } from '$/hooks/latte/useLatteChangeActions'
import { useLatteDebugMode } from '$/hooks/latte/useLatteDebugMode'
import { useDocumentValueMaybe } from '$/hooks/useDocumentValueContext'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { useLatteStore } from '$/stores/latte/index'
import useLatteThreadCheckpoints from '$/stores/latteThreadCheckpoints'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useTypeWriterValue } from '@latitude-data/web-ui/browser'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { cn } from '@latitude-data/web-ui/utils'
import React, {
  KeyboardEvent,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { ChangeList } from './_components/ChangesList'
import { LatteDebugVersionSelector } from './_components/DebugVersionSelector'
import { LatteTodoList } from './_components/LatteTodoList'

const INPUT_PLACEHOLDERS = [
  'How can I see the logs of my agent?',
  'Optimize my prompts cost without sacrificing performance.',
  'What is an evaluation?',
  'How can I give context to an agent?',
  'Find why my AI is not performing as expected.',
  'Tell me about PromptL best practices.',
  'Create a workflow that extracts data from PDFs, summarizes it, and stores it in a database.',
  'Create an AI Agent that automatically responds to support tickets.',
  'How can I run an A/B test?',
  'Make my prompt more effective at extracting key insights from a financial report.',
  'What’s the best way to organize my subagents?',
  'Create a prompt that categorizes tickets based on their content.',
  'Turn this simple chatbot prompt into a multi-step AI agent that first searches the web and then summarizes the results.',
]

export function LatteChatInput({
  sendMessage,
  resetChat,
  error,
  scrollToBottom,
  inConversation,
  stopLatteChat,
  inputRef,
}: {
  inConversation: boolean
  scrollToBottom: () => void
  sendMessage: (message: string) => void
  error?: Error
  resetChat: () => void
  stopLatteChat?: () => void
  inputRef?: RefObject<HTMLTextAreaElement>
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocumentMaybe()
  const { updateDocumentContent } = useDocumentValueMaybe()
  const navigate = useNavigate()
  const { acceptChanges, undoChanges, addFeedbackToLatteChange } =
    useLatteChangeActions()
  const { threadUuid, isBrewing, latteActionsFeedbackUuid, todoList } =
    useLatteStore()
  const { data: checkpoints } = useLatteThreadCheckpoints({
    threadUuid,
    commitId: commit.id,
  })
  const { enabled: debugModeEnabled, data: debugData } = useLatteDebugMode()
  const checkpoint = useMemo(() => {
    return checkpoints?.find((cp) => cp.documentUuid === document.documentUuid)
  }, [checkpoints, document])
  const placeholder = useTypeWriterValue(
    inConversation ? [] : INPUT_PLACEHOLDERS,
  )
  const [value, setValue] = useState('')
  const [action, setAction] = useState<'accept' | 'undo'>('accept')
  const feedbackRequested = !!latteActionsFeedbackUuid

  const isDebugSelectorVisible =
    !inConversation && debugModeEnabled && debugData.length > 0
  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      setValue(newValue)
    },
    [],
  )
  const onSubmit = useCallback(() => {
    if (isBrewing) return
    if (value.trim() === '') return
    setValue('')
    sendMessage(value)
  }, [value, sendMessage, isBrewing])
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSubmit()

        scrollToBottom()
      }
    },
    [scrollToBottom, onSubmit],
  )
  const handleUndoChanges = useCallback(async () => {
    setAction('undo')
    undoChanges()

    if (!checkpoint?.data) {
      // Optimistically redirect if document is deleted
      navigate.push(
        ROUTES.projects
          .detail({ id: project.id })
          .commits.detail({ uuid: commit.uuid }).documents.root,
      )
    } else if (updateDocumentContent) {
      // Optimistically update the document value to the previous value
      updateDocumentContent(checkpoint?.data?.content!, {
        origin: 'latteCopilot',
      })
    }
  }, [
    undoChanges,
    checkpoint?.data,
    navigate,
    project.id,
    commit.uuid,
    updateDocumentContent,
  ])

  return (
    <div
      className={cn(
        'pt-0 w-full relative flex flex-col gap-0 rounded-2xl overflow-hidden border border-latte-widget',
        {
          'max-w-[600px]': !inConversation,
        },
      )}
    >
      {todoList.length > 0 && <LatteTodoList todoList={todoList} />}
      {checkpoints.length > 0 && (
        <ChangeList
          checkpoints={checkpoints}
          undoChanges={handleUndoChanges}
          acceptChanges={() => {
            setAction('accept')
            acceptChanges()
          }}
          disabled={isBrewing}
        />
      )}
      {checkpoints.length == 0 && feedbackRequested && (
        <LatteChangesFeedback
          onSubmit={addFeedbackToLatteChange!}
          action={action}
        />
      )}
      <TextArea
        ref={inputRef}
        className={cn(
          'bg-background w-full px-3 pt-3 resize-none text-sm border-none',
          'shadow-sm text-muted-foreground',
          'ring-0 focus-visible:ring-0 outline-none focus-visible:outline-none',
          'focus-visible:animate-glow focus-visible:glow-latte custom-scrollbar scrollable-indicator',
          isDebugSelectorVisible ? 'pb-18' : 'pb-14',
        )}
        placeholder={
          inConversation
            ? isBrewing
              ? 'Brewing...'
              : 'Brew anything'
            : placeholder
        }
        disabled={isBrewing || !!error}
        value={value}
        onChange={handleValueChange}
        onKeyDown={handleKeyDown}
        minRows={3}
        maxRows={value === '' ? 3 : 9} // Note: fixes auto-grow with dynamic placeholder
      />
      <div
        className={cn(
          'absolute bottom-[2px] left-3 w-[calc(100%-0.75rem-2px)] pt-2 pb-3 pr-3',
          'flex flex-row-reverse items-end justify-between bg-background',
          'gap-4',
        )}
      >
        {!isBrewing && (
          <Button
            variant='latte'
            onClick={onSubmit}
            disabled={isBrewing || !!error || value.trim() === ''}
            iconProps={{
              name: 'forward',
              color: 'latteInputForeground',
              className: 'flex-shrink-0 rotate-180',
              placement: 'right',
            }}
            userSelect={false}
            fancy={true}
            roundy={true}
          >
            Send
          </Button>
        )}
        {isBrewing && (
          <Button
            fancy
            roundy
            userSelect
            variant='outlineDestructive'
            onClick={stopLatteChat}
            iconProps={{
              name: 'circleStop',
              color: 'destructive',
              darkColor: 'foreground',
              className: 'flex-shrink-0 rotate-180',
              placement: 'right',
            }}
          >
            Stop
          </Button>
        )}
        {!inConversation && <LatteDebugVersionSelector />}
        {inConversation && (
          <Button
            variant='ghost'
            size='none'
            onClick={resetChat}
            disabled={isBrewing || !inConversation}
            iconProps={{
              name: 'rotate',
              color: 'latteInputForeground',
              className: 'flex-shrink-0 -mt-px',
            }}
            className='ml-1'
            userSelect={false}
            textColor='latteInputForeground'
          >
            New chat
          </Button>
        )}
      </div>
    </div>
  )
}

function LatteChangesFeedback({
  onSubmit,
  action,
}: {
  onSubmit: (feedback: string) => void
  action: 'accept' | 'undo'
}) {
  const [value, setValue] = useState('')
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSubmit(value)
      }
    },
    [onSubmit, value],
  )

  const [progress, setProgress] = useState(100)
  const [isTimerActive, setIsTimerActive] = useState(true)
  const [hasAutoSubmitted, setHasAutoSubmitted] = useState(false)

  const handleSubmit = useCallback(() => {
    setHasAutoSubmitted(true)
    onSubmit('')
  }, [setHasAutoSubmitted, onSubmit])

  useEffect(() => {
    if (value.trim() === '' && !hasAutoSubmitted) {
      // Start/restart timer when feedback is empty and hasn't auto-submitted yet
      setIsTimerActive(true)
      setProgress(100)

      const totalTime = 10 * 1000 // 10 seconds
      const interval = 100 // Update every 100ms
      const decrement = (100 * interval) / totalTime

      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          const newProgress = prev - decrement
          if (newProgress <= 0) {
            clearInterval(progressInterval)
            // Defer the submit to avoid React state update during render
            setTimeout(() => handleSubmit(), 0)
            return 0
          }
          return newProgress
        })
      }, interval)

      return () => clearInterval(progressInterval)
    } else {
      // Stop timer when feedback is not empty or has already auto-submitted
      setIsTimerActive(false)
      setProgress(0)
    }
  }, [value, handleSubmit, hasAutoSubmitted])

  return (
    <div className='flex flex-col gap-2 pt-3 pb-2 px-3 relative overflow-hidden border-b border-latte-widget'>
      {isTimerActive && (
        <div
          className='absolute bottom-0 left-0 h-0.5 bg-latte-widget transition-all duration-100 ease-out'
          style={{
            width: `${progress}%`,
          }}
        />
      )}
      <div className='flex items-center justify-between gap-2'>
        <Text.H6M color='latteInputForeground'>
          {action === 'undo'
            ? 'What did Latte get wrong?'
            : 'Did Latte get this right?'}
        </Text.H6M>
        <Button
          variant='ghost'
          size='none'
          onClick={() => onSubmit('')}
          iconProps={{ name: 'close', color: 'latteInputForeground' }}
        />
      </div>
      <div className='flex items-center gap-2'>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Your feedback...'
          className={cn(
            'w-full text-sm text-muted-foreground ',
            'focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none',
          )}
        />
        <Button
          variant='latte'
          onClick={() => onSubmit(value)}
          disabled={value.trim() === ''}
          userSelect={false}
          containerClassName='!rounded-xl'
          className='!rounded-xl !px-2'
          innerClassName='!rounded-xl'
          size='small'
          iconProps={{
            name: action === 'accept' ? 'thumbsUp' : 'thumbsDown',
            color: 'latteInputForeground',
            className: 'flex-shrink-0 stroke-[2.5]',
            placement: 'right',
          }}
          fancy
        />
      </div>
    </div>
  )
}
