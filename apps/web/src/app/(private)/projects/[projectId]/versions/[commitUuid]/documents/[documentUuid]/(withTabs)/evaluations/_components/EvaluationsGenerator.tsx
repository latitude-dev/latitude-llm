import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import EvaluationV2Form, {
  EvaluationV2FormErrors,
} from '$/components/evaluations/EvaluationV2Form'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { FakeProgress } from '@latitude-data/web-ui/molecules/FakeProgress'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCallback, useMemo, useState } from 'react'
import {
  EvaluationOptions,
  EvaluationSettings,
} from '@latitude-data/core/constants'

const DEFAULT_EVALUATION_OPTIONS = {
  evaluateLiveLogs: true,
}

export function EvaluationsGenerator({
  open,
  setOpen,
  createEvaluation,
  generateEvaluation,
  generatorEnabled,
  isCreatingEvaluation,
  isGeneratingEvaluation,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  generateEvaluation: ReturnType<typeof useEvaluationsV2>['generateEvaluation']
  generatorEnabled: boolean
  isCreatingEvaluation: boolean
  isGeneratingEvaluation: boolean
}) {
  const navigate = useNavigate()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const [instructions, setInstructions] = useState<string>()
  const [settings, setSettings] = useState<EvaluationSettings>()
  const [options, setOptions] = useState<Partial<EvaluationOptions>>(
    DEFAULT_EVALUATION_OPTIONS,
  )
  const [errors, setErrors] = useState<EvaluationV2FormErrors>()

  const onGenerate = useCallback(async () => {
    if (isGeneratingEvaluation) return
    const [result, errors] = await generateEvaluation({
      documentUuid: document.documentUuid,
      instructions,
    })
    if (errors) return
    setInstructions(undefined)
    setSettings(result.settings)
    setOptions(DEFAULT_EVALUATION_OPTIONS)
    setErrors(undefined)
  }, [
    isGeneratingEvaluation,
    generateEvaluation,
    instructions,
    setInstructions,
    setSettings,
    setOptions,
    setErrors,
    document.documentUuid,
  ])

  const onCreate = useCallback(async () => {
    if (isCreatingEvaluation || !settings) return
    const [result, errors] = await createEvaluation({
      documentUuid: document.documentUuid,
      settings,
      options,
    })
    if (errors) {
      setErrors(errors)
    } else if (result?.evaluation) {
      setOpen(false)
      setInstructions(undefined)
      setSettings(undefined)
      setOptions(DEFAULT_EVALUATION_OPTIONS)
      setErrors(undefined)

      const { evaluation } = result
      navigate.push(
        ROUTES.projects
          .detail({ id: project.id })
          .commits.detail({ uuid: commit.uuid })
          .documents.detail({ uuid: document.documentUuid })
          .evaluations.detail({ uuid: evaluation.uuid }).root,
      )
    }
  }, [
    isCreatingEvaluation,
    createEvaluation,
    settings,
    options,
    setInstructions,
    setSettings,
    setOptions,
    setErrors,
    setOpen,
    project,
    commit,
    document,
    navigate,
  ])

  const step = useMemo(() => {
    if (isGeneratingEvaluation) {
      return {
        number: 2,
        title: 'Generating evaluation',
        description:
          'We are generating an evaluation to assess the quality of your prompts',
        label: 'Generating...',
        onConfirm: () => {},
        content: (
          <div className='rounded-lg w-full py-40 flex flex-col gap-4 items-center justify-center bg-gradient-to-b from-secondary to-transparent px-4'>
            <div className='max-w-lg flex flex-col gap-6 items-center'>
              <div className='flex flex-col gap-2'>
                <Text.H4 align='center' display='block'>
                  Generating evaluation...
                </Text.H4>
                <Text.H5 align='center' display='block' color='foregroundMuted'>
                  This could take some time
                </Text.H5>
              </div>
              <div className='flex flex-col gap-y-4 items-center justify-center'>
                <FakeProgress completed={false} />
                <LoadingText />
              </div>
            </div>
          </div>
        ),
      }
    }

    if (!settings) {
      return {
        number: 1,
        title: 'Generate evaluation',
        description:
          'Generate an evaluation to assess the quality of your prompts',
        label: isGeneratingEvaluation ? 'Generating...' : 'Generate evaluation',
        onConfirm: onGenerate,
        content: (
          <form className='min-w-0'>
            <FormWrapper>
              <TextArea
                value={instructions ?? ''}
                name='instructions'
                label='Instructions'
                description='Optionally, provide instructions to generate the evaluation'
                placeholder='No instructions'
                minRows={2}
                maxRows={4}
                onChange={(e) => setInstructions(e.target.value)}
                className='w-full'
                disabled={isGeneratingEvaluation}
                required
              />
            </FormWrapper>
          </form>
        ),
      }
    }

    return {
      number: 3,
      title: 'Create a new evaluation',
      description: 'Evaluations help you assess the quality of your prompts',
      label: isCreatingEvaluation ? 'Creating...' : 'Create evaluation',
      onConfirm: onCreate,
      content: (
        <EvaluationV2Form
          mode='create'
          settings={settings}
          setSettings={setSettings}
          options={options}
          setOptions={setOptions}
          errors={errors}
          commit={commit}
          disabled={isCreatingEvaluation}
        />
      ),
    }
  }, [
    isCreatingEvaluation,
    isGeneratingEvaluation,
    instructions,
    settings,
    options,
    errors,
    commit,
    setInstructions,
    setSettings,
    setOptions,
    onGenerate,
    onCreate,
  ])

  if (!generatorEnabled) return null

  return (
    <ConfirmModal
      dismissible
      size='medium'
      open={open}
      title={step.title}
      description={step.description}
      onOpenChange={setOpen}
      onConfirm={step.onConfirm}
      confirm={{
        label: step.label,
        disabled: isCreatingEvaluation || isGeneratingEvaluation,
        isConfirming: isCreatingEvaluation || isGeneratingEvaluation,
      }}
      onCancel={() => setOpen(false)}
      cancel={{
        label: 'Close',
      }}
      steps={{ current: step.number, total: 3 }}
    >
      {step.content}
    </ConfirmModal>
  )
}
