import {
  EvaluationDto,
  EvaluationMetadataType,
  EvaluationResultableType,
  Providers,
  Workspace,
} from '../../../browser'
import { database } from '../../../client'
import { LatitudeError, PromisedResult, Result } from '../../../lib'
import { ProviderApiKeysRepository } from '../../../repositories'

function valueInformation(evaluation: EvaluationDto) {
  if (evaluation.resultType === EvaluationResultableType.Boolean) {
    const base = 'A boolean value'
    const valueDescriptions = [
      evaluation.resultConfiguration.trueValueDescription
        ? `true represents "${evaluation.resultConfiguration.trueValueDescription}"`
        : undefined,
      evaluation.resultConfiguration.falseValueDescription
        ? `false represents "${evaluation.resultConfiguration.falseValueDescription}"`
        : undefined,
    ].filter(Boolean)

    if (!valueDescriptions.length) return base
    return `${base}, where ${valueDescriptions.join(' and ')}`
  }

  if (evaluation.resultType === EvaluationResultableType.Number) {
    const base = `A number between ${evaluation.resultConfiguration.minValue} and ${evaluation.resultConfiguration.maxValue}`
    const valueDescriptions = [
      evaluation.resultConfiguration.minValueDescription
        ? `${evaluation.resultConfiguration.minValue} represents "${evaluation.resultConfiguration.minValueDescription}"`
        : undefined,
      evaluation.resultConfiguration.maxValueDescription
        ? `${evaluation.resultConfiguration.maxValue} represents "${evaluation.resultConfiguration.maxValueDescription}"`
        : undefined,
    ].filter(Boolean)

    if (!valueDescriptions.length) return base
    return `${base}, where ${valueDescriptions.join(' and ')}`
  }

  const base = 'A string value'
  if (!evaluation.resultConfiguration.valueDescription) return base
  return `${base} representing "${evaluation.resultConfiguration.valueDescription}"`
}

export async function getEvaluationPrompt(
  {
    workspace,
    evaluation,
  }: { workspace: Workspace; evaluation: EvaluationDto },
  db = database,
): PromisedResult<string, LatitudeError> {
  if (evaluation.metadataType === EvaluationMetadataType.Manual) {
    return Result.ok(evaluation.description)
  }

  if (evaluation.metadataType === EvaluationMetadataType.LlmAsJudgeAdvanced) {
    return Result.ok(evaluation.metadata.prompt)
  }

  const providersRepo = new ProviderApiKeysRepository(workspace.id, db)
  const providerResult = await providersRepo.find(
    evaluation.metadata.providerApiKeyId,
  )
  if (providerResult.error) return providerResult
  const provider = providerResult.unwrap()

  const resultSchema = {
    [EvaluationResultableType.Boolean]: 'boolean',
    [EvaluationResultableType.Number]: 'number',
    [EvaluationResultableType.Text]: 'string',
  } as const

  const frontmatter = `
---
provider: ${provider.name}
model: ${evaluation.metadata.model}
temperature: 0
schema:
  type: object
  properties:
    result:
      type: ${resultSchema[evaluation.resultType]}
    reason:
      type: string
  required:
    - value
    - reason
---`.trim()

  const content = `
You're an expert LLM evaluator. Your objective is to evaluate the response from an LLM model based on this goal:

${evaluation.metadata.objective}

${evaluation.metadata.additionalInstructions ? 'Additionally, you should follow these instructions:\n\n' + evaluation.metadata.additionalInstructions : ''}

Now, evaluate the assistant response for the following conversation, based on your instructions:

{{ messages.all }}

{{if cost || duration }}
  Also, here is some aditional metadata about the LLM response. It may or may not be relevant to your objective.
  {{if cost }} - Cost: {{ cost }} cents. {{endif}}
  {{if duration }} - Duration: {{ duration }} milliseconds. {{endif}}
{{endif}}

You must respond with a JSON object with the following properties:
 - value: ${valueInformation(evaluation)}
 - reason: A string explaining your evaluation decision.
`.trim()

  const wrappedContent =
    provider.provider === Providers.Anthropic
      ? `<user>${content}</user>`
      : content

  return Result.ok(`${frontmatter}\n\n${wrappedContent}`)
}
