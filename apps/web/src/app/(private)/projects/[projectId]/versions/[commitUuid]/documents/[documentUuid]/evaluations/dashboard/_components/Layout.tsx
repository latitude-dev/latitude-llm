'use client'

import { useState } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import {
  BlankSlateStep,
  BlankSlateWithSteps,
  Button,
  cn,
  EvaluationIllustation,
  FakeProgress,
  Modal,
  TableBlankSlate,
  Text,
  Tooltip,
  TypewriterText,
  useCurrentCommit,
  useCurrentProject,
  useToast,
} from '@latitude-data/web-ui'
import { createEvaluationFromPromptAction } from '$/actions/evaluations/createFromPrompt'
import { generateSuggestedEvaluationsAction } from '$/actions/evaluations/generateSuggestedEvaluations'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import useEvaluations from '$/stores/evaluations'
import Link from 'next/link'

import BatchEvaluationsTable from './BatchEvaluationsTable'

function SuggestedEvaluations() {
  const document = useCurrentDocument()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const navigate = useNavigate()
  const { mutate } = useEvaluations()
  const { execute: generateEvaluation, isPending: isGenerating } =
    useLatitudeAction(generateSuggestedEvaluationsAction, {
      onSuccess: () => {
        // do nothing
      },
    })
  const { execute, isPending } = useLatitudeAction(
    createEvaluationFromPromptAction,
  )
  const [open, setOpen] = useState(false)
  const [generatedSuggestion, setGeneratedSuggestion] = useState<any>(null)
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()

  const onConnect = async () => {
    setOpen(true)
    setGeneratedSuggestion(null)

    const [suggestion, generationError] = await generateEvaluation({
      documentContent: document.content,
    })

    if (generationError || !suggestion) {
      setOpen(false)
      toast({
        title: 'Error generating evaluation',
        description:
          generationError?.message ??
          'Woops! Could not generate the evaluation',
        variant: 'destructive',
      })
      return
    }

    setGeneratedSuggestion(suggestion)
  }

  const onConfirm = async (shouldRedirectToEdit: boolean = false) => {
    if (!generatedSuggestion) return

    setIsCreating(true)

    const [newEvaluation, error] = await execute({
      projectId: project.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      prompt: generatedSuggestion.eval_prompt,
      type: generatedSuggestion.eval_type,
      name: generatedSuggestion.eval_name,
      metadata: generatedSuggestion.metadata,
    })

    if (newEvaluation) {
      mutate()
      if (shouldRedirectToEdit) {
        navigate.push(
          `${ROUTES.evaluations.detail({ uuid: newEvaluation.uuid }).editor.root}?back=${window.location.href}`,
        )
      } else {
        navigate.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
            .documents.detail({ uuid: document.documentUuid })
            .evaluations.detail(newEvaluation.id).root,
        )
      }
    } else if (error) {
      setIsCreating(false)
      toast({
        title: 'Error creating evaluation',
        description: error.message,
        variant: 'destructive',
      })
    }
  }

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
          <Button
            fancy
            disabled={isPending || isGenerating}
            onClick={onConnect}
          >
            Generate the evaluation
          </Button>
        </div>
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        size='large'
        title={
          generatedSuggestion
            ? 'Review Generated Evaluation'
            : 'Generating Evaluation'
        }
        description={
          generatedSuggestion
            ? 'Please review the generated evaluation and confirm if you want to create it.'
            : 'We are generating an evaluation based on your prompt. This may take a few seconds.'
        }
      >
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-4 w-full min-h-[400px] bg',
            {
              'p-6 rounded-lg border bg-secondary': !generatedSuggestion,
            },
          )}
        >
          {!generatedSuggestion ? (
            <>
              <Text.H4M color='foreground'>Generating evaluation...</Text.H4M>
              <Text.H5 color='foregroundMuted'>
                This may take a few seconds
              </Text.H5>
              <div className='w-1/2'>
                <FakeProgress
                  completed={false}
                  className='bg-muted-foreground/10'
                  indicatorClassName='bg-muted-foreground'
                />
              </div>
            </>
          ) : (
            <>
              <div className='w-full flex flex-col gap-4'>
                <div className='w-full flex flex-col gap-2'>
                  <Text.H6M color='foregroundMuted'>Evaluation Name</Text.H6M>
                  <Text.H5M>
                    <TypewriterText
                      text={generatedSuggestion.eval_name}
                      speed={30}
                    />
                  </Text.H5M>
                </div>
                <div className='w-full flex flex-col gap-2'>
                  <Text.H6M color='foregroundMuted'>
                    Evaluation Description
                  </Text.H6M>
                  <Text.H5M>
                    <TypewriterText
                      text={generatedSuggestion.eval_description}
                      speed={0}
                    />
                  </Text.H5M>
                </div>
                <div className='w-full flex flex-col gap-2'>
                  <Text.H6M color='foregroundMuted'>Evaluation Prompt</Text.H6M>
                  <div className='w-full h-80 p-2 bg-background text-foreground border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-secondary overflow-auto'>
                    <TypewriterText
                      text={generatedSuggestion.eval_prompt}
                      speed={0}
                    />
                  </div>
                </div>
              </div>
              <div className='flex justify-end w-full mt-4 space-x-4'>
                <Tooltip
                  trigger={
                    <Button
                      fancy
                      variant='outline'
                      disabled={isCreating}
                      onClick={() => onConfirm(true)}
                    >
                      {isCreating ? 'Creating...' : 'Create and Edit'}
                    </Button>
                  }
                >
                  Create the evaluation and go directly to the edit page so that
                  you can further improve it.
                </Tooltip>
                <Button
                  fancy
                  disabled={isCreating}
                  onClick={() => onConfirm(false)}
                >
                  {isCreating ? 'Creating...' : 'Create Evaluation'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </BlankSlateStep>
  )
}

export default function EvaluationsLayoutClient({
  evaluations: fallbackData,
}: {
  evaluations: EvaluationDto[]
}) {
  const workspace = useCurrentWorkspace()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const document = useCurrentDocument()
  const { data: evaluations } = useEvaluations({
    fallbackData,
    params: { documentUuid: document.documentUuid },
  })

  if (evaluations.length) {
    return <BatchEvaluationsTable evaluations={evaluations} />
  }
  const href = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid }).evaluations.dashboard
    .connect.root

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
      {workspace.data.id === 1 ? (
        <SuggestedEvaluations />
      ) : (
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
      )}
    </BlankSlateWithSteps>
  )
}
