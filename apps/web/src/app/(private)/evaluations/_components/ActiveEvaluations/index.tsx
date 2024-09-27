import { EvaluationDto } from '@latitude-data/core/browser'
import {
  BlankSlateStep,
  BlankSlateWithSteps,
  Icon,
  TableBlankSlate,
  TableWithHeader,
} from '@latitude-data/web-ui'
import useEvaluations from '$/stores/evaluations'

import ActiveEvaluationsTable from './Table'

export function TableContent({
  evaluations,
  onCreateEvaluation,
}: {
  evaluations?: EvaluationDto[]
  onCreateEvaluation: () => void
}) {
  if (evaluations?.length) {
    return <ActiveEvaluationsTable evaluations={evaluations} />
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
        title='Create your first evaluation'
        description='Create an evaluation to start reviewing your prompts.'
      >
        <div className='flex flex-col gap-5 w-full aspect-video rounded-md border border-border bg-muted items-center justify-center'>
          <Icon name='evaluation' className='w-24 h-24' />
          <TableBlankSlate.Button onClick={onCreateEvaluation}>
            Create your first evaluation
          </TableBlankSlate.Button>
        </div>
      </BlankSlateStep>
    </BlankSlateWithSteps>
  )
}

export default function ActiveEvaluations({
  onCreateEvaluation,
}: {
  onCreateEvaluation: () => void
}) {
  const { data: evaluations, isLoading } = useEvaluations()
  if (isLoading) return null

  return (
    <TableWithHeader
      title='Your evaluations'
      actions={
        <TableWithHeader.Button onClick={onCreateEvaluation}>
          Add evaluation
        </TableWithHeader.Button>
      }
      table={
        <TableContent
          evaluations={evaluations}
          onCreateEvaluation={onCreateEvaluation}
        />
      }
    />
  )
}
