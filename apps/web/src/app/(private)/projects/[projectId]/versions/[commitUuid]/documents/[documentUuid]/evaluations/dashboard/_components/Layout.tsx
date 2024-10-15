'use client'

import { EvaluationDto } from '@latitude-data/core/browser'
import {
  BlankSlateStep,
  BlankSlateWithSteps,
  Button,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import Link from 'next/link'

import BatchEvaluationsTable from './BatchEvaluationsTable'

function SuggestedEvaluations() {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const document = useCurrentDocument()
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
            {`---
  provider: OpenAI 
  model: gpt-4o
---
This is just a placeholder for the evaluation prompt because generating it takes a bit longer than we'd like. Click the button to actually generate the evaluation, it's free as this one is on us.

Don't rawdog your prompts!
            `}
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
          >
            <Button fancy>Generate the evaluation</Button>
          </Link>
        </div>
      </div>
    </BlankSlateStep>
  )
}

export default function EvaluationsLayoutClient({
  evaluations: fallbackData,
}: {
  evaluations: EvaluationDto[]
}) {
  const document = useCurrentDocument()
  const { data: evaluations } = useEvaluations({
    fallbackData,
    params: { documentUuid: document.documentUuid },
  })

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
      <SuggestedEvaluations />
    </BlankSlateWithSteps>
  )
}
