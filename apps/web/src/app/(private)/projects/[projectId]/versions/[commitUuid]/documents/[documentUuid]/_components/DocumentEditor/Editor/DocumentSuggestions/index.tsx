import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useDocumentSuggestions from '$/stores/documentSuggestions'
import { DocumentVersion } from '@latitude-data/core/browser'
import {
  Button,
  ICommitContextType,
  IProjectContextType,
  Popover,
  Text,
  Tooltip,
} from '@latitude-data/web-ui'
import { DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import { useCallback, useEffect, useState } from 'react'
import { SuggestionItem } from './SuggestionItem'

const useDocumentSuggestionsSocket = ({
  document,
  mutate,
  notify,
}: {
  document: DocumentVersion
  mutate: ReturnType<typeof useDocumentSuggestions>['mutate']
  notify: () => void
}) => {
  const onMessage = useCallback(
    (event: EventArgs<'documentSuggestionCreated'>) => {
      if (
        !event?.suggestion ||
        event.suggestion.commitId !== document.commitId ||
        event.suggestion.documentUuid !== document.documentUuid
      ) {
        return
      }

      mutate(
        (prev) => {
          if (prev?.find((s) => s.id === event.suggestion.id)) return prev
          return [event.suggestion, ...(prev ?? [])]
        },
        {
          revalidate: false,
        },
      )
      notify()
    },
    [document, mutate, notify],
  )

  useSockets({ event: 'documentSuggestionCreated', onMessage })
}

type Notifier = {
  isOpen: boolean
  timeout?: ReturnType<typeof setTimeout>
}

export function DocumentSuggestions({
  project,
  commit,
  document,
  prompt,
  setDiff,
  setPrompt,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  prompt: string
  setDiff: (value?: DiffOptions) => void
  setPrompt: (prompt: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const close = useCallback(() => setIsOpen(false), [setIsOpen])
  const [notifier, setNotifier] = useState<Notifier>({ isOpen: false })
  const notify = useCallback(() => {
    if (notifier.timeout) clearTimeout(notifier.timeout)
    setNotifier({
      isOpen: true,
      timeout: setTimeout(() => setNotifier({ isOpen: false }), 5000),
    })
  }, [setNotifier])
  useEffect(() => {
    if (isOpen) setNotifier({ isOpen: false })
  }, [isOpen])

  const {
    data: suggestions,
    mutate,
    applyDocumentSuggestion,
    discardDocumentSuggestion,
    isLoading,
    isExecuting,
  } = useDocumentSuggestions(
    { project, commit, document },
    { keepPreviousData: true }, // Stop refetch blink as we don't want a loading ui here
  )
  useDocumentSuggestionsSocket({ document, mutate, notify })

  if (!suggestions.length) return null

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger disabled={isLoading} asChild>
        <Button
          variant='shiny'
          size='small'
          iconProps={{
            name: 'circleArrowUp',
            placement: 'left',
            size: 'normal',
            color: 'primary',
          }}
          className='relative'
        >
          <Text.H6M color='accentForeground'>
            {suggestions.length}{' '}
            {suggestions.length > 1 ? 'suggestions' : 'suggestion'}
          </Text.H6M>
          <Tooltip
            asChild
            open={notifier.isOpen}
            trigger={
              <div className='w-full h-full absolute top-0 left-0 bg-transparent pointer-events-none -z-10' />
            }
          >
            A new suggestion has been generated!
          </Tooltip>
        </Button>
      </Popover.Trigger>
      <Popover.Content
        side='top'
        align='center'
        size='large'
        maxHeight='normal'
        scrollable
      >
        <Text.H4M>Suggestions</Text.H4M>
        <Text.H6 color='foregroundMuted'>
          Suggestions are automatically generated to improve your prompt based
          on your latest evaluations results.
        </Text.H6>
        <ul className='w-full border border-border divide-y divide-border rounded-md'>
          {suggestions.map((suggestion) => (
            <SuggestionItem
              key={suggestion.id}
              suggestion={suggestion}
              project={project}
              commit={commit}
              document={document}
              prompt={prompt}
              setDiff={setDiff}
              setPrompt={setPrompt}
              apply={applyDocumentSuggestion}
              discard={discardDocumentSuggestion}
              close={close}
              isLoading={isLoading || isExecuting}
            />
          ))}
        </ul>
      </Popover.Content>
    </Popover.Root>
  )
}
