import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { ROUTES } from '$/services/routes'
import useDocumentSuggestions from '$/stores/documentSuggestions'
import {
  DocumentSuggestionWithDetails,
  DocumentVersion,
} from '@latitude-data/core/browser'
import {
  Button,
  ConfirmModal,
  ICommitContextType,
  IProjectContextType,
  Popover,
  Text,
} from '@latitude-data/web-ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import { useCallback, useMemo, useState } from 'react'

const useDocumentSuggestionsSocket = ({
  commitId,
  documentUuid,
  mutate,
}: {
  commitId: number
  documentUuid: string
  mutate: ReturnType<typeof useDocumentSuggestions>['mutate']
}) => {
  const onMessage = useCallback(
    ({ suggestion }: EventArgs<'documentSuggestionCreated'>) => {
      if (
        suggestion.commitId !== commitId ||
        suggestion.documentUuid !== documentUuid
      ) {
        return
      }

      mutate((prev) => [suggestion, ...(prev ?? [])], {
        revalidate: false,
      })
    },
    [commitId, documentUuid, mutate],
  )

  useSockets({ event: 'documentSuggestionCreated', onMessage })
}

export function DocumentSuggestionItem({
  suggestion,
  project,
  commit,
  document,
  setDiff,
  setPrompt,
  apply,
  discard,
  close,
  isExecuting,
}: {
  suggestion: DocumentSuggestionWithDetails
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  setDiff: (value?: DiffOptions) => void
  setPrompt: (prompt: string) => void
  apply: ReturnType<typeof useDocumentSuggestions>['applyDocumentSuggestion']
  discard: ReturnType<
    typeof useDocumentSuggestions
  >['discardDocumentSuggestion']
  close: () => void
  isExecuting: boolean
}) {
  const router = useRouter()

  const [isDiscarding, setIsDiscarding] = useState(false)

  const evaluationLink = useMemo(() => {
    return ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid })
      .evaluations.detail(suggestion.evaluationId).root
  }, [project, commit, document, suggestion])

  const onApply = useCallback(() => {
    setDiff({
      newValue: suggestion.prompt,
      description: suggestion.summary,
      onAccept: async () => {
        const [result, error] = await apply({
          projectId: project.id,
          suggestionId: suggestion.id,
        })
        if (error) return

        setDiff(undefined)

        if (result.draft) {
          router.push(
            ROUTES.projects
              .detail({ id: project.id })
              .commits.detail({ uuid: result.draft.uuid })
              .documents.detail({ uuid: suggestion.documentUuid }).root,
          )
        } else {
          setPrompt(suggestion.prompt)
        }
      },
      onReject: () => setDiff(undefined),
    })
    close()
  }, [project, suggestion, setDiff, setPrompt, apply, close])

  const onDiscard = useCallback(async () => {
    await discard({
      projectId: project.id,
      suggestionId: suggestion.id,
    })
    setIsDiscarding(false)
  }, [project, suggestion, discard, setIsDiscarding])

  return (
    <li className='w-full flex flex-col p-4 gap-y-2 hover:bg-accent/50'>
      <div className='w-full flex flex-col items-start justify-center gap-y-1'>
        <Link href={evaluationLink} target='_blank'>
          <Button variant='link' size='none'>
            <Text.H5>{suggestion.evaluationName}</Text.H5>
          </Button>
        </Link>
        <Text.H6
          color='foregroundMuted'
          wordBreak='breakAll'
          ellipsis
          lineClamp={3}
        >
          {suggestion.summary}
        </Text.H6>
      </div>
      <div className='w-full flex items-center justify-start gap-x-4'>
        <Button
          variant='link'
          size='none'
          onClick={onApply}
          disabled={isExecuting}
        >
          View
        </Button>
        <Button
          variant='link'
          size='none'
          className='text-destructive'
          onClick={() => setIsDiscarding(true)}
          disabled={isExecuting}
        >
          Remove
        </Button>
        <ConfirmModal
          dismissible
          open={isDiscarding}
          title={`Remove ${suggestion.evaluationName} suggestion`}
          type='destructive'
          onConfirm={onDiscard}
          onCancel={() => setIsDiscarding(false)}
          onOpenChange={setIsDiscarding}
          confirm={{
            label: 'Remove suggestion',
            description:
              'This will remove the suggestion. This action cannot be undone. We will try to generate a better suggestion next time!',
            isConfirming: isExecuting,
          }}
        />
      </div>
    </li>
  )
}

export function DocumentSuggestions({
  project,
  commit,
  document,
  setDiff,
  setPrompt,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  setDiff: (value?: DiffOptions) => void
  setPrompt: (prompt: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const close = useCallback(() => setIsOpen(false), [setIsOpen])

  const {
    data: suggestions,
    mutate,
    applyDocumentSuggestion,
    discardDocumentSuggestion,
    isExecuting,
  } = useDocumentSuggestions({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
  })
  useDocumentSuggestionsSocket({
    commitId: commit.id,
    documentUuid: document.documentUuid,
    mutate,
  })

  if (!suggestions.length) return null

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <Button
          variant='shiny'
          size='small'
          iconProps={{
            name: 'circleArrowUp',
            placement: 'left',
            size: 'normal',
            color: 'primary',
          }}
        >
          <Text.H6M color='accentForeground'>
            {suggestions.length}{' '}
            {suggestions.length > 1 ? 'suggestions' : 'suggestion'}
          </Text.H6M>
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
            <DocumentSuggestionItem
              key={suggestion.id}
              suggestion={suggestion}
              project={project}
              commit={commit}
              document={document}
              setDiff={setDiff}
              setPrompt={setPrompt}
              apply={applyDocumentSuggestion}
              discard={discardDocumentSuggestion}
              close={close}
              isExecuting={isExecuting}
            />
          ))}
        </ul>
      </Popover.Content>
    </Popover.Root>
  )
}
