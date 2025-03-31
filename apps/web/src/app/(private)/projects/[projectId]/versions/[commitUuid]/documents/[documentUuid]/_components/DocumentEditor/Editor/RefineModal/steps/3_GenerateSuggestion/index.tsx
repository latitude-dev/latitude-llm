import { useEffect, useMemo, useState } from 'react'

import { DocumentVersion, EvaluationDto } from '@latitude-data/core/browser'
import { type EvaluationResultByDocument } from '@latitude-data/core/repositories'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FakeProgress } from '@latitude-data/web-ui/molecules/FakeProgress'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { refinePromptAction } from '$/actions/copilot/refinePrompt'
import useLatitudeAction from '$/hooks/useLatitudeAction'

export function GenerateSuggestion({
  documentVersion,
  evaluation,
  evaluationResults,
  applySuggestion,
}: {
  documentVersion: DocumentVersion
  evaluation: EvaluationDto
  evaluationResults: EvaluationResultByDocument[]
  applySuggestion: (prompt: string) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const [suggestion, setSuggestion] = useState<string>()
  const [isLoading, setIsLoading] = useState(true)
  const { execute: refinePrompt, error } = useLatitudeAction(
    refinePromptAction,
    {
      onSuccess: ({ data }) => {
        setIsLoading(false)
        setSuggestion(data)
      },
      onError: () => {
        setIsLoading(false)
      },
    },
  )

  useEffect(() => {
    refinePrompt({
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: documentVersion.documentUuid,
      evaluationId: evaluation.id,
      evaluationResultIds: evaluationResults.map((r) => r.id),
    })
  }, [])

  const title = useMemo(() => {
    if (error) return 'Error generating suggestion'
    if (isLoading) return 'Generating suggestion...'
    if (suggestion) return 'New prompt generated'
  }, [isLoading, suggestion, error])

  const description = useMemo(() => {
    if (error) return 'An error occurred while generating the suggestion'
    if (isLoading) return 'This can take a few minutes'
    if (suggestion) {
      return 'You can check the new prompt in the editor and accept or reject the changes'
    }
  }, [isLoading, suggestion, error])

  return (
    <div className='rounded-lg w-full py-40 flex flex-col gap-4 items-center justify-center bg-gradient-to-b from-secondary to-transparent px-4'>
      <div className='max-w-lg flex flex-col gap-6 items-center'>
        <div className='flex flex-col gap-2'>
          <Text.H4 align='center' display='block'>
            {title}
          </Text.H4>
          <Text.H5 align='center' display='block' color='foregroundMuted'>
            {description}
          </Text.H5>
        </div>
        <div className='flex flex-col gap-y-4 items-center justify-center'>
          <FakeProgress completed={!isLoading} />
          {isLoading && <LoadingText />}
          {!isLoading && suggestion && (
            <Button
              onClick={() => applySuggestion(suggestion)}
              fancy
              variant='outline'
            >
              Check suggestion in editor
            </Button>
          )}
          {!isLoading && error && (
            <Text.H6 color='destructive' wordBreak='breakAll'>
              {error.message}
            </Text.H6>
          )}
        </div>
      </div>
    </div>
  )
}
