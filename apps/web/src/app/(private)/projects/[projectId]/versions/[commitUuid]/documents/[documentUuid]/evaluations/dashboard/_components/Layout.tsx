'use client'

import { EvaluationDto } from '@latitude-data/core/browser'
import {
  BlankSlateStep,
  BlankSlateStepSkeleton,
  BlankSlateWithSteps,
  Button,
  EvaluationIllustation,
  TableBlankSlate,
  Text,
  useCurrentCommit,
  useCurrentDocument,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { connectEvaluationsAction } from '$/actions/evaluations/connect'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import useSuggestedEvaluations, {
  SuggestedEvaluation,
} from '$/stores/suggestedEvaluations'
import Link from 'next/link'

import BatchEvaluationsTable from './BatchEvaluationsTable'

function SuggestedEvaluations() {
  const document = useCurrentDocument()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: suggestions, isLoading } = useSuggestedEvaluations(
    document.content,
  )
  const navigate = useNavigate()
  const { mutate } = useEvaluations()
  const { execute, isPending } = useLatitudeAction(connectEvaluationsAction)
  const onConnect = async (suggestion: SuggestedEvaluation) => {
    const [data] = await execute({
      projectId: project.id,
      templateIds: [suggestion.id],
      evaluationUuids: [],
      documentUuid: document.documentUuid,
    })

    if (data) {
      mutate()
      const connectedEvaluation = data[0]!
      navigate.push(
        ROUTES.projects
          .detail({ id: project.id })
          .commits.detail({ uuid: commit.uuid })
          .documents.detail({ uuid: document.documentUuid })
          .evaluations.detail(connectedEvaluation.evaluationId).root,
      )
    }
  }

  if (isLoading) {
    return (
      <BlankSlateStepSkeleton className='w-[448px] animate-in fade-in duration-300 max-h-[360px] overflow-y-auto' />
    )
  }
  if (!suggestions.length) return null

  return (
    <BlankSlateStep
      number={3}
      title='...Or try our suggested evaluations'
      description='Our AI agent recommends starting with these evaluations based on the contents of your prompt.'
      className='animate-in fade-in duration-300 max-h-[360px] over overflow-y-auto'
    >
      <div className='space-y-4'>
        {suggestions.map((suggestion, index) => (
          <div
            key={index}
            className='flex flex-row items-center justify-between gap-4 p-4 border border-border rounded-md'
          >
            <div className='flex flex-col gap-1'>
              <Text.H5M>{suggestion.title}</Text.H5M>
              <Text.H6 color='foregroundMuted'>
                {suggestion.description}
              </Text.H6>
            </div>
            <Button
              fancy
              variant='secondary'
              disabled={isPending}
              onClick={() => onConnect(suggestion)}
            >
              <Text.H5 noWrap color='foreground'>
                Add Evaluation
              </Text.H5>
            </Button>
          </div>
        ))}
      </div>
    </BlankSlateStep>
  )
}

export default function EvaluationsLayoutClient({
  evaluations: fallbackData,
}: {
  evaluations: EvaluationDto[]
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const document = useCurrentDocument()
  const { data: evaluations } = useEvaluations({
    fallbackData,
    params: { documentUuid: document.documentUuid },
  })

  const href = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid }).evaluations.dashboard
    .connect.root

  if (evaluations.length) {
    return <BatchEvaluationsTable evaluations={evaluations} />
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
      <BlankSlateStep
        number={2}
        title='Connect your first evaluation'
        description='Connect an evaluation from the templates gallery to get insights about how your prompt performs.'
      >
        <div className='flex flex-col gap-5 w-full aspect-video rounded-md border border-border bg-muted items-center justify-center'>
          <EvaluationIllustation className='w-24 h-24' />
          <Link href={href}>
            <TableBlankSlate.Button>
              Connect your first evaluation
            </TableBlankSlate.Button>
          </Link>
        </div>
      </BlankSlateStep>

      <SuggestedEvaluations />
    </BlankSlateWithSteps>
  )
}
