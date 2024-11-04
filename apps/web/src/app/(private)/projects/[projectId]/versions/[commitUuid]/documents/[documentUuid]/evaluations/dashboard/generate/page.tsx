'use client'

import { useEffect, useState } from 'react'

import { EvaluationResultableType } from '@latitude-data/core/browser'
import {
  Button,
  cn,
  FakeProgress,
  Modal,
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
import useEvaluations from '$/stores/evaluations'
import { SuggestedEvaluation } from '$/stores/suggestedEvaluations'

export default function GenerateEvaluationPage() {
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()
  const document = useCurrentDocument()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const navigate = useNavigate()
  const { mutate } = useEvaluations()
  const { execute: generateEvaluation } = useLatitudeAction(
    generateSuggestedEvaluationsAction,
    {
      onSuccess: () => {
        // do nothing
      },
    },
  )
  const { execute } = useLatitudeAction(createEvaluationFromPromptAction)
  const [generatedSuggestion, setGeneratedSuggestion] = useState<any>(null)
  const validateSuggestion = (suggestion: SuggestedEvaluation) => {
    if (
      !suggestion.eval_name ||
      !suggestion.eval_description ||
      !suggestion.eval_prompt
    ) {
      return false
    }
    return true
  }

  useEffect(() => {
    const fn = async () => {
      const [suggestion, generationError] = await generateEvaluation({
        documentContent: document.content,
      })

      if (generationError || !suggestion) {
        navigate.back()

        toast({
          title: 'Error generating evaluation',
          description:
            generationError?.message ??
            'Woops! Could not generate the evaluation',
          variant: 'destructive',
        })

        return
      } else if (!validateSuggestion(suggestion)) {
        navigate.back()

        toast({
          title: 'Error generating evaluation',
          description: 'The generated evaluation is invalid',
          variant: 'destructive',
        })

        return
      }

      setGeneratedSuggestion(suggestion)
    }

    fn()
  }, [])

  const onConfirm = async (shouldRedirectToEdit: boolean = false) => {
    if (!generatedSuggestion) return

    setIsCreating(true)

    const [newEvaluation, error] = await execute({
      projectId: project.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      prompt: generatedSuggestion.eval_prompt,
      name: generatedSuggestion.eval_name,
      resultType:
        generatedSuggestion.eval_type === 'number'
          ? EvaluationResultableType.Number
          : EvaluationResultableType.Boolean,
      metadata:
        generatedSuggestion.eval_type === 'number'
          ? {
              minValue: generatedSuggestion.metadata.range.from as number,
              maxValue: generatedSuggestion.metadata.range.to as number,
            }
          : undefined,
    })

    if (newEvaluation) {
      mutate()
      if (shouldRedirectToEdit) {
        const backUrl = ROUTES.projects
          .detail({ id: project.id })
          .commits.detail({ uuid: commit.uuid })
          .documents.detail({ uuid: document.documentUuid })
          .evaluations.detail(newEvaluation.id).root

        navigate.push(
          `${ROUTES.evaluations.detail({ uuid: newEvaluation.uuid }).editor.root}?back=${backUrl}`,
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
    <Modal
      open
      onOpenChange={(open) => {
        !open && navigate.back()
      }}
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
  )
}
