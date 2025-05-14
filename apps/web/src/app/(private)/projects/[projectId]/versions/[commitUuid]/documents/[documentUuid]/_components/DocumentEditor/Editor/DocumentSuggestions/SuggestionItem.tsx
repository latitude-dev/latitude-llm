import { ROUTES } from '$/services/routes'
import useDocumentSuggestions from '$/stores/documentSuggestions'
import {
  DocumentSuggestionWithDetails,
  DocumentVersion,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  ICommitContextType,
  IProjectContextType,
} from '@latitude-data/web-ui/providers'
import DiffMatchPatch from 'diff-match-patch'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import { useCallback, useMemo } from 'react'

const dmp = new DiffMatchPatch()

export function SuggestionItem({
  suggestion,
  project,
  commit,
  document,
  prompt,
  setDiff,
  setPrompt,
  apply,
  discard,
  close,
  isLoading,
}: {
  suggestion: DocumentSuggestionWithDetails
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  prompt: string
  setDiff: (value?: DiffOptions) => void
  setPrompt: (prompt: string) => void
  apply: ReturnType<typeof useDocumentSuggestions>['applyDocumentSuggestion']
  discard: ReturnType<
    typeof useDocumentSuggestions
  >['discardDocumentSuggestion']
  close: () => void
  isLoading: boolean
}) {
  const router = useRouter()

  const evaluationLink = useMemo(() => {
    return ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid })
      .evaluations.detail({ uuid: suggestion.evaluation.uuid }).root
  }, [project, commit, document, suggestion])

  const onApply = useCallback(() => {
    const patches = dmp.patch_make(suggestion.oldPrompt, suggestion.newPrompt)
    const patchedPrompt = dmp.patch_apply(patches, prompt)[0]

    setDiff({
      newValue: patchedPrompt,
      description: suggestion.summary,
      onAccept: async (prompt) => {
        const result = await apply({ suggestionId: suggestion.id, prompt })
        if (!result) return

        setDiff(undefined)

        if (result.draft) {
          router.push(
            ROUTES.projects
              .detail({ id: result.draft.projectId })
              .commits.detail({ uuid: result.draft.uuid })
              .documents.detail({ uuid: result.suggestion.documentUuid }).root,
          )
        } else {
          setPrompt(prompt)
        }
      },
      onReject: () => setDiff(undefined),
    })

    close()
  }, [suggestion, prompt, setDiff, setPrompt, apply, close, router])

  const onDiscard = useCallback(async () => {
    await discard({ suggestionId: suggestion.id })
  }, [suggestion, discard])

  return (
    <li className='w-full flex flex-col p-4 gap-y-2 hover:bg-accent/50'>
      <div className='w-full flex flex-col items-start justify-center gap-y-1'>
        <Link href={evaluationLink} target='_blank'>
          <Button variant='link' size='none'>
            <Text.H5>{suggestion.evaluation.name}</Text.H5>
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
          disabled={isLoading}
        >
          View
        </Button>
        <Button
          variant='link'
          size='none'
          className='text-destructive'
          onClick={onDiscard}
          disabled={isLoading}
        >
          Remove
        </Button>
      </div>
    </li>
  )
}
