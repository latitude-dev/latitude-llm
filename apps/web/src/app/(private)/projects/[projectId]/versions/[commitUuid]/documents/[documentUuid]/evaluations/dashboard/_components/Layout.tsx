'use client'

import { EvaluationDto } from '@latitude-data/core/browser'
import {
  BlankSlateStep,
  BlankSlateWithSteps,
  Icon,
  TableBlankSlate,
  useCurrentCommit,
  useCurrentDocument,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import Link from 'next/link'

import BatchEvaluationsTable from './BatchEvaluationsTable'

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
          <Icon name='evaluation' className='w-24 h-24' />
          <Link href={href}>
            <TableBlankSlate.Button>
              Connect your first evaluation
            </TableBlankSlate.Button>
          </Link>
        </div>
      </BlankSlateStep>
    </BlankSlateWithSteps>
  )
}
