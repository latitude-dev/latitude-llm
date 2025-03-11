'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import useEvaluationsV2 from '$/stores/evaluationsV2'
import {
  EvaluationDto,
  EvaluationResultableType,
  EvaluationTemplateWithCategory,
  EvaluationV2,
} from '@latitude-data/core/browser'
import {
  BlankSlateStep,
  BlankSlateWithSteps,
  Button,
  cn,
  TableSkeleton,
  TableWithHeader,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import Link from 'next/link'

import CreateEvaluationModal, {
  CreateEvaluationData,
} from '$/app/(private)/evaluations/_components/CreateEvaluationModal'
import EvaluationTemplates from '$/app/(private)/evaluations/_components/TemplateEvaluations'
import { useState } from 'react'
import ConnectedEvaluationsTable from './ConnectedEvaluationsTable'

function SuggestedEvaluations({
  isGeneratorEnabled,
}: {
  isGeneratorEnabled?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  return (
    <BlankSlateStep
      number={2}
      title='Generate an evaluation'
      description='Our AI will craft an evaluation just for this specific prompt. Try it out!'
      className='animate-in fade-in duration-300 max-h-[360px] over overflow-y-auto'
    >
      <div className='relative bg-secondary px-4 py-2 rounded-lg border max-h-[272px] overflow-hidden'>
        <div className='max-h-[272px] overflow-hidden'>
          <span className='whitespace-pre-wrap text-sm leading-1 text-muted-foreground'>
            {isGeneratorEnabled
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
          <Link
            href={
              ROUTES.projects
                .detail({ id: project.id })
                .commits.detail({ uuid: commit.uuid })
                .documents.detail({ uuid: document.documentUuid }).evaluations
                .dashboard.generate.root
            }
            className={cn(!isGeneratorEnabled && 'pointer-events-none')}
          >
            <Button fancy disabled={!isGeneratorEnabled}>
              Generate the evaluation
            </Button>
          </Link>
        </div>
      </div>
    </BlankSlateStep>
  )
}

function EvaluationsTable({
  evaluations: evaluationsFallback,
  evaluationsV2: evaluationsV2Fallback,
  isGeneratorEnabled,
}: {
  evaluations: EvaluationDto[]
  evaluationsV2: EvaluationV2[]
  isGeneratorEnabled?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const {
    data: evaluations,
    isLoading: isEvaluationsLoading,
    destroy: deleteEvaluation,
  } = useEvaluations({
    fallbackData: evaluationsFallback,
    params: { documentUuid: document.documentUuid },
  })

  const {
    data: evaluationsV2,
    isLoading: isEvaluationsV2Loading,
    deleteEvaluation: deleteEvaluationV2,
  } = useEvaluationsV2(
    { project, commit, document },
    { fallbackData: evaluationsV2Fallback },
  )

  const isLoading = isEvaluationsLoading || isEvaluationsV2Loading

  if (isLoading) {
    return <TableSkeleton cols={2} rows={3} />
  }

  if (evaluations.length || evaluationsV2.length) {
    return (
      <ConnectedEvaluationsTable
        evaluations={evaluations}
        evaluationsV2={evaluationsV2}
        deleteEvaluation={deleteEvaluation}
        deleteEvaluationV2={deleteEvaluationV2}
      />
    )
  }

  return (
    <BlankSlateWithSteps
      title='Welcome to evaluations'
      description='There are no evaluations created yet. Check out how it works before getting started.'
    >
      <BlankSlateStep
        number={1}
        title='Learn how it works'
        description='Watch the video below to see how evaluations can analyze the results of your prompts.'
      >
        <iframe
          className='w-full aspect-video rounded-md'
          src={`https://www.youtube.com/embed/cTs-qfO6H-8`}
          allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
          allowFullScreen
          title='How to evaluate your prompts using LLMs and Latitude.so'
        />
      </BlankSlateStep>
      <SuggestedEvaluations isGeneratorEnabled={isGeneratorEnabled} />
    </BlankSlateWithSteps>
  )
}

export default function EvaluationsLayoutClient({
  evaluations,
  evaluationsV2,
  templates,
  isGeneratorEnabled,
}: {
  evaluations: EvaluationDto[]
  evaluationsV2: EvaluationV2[]
  templates: EvaluationTemplateWithCategory[]
  isGeneratorEnabled?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const [newEvaluationData, setNewEvaluationData] =
    useState<CreateEvaluationData>()

  return (
    <div className='flex flex-col gap-4'>
      <TableWithHeader
        title='Evaluations'
        actions={
          <>
            {isGeneratorEnabled && (
              <Link
                href={
                  ROUTES.projects
                    .detail({ id: project.id })
                    .commits.detail({ uuid: commit.uuid })
                    .documents.detail({ uuid: document.documentUuid })
                    .evaluations.dashboard.generate.root
                }
              >
                <TableWithHeader.Button>
                  Generate evaluation
                </TableWithHeader.Button>
              </Link>
            )}

            <TableWithHeader.Button
              variant='default'
              onClick={() =>
                setNewEvaluationData({
                  title: 'New Evaluation',
                  description: '',
                  prompt: '',
                  configuration: { type: EvaluationResultableType.Text },
                })
              }
            >
              Add evaluation
            </TableWithHeader.Button>
          </>
        }
        table={
          <EvaluationsTable
            evaluations={evaluations}
            evaluationsV2={evaluationsV2}
            isGeneratorEnabled={isGeneratorEnabled}
          />
        }
      />
      {templates.length > 0 && (
        <EvaluationTemplates
          evaluationTemplates={templates}
          onSelectTemplate={(template) =>
            setNewEvaluationData({
              title: template.name,
              description: template.description,
              prompt: template.prompt,
              configuration: template.configuration,
            })
          }
        />
      )}
      <CreateEvaluationModal
        data={newEvaluationData}
        onClose={() => setNewEvaluationData(undefined)}
      />
    </div>
  )
}
