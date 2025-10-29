import { DatasetOnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { useMetadata } from '$/hooks/useMetadata'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Suspense, useCallback } from 'react'
import { useIncludabledPrompts } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/BlocksEditor/useIncludabledPrompts'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import {
  BlocksEditor,
  BlocksEditorPlaceholder,
} from '$/components/BlocksEditor'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { toast } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Toast/useToast'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { fromAstToBlocks } from '$/components/BlocksEditor/Editor/state/promptlToLexical/fromAstToBlocks'
import { emptyRootBlock } from '$/components/BlocksEditor/Editor/state/promptlToLexical'

export function GenerateDatasetBody({
  setCurrentOnboardingStep,
}: {
  setCurrentOnboardingStep: (step: DatasetOnboardingStepKey) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { value, updateDocumentContent } = useDocumentValue()
  const { document } = useCurrentDocument()
  const { metadata } = useMetadata()
  const parameters = Array.from(metadata?.parameters ?? [])

  const onError = useCallback((error: Error) => {
    toast({
      variant: 'destructive',
      title: 'Error during edition',
      description: error.message,
    })
  }, [])

  const prompts = useIncludabledPrompts({
    project,
    commit,
    document,
    documents: [document],
  })

  const moveNextStep = useCallback(() => {
    setCurrentOnboardingStep(DatasetOnboardingStepKey.RunExperiment)
  }, [setCurrentOnboardingStep])

  return (
    <div className='flex flex-row items-center gap-10 h-full w-full'>
      <div className='flex flex-col items-end w-full h-full'>
        <div className='relative flex-1 w-full max-h-[350px] max-w-[600px]'>
          <Suspense fallback={<BlocksEditorPlaceholder />}>
            <div className='relative p-4'>
              <BlocksEditor
                project={project}
                commit={commit}
                document={document}
                currentDocument={document}
                initialValue={
                  metadata?.ast
                    ? fromAstToBlocks({
                        ast: metadata.ast,
                        prompt: value,
                      })
                    : emptyRootBlock
                }
                placeholder='Type your instructions here, use {{ input }} for variables and / for commands'
                onError={onError}
                prompts={prompts}
                onChange={updateDocumentContent}
                greyTheme={true}
              />
              <div
                aria-hidden
                className='pointer-events-none absolute inset-0 bg-background/60 backdrop-saturate-50'
              />
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-background via-background to-transparent' />
            </div>
            <div className='absolute bottom-[-4.5rem] w-full p-4 bg-background'>
              <TableSkeleton rows={6} cols={parameters} maxHeight={320} />
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/ via-background to-transparent' />
            </div>
          </Suspense>
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
              Step 2 of 3
            </Badge>
            <Text.H4M>Use a dataset</Text.H4M>
          </div>
          <div className='flex flex-col gap-4 max-w-[300px]'>
            <Text.H5 color='foregroundMuted'>
              Next, we need to use some data to
              <br />
              populate your prompt.
            </Text.H5>
            <Text.H5 color='foregroundMuted'>
              Later, you can upload your own dataset or
              <br />
              integrate our SDK to use production data.
            </Text.H5>
            <Text.H5 color='foregroundMuted'>
              For now, we'll generate some synthetic
              <br />
              data based on your prompt.
            </Text.H5>
          </div>
        </div>
        <Button
          fancy
          className='w-full'
          iconProps={{ placement: 'right', name: 'arrowRight' }}
          onClick={moveNextStep}
        >
          Generate Dataset
        </Button>
      </div>
    </div>
  )
}
