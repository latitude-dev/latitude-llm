import { EvaluationDto, EvaluationMetadataType } from '../../browser'
import { LatitudeError, PromisedResult, Result } from '../../lib'
import { ProviderApiKeysRepository } from '../../repositories'

export async function generateEvaluationPrompt(
  evaluation: EvaluationDto,
): PromisedResult<string, LatitudeError> {
  if (evaluation.metadataType === EvaluationMetadataType.LlmAsJudgeLegacy) {
    return Result.ok(evaluation.metadata.prompt)
  }

  // TODO: Mocked implementation, will be replaced with real implementation in next PRs
  const { providerApiKeyId, model, objective, additionalInstructions } =
    evaluation.metadata

  const providersRepo = new ProviderApiKeysRepository(evaluation.workspaceId)
  const providerResult = await providersRepo.find(providerApiKeyId)
  if (providerResult.error) return Result.error(providerResult.error)

  const config = {
    provider: providerResult.value.name,
    model,
    temperature: 0.2,
  }

  const prompt = [
    '---',
    Object.entries(config)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n'),
    '---',
    objective,
    additionalInstructions,
  ].join('\n')

  return Result.ok(prompt)
}
