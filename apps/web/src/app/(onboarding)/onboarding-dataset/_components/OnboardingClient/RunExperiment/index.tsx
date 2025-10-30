import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCallback } from 'react'
import { useMetadata } from '$/hooks/useMetadata'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Suspense } from 'react'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { BlocksEditorPlaceholder } from '$/components/BlocksEditor'
import { fromAstToBlocks } from '$/components/BlocksEditor/Editor/state/promptlToLexical/fromAstToBlocks'
import { emptyRootBlock } from '$/components/BlocksEditor/Editor/state/promptlToLexical'
import { OnboardingEditor } from '../_components/OnboardingEditor'
import SimpleDatasetTable from '../_components/SimpleDatasetTable'

export default function RunExperimentBody({
  executeCompleteOnboarding,
}: {
  executeCompleteOnboarding: ({
    projectId,
    commitUuid,
    documentUuid,
  }: {
    projectId: number
    commitUuid: string
    documentUuid: string
  }) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { value } = useDocumentValue()
  const { document } = useCurrentDocument()
  const { metadata } = useMetadata()

  const onCompleteOnboarding = useCallback(() => {
    executeCompleteOnboarding({
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
    })
  }, [
    executeCompleteOnboarding,
    project.id,
    commit.uuid,
    document.documentUuid,
  ])

  return (
    <div className='flex flex-row items-center gap-10 h-full w-full'>
      <div className='flex flex-col items-end w-full h-full'>
        <div className='relative flex-1 w-full h-full max-w-[600px]'>
          <Suspense fallback={<BlocksEditorPlaceholder />}>
            <div className='relative p-4'>
              <OnboardingEditor
                initialValue={
                  metadata?.ast
                    ? fromAstToBlocks({
                        ast: metadata.ast,
                        prompt: value,
                      })
                    : emptyRootBlock
                }
                readOnly={true}
              />
              <div
                aria-hidden
                className='pointer-events-none absolute inset-0 bg-background/60 backdrop-saturate-50'
              />
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-background via-background to-transparent' />
            </div>
          </Suspense>
          <SimpleDatasetTable numberOfRows={4} />
        </div>
      </div>
      <div className='flex flex-col items-start gap-8 w-full h-full'>
        <div className='flex flex-col items-start gap-6'>
          <div className='flex flex-col gap-4 w-full'>
            <Badge
              variant='accent'
              shape='rounded'
              className='w-fit font-medium'
            >
              Step 3 of 3
            </Badge>
            <Text.H4M>Run experiment</Text.H4M>
          </div>
          <div className='flex flex-col gap-4 max-w-[300px]'>
            <Text.H5 color='foregroundMuted'>
              Finally, let's run an experiment to see how
              <br />
              your prompt does.
            </Text.H5>
            <Text.H5 color='foregroundMuted'>
              After running it, you'll be able to review
              <br />
              and annotate each run.
            </Text.H5>
            <Text.H5 color='foregroundMuted'>
              We automatically aggregate the issues
              <br />
              detected and generate specific LLM
              <br />
              evaluators for each one.
            </Text.H5>
          </div>
        </div>
        <Button
          fancy
          className='w-full'
          iconProps={{ placement: 'right', name: 'arrowRight' }}
          onClick={onCompleteOnboarding}
        >
          Run Experiment
        </Button>
      </div>
    </div>
  )
}
