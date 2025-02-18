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
  Text,
} from '@latitude-data/web-ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import { useCallback, useMemo, useState } from 'react'

export function SuggestionItem({
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
        const result = await apply({ suggestionId: suggestion.id })
        if (!result) return

        setDiff(undefined)

        if (result.draft) {
          router.push(
            ROUTES.projects
              .detail({ id: project.id })
              .commits.detail({ uuid: result.draft.uuid })
              .documents.detail({ uuid: result.suggestion.documentUuid }).root,
          )
        } else {
          setPrompt(result.suggestion.prompt)
        }
      },
      onReject: () => setDiff(undefined),
    })
    close()
  }, [project, suggestion, setDiff, setPrompt, apply, close])

  const onDiscard = useCallback(async () => {
    await discard({ suggestionId: suggestion.id })
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
