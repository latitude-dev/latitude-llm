import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useDocumentSuggestions from '$/stores/documentSuggestions'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { DiffOptions } from '@latitude-data/web-ui/molecules/DocumentTextEditor/types'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import type { IProjectContextType } from '$/app/providers/ProjectProvider'
import { useCallback, useEffect, useState } from 'react'
import { SuggestionItem } from './SuggestionItem'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'

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
        (prev) => [
          { ...event.suggestion, evaluation: event.evaluation },
          ...(prev ?? []),
        ],
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
  diff,
  setDiff,
  setPrompt,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  prompt: string
  diff?: DiffOptions
  setDiff: (value?: DiffOptions) => void
  setPrompt: (prompt: string) => void
}) {
  const { diffOptions } = useDocumentValue()
  const [isOpen, setIsOpen] = useState(false)
  const close = useCallback(() => setIsOpen(false), [setIsOpen])
  const [notifier, setNotifier] = useState<Notifier>({ isOpen: false })
  const notify = useCallback(() => {
    if (notifier.timeout) clearTimeout(notifier.timeout)

    setNotifier({
      isOpen: true,
      timeout: setTimeout(() => setNotifier({ isOpen: false }), 5000),
    })
    // FIXME: Adding notifier as a dependency would trigger an infinite loop, fix this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const isDisabled = isLoading || !!diff

  if (diffOptions) return null
  if (!suggestions.length) return null

  return (
    <Popover.Root open={isOpen && !isDisabled} onOpenChange={setIsOpen}>
      <Popover.Trigger disabled={isDisabled} asChild>
        <Button
          variant='shiny'
          size='small'
          iconProps={{
            name: 'sparkles',
            placement: 'left',
            size: 'normal',
            color: 'primary',
          }}
          className='relative'
          containerClassName='flex-shrink-0'
          disabled={isDisabled}
        >
          <Text.H6M color='accentForeground' userSelect={false}>
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
        sideOffset={10}
        align='center'
        size='large'
        maxHeight='normal'
        scrollable
      >
        <span className='flex flex-row items-center justify-start gap-2'>
          <Icon name='sparkles' className='shrink-0 -mt-px' />
          <Text.H4M>Suggestions</Text.H4M>
        </span>
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
