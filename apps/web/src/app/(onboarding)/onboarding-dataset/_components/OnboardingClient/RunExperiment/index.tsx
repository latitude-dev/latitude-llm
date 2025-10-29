import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCallback, useMemo } from 'react'
import { useIncludabledPrompts } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/BlocksEditor/useIncludabledPrompts'
import { toast } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Toast/useToast'
import { useMetadata } from '$/hooks/useMetadata'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Suspense } from 'react'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import {
  BlocksEditor,
  BlocksEditorPlaceholder,
} from '$/components/BlocksEditor'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { fromAstToBlocks } from '$/components/BlocksEditor/Editor/state/promptlToLexical/fromAstToBlocks'
import { emptyRootBlock } from '$/components/BlocksEditor/Editor/state/promptlToLexical'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@latitude-data/web-ui/atoms/Table'
import useDatasets from '$/stores/datasets'
import useDatasetRows from '$/stores/datasetRows'

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
  const { value, updateDocumentContent } = useDocumentValue()
  const { document } = useCurrentDocument()
  const { metadata } = useMetadata()
  const { data: datasets, generateIsLoading } = useDatasets()
  const { data: rows } = useDatasetRows({
    dataset: datasets?.[0],
    pageSize: '4',
  })

  const parameters = useMemo(
    () => Array.from(metadata?.parameters ?? []),
    [metadata],
  )
  const onboardingDatasetColumns = useMemo(() => {
    return datasets?.[0]?.columns
  }, [datasets])

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

  return (
    <div className='flex flex-row items-center gap-10 h-full w-full'>
      <div className='flex flex-col items-end w-full h-full'>
        <div className='relative flex-1 w-full h-full max-w-[600px]'>
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
          </Suspense>
          <div className='absolute inset-x-0 bottom-[-10rem] h-full w-full p-4 bg-background'>
            {generateIsLoading ? (
              <TableSkeleton rows={6} cols={parameters} maxHeight={320} />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {parameters.map((parameter) => (
                        <TableHead key={parameter}>{parameter}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows?.map((row) => (
                      <TableRow key={row.id}>
                        {onboardingDatasetColumns?.map((column) => (
                          <TableCell key={column.identifier}>
                            {row.processedRowData[column.identifier] ?? ''}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className='pointer-events-none absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-background via-background to-transparent' />
              </>
            )}
          </div>
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
