'use client'

import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCallback, useMemo } from 'react'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Suspense } from 'react'
import { BlocksEditorPlaceholder } from '$/components/BlocksEditor'
import { OnboardingEditor } from '../../../_components/OnboardingEditor'
import SimpleDatasetTable from '../../../_components/SimpleDatasetTable'
import { useExperiments } from '$/stores/experiments'
import useDatasets from '$/stores/datasets'
import { envClient } from '$/envClient'
import { useDatasetOnboarding } from '$/app/(onboarding)/onboarding-dataset/datasetOnboarding'
import useWorkspaceOnboarding from '$/stores/workspaceOnboarding'

const EXPERIMENT_VARIANT = [
  {
    name: 'Onboarding Experiment',
    provider: envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
    model: 'gpt-4o-mini',
    temperature: 1,
  },
]

export default function RunExperimentBody() {
  const { executeCompleteOnboarding } = useWorkspaceOnboarding()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { data: datasets } = useDatasets()
  const { initialValue, documentParameters, latestDatasetName } =
    useDatasetOnboarding()

  // Get the latest dataset, as the user might have gone back and forth between steps, creating multiple datasets
  const latestDataset = datasets.find((ds) => ds.name === latestDatasetName)

  const parametersMap = useMemo(() => {
    return latestDataset && documentParameters.length
      ? Object.fromEntries(
          latestDataset.columns
            .map((col, index) =>
              documentParameters.includes(col.name) ? [col.name, index] : null,
            )
            .filter(Boolean) as [string, number][],
        )
      : {}
  }, [latestDataset, documentParameters])

  const { create, isCreating } = useExperiments(
    {
      projectId: project.id,
      documentUuid: document.documentUuid,
    },
    {
      onCreate: async () => {
        executeCompleteOnboarding({
          projectId: project.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })
      },
    },
  )

  const onCompleteOnboarding = useCallback(() => {
    create({
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      variants: EXPERIMENT_VARIANT,
      datasetId: latestDataset?.id,
      parametersMap,
      datasetLabels: {},
      fromRow: 1,
      evaluationUuids: [],
    })
  }, [
    create,
    latestDataset?.id,
    project.id,
    commit.uuid,
    document.documentUuid,
    parametersMap,
  ])

  return (
    <div className='flex flex-row items-center gap-10 h-full w-full'>
      <div className='flex flex-col items-end w-full h-full'>
        <div className='relative flex-1 w-full max-h-[350px] min-w-[560px]'>
          <Suspense fallback={<BlocksEditorPlaceholder />}>
            <div className='relative h-full'>
              <OnboardingEditor readOnly={true} initialValue={initialValue} />
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-background via-background to-transparent' />
            </div>
          </Suspense>
          <SimpleDatasetTable
            numberOfRows={4}
            documentParameters={documentParameters}
            latestDataset={latestDataset}
          />
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
          disabled={isCreating}
        >
          Run Experiment
        </Button>
      </div>
    </div>
  )
}
