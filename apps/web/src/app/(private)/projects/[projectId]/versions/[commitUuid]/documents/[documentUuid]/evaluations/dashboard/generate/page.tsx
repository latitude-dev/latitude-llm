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
  const { document } = useCurrentDocument()
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
  const { execute: createEvaluation } = useLatitudeAction(
    createEvaluationFromPromptAction,
  )
  const [generatedSuggestion, setGeneratedSuggestion] =
    useState<SuggestedEvaluation | null>(null)
  const validateSuggestion = (suggestion: SuggestedEvaluation) => {
    if (
      !suggestion.eval_name ||
      !suggestion.eval_description ||
      !suggestion.eval_objective ||
      !suggestion.metadata
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

    const [newEvaluation, error] = await createEvaluation({
      projectId: project.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      objective: generatedSuggestion.eval_objective,
      additionalInstructions: generatedSuggestion.eval_additional_instructions,
      name: generatedSuggestion.eval_name,
      resultType:
        generatedSuggestion.eval_type === 'number'
          ? EvaluationResultableType.Number
          : EvaluationResultableType.Boolean,
      metadata: generatedSuggestion.metadata,
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

  const renderMetadata = (suggestion: SuggestedEvaluation) => {
    if (suggestion.eval_type === 'number') {
      const metadata = suggestion.metadata as {
        minValue: number
        maxValue: number
        minValueDescription?: string
        maxValueDescription?: string
      }

      return (
        <div className='grid grid-cols-2 gap-3'>
          <div className='flex flex-col gap-1'>
            <Text.H6M color='foregroundMuted'>Min Value</Text.H6M>
            <Text.H5M>{metadata.minValue}</Text.H5M>
            {metadata.minValueDescription && (
              <Text.H6M color='foregroundMuted'>
                {metadata.minValueDescription}
              </Text.H6M>
            )}
          </div>
          <div className='flex flex-col gap-1'>
            <Text.H6M color='foregroundMuted'>Max Value</Text.H6M>
            <Text.H5M>{metadata.maxValue}</Text.H5M>
            {metadata.maxValueDescription && (
              <Text.H6M color='foregroundMuted'>
                {metadata.maxValueDescription}
              </Text.H6M>
            )}
          </div>
        </div>
      )
    }

    // Boolean type
    const metadata = suggestion.metadata as {
      falseValueDescription?: string
      trueValueDescription?: string
    }

    return (
      <div className='grid grid-cols-2 gap-3'>
        <div className='flex flex-col gap-1'>
          <Text.H6M color='foregroundMuted'>True Value</Text.H6M>
          <Text.H5M>True</Text.H5M>
          {metadata.trueValueDescription && (
            <Text.H6M color='foregroundMuted'>
              {metadata.trueValueDescription}
            </Text.H6M>
          )}
        </div>
        <div className='flex flex-col gap-1'>
          <Text.H6M color='foregroundMuted'>False Value</Text.H6M>
          <Text.H5M>False</Text.H5M>
          {metadata.falseValueDescription && (
            <Text.H6M color='foregroundMuted'>
              {metadata.falseValueDescription}
            </Text.H6M>
          )}
        </div>
      </div>
    )
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
      footer={
        <>
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
            Create the evaluation and go directly to the edit page so that you
            can further improve it.
          </Tooltip>
          <Button fancy disabled={isCreating} onClick={() => onConfirm(false)}>
            {isCreating ? 'Creating...' : 'Create Evaluation'}
          </Button>
        </>
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
                <Text.H6M color='foregroundMuted'>Name</Text.H6M>
                <Text.H5M>
                  <TypewriterText
                    text={generatedSuggestion.eval_name}
                    speed={30}
                  />
                </Text.H5M>
              </div>
              <div className='w-full flex flex-col gap-2'>
                <Text.H6M color='foregroundMuted'>Description</Text.H6M>
                <Text.H5M>
                  <TypewriterText
                    text={generatedSuggestion.eval_description}
                    speed={0}
                  />
                </Text.H5M>
              </div>
              <div className='w-full flex flex-col gap-2'>
                <Text.H6M color='foregroundMuted'>Objective</Text.H6M>
                <Text.H5M>
                  <TypewriterText
                    text={generatedSuggestion.eval_objective}
                    speed={0}
                  />
                </Text.H5M>
              </div>
              {generatedSuggestion.eval_additional_instructions && (
                <div className='w-full flex flex-col gap-2'>
                  <Text.H6M color='foregroundMuted'>
                    Additional Instructions
                  </Text.H6M>
                  <Text.H5M>
                    <TypewriterText
                      text={generatedSuggestion.eval_additional_instructions}
                      speed={0}
                    />
                  </Text.H5M>
                </div>
              )}
              <div className='w-full flex flex-col gap-2'>
                <Text.H6M color='foregroundMuted'>Result Type</Text.H6M>
                <Text.H5M>
                  <TypewriterText
                    text={
                      generatedSuggestion.eval_type === 'number'
                        ? 'Numeric Score'
                        : 'Boolean (Pass/Fail)'
                    }
                    speed={0}
                  />
                </Text.H5M>
              </div>

              <div className='w-full flex flex-col gap-2'>
                <Text.H6M color='foregroundMuted'>Expected Values</Text.H6M>
                <div className='rounded-lg border bg-card p-4'>
                  {renderMetadata(generatedSuggestion)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
