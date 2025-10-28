import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { Suspense, useCallback } from 'react'
import {
  BlocksEditor,
  BlocksEditorPlaceholder,
} from '$/components/BlocksEditor'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { createEmptyParagraph } from '$/components/BlocksEditor/Editor/state/promptlToLexical/fromAstToBlocks'
import { BlockRootNode } from '$/components/BlocksEditor/Editor/state/promptlToLexical/types'
import { toast } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Toast/useToast'
import { useIncludabledPrompts } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/BlocksEditor/useIncludabledPrompts'
import { useMetadata } from '$/hooks/useMetadata'
import useDatasets from '$/stores/datasets'

// From ast to blocks got this idea from
const INITIAL_VALUE = {
  type: 'root',
  children: [createEmptyParagraph({ content: '' })],
  version: 1,
  direction: 'ltr',
  indent: 0,
  format: '',
} satisfies BlockRootNode

export function PasteYourPromptBody({
  document,
}: {
  document: DocumentVersion
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { value, updateDocumentContent } = useDocumentValue()

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

  const { metadata } = useMetadata()
  const { runGenerateAction } = useDatasets()

  const generateDataset = useCallback(async () => {
    const parameters = Object.keys(metadata?.parameters ?? {}).join(', ') ?? ''
    const result = await runGenerateAction({
      parameters,
      prompt: value ?? '',
      rowCount: 10,
      name: 'Onboarding Dataset',
      fromCloud: false,
    })
    console.log(result)
    // TODO(onboarding): when finished, move to the next onboarding step
  }, [metadata, value, runGenerateAction])

  return (
    <div className='flex flex-row items-center gap-10 h-full w-full'>
      <div className='flex flex-col items-end gap-10 w-full h-full'>
        <div className='flex-1 w-full max-h-[350px] max-w-[600px]'>
          <Suspense fallback={<BlocksEditorPlaceholder />}>
            <BlocksEditor
              project={project}
              commit={commit}
              document={document}
              currentDocument={document}
              initialValue={INITIAL_VALUE}
              placeholder='Type your instructions here, use {{ input }} for variables and / for commands'
              onError={onError}
              prompts={prompts}
              onChange={updateDocumentContent}
              greyTheme={true}
            />
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
              Step 1 of 3
            </Badge>
            <Text.H4M>Paste Your Prompt</Text.H4M>
          </div>
          <div className='flex flex-col gap-4 max-w-[300px]'>
            <Text.H5 color='foregroundMuted'>
              With Latitude, it's easy to test your
              <br />
              prompts at scale.
            </Text.H5>
            <Text.H5 color='foregroundMuted'>
              Paste one of your existing prompts here.
            </Text.H5>
            <Text.H5 color='foregroundMuted'>
              Make sure you replace any dynamic parts with{' '}
              <Badge
                variant='accent'
                shape='rounded'
                className='w-fit font-medium'
              >
                &#123;&#123; input &#125;&#125;
              </Badge>{' '}
              variables.
            </Text.H5>
          </div>
        </div>
        <Button
          fancy
          className='w-full'
          iconProps={{ placement: 'right', name: 'arrowRight' }}
          onClick={generateDataset}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
