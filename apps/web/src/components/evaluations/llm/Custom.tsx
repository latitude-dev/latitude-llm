import { useParams } from 'next/navigation'
import {
  EvaluationType,
  LlmEvaluationCustomSpecification,
  LlmEvaluationMetric,
} from '@latitude-data/constants'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormField } from '@latitude-data/web-ui/atoms/FormField'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import Link from 'next/link'
import { useEffect } from 'react'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'
import { ROUTES } from '$/services/routes'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'

const specification = LlmEvaluationCustomSpecification
export default {
  ...specification,
  icon: 'fileCode' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

function ConfigurationForm({
  mode,
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<EvaluationType.Llm, LlmEvaluationMetric.Custom>) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { evaluationUuid } = useParams()
  useEffect(() => {
    if (mode !== 'create') return
    if (!configuration.provider || !configuration.model) return
    setConfiguration({
      ...configuration,
      prompt: `
---
provider: ${configuration.provider}
model: ${configuration.model}
temperature: 0.7
schema:
  type: object
  properties:
    score:
      type: number
      minimum: 0
      maximum: 100
    reason:
      type: string
  required:
    - score
    - reason
  additionalProperties: false
---

/*
  IMPORTANT: The evaluation MUST return an object with the score and reason fields.

  These are the available variables:
  - {{ actualOutput }} (string): The actual output to evaluate
  - {{ expectedOutput }} (string/undefined): The, optional, expected output to compare against
  - {{ conversation }} (string): The full conversation of the evaluated log

  - {{ messages }} (array of objects): All the messages of the conversation
  - {{ toolCalls }} (array of objects): All the tool calls of the conversation
  - {{ cost }} (number): The cost, in cents, of the evaluated log
  - {{ tokens }} (number): The tokens of the evaluated log
  - {{ duration }} (number): The duration, in seconds, of the evaluated log

  More info on messages and tool calls format in: https://docs.latitude.so/promptl/syntax/messages

  - {{ prompt }} (string): The prompt of the evaluated log
  - {{ config }} (object): The configuration of the evaluated log
  - {{ parameters }} (object): The parameters of the evaluated log

  More info on configuration and parameters format in: https://docs.latitude.so/promptl/syntax/configuration
*/

You're an expert LLM-as-a-judge evaluator. Your task is to judge whether the response, from another LLM model (the assistant), follows the given instructions.

<user>
  For context, here is the full conversation:
  \`\`\`
  {{ conversation }}
  \`\`\`

  {{ if expectedOutput }}
    This is the expected output to compare against:
    \`\`\`
    {{ expectedOutput }}
    \`\`\`
  {{ endif }}

  Evaluate the assistant response:
  \`\`\`
  {{ actualOutput }}
  \`\`\`
</user>
  `.trim(),
    })
  }, [mode, configuration.provider, configuration.model])

  return (
    <>
      <FormField
        label='Prompt'
        description='The custom evaluation prompt to judge against'
        errors={errors?.['prompt']}
      >
        {mode === 'update' ? (
          <div className='w-full flex justify-center items-start p-0 !m-0 !-mt-2'>
            <Link
              href={
                ROUTES.projects
                  .detail({ id: project.id })
                  .commits.detail({ uuid: commit.uuid })
                  .documents.detail({ uuid: document.documentUuid })
                  .evaluationsV2.detail({ uuid: evaluationUuid as string })
                  .editor.root
              }
              className={
                disabled ? 'pointer-events-none' : 'pointer-events-auto'
              }
            >
              <Button
                variant='link'
                size='none'
                iconProps={{
                  name: 'arrowRight',
                  widthClass: 'w-4',
                  heightClass: 'h-4',
                  placement: 'right',
                }}
                disabled={disabled}
              >
                Go to the editor
              </Button>
            </Link>
          </div>
        ) : (
          <Alert
            variant='default'
            description='You will configure the prompt after creating the evaluation'
          />
        )}
      </FormField>
      <FormFieldGroup
        layout='horizontal'
        description='The minimum and maximum percentage of criteria met of the response'
      >
        <NumberInput
          value={configuration.minThreshold ?? undefined}
          name='minThreshold'
          label='Minimum threshold'
          placeholder='No minimum'
          min={0}
          max={100}
          onChange={(value) =>
            setConfiguration({ ...configuration, minThreshold: value })
          }
          errors={errors?.['minThreshold']}
          defaultAppearance
          className='w-full'
          disabled={disabled}
          required
        />
        <NumberInput
          value={configuration.maxThreshold ?? undefined}
          name='maxThreshold'
          label='Maximum threshold'
          placeholder='No maximum'
          min={0}
          max={100}
          onChange={(value) =>
            setConfiguration({ ...configuration, maxThreshold: value })
          }
          errors={errors?.['maxThreshold']}
          defaultAppearance
          className='w-full'
          disabled={disabled}
          required
        />
      </FormFieldGroup>
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<EvaluationType.Llm, LlmEvaluationMetric.Custom>) {
  return <>{result.score!.toFixed(0)}% met</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<EvaluationType.Llm, LlmEvaluationMetric.Custom>) {
  return {
    min: 0,
    max: 100,
    thresholds: {
      lower: evaluation.configuration.minThreshold,
      upper: evaluation.configuration.maxThreshold,
    },
    scale: (point: number) => point,
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% met`,
  }
}
