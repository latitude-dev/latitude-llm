import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  getEvaluationMetricSpecification,
  getEvaluationTypeSpecification,
} from '$/components/evaluations'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { EvaluationV2 } from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  BlankSlateStep,
  BlankSlateWithSteps,
} from '@latitude-data/web-ui/molecules/BlankSlateWithSteps'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCallback, useState } from 'react'
import { EvaluationsGenerator } from './EvaluationsGenerator'

export function EvaluationsTable({
  evaluations,
  createEvaluation,
  deleteEvaluation,
  generateEvaluation,
  generatorEnabled,
  isLoading,
  isCreatingEvaluation,
  isDeletingEvaluation,
  isGeneratingEvaluation,
}: {
  evaluations: EvaluationV2[]
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  deleteEvaluation: ReturnType<typeof useEvaluationsV2>['deleteEvaluation']
  generateEvaluation: ReturnType<typeof useEvaluationsV2>['generateEvaluation']
  generatorEnabled: boolean
  isLoading?: boolean
  isCreatingEvaluation: boolean
  isDeletingEvaluation: boolean
  isGeneratingEvaluation: boolean
}) {
  const navigate = useNavigate()

  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const [selectedEvaluation, setSelectedEvaluation] = useState<EvaluationV2>()

  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const onDelete = useCallback(
    async (evaluation: EvaluationV2) => {
      if (isDeletingEvaluation) return
      const [_, errors] = await deleteEvaluation({
        evaluationUuid: evaluation.uuid,
      })
      if (errors) return
      setOpenDeleteModal(false)
    },
    [isDeletingEvaluation, deleteEvaluation, setOpenDeleteModal],
  )

  return (
    <div className='flex flex-col gap-4'>
      {evaluations.length > 0 ? (
        <div className='flex flex-col gap-4'>
          <Table className='table-auto'>
            <TableHeader className='isolate sticky top-0 z-10'>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow
                    key={index}
                    className='border-b-[0.5px] h-12 max-h-12 border-border relative'
                    hoverable={false}
                  >
                    <TableCell>
                      <Skeleton className='h-5 w-[90%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading &&
                evaluations.map((evaluation) => (
                  <TableRow
                    key={evaluation.uuid}
                    className='cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border transition-colors'
                    onClick={() =>
                      navigate.push(
                        ROUTES.projects
                          .detail({ id: project.id })
                          .commits.detail({ uuid: commit.uuid })
                          .documents.detail({ uuid: document.documentUuid })
                          .evaluations.detail({ uuid: evaluation.uuid }).root,
                      )
                    }
                  >
                    <TableCell>
                      <div className='flex items-center justify-between gap-2 truncate'>
                        <Text.H5 noWrap ellipsis>
                          {evaluation.name}
                        </Text.H5>
                        {!!evaluation.evaluateLiveLogs && (
                          <Badge variant='accent'>Live</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Text.H5>{evaluation.description || '-'}</Text.H5>
                    </TableCell>
                    <TableCell>
                      <Text.H5>
                        {getEvaluationTypeSpecification(evaluation).name}
                      </Text.H5>
                    </TableCell>
                    <TableCell>
                      <Text.H5>
                        {getEvaluationMetricSpecification(evaluation).name}
                      </Text.H5>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu
                        options={[
                          {
                            label: 'Remove',
                            onElementClick: (e) => e.stopPropagation(),
                            onClick: () => {
                              setSelectedEvaluation(evaluation)
                              setOpenDeleteModal(true)
                            },
                            type: 'destructive',
                          },
                        ]}
                        side='bottom'
                        align='end'
                        triggerButtonProps={{
                          className: 'border-none justify-end cursor-pointer',
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {openDeleteModal && selectedEvaluation && (
            <ConfirmModal
              dismissible
              open={openDeleteModal}
              title={`Remove ${selectedEvaluation.name} evaluation`}
              type='destructive'
              onOpenChange={setOpenDeleteModal}
              onConfirm={() => onDelete(selectedEvaluation)}
              onCancel={() => setOpenDeleteModal(false)}
              confirm={{
                label: isDeletingEvaluation ? 'Removing...' : 'Remove',
                description:
                  'Are you sure you want to remove the evaluation? This action cannot be undone.',
                disabled: isDeletingEvaluation,
                isConfirming: isDeletingEvaluation,
              }}
            />
          )}
        </div>
      ) : (
        <EvaluationsTableBlankSlate
          createEvaluation={createEvaluation}
          generateEvaluation={generateEvaluation}
          generatorEnabled={generatorEnabled}
          isCreatingEvaluation={isCreatingEvaluation}
          isGeneratingEvaluation={isGeneratingEvaluation}
        />
      )}
    </div>
  )
}

function EvaluationsTableBlankSlate({
  createEvaluation,
  generateEvaluation,
  generatorEnabled,
  isCreatingEvaluation,
  isGeneratingEvaluation,
}: {
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  generateEvaluation: ReturnType<typeof useEvaluationsV2>['generateEvaluation']
  generatorEnabled: boolean
  isCreatingEvaluation: boolean
  isGeneratingEvaluation: boolean
}) {
  const [openGenerateModal, setOpenGenerateModal] = useState(false)

  return (
    <BlankSlateWithSteps
      title='Welcome to evaluations'
      description='There are no evaluations created yet. Check out how it works before getting started.'
    >
      <BlankSlateStep
        number={1}
        title='Learn how it works'
        description='Watch the video below to see how evaluations can be used to assess the quality of your prompts.'
      >
        <iframe
          className='w-full aspect-video rounded-md'
          src={`https://www.youtube.com/embed/cTs-qfO6H-8`}
          allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
          allowFullScreen
          title='How to evaluate your prompts using LLMs and Latitude.so'
        />
      </BlankSlateStep>
      <BlankSlateStep
        number={2}
        title='Generate an evaluation'
        description='Our AI can craft an evaluation just for this specific prompt. Try it out!'
        className='animate-in fade-in duration-300 max-h-[360px] over overflow-y-auto'
      >
        <div className='relative bg-secondary px-4 py-2 rounded-lg border max-h-[272px] overflow-hidden'>
          <div className='max-h-[272px] overflow-hidden'>
            <span className='whitespace-pre-wrap text-sm leading-1 text-muted-foreground'>
              {generatorEnabled
                ? `
---
  provider: OpenAI
  model: gpt-4o
---
This is just a placeholder for the evaluation prompt because generating it takes a bit longer than we'd like. Click the button to actually generate the evaluation, it's free as this one is on us.

Don't rawdog your prompts!
            `.trim()
                : `
---
  provider: OpenAI
  model: gpt-4o
---
This is just a placeholder for the evaluation prompt because the evaluation generator is disabled. If it were enabled, you could click the button to actually generate the evaluation.

Don't rawdog your prompts!
            `.trim()}
            </span>
          </div>
          <div className='absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-secondary to-transparent pointer-events-none'></div>
          <div className='flex justify-center absolute right-0 bottom-4 w-full'>
            <Button
              fancy
              onClick={() => setOpenGenerateModal(true)}
              disabled={!generatorEnabled}
            >
              Generate the evaluation
            </Button>
            <EvaluationsGenerator
              open={openGenerateModal}
              setOpen={setOpenGenerateModal}
              createEvaluation={createEvaluation}
              generateEvaluation={generateEvaluation}
              generatorEnabled={generatorEnabled}
              isCreatingEvaluation={isCreatingEvaluation}
              isGeneratingEvaluation={isGeneratingEvaluation}
            />
          </div>
        </div>
      </BlankSlateStep>
    </BlankSlateWithSteps>
  )
}
